create table public.kael_memory_modes (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mode text not null check (mode in ('client', 'worker')),
  enabled_at timestamptz not null default statement_timestamp(),
  primary key (owner_id, mode)
);

create table public.kael_memory_preferences (
  owner_id uuid not null default auth.uid(),
  mode text not null,
  preference text not null,
  value text not null,
  updated_at timestamptz not null default statement_timestamp(),
  source text not null default 'settings' check (source in ('settings', 'explicit_chat')),
  primary key (owner_id, mode, preference),
  foreign key (owner_id, mode) references public.kael_memory_modes (owner_id, mode) on delete cascade,
  check ((preference = 'language' and value in ('vi', 'en'))
    or (preference = 'detail' and value in ('brief', 'detailed'))
    or (preference = 'format' and value in ('paragraphs', 'steps')))
);

alter table public.kael_memory_modes enable row level security;
alter table public.kael_memory_preferences enable row level security;
revoke all on public.kael_memory_modes, public.kael_memory_preferences from public, anon, authenticated;
grant select, delete on public.kael_memory_modes, public.kael_memory_preferences to authenticated;
grant insert (mode) on public.kael_memory_modes to authenticated;
grant insert (mode, preference, value, source), update (value, updated_at, source) on public.kael_memory_preferences to authenticated;

create policy kael_memory_modes_actor on public.kael_memory_modes for all to authenticated
  using (owner_id = (select auth.uid())
    and (select public.kael_actor_capabilities()) @> jsonb_build_object(case when mode = 'worker' then 'worker' else 'customer' end, true))
  with check (owner_id = (select auth.uid())
    and (select public.kael_actor_capabilities()) @> jsonb_build_object(case when mode = 'worker' then 'worker' else 'customer' end, true));

create policy kael_memory_preferences_actor on public.kael_memory_preferences for all to authenticated
  using (owner_id = (select auth.uid())
    and (select public.kael_actor_capabilities()) @> jsonb_build_object(case when mode = 'worker' then 'worker' else 'customer' end, true))
  with check (owner_id = (select auth.uid())
    and (select public.kael_actor_capabilities()) @> jsonb_build_object(case when mode = 'worker' then 'worker' else 'customer' end, true));

create function public.kael_manage_memory(p_mode text, p_action text, p_preference text default null, p_value text default null, p_previous text default null)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or p_mode is null or p_mode not in ('client', 'worker')
    or not public.kael_actor_capabilities() @> jsonb_build_object(case when p_mode = 'worker' then 'worker' else 'customer' end, true) then
    raise insufficient_privilege using message = 'Kael memory is unavailable in this mode';
  end if;
  if p_action = 'enable' then
    insert into public.kael_memory_modes (mode) values (p_mode) on conflict do nothing;
  elsif p_action = 'disable' then
    delete from public.kael_memory_modes where owner_id = v_actor and mode = p_mode;
  elsif p_action = 'remove' then
    delete from public.kael_memory_preferences where owner_id = v_actor and mode = p_mode and preference = p_preference;
  elsif p_action = 'correct' then
    update public.kael_memory_preferences set value = p_value, updated_at = statement_timestamp(), source = 'explicit_chat'
      where owner_id = v_actor and mode = p_mode and preference = p_preference and value = p_previous and value is distinct from p_value;
    return found;
  elsif p_action in ('save', 'remember') then
    if not exists (select 1 from public.kael_memory_modes where owner_id = v_actor and mode = p_mode) then
      return false;
    end if;
    insert into public.kael_memory_preferences (mode, preference, value, source)
      values (p_mode, p_preference, p_value, case p_action when 'remember' then 'explicit_chat' else 'settings' end)
    on conflict (owner_id, mode, preference) do update set value = excluded.value, updated_at = statement_timestamp(), source = excluded.source
      where public.kael_memory_preferences.value is distinct from excluded.value;
  else
    raise invalid_parameter_value using message = 'Unknown Kael memory operation';
  end if;
  return true;
end;
$$;

revoke all on function public.kael_manage_memory(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.kael_manage_memory(text, text, text, text, text) to authenticated;

create function public.kael_context_summary(p_conversation_id uuid, p_mode text, p_before_seq integer)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with candidates as (
    select m.id, m.seq, m.created_at, btrim(m.content) as excerpt
    from public.kael_messages m
    join public.kael_conversations c on c.id = m.conversation_id and c.owner_id = m.owner_id
    where m.conversation_id = p_conversation_id and m.owner_id = (select auth.uid()) and c.mode = p_mode
      and m.role = 'user' and m.seq < p_before_seq
      and (select public.kael_actor_capabilities()) @> jsonb_build_object(case when p_mode = 'worker' then 'worker' else 'customer' end, true)
    order by m.seq desc
    limit 512
  ), marked as (
    select *, case
      when excerpt ~* '^(correction|actually|đính chính|sửa lại|không phải)([[:space:]:,]|$)' then 'correction'
      when excerpt ~* '^(decision|we decided|let.s use|quyết định|chốt|thống nhất|tôi chọn)([[:space:]:,]|$)' then 'decision'
      when excerpt ~* '^(reference|tham chiếu|mã công việc)([[:space:]:,]|$)' then 'reference'
      when excerpt ~ '[?？]$' then 'question'
      else 'context'
    end as kind
    from candidates
    where char_length(excerpt) between 8 and 320
      and excerpt !~* '(password|passcode|mật khẩu|otp|secret|token|credential|api[ _-]?key|bearer|payment|credit card|thẻ tín dụng|cccd|địa chỉ|https?://|@|[0-9]{5,}|[[:cntrl:]])'
  ), retained as (
    select * from marked
    order by case kind when 'correction' then 0 when 'decision' then 1 when 'reference' then 2 when 'question' then 3 else 4 end, seq desc
    limit 8
  )
  select jsonb_build_object('version', 1, 'method', 'extractive-no-model', 'before_seq', p_before_seq, 'items',
    coalesce(jsonb_agg(jsonb_build_object('source_message_id', id, 'sequence', seq, 'created_at', created_at,
      'kind', kind, 'unverified', true, 'excerpt', excerpt) order by seq), '[]'::jsonb))
  from retained;
$$;

revoke all on function public.kael_context_summary(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.kael_context_summary(uuid, text, integer) to authenticated;

create function public.kael_runtime_ready()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;

revoke all on function public.kael_runtime_ready() from public, anon, authenticated;
grant execute on function public.kael_runtime_ready() to service_role;

create table nestscout_private.kael_verification_budgets (
  provider text primary key check (provider in ('anthropic', 'perplexity')),
  actors uuid[] not null check (cardinality(actors) between 1 and 2 and array_position(actors, null) is null),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null check (expires_at > created_at and expires_at <= created_at + interval '1 hour'),
  committed_micro_usd integer not null default 0 check (committed_micro_usd between 0 and 300000),
  held_call uuid,
  held_run uuid,
  held_actor uuid,
  held_micro_usd integer not null default 0 check (held_micro_usd between 0 and 300000),
  check (committed_micro_usd + held_micro_usd <= 300000),
  check ((held_micro_usd = 0 and held_call is null and held_run is null and held_actor is null)
    or (held_micro_usd > 0 and held_call is not null and held_run is not null and held_actor is not null))
);

alter table nestscout_private.kael_verification_budgets enable row level security;
revoke all on nestscout_private.kael_verification_budgets from public, anon, authenticated, service_role;

create function nestscout_private.kael_verification_charge(p_actor uuid, p_run uuid, p_provider text, p_call uuid, p_actual integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold integer := case p_provider when 'anthropic' then 270480 when 'perplexity' then 5000 else null end;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' or p_call is null or v_hold is null then
    return false;
  end if;
  if p_actual is null then
    update nestscout_private.kael_verification_budgets b set held_call = p_call, held_run = p_run,
      held_actor = p_actor, held_micro_usd = v_hold
      where b.provider = p_provider and p_actor = any(b.actors) and b.expires_at > clock_timestamp()
        and b.held_micro_usd = 0 and b.committed_micro_usd + v_hold <= 300000
        and exists (select 1 from public.kael_runs r where r.id = p_run and r.owner_id = p_actor and r.status = 'running');
  else
    update nestscout_private.kael_verification_budgets b set committed_micro_usd = b.committed_micro_usd + p_actual,
      held_call = null, held_run = null, held_actor = null, held_micro_usd = 0
      where b.provider = p_provider and b.held_call = p_call and b.held_run = p_run and b.held_actor = p_actor
        and p_actual between 0 and b.held_micro_usd;
  end if;
  return found;
end;
$$;

create function public.kael_verification_charge(p_actor uuid, p_run uuid, p_provider text, p_call uuid, p_actual integer)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select nestscout_private.kael_verification_charge(p_actor, p_run, p_provider, p_call, p_actual);
$$;

revoke all on function nestscout_private.kael_verification_charge(uuid, uuid, text, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.kael_verification_charge(uuid, uuid, text, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function nestscout_private.kael_verification_charge(uuid, uuid, text, uuid, integer) to service_role;
grant execute on function public.kael_verification_charge(uuid, uuid, text, uuid, integer) to service_role;

create or replace function nestscout_private.kael_finish_run(p_actor uuid, p_run_id uuid, p_status text, p_text text, p_complete boolean, p_provider text,
  p_model text, p_input_tokens integer, p_output_tokens integer, p_steps integer, p_error text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_server_actor(p_actor);
  v_run public.kael_runs;
  v_seq integer;
begin
  if p_status not in ('completed', 'failed', 'cancelled', 'interrupted') then
    raise exception using errcode = '22023', message = 'invalid run status';
  end if;
  update public.kael_runs set status = p_status, finished_at = clock_timestamp(),
    provider = case when p_provider in ('anthropic', 'deepseek') then p_provider end,
    model = left(p_model, 80), input_tokens = greatest(coalesce(p_input_tokens, 0), 0), output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
    steps = least(greatest(coalesce(p_steps, 0), 0), 100), error_code = left(p_error, 40)
    where id = p_run_id and owner_id = v_actor and status = 'running'
    returning * into v_run;
  if not found then
    return false;
  end if;
  if char_length(btrim(coalesce(p_text, ''))) > 0 then
    perform 1 from public.kael_conversations c where c.id = v_run.conversation_id for update;
    select coalesce(max(m.seq), 0) + 1 into v_seq from public.kael_messages m where m.conversation_id = v_run.conversation_id;
    insert into public.kael_messages (conversation_id, owner_id, run_id, seq, role, content, status)
      values (v_run.conversation_id, v_actor, v_run.id, v_seq, 'assistant', left(p_text, 32000),
        case when p_complete and p_status = 'completed' then 'complete' else 'incomplete' end);
    update public.kael_conversations set updated_at = clock_timestamp() where id = v_run.conversation_id;
  end if;
  return true;
end;
$$;
