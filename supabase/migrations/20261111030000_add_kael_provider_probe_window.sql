create table nestscout_private.kael_provider_probe_window (
  singleton boolean primary key default true check (singleton),
  claimed_at timestamptz not null
);

alter table nestscout_private.kael_provider_probe_window enable row level security;
revoke all on nestscout_private.kael_provider_probe_window from public, anon, authenticated, service_role;

create function public.kael_claim_provider_probe()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    return false;
  end if;
  insert into nestscout_private.kael_provider_probe_window as w (singleton, claimed_at)
    values (true, clock_timestamp())
  on conflict (singleton) do update set claimed_at = excluded.claimed_at
    where w.claimed_at <= clock_timestamp() - interval '60 seconds'
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.kael_claim_provider_probe() from public, anon, authenticated;
grant execute on function public.kael_claim_provider_probe() to service_role;
