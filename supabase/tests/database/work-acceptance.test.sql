begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated');
insert into public.worker_access_grants (user_id) values ('00000000-0000-4000-8000-0000000000b2');
insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active) values ('00000000-0000-4000-8000-0000000000b2', 'local_fixture', true);

insert into public.service_requests (id, owner_id, submission_key, description)
select ('10000000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-4000-8000-0000000000a1',
  ('20000000-0000-4000-8000-00000000000' || n)::uuid, 'Completion fixture'
from generate_series(1, 3) n;
insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at, accepted_at, accepted_by)
select ('30000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
  1, 'Synthetic scope', 100, 'VND', now() + interval '1 day', now(), '00000000-0000-4000-8000-0000000000a1'
from generate_series(1, 3) n;
insert into public.service_invitations (id, request_id, quote_id, worker_id, expires_at, state)
select ('40000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
  ('30000000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-4000-8000-0000000000b2', now() + interval '1 day', 'accepted'
from generate_series(1, 3) n;
insert into public.service_jobs (id, request_id, quote_id, invitation_id, worker_id, stage, version)
select ('50000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
  ('30000000-0000-4000-8000-00000000000' || n)::uuid, ('40000000-0000-4000-8000-00000000000' || n)::uuid,
  '00000000-0000-4000-8000-0000000000b2', 'working', 1
from generate_series(1, 3) n;

select ok(not has_table_privilege('authenticated', 'public.service_submissions', 'update')
  and not has_table_privilege('authenticated', 'public.service_cases', 'insert'), 'Clients cannot bypass completion and case commands');
select ok(to_regprocedure('public.mark_paid(uuid)') is null, 'No customer payment confirmation operation exists');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select lives_ok($$select public.submit_service_work('50000000-0000-4000-8000-000000000001', 1, '60000000-0000-4000-8000-000000000001', 'Work evidence')$$,
  'Worker submits evidence');
select set_config('test.submission_id', (select id::text from public.service_submissions where job_id='50000000-0000-4000-8000-000000000001'), true);
select lives_ok($$select public.submit_service_work('50000000-0000-4000-8000-000000000001', 1, '60000000-0000-4000-8000-000000000001', 'Work evidence')$$,
  'Identical submission replay is safe');
select throws_ok($$select public.submit_service_work('50000000-0000-4000-8000-000000000001', 1, '60000000-0000-4000-8000-000000000001', 'Changed evidence')$$,
  '22023', 'submission key conflict', 'Submission key binds the evidence');
select is((select decision from public.service_submissions where job_id='50000000-0000-4000-8000-000000000001'), 'pending',
  'Worker submission is not Customer acceptance');
select throws_ok($$select public.decide_service_submission((select id from public.service_submissions where job_id='50000000-0000-4000-8000-000000000001'), 2, 'accepted', null)$$,
  '42501', 'submission unavailable', 'Worker cannot accept their own work');
select lives_ok($$select public.submit_service_work('50000000-0000-4000-8000-000000000002', 1, '60000000-0000-4000-8000-000000000002', 'Second evidence')$$,
  'A second job can be submitted');
select lives_ok($$select public.submit_service_work('50000000-0000-4000-8000-000000000003', 1, '60000000-0000-4000-8000-000000000003', 'Third evidence')$$,
  'A third job can be submitted');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
select is_empty($$select 1 from public.service_submissions$$, 'Another Customer cannot read submissions');
select throws_ok($$select public.decide_service_submission(current_setting('test.submission_id')::uuid, 2, 'accepted', null)$$,
  '42501', 'submission unavailable', 'Another Customer cannot decide');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select public.decide_service_submission((select id from public.service_submissions where job_id='50000000-0000-4000-8000-000000000001'), 1, 'accepted', null)$$,
  '40001', 'stale job', 'A stale version cannot accept');
select lives_ok($$select public.decide_service_submission((select id from public.service_submissions where job_id='50000000-0000-4000-8000-000000000001'), 2, 'accepted', null)$$,
  'Customer accepts submitted work');
select lives_ok($$select public.decide_service_submission((select id from public.service_submissions where job_id='50000000-0000-4000-8000-000000000001'), 2, 'accepted', null)$$,
  'Acceptance replay is safe');
select is((select stage from public.service_jobs where id='50000000-0000-4000-8000-000000000001'), 'completed', 'Accepted work is completed');
select lives_ok($$select public.open_service_aftercare('50000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 'Follow-up needed')$$,
  'Owner opens a linked aftercare case');
select lives_ok($$select public.open_service_aftercare('50000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 'Follow-up needed')$$,
  'Aftercare retry is safe');
select is((select count(*)::integer from public.service_cases where kind='aftercare'), 1, 'Aftercare retry creates one case');
select is((select version from public.service_jobs where id='50000000-0000-4000-8000-000000000001'), 3, 'Aftercare does not change closed job history');
select is((select count(*)::integer from public.service_job_events where job_id='50000000-0000-4000-8000-000000000001'), 2,
  'Aftercare does not append or rewrite closed work events');
select lives_ok($$select public.decide_service_submission((select id from public.service_submissions where job_id='50000000-0000-4000-8000-000000000002'), 2, 'disputed', 'Needs review')$$,
  'Customer opens a dispute');
select throws_ok($$select public.decide_service_submission((select id from public.service_submissions where job_id='50000000-0000-4000-8000-000000000002'), 3, 'accepted', null)$$,
  '22023', 'invalid transition', 'A disputed submission cannot be accepted');
select is((select count(*)::integer from public.service_cases where kind='dispute'), 1, 'Dispute is a separate linked case');
select lives_ok($$select public.decide_service_submission((select id from public.service_submissions where job_id='50000000-0000-4000-8000-000000000003'), 2, 'revision_requested', 'Please correct')$$,
  'Customer can request a correction');
select is((select stage from public.service_jobs where id='50000000-0000-4000-8000-000000000003'), 'working', 'Correction returns work to the assigned Worker');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is_empty($$select 1 from public.service_cases$$, 'Customer case details are not exposed to the Worker without a support policy');
reset role;

select * from finish();
rollback;
