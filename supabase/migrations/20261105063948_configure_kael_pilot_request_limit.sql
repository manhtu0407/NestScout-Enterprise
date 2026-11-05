alter table nestscout_private.kael_pilot_budgets
  drop constraint kael_pilot_budgets_max_calls_check,
  add constraint kael_pilot_budgets_max_calls_check check (max_calls > 0);

create or replace function nestscout_private.kael_pilot_reauthorize(p_pilot uuid, p_stack text, p_approval jsonb)
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
  if cap is null or cap not between 1 and b.cap_micro_usd then
    return 'CUMULATIVE_LIMIT_INCREASE_DENIED';
  end if;
  if calls is null or calls < 1 then return 'REQUEST_LIMIT_INVALID'; end if;
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
