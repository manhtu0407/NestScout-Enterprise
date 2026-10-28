drop function public.worker_offers();
drop function nestscout_private.worker_offers();

create function nestscout_private.worker_offers()
returns table (invitation_id uuid, quote_id uuid, quote_version integer, scope text, amount_minor bigint, currency text, expires_at timestamptz, basis text)
language sql stable security definer set search_path = ''
as $$
  select i.id, q.id, q.version, q.scope, q.amount_minor, q.currency, i.expires_at, q.basis
  from public.service_invitations i
  join public.service_quotes q on q.id = i.quote_id and q.request_id = i.request_id
  where i.worker_id = auth.uid() and nestscout_private.current_worker_eligible()
    and i.state = 'open' and i.expires_at > clock_timestamp() and q.accepted_at is not null
    and not exists (select 1 from public.service_jobs j where j.request_id = i.request_id);
$$;
revoke all on function nestscout_private.worker_offers() from public, anon, authenticated;
grant execute on function nestscout_private.worker_offers() to authenticated;

create function public.worker_offers()
returns table (invitation_id uuid, quote_id uuid, quote_version integer, scope text, amount_minor bigint, currency text, expires_at timestamptz, basis text)
language sql stable security invoker set search_path = ''
as $$ select * from nestscout_private.worker_offers(); $$;
revoke all on function public.worker_offers() from public, anon, authenticated;
grant execute on function public.worker_offers() to authenticated;

revoke select on table public.service_job_events, public.service_scope_changes, public.service_job_reports,
  public.service_submissions, public.service_jobs from authenticated;
grant select (id, job_id, event, version, created_at) on public.service_job_events to authenticated;
grant select (id, job_id, proposed_from_version, sequence, old_scope, old_amount_minor, new_scope, new_amount_minor,
  currency, rationale, basis, decision, decided_from_version, decided_at, created_at) on public.service_scope_changes to authenticated;
grant select (id, job_id, reported_from_version, kind, details, created_at) on public.service_job_reports to authenticated;
grant select (id, job_id, submitted_from_version, evidence, decision, decided_at, decided_from_version,
  correction_note, created_at) on public.service_submissions to authenticated;
grant select (id, request_id, quote_id, invitation_id, stage, version, created_at) on public.service_jobs to authenticated;
