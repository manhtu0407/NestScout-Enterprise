begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-00000000a2c1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a2c2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a2d1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a2d2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a2d3', 'authenticated', 'authenticated');
insert into public.worker_access_grants (user_id) values
  ('00000000-0000-4000-8000-00000000a2d1'), ('00000000-0000-4000-8000-00000000a2d2'), ('00000000-0000-4000-8000-00000000a2d3');
insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active) values
  ('00000000-0000-4000-8000-00000000a2d1', 'local_fixture', true),
  ('00000000-0000-4000-8000-00000000a2d2', 'local_fixture', true),
  ('00000000-0000-4000-8000-00000000a2d3', 'local_fixture', true);
insert into public.worker_public_profiles (worker_id, display_name, trade, area, experience_years, about, skills, service_ids, accepting_jobs) values
  ('00000000-0000-4000-8000-00000000a2d1', 'Thợ một', 'Thợ điện', 'Quận 7', 5, 'Sửa điện', array['Điện'], array['electric'], true),
  ('00000000-0000-4000-8000-00000000a2d2', 'Thợ hai', 'Thợ điện', 'Quận 3', 4, 'Sửa điện', array['Điện'], array['electric'], true),
  ('00000000-0000-4000-8000-00000000a2d3', 'Thợ ba', 'Thợ điện', 'Quận 1', 4, 'Sửa điện', array['Điện'], array['electric'], true);

update nestscout_private.auto_dispatch_settings set enabled = true, max_invites = 1, max_rounds = 2, retry_cooldown_minutes = 5;

select hasnt_column('public', 'service_dispatch_rounds', 'worker_id', 'Dispatch rounds never name a worker');
select ok(not has_table_privilege('authenticated', 'public.service_dispatch_rounds', 'insert'), 'Clients cannot write dispatch rounds');
select ok(not has_table_privilege('authenticated', 'public.service_dispatch_rounds', 'update'), 'Clients cannot edit dispatch rounds');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a2c1","role":"authenticated"}', true);

select set_config('test.a', public.submit_service_request('32000000-0000-4000-8000-000000000001', 'Máy lạnh không mát', 'Quận 7', 'aircon')::text, true);
select set_config('test.qa', (select id::text from public.service_quotes where request_id = current_setting('test.a')::uuid), true);
select is((select state from public.get_dispatch_summary(array[current_setting('test.a')::uuid])), 'awaiting_acceptance', 'A quoted request that is not accepted is awaiting acceptance');
select lives_ok($$select public.accept_service_quote(current_setting('test.qa')::uuid, 1)$$, 'The customer accepts the price');

select is((select state from public.get_dispatch_summary(array[current_setting('test.a')::uuid])), 'no_match', 'A request with no matching worker reports no match');
select is((select rounds from public.get_dispatch_summary(array[current_setting('test.a')::uuid])), 1, 'The empty round is recorded');
select is((select open_invites from public.get_dispatch_summary(array[current_setting('test.a')::uuid])), 0, 'No offer is open');
select is((select can_retry from public.get_dispatch_summary(array[current_setting('test.a')::uuid])), false, 'A retry is blocked during the cooldown');
select is((select can_cancel from public.get_dispatch_summary(array[current_setting('test.a')::uuid])), true, 'The customer can cancel before a worker is assigned');
select is((select invited_count from public.service_dispatch_rounds where request_id = current_setting('test.a')::uuid and round = 1), 0, 'The round records no invitations');
select is((select reason from public.service_dispatch_rounds where request_id = current_setting('test.a')::uuid and round = 1), 'quote_accepted', 'The first round is attributed to the accepted quote');
select is((select count(*) from public.notifications where kind = 'dispatch_exhausted')::integer, 1, 'The customer is told that nobody was found');
select throws_ok($$select public.redispatch_service_request(current_setting('test.a')::uuid)$$, '22023', 'dispatch unavailable', 'A retry inside the cooldown is rejected');

reset role;
update public.service_dispatch_rounds set created_at = created_at - interval '10 minutes' where request_id = current_setting('test.a')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a2c1","role":"authenticated"}', true);

select is((select can_retry from public.get_dispatch_summary(array[current_setting('test.a')::uuid])), true, 'A retry is allowed once the cooldown has passed');
select is(public.redispatch_service_request(current_setting('test.a')::uuid), 0, 'A manual retry with no matching worker invites nobody');
select is((select rounds from public.get_dispatch_summary(array[current_setting('test.a')::uuid])), 2, 'The manual retry is recorded as a round');
select is((select reason from public.service_dispatch_rounds where request_id = current_setting('test.a')::uuid and round = 2), 'manual_retry', 'The second round is attributed to the manual retry');
select is((select count(*) from public.notifications where kind = 'dispatch_exhausted')::integer, 1, 'A manual retry does not repeat the notification');
select is((select can_retry from public.get_dispatch_summary(array[current_setting('test.a')::uuid])), false, 'A manual retry restarts the cooldown');

select is(public.cancel_service_request(current_setting('test.a')::uuid), current_setting('test.a')::uuid, 'The customer cancels the unassigned request');
select is((select state from public.get_dispatch_summary(array[current_setting('test.a')::uuid])), 'cancelled', 'A cancelled request reports cancelled');
select is((select can_cancel from public.get_dispatch_summary(array[current_setting('test.a')::uuid])), false, 'A cancelled request cannot be cancelled again');
select is(public.cancel_service_request(current_setting('test.a')::uuid), current_setting('test.a')::uuid, 'Cancelling twice is idempotent');
select throws_ok($$select public.redispatch_service_request(current_setting('test.a')::uuid)$$, '22023', 'dispatch unavailable', 'A cancelled request cannot be retried');

select set_config('test.b', public.submit_service_request('32000000-0000-4000-8000-000000000002', 'Máy lạnh chảy nước', 'Quận 7', 'aircon')::text, true);
select set_config('test.qb', (select id::text from public.service_quotes where request_id = current_setting('test.b')::uuid), true);
select is(public.cancel_service_request(current_setting('test.b')::uuid), current_setting('test.b')::uuid, 'A request can be cancelled before its quote is accepted');
select is((select rounds from public.get_dispatch_summary(array[current_setting('test.b')::uuid])), 0, 'No round exists for a request cancelled before dispatch');
select throws_ok($$select public.accept_service_quote(current_setting('test.qb')::uuid, 1)$$, '22023', 'request cancelled', 'A cancelled request cannot accept its quote');

select set_config('test.c', public.submit_service_request('32000000-0000-4000-8000-000000000003', 'Ổ cắm bị cháy', 'Quận 7', 'electric')::text, true);
select set_config('test.qc', (select id::text from public.service_quotes where request_id = current_setting('test.c')::uuid), true);
select lives_ok($$select public.accept_service_quote(current_setting('test.qc')::uuid, 1)$$, 'The customer accepts the electric price');
select is((select state from public.get_dispatch_summary(array[current_setting('test.c')::uuid])), 'searching', 'A live offer reports searching');
select is((select open_invites from public.get_dispatch_summary(array[current_setting('test.c')::uuid])), 1, 'One offer is open');
select ok((select earliest_expiry from public.get_dispatch_summary(array[current_setting('test.c')::uuid])) > clock_timestamp(), 'The summary exposes when the offer lapses');
select is((select can_retry from public.get_dispatch_summary(array[current_setting('test.c')::uuid])), false, 'A live search cannot be retried');

reset role;
select set_config('test.inv1', (select id::text from public.service_invitations where request_id = current_setting('test.c')::uuid and worker_id = '00000000-0000-4000-8000-00000000a2d1'), true);
select is((select count(*) from public.service_invitations where request_id = current_setting('test.c')::uuid)::integer, 1, 'Only the first worker is invited in round one');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a2d1","role":"authenticated"}', true);
select lives_ok($$select public.decline_service_invitation(current_setting('test.inv1')::uuid, current_setting('test.qc')::uuid, 1)$$, 'The first worker declines');

reset role;
select is((select worker_id from public.service_invitations where request_id = current_setting('test.c')::uuid and state = 'open'), '00000000-0000-4000-8000-00000000a2d2'::uuid, 'A decline automatically invites the next worker');
select is((select reason from public.service_dispatch_rounds where request_id = current_setting('test.c')::uuid and round = 2), 'declined', 'The follow-up round is attributed to the decline');
select set_config('test.inv2', (select id::text from public.service_invitations where request_id = current_setting('test.c')::uuid and worker_id = '00000000-0000-4000-8000-00000000a2d2'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a2d2","role":"authenticated"}', true);
select lives_ok($$select public.decline_service_invitation(current_setting('test.inv2')::uuid, current_setting('test.qc')::uuid, 1)$$, 'The second worker declines');

reset role;
select is((select count(*) from public.service_invitations where request_id = current_setting('test.c')::uuid)::integer, 2, 'The round cap stops further automatic invitations');
select is((select invited_count from public.service_dispatch_rounds where request_id = current_setting('test.c')::uuid and round = 3), 0, 'The capped round records no invitations');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a2c1","role":"authenticated"}', true);
select is((select state from public.get_dispatch_summary(array[current_setting('test.c')::uuid])), 'exhausted', 'All offers declined reports exhausted');
select is((select count(*) from public.notifications where kind = 'dispatch_exhausted')::integer, 2, 'The customer is told that every worker declined');
select is((select can_retry from public.get_dispatch_summary(array[current_setting('test.c')::uuid])), false, 'The cooldown applies after automatic rounds');
select throws_ok($$select public.redispatch_service_request(current_setting('test.c')::uuid)$$, '22023', 'dispatch unavailable', 'A manual retry inside the cooldown is rejected');

reset role;
update public.service_dispatch_rounds set created_at = created_at - interval '10 minutes' where request_id = current_setting('test.c')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a2c1","role":"authenticated"}', true);
select is((select can_retry from public.get_dispatch_summary(array[current_setting('test.c')::uuid])), true, 'The customer may retry after the cooldown');
select is(public.redispatch_service_request(current_setting('test.c')::uuid), 1, 'A manual retry invites a worker beyond the automatic cap');

reset role;
select is((select worker_id from public.service_invitations where request_id = current_setting('test.c')::uuid and state = 'open'), '00000000-0000-4000-8000-00000000a2d3'::uuid, 'The retry reaches a worker not yet invited');
select set_config('test.inv3', (select id::text from public.service_invitations where request_id = current_setting('test.c')::uuid and worker_id = '00000000-0000-4000-8000-00000000a2d3'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a2d3","role":"authenticated"}', true);
select lives_ok($$select public.accept_service_invitation(current_setting('test.inv3')::uuid, current_setting('test.qc')::uuid, 1)$$, 'The third worker accepts');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a2c1","role":"authenticated"}', true);
select is((select state from public.get_dispatch_summary(array[current_setting('test.c')::uuid])), 'assigned', 'An accepted offer reports assigned');
select is((select can_cancel from public.get_dispatch_summary(array[current_setting('test.c')::uuid])), false, 'An assigned request cannot be cancelled here');
select throws_ok($$select public.cancel_service_request(current_setting('test.c')::uuid)$$, '40001', 'already assigned', 'Cancelling an assigned request is rejected');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a2c2","role":"authenticated"}', true);
select set_config('test.d', public.submit_service_request('32000000-0000-4000-8000-000000000004', 'Cầu dao nhảy liên tục', 'Quận 3', 'electric')::text, true);
select set_config('test.qd', (select id::text from public.service_quotes where request_id = current_setting('test.d')::uuid), true);
select lives_ok($$select public.accept_service_quote(current_setting('test.qd')::uuid, 1)$$, 'A second customer accepts a price');
select is((select open_invites from public.get_dispatch_summary(array[current_setting('test.d')::uuid])), 1, 'The second request has an open offer');

select is((select count(*) from public.get_dispatch_summary(array[current_setting('test.c')::uuid]))::integer, 0, 'A customer cannot read another customer summary');
select is((select count(*) from public.service_dispatch_rounds where request_id = current_setting('test.c')::uuid)::integer, 0, 'A customer cannot read another customer rounds');
select throws_ok($$select public.cancel_service_request(current_setting('test.a')::uuid)$$, '42501', 'request unavailable', 'A customer cannot cancel another customer request');
select throws_ok($$select public.redispatch_service_request(current_setting('test.c')::uuid)$$, '42501', 'request unavailable', 'A customer cannot retry another customer request');
select throws_ok($$select * from public.get_dispatch_summary((select array_agg(gen_random_uuid()) from generate_series(1, 101)))$$, '22023', 'invalid request', 'An oversized id list is rejected');

select is(public.cancel_service_request(current_setting('test.d')::uuid), current_setting('test.d')::uuid, 'The owner cancels while an offer is open');
reset role;
select is((select state from public.service_invitations where request_id = current_setting('test.d')::uuid), 'cancelled', 'Cancelling withdraws the open offer');
select set_config('test.inv4', (select id::text from public.service_invitations where request_id = current_setting('test.d')::uuid), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a2d1","role":"authenticated"}', true);
select throws_ok($$select public.accept_service_invitation(current_setting('test.inv4')::uuid, current_setting('test.qd')::uuid, 1)$$, '22023', 'invitation unavailable', 'A worker cannot accept a withdrawn offer');
select is((select count(*) from public.get_dispatch_summary(array[current_setting('test.d')::uuid]))::integer, 0, 'A worker cannot read a customer dispatch summary');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a2c1","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select * from public.get_dispatch_summary(array[current_setting('test.a')::uuid])$$, '42501', 'authentication required', 'An anonymous session cannot read summaries');
select throws_ok($$select public.cancel_service_request(current_setting('test.a')::uuid)$$, '42501', 'authentication required', 'An anonymous session cannot cancel');
select throws_ok($$select public.redispatch_service_request(current_setting('test.a')::uuid)$$, '42501', 'authentication required', 'An anonymous session cannot retry');

select * from finish();
rollback;
