create unique index service_submissions_job_version on public.service_submissions (job_id, submitted_from_version);

create function public.worker_corrections()
returns table (job_id uuid, submitted_from_version integer, note text)
language sql stable security invoker set search_path = ''
as $$
  select latest.job_id, latest.submitted_from_version, latest.correction_note
  from (
    select distinct on (s.job_id) s.job_id, s.submitted_from_version, s.decision, s.correction_note
    from public.service_submissions s
    where s.job_id in (select w.job_id from nestscout_private.worker_jobs() w)
    order by s.job_id, s.submitted_from_version desc
  ) latest
  where latest.decision = 'revision_requested'
  order by latest.job_id;
$$;
revoke all on function public.worker_corrections() from public, anon, authenticated;
grant execute on function public.worker_corrections() to authenticated;
