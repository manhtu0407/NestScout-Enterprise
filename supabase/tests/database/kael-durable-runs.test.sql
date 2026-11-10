begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated');

select is_empty($$
  select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'nestscout_private') and p.proname like 'kael\_durable\_%'
    and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
$$, 'No client role can execute a durable run operation');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'kael\_durable\_%' and has_function_privilege('service_role', p.oid, 'execute')), 10,
  'The trusted server role reaches each durable run operation');
select ok(not has_table_privilege('authenticated', 'nestscout_private.kael_durable_runs', 'select'), 'Durable run bookkeeping is not client-readable');
select ok(not has_function_privilege('authenticated', 'nestscout_private.kael_lease_ok(uuid)', 'execute'), 'The lease check is internal');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select isnt(public.set_consent('ai_sharing', true, '2026-11-09'), null, 'The actor records AI sharing consent');
select throws_ok($$ select public.kael_durable_start_run('00000000-0000-4000-8000-0000000000a1', gen_random_uuid(), null, 'client', 'Xin chào', 'holder-a', 60) $$,
  '42501', null, 'A signed-in client cannot admit a durable run');
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(public.kael_durable_start_run('00000000-0000-4000-8000-0000000000b2', '30000000-0000-4000-8000-000000000001', null, 'client', 'Xin chào', 'holder-a', 60) ->> 'status',
  'consent_required', 'Durable admission keeps the consent gate');
select is(public.kael_durable_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000001', null, 'client', 'Xin chào', 'bad holder', 60) ->> 'status',
  'invalid', 'A malformed holder is refused');
select is(public.kael_durable_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000001', null, 'client', 'Xin chào', 'holder-a', 5) ->> 'status',
  'invalid', 'A lease shorter than ten seconds is refused');

select set_config('test.admit', public.kael_durable_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000001', null, 'client', 'Xin chào', 'holder-a', 60)::text, true);
select is(current_setting('test.admit')::jsonb ->> 'status', 'started', 'A durable run is admitted');
select is(current_setting('test.admit')::jsonb ->> 'runtime', 'durable', 'Admission reports the durable runtime');
select is((current_setting('test.admit')::jsonb ->> 'epoch')::bigint, 1::bigint, 'The first lease has epoch one');
select set_config('test.run', current_setting('test.admit')::jsonb ->> 'run_id', true);
reset role;
select is((select count(*)::integer from nestscout_private.kael_durable_runs where run_id = current_setting('test.run')::uuid and owner_id = '00000000-0000-4000-8000-0000000000a1'
  and journal_state = 'live' and holder = 'holder-a'), 1, 'Admission and lease are recorded with the run in one transaction');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(public.kael_durable_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000001', null, 'client', 'Xin chào', 'holder-b', 60) ->> 'status',
  'replay', 'The same request replays instead of duplicating the run');
select is(public.kael_durable_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000001', null, 'client', 'Xin chào', 'holder-b', 60) ->> 'runtime',
  'durable', 'A replay reports the durable runtime');
select is(public.kael_durable_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000001', null, 'client', 'Xin chào', 'holder-b', 60) -> 'lease_live',
  'true'::jsonb, 'A replay reports a live lease');
select is((select count(*)::integer from public.kael_runs where request_id = '30000000-0000-4000-8000-000000000001'), 1, 'One run exists for the request');
select is(public.kael_durable_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000002',
  (current_setting('test.admit')::jsonb ->> 'conversation_id')::uuid, 'client', 'Another', 'holder-a', 60) ->> 'status', 'busy',
  'A second durable run on the conversation is refused while the first is active');

select is(public.kael_durable_claim('00000000-0000-4000-8000-0000000000a1', current_setting('test.run')::uuid, 'holder-b', 60) ->> 'status', 'held',
  'A live lease cannot be taken by another holder');
select is(public.kael_durable_claim('00000000-0000-4000-8000-0000000000b2', current_setting('test.run')::uuid, 'holder-b', 60) ->> 'status', 'gone',
  'Another owner cannot claim the run');
select is(public.kael_durable_claim('00000000-0000-4000-8000-0000000000a1', current_setting('test.run')::uuid, 'holder-a', 60) ->> 'epoch', '1',
  'The holder renews its own live lease without a new epoch');
select is(public.kael_durable_heartbeat('00000000-0000-4000-8000-0000000000a1', current_setting('test.run')::uuid, 'holder-a', 1, 60), true,
  'The holder extends its lease');
select is(public.kael_durable_heartbeat('00000000-0000-4000-8000-0000000000a1', current_setting('test.run')::uuid, 'holder-a', 2, 60), false,
  'A heartbeat with the wrong epoch is refused');
select is(public.kael_durable_heartbeat('00000000-0000-4000-8000-0000000000a1', current_setting('test.run')::uuid, 'holder-b', 1, 60), false,
  'A heartbeat from another holder is refused');

select throws_ok($$ select public.kael_record_tool('00000000-0000-4000-8000-0000000000a1', current_setting('test.run')::uuid, 'call-1', null, 'task_create', 'internal', 'succeeded', repeat('a', 64), null) $$,
  '42501', 'run lease not held', 'A durable run write without a lease token is refused');
select set_config('request.headers', '{"x-kael-lease":"holder-b:1"}', true);
select throws_ok($$ select public.kael_record_tool('00000000-0000-4000-8000-0000000000a1', current_setting('test.run')::uuid, 'call-1', null, 'task_create', 'internal', 'succeeded', repeat('a', 64), null) $$,
  '42501', 'run lease not held', 'A write under another holder token is refused');
select set_config('request.headers', '{"x-kael-lease":"holder-a:1"}', true);
select is(public.kael_record_tool('00000000-0000-4000-8000-0000000000a1', current_setting('test.run')::uuid, 'call-1', null, 'task_create', 'internal', 'succeeded', repeat('a', 64), null), true,
  'The lease holder records a tool execution');
select is(public.kael_record_tool('00000000-0000-4000-8000-0000000000a1', current_setting('test.run')::uuid, 'call-1', null, 'task_create', 'internal', 'succeeded', repeat('a', 64), null), false,
  'A repeated call id is idempotent');
select is(public.kael_save_task('00000000-0000-4000-8000-0000000000a1', null, (current_setting('test.admit')::jsonb ->> 'conversation_id')::uuid, current_setting('test.run')::uuid,
  null, 'Việc', 'general', 'running', '', '{}'::jsonb, 'task_created') ->> 'status', 'ok', 'Task writes work for the lease holder');

reset role;
update nestscout_private.kael_durable_runs set lease_expires_at = clock_timestamp() - interval '1 second' where run_id = current_setting('test.run')::uuid;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(public.kael_durable_heartbeat('00000000-0000-4000-8000-0000000000a1', current_setting('test.run')::uuid, 'holder-a', 1, 60), true,
  'An unclaimed expired lease can still be renewed by its holder');
reset role;
update nestscout_private.kael_durable_runs set lease_expires_at = clock_timestamp() - interval '1 second' where run_id = current_setting('test.run')::uuid;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(public.kael_durable_claim('00000000-0000-4000-8000-0000000000a1', current_setting('test.run')::uuid, 'holder-b', 60) -> 'epoch', '2'::jsonb,
  'An expired lease is taken over with a new epoch');
select set_config('request.headers', '{"x-kael-lease":"holder-a:1"}', true);
select throws_ok($$ select public.kael_record_tool('00000000-0000-4000-8000-0000000000a1', current_setting('test.run')::uuid, 'call-2', null, 'task_create', 'internal', 'succeeded', repeat('b', 64), null) $$,
  '42501', 'run lease not held', 'The previous holder is fenced out after takeover');
select throws_ok($$ select public.kael_finish_run('00000000-0000-4000-8000-0000000000a1', current_setting('test.run')::uuid, 'completed', 'Muộn', true, null, null, 0, 0, 0, null) $$,
  '42501', 'run lease not held', 'The previous holder cannot finish the run');
select throws_ok($$ select public.kael_save_task('00000000-0000-4000-8000-0000000000a1', null, (current_setting('test.admit')::jsonb ->> 'conversation_id')::uuid, current_setting('test.run')::uuid,
  null, 'Muộn', 'general', 'running', '', '{}'::jsonb, 'task_created') $$,
  '42501', 'run lease not held', 'The previous holder cannot write tasks');
select throws_ok($$ select public.kael_request_approval('00000000-0000-4000-8000-0000000000a1', current_setting('test.run')::uuid, gen_random_uuid(), 1, 'service_request_submit',
  '{}'::jsonb, repeat('a', 64), 'Gửi', '{}'::jsonb, 600) $$, '42501', 'run lease not held', 'The previous holder cannot request approvals');

select set_config('request.headers', '{"x-kael-lease":"holder-b:2"}', true);
select is(public.kael_record_tool('00000000-0000-4000-8000-0000000000a1', current_setting('test.run')::uuid, 'call-2', null, 'task_create', 'internal', 'succeeded', repeat('b', 64), null), true,
  'The new holder writes under its own epoch');

reset role;
update nestscout_private.kael_durable_runs set lease_expires_at = clock_timestamp() - interval '1 second' where run_id = current_setting('test.run')::uuid;
update public.kael_runs set started_at = clock_timestamp() - interval '10 minutes' where id = current_setting('test.run')::uuid;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.headers', '{}', true);

select is((select jsonb_array_length(public.kael_durable_claim_next('holder-c', 60, 5))), 1, 'A reconciler claims an orphaned durable run');
reset role;
select is((select epoch from nestscout_private.kael_durable_runs where run_id = current_setting('test.run')::uuid), 3::bigint, 'The reconciler claim bumps the epoch');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select jsonb_array_length(public.kael_durable_claim_next('holder-c', 60, 5))), 0, 'A live lease is not claimed twice');
select is(public.kael_durable_expire(interval '30 minutes'), 0, 'A young durable run is not expired');
select is(public.kael_durable_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000003', null, 'client', 'Cuộc khác', 'holder-a', 60) ->> 'status',
  'started', 'The legacy three-minute sweep does not interrupt a durable run');
select is((select status from public.kael_runs where id = current_setting('test.run')::uuid), 'running', 'The leased durable run is still running after ten minutes');

select set_config('request.headers', '{"x-kael-lease":"holder-c:3"}', true);
select is(public.kael_finish_run('00000000-0000-4000-8000-0000000000a1', current_setting('test.run')::uuid, 'completed', 'Xong', true, null, null, 1, 1, 1, null), true,
  'The current holder finishes a run that is older than the legacy window');
select is((select content from public.kael_messages where run_id = current_setting('test.run')::uuid and role = 'assistant'), 'Xong', 'The assistant message is persisted in PostgreSQL');
select set_config('request.headers', '{}', true);

select is(public.kael_durable_known(array[current_setting('test.run')::uuid, gen_random_uuid()]) -> 0 ->> 'run_status', 'completed', 'The reconciler can look up known runs');
select is(jsonb_array_length(public.kael_durable_known(array[current_setting('test.run')::uuid, gen_random_uuid()])), 1, 'Unknown ids are absent so their files can be removed');
select is(jsonb_array_length(public.kael_durable_purge_queue(10)), 1, 'A finished run queues its journal for purge');
select is(public.kael_durable_mark_purged(current_setting('test.run')::uuid), true, 'The journal purge is recorded');
select is(public.kael_durable_mark_purged(current_setting('test.run')::uuid), false, 'A purge is recorded once');
select is(jsonb_array_length(public.kael_durable_purge_queue(10)), 0, 'A purged journal leaves the queue');

select set_config('test.second', public.kael_durable_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000004', null, 'client', 'Lần hai', 'holder-a', 60)::text, true);
select is(public.kael_durable_mark_purged((current_setting('test.second')::jsonb ->> 'run_id')::uuid), false, 'A running journal cannot be marked purged');
select is(public.kael_durable_erasure_pending('00000000-0000-4000-8000-0000000000a1'), 2, 'Erasure sees both live journals');
reset role;
select nestscout_private.erase_account_data('00000000-0000-4000-8000-0000000000a1');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select status from public.kael_runs where id = (current_setting('test.second')::jsonb ->> 'run_id')::uuid), 'interrupted', 'Erasure stops a running run');
select is(jsonb_array_length(public.kael_durable_purge_queue(10)), 2, 'Erasure queues every journal for purge');
select is(public.kael_durable_erasure_pending('00000000-0000-4000-8000-0000000000a1'), 2, 'Erasure is not complete until the journals are purged');
select is(public.kael_durable_mark_purged((current_setting('test.second')::jsonb ->> 'run_id')::uuid), true, 'The journal purge after erasure is recorded');
select is(public.kael_durable_erasure_pending('00000000-0000-4000-8000-0000000000a1'), 1, 'Erasure verification reports the remaining journal');
select is(public.kael_durable_mark_purged((select id from public.kael_runs where request_id = '30000000-0000-4000-8000-000000000003')), true, 'The last journal purge is recorded');
select is(public.kael_durable_erasure_pending('00000000-0000-4000-8000-0000000000a1'), 0, 'Erasure verification reports no remaining journal');
select is((select count(*)::integer from public.kael_messages where owner_id = '00000000-0000-4000-8000-0000000000a1'), 0, 'Erasure removed the conversation text');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select throws_ok($$ select public.kael_durable_purge_queue(10) $$, '42501', null, 'A client cannot read the purge queue');
reset role;

select * from finish();
rollback;
