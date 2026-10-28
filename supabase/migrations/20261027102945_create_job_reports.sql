alter table public.service_job_events drop constraint service_job_events_event_check;
alter table public.service_job_events add constraint service_job_events_event_check
  check (event in ('assigned', 'en_route', 'arrived', 'working', 'paused', 'submitted',
    'accepted', 'revision_requested', 'disputed', 'scope_proposed', 'scope_approved', 'scope_rejected',
    'delay_reported', 'absence_reported'));

create table public.service_job_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.service_jobs (id),
  actor_id uuid not null references auth.users (id),
  report_key uuid not null,
  reported_from_version integer not null check (reported_from_version > 0),
  kind text not null check (kind in ('delay', 'customer_absent')),
  details text not null check (char_length(btrim(details)) between 1 and 4000),
  created_at timestamptz not null default clock_timestamp(),
  unique (actor_id, report_key)
);
alter table public.service_job_reports enable row level security;
revoke all on table public.service_job_reports from public, anon, authenticated;
grant select on table public.service_job_reports to authenticated;
create policy service_job_reports_select_participant on public.service_job_reports
  for select to authenticated using (exists (select 1 from public.service_jobs j where j.id = job_id));

create function nestscout_private.block_start_after_absence_report()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if old.stage = 'arrived' and new.stage = 'working'
    and exists (select 1 from public.service_job_reports r where r.job_id = new.id and r.kind = 'customer_absent') then
    raise exception using errcode = '22023', message = 'absence recovery policy required';
  end if;
  return new;
end;
$$;
revoke all on function nestscout_private.block_start_after_absence_report() from public, anon, authenticated;
create trigger service_jobs_block_start_after_absence before update on public.service_jobs
  for each row execute function nestscout_private.block_start_after_absence_report();

create function nestscout_private.report_service_job(p_job_id uuid, p_version integer, p_key uuid, p_kind text, p_details text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_worker uuid;
  v_job public.service_jobs%rowtype;
  v_report public.service_job_reports%rowtype;
begin
  v_worker := nestscout_private.lock_current_worker();
  if p_key is null or p_kind is null or p_kind not in ('delay', 'customer_absent')
    or p_details is null or char_length(btrim(p_details)) not between 1 and 4000 then
    raise exception using errcode = '22023', message = 'invalid report';
  end if;
  select * into v_job from public.service_jobs j where j.id = p_job_id and j.worker_id = v_worker for update;
  if not found then raise exception using errcode = '42501', message = 'job unavailable'; end if;
  select * into v_report from public.service_job_reports r where r.actor_id = v_worker and r.report_key = p_key;
  if found then
    if v_report.job_id <> p_job_id or v_report.reported_from_version is distinct from p_version
      or v_report.kind <> p_kind or v_report.details <> btrim(p_details) then
      raise exception using errcode = '22023', message = 'report key conflict';
    end if;
    return v_report.id;
  end if;
  if v_job.version is distinct from p_version then raise exception using errcode = '40001', message = 'stale job'; end if;
  if not ((p_kind = 'delay' and v_job.stage = 'en_route') or (p_kind = 'customer_absent' and v_job.stage = 'arrived')) then
    raise exception using errcode = '22023', message = 'invalid transition';
  end if;
  insert into public.service_job_reports (job_id, actor_id, report_key, reported_from_version, kind, details)
    values (p_job_id, v_worker, p_key, p_version, p_kind, btrim(p_details)) returning * into v_report;
  update public.service_jobs set version = version + 1 where id = p_job_id;
  insert into public.service_job_events (job_id, actor_id, event, version)
    values (p_job_id, v_worker, case p_kind when 'delay' then 'delay_reported' else 'absence_reported' end, v_job.version + 1);
  return v_report.id;
end;
$$;
revoke all on function nestscout_private.report_service_job(uuid, integer, uuid, text, text) from public, anon, authenticated;
grant execute on function nestscout_private.report_service_job(uuid, integer, uuid, text, text) to authenticated;

create function public.report_service_job(p_job_id uuid, p_version integer, p_key uuid, p_kind text, p_details text)
returns uuid language sql security invoker set search_path = ''
as $$ select nestscout_private.report_service_job(p_job_id, p_version, p_key, p_kind, p_details); $$;
revoke all on function public.report_service_job(uuid, integer, uuid, text, text) from public, anon, authenticated;
grant execute on function public.report_service_job(uuid, integer, uuid, text, text) to authenticated;
