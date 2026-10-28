begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated');
insert into public.worker_access_grants (user_id) values
  ('00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000000c3');
insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active) values
  ('00000000-0000-4000-8000-0000000000b2', 'local_fixture', true),
  ('00000000-0000-4000-8000-0000000000c3', 'local_fixture', true);

insert into public.service_requests (id, owner_id, submission_key, description)
select ('10000000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-4000-8000-0000000000a1',
  ('20000000-0000-4000-8000-00000000000' || n)::uuid, 'Correction fixture'
from generate_series(1, 2) n;
insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at, accepted_at, accepted_by)
select ('30000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
  1, 'Synthetic scope', 100, 'VND', now() + interval '1 day', now(), '00000000-0000-4000-8000-0000000000a1'
from generate_series(1, 2) n;
insert into public.service_invitations (id, request_id, quote_id, worker_id, expires_at, state)
select ('40000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
  ('30000000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-4000-8000-0000000000b2', now() + interval '1 day', 'accepted'
from generate_series(1, 2) n;
insert into public.service_jobs (id, request_id, quote_id, invitation_id, worker_id, stage, version)
select ('50000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
  ('30000000-0000-4000-8000-00000000000' || n)::uuid, ('40000000-0000-4000-8000-00000000000' || n)::uuid,
  '00000000-0000-4000-8000-0000000000b2', 'working', 1
from generate_series(1, 2) n;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select lives_ok($$select public.submit_service_work('50000000-0000-4000-8000-000000000001', 1, '60000000-0000-4000-8000-000000000001', 'First evidence')$$,
  'Worker submits work for the first job');
select lives_ok($$select public.submit_service_work('50000000-0000-4000-8000-000000000002', 1, '60000000-0000-4000-8000-000000000002', 'Second evidence')$$,
  'Worker submits work for the second job');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select lives_ok($$select public.decide_service_submission((select id from public.service_submissions where job_id = '50000000-0000-4000-8000-000000000001'), 2, 'revision_requested', 'Reseal the joint')$$,
  'Customer requests a correction on the first job');
select lives_ok($$select public.decide_service_submission((select id from public.service_submissions where job_id = '50000000-0000-4000-8000-000000000002'), 2, 'disputed', 'Private dispute facts')$$,
  'Customer disputes the second job');
select is((select correction_note from public.service_submissions where job_id = '50000000-0000-4000-8000-000000000001'), 'Reseal the joint',
  'The Customer can read the correction text they wrote');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is((select count(*)::integer from (select id, job_id, decision, correction_note, created_at from public.service_submissions) s), 2,
  'The Worker app projection returns exactly the two submissions of the assigned jobs');
select is((select correction_note from (select id, job_id, decision, correction_note, created_at from public.service_submissions) s where s.job_id = '50000000-0000-4000-8000-000000000001'),
  'Reseal the joint', 'The assigned Worker reads the correction text through the app projection');
select is((select decision from (select id, job_id, decision, correction_note, created_at from public.service_submissions) s where s.job_id = '50000000-0000-4000-8000-000000000001'),
  'revision_requested', 'The assigned Worker sees that a correction was requested');
select is((select decision from (select id, job_id, decision, correction_note, created_at from public.service_submissions) s where s.job_id = '50000000-0000-4000-8000-000000000002'),
  'disputed', 'The assigned Worker sees that the other job is disputed');
select is((select correction_note from (select id, job_id, decision, correction_note, created_at from public.service_submissions) s where s.job_id = '50000000-0000-4000-8000-000000000002'),
  null, 'The dispute reason is never delivered as a correction');
select throws_ok($$select decision_reason from public.service_submissions$$, '42501', null,
  'The Worker cannot select the private decision reason');
select throws_ok($$select job_id from public.service_submissions where decision_reason like '%dispute%'$$, '42501', null,
  'The Worker cannot probe the private decision reason through a filter');
select throws_ok($$select job_id from public.service_submissions order by decision_reason$$, '42501', null,
  'The Worker cannot probe the private decision reason through an ordering');
select throws_ok($$select decided_by from public.service_submissions$$, '42501', null,
  'The Worker cannot read the Customer account id');
select lives_ok($$select public.submit_service_work('50000000-0000-4000-8000-000000000001', 3, '60000000-0000-4000-8000-000000000003', 'Corrected evidence')$$,
  'Worker resubmits corrected work');
select is((select count(*)::integer from public.service_submissions where job_id = '50000000-0000-4000-8000-000000000001'), 2,
  'The first job now has the correction request and the resubmission');
select is((select decision from public.service_submissions where job_id = '50000000-0000-4000-8000-000000000001' order by created_at desc limit 1), 'pending',
  'The newest submission is the pending resubmission');
select is((select correction_note from public.service_submissions where job_id = '50000000-0000-4000-8000-000000000001' order by created_at desc limit 1), null,
  'The newest submission carries no outstanding correction');
select is((select correction_note from public.service_submissions where job_id = '50000000-0000-4000-8000-000000000001' and decision = 'revision_requested'), 'Reseal the joint',
  'The earlier correction request stays on record');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
select is((select count(*)::integer from public.service_submissions), 0,
  'A Worker without the assignment sees no submission');
select is_empty($$select correction_note from public.service_submissions where job_id = '50000000-0000-4000-8000-000000000001'$$,
  'A Worker without the assignment cannot read the correction text');
select throws_ok($$select decision_reason from public.service_submissions$$, '42501', null,
  'A Worker without the assignment cannot select the private decision reason');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
select is((select count(*)::integer from public.service_submissions), 0,
  'A Customer who does not own the request sees no submission');
reset role;

set local role anon;
select throws_ok($$select id from public.service_submissions$$, '42501', null,
  'An unauthenticated client cannot read submissions');
reset role;

update public.worker_access_grants set status = 'revoked', revoked_at = now()
  where user_id = '00000000-0000-4000-8000-0000000000b2';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is_empty($$select 1 from public.service_jobs$$, 'A revoked Worker loses the job projection');
select is_empty($$select 1 from public.service_submissions$$, 'A revoked Worker loses the submissions with the job');
select is_empty($$select correction_note from public.service_submissions where job_id = '50000000-0000-4000-8000-000000000001'$$,
  'A revoked Worker can no longer read the correction text');
reset role;

select * from finish();
rollback;
