create table nestscout_private.kael_provider_budgets (
  provider text primary key check (provider in ('deepseek', 'anthropic', 'perplexity')),
  window_started_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null check (expires_at > window_started_at and expires_at <= window_started_at + interval '1 hour'),
  committed_micro_usd integer not null default 0 check (committed_micro_usd between 0 and 300000),
  held_call uuid,
  held_run uuid,
  held_actor uuid,
  held_micro_usd integer not null default 0 check (held_micro_usd between 0 and 300000),
  check (committed_micro_usd + held_micro_usd <= 300000),
  check ((held_micro_usd = 0 and held_call is null and held_run is null and held_actor is null)
    or (held_micro_usd > 0 and held_call is not null and held_run is not null and held_actor is not null))
);

alter table nestscout_private.kael_provider_budgets enable row level security;
revoke all on nestscout_private.kael_provider_budgets from public, anon, authenticated, service_role;

insert into nestscout_private.kael_provider_budgets
  (provider, window_started_at, expires_at, committed_micro_usd, held_call, held_run, held_actor, held_micro_usd)
select provider, created_at, expires_at, committed_micro_usd, held_call, held_run, held_actor, held_micro_usd
from nestscout_private.kael_verification_budgets
on conflict (provider) do nothing;

insert into nestscout_private.kael_provider_budgets (provider, window_started_at, expires_at)
  select provider, clock_timestamp(), clock_timestamp() + interval '1 hour'
  from unnest(array['deepseek', 'anthropic', 'perplexity']::text[]) as providers(provider)
  on conflict (provider) do nothing;

create function nestscout_private.kael_provider_charge(p_actor uuid, p_run uuid, p_provider text, p_call uuid, p_actual integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold integer := case p_provider when 'deepseek' then 22916 when 'anthropic' then 270480 when 'perplexity' then 5000 else null end;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' or p_actor is null or p_run is null or p_call is null or v_hold is null then
    return false;
  end if;
  if p_actual is null then
    update nestscout_private.kael_provider_budgets b set
      window_started_at = case when b.expires_at <= v_now then v_now else b.window_started_at end,
      expires_at = case when b.expires_at <= v_now then v_now + interval '1 hour' else b.expires_at end,
      committed_micro_usd = case when b.expires_at <= v_now then 0 else b.committed_micro_usd end,
      held_call = p_call, held_run = p_run, held_actor = p_actor, held_micro_usd = v_hold
      where b.provider = p_provider and b.held_micro_usd = 0
        and (b.expires_at > v_now or b.held_micro_usd = 0)
        and case when b.expires_at <= v_now then v_hold <= 300000 else b.committed_micro_usd + v_hold <= 300000 end
        and exists (select 1 from public.kael_runs r where r.id = p_run and r.owner_id = p_actor and r.status = 'running');
  else
    update nestscout_private.kael_provider_budgets b set committed_micro_usd = b.committed_micro_usd + p_actual,
      held_call = null, held_run = null, held_actor = null, held_micro_usd = 0
      where b.provider = p_provider and b.held_call = p_call and b.held_run = p_run and b.held_actor = p_actor
        and p_actual between 0 and b.held_micro_usd;
  end if;
  return found;
end;
$$;

create function public.kael_provider_charge(p_actor uuid, p_run uuid, p_provider text, p_call uuid, p_actual integer)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select nestscout_private.kael_provider_charge(p_actor, p_run, p_provider, p_call, p_actual);
$$;

create or replace function public.kael_verification_charge(p_actor uuid, p_run uuid, p_provider text, p_call uuid, p_actual integer)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select public.kael_provider_charge(p_actor, p_run, p_provider, p_call, p_actual);
$$;

revoke all on function nestscout_private.kael_provider_charge(uuid, uuid, text, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.kael_provider_charge(uuid, uuid, text, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function nestscout_private.kael_provider_charge(uuid, uuid, text, uuid, integer) to service_role;
grant execute on function public.kael_provider_charge(uuid, uuid, text, uuid, integer) to service_role;
revoke all on function public.kael_verification_charge(uuid, uuid, text, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.kael_verification_charge(uuid, uuid, text, uuid, integer) to service_role;

drop function nestscout_private.kael_verification_charge(uuid, uuid, text, uuid, integer);
drop table nestscout_private.kael_verification_budgets;
