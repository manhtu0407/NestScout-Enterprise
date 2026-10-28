begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated');
insert into public.worker_access_grants (user_id) values ('00000000-0000-4000-8000-0000000000b2');
insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active) values ('00000000-0000-4000-8000-0000000000b2', 'local_fixture', true);
insert into public.service_requests (id, owner_id, submission_key, description) values
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a1','20000000-0000-4000-8000-000000000001','Scope fixture');
insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at, accepted_at, accepted_by) values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'Original fixture',100,'VND',now()+interval '1 day',now(),'00000000-0000-4000-8000-0000000000a1');
insert into public.service_invitations (id, request_id, quote_id, worker_id, expires_at, state) values
  ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000b2',now()+interval '1 day','accepted');
insert into public.service_jobs (id, request_id, quote_id, invitation_id, worker_id, stage, version) values
  ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000b2','working',1);

select ok(not has_table_privilege('authenticated', 'public.service_scope_changes', 'update'), 'Clients cannot edit proposals directly');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select lives_ok($$select public.propose_service_scope('50000000-0000-4000-8000-000000000001',1,'60000000-0000-4000-8000-000000000001','New fixture scope',150,'Fixture rationale')$$,
  'Worker proposes local fixture terms');
select set_config('test.scope_id', (select id::text from public.service_scope_changes), true);
select lives_ok($$select public.propose_service_scope('50000000-0000-4000-8000-000000000001',1,'60000000-0000-4000-8000-000000000001','New fixture scope',150,'Fixture rationale')$$,
  'The same proposal retry is safe');
select throws_ok($$select public.propose_service_scope('50000000-0000-4000-8000-000000000001',1,'60000000-0000-4000-8000-000000000001','Altered',150,'Fixture rationale')$$,
  '22023', 'proposal key conflict', 'The key binds exact proposed terms');
select throws_ok($$select public.submit_service_work('50000000-0000-4000-8000-000000000001',2,'70000000-0000-4000-8000-000000000001','Evidence')$$,
  '22023', 'scope decision pending', 'Work cannot be submitted while new terms await consent');
select is((select scope from public.worker_jobs()), 'Original fixture', 'Unapproved scope is not active');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
select throws_ok($$select public.decide_service_scope(current_setting('test.scope_id')::uuid,2,1,'approved')$$,
  '42501', 'proposal unavailable', 'Another Customer cannot approve the real proposal');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select public.decide_service_scope((select id from public.service_scope_changes),2,2,'approved')$$,
  '40001', 'stale proposal', 'Customer cannot approve a different proposal version');
select lives_ok($$select public.decide_service_scope((select id from public.service_scope_changes),2,1,'approved')$$,
  'Customer explicitly approves the exact proposal');
select lives_ok($$select public.decide_service_scope((select id from public.service_scope_changes),2,1,'approved')$$,
  'Approval replay is safe');
select is((select scope from public.service_quotes), 'Original fixture', 'Original agreement remains unchanged');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is((select scope from public.worker_jobs()), 'New fixture scope', 'Approved scope becomes the Worker projection');
select is((select amount_minor from public.worker_jobs()), 150::bigint, 'Approved fixture amount is projected exactly');
select lives_ok($$select public.propose_service_scope('50000000-0000-4000-8000-000000000001',3,'60000000-0000-4000-8000-000000000002','Another fixture',180,'Second rationale')$$,
  'Worker can propose another revision');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select lives_ok($$select public.decide_service_scope((select id from public.service_scope_changes where sequence=2),4,2,'rejected')$$,
  'Customer rejects the second proposal');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is((select scope from public.worker_jobs()), 'New fixture scope', 'Rejected terms do not replace the accepted scope');
select lives_ok($$select public.submit_service_work('50000000-0000-4000-8000-000000000001',5,'70000000-0000-4000-8000-000000000002','Evidence')$$,
  'Work can be submitted after the pending proposal is resolved');
reset role;

select * from finish();
rollback;
