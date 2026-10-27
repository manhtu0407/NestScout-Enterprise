begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated');
insert into public.worker_access_grants (user_id) values
  ('00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000000c3'),
  ('00000000-0000-4000-8000-0000000000d4');
insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active) values
  ('00000000-0000-4000-8000-0000000000b2', 'local_fixture', true),
  ('00000000-0000-4000-8000-0000000000c3', 'local_fixture', true);
insert into public.service_requests (id, owner_id, submission_key, description) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-000000000001', 'Fixture request');
insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at, accepted_at, accepted_by) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'Fixture scope', 100, 'VND', now() + interval '1 day', now(), '00000000-0000-4000-8000-0000000000a1');
insert into public.service_invitations (id, request_id, quote_id, worker_id, expires_at) values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', now() + interval '1 day'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c3', now() + interval '1 day'),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', now() - interval '1 day');

select ok(not has_table_privilege('authenticated', 'public.service_jobs', 'insert')
  and not has_table_privilege('authenticated', 'public.service_jobs', 'update')
  and not has_table_privilege('authenticated', 'public.service_job_events', 'insert'), 'Clients cannot write jobs or events directly');
select ok(not has_table_privilege('authenticated', 'nestscout_private.worker_dispatch_eligibility', 'select'),
  'Eligibility fixtures are not client-readable');
select ok(not has_function_privilege('anon', 'public.accept_service_invitation(uuid,uuid,integer)', 'execute'), 'Anonymous cannot accept an invitation');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
select is_empty($$select 1 from public.service_invitations$$, 'A grant alone gives no fixture eligibility or invitations');
select throws_ok($$select public.accept_service_invitation('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 1)$$,
  '42501', 'worker unavailable', 'A grant alone cannot accept');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is((select count(*)::integer from public.service_invitations), 2, 'A worker sees only their own invitations');
select is((select count(*)::integer from public.worker_offers()), 1, 'Offer projection includes only live terms for this worker');
select throws_ok($$select public.accept_service_invitation('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 2)$$,
  '40001', 'stale terms', 'A worker must accept the displayed quote version');
select throws_ok($$select public.accept_service_invitation('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 1)$$,
  '42501', 'invitation unavailable', 'A worker cannot accept another invitation');
select throws_ok($$select public.accept_service_invitation('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 1)$$,
  '22023', 'invitation unavailable', 'An expired invitation is rejected');
select lives_ok($$select public.accept_service_invitation('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 1)$$, 'Eligible invited worker accepts');
select set_config('test.assigned_job', (select id::text from public.service_jobs), true);
select lives_ok($$select public.accept_service_invitation('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 1)$$, 'Acceptance replay is safe');
select is((select count(*)::integer from public.worker_jobs()), 1, 'Assigned worker sees the scoped job projection');
select is((select scope from public.worker_jobs()), 'Fixture scope', 'Job projection contains the accepted scope');
select throws_ok($$select public.advance_service_job((select id from public.service_jobs), 1, 'working')$$,
  '22023', 'invalid transition', 'A worker cannot skip travel and arrival');
select is(public.advance_service_job((select id from public.service_jobs), 1, 'en_route'), 2, 'Assigned worker starts travel');
select is(public.advance_service_job((select id from public.service_jobs), 1, 'en_route'), 2, 'Identical stage retry is safe');
select throws_ok($$select public.advance_service_job((select id from public.service_jobs), 1, 'arrived')$$,
  '40001', 'stale job', 'A stale version cannot advance');
select is(public.advance_service_job((select id from public.service_jobs), 2, 'paused'), 3, 'Safety pause is available during travel');
select throws_ok($$select public.advance_service_job((select id from public.service_jobs), 3, 'arrived')$$,
  '22023', 'invalid transition', 'Paused work cannot progress');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
select is_empty($$select 1 from public.service_jobs$$, 'Another worker cannot read the assigned job');
select is_empty($$select 1 from public.worker_jobs()$$, 'Another worker cannot read the job projection');
select throws_ok($$select public.advance_service_job(current_setting('test.assigned_job')::uuid, 1, 'en_route')$$,
  '42501', 'job unavailable', 'Another eligible worker cannot advance the real assigned job');
select throws_ok($$select public.accept_service_invitation('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 1)$$,
  '40001', 'already assigned', 'A second worker cannot win');
reset role;

update public.worker_access_grants set status = 'revoked', revoked_at = now()
  where user_id = '00000000-0000-4000-8000-0000000000b2';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is_empty($$select 1 from public.service_jobs$$, 'A revoked worker loses the job projection');
select is_empty($$select 1 from public.worker_jobs()$$, 'A revoked worker loses the scoped projection');
select throws_ok($$select public.advance_service_job('50000000-0000-4000-8000-000000000001', 1, 'en_route')$$,
  '42501', 'worker unavailable', 'A revoked grant blocks protected operations');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select count(*)::integer from public.service_jobs), 1, 'The request owner can see the assigned job');
select is((select count(*)::integer from public.service_job_events), 3, 'The owner can see authoritative stage events');
reset role;

select * from finish();
rollback;
