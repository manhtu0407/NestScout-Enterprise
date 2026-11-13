begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-00000000b6c1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000b6c2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000b6d1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000b6d2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000b6e1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000b6e2', 'authenticated', 'authenticated');
insert into public.worker_access_grants (user_id) values
  ('00000000-0000-4000-8000-00000000b6d1'), ('00000000-0000-4000-8000-00000000b6d2');
insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active) values
  ('00000000-0000-4000-8000-00000000b6d1', 'local_fixture', true),
  ('00000000-0000-4000-8000-00000000b6d2', 'local_fixture', true);
insert into nestscout_private.fixture_operators (user_id, basis, active) values
  ('00000000-0000-4000-8000-00000000b6e1', 'local_fixture', true),
  ('00000000-0000-4000-8000-00000000b6e2', 'local_fixture', false);
insert into public.worker_public_profiles (worker_id, display_name, trade, area, experience_years, about, skills, service_ids, accepting_jobs) values
  ('00000000-0000-4000-8000-00000000b6d1', 'Thợ một', 'Thợ điện', 'Quận 7', 5, 'Sửa điện', array['Điện'], array['electric'], true),
  ('00000000-0000-4000-8000-00000000b6d2', 'Thợ hai', 'Thợ điện', 'Quận 3', 4, 'Sửa điện', array['Điện'], array['electric'], false);

update nestscout_private.auto_dispatch_settings set enabled = true, max_invites = 1, max_rounds = 5, retry_cooldown_minutes = 5,
  max_manual_retries = 2, empty_retry_cooldown_seconds = 60, max_invites_per_worker = 2,
  reinvite_declined_after_minutes = 1440, reinvite_expired_after_minutes = 60, offer_minutes = 30,
  max_active_jobs_per_worker = 10, visit_conflict_minutes = 15,
  assigned_response_minutes = 120, visit_grace_minutes = 30, en_route_arrival_minutes = 120, arrival_escalation_minutes = 60;

select ok(has_function_privilege('authenticated', 'public.operator_escalation_queue()', 'execute'), 'Signed-in sessions reach the operator queue wrapper');
select ok(has_function_privilege('authenticated', 'public.review_service_escalation(uuid, uuid)', 'execute'), 'Signed-in sessions reach the review wrapper');
select ok(has_function_privilege('authenticated', 'public.resolve_service_escalation(uuid, text, text, uuid)', 'execute'), 'Signed-in sessions reach the resolve wrapper');
select ok(not has_function_privilege('anon', 'public.operator_escalation_queue()', 'execute'), 'Anonymous callers cannot read the operator queue');
select ok(not has_function_privilege('anon', 'public.review_service_escalation(uuid, uuid)', 'execute'), 'Anonymous callers cannot review');
select ok(not has_function_privilege('anon', 'public.resolve_service_escalation(uuid, text, text, uuid)', 'execute'), 'Anonymous callers cannot resolve');
select ok(not has_column_privilege('authenticated', 'public.service_job_escalations', 'review_key', 'select'), 'Operation keys are not readable by clients');
select ok(not has_column_privilege('authenticated', 'public.service_job_escalations', 'reviewed_by', 'select'), 'The reviewing operator identity is not readable by clients');
select ok(has_column_privilege('authenticated', 'public.service_job_escalations', 'status', 'select'), 'Participants can read the case status');
select ok(not has_table_privilege('authenticated', 'public.service_job_escalations', 'update'), 'Clients cannot edit cases');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b6c1","role":"authenticated"}', true);
do $$
declare
  v_request uuid;
begin
  for i in 1..5 loop
    v_request := public.submit_service_request(('47100000-0000-4000-8000-00000000000' || i)::uuid, 'Sự cố điện số ' || i, 'Quận 7', 'electric');
    perform set_config('test.r' || i, v_request::text, true);
    perform public.accept_service_quote((select id from public.service_quotes where request_id = v_request), 1);
  end loop;
end $$;

reset role;
do $$
begin
  for i in 1..5 loop
    perform set_config('test.i' || i, (select id::text from public.service_invitations where request_id = current_setting('test.r' || i)::uuid), true);
    perform set_config('test.q' || i, (select id::text from public.service_quotes where request_id = current_setting('test.r' || i)::uuid), true);
  end loop;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b6d1","role":"authenticated"}', true);
do $$
begin
  for i in 1..5 loop
    perform public.accept_service_invitation(current_setting('test.i' || i)::uuid, current_setting('test.q' || i)::uuid, 1);
  end loop;
end $$;

reset role;
do $$
begin
  for i in 1..5 loop
    perform set_config('test.j' || i, (select id::text from public.service_jobs where request_id = current_setting('test.r' || i)::uuid), true);
  end loop;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b6d1","role":"authenticated"}', true);
do $$
begin
  for i in 1..5 loop
    perform public.advance_service_job(current_setting('test.j' || i)::uuid, 1, 'en_route');
    perform public.advance_service_job(current_setting('test.j' || i)::uuid, 2, 'arrived');
  end loop;
end $$;

reset role;
update public.service_job_events set created_at = clock_timestamp() - interval '2 hours' where event = 'arrived'
  and job_id in (select id from public.service_jobs where worker_id = '00000000-0000-4000-8000-00000000b6d1');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b6c1","role":"authenticated"}', true);
do $$
begin
  for i in 1..5 loop
    perform public.escalate_service_job(current_setting('test.r' || i)::uuid, ('49100000-0000-4000-8000-00000000000' || i)::uuid, 'Thợ đến nhưng chưa làm ' || i);
  end loop;
end $$;

select throws_ok($$select * from public.operator_escalation_queue()$$, '42501', 'operator unavailable', 'A customer cannot read the operator queue');
reset role;
select set_config('test.e1', (select id::text from public.service_job_escalations where request_id = current_setting('test.r1')::uuid), true);
select set_config('test.e2', (select id::text from public.service_job_escalations where request_id = current_setting('test.r2')::uuid), true);
select set_config('test.e3', (select id::text from public.service_job_escalations where request_id = current_setting('test.r3')::uuid), true);
select set_config('test.e4', (select id::text from public.service_job_escalations where request_id = current_setting('test.r4')::uuid), true);
select set_config('test.e5', (select id::text from public.service_job_escalations where request_id = current_setting('test.r5')::uuid), true);

select is((select count(*) from public.notifications where kind = 'escalation_received' and recipient_id = '00000000-0000-4000-8000-00000000b6e1')::integer, 5, 'The active operator is told about every new case');
select is((select count(*) from public.notifications where kind = 'escalation_received' and recipient_id = '00000000-0000-4000-8000-00000000b6e2')::integer, 0, 'An inactive operator is not notified');
select is((select count(*) from public.notifications where kind = 'escalation_received' and recipient_id in
  ('00000000-0000-4000-8000-00000000b6c1', '00000000-0000-4000-8000-00000000b6d1'))::integer, 0, 'Participants are never told they are the operator');
select is((select count(*) from public.notifications where kind = 'job_escalated' and recipient_id = '00000000-0000-4000-8000-00000000b6d1')::integer, 5, 'The worker is told about every report');
select is((select status from public.service_job_escalations where id = current_setting('test.e1')::uuid), 'open', 'A new report starts open');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b6d1","role":"authenticated"}', true);
select throws_ok($$select * from public.operator_escalation_queue()$$, '42501', 'operator unavailable', 'A worker cannot read the operator queue');
select throws_ok($$select public.review_service_escalation(current_setting('test.e1')::uuid, '4a100000-0000-4000-8000-000000000001')$$,
  '42501', 'operator unavailable', 'A worker cannot review a case');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b6c1","role":"authenticated"}', true);
select throws_ok($$select public.review_service_escalation(current_setting('test.e1')::uuid, '4a100000-0000-4000-8000-000000000002')$$,
  '42501', 'operator unavailable', 'The reporting customer cannot review their own case');
select throws_ok($$select public.resolve_service_escalation(current_setting('test.e1')::uuid, 'dismiss', null, '4b100000-0000-4000-8000-000000000001')$$,
  '42501', 'operator unavailable', 'The reporting customer cannot resolve their own case');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b6e2","role":"authenticated"}', true);
select throws_ok($$select * from public.operator_escalation_queue()$$, '42501', 'operator unavailable', 'An inactive operator is refused');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b6e1","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select * from public.operator_escalation_queue()$$, '42501', 'operator unavailable', 'A guest session is refused even with an operator id');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b6e1","role":"authenticated"}', true);
select is((select count(*) from public.operator_escalation_queue())::integer, 5, 'The operator sees every open case');
select is((select count(*) from public.operator_escalation_queue() where status = 'open')::integer, 5, 'All cases are waiting for review');
select is((select worker_name from public.operator_escalation_queue() where escalation_id = current_setting('test.e1')::uuid), 'Thợ một', 'The queue shows the worker name');
select is((select job_stage from public.operator_escalation_queue() where escalation_id = current_setting('test.e1')::uuid), 'arrived', 'The queue shows the job stage');
select is((select count(*) from public.service_job_escalations)::integer, 0, 'The operator has no direct table access to the participants cases');
select throws_ok($$select public.review_service_escalation('00000000-0000-4000-8000-00000000dead', '4a100000-0000-4000-8000-000000000003')$$,
  '42501', 'escalation unavailable', 'An unknown case cannot be reviewed');
select throws_ok($$select public.resolve_service_escalation(current_setting('test.e2')::uuid, 'dismiss', null, '4b100000-0000-4000-8000-000000000002')$$,
  '22023', 'review required', 'A case cannot be resolved before it is reviewed');
select throws_ok($$select public.resolve_service_escalation(current_setting('test.e2')::uuid, 'refund', null, '4b100000-0000-4000-8000-000000000003')$$,
  '22023', 'invalid resolution', 'Only the defined resolutions are accepted');
select throws_ok($$select public.resolve_service_escalation(current_setting('test.e2')::uuid, 'dismiss', repeat('x', 501), '4b100000-0000-4000-8000-000000000004')$$,
  '22023', 'invalid resolution', 'An oversized note is refused');

select is(public.review_service_escalation(current_setting('test.e1')::uuid, '4a100000-0000-4000-8000-000000000010')::jsonb ->> 'outcome', 'reviewing', 'The operator takes the case into review');
select is(public.review_service_escalation(current_setting('test.e1')::uuid, '4a100000-0000-4000-8000-000000000010')::jsonb ->> 'outcome', 'already_reviewing', 'Repeating the review changes nothing');
select is(public.review_service_escalation(current_setting('test.e1')::uuid, '4a100000-0000-4000-8000-000000000011')::jsonb ->> 'outcome', 'already_reviewing', 'A second review with a new key does not re-claim');
select is((select count(*) from public.operator_escalation_queue() where status = 'reviewing')::integer, 1, 'The queue marks the case in review');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b6c1","role":"authenticated"}', true);
select is((select escalation_status from public.get_dispatch_summary(array[current_setting('test.r1')::uuid])), 'reviewing', 'The customer sees the case in review');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b6e1","role":"authenticated"}', true);

select is(public.resolve_service_escalation(current_setting('test.e1')::uuid, 'proceed', 'Thợ sẽ bắt đầu ngay', '4b100000-0000-4000-8000-000000000010')::jsonb ->> 'outcome', 'resolved', 'The operator lets the worker proceed');
select is(public.resolve_service_escalation(current_setting('test.e1')::uuid, 'proceed', 'Thợ sẽ bắt đầu ngay', '4b100000-0000-4000-8000-000000000010')::jsonb ->> 'outcome', 'already_resolved', 'Repeating the resolution changes nothing');
select is(public.resolve_service_escalation(current_setting('test.e1')::uuid, 'replace_worker', null, '4b100000-0000-4000-8000-000000000011')::jsonb ->> 'outcome', 'already_resolved', 'A resolved case cannot be resolved again with a new key');
select is(public.review_service_escalation(current_setting('test.e1')::uuid, '4a100000-0000-4000-8000-000000000012')::jsonb ->> 'outcome', 'already_resolved', 'A resolved case cannot be reopened for review');
select is((select count(*) from public.operator_escalation_queue() where escalation_id = current_setting('test.e1')::uuid)::integer, 0, 'A resolved case leaves the queue');
reset role;
select is((select stage from public.service_jobs where id = current_setting('test.j1')::uuid), 'arrived', 'Proceeding leaves the job and its stage untouched');
select is((select count(*) from public.service_job_releases where request_id = current_setting('test.r1')::uuid)::integer, 0, 'Proceeding releases nothing');
select is((select count(*) from public.notifications where kind = 'escalation_resolved' and request_id = current_setting('test.r1')::uuid and recipient_id = '00000000-0000-4000-8000-00000000b6c1')::integer, 1, 'The customer is told once');
select is((select count(*) from public.notifications where kind = 'escalation_resolved' and request_id = current_setting('test.r1')::uuid and recipient_id = '00000000-0000-4000-8000-00000000b6d1')::integer, 1, 'The worker is told once');
select ok((select body from public.notifications where kind = 'escalation_resolved' and request_id = current_setting('test.r1')::uuid and recipient_id = '00000000-0000-4000-8000-00000000b6c1') like '%Thợ sẽ bắt đầu ngay%', 'The operator note reaches the customer');
select is((select resolution from public.service_job_escalations where id = current_setting('test.e1')::uuid), 'proceed', 'The decision is recorded');
select is((select resolved_by from public.service_job_escalations where id = current_setting('test.e1')::uuid), '00000000-0000-4000-8000-00000000b6e1'::uuid, 'The deciding operator is recorded');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b6c1","role":"authenticated"}', true);
select is((select escalation_status from public.get_dispatch_summary(array[current_setting('test.r1')::uuid])), 'resolved', 'The customer sees the case resolved');
select is((select escalation_resolution from public.get_dispatch_summary(array[current_setting('test.r1')::uuid])), 'proceed', 'The customer sees the decision');
select is((select can_escalate from public.get_dispatch_summary(array[current_setting('test.r1')::uuid])), false, 'A resolved case cannot be reported again');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b6d1","role":"authenticated"}', true);
select is((select status from public.service_job_escalations where id = current_setting('test.e1')::uuid), 'resolved', 'The worker reads the case status');
select is((select resolution from public.service_job_escalations where id = current_setting('test.e1')::uuid), 'proceed', 'The worker reads the decision');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b6e1","role":"authenticated"}', true);
select is(public.review_service_escalation(current_setting('test.e2')::uuid, '4a100000-0000-4000-8000-000000000020')::jsonb ->> 'outcome', 'reviewing', 'The second case is reviewed');
select is(public.resolve_service_escalation(current_setting('test.e2')::uuid, 'dismiss', null, '4b100000-0000-4000-8000-000000000020')::jsonb ->> 'outcome', 'resolved', 'The operator closes the second case without action');
reset role;
select is((select stage from public.service_jobs where id = current_setting('test.j2')::uuid), 'arrived', 'Dismissing leaves the job untouched');
select is((select count(*) from public.notifications where kind = 'escalation_resolved' and request_id = current_setting('test.r2')::uuid)::integer, 2, 'Both participants are told the case was closed');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b6e1","role":"authenticated"}', true);
select is(public.review_service_escalation(current_setting('test.e3')::uuid, '4a100000-0000-4000-8000-000000000030')::jsonb ->> 'outcome', 'reviewing', 'The third case is reviewed');
select is(public.resolve_service_escalation(current_setting('test.e3')::uuid, 'replace_worker', 'Đổi thợ khác', '4b100000-0000-4000-8000-000000000030')::jsonb ->> 'outcome', 'resolved', 'The operator replaces the worker');
select is(public.resolve_service_escalation(current_setting('test.e3')::uuid, 'replace_worker', 'Đổi thợ khác', '4b100000-0000-4000-8000-000000000030')::jsonb ->> 'outcome', 'already_resolved', 'Repeating the replacement changes nothing');
reset role;
select is((select count(*) from public.service_jobs where request_id = current_setting('test.r3')::uuid)::integer, 0, 'The old assignment is detached');
select is((select released_by_role from public.service_job_releases where request_id = current_setting('test.r3')::uuid), 'operator', 'The release is recorded as an operator decision');
select is((select reason from public.service_job_releases where request_id = current_setting('test.r3')::uuid), 'operator_decision', 'The release reason is the operator decision');
select is((select released_by from public.service_job_releases where request_id = current_setting('test.r3')::uuid), '00000000-0000-4000-8000-00000000b6e1'::uuid, 'The operator who decided is recorded');
select is((select count(*) from public.notifications where kind = 'job_withdrawn' and request_id = current_setting('test.r3')::uuid and recipient_id = '00000000-0000-4000-8000-00000000b6d1')::integer, 1, 'The replaced worker is told once');
select is((select count(*) from public.notifications where kind = 'escalation_resolved' and request_id = current_setting('test.r3')::uuid and recipient_id = '00000000-0000-4000-8000-00000000b6c1')::integer, 1, 'The customer is told once');
select is((select count(*) from public.notifications where kind = 'escalation_resolved' and request_id = current_setting('test.r3')::uuid and recipient_id = '00000000-0000-4000-8000-00000000b6d1')::integer, 0, 'The replaced worker gets the withdrawal instead of a second message');
select is((select status from public.service_job_escalations where id = current_setting('test.e3')::uuid), 'resolved', 'The case is closed after the replacement');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b6c1","role":"authenticated"}', true);
select isnt((select state from public.get_dispatch_summary(array[current_setting('test.r3')::uuid])), 'assigned', 'The customer request is searching again after the replacement');
select is((select count(*) from public.service_job_escalations where request_id = current_setting('test.r3')::uuid)::integer, 1, 'The customer keeps the case history');

reset role;
update public.worker_public_profiles set accepting_jobs = true where worker_id = '00000000-0000-4000-8000-00000000b6d2';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b6e1","role":"authenticated"}', true);
select is(public.review_service_escalation(current_setting('test.e4')::uuid, '4a100000-0000-4000-8000-000000000040')::jsonb ->> 'outcome', 'reviewing', 'The fourth case is reviewed');
select is(public.resolve_service_escalation(current_setting('test.e4')::uuid, 'replace_worker', null, '4b100000-0000-4000-8000-000000000040')::jsonb ->> 'outcome', 'resolved', 'The operator replaces the worker while another is available');
reset role;
select is((select count(*) from public.service_invitations where request_id = current_setting('test.r4')::uuid and worker_id = '00000000-0000-4000-8000-00000000b6d2' and state = 'open')::integer, 1, 'The replacement search invites the other worker');
select ok((select body from public.notifications where kind = 'escalation_resolved' and request_id = current_setting('test.r4')::uuid and recipient_id = '00000000-0000-4000-8000-00000000b6c1') like '%mời thợ khác%', 'The customer is told a new worker was invited');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b6d1","role":"authenticated"}', true);
select lives_ok($$select public.advance_service_job(current_setting('test.j5')::uuid, 3, 'working')$$, 'The worker starts job five while its case is open');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b6e1","role":"authenticated"}', true);
select is(public.review_service_escalation(current_setting('test.e5')::uuid, '4a100000-0000-4000-8000-000000000050')::jsonb ->> 'outcome', 'reviewing', 'The operator can still review a case whose worker has started');
select throws_ok($$select public.resolve_service_escalation(current_setting('test.e5')::uuid, 'replace_worker', null, '4b100000-0000-4000-8000-000000000050')$$,
  '22023', 'release not allowed at this stage', 'A worker who has started cannot be replaced');
select is((select status from public.operator_escalation_queue() where escalation_id = current_setting('test.e5')::uuid), 'reviewing', 'The refused replacement leaves the case in review');
select is(public.resolve_service_escalation(current_setting('test.e5')::uuid, 'proceed', null, '4b100000-0000-4000-8000-000000000051')::jsonb ->> 'outcome', 'resolved', 'The case is closed by letting the work continue');
reset role;
select is((select stage from public.service_jobs where id = current_setting('test.j5')::uuid), 'working', 'The started job keeps running');
select is((select count(*) from public.service_job_releases where request_id = current_setting('test.r5')::uuid)::integer, 0, 'Nothing was archived for the started job');
select is((select count(*) from public.notifications where kind = 'escalation_resolved' and request_id = current_setting('test.r5')::uuid)::integer, 2, 'Both participants are told the started job was reviewed');

select * from finish();
rollback;
