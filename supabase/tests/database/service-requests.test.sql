begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated');

select ok((select relrowsecurity from pg_class where oid = 'public.service_requests'::regclass),
  'Requests use row security');
select ok(not has_table_privilege('authenticated', 'public.service_requests', 'update')
  and not has_table_privilege('authenticated', 'public.service_requests', 'delete'),
  'Authenticated users cannot change or delete requests directly');
select ok(not has_function_privilege('anon', 'public.submit_service_request(uuid,text)', 'execute'),
  'Anonymous role cannot submit');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select lives_ok($$select public.submit_service_request('10000000-0000-4000-8000-000000000001', 'Need help')$$,
  'Owner submits a request');
select lives_ok($$select public.submit_service_request('10000000-0000-4000-8000-000000000001', 'Need help')$$,
  'Identical submission can be retried');
select is((select count(*)::integer from public.service_requests), 1,
  'Retry creates one request');
select throws_ok($$select public.submit_service_request('10000000-0000-4000-8000-000000000001', 'Different')$$,
  '22023', 'submission key conflict', 'A key cannot be reused for different content');
select throws_ok($$select public.submit_service_request('10000000-0000-4000-8000-000000000002', '   ')$$,
  '22023', 'invalid request', 'Blank input is rejected');
select throws_ok($$insert into public.service_requests (owner_id, submission_key, description)
  values ('00000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-000000000004', 'Forged')$$,
  '42501', null, 'A caller cannot supply a different owner');
select throws_ok($$insert into public.service_requests (submission_key, description)
  values ('10000000-0000-4000-8000-000000000005', '   ')$$,
  '23514', null, 'Direct insertion cannot bypass payload checks');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is_empty($$select 1 from public.service_requests$$, 'Another customer cannot read the request');
select throws_ok($$update public.service_requests set description = 'Changed'$$,
  '42501', null, 'Another customer cannot write directly');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select public.submit_service_request('10000000-0000-4000-8000-000000000003', 'Need help')$$,
  '42501', 'authentication required', 'Anonymous sign-in cannot submit');
reset role;

select * from finish();
rollback;
