begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-00000000b5c1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000b5c2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000b5d1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000b5d2', 'authenticated', 'authenticated');
insert into public.worker_access_grants (user_id) values
  ('00000000-0000-4000-8000-00000000b5d1'), ('00000000-0000-4000-8000-00000000b5d2');
insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active) values
  ('00000000-0000-4000-8000-00000000b5d1', 'local_fixture', true),
  ('00000000-0000-4000-8000-00000000b5d2', 'local_fixture', true);
insert into public.worker_public_profiles (worker_id, display_name, trade, area, experience_years, about, skills, service_ids, accepting_jobs) values
  ('00000000-0000-4000-8000-00000000b5d1', 'Thợ một', 'Thợ điện', 'Quận 7', 5, 'Sửa điện', array['Điện'], array['electric'], true),
  ('00000000-0000-4000-8000-00000000b5d2', 'Thợ hai', 'Thợ điện', 'Quận 3', 4, 'Sửa điện', array['Điện'], array['electric'], false);

update nestscout_private.auto_dispatch_settings set enabled = true, max_invites = 1, max_rounds = 5, retry_cooldown_minutes = 5,
  max_manual_retries = 2, empty_retry_cooldown_seconds = 60, max_invites_per_worker = 2,
  reinvite_declined_after_minutes = 1440, reinvite_expired_after_minutes = 60, offer_minutes = 30,
  max_active_jobs_per_worker = 10, visit_conflict_minutes = 15,
  assigned_response_minutes = 120, visit_grace_minutes = 30, en_route_arrival_minutes = 120, arrival_escalation_minutes = 60;

select ok(not has_function_privilege('authenticated', 'nestscout_private.job_recovery(uuid)', 'execute'), 'Clients cannot probe the recovery rules directly');
select ok(has_function_privilege('authenticated', 'nestscout_private.escalate_service_job(uuid, uuid, text)', 'execute'), 'The reviewed escalation core is reachable through the public wrapper');
select ok(has_function_privilege('authenticated', 'public.escalate_service_job(uuid, uuid, text)', 'execute'), 'Signed-in customers can escalate a stalled job');
select ok(not has_function_privilege('anon', 'public.escalate_service_job(uuid, uuid, text)', 'execute'), 'Anonymous callers cannot escalate');
select ok(not has_table_privilege('authenticated', 'public.service_job_escalations', 'insert'), 'Clients cannot write escalation records');
select ok(not has_table_privilege('anon', 'public.service_job_escalations', 'select'), 'Anonymous callers cannot read escalation records');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c1","role":"authenticated"}', true);
select set_config('test.r1', public.submit_service_request('47000000-0000-4000-8000-000000000001', 'Chập điện phòng khách', 'Quận 7', 'electric')::text, true);
select set_config('test.r2', public.submit_service_request('47000000-0000-4000-8000-000000000002', 'Thay ổ cắm phòng ngủ', 'Quận 7', 'electric')::text, true);
select set_config('test.r3', public.submit_service_request('47000000-0000-4000-8000-000000000003', 'Sửa quạt trần', 'Quận 7', 'electric')::text, true);
select set_config('test.r4', public.submit_service_request('47000000-0000-4000-8000-000000000004', 'Đổi công tắc', 'Quận 7', 'electric')::text, true);
select set_config('test.r5', public.submit_service_request('47000000-0000-4000-8000-000000000005', 'Lắp đèn hành lang', 'Quận 7', 'electric')::text, true);
select set_config('test.r6', public.submit_service_request('47000000-0000-4000-8000-000000000006', 'Kiểm tra cầu dao', 'Quận 7', 'electric')::text, true);
select set_config('test.r7', public.submit_service_request('47000000-0000-4000-8000-000000000007', 'Lắp quạt hút', 'Quận 7', 'electric')::text, true);
select lives_ok($$select public.set_request_preferred_visit(current_setting('test.r2')::uuid, date_trunc('hour', clock_timestamp()) + interval '1 day')$$, 'A visit time is set on the scheduled request');
select lives_ok($$select public.accept_service_quote((select id from public.service_quotes where request_id = current_setting('test.r1')::uuid), 1)$$, 'Quote one is accepted');
select lives_ok($$select public.accept_service_quote((select id from public.service_quotes where request_id = current_setting('test.r2')::uuid), 1)$$, 'Quote two is accepted');
select lives_ok($$select public.accept_service_quote((select id from public.service_quotes where request_id = current_setting('test.r3')::uuid), 1)$$, 'Quote three is accepted');
select lives_ok($$select public.accept_service_quote((select id from public.service_quotes where request_id = current_setting('test.r4')::uuid), 1)$$, 'Quote four is accepted');
select lives_ok($$select public.accept_service_quote((select id from public.service_quotes where request_id = current_setting('test.r5')::uuid), 1)$$, 'Quote five is accepted');
select lives_ok($$select public.accept_service_quote((select id from public.service_quotes where request_id = current_setting('test.r6')::uuid), 1)$$, 'Quote six is accepted');
select lives_ok($$select public.accept_service_quote((select id from public.service_quotes where request_id = current_setting('test.r7')::uuid), 1)$$, 'Quote seven is accepted');

reset role;
select set_config('test.i1', (select id::text from public.service_invitations where request_id = current_setting('test.r1')::uuid), true);
select set_config('test.i2', (select id::text from public.service_invitations where request_id = current_setting('test.r2')::uuid), true);
select set_config('test.i3', (select id::text from public.service_invitations where request_id = current_setting('test.r3')::uuid), true);
select set_config('test.i4', (select id::text from public.service_invitations where request_id = current_setting('test.r4')::uuid), true);
select set_config('test.i5', (select id::text from public.service_invitations where request_id = current_setting('test.r5')::uuid), true);
select set_config('test.i6', (select id::text from public.service_invitations where request_id = current_setting('test.r6')::uuid), true);
select set_config('test.i7', (select id::text from public.service_invitations where request_id = current_setting('test.r7')::uuid), true);
select set_config('test.q1', (select id::text from public.service_quotes where request_id = current_setting('test.r1')::uuid), true);
select set_config('test.q2', (select id::text from public.service_quotes where request_id = current_setting('test.r2')::uuid), true);
select set_config('test.q3', (select id::text from public.service_quotes where request_id = current_setting('test.r3')::uuid), true);
select set_config('test.q4', (select id::text from public.service_quotes where request_id = current_setting('test.r4')::uuid), true);
select set_config('test.q5', (select id::text from public.service_quotes where request_id = current_setting('test.r5')::uuid), true);
select set_config('test.q6', (select id::text from public.service_quotes where request_id = current_setting('test.r6')::uuid), true);
select set_config('test.q7', (select id::text from public.service_quotes where request_id = current_setting('test.r7')::uuid), true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5d1","role":"authenticated"}', true);
select lives_ok($$select public.accept_service_invitation(current_setting('test.i1')::uuid, current_setting('test.q1')::uuid, 1)$$, 'The worker accepts job one');
select lives_ok($$select public.accept_service_invitation(current_setting('test.i2')::uuid, current_setting('test.q2')::uuid, 1)$$, 'The worker accepts job two');
select lives_ok($$select public.accept_service_invitation(current_setting('test.i3')::uuid, current_setting('test.q3')::uuid, 1)$$, 'The worker accepts job three');
select lives_ok($$select public.accept_service_invitation(current_setting('test.i4')::uuid, current_setting('test.q4')::uuid, 1)$$, 'The worker accepts job four');
select lives_ok($$select public.accept_service_invitation(current_setting('test.i5')::uuid, current_setting('test.q5')::uuid, 1)$$, 'The worker accepts job five');
select lives_ok($$select public.accept_service_invitation(current_setting('test.i6')::uuid, current_setting('test.q6')::uuid, 1)$$, 'The worker accepts job six');
select lives_ok($$select public.accept_service_invitation(current_setting('test.i7')::uuid, current_setting('test.q7')::uuid, 1)$$, 'The worker accepts job seven');

reset role;
select set_config('test.j1', (select id::text from public.service_jobs where request_id = current_setting('test.r1')::uuid), true);
select set_config('test.j2', (select id::text from public.service_jobs where request_id = current_setting('test.r2')::uuid), true);
select set_config('test.j3', (select id::text from public.service_jobs where request_id = current_setting('test.r3')::uuid), true);
select set_config('test.j4', (select id::text from public.service_jobs where request_id = current_setting('test.r4')::uuid), true);
select set_config('test.j5', (select id::text from public.service_jobs where request_id = current_setting('test.r5')::uuid), true);
select set_config('test.j6', (select id::text from public.service_jobs where request_id = current_setting('test.r6')::uuid), true);
select set_config('test.j7', (select id::text from public.service_jobs where request_id = current_setting('test.r7')::uuid), true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c1","role":"authenticated"}', true);
select is((select job_stage from public.get_dispatch_summary(array[current_setting('test.r1')::uuid])), 'assigned', 'The customer sees the job stage');
select is((select can_reassign from public.get_dispatch_summary(array[current_setting('test.r1')::uuid])), false, 'A fresh unscheduled job cannot be replaced yet');
select ok((select reassign_at from public.get_dispatch_summary(array[current_setting('test.r1')::uuid])) > clock_timestamp() + interval '100 minutes', 'An unscheduled job allows the response window before replacement');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5d1","role":"authenticated"}', true);
select lives_ok($$select public.advance_service_job(current_setting('test.j1')::uuid, 1, 'en_route')$$, 'The worker heads out on job one');
reset role;
update public.service_jobs set created_at = clock_timestamp() - interval '3 hours' where id = current_setting('test.j1')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c1","role":"authenticated"}', true);
select is((select job_stage from public.get_dispatch_summary(array[current_setting('test.r1')::uuid])), 'en_route', 'The customer sees the worker on the way');
select is((select can_reassign from public.get_dispatch_summary(array[current_setting('test.r1')::uuid])), false, 'An old assignment does not make a worker who just left replaceable');
select ok((select reassign_at from public.get_dispatch_summary(array[current_setting('test.r1')::uuid])) > clock_timestamp() + interval '100 minutes', 'The travel allowance counts from departure');
select throws_ok($$select public.request_service_reassignment(current_setting('test.r1')::uuid, '48000000-0000-4000-8000-000000000001', null)$$,
  '22023', 'worker still has time', 'A worker who recently left cannot be replaced');

reset role;
update public.service_job_events set created_at = clock_timestamp() - interval '3 hours' where job_id = current_setting('test.j1')::uuid and event = 'en_route';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c1","role":"authenticated"}', true);
select is((select can_reassign from public.get_dispatch_summary(array[current_setting('test.r1')::uuid])), true, 'A worker who left and never arrived can be replaced');
select is(public.request_service_reassignment(current_setting('test.r1')::uuid, '48000000-0000-4000-8000-000000000001', 'Thợ không đến')::jsonb ->> 'outcome', 'released', 'The customer replaces the unreachable en route worker');
select is(public.request_service_reassignment(current_setting('test.r1')::uuid, '48000000-0000-4000-8000-000000000001', 'Thợ không đến')::jsonb ->> 'outcome', 'already_released', 'Repeating the request changes nothing');
reset role;
select is((select stage from public.service_job_releases where request_id = current_setting('test.r1')::uuid), 'en_route', 'The archive keeps the stage the job was in');
select is((select count(*) from public.service_jobs where request_id = current_setting('test.r1')::uuid)::integer, 0, 'The job is detached');
select is((select count(*) from public.notifications where kind = 'job_withdrawn' and recipient_id = '00000000-0000-4000-8000-00000000b5d1')::integer, 1, 'The unreachable worker is told once');
select is((select jsonb_array_length(events) >= 2 from public.service_job_releases where request_id = current_setting('test.r1')::uuid), true, 'The en route history is archived');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c1","role":"authenticated"}', true);
select ok((select reassign_at from public.get_dispatch_summary(array[current_setting('test.r2')::uuid])) > clock_timestamp() + interval '20 hours', 'A scheduled job is judged against the visit time');
reset role;
update public.service_jobs set created_at = clock_timestamp() - interval '3 hours' where id = current_setting('test.j2')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c1","role":"authenticated"}', true);
select is((select can_reassign from public.get_dispatch_summary(array[current_setting('test.r2')::uuid])), false, 'A worker is not replaceable before the scheduled visit');
select throws_ok($$select public.request_service_reassignment(current_setting('test.r2')::uuid, '48000000-0000-4000-8000-000000000002', null)$$,
  '22023', 'worker still has time', 'The customer cannot replace before the visit time');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5d1","role":"authenticated"}', true);
select lives_ok($$select public.advance_service_job(current_setting('test.j2')::uuid, 1, 'en_route')$$, 'The worker leaves early for the scheduled visit');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c1","role":"authenticated"}', true);
select ok((select reassign_at from public.get_dispatch_summary(array[current_setting('test.r2')::uuid])) > clock_timestamp() + interval '20 hours', 'Leaving early does not shorten the wait for the visit');
reset role;
update public.service_requests set preferred_visit_at = clock_timestamp() - interval '2 hours' where id = current_setting('test.r2')::uuid;
update public.service_job_events set created_at = clock_timestamp() - interval '3 hours' where job_id = current_setting('test.j2')::uuid and event = 'en_route';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c1","role":"authenticated"}', true);
select is((select can_reassign from public.get_dispatch_summary(array[current_setting('test.r2')::uuid])), true, 'Once the visit time and grace have passed the worker can be replaced');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5d1","role":"authenticated"}', true);
select lives_ok($$select public.pause_service_job(current_setting('test.j3')::uuid, 1, 'ordinary_interruption')$$, 'The worker pauses before starting');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c1","role":"authenticated"}', true);
select is((select job_stage from public.get_dispatch_summary(array[current_setting('test.r3')::uuid])), 'paused', 'The customer sees the pause');
select is((select can_reassign from public.get_dispatch_summary(array[current_setting('test.r3')::uuid])), false, 'A fresh pause cannot be replaced yet');
reset role;
update public.service_job_pauses set created_at = clock_timestamp() - interval '3 hours' where job_id = current_setting('test.j3')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c1","role":"authenticated"}', true);
select is((select can_reassign from public.get_dispatch_summary(array[current_setting('test.r3')::uuid])), true, 'A worker paused before arrival and silent can be replaced');
select is(public.request_service_reassignment(current_setting('test.r3')::uuid, '48000000-0000-4000-8000-000000000003', 'Thợ tạm dừng quá lâu')::jsonb ->> 'outcome', 'released', 'The customer replaces the paused worker');
reset role;
select is((select jsonb_array_length(pauses) from public.service_job_releases where request_id = current_setting('test.r3')::uuid), 1, 'The pause history is archived');
select is((select count(*) from public.service_job_pauses where job_id = current_setting('test.j3')::uuid)::integer, 0, 'No orphaned pause remains');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5d1","role":"authenticated"}', true);
select lives_ok($$select public.pause_service_job(current_setting('test.j4')::uuid, 1, 'safety_concern')$$, 'The worker raises a safety concern before starting');
select throws_ok($$select public.release_service_job(current_setting('test.j4')::uuid, 2, '48000000-0000-4000-8000-000000000004', 'other', null)$$,
  '22023', 'release not allowed at this stage', 'A safety pause is never auto-resolved by the worker release');
reset role;
update public.service_job_pauses set created_at = clock_timestamp() - interval '3 hours' where job_id = current_setting('test.j4')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c1","role":"authenticated"}', true);
select is((select can_reassign from public.get_dispatch_summary(array[current_setting('test.r4')::uuid])), false, 'A safety pause is never offered for replacement');
select throws_ok($$select public.request_service_reassignment(current_setting('test.r4')::uuid, '48000000-0000-4000-8000-000000000005', null)$$,
  '22023', 'release not allowed at this stage', 'The customer cannot replace a worker who raised a safety concern');

reset role;
update public.service_jobs set created_at = clock_timestamp() - interval '3 hours' where id = current_setting('test.j5')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c1","role":"authenticated"}', true);
select is((select can_reassign from public.get_dispatch_summary(array[current_setting('test.r5')::uuid])), true, 'An unmoving assigned worker is replaceable after the response window');
reset role;
insert into public.service_job_events (job_id, actor_id, event, version)
  values (current_setting('test.j5')::uuid, '00000000-0000-4000-8000-00000000b5d1', 'resumed', 90);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c1","role":"authenticated"}', true);
select is((select can_reassign from public.get_dispatch_summary(array[current_setting('test.r5')::uuid])), false, 'A resume restarts the clock instead of making the worker instantly replaceable');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5d1","role":"authenticated"}', true);
select lives_ok($$select public.advance_service_job(current_setting('test.j6')::uuid, 1, 'en_route')$$, 'The worker heads out on job six');
select lives_ok($$select public.advance_service_job(current_setting('test.j6')::uuid, 2, 'arrived')$$, 'The worker arrives on job six');
select throws_ok($$select public.release_service_job(current_setting('test.j6')::uuid, 3, '48000000-0000-4000-8000-000000000006', 'other', null)$$,
  '22023', 'release not allowed at this stage', 'A worker on site cannot walk away through the release path');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c1","role":"authenticated"}', true);
select is((select job_stage from public.get_dispatch_summary(array[current_setting('test.r6')::uuid])), 'arrived', 'The customer sees the worker on site');
select is((select can_reassign from public.get_dispatch_summary(array[current_setting('test.r6')::uuid])), false, 'A worker on site is never offered for replacement');
select is((select can_escalate from public.get_dispatch_summary(array[current_setting('test.r6')::uuid])), false, 'Escalation waits for the arrival window');
select ok((select escalate_at from public.get_dispatch_summary(array[current_setting('test.r6')::uuid])) > clock_timestamp() + interval '50 minutes', 'The summary says when escalation opens');
select throws_ok($$select public.request_service_reassignment(current_setting('test.r6')::uuid, '48000000-0000-4000-8000-000000000007', null)$$,
  '22023', 'release not allowed at this stage', 'The customer cannot replace a worker who has arrived');
select throws_ok($$select public.escalate_service_job(current_setting('test.r6')::uuid, '49000000-0000-4000-8000-000000000001', null)$$,
  '22023', 'worker still has time', 'Escalation is refused before the arrival window');
select throws_ok($$select public.escalate_service_job(current_setting('test.r1')::uuid, '49000000-0000-4000-8000-000000000002', null)$$,
  '22023', 'no worker assigned', 'Escalation needs an assigned worker');

reset role;
update public.service_job_events set created_at = clock_timestamp() - interval '2 hours' where job_id = current_setting('test.j6')::uuid and event = 'arrived';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c2","role":"authenticated"}', true);
select throws_ok($$select public.escalate_service_job(current_setting('test.r6')::uuid, '49000000-0000-4000-8000-000000000003', null)$$,
  '42501', 'request unavailable', 'Another customer cannot escalate this request');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c1","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select public.escalate_service_job(current_setting('test.r6')::uuid, '49000000-0000-4000-8000-000000000004', null)$$,
  '42501', 'authentication required', 'A guest session cannot escalate');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5d1","role":"authenticated"}', true);
select throws_ok($$select public.escalate_service_job(current_setting('test.r6')::uuid, '49000000-0000-4000-8000-000000000005', null)$$,
  '42501', 'request unavailable', 'The worker cannot escalate against the customer');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c1","role":"authenticated"}', true);
select is((select can_escalate from public.get_dispatch_summary(array[current_setting('test.r6')::uuid])), true, 'Escalation opens once the worker has been on site without starting');
select is(public.escalate_service_job(current_setting('test.r6')::uuid, '49000000-0000-4000-8000-000000000006', 'Thợ đã đến nhưng chưa làm')::jsonb ->> 'outcome', 'escalated', 'The customer escalates explicitly');
select is(public.escalate_service_job(current_setting('test.r6')::uuid, '49000000-0000-4000-8000-000000000006', 'Thợ đã đến nhưng chưa làm')::jsonb ->> 'outcome', 'already_escalated', 'Repeating the same key changes nothing');
select is(public.escalate_service_job(current_setting('test.r6')::uuid, '49000000-0000-4000-8000-000000000007', null)::jsonb ->> 'outcome', 'already_escalated', 'A second escalation with a new key is not duplicated');
select is((select can_escalate from public.get_dispatch_summary(array[current_setting('test.r6')::uuid])), false, 'The summary no longer offers escalation');
select ok((select escalated_at from public.get_dispatch_summary(array[current_setting('test.r6')::uuid])) is not null, 'The summary reports that the job was escalated');
select is((select count(*) from public.service_job_escalations where request_id = current_setting('test.r6')::uuid)::integer, 1, 'The customer reads exactly one escalation');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5d1","role":"authenticated"}', true);
select is((select count(*) from public.service_job_escalations where request_id = current_setting('test.r6')::uuid)::integer, 1, 'The worker reads the escalation about their job');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5d2","role":"authenticated"}', true);
select is((select count(*) from public.service_job_escalations)::integer, 0, 'An unrelated worker reads no escalation');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c2","role":"authenticated"}', true);
select is((select count(*) from public.service_job_escalations)::integer, 0, 'An unrelated customer reads no escalation');

reset role;
select is((select count(*) from public.notifications where kind = 'job_escalated' and recipient_id = '00000000-0000-4000-8000-00000000b5d1')::integer, 1, 'The worker is told once');
select is((select count(*) from public.service_jobs where id = current_setting('test.j6')::uuid)::integer, 1, 'Escalation leaves the job in place');
select is((select stage from public.service_jobs where id = current_setting('test.j6')::uuid), 'arrived', 'Escalation never changes the job stage');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5d1","role":"authenticated"}', true);
select lives_ok($$select public.advance_service_job(current_setting('test.j6')::uuid, 3, 'working')$$, 'The worker starts the job after the escalation');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c1","role":"authenticated"}', true);
select is((select job_stage from public.get_dispatch_summary(array[current_setting('test.r6')::uuid])), 'working', 'The customer sees the work under way');
select is((select can_escalate from public.get_dispatch_summary(array[current_setting('test.r6')::uuid])), false, 'Escalation closes once work starts');
select throws_ok($$select public.escalate_service_job(current_setting('test.r6')::uuid, '49000000-0000-4000-8000-000000000008', null)$$,
  '22023', 'escalation not allowed at this stage', 'Nothing can be escalated once the job is under way');
reset role;
select is((select count(*) from public.service_job_escalations where job_id = current_setting('test.j6')::uuid)::integer, 1, 'The escalation record is kept as history');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5d1","role":"authenticated"}', true);
select set_config('test.c7', public.request_job_change(current_setting('test.j7')::uuid, 'reschedule', clock_timestamp() + interval '2 days', 'Xin dời lịch')::text, true);
select throws_ok($$select public.release_service_job(current_setting('test.j7')::uuid, 1, '48000000-0000-4000-8000-000000000008', 'other', null)$$,
  '22023', 'job has open changes', 'A pending change request blocks the release');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c1","role":"authenticated"}', true);
select is(public.decide_job_change(current_setting('test.c7')::uuid, 'declined'), 'declined', 'The customer declines the change');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5d1","role":"authenticated"}', true);
select is(public.release_service_job(current_setting('test.j7')::uuid, 1, '48000000-0000-4000-8000-000000000008', 'other', null)::jsonb ->> 'outcome', 'released', 'A decided change request no longer blocks the release');
reset role;
select is((select jsonb_array_length(change_requests) from public.service_job_releases where request_id = current_setting('test.r7')::uuid), 1, 'The declined change request is archived');
select is((select count(*) from public.job_change_requests where job_id = current_setting('test.j7')::uuid)::integer, 0, 'No orphaned change request remains');

select set_config('test.worker_releases', (select count(*)::text from public.service_job_releases where worker_id = '00000000-0000-4000-8000-00000000b5d1'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5d1","role":"authenticated"}', true);
select is((public.export_my_data() -> 'released_jobs') #>> '{}' is not null, true, 'The worker export carries a released jobs list');
select is(jsonb_array_length(public.export_my_data() -> 'released_jobs')::text, current_setting('test.worker_releases'), 'The worker export lists every job the worker released');
select is((select e -> 'change_requests' -> 0 ->> 'status' from jsonb_array_elements(public.export_my_data() -> 'released_jobs') e where e ->> 'request_id' = current_setting('test.r7')), 'declined', 'The export carries the archived change request');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000b5c1","role":"authenticated"}', true);
select is((select count(*) from jsonb_array_elements(public.export_my_data() -> 'released_jobs') e where e ->> 'request_id' = current_setting('test.r7'))::integer, 1, 'The customer export lists the released job too');
reset role;

select * from finish();
rollback;
