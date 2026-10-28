begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated');

set local role anon;
select throws_ok($$insert into public.service_requests (submission_key, description) values (gen_random_uuid(), 'Need help')$$,
  '42501', null, 'An unauthenticated client cannot insert a request');
select throws_ok($$select public.submit_service_request(gen_random_uuid(), 'Need help')$$,
  '42501', null, 'An unauthenticated client cannot call the request command');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$insert into public.service_requests (submission_key, description) values (gen_random_uuid(), 'Need help')$$,
  '42501', null, 'A guest session cannot insert a request directly');
select throws_ok($$select public.submit_service_request(gen_random_uuid(), 'Need help')$$,
  '42501', 'authentication required', 'A guest session cannot call the request command');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok(format($$insert into public.service_requests (submission_key, description) values (gen_random_uuid(), %L)$$, repeat('x', 4001)),
  '23514', null, 'A direct insert enforces the description length limit');
select throws_ok(format($$select public.submit_service_request(gen_random_uuid(), %L)$$, repeat('x', 4001)),
  '22023', 'invalid request', 'The command enforces the same description length limit');
select throws_ok($$insert into public.service_requests (submission_key, description) values (gen_random_uuid(), '   ')$$,
  '23514', null, 'A direct insert refuses a blank description');
select throws_ok($$select public.submit_service_request(gen_random_uuid(), '   ')$$,
  '22023', 'invalid request', 'The command refuses a blank description');
select throws_ok($$insert into public.service_requests (submission_key, description) values (gen_random_uuid(), ' padded ')$$,
  '23514', null, 'A direct insert refuses an untrimmed description');
select lives_ok($$select public.submit_service_request('10000000-0000-4000-8000-000000000001', ' padded ')$$,
  'The command trims the description before storing it');
select is((select description from public.service_requests where submission_key = '10000000-0000-4000-8000-000000000001'), 'padded',
  'The stored description is trimmed');
select lives_ok($$insert into public.service_requests (submission_key, description) values ('10000000-0000-4000-8000-000000000002', 'Direct request')$$,
  'A direct insert of valid input is accepted for the caller');
select throws_ok($$insert into public.service_requests (submission_key, description) values ('10000000-0000-4000-8000-000000000002', 'Direct request')$$,
  '23505', null, 'A direct insert cannot replay a key');
select is(public.submit_service_request('10000000-0000-4000-8000-000000000001', 'padded'),
  (select id from public.service_requests where submission_key = '10000000-0000-4000-8000-000000000001'),
  'The command replays a key with the original request');
select throws_ok($$insert into public.service_requests (id, submission_key, description) values (gen_random_uuid(), gen_random_uuid(), 'Need help')$$,
  '42501', null, 'A direct insert cannot choose the request identifier');
select throws_ok($$insert into public.service_requests (created_at, submission_key, description) values ('2000-01-01', gen_random_uuid(), 'Need help')$$,
  '42501', null, 'A direct insert cannot choose the creation time');
select throws_ok($$insert into public.service_requests (owner_id, submission_key, description)
  values ('00000000-0000-4000-8000-0000000000a2', gen_random_uuid(), 'Need help')$$,
  '42501', null, 'A direct insert cannot name another owner');
select is((select count(*)::integer from public.service_requests where owner_id = '00000000-0000-4000-8000-0000000000a1'), 2,
  'Both paths produce requests owned by the caller');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
select lives_ok($$select public.submit_service_request('10000000-0000-4000-8000-000000000001', 'Other Customer request')$$,
  'Another Customer may use the same key value for their own request');
select is((select count(*)::integer from public.service_requests), 1, 'A Customer reads only their own requests');
reset role;

select * from finish();
rollback;
