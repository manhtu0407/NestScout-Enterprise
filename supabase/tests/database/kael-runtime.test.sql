begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated');
insert into public.worker_access_grants (user_id) values ('00000000-0000-4000-8000-0000000000c3');
insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active)
  values ('00000000-0000-4000-8000-0000000000c3', 'local_fixture', true);

select ok(not has_function_privilege('anon', 'public.kael_start_run(uuid,uuid,text,text)', 'execute'), 'Anonymous role cannot start Kael runs');
select ok(not has_table_privilege('anon', 'public.kael_messages', 'select'), 'Anonymous role cannot read Kael messages');
select ok(not has_table_privilege('authenticated', 'public.kael_tasks', 'insert'), 'Clients cannot insert tasks directly');
select ok(not has_table_privilege('authenticated', 'public.kael_tasks', 'update'), 'Clients cannot update tasks directly');
select ok(not has_table_privilege('authenticated', 'nestscout_private.kael_approvals', 'select'), 'Approvals are not client-readable');
select ok(not has_table_privilege('authenticated', 'nestscout_private.kael_tool_executions', 'select'), 'Tool execution audit is not client-readable');
select ok(not has_function_privilege('authenticated', 'nestscout_private.kael_task_transition_allowed(text,text)', 'execute'), 'Transition helper is internal');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$ select public.kael_start_run('20000000-0000-4000-8000-000000000001', null, 'client', 'Xin chào') $$,
  '42501', 'authentication required', 'Anonymous sessions cannot start runs');
select is(public.kael_actor_capabilities(), '{"customer":false,"worker":false}'::jsonb, 'Anonymous sessions have no Kael capability');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is(public.kael_actor_capabilities(), '{"customer":true,"worker":false}'::jsonb, 'Customer has no worker capability');
select set_config('test.start', public.kael_start_run('20000000-0000-4000-8000-000000000001', null, 'client', 'Xin chào')::text, true);
select is(current_setting('test.start')::jsonb ->> 'status', 'started', 'A run starts and creates a conversation');
select set_config('test.run', current_setting('test.start')::jsonb ->> 'run_id', true);
select set_config('test.conversation', current_setting('test.start')::jsonb ->> 'conversation_id', true);

select is(public.kael_start_run('20000000-0000-4000-8000-000000000001', null, 'client', 'Xin chào') ->> 'run_id',
  current_setting('test.run'), 'Retrying the same request id replays the same run');
select is((select count(*)::integer from public.kael_messages), 1, 'A replay does not duplicate the user message');
select is(public.kael_start_run('20000000-0000-4000-8000-000000000002', current_setting('test.conversation')::uuid, 'client', 'Thêm') ->> 'status',
  'busy', 'A conversation runs one turn at a time');
select is(public.kael_start_run('20000000-0000-4000-8000-000000000003', current_setting('test.conversation')::uuid, 'worker', 'Thêm') ->> 'status',
  'invalid', 'A client conversation cannot be continued in worker mode');
select is(public.kael_start_run('20000000-0000-4000-8000-000000000004', null, 'client', '   ') ->> 'status', 'invalid', 'Blank input is rejected');

select set_config('test.task', public.kael_save_task(null, current_setting('test.conversation')::uuid, current_setting('test.run')::uuid, null,
  'Sửa máy lạnh rò nước', 'service_request', 'running', '', '{"effect_result":{"status":"succeeded","resource_id":"x"}}'::jsonb, 'created')::text, true);
select is(current_setting('test.task')::jsonb ->> 'status', 'ok', 'A task is created inside a running run');
select set_config('test.task_id', current_setting('test.task')::jsonb #>> '{task,id}', true);
select is(current_setting('test.task')::jsonb #> '{task,artifact}', '{"effect_required":true}'::jsonb,
  'A forged effect result is stripped and service tasks require an observed effect');
select is(public.kael_save_task(current_setting('test.task_id')::uuid, null, current_setting('test.run')::uuid, 1,
  'Sửa máy lạnh rò nước', 'service_request', 'completed', '', '{}'::jsonb, 'status_completed') ->> 'status',
  'invalid_transition', 'A service task cannot be marked completed without an observed effect');
select is(public.kael_save_task(current_setting('test.task_id')::uuid, null, current_setting('test.run')::uuid, 7,
  'Sửa máy lạnh rò nước', 'service_request', 'paused', '', '{}'::jsonb, 'status_paused') ->> 'status',
  'conflict', 'A stale version is rejected');
select is(public.kael_save_task(current_setting('test.task_id')::uuid, null, current_setting('test.run')::uuid, 1,
  'Sửa máy lạnh rò nước', 'service_request', 'waiting_for_approval', '', '{}'::jsonb, 'forged') ->> 'status',
  'invalid_transition', 'Only the approval operation can request approval');
select is(public.kael_save_task(current_setting('test.task_id')::uuid, null, current_setting('test.run')::uuid, 1,
  'Sửa máy lạnh rò nước', 'service_request', 'running', 'Bản nháp đã đủ',
  '{"draft":{"description":"Máy lạnh rò nước","location":"Quận 3","preferred_time":"Sáng mai","missing":[]}}'::jsonb, 'draft_prepared') #>> '{task,version}',
  '2', 'Preparing a draft advances the task version');

select is(public.kael_request_approval(current_setting('test.run')::uuid, current_setting('test.task_id')::uuid, 2, 'service_request_submit',
  '{"task_id":"x","description":"Khác","location":"Quận 3","preferred_time":"Sáng mai"}'::jsonb, repeat('a', 64), 'Gửi yêu cầu dịch vụ', 600) ->> 'status',
  'invalid', 'Approval arguments must match the stored draft');
select is(public.kael_request_approval(current_setting('test.run')::uuid, current_setting('test.task_id')::uuid, 1, 'service_request_submit',
  jsonb_build_object('task_id', current_setting('test.task_id'), 'description', 'Máy lạnh rò nước', 'location', 'Quận 3', 'preferred_time', 'Sáng mai'),
  repeat('a', 64), 'Gửi yêu cầu dịch vụ', 600) ->> 'status', 'stale', 'Approval requests are bound to the current task version');
select set_config('test.approval', public.kael_request_approval(current_setting('test.run')::uuid, current_setting('test.task_id')::uuid, 2, 'service_request_submit',
  jsonb_build_object('task_id', current_setting('test.task_id'), 'description', 'Máy lạnh rò nước', 'location', 'Quận 3', 'preferred_time', 'Sáng mai'),
  repeat('a', 64), 'Gửi yêu cầu dịch vụ', 600)::text, true);
select is(current_setting('test.approval')::jsonb #>> '{task,status}', 'waiting_for_approval', 'Requesting approval pauses the task for the user');
select set_config('test.approval_id', current_setting('test.approval')::jsonb ->> 'approval_id', true);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is(public.kael_consume_approval(current_setting('test.approval_id')::uuid, repeat('a', 64)) ->> 'status', 'invalid', 'Another account cannot use the approval');
select is(public.kael_reject_approval(current_setting('test.approval_id')::uuid), null, 'Another account cannot reject the approval');
select is((select count(*)::integer from public.kael_tasks), 0, 'Another account cannot read tasks');
select is((select count(*)::integer from public.kael_messages), 0, 'Another account cannot read messages');
select is(public.kael_context_tasks(current_setting('test.conversation')::uuid, 'client'), '[]'::jsonb, 'Context for another account excludes foreign tasks');
select is(public.kael_start_run('20000000-0000-4000-8000-000000000010', current_setting('test.conversation')::uuid, 'client', 'Chen vào') ->> 'status',
  'invalid', 'Another account cannot post into the conversation');
select is(public.kael_save_task(current_setting('test.task_id')::uuid, null, current_setting('test.run')::uuid, 3,
  'x', 'general', 'cancelled', '', '{}'::jsonb, 'forged') ->> 'status', 'not_found', 'Another account cannot change the task');
select is(public.kael_finish_run(current_setting('test.run')::uuid, 'completed', 'giả mạo', true, null, null, 0, 0, 0, null), false,
  'Another account cannot finish the run');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is(public.kael_consume_approval(current_setting('test.approval_id')::uuid, repeat('b', 64)) ->> 'status', 'mismatch', 'A different fingerprint is rejected');
select is(public.kael_consume_approval(current_setting('test.approval_id')::uuid, repeat('a', 64)) ->> 'status', 'ok', 'The owner consumes the exact approval');
select is(public.kael_consume_approval(current_setting('test.approval_id')::uuid, repeat('a', 64)) ->> 'status', 'reconcile',
  'A replay before the outcome is recorded only allows idempotent reconciliation');
select set_config('test.request', public.submit_service_request(current_setting('test.approval_id')::uuid, 'Máy lạnh rò nước', 'Quận 3')::text, true);
select is(public.submit_service_request(current_setting('test.approval_id')::uuid, 'Máy lạnh rò nước', 'Quận 3')::text, current_setting('test.request'),
  'Re-executing with the approval id as submission key does not duplicate the request');
select is(public.kael_complete_approval(current_setting('test.approval_id')::uuid, 'succeeded', '{"resource_id":"99999999-0000-4000-8000-000000000001"}'::jsonb) ->> 'status',
  'paused', 'An unverifiable success is recorded as uncertain');
select is(public.kael_consume_approval(current_setting('test.approval_id')::uuid, repeat('a', 64)) ->> 'status', 'reconcile', 'An uncertain outcome can be reconciled');
select is(public.kael_complete_approval(current_setting('test.approval_id')::uuid, 'succeeded', jsonb_build_object('resource_id', current_setting('test.request'))) ->> 'status',
  'completed', 'A verified submission completes the task');
select is((select artifact #>> '{effect_result,resource_id}' from public.kael_tasks where id = current_setting('test.task_id')::uuid), current_setting('test.request'),
  'The task links to the authoritative request');
select is(public.kael_consume_approval(current_setting('test.approval_id')::uuid, repeat('a', 64)) ->> 'status', 'consumed', 'A completed approval is never executed again');
select is((select count(*)::integer from public.service_requests), 1, 'Exactly one business request exists');

select set_config('test.task2', public.kael_save_task(null, current_setting('test.conversation')::uuid, current_setting('test.run')::uuid, null,
  'Sửa vòi nước', 'service_request', 'running', '',
  '{"draft":{"description":"Vòi rò","location":"Quận 1","preferred_time":"","missing":[]}}'::jsonb, 'created') #>> '{task,id}', true);
select set_config('test.approval2', public.kael_request_approval(current_setting('test.run')::uuid, current_setting('test.task2')::uuid, 1, 'service_request_submit',
  jsonb_build_object('task_id', current_setting('test.task2'), 'description', 'Vòi rò', 'location', 'Quận 1', 'preferred_time', ''),
  repeat('c', 64), 'Gửi yêu cầu dịch vụ', 600) ->> 'approval_id', true);
select is(public.kael_reject_approval(current_setting('test.approval2')::uuid) ->> 'status', 'waiting_for_input', 'Rejecting keeps the draft for later input');
select is(public.kael_consume_approval(current_setting('test.approval2')::uuid, repeat('c', 64)) ->> 'status', 'rejected', 'A rejected approval cannot be used');
select set_config('test.approval3', public.kael_request_approval(current_setting('test.run')::uuid, current_setting('test.task2')::uuid, 3, 'service_request_submit',
  jsonb_build_object('task_id', current_setting('test.task2'), 'description', 'Vòi rò', 'location', 'Quận 1', 'preferred_time', ''),
  repeat('d', 64), 'Gửi yêu cầu dịch vụ', 600) ->> 'approval_id', true);
reset role;
update nestscout_private.kael_approvals set expires_at = clock_timestamp() - interval '1 second' where id = current_setting('test.approval3')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is(public.kael_consume_approval(current_setting('test.approval3')::uuid, repeat('d', 64)) ->> 'status', 'expired', 'An expired approval is rejected');
select is((select count(*)::integer from public.service_requests), 1, 'Rejected and expired approvals create no business request');

select ok(public.kael_finish_run(current_setting('test.run')::uuid, 'completed', 'Chào bạn!', true, 'anthropic', 'model-under-test', 10, 5, 1, null),
  'The owner finishes the run once');
select ok(not public.kael_finish_run(current_setting('test.run')::uuid, 'completed', 'Lần hai', true, null, null, 0, 0, 0, null), 'A run cannot be finished twice');
select results_eq($$ select role, seq from public.kael_messages order by seq $$, $$ values ('user'::text, 1), ('assistant'::text, 2) $$,
  'Messages keep their order');
select is(public.kael_start_run('20000000-0000-4000-8000-000000000001', null, 'client', 'Xin chào') ->> 'assistant_text', 'Chào bạn!',
  'A replay after completion returns the stored answer without a new run');
select is(jsonb_array_length(public.kael_context_tasks(current_setting('test.conversation')::uuid, 'client')), 2, 'Context lists the owner''s open and recent tasks');
select is(jsonb_array_length(public.kael_context_tasks(current_setting('test.conversation')::uuid, 'worker')), 0, 'Worker context excludes client tasks');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
select is(public.kael_actor_capabilities(), '{"customer":true,"worker":true}'::jsonb, 'An eligible worker has worker capability');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select public.kael_start_run(gen_random_uuid(), null, 'client', 'Lặp ' || n) from generate_series(1, 12) as n;
select is(public.kael_start_run(gen_random_uuid(), null, 'client', 'Quá giới hạn') ->> 'status', 'rate_limited', 'Run budget fails closed');
reset role;

select is((select count(*)::integer from nestscout_private.kael_approvals where owner_id = '00000000-0000-4000-8000-0000000000b2'), 0,
  'Foreign attempts created no approvals');

select * from finish();
rollback;
