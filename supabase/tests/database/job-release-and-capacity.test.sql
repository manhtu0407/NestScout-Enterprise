begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-00000000a4c1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a4c2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a4d1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a4d2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a4d3', 'authenticated', 'authenticated');
insert into public.worker_access_grants (user_id) values
  ('00000000-0000-4000-8000-00000000a4d1'), ('00000000-0000-4000-8000-00000000a4d2'), ('00000000-0000-4000-8000-00000000a4d3');
insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active) values
  ('00000000-0000-4000-8000-00000000a4d1', 'local_fixture', true),
  ('00000000-0000-4000-8000-00000000a4d2', 'local_fixture', true),
  ('00000000-0000-4000-8000-00000000a4d3', 'local_fixture', true);
insert into public.worker_public_profiles (worker_id, display_name, trade, area, experience_years, about, skills, service_ids, accepting_jobs) values
  ('00000000-0000-4000-8000-00000000a4d1', 'Thợ một', 'Thợ điện', 'Quận 7', 5, 'Sửa điện', array['Điện'], array['electric'], true),
  ('00000000-0000-4000-8000-00000000a4d2', 'Thợ hai', 'Thợ điện', 'Quận 3', 4, 'Sửa điện', array['Điện'], array['electric'], false),
  ('00000000-0000-4000-8000-00000000a4d3', 'Thợ ba', 'Thợ điện', 'Quận 1', 4, 'Sửa điện', array['Điện'], array['electric'], false);

update nestscout_private.auto_dispatch_settings set enabled = true, max_invites = 1, max_rounds = 3, retry_cooldown_minutes = 5,
  max_manual_retries = 2, empty_retry_cooldown_seconds = 60, max_invites_per_worker = 2,
  reinvite_declined_after_minutes = 1440, reinvite_expired_after_minutes = 60, offer_minutes = 30,
  max_active_jobs_per_worker = 2, visit_conflict_minutes = 120, reassign_idle_minutes = 120;

select ok(not has_function_privilege('authenticated', 'nestscout_private.release_job(uuid, uuid, text, text, text, uuid, integer)', 'execute'), 'Clients cannot call the release core');
select ok(not has_function_privilege('authenticated', 'nestscout_private.worker_unavailable_reason(uuid, uuid)', 'execute'), 'Clients cannot probe worker capacity');
select ok(has_function_privilege('authenticated', 'public.release_service_job(uuid, integer, uuid, text, text)', 'execute'), 'Signed-in workers can release a job');
select ok(has_function_privilege('authenticated', 'public.request_service_reassignment(uuid, uuid, text)', 'execute'), 'Signed-in customers can ask for another worker');
select ok(not has_function_privilege('anon', 'public.release_service_job(uuid, integer, uuid, text, text)', 'execute'), 'Anonymous callers cannot release a job');
select ok(not has_function_privilege('anon', 'public.request_service_reassignment(uuid, uuid, text)', 'execute'), 'Anonymous callers cannot ask for another worker');
select ok(not has_table_privilege('authenticated', 'public.service_job_releases', 'insert'), 'Clients cannot write release records');
select ok(not has_table_privilege('anon', 'public.service_job_releases', 'select'), 'Anonymous callers cannot read release records');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4c1","role":"authenticated"}', true);
select set_config('test.r1', public.submit_service_request('44000000-0000-4000-8000-000000000001', 'Chập điện phòng khách', 'Quận 7', 'electric')::text, true);
select set_config('test.r2', public.submit_service_request('44000000-0000-4000-8000-000000000002', 'Thay ổ cắm phòng ngủ', 'Quận 7', 'electric')::text, true);
select set_config('test.r3', public.submit_service_request('44000000-0000-4000-8000-000000000003', 'Sửa quạt trần', 'Quận 7', 'electric')::text, true);
select lives_ok($$select public.accept_service_quote((select id from public.service_quotes where request_id = current_setting('test.r1')::uuid), 1)$$, 'The first quote is accepted');
select lives_ok($$select public.accept_service_quote((select id from public.service_quotes where request_id = current_setting('test.r2')::uuid), 1)$$, 'The second quote is accepted');
select lives_ok($$select public.accept_service_quote((select id from public.service_quotes where request_id = current_setting('test.r3')::uuid), 1)$$, 'The third quote is accepted');

reset role;
select is((select count(*) from public.service_invitations where state = 'open' and worker_id = '00000000-0000-4000-8000-00000000a4d1')::integer, 3, 'The only accepting worker is offered all three requests');
select set_config('test.i1', (select id::text from public.service_invitations where request_id = current_setting('test.r1')::uuid), true);
select set_config('test.i2', (select id::text from public.service_invitations where request_id = current_setting('test.r2')::uuid), true);
select set_config('test.i3', (select id::text from public.service_invitations where request_id = current_setting('test.r3')::uuid), true);
select set_config('test.q1', (select id::text from public.service_quotes where request_id = current_setting('test.r1')::uuid), true);
select set_config('test.q2', (select id::text from public.service_quotes where request_id = current_setting('test.r2')::uuid), true);
select set_config('test.q3', (select id::text from public.service_quotes where request_id = current_setting('test.r3')::uuid), true);
select is(nestscout_private.worker_unavailable_reason('00000000-0000-4000-8000-00000000a4d1', current_setting('test.r3')::uuid), null, 'A worker under the cap is available');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4d1","role":"authenticated"}', true);
select lives_ok($$select public.accept_service_invitation(current_setting('test.i1')::uuid, current_setting('test.q1')::uuid, 1)$$, 'The worker accepts the first job');
select lives_ok($$select public.accept_service_invitation(current_setting('test.i2')::uuid, current_setting('test.q2')::uuid, 1)$$, 'The worker accepts the second job');
select throws_ok($$select public.accept_service_invitation(current_setting('test.i3')::uuid, current_setting('test.q3')::uuid, 1)$$,
  '40001', 'worker at capacity', 'A third active job is refused at the cap');
select is((select count(*) from public.worker_offers())::integer, 1, 'The refused offer is still the worker''s only open offer');

reset role;
select is((select count(*) from public.service_jobs where worker_id = '00000000-0000-4000-8000-00000000a4d1')::integer, 2, 'The refused acceptance created no job');
select is((select state from public.service_invitations where id = current_setting('test.i3')::uuid), 'open', 'The refused offer stays open for later');
select is(nestscout_private.worker_unavailable_reason('00000000-0000-4000-8000-00000000a4d1', current_setting('test.r3')::uuid), 'capacity', 'A worker at the cap is unavailable');
select is(nestscout_private.auto_accept_invitation(current_setting('test.i3')::uuid), null, 'Auto-accept never exceeds the cap');

update public.worker_public_profiles set accepting_jobs = true where worker_id in ('00000000-0000-4000-8000-00000000a4d2', '00000000-0000-4000-8000-00000000a4d3');
update public.worker_public_profiles set accepting_jobs = false where worker_id = '00000000-0000-4000-8000-00000000a4d1';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4c2","role":"authenticated"}', true);
select set_config('test.r4', public.submit_service_request('44000000-0000-4000-8000-000000000004', 'Đổi công tắc', 'Quận 3', 'electric')::text, true);
select lives_ok($$select public.accept_service_quote((select id from public.service_quotes where request_id = current_setting('test.r4')::uuid), 1)$$, 'A second customer accepts a quote');
reset role;
select is((select worker_id from public.service_invitations where request_id = current_setting('test.r4')::uuid), '00000000-0000-4000-8000-00000000a4d2'::uuid, 'The least loaded free worker is invited');
select set_config('test.i4', (select id::text from public.service_invitations where request_id = current_setting('test.r4')::uuid), true);
select set_config('test.q4', (select id::text from public.service_quotes where request_id = current_setting('test.r4')::uuid), true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4d2","role":"authenticated"}', true);
select lives_ok($$select public.accept_service_invitation(current_setting('test.i4')::uuid, current_setting('test.q4')::uuid, 1)$$, 'The second worker accepts');
select set_config('test.j4', (select id::text from public.service_jobs where request_id = current_setting('test.r4')::uuid), true);
select throws_ok($$select public.release_service_job(current_setting('test.j4')::uuid, 7, '45000000-0000-4000-8000-000000000001', 'unavailable', null)$$,
  '40001', 'stale job', 'A release against a stale version is refused');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4d3","role":"authenticated"}', true);
select throws_ok($$select public.release_service_job(current_setting('test.j4')::uuid, 1, '45000000-0000-4000-8000-000000000002', 'unavailable', null)$$,
  '42501', 'job unavailable', 'Another worker cannot release the job');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4c1","role":"authenticated"}', true);
select throws_ok($$select public.release_service_job(current_setting('test.j4')::uuid, 1, '45000000-0000-4000-8000-000000000003', 'unavailable', null)$$,
  '42501', 'worker unavailable', 'A customer cannot use the worker release');
select throws_ok($$select public.request_service_reassignment(current_setting('test.r4')::uuid, '45000000-0000-4000-8000-000000000004', null)$$,
  '42501', 'request unavailable', 'Another customer cannot ask for a new worker on this request');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4c2","role":"authenticated"}', true);
select is((select state from public.get_dispatch_summary(array[current_setting('test.r4')::uuid])), 'assigned', 'The request is assigned');
select is((select can_reassign from public.get_dispatch_summary(array[current_setting('test.r4')::uuid])), false, 'A fresh assignment cannot be replaced yet');
select throws_ok($$select public.request_service_reassignment(current_setting('test.r4')::uuid, '45000000-0000-4000-8000-000000000005', null)$$,
  '22023', 'worker still has time', 'The customer must wait out the grace period');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4d2","role":"authenticated"}', true);
select lives_ok($$select public.advance_service_job(current_setting('test.j4')::uuid, 1, 'en_route')$$, 'The worker heads out');
select is(public.report_service_job(current_setting('test.j4')::uuid, 2, '46000000-0000-4000-8000-000000000001', 'delay', 'Kẹt xe, đến muộn')::text is not null, true, 'The worker reports a delay on the way');
select set_config('test.v4', (select version::text from public.service_jobs where id = current_setting('test.j4')::uuid), true);
select is(public.release_service_job(current_setting('test.j4')::uuid, current_setting('test.v4')::integer, '45000000-0000-4000-8000-000000000006', 'schedule_conflict', 'Trùng lịch')::jsonb ->> 'outcome', 'released', 'The assigned worker releases the job');
select is((select count(*) from public.service_jobs where request_id = current_setting('test.r4')::uuid)::integer, 0, 'The job is gone');
select is(public.release_service_job(current_setting('test.j4')::uuid, current_setting('test.v4')::integer, '45000000-0000-4000-8000-000000000006', 'schedule_conflict', 'Trùng lịch')::jsonb ->> 'outcome', 'already_released', 'Replaying the same release key changes nothing');
select is((select count(*) from public.service_job_releases where request_id = current_setting('test.r4')::uuid)::integer, 1, 'Exactly one release record exists');
select is((select released_by_role from public.service_job_releases where request_id = current_setting('test.r4')::uuid), 'worker', 'The record says who released the job');
select is((select jsonb_array_length(events) from public.service_job_releases where request_id = current_setting('test.r4')::uuid) >= 2, true, 'The job history is archived with the release');
select is((select jsonb_array_length(reports) from public.service_job_releases where request_id = current_setting('test.r4')::uuid), 1, 'The delay report is archived with the release');

reset role;
select is((select count(*) from public.service_job_events where job_id = current_setting('test.j4')::uuid)::integer, 0, 'No orphaned job events remain');
select is((select reason from public.service_dispatch_rounds where request_id = current_setting('test.r4')::uuid order by round desc limit 1), 'worker_released', 'The follow-up round is attributed to the release');
select is((select outcome from public.service_dispatch_rounds where request_id = current_setting('test.r4')::uuid order by round desc limit 1), 'invited', 'The release invites another worker');
select is((select count(*) from public.service_invitations where request_id = current_setting('test.r4')::uuid and state = 'open' and worker_id = '00000000-0000-4000-8000-00000000a4d3')::integer, 1, 'The replacement is a different worker');
select is((select count(*) from public.service_invitations where request_id = current_setting('test.r4')::uuid and worker_id = '00000000-0000-4000-8000-00000000a4d2' and state = 'open')::integer, 0, 'The releasing worker is not offered the job again');
select is((select count(*) from public.notifications where kind = 'job_released' and recipient_id = '00000000-0000-4000-8000-00000000a4c2')::integer, 1, 'The customer is told once that the worker withdrew');
select is((select count(*) from public.service_dispatch_rounds where request_id = current_setting('test.r4')::uuid)::integer, 2, 'The replayed release added no round');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4c2","role":"authenticated"}', true);
select is((select state from public.get_dispatch_summary(array[current_setting('test.r4')::uuid])), 'searching', 'The customer sees the search resume');
select is((select count(*) from public.service_job_releases)::integer, 1, 'The customer can read the release of their own request');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4c1","role":"authenticated"}', true);
select is((select count(*) from public.service_job_releases where request_id = current_setting('test.r4')::uuid)::integer, 0, 'Another customer cannot read the release');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4d1","role":"authenticated"}', true);
select is((select count(*) from public.service_job_releases where request_id = current_setting('test.r4')::uuid)::integer, 0, 'An unrelated worker cannot read the release');

reset role;
select set_config('test.i5', (select id::text from public.service_invitations where request_id = current_setting('test.r4')::uuid and state = 'open'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4d3","role":"authenticated"}', true);
select lives_ok($$select public.accept_service_invitation(current_setting('test.i5')::uuid, current_setting('test.q4')::uuid, 1)$$, 'The replacement worker accepts');
select set_config('test.j5', (select id::text from public.service_jobs where request_id = current_setting('test.r4')::uuid), true);
select lives_ok($$select public.advance_service_job(current_setting('test.j5')::uuid, 1, 'en_route')$$, 'The replacement heads out');
select lives_ok($$select public.advance_service_job(current_setting('test.j5')::uuid, 2, 'arrived')$$, 'The replacement arrives');
select throws_ok($$select public.release_service_job(current_setting('test.j5')::uuid, 3, '45000000-0000-4000-8000-000000000007', 'other', null)$$,
  '22023', 'release not allowed at this stage', 'A worker who has arrived cannot walk away through this path');

reset role;
update public.worker_public_profiles set accepting_jobs = true where worker_id = '00000000-0000-4000-8000-00000000a4d2';
update public.worker_public_profiles set accepting_jobs = false where worker_id = '00000000-0000-4000-8000-00000000a4d3';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4c2","role":"authenticated"}', true);
select set_config('test.r6', public.submit_service_request('44000000-0000-4000-8000-000000000006', 'Kiểm tra cầu dao', 'Quận 3', 'electric')::text, true);
select lives_ok($$select public.accept_service_quote((select id from public.service_quotes where request_id = current_setting('test.r6')::uuid), 1)$$, 'A new quote is accepted');
reset role;
select set_config('test.i6', (select id::text from public.service_invitations where request_id = current_setting('test.r6')::uuid), true);
select set_config('test.q6', (select id::text from public.service_quotes where request_id = current_setting('test.r6')::uuid), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4d2","role":"authenticated"}', true);
select lives_ok($$select public.accept_service_invitation(current_setting('test.i6')::uuid, current_setting('test.q6')::uuid, 1)$$, 'A worker accepts the job that will be abandoned');

reset role;
update public.service_jobs set created_at = clock_timestamp() - interval '3 hours' where request_id = current_setting('test.r6')::uuid;
update public.worker_public_profiles set accepting_jobs = true where worker_id = '00000000-0000-4000-8000-00000000a4d3';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4c2","role":"authenticated"}', true);
select is((select can_reassign from public.get_dispatch_summary(array[current_setting('test.r6')::uuid])), true, 'A worker who never moved after the grace period can be replaced');
select is((select reassign_at is not null from public.get_dispatch_summary(array[current_setting('test.r6')::uuid])), true, 'The summary says when replacement became possible');
select is(public.request_service_reassignment(current_setting('test.r6')::uuid, '45000000-0000-4000-8000-000000000008', 'Thợ không đến')::jsonb ->> 'outcome', 'released', 'The customer asks for another worker');
select is(public.request_service_reassignment(current_setting('test.r6')::uuid, '45000000-0000-4000-8000-000000000008', 'Thợ không đến')::jsonb ->> 'outcome', 'already_released', 'Repeating the request changes nothing');
select is((select state from public.get_dispatch_summary(array[current_setting('test.r6')::uuid])), 'searching', 'The search resumes');
select throws_ok($$select public.request_service_reassignment(current_setting('test.r6')::uuid, '45000000-0000-4000-8000-000000000009', null)$$,
  '22023', 'no worker assigned', 'Without an assigned worker there is nothing to replace');

reset role;
select is((select reason from public.service_job_releases where request_id = current_setting('test.r6')::uuid), 'no_show', 'The record says the customer reported a no-show');
select is((select released_by_role from public.service_job_releases where request_id = current_setting('test.r6')::uuid), 'customer', 'The record says who acted');
select is((select count(*) from public.notifications where kind = 'job_withdrawn' and recipient_id = '00000000-0000-4000-8000-00000000a4d2')::integer, 1, 'The worker is told the job was withdrawn');
select is((select count(*) from public.service_invitations where request_id = current_setting('test.r6')::uuid and worker_id = '00000000-0000-4000-8000-00000000a4d3' and state = 'open')::integer, 1, 'The replacement worker is offered the job');
select is((select count(*) from public.service_invitations where request_id = current_setting('test.r6')::uuid and worker_id = '00000000-0000-4000-8000-00000000a4d2' and state = 'open')::integer, 0, 'The worker who did not show is not offered the job again');
select is((select count(*) from public.service_dispatch_rounds where request_id = current_setting('test.r6')::uuid and reason = 'worker_released' and outcome = 'limit_reached')::integer, 0, 'A replacement search never hits the automatic round cap');

update nestscout_private.auto_dispatch_settings set max_active_jobs_per_worker = 5;
update public.worker_public_profiles set accepting_jobs = true where worker_id = '00000000-0000-4000-8000-00000000a4d1';
update public.worker_public_profiles set accepting_jobs = false where worker_id in ('00000000-0000-4000-8000-00000000a4d2', '00000000-0000-4000-8000-00000000a4d3');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4c2","role":"authenticated"}', true);
select set_config('test.r7', public.submit_service_request('44000000-0000-4000-8000-000000000007', 'Lắp đèn hành lang', 'Quận 3', 'electric')::text, true);
select set_config('test.r8', public.submit_service_request('44000000-0000-4000-8000-000000000008', 'Lắp đèn ban công', 'Quận 3', 'electric')::text, true);
select set_config('test.r9', public.submit_service_request('44000000-0000-4000-8000-000000000009', 'Lắp đèn sân', 'Quận 3', 'electric')::text, true);
select lives_ok($$select public.set_request_preferred_visit(current_setting('test.r7')::uuid, date_trunc('hour', clock_timestamp()) + interval '3 days')$$, 'A visit time is set on the first request');
select lives_ok($$select public.set_request_preferred_visit(current_setting('test.r8')::uuid, date_trunc('hour', clock_timestamp()) + interval '3 days 30 minutes')$$, 'A nearby visit time is set on the second request');
select lives_ok($$select public.set_request_preferred_visit(current_setting('test.r9')::uuid, date_trunc('hour', clock_timestamp()) + interval '3 days 4 hours')$$, 'A distant visit time is set on the third request');
select lives_ok($$select public.accept_service_quote((select id from public.service_quotes where request_id = current_setting('test.r7')::uuid), 1)$$, 'The first visit request is accepted');
select lives_ok($$select public.accept_service_quote((select id from public.service_quotes where request_id = current_setting('test.r8')::uuid), 1)$$, 'The nearby visit request is accepted');
select lives_ok($$select public.accept_service_quote((select id from public.service_quotes where request_id = current_setting('test.r9')::uuid), 1)$$, 'The distant visit request is accepted');
reset role;
select set_config('test.i7', (select id::text from public.service_invitations where request_id = current_setting('test.r7')::uuid), true);
select set_config('test.i8', (select id::text from public.service_invitations where request_id = current_setting('test.r8')::uuid), true);
select set_config('test.i9', (select id::text from public.service_invitations where request_id = current_setting('test.r9')::uuid), true);
select set_config('test.q7', (select id::text from public.service_quotes where request_id = current_setting('test.r7')::uuid), true);
select set_config('test.q8', (select id::text from public.service_quotes where request_id = current_setting('test.r8')::uuid), true);
select set_config('test.q9', (select id::text from public.service_quotes where request_id = current_setting('test.r9')::uuid), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a4d1","role":"authenticated"}', true);
select lives_ok($$select public.accept_service_invitation(current_setting('test.i7')::uuid, current_setting('test.q7')::uuid, 1)$$, 'The worker accepts the first visit');
select throws_ok($$select public.accept_service_invitation(current_setting('test.i8')::uuid, current_setting('test.q8')::uuid, 1)$$,
  '40001', 'schedule conflict', 'A visit within two hours of another job is refused');
select lives_ok($$select public.accept_service_invitation(current_setting('test.i9')::uuid, current_setting('test.q9')::uuid, 1)$$, 'A visit far enough away is accepted');
reset role;
select is(nestscout_private.worker_unavailable_reason('00000000-0000-4000-8000-00000000a4d1', current_setting('test.r8')::uuid), 'schedule_conflict', 'The conflict is reported as a schedule conflict');
select is(nestscout_private.auto_accept_invitation(current_setting('test.i8')::uuid), null, 'Auto-accept never creates a conflicting assignment');
select is((select count(*) from public.service_jobs where request_id = current_setting('test.r8')::uuid)::integer, 0, 'The conflicting request got no job');

select * from finish();
rollback;
