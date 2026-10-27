begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated');
insert into public.worker_access_grants (user_id, status, revoked_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'active', null),
  ('00000000-0000-4000-8000-0000000000b2', 'revoked', now());

select has_table('public', 'worker_access_grants', 'Worker access grant table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.worker_access_grants'::regclass),
  'Row level security is enabled on worker access grants');
select ok(not has_table_privilege('anon', 'public.worker_access_grants', 'select'),
  'anon holds no table privilege');
select ok(not has_table_privilege('authenticated', 'public.worker_access_grants', 'insert')
  and not has_table_privilege('authenticated', 'public.worker_access_grants', 'update')
  and not has_table_privilege('authenticated', 'public.worker_access_grants', 'delete'),
  'authenticated holds no write privilege');

select throws_ok($$insert into public.worker_access_grants (user_id, status, revoked_at)
  values ('00000000-0000-4000-8000-0000000000c3', 'revoked', null)$$, '23514',
  null, 'A revoked grant requires its revocation time');
select throws_ok($$insert into public.worker_access_grants (user_id, status, revoked_at)
  values ('00000000-0000-4000-8000-0000000000c3', 'active', now())$$, '23514',
  null, 'An active grant cannot carry a revocation time');
select throws_ok($$insert into public.worker_access_grants (user_id, status)
  values ('00000000-0000-4000-8000-0000000000c3', 'pending')$$, '23514',
  null, 'Only active and revoked statuses exist');

set local role anon;
select throws_ok($$select * from public.worker_access_grants$$, '42501',
  null, 'anon cannot read grants');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select results_eq($$select user_id::text, status from public.worker_access_grants$$,
  $$values ('00000000-0000-4000-8000-0000000000a1', 'active')$$,
  'An account with an active grant reads exactly its own row');
select is_empty($$select 1 from public.worker_access_grants
  where user_id = '00000000-0000-4000-8000-0000000000b2'$$,
  'An account cannot read another account''s grant');
select throws_ok($$insert into public.worker_access_grants (user_id)
  values ('00000000-0000-4000-8000-0000000000c3')$$, '42501',
  null, 'An account cannot grant Worker access to another account');
select throws_ok($$update public.worker_access_grants set status = 'active', revoked_at = null
  where user_id = '00000000-0000-4000-8000-0000000000a1'$$, '42501',
  null, 'An account cannot rewrite its own grant');
select throws_ok($$delete from public.worker_access_grants$$, '42501',
  null, 'An account cannot delete grants');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select results_eq($$select status from public.worker_access_grants$$, $$values ('revoked')$$,
  'A revoked grant stays visible to its owner as revoked');
select is_empty($$select 1 from public.worker_access_grants where status = 'active'$$,
  'A revoked account sees no active grant');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
select is_empty($$select 1 from public.worker_access_grants$$,
  'An account without a grant reads no rows');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is_empty($$select 1 from public.worker_access_grants$$,
  'A token without a subject reads no rows');
reset role;

set local role service_role;
select lives_ok($$insert into public.worker_access_grants (user_id)
  values ('00000000-0000-4000-8000-0000000000c3')$$,
  'The trusted backend role can provision a grant');
select lives_ok($$update public.worker_access_grants set status = 'revoked', revoked_at = now()
  where user_id = '00000000-0000-4000-8000-0000000000c3'$$,
  'The trusted backend role can revoke a grant');
reset role;

delete from auth.users where id = '00000000-0000-4000-8000-0000000000a1';
select is_empty($$select 1 from public.worker_access_grants
  where user_id = '00000000-0000-4000-8000-0000000000a1'$$,
  'Deleting an account removes its grant');

select * from finish();
rollback;
