begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-00000000a3c1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a3c2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a3d1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a3d2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a3d3', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a3d4', 'authenticated', 'authenticated');
insert into public.worker_access_grants (user_id) values
  ('00000000-0000-4000-8000-00000000a3d1'), ('00000000-0000-4000-8000-00000000a3d2'),
  ('00000000-0000-4000-8000-00000000a3d3'), ('00000000-0000-4000-8000-00000000a3d4');
insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active) values
  ('00000000-0000-4000-8000-00000000a3d1', 'local_fixture', true),
  ('00000000-0000-4000-8000-00000000a3d2', 'local_fixture', true),
  ('00000000-0000-4000-8000-00000000a3d3', 'local_fixture', true),
  ('00000000-0000-4000-8000-00000000a3d4', 'local_fixture', true);
insert into public.worker_public_profiles (worker_id, display_name, trade, area, experience_years, about, skills, service_ids, accepting_jobs) values
  ('00000000-0000-4000-8000-00000000a3d1', 'Thợ một', 'Thợ điện', 'Quận 7', 5, 'Sửa điện', array['Điện'], array['electric'], true),
  ('00000000-0000-4000-8000-00000000a3d2', 'Thợ hai', 'Thợ điện', 'Quận 3', 4, 'Sửa điện', array['Điện'], array['electric'], true),
  ('00000000-0000-4000-8000-00000000a3d3', 'Thợ ba', 'Thợ điện', 'Quận 1', 4, 'Sửa điện', array['Điện'], array['electric'], true),
  ('00000000-0000-4000-8000-00000000a3d4', 'Thợ bốn', 'Thợ nước', 'Quận 2', 4, 'Sửa nước', array['Nước'], array['water'], true);

update nestscout_private.auto_dispatch_settings set enabled = true, max_invites = 1, max_rounds = 3, retry_cooldown_minutes = 5,
  max_manual_retries = 2, empty_retry_cooldown_seconds = 60, max_invites_per_worker = 2,
  reinvite_declined_after_minutes = 1440, reinvite_expired_after_minutes = 60, offer_minutes = 30;

select ok(not has_function_privilege('authenticated', 'nestscout_private.sweep_expired_invitations(integer)', 'execute'), 'Clients cannot run the expiry sweeper');
select ok(not has_function_privilege('anon', 'nestscout_private.sweep_expired_invitations(integer)', 'execute'), 'Anonymous callers cannot run the expiry sweeper');
select ok(not has_function_privilege('authenticated', 'nestscout_private.dispatch_request(uuid, uuid, text)', 'execute'), 'Clients cannot call the dispatch core');
select ok(not has_function_privilege('authenticated', 'nestscout_private.dispatch_state(uuid, uuid[])', 'execute'), 'Clients cannot read another owner dispatch state');
select ok(not has_function_privilege('authenticated', 'nestscout_private.schedule_dispatch_sweeper()', 'execute'), 'Clients cannot reschedule the sweeper');
select is(nestscout_private.schedule_dispatch_sweeper(), 'pg_cron not installed', 'The schedule step reports honestly when pg_cron is unavailable');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c1","role":"authenticated"}', true);
select set_config('test.x', public.submit_service_request('33000000-0000-4000-8000-000000000001', 'Chập điện phòng khách', 'Quận 7', 'electric')::text, true);
select set_config('test.qx', (select id::text from public.service_quotes where request_id = current_setting('test.x')::uuid), true);
select lives_ok($$select public.accept_service_quote(current_setting('test.qx')::uuid, 1)$$, 'The customer accepts the electric price');

reset role;
select is((select count(*) from public.service_invitations where request_id = current_setting('test.x')::uuid)::integer, 1, 'One worker is invited in round one');
select is((select worker_id from public.service_invitations where request_id = current_setting('test.x')::uuid), '00000000-0000-4000-8000-00000000a3d1'::uuid, 'The first eligible worker is invited');
select set_config('test.i1', (select id::text from public.service_invitations where request_id = current_setting('test.x')::uuid), true);
update public.service_invitations set expires_at = clock_timestamp() - interval '1 minute' where id = current_setting('test.i1')::uuid;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c1","role":"authenticated"}', true);
select is((select state from public.get_dispatch_summary(array[current_setting('test.x')::uuid])), 'recovering', 'A lapsed offer that is not yet swept reports recovering');
select is((select can_retry from public.get_dispatch_summary(array[current_setting('test.x')::uuid])), false, 'A recovering request cannot be retried by hand');
select is((select can_cancel from public.get_dispatch_summary(array[current_setting('test.x')::uuid])), true, 'A recovering request can still be cancelled');
select is(public.retry_service_dispatch(current_setting('test.x')::uuid) ->> 'outcome', 'already_searching', 'A retry while recovery is pending is not a second search');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3d1","role":"authenticated"}', true);
select is((select count(*) from public.worker_offers())::integer, 0, 'The worker no longer sees the lapsed offer');
select throws_ok($$select public.accept_service_invitation(current_setting('test.i1')::uuid, current_setting('test.qx')::uuid, 1)$$,
  '22023', 'invitation expired', 'A worker cannot accept a lapsed offer');
select throws_ok($$select public.decline_service_invitation(current_setting('test.i1')::uuid, current_setting('test.qx')::uuid, 1)$$,
  '22023', 'invitation expired', 'A worker cannot decline a lapsed offer');

reset role;
select is(nestscout_private.auto_accept_invitation(current_setting('test.i1')::uuid), null, 'A lapsed offer is never auto-accepted');
select is(nestscout_private.sweep_expired_invitations(), 1, 'The sweeper handles the lapsed request');
select is((select state from public.service_invitations where id = current_setting('test.i1')::uuid), 'expired', 'The lapsed offer becomes expired');
select is((select count(*) from public.service_invitations where request_id = current_setting('test.x')::uuid)::integer, 2, 'The sweeper invites the next worker');
select is((select worker_id from public.service_invitations where request_id = current_setting('test.x')::uuid and state = 'open'), '00000000-0000-4000-8000-00000000a3d2'::uuid, 'The next worker is a different one');
select is((select reason from public.service_dispatch_rounds where request_id = current_setting('test.x')::uuid and round = 2), 'expired', 'The follow-up round is attributed to the expiry');
select is(nestscout_private.sweep_expired_invitations(), 0, 'A second tick finds nothing to do');
select is((select count(*) from public.service_invitations where request_id = current_setting('test.x')::uuid)::integer, 2, 'A second tick never duplicates invitations');
select is((select count(*) from public.service_dispatch_rounds where request_id = current_setting('test.x')::uuid)::integer, 2, 'A second tick never duplicates rounds');
select is((select count(*) from public.notifications where kind = 'dispatch_exhausted')::integer, 0, 'No customer notice is sent while the search continues');
select is((select resolved_at is not null from public.service_invitations where id = current_setting('test.i1')::uuid), true, 'Resolution time is stamped');

update public.service_invitations set expires_at = clock_timestamp() - interval '1 minute' where request_id = current_setting('test.x')::uuid and state = 'open';
select is(nestscout_private.sweep_expired_invitations(), 1, 'The second lapse is handled');
select is((select worker_id from public.service_invitations where request_id = current_setting('test.x')::uuid and state = 'open'), '00000000-0000-4000-8000-00000000a3d3'::uuid, 'The third worker is reached');
update public.service_invitations set expires_at = clock_timestamp() - interval '1 minute' where request_id = current_setting('test.x')::uuid and state = 'open';
select is(nestscout_private.sweep_expired_invitations(), 1, 'The third lapse is handled');
select is((select outcome from public.service_dispatch_rounds where request_id = current_setting('test.x')::uuid and round = 4), 'limit_reached', 'The exhausted automatic budget is recorded as limit_reached');
select is((select count(*) from public.service_invitations where request_id = current_setting('test.x')::uuid and state = 'open')::integer, 0, 'No further automatic offer is made');
select is((select count(*) from public.notifications where kind = 'dispatch_exhausted')::integer, 1, 'The customer is told once that automatic search is over');
select is(nestscout_private.sweep_expired_invitations(), 0, 'A further tick neither invites nor notifies');
select is((select count(*) from public.notifications where kind = 'dispatch_exhausted')::integer, 1, 'The notice is not repeated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c1","role":"authenticated"}', true);
select is((select state from public.get_dispatch_summary(array[current_setting('test.x')::uuid])), 'exhausted', 'The request reports exhausted');
select is((select last_outcome from public.get_dispatch_summary(array[current_setting('test.x')::uuid])), 'limit_reached', 'The summary says the automatic budget is spent');
select is((select can_retry from public.get_dispatch_summary(array[current_setting('test.x')::uuid])), false, 'A retry waits for the successful-dispatch cooldown');
select ok((select next_retry_at from public.get_dispatch_summary(array[current_setting('test.x')::uuid])) > clock_timestamp(), 'The summary exposes the next retry time');
select is((select retries_left from public.get_dispatch_summary(array[current_setting('test.x')::uuid])), 2, 'Two manual retries remain');
select is(public.retry_service_dispatch(current_setting('test.x')::uuid) ->> 'outcome', 'cooldown', 'A retry inside the cooldown is refused with a structured outcome');

reset role;
update public.service_dispatch_rounds set created_at = created_at - interval '10 minutes' where request_id = current_setting('test.x')::uuid;
update public.service_invitations set expires_at = expires_at - interval '3 hours', resolved_at = resolved_at - interval '3 hours' where request_id = current_setting('test.x')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c1","role":"authenticated"}', true);
select is((select can_retry from public.get_dispatch_summary(array[current_setting('test.x')::uuid])), true, 'A retry is allowed once the cooldown has passed');
select set_config('test.r1', public.retry_service_dispatch(current_setting('test.x')::uuid)::text, true);
select is(current_setting('test.r1')::jsonb ->> 'outcome', 'invited', 'The manual retry reports a real invitation');
select is((current_setting('test.r1')::jsonb ->> 'invited')::integer, 1, 'It reports how many workers were invited');
select is((current_setting('test.r1')::jsonb ->> 'state'), 'searching', 'The returned state is searching only now');
select is(public.retry_service_dispatch(current_setting('test.x')::uuid) ->> 'outcome', 'already_searching', 'A repeated retry while searching adds nothing');

reset role;
select is((select count(*) from public.service_invitations where request_id = current_setting('test.x')::uuid and state = 'open')::integer, 1, 'Exactly one offer is open after the retry');
select is((select worker_id from public.service_invitations where request_id = current_setting('test.x')::uuid and state = 'open'), '00000000-0000-4000-8000-00000000a3d1'::uuid, 'A lapsed worker beyond the cooldown may be invited again');
select is((select count(*) from public.service_invitations where request_id = current_setting('test.x')::uuid and worker_id = '00000000-0000-4000-8000-00000000a3d1')::integer, 2, 'The per-worker count is two');
select set_config('test.i4', (select id::text from public.service_invitations where request_id = current_setting('test.x')::uuid and state = 'open'), true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3d1","role":"authenticated"}', true);
select lives_ok($$select public.decline_service_invitation(current_setting('test.i4')::uuid, current_setting('test.qx')::uuid, 1)$$, 'The re-invited worker declines');
reset role;
select is((select count(*) from public.service_invitations where request_id = current_setting('test.x')::uuid and state = 'open')::integer, 0, 'A decline after the automatic budget does not invite anyone');
select is((select outcome from public.service_dispatch_rounds where request_id = current_setting('test.x')::uuid order by round desc limit 1), 'limit_reached', 'The decline is recorded against the spent budget');
select is((select count(*) from public.notifications where kind = 'dispatch_exhausted')::integer, 2, 'The new terminal transition notifies once more');

update public.service_dispatch_rounds set created_at = created_at - interval '10 minutes' where request_id = current_setting('test.x')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c1","role":"authenticated"}', true);
select set_config('test.r2', public.retry_service_dispatch(current_setting('test.x')::uuid)::text, true);
select is(current_setting('test.r2')::jsonb ->> 'outcome', 'invited', 'The second manual retry invites a worker');
reset role;
select is((select worker_id from public.service_invitations where request_id = current_setting('test.x')::uuid and state = 'open'), '00000000-0000-4000-8000-00000000a3d2'::uuid,
  'A worker who just declined is skipped and another lapsed worker is chosen');
update public.service_invitations set expires_at = clock_timestamp() - interval '1 minute' where request_id = current_setting('test.x')::uuid and state = 'open';
select is(nestscout_private.sweep_expired_invitations(), 1, 'The retry offer lapses and is swept');
update public.service_dispatch_rounds set created_at = created_at - interval '10 minutes' where request_id = current_setting('test.x')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c1","role":"authenticated"}', true);
select is((select retries_left from public.get_dispatch_summary(array[current_setting('test.x')::uuid])), 0, 'No manual retry remains');
select is((select can_retry from public.get_dispatch_summary(array[current_setting('test.x')::uuid])), false, 'The retry control closes once the manual budget is spent');
select is(public.retry_service_dispatch(current_setting('test.x')::uuid) ->> 'outcome', 'limit_reached', 'A further retry reports limit_reached');
select throws_ok($$select public.redispatch_service_request(current_setting('test.x')::uuid)$$, '22023', 'limit_reached', 'The legacy entry point raises limit_reached');
select is((select can_cancel from public.get_dispatch_summary(array[current_setting('test.x')::uuid])), true, 'Cancellation is always available before assignment');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c2","role":"authenticated"}', true);
select set_config('test.y', public.submit_service_request('33000000-0000-4000-8000-000000000002', 'Thay công tắc', 'Quận 3', 'electric')::text, true);
select set_config('test.qy', (select id::text from public.service_quotes where request_id = current_setting('test.y')::uuid), true);
reset role;
update nestscout_private.auto_dispatch_settings set max_invites = 3;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c2","role":"authenticated"}', true);
select lives_ok($$select public.accept_service_quote(current_setting('test.qy')::uuid, 1)$$, 'A second customer accepts a price with three eligible workers');
reset role;
select is((select count(*) from public.service_invitations where request_id = current_setting('test.y')::uuid and state = 'open')::integer, 3, 'Three workers are invited');
select set_config('test.iy3', (select id::text from public.service_invitations where request_id = current_setting('test.y')::uuid and worker_id = '00000000-0000-4000-8000-00000000a3d3'), true);
update nestscout_private.auto_dispatch_settings set max_invites = 1;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3d3","role":"authenticated"}', true);
select lives_ok($$select public.accept_service_invitation(current_setting('test.iy3')::uuid, current_setting('test.qy')::uuid, 1)$$, 'One worker accepts first');
reset role;
update public.service_invitations set expires_at = clock_timestamp() - interval '1 minute' where request_id = current_setting('test.y')::uuid and state = 'open';
select is(nestscout_private.sweep_expired_invitations(), 1, 'The sweeper retires the offers left over after an assignment');
select is((select count(*) from public.service_invitations where request_id = current_setting('test.y')::uuid and state = 'open')::integer, 0, 'No offer stays open on an assigned request');
select is((select count(*) from public.service_dispatch_rounds where request_id = current_setting('test.y')::uuid)::integer, 1, 'The sweeper never dispatches an assigned request');
select is((select count(*) from public.service_jobs where request_id = current_setting('test.y')::uuid)::integer, 1, 'Exactly one job exists');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c2","role":"authenticated"}', true);
select is((select state from public.get_dispatch_summary(array[current_setting('test.y')::uuid])), 'assigned', 'An assigned request reports assigned');
select is(public.retry_service_dispatch(current_setting('test.y')::uuid) ->> 'outcome', 'already_assigned', 'An assigned request cannot be retried');
select throws_ok($$select public.redispatch_service_request(current_setting('test.y')::uuid)$$, 'PGRST', nestscout_private.conflict_body('already assigned'), 'The legacy retry entry point reports an assigned request');
select throws_ok($$select public.cancel_service_request(current_setting('test.y')::uuid)$$, 'PGRST', nestscout_private.conflict_body('already assigned'), 'An assigned request is not cancelled silently');
select is((select count(*) from public.service_jobs where request_id = current_setting('test.y')::uuid and stage = 'assigned')::integer, 1, 'The assigned job is untouched by the refused cancellation');

select set_config('test.z', public.submit_service_request('33000000-0000-4000-8000-000000000003', 'Hỏng ổ cắm', 'Quận 3', 'electric')::text, true);
select set_config('test.qz', (select id::text from public.service_quotes where request_id = current_setting('test.z')::uuid), true);
select lives_ok($$select public.accept_service_quote(current_setting('test.qz')::uuid, 1)$$, 'A request is accepted and offered');
reset role;
select set_config('test.iz', (select id::text from public.service_invitations where request_id = current_setting('test.z')::uuid and state = 'open'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c2","role":"authenticated"}', true);
select is(public.cancel_service_request(current_setting('test.z')::uuid), current_setting('test.z')::uuid, 'The owner cancels with an offer open');
select throws_ok($$select public.accept_service_quote(current_setting('test.qz')::uuid, 1)$$, '22023', 'request cancelled', 'Re-accepting an accepted quote on a cancelled request is refused');
select throws_ok($$select public.reject_service_quote(current_setting('test.qz')::uuid, 1)$$, '22023', 'request cancelled', 'Rejecting a quote on a cancelled request is refused');
select is(public.retry_service_dispatch(current_setting('test.z')::uuid) ->> 'outcome', 'cancelled', 'A cancelled request cannot return to searching');
reset role;
update public.service_invitations set state = 'open', expires_at = clock_timestamp() - interval '1 minute' where id = current_setting('test.iz')::uuid;
select is(nestscout_private.sweep_expired_invitations(), 1, 'A stray lapsed offer on a cancelled request is retired');
select is((select count(*) from public.service_invitations where request_id = current_setting('test.z')::uuid and state = 'open')::integer, 0, 'A cancelled request never gets a new offer');
select is((select count(*) from public.service_dispatch_rounds where request_id = current_setting('test.z')::uuid)::integer, 1, 'The sweeper adds no round to a cancelled request');
select is(nestscout_private.dispatch_request(current_setting('test.z')::uuid, current_setting('test.qz')::uuid, 'manual_retry') ->> 'outcome', 'cancelled', 'The dispatch core refuses a cancelled request');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c1","role":"authenticated"}', true);
select set_config('test.l', public.submit_service_request('33000000-0000-4000-8000-000000000004', 'Mất điện một phòng', 'Quận 7', 'electric')::text, true);
select set_config('test.ql', (select id::text from public.service_quotes where request_id = current_setting('test.l')::uuid), true);
reset role;
update nestscout_private.auto_dispatch_settings set enabled = false;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c1","role":"authenticated"}', true);
select lives_ok($$select public.accept_service_quote(current_setting('test.ql')::uuid, 1)$$, 'A legacy accept happens while dispatch is off');
reset role;
update nestscout_private.auto_dispatch_settings set enabled = true;
select is((select count(*) from public.service_dispatch_rounds where request_id = current_setting('test.l')::uuid)::integer, 0, 'The legacy request has no recorded round');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c1","role":"authenticated"}', true);
select is((select state from public.get_dispatch_summary(array[current_setting('test.l')::uuid])), 'not_dispatched', 'The legacy request reports not_dispatched');
select is((select can_retry from public.get_dispatch_summary(array[current_setting('test.l')::uuid])), true, 'The owner may recover it');
select set_config('test.r3', public.retry_service_dispatch(current_setting('test.l')::uuid)::text, true);
select is(current_setting('test.r3')::jsonb ->> 'outcome', 'invited', 'Recovery invites a worker');
reset role;
select is((select reason from public.service_dispatch_rounds where request_id = current_setting('test.l')::uuid and round = 1), 'recovery', 'Recovery is recorded under its own reason');
select is((select count(*) from public.service_dispatch_rounds where request_id = current_setting('test.l')::uuid)::integer, 1, 'Recovery writes one round and no backdated history');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c1","role":"authenticated"}', true);
select is(public.retry_service_dispatch(current_setting('test.l')::uuid) ->> 'outcome', 'already_searching', 'Repeating the recovery is idempotent');
reset role;
select is((select count(*) from public.service_invitations where request_id = current_setting('test.l')::uuid)::integer, 1, 'Repeating the recovery never duplicates invitations');

update nestscout_private.auto_dispatch_settings set enabled = false;
insert into public.service_requests (id, owner_id, submission_key, description, location, service_id) values
  ('13000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a3c1', '23000000-0000-4000-8000-0000000000a1', 'Yêu cầu cũ có lời mời', 'Quận 7', 'electric');
insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at) values
  ('14000000-0000-4000-8000-0000000000a1', '13000000-0000-4000-8000-0000000000a1', 1, 'Kiểm tra', 300000, 'VND', clock_timestamp() + interval '1 day');
update public.service_quotes set accepted_at = clock_timestamp(), accepted_by = '00000000-0000-4000-8000-00000000a3c1' where id = '14000000-0000-4000-8000-0000000000a1';
update nestscout_private.auto_dispatch_settings set enabled = true;
insert into public.service_invitations (id, request_id, quote_id, worker_id, expires_at) values
  ('15000000-0000-4000-8000-0000000000a1', '13000000-0000-4000-8000-0000000000a1', '14000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a3d1', clock_timestamp() + interval '20 minutes');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c1","role":"authenticated"}', true);
select is((select state from public.get_dispatch_summary(array['13000000-0000-4000-8000-0000000000a1']::uuid[])), 'searching', 'Invitations without rounds derive a live search');
select is((select rounds from public.get_dispatch_summary(array['13000000-0000-4000-8000-0000000000a1']::uuid[])), 0, 'No history is fabricated for them');
reset role;
update public.service_invitations set expires_at = clock_timestamp() - interval '1 minute' where id = '15000000-0000-4000-8000-0000000000a1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c1","role":"authenticated"}', true);
select is((select state from public.get_dispatch_summary(array['13000000-0000-4000-8000-0000000000a1']::uuid[])), 'recovering', 'A lapsed legacy offer derives recovering');
reset role;
select is(nestscout_private.sweep_expired_invitations(), 1, 'The sweeper adopts a legacy request');
select is((select min(round) from public.service_dispatch_rounds where request_id = '13000000-0000-4000-8000-0000000000a1'), 1, 'Its first recorded round is the real one the sweeper made');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c1","role":"authenticated"}', true);
select set_config('test.n', public.submit_service_request('33000000-0000-4000-8000-000000000005', 'Không rõ loại việc', 'Quận 7', null)::text, true);
select is((select service_id from public.service_requests where id = current_setting('test.n')::uuid), null, 'A request can arrive without a service');
reset role;
insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at) values
  ('14000000-0000-4000-8000-0000000000b1', current_setting('test.n')::uuid, 1, 'Khảo sát', 200000, 'VND', clock_timestamp() + interval '1 day')
  on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c1","role":"authenticated"}', true);
select set_config('test.qn', (select id::text from public.service_quotes where request_id = current_setting('test.n')::uuid order by version desc limit 1), true);
select lives_ok($$select public.accept_service_quote(current_setting('test.qn')::uuid, (select version from public.service_quotes where id = current_setting('test.qn')::uuid))$$, 'The unclassified request accepts its quote');
select is((select state from public.get_dispatch_summary(array[current_setting('test.n')::uuid])), 'needs_service', 'An unclassified accepted request reports needs_service');
select is((select can_reclassify from public.get_dispatch_summary(array[current_setting('test.n')::uuid])), true, 'The owner may classify it');
select is((select can_retry from public.get_dispatch_summary(array[current_setting('test.n')::uuid])), false, 'A retry is not offered before classification');
select is(public.retry_service_dispatch(current_setting('test.n')::uuid) ->> 'outcome', 'needs_service', 'A retry never claims success while the service is unknown');
select throws_ok($$select public.set_request_service(current_setting('test.n')::uuid, 'guess')$$, '22023', 'invalid service', 'Only listed services are accepted');
select is(public.set_request_service(current_setting('test.n')::uuid, 'electric'), 'electric', 'The owner classifies the request');
select throws_ok($$select public.set_request_service(current_setting('test.n')::uuid, 'water')$$, '22023', 'service already set', 'A classification is not silently changed');
select is((select state from public.get_dispatch_summary(array[current_setting('test.n')::uuid])), 'not_dispatched', 'After classification the request can be dispatched');
select is(public.retry_service_dispatch(current_setting('test.n')::uuid) ->> 'outcome', 'invited', 'It is then dispatched on explicit request');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c2","role":"authenticated"}', true);
select throws_ok($$select public.set_request_service(current_setting('test.n')::uuid, 'electric')$$, '42501', 'request unavailable', 'Another customer cannot classify the request');
select throws_ok($$select public.retry_service_dispatch(current_setting('test.n')::uuid)$$, '42501', 'request unavailable', 'Another customer cannot retry the request');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3d1","role":"authenticated"}', true);
select throws_ok($$select public.retry_service_dispatch(current_setting('test.n')::uuid)$$, '42501', 'request unavailable', 'A worker cannot retry a customer request');
select throws_ok($$select public.set_request_service(current_setting('test.n')::uuid, 'electric')$$, '42501', 'request unavailable', 'A worker cannot classify a customer request');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a3c1","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select public.retry_service_dispatch(current_setting('test.n')::uuid)$$, '42501', 'authentication required', 'An anonymous session cannot retry');
select throws_ok($$select public.set_request_service(current_setting('test.n')::uuid, 'electric')$$, '42501', 'authentication required', 'An anonymous session cannot classify');
select throws_ok($$select nestscout_private.sweep_expired_invitations()$$, '42501', null, 'An anonymous session cannot sweep');

select * from finish();
rollback;
