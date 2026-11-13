alter table public.worker_public_profiles
  drop constraint worker_public_profiles_service_ids_check,
  add constraint worker_public_profiles_service_ids_check
    check (cardinality(service_ids) <= 6 and service_ids <@ array['electric', 'water', 'aircon', 'paint', 'sofa', 'other']::text[]);

create or replace function nestscout_private.save_worker_coverage(p_radius_km integer, p_service_ids text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
  v_services text[];
  v_id uuid;
begin
  v_worker := nestscout_private.lock_current_worker();
  if p_radius_km is null or p_radius_km not in (3, 5, 10) or p_service_ids is null
    or not (p_service_ids <@ array['electric', 'water', 'aircon', 'paint', 'sofa', 'other']::text[]) then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  select coalesce(array_agg(u.service_id order by u.service_id), '{}') into v_services from (select distinct x as service_id from unnest(p_service_ids) as x) u;
  update public.worker_public_profiles set radius_km = p_radius_km, service_ids = v_services where worker_id = v_worker returning id into v_id;
  if v_id is null then
    raise exception using errcode = '22023', message = 'profile required';
  end if;
  return v_id;
end;
$$;
