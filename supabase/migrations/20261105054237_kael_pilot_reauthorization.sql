create table nestscout_private.kael_pilot_renewals (
  approval_id uuid primary key,
  pilot_id uuid not null references nestscout_private.kael_pilot_budgets(id),
  recorded_at timestamptz not null default clock_timestamp(),
  approval jsonb not null
);

alter table nestscout_private.kael_pilot_renewals enable row level security;
revoke all on nestscout_private.kael_pilot_renewals from public, anon, authenticated, service_role;

create view nestscout_private.kael_pilot_effective_budget as
  select b.id, b.enabled, b.actors, b.stack_id, b.halted,
    coalesce((r.approval->>'approved_at')::timestamptz, b.authorized_at) as authorized_at,
    coalesce((r.approval->>'expires_at')::timestamptz, b.expires_at) as expires_at,
    coalesce((r.approval->>'rates_checked_at')::timestamptz, b.rates_checked_at) as rates_checked_at,
    coalesce((r.approval->>'cap_micro_usd')::bigint, b.cap_micro_usd) as cap_micro_usd,
    coalesce((r.approval->>'max_calls')::integer, b.max_calls) as max_calls,
    coalesce((r.approval->>'input_rate')::numeric, b.input_rate) as input_rate,
    coalesce((r.approval->>'cached_rate')::numeric, b.cached_rate) as cached_rate,
    coalesce((r.approval->>'output_rate')::numeric, b.output_rate) as output_rate
  from nestscout_private.kael_pilot_budgets b
  left join lateral (
    select approval from nestscout_private.kael_pilot_renewals
    where pilot_id = b.id order by (approval->>'approved_at')::timestamptz desc limit 1
  ) r on true;

revoke all on nestscout_private.kael_pilot_effective_budget from public, anon, authenticated, service_role;

create function nestscout_private.kael_pilot_reauthorize(p_pilot uuid, p_stack text, p_approval jsonb)
returns text language plpgsql security invoker set search_path = ''
as $$
declare
  b nestscout_private.kael_pilot_effective_budget;
  approved timestamptz := (p_approval->>'approved_at')::timestamptz;
  expires timestamptz := (p_approval->>'expires_at')::timestamptz;
  checked timestamptz := (p_approval->>'rates_checked_at')::timestamptz;
  cap bigint := (p_approval->>'cap_micro_usd')::bigint;
  calls integer := (p_approval->>'max_calls')::integer;
  input_rate numeric := (p_approval->>'input_rate')::numeric;
  cached_rate numeric := (p_approval->>'cached_rate')::numeric;
  output_rate numeric := (p_approval->>'output_rate')::numeric;
  renewal_id uuid := (p_approval->>'approval_id')::uuid;
  applied_at timestamptz;
begin
  perform 1 from nestscout_private.kael_pilot_budgets where id = p_pilot and stack_id = p_stack for update;
  if not found then return 'BUDGET_MISSING'; end if;
  select * into b from nestscout_private.kael_pilot_effective_budget where id = p_pilot;
  applied_at := clock_timestamp();
  if exists (select 1 from nestscout_private.kael_pilot_renewals r where r.approval_id = renewal_id) then
    return 'APPROVAL_ALREADY_USED';
  end if;
  if p_approval->>'pilot_id' is distinct from p_pilot::text
    or p_approval->>'purpose' is distinct from 'kael_developer_8085'
    or p_approval->>'provider' is distinct from 'deepseek'
    or p_approval->>'model' is distinct from 'deepseek-flash'
    or p_approval->'owner_approved' is distinct from 'true'::jsonb
    or renewal_id is null or approved is null or expires is null or checked is null
    or approved <= b.authorized_at or approved > applied_at
    or expires <= applied_at or expires > approved + interval '1 hour'
    or checked > applied_at or checked < applied_at - interval '24 hours' then
    return 'FRESH_OWNER_APPROVAL_REQUIRED';
  end if;
  if cap is null or cap not between 1 and b.cap_micro_usd or calls is null or calls not between 1 and b.max_calls then
    return 'CUMULATIVE_LIMIT_INCREASE_DENIED';
  end if;
  if p_approval->>'rate_source' is distinct from 'https://api-docs.deepseek.com/quick_start/pricing/'
    or input_rate is null or input_rate <= 0 or input_rate > 100
    or cached_rate is null or cached_rate <= 0 or cached_rate > input_rate
    or output_rate is null or output_rate <= 0 or output_rate > 100 then
    return 'RATE_CARD_INVALID';
  end if;
  if b.enabled and b.expires_at > applied_at then return 'CLOSE_ACTIVE_BUDGET_FIRST'; end if;
  if b.halted or exists (select 1 from nestscout_private.kael_pilot_calls where pilot_id = p_pilot and status <> 'settled') then
    return 'RECONCILIATION_REQUIRED';
  end if;
  insert into nestscout_private.kael_pilot_renewals (approval_id, pilot_id, approval)
    values (renewal_id, p_pilot, p_approval);
  update nestscout_private.kael_pilot_budgets set enabled = false where id = p_pilot;
  return 'REAUTHORIZED_DISABLED';
end;
$$;

revoke all on function nestscout_private.kael_pilot_reauthorize(uuid, text, jsonb) from public, anon, authenticated, service_role;

create function nestscout_private.kael_pilot_arm(p_pilot uuid, p_stack text, p_generation timestamptz)
returns text language plpgsql security invoker set search_path = ''
as $$
declare
  b nestscout_private.kael_pilot_effective_budget;
  calls integer;
  spent bigint;
  tokens bigint;
  applied_at timestamptz;
begin
  perform 1 from nestscout_private.kael_pilot_budgets where id = p_pilot and stack_id = p_stack for update;
  if not found then return 'BUDGET_MISSING'; end if;
  select * into b from nestscout_private.kael_pilot_effective_budget where id = p_pilot;
  applied_at := clock_timestamp();
  if b.authorized_at is distinct from p_generation then return 'EDGE_AUTHORIZATION_MISMATCH'; end if;
  if b.expires_at <= applied_at then return 'AUTHORIZATION_EXPIRED'; end if;
  if b.rates_checked_at not between applied_at - interval '24 hours' and applied_at then return 'RATE_CARD_STALE'; end if;
  if b.halted or exists (select 1 from nestscout_private.kael_pilot_calls where pilot_id = p_pilot and status <> 'settled') then
    return 'RECONCILIATION_REQUIRED';
  end if;
  select count(*), coalesce(sum(estimated_micro_usd), 0), coalesce(sum(input_tokens::bigint + output_tokens), 0)
    into calls, spent, tokens from nestscout_private.kael_pilot_calls where pilot_id = p_pilot;
  if calls >= b.max_calls or spent + ceil(1048576 * b.input_rate + 4096 * b.output_rate) > b.cap_micro_usd
    or tokens + 1052672 > 2000000 then return 'BUDGET_EXHAUSTED'; end if;
  update nestscout_private.kael_pilot_budgets set enabled = true where id = p_pilot;
  return 'BUDGET_ENABLED';
end;
$$;

revoke all on function nestscout_private.kael_pilot_arm(uuid, text, timestamptz) from public, anon, authenticated, service_role;

create or replace function nestscout_private.kael_pilot_charge(p_pilot uuid, p_actor uuid, p_run uuid, p_call uuid, p_action text,
  p_thinking boolean, p_model text, p_input integer, p_cached integer, p_output integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  b nestscout_private.kael_pilot_effective_budget;
  c nestscout_private.kael_pilot_calls;
  used bigint;
  calls integer;
  tokens bigint;
  reservation bigint;
  actual bigint;
begin
  if auth.role() is distinct from 'service_role' then raise insufficient_privilege; end if;
  perform nestscout_private.kael_server_actor(p_actor);
  perform 1 from nestscout_private.kael_pilot_budgets where id = p_pilot for update;
  select * into b from nestscout_private.kael_pilot_effective_budget where id = p_pilot;
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
    if exists (select 1 from nestscout_private.kael_pilot_renewals where pilot_id = p_pilot)
      and (current_setting('request.headers', true)::jsonb->>'x-kael-pilot-generation') is distinct from to_json(b.authorized_at)#>>'{}' then
      return jsonb_build_object('ok', false, 'reason', 'edge_authorization_mismatch');
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

create or replace function nestscout_private.kael_pilot_status()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('budgets', coalesce((select jsonb_agg(jsonb_build_object(
    'id', b.id, 'enabled', b.enabled, 'expires_at', b.expires_at, 'cap_micro_usd', b.cap_micro_usd, 'halted', b.halted,
    'charged_calls', (select count(*) from nestscout_private.kael_pilot_calls c where c.pilot_id = b.id),
    'committed_micro_usd', (select coalesce(sum(coalesce(c.estimated_micro_usd, c.reserved_micro_usd)), 0)
      from nestscout_private.kael_pilot_calls c where c.pilot_id = b.id)))
    from nestscout_private.kael_pilot_effective_budget b where auth.uid() = any(b.actors)), '[]'::jsonb),
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
