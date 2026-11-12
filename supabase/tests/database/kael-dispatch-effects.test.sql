begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-00000000a4c1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a4c2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a4d1', 'authenticated', 'authenticated');
insert into public.worker_access_grants (user_id) values ('00000000-0000-4000-8000-00000000a4d1');
insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active) values ('00000000-0000-4000-8000-00000000a4d1', 'local_fixture', true);
insert into public.worker_public_profiles (worker_id, display_name, trade, area, experience_years, about, skills, service_ids, accepting_jobs) values
  ('00000000-0000-4000-8000-00000000a4d1', 'Thợ điện', 'Thợ điện', 'Quận 7', 5, 'Sửa điện', array['Điện'], array['electric'], false);
insert into public.consent_events (user_id, purpose, granted, policy_version) values
  ('00000000-0000-4000-8000-00000000a4c1', 'ai_sharing', true, '2026-11-09'),
  ('00000000-0000-4000-8000-00000000a4c2', 'ai_sharing', true, '2026-11-09');
update nestscout_private.auto_dispatch_settings set enabled = true, max_invites = 1, max_rounds = 3, retry_cooldown_minutes = 5,
  max_manual_retries = 3, empty_retry_cooldown_seconds = 60, max_invites_per_worker = 2, offer_minutes = 30;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4c1","role":"authenticated"}', true);
select set_config('test.a', public.submit_service_request('34000000-0000-4000-8000-000000000001', 'Mất điện bếp', 'Quận 7', 'electric')::text, true);
select set_config('test.qa', (select id::text from public.service_quotes where request_id = current_setting('test.a')::uuid), true);
select lives_ok($$select public.accept_service_quote(current_setting('test.qa')::uuid, 1)$$, 'The customer accepts while no worker is available');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4c2","role":"authenticated"}', true);
select set_config('test.f', public.submit_service_request('34000000-0000-4000-8000-000000000002', 'Việc của người khác', 'Quận 3', 'electric')::text, true);

reset role;
update public.worker_public_profiles set accepting_jobs = true where worker_id = '00000000-0000-4000-8000-00000000a4d1';
select ok(nestscout_private.kael_effect_target_valid('00000000-0000-4000-8000-00000000a4c1', 'service_request_redispatch',
  jsonb_build_object('request_id', current_setting('test.a'), 'rounds', 1)), 'A retry of an empty search is a valid target');
select ok(not nestscout_private.kael_effect_target_valid('00000000-0000-4000-8000-00000000a4c1', 'service_request_redispatch',
  jsonb_build_object('request_id', current_setting('test.a'), 'rounds', 2)), 'A stale round count is not a valid target');
select ok(not nestscout_private.kael_effect_target_valid('00000000-0000-4000-8000-00000000a4c2', 'service_request_redispatch',
  jsonb_build_object('request_id', current_setting('test.a'), 'rounds', 1)), 'Another account cannot target the request');
select ok(not nestscout_private.kael_effect_target_valid('00000000-0000-4000-8000-00000000a4d1', 'service_request_redispatch',
  jsonb_build_object('request_id', current_setting('test.a'), 'rounds', 1)), 'A worker cannot target the request');
select ok(not nestscout_private.kael_effect_target_valid('00000000-0000-4000-8000-00000000a4c1', 'service_request_cancel',
  jsonb_build_object('request_id', current_setting('test.f'))), 'Another customer request cannot be targeted for cancellation');
select ok(nestscout_private.kael_effect_target_valid('00000000-0000-4000-8000-00000000a4c1', 'service_request_cancel',
  jsonb_build_object('request_id', current_setting('test.a'))), 'The owner request can be targeted for cancellation');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('test.r1', public.kael_start_run('00000000-0000-4000-8000-00000000a4c1', '24000000-0000-4000-8000-000000000001', null, 'client', 'Mời thợ lại giúp tôi')::text, true);
select is(current_setting('test.r1')::jsonb ->> 'status', 'started', 'The customer starts a Kael run');
select set_config('test.task', public.kael_save_task('00000000-0000-4000-8000-00000000a4c1', null, (current_setting('test.r1')::jsonb ->> 'conversation_id')::uuid,
  (current_setting('test.r1')::jsonb ->> 'run_id')::uuid, null, 'Mời thợ lại', 'workflow_action', 'running', '', '{}'::jsonb, 'created')::text, true);
select set_config('test.tid', current_setting('test.task')::jsonb #>> '{task,id}', true);
select is(public.kael_request_approval('00000000-0000-4000-8000-00000000a4c1', (current_setting('test.r1')::jsonb ->> 'run_id')::uuid, current_setting('test.tid')::uuid, 1,
  'service_request_redispatch', jsonb_build_object('task_id', current_setting('test.tid'), 'request_id', current_setting('test.a'), 'rounds', 9),
  repeat('a', 64), 'Mời thợ lại', '{}'::jsonb, 600) ->> 'status', 'invalid', 'A retry approval with a stale round count is refused');
select is(public.kael_request_approval('00000000-0000-4000-8000-00000000a4c1', (current_setting('test.r1')::jsonb ->> 'run_id')::uuid, current_setting('test.tid')::uuid, 1,
  'service_request_redispatch', jsonb_build_object('task_id', current_setting('test.tid'), 'request_id', current_setting('test.f'), 'rounds', 0),
  repeat('a', 64), 'Mời thợ lại', '{}'::jsonb, 600) ->> 'status', 'invalid', 'A retry approval for another customer request is refused');
select set_config('test.approval', public.kael_request_approval('00000000-0000-4000-8000-00000000a4c1', (current_setting('test.r1')::jsonb ->> 'run_id')::uuid, current_setting('test.tid')::uuid, 1,
  'service_request_redispatch', jsonb_build_object('task_id', current_setting('test.tid'), 'request_id', current_setting('test.a'), 'rounds', 1),
  repeat('b', 64), 'Mời thợ lại', '{"Trạng thái":"Chưa có thợ phù hợp"}'::jsonb, 600)::text, true);
select is(current_setting('test.approval')::jsonb ->> 'status', 'ok', 'A valid retry is proposed for explicit approval');
reset role;
select is((select count(*) from public.service_invitations where request_id = current_setting('test.a')::uuid)::integer, 0, 'Proposing the approval invites nobody');
select is((select count(*) from public.service_dispatch_rounds where request_id = current_setting('test.a')::uuid)::integer, 1, 'Proposing the approval records no round');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(public.kael_finish_run('00000000-0000-4000-8000-00000000a4c1', (current_setting('test.r1')::jsonb ->> 'run_id')::uuid, 'completed', 'Bạn xác nhận nhé', true, null, null, 0, 0, 1, null), 'The proposing run finishes');
select set_config('test.r2', public.kael_start_run('00000000-0000-4000-8000-00000000a4c1', '24000000-0000-4000-8000-000000000002',
  (current_setting('test.r1')::jsonb ->> 'conversation_id')::uuid, 'client', 'Đồng ý')::text, true);
select is(public.kael_consume_approval('00000000-0000-4000-8000-00000000a4c1', (current_setting('test.r2')::jsonb ->> 'run_id')::uuid,
  (current_setting('test.approval')::jsonb ->> 'approval_id')::uuid, repeat('b', 64), array['service_request_redispatch']) ->> 'status', 'ok', 'The approval is consumed once');
select is(public.kael_complete_approval('00000000-0000-4000-8000-00000000a4c1', (current_setting('test.r2')::jsonb ->> 'run_id')::uuid,
  (current_setting('test.approval')::jsonb ->> 'approval_id')::uuid, 'succeeded', jsonb_build_object('resource_id', current_setting('test.a'))) ->> 'outcome', 'uncertain',
  'A success claim before any invitation exists is downgraded to uncertain');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4c1","role":"authenticated"}', true);
select is(public.redispatch_service_request(current_setting('test.a')::uuid), 1, 'The approved effect invites one worker through the owner command');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.kael_finish_run('00000000-0000-4000-8000-00000000a4c1', (current_setting('test.r2')::jsonb ->> 'run_id')::uuid, 'completed', 'Chưa rõ', true, null, null, 0, 0, 0, null), true,
  'The uncertain effect run finishes');
select set_config('test.r3', public.kael_start_run('00000000-0000-4000-8000-00000000a4c1', '24000000-0000-4000-8000-000000000003',
  (current_setting('test.r1')::jsonb ->> 'conversation_id')::uuid, 'client', 'Kiểm tra lại')::text, true);
select is(public.kael_consume_approval('00000000-0000-4000-8000-00000000a4c1', (current_setting('test.r3')::jsonb ->> 'run_id')::uuid,
  (current_setting('test.approval')::jsonb ->> 'approval_id')::uuid, repeat('b', 64), array['service_request_redispatch'], 'reconcile') ->> 'status', 'reconcile',
  'An uncertain retry is reconciled rather than approved again');
select set_config('test.done', public.kael_complete_approval('00000000-0000-4000-8000-00000000a4c1', (current_setting('test.r3')::jsonb ->> 'run_id')::uuid,
  (current_setting('test.approval')::jsonb ->> 'approval_id')::uuid, 'succeeded', jsonb_build_object('resource_id', current_setting('test.a')))::text, true);
select is(current_setting('test.done')::jsonb ->> 'outcome', 'succeeded', 'Reconciliation observes the committed invited round');
select is(current_setting('test.done')::jsonb #>> '{result,resource_kind}', 'dispatch_round', 'The verified result names the dispatch round');
reset role;
select is((select count(*) from public.service_invitations where request_id = current_setting('test.a')::uuid)::integer, 1, 'The effect ran exactly once');
select is((select summary from public.kael_tasks where id = current_setting('test.tid')::uuid), 'Đã mời thêm thợ; chưa có thợ nhận việc', 'The task summary does not claim an assignment');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(public.kael_finish_run('00000000-0000-4000-8000-00000000a4c1', (current_setting('test.r3')::jsonb ->> 'run_id')::uuid, 'completed', 'Đã mời', true, null, null, 0, 0, 1, null), 'The reconciling run finishes');
select set_config('test.r4', public.kael_start_run('00000000-0000-4000-8000-00000000a4c1', '24000000-0000-4000-8000-000000000004',
  (current_setting('test.r1')::jsonb ->> 'conversation_id')::uuid, 'client', 'Hủy yêu cầu này')::text, true);
select set_config('test.task2', public.kael_save_task('00000000-0000-4000-8000-00000000a4c1', null, (current_setting('test.r4')::jsonb ->> 'conversation_id')::uuid,
  (current_setting('test.r4')::jsonb ->> 'run_id')::uuid, null, 'Hủy yêu cầu', 'workflow_action', 'running', '', '{}'::jsonb, 'created')::text, true);
select set_config('test.tid2', current_setting('test.task2')::jsonb #>> '{task,id}', true);
select is(public.kael_request_approval('00000000-0000-4000-8000-00000000a4c1', (current_setting('test.r4')::jsonb ->> 'run_id')::uuid, current_setting('test.tid2')::uuid, 1,
  'service_request_cancel', jsonb_build_object('task_id', current_setting('test.tid2'), 'request_id', current_setting('test.f')),
  repeat('c', 64), 'Hủy yêu cầu', '{}'::jsonb, 600) ->> 'status', 'invalid', 'A cancellation of another customer request cannot be proposed');
select set_config('test.cancel', public.kael_request_approval('00000000-0000-4000-8000-00000000a4c1', (current_setting('test.r4')::jsonb ->> 'run_id')::uuid, current_setting('test.tid2')::uuid, 1,
  'service_request_cancel', jsonb_build_object('task_id', current_setting('test.tid2'), 'request_id', current_setting('test.a')),
  repeat('d', 64), 'Hủy yêu cầu', '{}'::jsonb, 600)::text, true);
select is(current_setting('test.cancel')::jsonb ->> 'status', 'ok', 'A cancellation is proposed for explicit approval');
reset role;
select is((select cancelled_at is null from public.service_requests where id = current_setting('test.a')::uuid), true, 'Proposing a cancellation cancels nothing');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(public.kael_finish_run('00000000-0000-4000-8000-00000000a4c1', (current_setting('test.r4')::jsonb ->> 'run_id')::uuid, 'completed', 'Bạn xác nhận nhé', true, null, null, 0, 0, 1, null), 'The proposing run finishes');
select set_config('test.r5', public.kael_start_run('00000000-0000-4000-8000-00000000a4c1', '24000000-0000-4000-8000-000000000005',
  (current_setting('test.r1')::jsonb ->> 'conversation_id')::uuid, 'client', 'Đồng ý hủy')::text, true);
select is(public.kael_consume_approval('00000000-0000-4000-8000-00000000a4c1', (current_setting('test.r5')::jsonb ->> 'run_id')::uuid,
  (current_setting('test.cancel')::jsonb ->> 'approval_id')::uuid, repeat('d', 64), array['service_request_cancel']) ->> 'status', 'ok', 'The cancellation approval is consumed once');
select is(public.kael_consume_approval('00000000-0000-4000-8000-00000000a4c1', (current_setting('test.r5')::jsonb ->> 'run_id')::uuid,
  (current_setting('test.cancel')::jsonb ->> 'approval_id')::uuid, repeat('d', 64), array['service_request_cancel']) ->> 'status', 'reconcile', 'Replaying a consumed approval reconciles the original operation instead of approving a second one');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4c1","role":"authenticated"}', true);
select is(public.cancel_service_request(current_setting('test.a')::uuid), current_setting('test.a')::uuid, 'The approved effect cancels through the owner command');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('test.done2', public.kael_complete_approval('00000000-0000-4000-8000-00000000a4c1', (current_setting('test.r5')::jsonb ->> 'run_id')::uuid,
  (current_setting('test.cancel')::jsonb ->> 'approval_id')::uuid, 'succeeded', jsonb_build_object('resource_id', current_setting('test.a')))::text, true);
select is(current_setting('test.done2')::jsonb ->> 'outcome', 'succeeded', 'The cancellation is verified from the committed request');
select is(current_setting('test.done2')::jsonb #>> '{result,resource_kind}', 'service_request', 'The verified result names the request');
reset role;
select is((select state from public.service_invitations where request_id = current_setting('test.a')::uuid), 'cancelled', 'The open offer was withdrawn with the request');
select ok(not nestscout_private.kael_effect_target_valid('00000000-0000-4000-8000-00000000a4c1', 'service_request_cancel',
  jsonb_build_object('request_id', current_setting('test.a'))), 'A cancelled request is no longer a valid cancellation target');
select ok(not nestscout_private.kael_effect_target_valid('00000000-0000-4000-8000-00000000a4c1', 'service_request_redispatch',
  jsonb_build_object('request_id', current_setting('test.a'), 'rounds', 2)), 'A cancelled request is no longer a valid retry target');

select * from finish();
rollback;
