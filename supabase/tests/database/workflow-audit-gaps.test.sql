begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated');
insert into public.worker_access_grants (user_id) values ('00000000-0000-4000-8000-0000000000b2');
insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active)
  values ('00000000-0000-4000-8000-0000000000b2', 'local_fixture', true);

insert into public.service_requests (id, owner_id, submission_key, description)
select ('10000000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-4000-8000-0000000000a1',
  ('20000000-0000-4000-8000-00000000000' || n)::uuid, 'Audit fixture'
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

select is((select basis from public.service_quotes limit 1), 'local_fixture', 'Quotes carry fixture provenance');
select is((select basis from public.service_invitations limit 1), 'local_fixture', 'Invitations carry fixture provenance');
select throws_ok($$insert into public.service_quotes (request_id, version, scope, amount_minor, currency, expires_at, basis)
  values ('10000000-0000-4000-8000-000000000001', 9, 'Priced', 100, 'VND', now() + interval '1 day', 'pricing_engine')$$,
  '23514', null, 'A quote cannot claim a non-fixture origin');
select throws_ok($$insert into public.service_invitations (request_id, quote_id, worker_id, expires_at, basis)
  values ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-0000000000b2', now() + interval '1 day', 'matching_engine')$$,
  '23514', null, 'An invitation cannot claim a non-fixture origin');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select lives_ok($$select public.submit_service_work('50000000-0000-4000-8000-000000000001', 1, '60000000-0000-4000-8000-000000000001', 'Work evidence')$$,
  'Worker submits evidence');
select throws_ok($$select public.advance_service_job('50000000-0000-4000-8000-000000000001', 2, 'paused')$$,
  '22023', 'invalid transition', 'A job awaiting the Customer decision cannot be paused into a dead end');
select is((select stage from public.service_jobs where id = '50000000-0000-4000-8000-000000000001'), 'submitted',
  'The rejected pause leaves the job awaiting the decision');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select lives_ok($$select public.decide_service_submission((select id from public.service_submissions where job_id = '50000000-0000-4000-8000-000000000001'), 2, 'revision_requested', 'Reseal the joint')$$,
  'Customer requests a correction');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is((select correction_note from public.service_submissions where job_id = '50000000-0000-4000-8000-000000000001'),
  'Reseal the joint', 'The Worker sees the correction text meant for them');
select is(public.advance_service_job('50000000-0000-4000-8000-000000000001', 3, 'paused'), 4,
  'Safety pause remains available while work is in progress');

select lives_ok($$select public.propose_service_scope('50000000-0000-4000-8000-000000000002', 1, '60000000-0000-4000-8000-000000000002', 'Larger scope', 150, 'More work found')$$,
  'Worker proposes a scope change');
select is(public.advance_service_job('50000000-0000-4000-8000-000000000002', 2, 'paused'), 3,
  'Safety pause is available with a proposal pending');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select lives_ok($$select public.decide_service_scope((select id from public.service_scope_changes), 3, 1, 'rejected')$$,
  'A pending proposal can still be decided while the job is paused');
select is((select stage from public.service_jobs where id = '50000000-0000-4000-8000-000000000002'), 'paused',
  'Deciding the proposal does not resume paused work');
select is((select count(*)::integer from public.service_scope_changes where decision = 'pending'), 0,
  'No proposal is left undecidable');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select lives_ok($$select public.submit_service_work('50000000-0000-4000-8000-000000000003', 1, '60000000-0000-4000-8000-000000000003', 'Disputed evidence')$$,
  'Worker submits work that will be disputed');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select lives_ok($$select public.decide_service_submission((select id from public.service_submissions where job_id = '50000000-0000-4000-8000-000000000003'), 2, 'disputed', 'Private dispute facts')$$,
  'Customer opens a dispute');
select throws_ok($$select decision_reason from public.service_submissions$$, '42501', null,
  'The private reason is not readable through the table');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is((select decision from public.service_submissions where job_id = '50000000-0000-4000-8000-000000000003'), 'disputed',
  'The Worker sees that a dispute exists');
select is((select correction_note from public.service_submissions where job_id = '50000000-0000-4000-8000-000000000003'), null,
  'The Worker receives no dispute text as a correction');
select throws_ok($$select decision_reason from public.service_submissions$$, '42501', null,
  'The Worker cannot read the private decision reason');
select throws_ok($$select decided_by from public.service_submissions$$, '42501', null,
  'The Worker cannot read who decided');
select throws_ok($$select * from public.service_submissions$$, '42501', null,
  'A wildcard read cannot reach private columns');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$insert into public.service_requests (submission_key, description) values ('20000000-0000-4000-8000-000000000001', 'Audit fixture')$$,
  '23505', null, 'A direct write cannot duplicate a request key');
select is(public.submit_service_request('20000000-0000-4000-8000-000000000001', 'Audit fixture'),
  '10000000-0000-4000-8000-000000000001'::uuid, 'The command path replays the original request');
select is((select count(*)::integer from public.service_requests), 3, 'No duplicate request exists after either path');
reset role;

select * from finish();
rollback;
