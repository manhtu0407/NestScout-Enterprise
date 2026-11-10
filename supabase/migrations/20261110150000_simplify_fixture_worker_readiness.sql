create or replace function nestscout_private.set_worker_accepting(p_accepting boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
  v_id uuid;
  v_missing text[];
begin
  v_worker := nestscout_private.lock_current_worker();
  if p_accepting is null then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  if p_accepting then
    v_missing := nestscout_private.worker_missing_items(v_worker);
    if cardinality(v_missing) > 0 and not (
      cardinality(array_remove(v_missing, 'identity')) = 0
      and exists (
        select 1 from public.worker_access_grants g
        join nestscout_private.worker_dispatch_eligibility e on e.user_id = g.user_id
        where g.user_id = v_worker and g.status = 'active' and e.active and e.basis = 'local_fixture'
      )
    ) then
      raise exception using errcode = '22023', message = 'profile incomplete';
    end if;
  end if;
  update public.worker_public_profiles set accepting_jobs = p_accepting where worker_id = v_worker returning id into v_id;
  if v_id is null then
    raise exception using errcode = '22023', message = 'profile required';
  end if;
  return p_accepting;
end;
$$;
revoke all on function nestscout_private.set_worker_accepting(boolean) from public, anon, authenticated;
grant execute on function nestscout_private.set_worker_accepting(boolean) to authenticated;

create or replace function nestscout_private.fixture_worker_dispatchable(p_worker uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.worker_access_grants g
      join nestscout_private.worker_dispatch_eligibility e on e.user_id = g.user_id
      join public.worker_public_profiles p on p.worker_id = g.user_id
    where g.user_id = p_worker and g.status = 'active' and e.active and e.basis = 'local_fixture'
      and p.accepting_jobs and cardinality(array_remove(nestscout_private.worker_missing_items(p_worker), 'identity')) = 0);
$$;
revoke all on function nestscout_private.fixture_worker_dispatchable(uuid) from public, anon, authenticated;
