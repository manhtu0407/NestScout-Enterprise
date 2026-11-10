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
  ('20000000-0000-4000-8000-00000000000' || n)::uuid, 'Contract fixture'
from generate_series(1, 2) n;
insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at, accepted_at, accepted_by)
values ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'Synthetic scope', 100, 'VND',
    now() + interval '1 day', now(), '00000000-0000-4000-8000-0000000000a1'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 1, 'Synthetic scope', 100, 'VND',
    now() + interval '1 day', null, null);
insert into public.service_invitations (id, request_id, quote_id, worker_id, expires_at, state) values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-0000000000b2', now() + interval '1 day', 'accepted'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-0000000000b2', now() + interval '1 day', 'open');
insert into public.service_jobs (id, request_id, quote_id, invitation_id, worker_id, stage, version)
values ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', 'working', 1);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select throws_ok($$select public.accept_service_invitation('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 1)$$,
  '22023', 'agreement unavailable', 'An offer without an accepted agreement is reported as unavailable');
select throws_ok($$select public.submit_service_work('50000000-0000-4000-8000-000000000001', 1, gen_random_uuid(), '   ')$$,
  '22023', 'invalid evidence', 'Blank evidence is reported as invalid input');
select throws_ok($$select public.propose_service_scope('50000000-0000-4000-8000-000000000001', 1, gen_random_uuid(), '', 10, 'Reason')$$,
  '22023', 'invalid proposal', 'A blank scope is reported as an invalid proposal');
select throws_ok($$select public.report_service_job('50000000-0000-4000-8000-000000000001', 1, gen_random_uuid(), 'unknown', 'Details')$$,
  '22023', 'invalid report', 'An unknown report kind is reported as invalid input');
select throws_ok($$select public.pause_service_job('50000000-0000-4000-8000-000000000001', 1, 'unknown')$$,
  '22023', 'invalid pause', 'An unknown pause category is reported as invalid input');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select public.decide_service_submission(gen_random_uuid(), 1, 'unknown', null)$$,
  '22023', 'invalid decision', 'An unknown decision is reported as invalid input');
select throws_ok($$select public.open_service_aftercare(gen_random_uuid(), gen_random_uuid(), '')$$,
  '22023', 'invalid reason', 'A blank support reason is reported as invalid input');
select throws_ok($$select public.submit_service_request(gen_random_uuid(), '')$$,
  '22023', 'invalid request', 'A blank request is reported as invalid input');
select throws_ok($$select public.accept_service_quote('30000000-0000-4000-8000-000000000001', 9)$$,
  '40001', 'stale quote', 'A wrong quote version is reported as stale');
reset role;

select * from finish();
rollback;
