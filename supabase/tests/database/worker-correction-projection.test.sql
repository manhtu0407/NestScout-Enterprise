begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e5', 'authenticated', 'authenticated');
insert into public.worker_access_grants (user_id) values
  ('00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000000c3'),
  ('00000000-0000-4000-8000-0000000000d4'),
  ('00000000-0000-4000-8000-0000000000e5');
insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active) values
  ('00000000-0000-4000-8000-0000000000b2', 'local_fixture', true),
  ('00000000-0000-4000-8000-0000000000c3', 'local_fixture', true),
  ('00000000-0000-4000-8000-0000000000d4', 'local_fixture', true),
  ('00000000-0000-4000-8000-0000000000e5', 'local_fixture', true);

create temporary table job_fixture (n integer primary key, owner uuid, worker uuid);
insert into job_fixture values
  (1, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2'),
  (2, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2'),
  (3, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2'),
  (4, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2'),
  (5, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2'),
  (6, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c3'),
  (7, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2'),
  (8, '00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000c3'),
  (9, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e5'),
  (10, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d4');
grant select on job_fixture to authenticated;

insert into public.service_requests (id, owner_id, submission_key, description)
select ('10000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, owner,
  ('20000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'Projection fixture'
from job_fixture;
insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at, accepted_at, accepted_by)
select ('30000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  ('10000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  1, 'Synthetic scope', 100, 'VND', now() + interval '1 day', now(), owner
from job_fixture;
insert into public.service_invitations (id, request_id, quote_id, worker_id, expires_at, state)
select ('40000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  ('10000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  ('30000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, worker, now() + interval '1 day', 'accepted'
from job_fixture;
insert into public.service_jobs (id, request_id, quote_id, invitation_id, worker_id, stage, version)
select ('50000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  ('10000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  ('30000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  ('40000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, worker, 'working', 1
from job_fixture;

create function pg_temp.submission(p_job integer, p_version integer, p_decision text, p_note text, p_at timestamptz)
returns void language sql as $$
  insert into public.service_submissions (job_id, submitted_by, submission_key, submitted_from_version, evidence,
    decision, decided_by, decided_at, decided_from_version, decision_reason, correction_note, created_at)
  select ('50000000-0000-4000-8000-0000000000' || lpad(p_job::text, 2, '0'))::uuid, f.worker, gen_random_uuid(), p_version, 'Evidence',
    p_decision,
    case when p_decision = 'pending' then null else f.owner end,
    case when p_decision = 'pending' then null else p_at end,
    case when p_decision = 'pending' then null else p_version + 1 end,
    case when p_decision = 'pending' then null when p_decision = 'accepted' then null else coalesce(p_note, 'Private reason') end,
    case when p_decision = 'revision_requested' then p_note else null end,
    p_at
  from job_fixture f where f.n = p_job;
$$;

select pg_temp.submission(1, 1, 'revision_requested', 'First note', '2026-10-28 10:00:00.123456+00');
select pg_temp.submission(1, 3, 'revision_requested', 'Latest note', '2026-10-28 10:00:00.123456+00');
select pg_temp.submission(2, 1, 'revision_requested', 'Superseded note', '2026-10-28 10:00:00.123456+00');
select pg_temp.submission(2, 3, 'pending', null, '2026-10-28 10:00:00.123456+00');
select pg_temp.submission(3, 1, 'revision_requested', 'Resolved note', '2026-10-28 10:00:00.123456+00');
select pg_temp.submission(3, 3, 'accepted', null, '2026-10-28 10:00:00.123456+00');
select pg_temp.submission(4, 1, 'disputed', 'Private dispute facts', '2026-10-28 10:00:00.123456+00');
select pg_temp.submission(5, 3, 'revision_requested', 'Newest by version', '2026-10-28 10:00:00.100000+00');
select pg_temp.submission(5, 1, 'revision_requested', 'Oldest by version', '2026-10-28 10:00:00.900000+00');
select pg_temp.submission(6, 1, 'revision_requested', 'Foreign note', '2026-10-28 10:00:00+00');
select pg_temp.submission(8, 1, 'revision_requested', 'Customer-side note', '2026-10-28 10:00:00+00');
select pg_temp.submission(9, 1, 'revision_requested', 'Dual-role Worker note', '2026-10-28 10:00:00+00');
select pg_temp.submission(10, 1, 'revision_requested', 'Revoked Worker note', '2026-10-28 10:00:00+00');

insert into public.service_submissions (job_id, submitted_by, submission_key, submitted_from_version, evidence,
  decision, decided_by, decided_at, decided_from_version, decision_reason, correction_note, created_at)
select '50000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-0000000000b2', gen_random_uuid(), v, 'Evidence',
  case when v % 2 = 1 then 'revision_requested' else 'accepted' end,
  '00000000-0000-4000-8000-0000000000a1', '2026-10-28 11:00:00+00', v + 1,
  case when v % 2 = 1 then 'Private ' || v else null end,
  case when v % 2 = 1 then 'Note ' || v else null end,
  '2026-10-28 11:00:00+00'
from generate_series(1, 1499) v;
select pg_temp.submission(7, 1501, 'revision_requested', 'Newest of 1500', '2026-10-28 11:00:00+00');

select is(p.prosecdef, false, 'The correction projection runs with the caller privileges')
  from pg_proc p where p.oid = 'public.worker_corrections()'::regprocedure;
select ok((select p.proconfig @> array['search_path=""'] from pg_proc p where p.oid = 'public.worker_corrections()'::regprocedure),
  'The correction projection has an empty search path');
select ok(has_function_privilege('authenticated', 'public.worker_corrections()', 'execute'),
  'Authenticated users can call the correction projection');
select ok(not has_function_privilege('anon', 'public.worker_corrections()', 'execute'),
  'Anonymous users cannot call the correction projection');
select has_index('public', 'service_submissions', 'service_submissions_job_version', array['job_id', 'submitted_from_version'],
  'Submission versions are indexed per job');
select throws_ok($$select pg_temp.submission(1, 3, 'pending', null, now())$$, '23505', null,
  'A job cannot carry two submissions from the same version');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is((select count(*)::integer from public.worker_corrections()), 3,
  'The Worker receives one row for each job whose newest submission is a correction request');
select is((select note from public.worker_corrections() where job_id = '50000000-0000-4000-8000-000000000001'), 'Latest note',
  'Two submissions with the same timestamp resolve by version, newest first');
select is((select submitted_from_version from public.worker_corrections() where job_id = '50000000-0000-4000-8000-000000000001'), 3,
  'The projection reports the version it chose');
select is_empty($$select 1 from public.worker_corrections() where job_id = '50000000-0000-4000-8000-000000000002'$$,
  'A resubmission supersedes the earlier correction request');
select is_empty($$select 1 from public.worker_corrections() where job_id = '50000000-0000-4000-8000-000000000003'$$,
  'An accepted resubmission leaves no outstanding correction');
select is_empty($$select 1 from public.worker_corrections() where job_id = '50000000-0000-4000-8000-000000000004'$$,
  'A dispute never produces correction text');
select is((select note from public.worker_corrections() where job_id = '50000000-0000-4000-8000-000000000005'), 'Newest by version',
  'The version, not the timestamp or the row order, decides which submission is newest');
select is((select note from public.worker_corrections() where job_id = '50000000-0000-4000-8000-000000000007'), 'Newest of 1500',
  'The newest correction is returned from a history longer than the API row limit');
select is((select count(*)::integer from public.worker_corrections() where job_id = '50000000-0000-4000-8000-000000000007'), 1,
  'A long history collapses to one row for the job');
select is_empty($$select 1 from public.worker_corrections() where job_id = '50000000-0000-4000-8000-000000000006'$$,
  'A correction on another Worker job is not returned');
select is_empty($$select 1 from public.worker_corrections() where job_id = '50000000-0000-4000-8000-000000000008'$$,
  'A correction on a job the Worker does not hold is not returned');
select is_empty($$select 1 from public.worker_corrections() where note like '%Private%' or note like '%dispute%'$$,
  'No private decision reason is returned');
select throws_ok($$select decision_reason from public.worker_corrections()$$, '42703', null,
  'The projection has no column for the private decision reason');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true);
select is((select array_agg(note) from public.worker_corrections()), array['Dual-role Worker note'],
  'A person who is both Customer and Worker receives only the corrections of the jobs they hold as Worker');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is_empty($$select 1 from public.worker_corrections()$$, 'A Customer without Worker access receives no correction rows');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
select is((select array_agg(note order by note) from public.worker_corrections()), array['Customer-side note', 'Foreign note'],
  'Another Worker receives only the corrections of the jobs they hold');
reset role;

set local role anon;
select throws_ok($$select * from public.worker_corrections()$$, '42501', null,
  'An unauthenticated client cannot call the correction projection');
reset role;

update public.worker_access_grants set status = 'revoked', revoked_at = now()
  where user_id = '00000000-0000-4000-8000-0000000000d4';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
select is_empty($$select 1 from public.worker_corrections()$$, 'A revoked Worker receives no correction rows');
reset role;

update nestscout_private.worker_dispatch_eligibility set active = false
  where user_id = '00000000-0000-4000-8000-0000000000b2';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is_empty($$select 1 from public.worker_corrections()$$, 'A Worker without current eligibility receives no correction rows');
reset role;

select * from finish();
rollback;
