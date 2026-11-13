begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-00000000c0a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000c0b2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000d0a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000d0b2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000d0c3', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000e0a1', 'authenticated', 'authenticated');
insert into nestscout_private.fixture_operators (user_id, basis) values ('00000000-0000-4000-8000-00000000e0a1', 'local_fixture');
insert into public.worker_access_grants (user_id) values
  ('00000000-0000-4000-8000-00000000d0a1'), ('00000000-0000-4000-8000-00000000d0b2'), ('00000000-0000-4000-8000-00000000d0c3');
insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active) values
  ('00000000-0000-4000-8000-00000000d0a1', 'local_fixture', true),
  ('00000000-0000-4000-8000-00000000d0b2', 'local_fixture', true),
  ('00000000-0000-4000-8000-00000000d0c3', 'local_fixture', true);
insert into public.worker_public_profiles (worker_id, display_name, trade, area, experience_years, about, skills, service_ids, accepting_jobs) values
  ('00000000-0000-4000-8000-00000000d0a1', 'Thợ A', 'Điện lạnh', 'Quận 7', 5, 'Sửa máy lạnh', array['Máy lạnh'], array['aircon'], false),
  ('00000000-0000-4000-8000-00000000d0b2', 'Thợ B', 'Điện lạnh', 'Quận 3', 4, 'Sửa máy lạnh', array['Máy lạnh'], array['aircon'], false),
  ('00000000-0000-4000-8000-00000000d0c3', 'Thợ C', 'Điện lạnh', 'Quận 1', 2, '', array['Máy lạnh'], array['aircon'], false);
insert into public.service_requests (id, owner_id, submission_key, description, location) values
  ('11000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c0a1', '21000000-0000-4000-8000-0000000000a1', E'Máy lạnh không mát\nPhòng ngủ', 'Quận 7'),
  ('11000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000c0b2', '21000000-0000-4000-8000-0000000000b2', 'Sửa vòi nước', 'Quận 3');

select ok(not has_table_privilege('authenticated', 'nestscout_private.fixture_operators', 'select'), 'Operator authority is not client-readable');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c0a1","role":"authenticated"}', true);
select throws_ok($$select public.issue_fixture_quote('11000000-0000-4000-8000-0000000000a1', gen_random_uuid(), 'Kiểm tra', 450000, 60)$$,
  '42501', 'operator unavailable', 'A customer cannot issue a quote for their own request');
select throws_ok($$select * from public.fixture_dispatch_queue()$$, '42501', 'operator unavailable', 'A customer cannot read the dispatch queue');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000d0a1","role":"authenticated"}', true);
select throws_ok($$select public.invite_fixture_worker('11000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000d0a1', 30)$$,
  '42501', 'operator unavailable', 'A worker cannot invite themselves');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e0a1","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select public.issue_fixture_quote('11000000-0000-4000-8000-0000000000a1', gen_random_uuid(), 'Kiểm tra', 450000, 60)$$,
  '42501', 'operator unavailable', 'An anonymous session is never an operator');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000d0a1","role":"authenticated"}', true);
select is(public.set_worker_accepting(true), true, 'An explicitly eligible fixture Worker can accept test offers without uploading identity documents');
select ok((select missing_items @> array['identity'] from public.my_worker_profile()), 'Fixture offer readiness does not remove the identity requirement for public listing');
select is((select listed from public.my_worker_profile()), false, 'A fixture Worker without identity documents remains unlisted');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000d0b2","role":"authenticated"}', true);
select is(public.set_worker_accepting(true), true, 'A second eligible fixture Worker can also accept test offers without identity documents');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000d0c3","role":"authenticated"}', true);
select throws_ok($$select public.set_worker_accepting(true)$$, '22023', 'profile incomplete', 'Fixture eligibility does not waive missing basic profile information');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e0a1","role":"authenticated"}', true);
select throws_ok($$select public.issue_fixture_quote('11000000-0000-4000-8000-0000000000a1', gen_random_uuid(), ' ', 450000, 60)$$,
  '22023', 'invalid request', 'A blank scope is rejected');
select throws_ok($$select public.issue_fixture_quote('11000000-0000-4000-8000-0000000000a1', gen_random_uuid(), 'Kiểm tra', 0, 60)$$,
  '22023', 'invalid request', 'A zero amount is rejected');
select throws_ok($$select public.issue_fixture_quote('11000000-0000-4000-8000-0000000000a1', gen_random_uuid(), 'Kiểm tra', 450000, 2)$$,
  '22023', 'invalid request', 'A validity below five minutes is rejected');
select set_config('test.q1', public.issue_fixture_quote('11000000-0000-4000-8000-0000000000a1', '22000000-0000-4000-8000-000000000001', '  Kiểm tra gas và vệ sinh  ', 450000, 60)::text, true);
select is(public.issue_fixture_quote('11000000-0000-4000-8000-0000000000a1', '22000000-0000-4000-8000-000000000001', 'Kiểm tra gas và vệ sinh', 450000, 60)::text,
  current_setting('test.q1'), 'Replaying the same issue key returns the same quote');
select throws_ok($$select public.issue_fixture_quote('11000000-0000-4000-8000-0000000000a1', '22000000-0000-4000-8000-000000000001', 'Khác', 450000, 60)$$,
  '22023', 'issue key conflict', 'Reusing an issue key with different terms is rejected');
select set_config('test.q2', public.issue_fixture_quote('11000000-0000-4000-8000-0000000000a1', '22000000-0000-4000-8000-000000000002', 'Kiểm tra gas, vệ sinh và nạp gas', 650000, 60)::text, true);
reset role;
select is((select version from public.service_quotes where id = current_setting('test.q2')::uuid), 2, 'A new issue creates the next quote version');
select is((select basis from public.service_quotes where id = current_setting('test.q2')::uuid), 'local_fixture', 'Issued quotes carry the fixture basis');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e0a1","role":"authenticated"}', true);
select is((select count(*)::integer from public.service_quotes), 0, 'The operator cannot read quote rows directly');
select is((select count(*)::integer from public.fixture_dispatch_queue() where request_id = '11000000-0000-4000-8000-0000000000a1' and quote_state = 'issued'), 1,
  'The operator queue reports the latest issued quote');
savepoint dispatch_reads_read_only;
set local transaction_read_only = on;
select lives_ok($$select * from public.fixture_dispatch_queue()$$, 'The dispatch queue is readable in the read-only transaction PostgREST uses for stable functions');
select lives_ok($$select * from public.fixture_dispatch_candidates()$$, 'The dispatch candidates are readable in a read-only transaction');
rollback to savepoint dispatch_reads_read_only;
select throws_ok($$select public.invite_fixture_worker('11000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000d0a1', 30)$$,
  '22023', 'agreement unavailable', 'No worker is invited before the customer accepts a quote');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c0b2","role":"authenticated"}', true);
select is((select count(*)::integer from public.service_quotes where request_id = '11000000-0000-4000-8000-0000000000a1'), 0, 'Customer B cannot read Customer A quotes');
select throws_ok(format('select public.accept_service_quote(%L, 2)', current_setting('test.q2')), '42501', 'quote unavailable', 'Customer B cannot accept Customer A quote');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c0a1","role":"authenticated"}', true);
select is((select count(*)::integer from public.service_quotes where request_id = '11000000-0000-4000-8000-0000000000a1'), 2, 'Customer A reads both versions of their quote');
select throws_ok(format('select public.accept_service_quote(%L, 1)', current_setting('test.q1')), 'PGRST', nestscout_private.conflict_body('stale quote'), 'A superseded quote version cannot be accepted');

reset role;
update public.service_quotes set expires_at = now() - interval '1 minute' where id = current_setting('test.q2')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c0a1","role":"authenticated"}', true);
select throws_ok(format('select public.accept_service_quote(%L, 2)', current_setting('test.q2')), '22023', 'quote expired', 'An expired quote cannot be accepted');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e0a1","role":"authenticated"}', true);
select set_config('test.q3', public.issue_fixture_quote('11000000-0000-4000-8000-0000000000a1', '22000000-0000-4000-8000-000000000003', 'Kiểm tra gas, vệ sinh và nạp gas', 650000, 60)::text, true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c0a1","role":"authenticated"}', true);
select is(public.accept_service_quote(current_setting('test.q3')::uuid, 3)::text, current_setting('test.q3'), 'The customer accepts the current quote');
select is(public.accept_service_quote(current_setting('test.q3')::uuid, 3)::text, current_setting('test.q3'), 'Accepting again replays the same acceptance');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e0a1","role":"authenticated"}', true);
select throws_ok($$select public.issue_fixture_quote('11000000-0000-4000-8000-0000000000a1', gen_random_uuid(), 'Sau khi chấp nhận', 1, 60)$$,
  '22023', 'agreement unavailable', 'No new quote is issued after acceptance');
select throws_ok($$select public.invite_fixture_worker('11000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000d0c3', 30)$$,
  '22023', 'worker unavailable', 'A worker who is not ready and not accepting jobs is not invited');
select throws_ok($$select public.invite_fixture_worker('11000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c0a1', 30)$$,
  '22023', 'worker unavailable', 'The request owner is never invited as its worker');
select is((select array_agg(worker_id order by worker_id) from public.fixture_dispatch_candidates()),
  array['00000000-0000-4000-8000-00000000d0a1', '00000000-0000-4000-8000-00000000d0b2']::uuid[], 'Only ready, accepting and eligible workers are dispatch candidates');
select set_config('test.ia', public.invite_fixture_worker('11000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000d0a1', 30)::text, true);
select is(public.invite_fixture_worker('11000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000d0a1', 30)::text, current_setting('test.ia'),
  'Inviting the same worker again returns the open invitation');
select set_config('test.ib', public.invite_fixture_worker('11000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000d0b2', 30)::text, true);
reset role;
select is((select invited_by from public.service_invitations where id = current_setting('test.ia')::uuid), '00000000-0000-4000-8000-00000000e0a1'::uuid,
  'The invitation records the operator that sent it');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c0a1","role":"authenticated"}', true);
select lives_ok($$select public.set_request_preferred_visit('11000000-0000-4000-8000-0000000000a1', now() + interval '1 day')$$, 'The owner records a preferred visit time');
select throws_ok($$select public.set_request_preferred_visit('11000000-0000-4000-8000-0000000000a1', now() - interval '1 day')$$, '22023', 'invalid visit time', 'A past visit time is rejected');
select throws_ok($$select public.set_request_preferred_visit('11000000-0000-4000-8000-0000000000a1', now() + interval '90 days')$$, '22023', 'invalid visit time', 'A visit time beyond sixty days is rejected');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c0b2","role":"authenticated"}', true);
select throws_ok($$select public.set_request_preferred_visit('11000000-0000-4000-8000-0000000000a1', now() + interval '2 days')$$, '42501', 'request unavailable', 'Another customer cannot change the visit time');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000d0a1","role":"authenticated"}', true);
select ok((select preferred_visit_at is not null from public.worker_job_cards() where kind = 'offer' and ref_id = current_setting('test.ia')::uuid),
  'The invited worker sees the preferred visit time before accepting');
select set_config('test.job', public.accept_service_invitation(current_setting('test.ia')::uuid, current_setting('test.q3')::uuid, 3)::text, true);
select is((select stage from public.service_jobs where id = current_setting('test.job')::uuid), 'assigned', 'Worker A wins the assignment');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000d0b2","role":"authenticated"}', true);
select throws_ok(format('select public.accept_service_invitation(%L, %L, 3)', current_setting('test.ib'), current_setting('test.q3')),
  'PGRST', nestscout_private.conflict_body('already assigned'), 'Worker B can no longer accept once the job is assigned');
select is((select count(*)::integer from public.worker_offers()), 0, 'Worker B no longer sees the assigned offer');
select throws_ok(format('select public.advance_service_job(%L, 1, %L)', current_setting('test.job'), 'en_route'), '42501', 'job unavailable', 'Worker B cannot advance Worker A job');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e0a1","role":"authenticated"}', true);
select throws_ok($$select public.invite_fixture_worker('11000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000d0b2', 30)$$,
  'PGRST', nestscout_private.conflict_body('already assigned'), 'No invitation is sent after assignment');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c0a1","role":"authenticated"}', true);
select throws_ok($$select public.set_request_preferred_visit('11000000-0000-4000-8000-0000000000a1', now() + interval '2 days')$$, '22023', 'step unavailable',
  'The preferred visit time is fixed once a worker is assigned');

reset role;
insert into public.consent_events (user_id, purpose, granted, policy_version) values
  ('00000000-0000-4000-8000-00000000c0a1', 'ai_sharing', true, '2026-11-09'),
  ('00000000-0000-4000-8000-00000000d0a1', 'ai_sharing', true, '2026-11-09');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('test.r1', public.kael_start_run('00000000-0000-4000-8000-00000000d0a1', '23000000-0000-4000-8000-000000000001', null, 'worker', 'Tôi đang đi tới nhà khách')::text, true);
select is(current_setting('test.r1')::jsonb ->> 'status', 'started', 'Worker A starts a Kael run');
select set_config('test.task', public.kael_save_task('00000000-0000-4000-8000-00000000d0a1', null, (current_setting('test.r1')::jsonb ->> 'conversation_id')::uuid,
  (current_setting('test.r1')::jsonb ->> 'run_id')::uuid, null, 'Cập nhật đang đi', 'workflow_action', 'running', '', '{}'::jsonb, 'created')::text, true);
select is(current_setting('test.task')::jsonb ->> 'status', 'ok', 'A workflow action task is created');
select set_config('test.args', jsonb_build_object('task_id', current_setting('test.task')::jsonb #>> '{task,id}', 'job_id', current_setting('test.job'), 'version', 1, 'next', 'arrived')::text, true);
select is(public.kael_request_approval('00000000-0000-4000-8000-00000000d0a1', (current_setting('test.r1')::jsonb ->> 'run_id')::uuid,
  (current_setting('test.task')::jsonb #>> '{task,id}')::uuid, 1, 'worker_job_advance', current_setting('test.args')::jsonb, repeat('b', 64),
  'Báo đã đến', '{}'::jsonb, 600) ->> 'status', 'invalid', 'An illegal stage skip cannot be proposed for approval');
select set_config('test.args', jsonb_build_object('task_id', current_setting('test.task')::jsonb #>> '{task,id}', 'job_id', current_setting('test.job'), 'version', 1, 'next', 'en_route')::text, true);
select is(public.kael_request_approval('00000000-0000-4000-8000-00000000d0b2', (current_setting('test.r1')::jsonb ->> 'run_id')::uuid,
  (current_setting('test.task')::jsonb #>> '{task,id}')::uuid, 1, 'worker_job_advance', current_setting('test.args')::jsonb, repeat('b', 64),
  'Báo đang đi', '{}'::jsonb, 600) ->> 'status', 'invalid', 'Another worker cannot request an approval on this run');
select set_config('test.approval', public.kael_request_approval('00000000-0000-4000-8000-00000000d0a1', (current_setting('test.r1')::jsonb ->> 'run_id')::uuid,
  (current_setting('test.task')::jsonb #>> '{task,id}')::uuid, 1, 'worker_job_advance', current_setting('test.args')::jsonb, repeat('b', 64),
  'Báo đang đi', '{"Công việc":"Máy lạnh không mát"}'::jsonb, 600)::text, true);
select is(current_setting('test.approval')::jsonb ->> 'status', 'ok', 'A legal job advance is proposed for explicit approval');
select is((select stage from public.service_jobs where id = current_setting('test.job')::uuid), 'assigned', 'Proposing an approval changes nothing in the job');
select ok(public.kael_finish_run('00000000-0000-4000-8000-00000000d0a1', (current_setting('test.r1')::jsonb ->> 'run_id')::uuid, 'completed', 'Bạn xác nhận nhé', true, null, null, 0, 0, 1, null),
  'The proposing run finishes');

select set_config('test.r2', public.kael_start_run('00000000-0000-4000-8000-00000000d0a1', '23000000-0000-4000-8000-000000000002',
  (current_setting('test.r1')::jsonb ->> 'conversation_id')::uuid, 'worker', 'Đồng ý')::text, true);
select is(public.kael_consume_approval('00000000-0000-4000-8000-00000000d0a1', (current_setting('test.r2')::jsonb ->> 'run_id')::uuid,
  (current_setting('test.approval')::jsonb ->> 'approval_id')::uuid, repeat('c', 64), array['worker_job_advance']) ->> 'status', 'mismatch',
  'A forged fingerprint cannot consume the approval');
select is(public.kael_consume_approval('00000000-0000-4000-8000-00000000d0a1', (current_setting('test.r2')::jsonb ->> 'run_id')::uuid,
  (current_setting('test.approval')::jsonb ->> 'approval_id')::uuid, repeat('b', 64), array['service_request_submit']) ->> 'status', 'unavailable',
  'An approval is consumed only when its tool is still offered');
select is(public.kael_consume_approval('00000000-0000-4000-8000-00000000d0a1', (current_setting('test.r2')::jsonb ->> 'run_id')::uuid,
  (current_setting('test.approval')::jsonb ->> 'approval_id')::uuid, repeat('b', 64), array['worker_job_advance']) ->> 'status', 'ok',
  'The worker approval is consumed once');
select is(public.kael_complete_approval('00000000-0000-4000-8000-00000000d0a1', (current_setting('test.r2')::jsonb ->> 'run_id')::uuid,
  (current_setting('test.approval')::jsonb ->> 'approval_id')::uuid, 'succeeded', jsonb_build_object('resource_id', current_setting('test.job'))) ->> 'outcome', 'uncertain',
  'A success claim without the observed job event is downgraded to uncertain');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000d0a1","role":"authenticated"}', true);
select is(public.advance_service_job(current_setting('test.job')::uuid, 1, 'en_route'), 2, 'The approved effect runs through the worker command');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('test.r3', public.kael_start_run('00000000-0000-4000-8000-00000000d0a1', '23000000-0000-4000-8000-000000000003',
  (current_setting('test.r1')::jsonb ->> 'conversation_id')::uuid, 'worker', 'Kiểm tra lại')::text, true);
select is(current_setting('test.r3')::jsonb ->> 'status', 'busy', 'A second run cannot start while the effect run is open');
select is(public.kael_finish_run('00000000-0000-4000-8000-00000000d0a1', (current_setting('test.r2')::jsonb ->> 'run_id')::uuid, 'completed', 'Chưa rõ', true, null, null, 0, 0, 0, null), true,
  'The uncertain effect run finishes');
select set_config('test.r3', public.kael_start_run('00000000-0000-4000-8000-00000000d0a1', '23000000-0000-4000-8000-000000000004',
  (current_setting('test.r1')::jsonb ->> 'conversation_id')::uuid, 'worker', 'Kiểm tra lại')::text, true);
select is(public.kael_consume_approval('00000000-0000-4000-8000-00000000d0a1', (current_setting('test.r3')::jsonb ->> 'run_id')::uuid,
  (current_setting('test.approval')::jsonb ->> 'approval_id')::uuid, repeat('b', 64), array['worker_job_advance'], 'reconcile') ->> 'status', 'reconcile',
  'An uncertain effect is reconciled rather than approved again');
select set_config('test.done', public.kael_complete_approval('00000000-0000-4000-8000-00000000d0a1', (current_setting('test.r3')::jsonb ->> 'run_id')::uuid,
  (current_setting('test.approval')::jsonb ->> 'approval_id')::uuid, 'succeeded', jsonb_build_object('resource_id', current_setting('test.job')))::text, true);
select is(current_setting('test.done')::jsonb ->> 'outcome', 'succeeded', 'Reconciliation observes the committed job event');
select is(current_setting('test.done')::jsonb #>> '{result,resource_kind}', 'service_job', 'The verified result names the job resource');

select set_config('test.r5', public.kael_start_run('00000000-0000-4000-8000-00000000c0a1', '23000000-0000-4000-8000-000000000005', null, 'client', 'Xin chào')::text, true);
select set_config('test.ctask', public.kael_save_task('00000000-0000-4000-8000-00000000c0a1', null, (current_setting('test.r5')::jsonb ->> 'conversation_id')::uuid,
  (current_setting('test.r5')::jsonb ->> 'run_id')::uuid, null, 'Báo giá', 'workflow_action', 'running', '', '{}'::jsonb, 'created')::text, true);
select is(public.kael_request_approval('00000000-0000-4000-8000-00000000c0a1', (current_setting('test.r5')::jsonb ->> 'run_id')::uuid,
  (current_setting('test.ctask')::jsonb #>> '{task,id}')::uuid, 1, 'service_quote_decision',
  jsonb_build_object('task_id', current_setting('test.ctask')::jsonb #>> '{task,id}', 'quote_id', current_setting('test.q3'), 'quote_version', 3, 'decision', 'accepted'),
  repeat('d', 64), 'Chấp nhận báo giá', '{}'::jsonb, 600) ->> 'status', 'invalid', 'An already accepted quote cannot be proposed for a decision again');
select is(public.kael_request_approval('00000000-0000-4000-8000-00000000c0a1', (current_setting('test.r5')::jsonb ->> 'run_id')::uuid,
  (current_setting('test.ctask')::jsonb #>> '{task,id}')::uuid, 1, 'work_submission_decision',
  jsonb_build_object('task_id', current_setting('test.ctask')::jsonb #>> '{task,id}', 'submission_id', gen_random_uuid(), 'job_version', 2, 'decision', 'accepted', 'reason', ''),
  repeat('d', 64), 'Nghiệm thu', '{}'::jsonb, 600) ->> 'status', 'invalid', 'A decision on a missing submission is refused');

reset role;
insert into public.kael_messages (id, conversation_id, owner_id, run_id, seq, role, content) values
  ('24000000-0000-4000-8000-000000000001', (current_setting('test.r5')::jsonb ->> 'conversation_id')::uuid, '00000000-0000-4000-8000-00000000c0a1',
    (current_setting('test.r5')::jsonb ->> 'run_id')::uuid, 99, 'assistant', 'Kael trả lời');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c0a1","role":"authenticated"}', true);
select is(public.set_kael_feedback('24000000-0000-4000-8000-000000000001', null, 'down', 'too_long'), 'down', 'The owner rates a Kael reply');
select is((select reason from public.kael_message_feedback where message_id = '24000000-0000-4000-8000-000000000001'), 'too_long', 'The reason is stored');
select throws_ok($$select public.set_kael_feedback('24000000-0000-4000-8000-000000000001', null, 'up', 'too_long')$$, '22023', 'invalid request', 'A reason requires a negative rating');
select throws_ok($$select public.set_kael_feedback('24000000-0000-4000-8000-000000000001', null, 'down', 'free text')$$, '22023', 'invalid request', 'Only listed reasons are stored');
select is(public.set_kael_feedback(null, (current_setting('test.r5')::jsonb ->> 'run_id')::uuid, 'up', null), 'up', 'A fresh reply is rated through its run');
select is((select rating from public.kael_message_feedback where message_id = '24000000-0000-4000-8000-000000000001'), 'up', 'The run resolves to its assistant message');
select throws_ok($$select public.set_kael_feedback('24000000-0000-4000-8000-000000000001', gen_random_uuid(), 'up', null)$$, '22023', 'invalid request', 'Exactly one reply reference is accepted');
select is(public.set_kael_feedback('24000000-0000-4000-8000-000000000001', null, null, null), null, 'The owner clears the rating');
select is((select count(*)::integer from public.kael_message_feedback), 0, 'A cleared rating leaves no row');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c0b2","role":"authenticated"}', true);
select throws_ok($$select public.set_kael_feedback('24000000-0000-4000-8000-000000000001', null, 'up', null)$$, '42501', 'message unavailable', 'Another account cannot rate the reply');

select * from finish();
rollback;
