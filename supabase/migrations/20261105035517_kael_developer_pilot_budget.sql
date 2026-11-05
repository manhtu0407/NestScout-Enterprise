create table nestscout_private.kael_pilot_budgets (
  id uuid primary key,
  enabled boolean not null default false,
  authorized_at timestamptz not null default clock_timestamp(),
  actors uuid[] not null check (cardinality(actors) between 1 and 4),
  expires_at timestamptz not null check (expires_at <= authorized_at + interval '1 hour'),
  cap_micro_usd bigint not null check (cap_micro_usd between 1 and 1000000),
  max_calls integer not null check (max_calls between 1 and 20),
  input_rate numeric not null check (input_rate > 0 and input_rate <= 100),
  cached_rate numeric not null check (cached_rate > 0 and cached_rate <= input_rate),
  output_rate numeric not null check (output_rate > 0 and output_rate <= 100),
  rate_source text not null check (rate_source = 'https://api-docs.deepseek.com/quick_start/pricing/'),
  rates_checked_at timestamptz not null,
  source_sha text not null check (source_sha ~ '^[0-9a-f]{40}$'),
  stack_id text not null check (length(stack_id) between 1 and 200),
  halted boolean not null default false
);

create table nestscout_private.kael_pilot_calls (
  id uuid primary key,
  pilot_id uuid not null references nestscout_private.kael_pilot_budgets(id),
  run_id uuid not null references public.kael_runs(id),
  actor_id uuid not null references auth.users(id),
  thinking boolean not null,
  requested_model text not null default 'deepseek-flash' check (requested_model = 'deepseek-flash'),
  served_model text check (served_model in ('deepseek-flash', 'DeepSeek-V4.1-Flash-1017')),
  status text not null check (status in ('reserved', 'settled', 'uncertain')),
  reserved_micro_usd bigint not null check (reserved_micro_usd > 0),
  estimated_micro_usd bigint check (estimated_micro_usd >= 0),
  input_tokens integer,
  cached_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  check ((status = 'settled') = (estimated_micro_usd is not null)),
  check (input_tokens >= 0 and cached_tokens between 0 and input_tokens and output_tokens >= 0)
);

alter table nestscout_private.kael_pilot_budgets enable row level security;
alter table nestscout_private.kael_pilot_calls enable row level security;
revoke all on nestscout_private.kael_pilot_budgets, nestscout_private.kael_pilot_calls from public, anon, authenticated, service_role;

create function nestscout_private.kael_pilot_charge(p_pilot uuid, p_actor uuid, p_run uuid, p_call uuid, p_action text,
  p_thinking boolean, p_model text, p_input integer, p_cached integer, p_output integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  b nestscout_private.kael_pilot_budgets;
  c nestscout_private.kael_pilot_calls;
  used bigint;
  calls integer;
  tokens bigint;
  reservation bigint;
  actual bigint;
begin
  if auth.role() is distinct from 'service_role' then raise insufficient_privilege; end if;
  perform nestscout_private.kael_server_actor(p_actor);
  select * into b from nestscout_private.kael_pilot_budgets where id = p_pilot for update;
  if not found or p_actor is null or not (p_actor = any(b.actors)) then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if not exists (select 1 from public.kael_runs where id = p_run and owner_id = p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'run_mismatch');
  end if;
  select * into c from nestscout_private.kael_pilot_calls where id = p_call;
  if p_action = 'reserve' then
    if c.id is not null then return jsonb_build_object('ok', false, 'reason', 'duplicate'); end if;
    if not b.enabled or b.halted or b.expires_at <= clock_timestamp() or b.rates_checked_at > clock_timestamp()
      or b.rates_checked_at < clock_timestamp() - interval '24 hours'
      or not exists (select 1 from public.kael_runs where id = p_run and status = 'running') then
      return jsonb_build_object('ok', false, 'reason', 'disabled_expired_or_halted');
    end if;
    if p_model is distinct from 'deepseek-flash' or p_thinking is null then
      return jsonb_build_object('ok', false, 'reason', 'model_not_authorized');
    end if;
    if exists (select 1 from nestscout_private.kael_pilot_calls where pilot_id = b.id and status <> 'settled') then
      return jsonb_build_object('ok', false, 'reason', 'unreconciled_call');
    end if;
    select count(*), coalesce(sum(estimated_micro_usd), 0), coalesce(sum(input_tokens::bigint + output_tokens), 0)
      into calls, used, tokens from nestscout_private.kael_pilot_calls where pilot_id = b.id;
    reservation := ceil(1048576 * b.input_rate + 4096 * b.output_rate);
    if calls >= b.max_calls or used + reservation > b.cap_micro_usd or tokens + 1052672 > 2000000
      or (select count(*) from nestscout_private.kael_pilot_calls where run_id = p_run) >= 3 then
      return jsonb_build_object('ok', false, 'reason', 'budget_exhausted');
    end if;
    insert into nestscout_private.kael_pilot_calls (id, pilot_id, run_id, actor_id, thinking, status, reserved_micro_usd)
      values (p_call, p_pilot, p_run, p_actor, p_thinking, 'reserved', reservation);
    return jsonb_build_object('ok', true, 'reserved_micro_usd', reservation);
  end if;
  if c.id is null or c.pilot_id <> b.id or c.run_id <> p_run or c.actor_id <> p_actor then
    return jsonb_build_object('ok', false, 'reason', 'reservation_mismatch');
  end if;
  if p_action = 'uncertain' then
    update nestscout_private.kael_pilot_budgets set halted = true where id = b.id;
    update nestscout_private.kael_pilot_calls set status = 'uncertain', finished_at = clock_timestamp()
      where id = p_call and status = 'reserved';
    return jsonb_build_object('ok', false, 'reason', 'accounting_acknowledgement_uncertain');
  end if;
  if c.status <> 'reserved' then return jsonb_build_object('ok', false, 'reason', 'reservation_mismatch'); end if;
  if p_action = 'settle' and p_model in ('deepseek-flash', 'DeepSeek-V4.1-Flash-1017')
    and p_input between 0 and 1048576 and p_cached between 0 and p_input and p_output between 0 and 4096 then
    actual := ceil((p_input - p_cached) * b.input_rate + p_cached * b.cached_rate + p_output * b.output_rate);
    if actual <= c.reserved_micro_usd then
      update nestscout_private.kael_pilot_calls set status = 'settled', estimated_micro_usd = actual,
        served_model = p_model, input_tokens = p_input, cached_tokens = p_cached, output_tokens = p_output, finished_at = clock_timestamp()
        where id = p_call;
      return jsonb_build_object('ok', true, 'estimated_micro_usd', actual);
    end if;
  end if;
  update nestscout_private.kael_pilot_calls set status = 'uncertain', finished_at = clock_timestamp() where id = p_call;
  update nestscout_private.kael_pilot_budgets set halted = true where id = b.id;
  return jsonb_build_object('ok', false, 'reason', 'usage_or_identity_uncertain');
end;
$$;

create function public.kael_pilot_charge(p_pilot uuid, p_actor uuid, p_run uuid, p_call uuid, p_action text,
  p_thinking boolean, p_model text, p_input integer, p_cached integer, p_output integer)
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_pilot_charge(p_pilot, p_actor, p_run, p_call, p_action, p_thinking, p_model, p_input, p_cached, p_output); $$;

create function nestscout_private.kael_pilot_status()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('budgets', coalesce((select jsonb_agg(jsonb_build_object(
    'id', b.id, 'enabled', b.enabled, 'expires_at', b.expires_at, 'cap_micro_usd', b.cap_micro_usd, 'halted', b.halted,
    'charged_calls', (select count(*) from nestscout_private.kael_pilot_calls c where c.pilot_id = b.id),
    'committed_micro_usd', (select coalesce(sum(coalesce(c.estimated_micro_usd, c.reserved_micro_usd)), 0)
      from nestscout_private.kael_pilot_calls c where c.pilot_id = b.id)))
    from nestscout_private.kael_pilot_budgets b where auth.uid() = any(b.actors)), '[]'::jsonb),
    'calls', coalesce((select jsonb_agg(to_jsonb(c)) from (
      select id, run_id, thinking, requested_model, served_model, status, reserved_micro_usd, estimated_micro_usd,
        input_tokens, cached_tokens, output_tokens, created_at, finished_at
      from nestscout_private.kael_pilot_calls where actor_id = auth.uid() order by created_at desc limit 20
    ) c), '[]'::jsonb),
    'tools', coalesce((select jsonb_agg(to_jsonb(t)) from (
      select e.run_id, e.tool, e.outcome, e.error_code from nestscout_private.kael_tool_executions e
      join public.kael_runs r on r.id = e.run_id
      where r.owner_id = auth.uid() and exists (select 1 from nestscout_private.kael_pilot_budgets b where auth.uid() = any(b.actors))
      order by e.created_at desc limit 20
    ) t), '[]'::jsonb));
$$;

create function public.kael_pilot_status()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select nestscout_private.kael_pilot_status(); $$;

revoke all on function nestscout_private.kael_pilot_charge(uuid, uuid, uuid, uuid, text, boolean, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.kael_pilot_charge(uuid, uuid, uuid, uuid, text, boolean, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function nestscout_private.kael_pilot_charge(uuid, uuid, uuid, uuid, text, boolean, text, integer, integer, integer) to service_role;
grant execute on function public.kael_pilot_charge(uuid, uuid, uuid, uuid, text, boolean, text, integer, integer, integer) to service_role;
revoke all on function nestscout_private.kael_pilot_status() from public, anon, authenticated;
revoke all on function public.kael_pilot_status() from public, anon, authenticated;
grant execute on function nestscout_private.kael_pilot_status() to authenticated;
grant execute on function public.kael_pilot_status() to authenticated;
