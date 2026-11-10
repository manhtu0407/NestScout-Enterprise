begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated');
insert into public.service_requests (id, owner_id, submission_key, description) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-000000000001', 'Fixture request'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-000000000002', 'Expired fixture');
insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'Fixture old terms', 100, 'VND', now() + interval '1 day'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 2, 'Fixture current terms', 200, 'VND', now() + interval '1 day'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 1, 'Fixture expired terms', 100, 'VND', now() - interval '1 day');

select ok((select relrowsecurity from pg_class where oid = 'public.service_quotes'::regclass), 'Quotes use row security');
select ok(not has_table_privilege('authenticated', 'public.service_quotes', 'insert')
  and not has_table_privilege('authenticated', 'public.service_quotes', 'update')
  and not has_table_privilege('authenticated', 'public.service_quotes', 'delete'), 'Clients cannot manufacture or edit quote terms');
select ok(not has_function_privilege('anon', 'public.accept_service_quote(uuid,integer)', 'execute'), 'Anonymous role cannot accept');
select ok(not has_function_privilege('anon', 'nestscout_private.accept_service_quote(uuid,integer)', 'execute'),
  'Anonymous role cannot call the private acceptance function');
select ok((select prosecdef and proconfig @> array['search_path=""']
  from pg_proc where oid = 'nestscout_private.accept_service_quote(uuid,integer)'::regprocedure),
  'Private acceptance uses a constrained search path');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is_empty($$select 1 from public.service_quotes$$, 'Another customer cannot see the quotes');
select throws_ok($$select public.accept_service_quote('30000000-0000-4000-8000-000000000002', 2)$$,
  '42501', 'quote unavailable', 'Another customer cannot accept');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select public.accept_service_quote('30000000-0000-4000-8000-000000000001', 1)$$,
  '40001', 'stale quote', 'Superseded terms cannot be accepted');
select throws_ok($$select public.accept_service_quote('30000000-0000-4000-8000-000000000002', 1)$$,
  '40001', 'stale quote', 'Wrong expected version cannot be accepted');
select throws_ok($$select public.accept_service_quote('30000000-0000-4000-8000-000000000003', 1)$$,
  '22023', 'quote expired', 'Expired terms cannot be accepted');
select lives_ok($$select public.accept_service_quote('30000000-0000-4000-8000-000000000002', 2)$$,
  'Owner explicitly accepts current terms');
select lives_ok($$select public.accept_service_quote('30000000-0000-4000-8000-000000000002', 2)$$,
  'A replay returns the existing acceptance');
select is((select count(*)::integer from public.service_quotes where accepted_at is not null), 1,
  'Exactly one quote is accepted');
select is((select accepted_by::text from public.service_quotes where id = '30000000-0000-4000-8000-000000000002'),
  '00000000-0000-4000-8000-0000000000a1', 'Acceptance records the authenticated owner');
select throws_ok($$update public.service_quotes set scope = 'Altered'$$, '42501', null, 'Clients cannot change accepted terms');
reset role;

select * from finish();
rollback;
