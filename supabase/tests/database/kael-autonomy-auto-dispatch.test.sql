begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-00000000a1c1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a1c2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a1d1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a1d2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000a1d3', 'authenticated', 'authenticated');
insert into public.worker_access_grants (user_id) values
  ('00000000-0000-4000-8000-00000000a1d1'), ('00000000-0000-4000-8000-00000000a1d2'), ('00000000-0000-4000-8000-00000000a1d3');
insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active) values
  ('00000000-0000-4000-8000-00000000a1d1', 'local_fixture', true),
  ('00000000-0000-4000-8000-00000000a1d2', 'local_fixture', true),
  ('00000000-0000-4000-8000-00000000a1d3', 'local_fixture', true);
insert into public.worker_public_profiles (worker_id, display_name, trade, area, experience_years, about, skills, service_ids, accepting_jobs) values
  ('00000000-0000-4000-8000-00000000a1d1', 'Thợ tự nhận', 'Thợ điện', 'Quận 7', 5, 'Sửa điện', array['Điện'], array['electric'], true),
  ('00000000-0000-4000-8000-00000000a1d2', 'Thợ chờ hỏi', 'Thợ điện', 'Quận 3', 4, 'Sửa điện', array['Điện'], array['electric'], true),
  ('00000000-0000-4000-8000-00000000a1d3', 'Thợ nước', 'Thợ nước', 'Quận 1', 4, 'Sửa nước', array['Nước'], array['water'], true);

select ok(not has_table_privilege('authenticated', 'nestscout_private.auto_dispatch_settings', 'select'), 'Dispatch settings are not client-readable');
select ok(not has_table_privilege('authenticated', 'nestscout_private.fixture_service_prices', 'select'), 'Fixture service prices are not client-readable');
select ok(not has_table_privilege('authenticated', 'public.kael_autonomy', 'insert'), 'Autonomy rows cannot be written directly by clients');
select is((select enabled from nestscout_private.auto_dispatch_settings), false, 'Automatic quoting and dispatch ship disabled');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a1c1","role":"authenticated"}', true);
select is(public.set_kael_autonomy('customer', 'auto'), 'auto', 'A customer can choose Auto');
select is((select mode from public.kael_autonomy where role = 'customer'), 'auto', 'The customer reads back their own mode');
select throws_ok($$select public.set_kael_autonomy('worker', 'auto')$$, '42501', 'worker unavailable', 'A customer cannot set a worker mode');
select throws_ok($$select public.set_kael_autonomy('customer', 'full')$$, '22023', 'invalid request', 'An unknown mode is rejected');
select throws_ok($$select public.set_kael_autonomy('admin', 'ask')$$, '22023', 'invalid request', 'An unknown role is rejected');
select is(public.set_kael_autonomy('customer', 'ask'), 'ask', 'The customer can return to Ask');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a1c2","role":"authenticated"}', true);
select is((select count(*) from public.kael_autonomy)::integer, 0, 'Another user cannot read the mode');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a1c1","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select public.set_kael_autonomy('customer', 'auto')$$, '42501', 'authentication required', 'An anonymous session cannot set a mode');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a1d1","role":"authenticated"}', true);
select is(public.set_kael_autonomy('worker', 'auto'), 'auto', 'A dispatchable worker can choose Auto');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a1d2","role":"authenticated"}', true);
select is(public.set_kael_autonomy('worker', 'ask'), 'ask', 'A worker can choose Ask');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a1c1","role":"authenticated"}', true);
select set_config('test.off', public.submit_service_request('31000000-0000-4000-8000-000000000001', 'Ổ cắm bị cháy', 'Quận 7', 'electric')::text, true);
select is((select count(*) from public.service_quotes where request_id = current_setting('test.off')::uuid)::integer, 0, 'No quote is created while automatic dispatch is disabled');
select throws_ok($$select public.submit_service_request('31000000-0000-4000-8000-000000000002', 'Việc lạ', 'Quận 7', 'plumber')$$, '22023', 'invalid request', 'An unknown service category is rejected');
select throws_ok($$select public.submit_service_request('31000000-0000-4000-8000-000000000001', 'Ổ cắm bị cháy', 'Quận 7', 'water')$$, '22023', 'submission key conflict', 'Replaying a key with another category is rejected');

reset role;
update nestscout_private.auto_dispatch_settings set enabled = true;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a1c1","role":"authenticated"}', true);

select set_config('test.plain', public.submit_service_request('31000000-0000-4000-8000-000000000003', 'Không rõ loại việc', 'Quận 7')::text, true);
select is((select count(*) from public.service_quotes where request_id = current_setting('test.plain')::uuid)::integer, 0, 'A request without a category gets no automatic quote');

select set_config('test.auto', public.submit_service_request('31000000-0000-4000-8000-000000000004', 'Ổ cắm khu bếp bị cháy', 'Quận 7', 'electric')::text, true);
select is((select count(*) from public.service_quotes where request_id = current_setting('test.auto')::uuid)::integer, 1, 'A categorised request receives one automatic quote');
select is((select amount_minor from public.service_quotes where request_id = current_setting('test.auto')::uuid), 250000::bigint, 'The quote uses the configured fixture price');
select is((select basis from public.service_quotes where request_id = current_setting('test.auto')::uuid), 'local_fixture', 'The automatic quote is labelled as a local fixture');
select is((select accepted_at from public.service_quotes where request_id = current_setting('test.auto')::uuid), null, 'The automatic quote is never accepted for the customer');
select is((select count(*) from public.service_invitations)::integer, 0, 'No worker is invited before the customer accepts the price');
select is((select count(*) from public.notifications where recipient_id = '00000000-0000-4000-8000-00000000a1c1' and kind = 'quote_received')::integer, 1, 'The customer is notified of the quote');

select set_config('test.quote', (select id::text from public.service_quotes where request_id = current_setting('test.auto')::uuid), true);
select lives_ok($$select public.accept_service_quote(current_setting('test.quote')::uuid, 1)$$, 'The customer accepts the price');
reset role;

select is((select count(*) from public.service_jobs where request_id = current_setting('test.auto')::uuid)::integer, 1, 'The Auto worker is assigned without a third party');
select is((select worker_id from public.service_jobs where request_id = current_setting('test.auto')::uuid), '00000000-0000-4000-8000-00000000a1d1'::uuid, 'The worker whose profile matches and who chose Auto wins');
select is((select count(*) from public.service_invitations where request_id = current_setting('test.auto')::uuid)::integer, 1, 'Dispatch stops inviting once the job is assigned');
select is((select count(*) from public.notifications where recipient_id = '00000000-0000-4000-8000-00000000a1c1' and kind = 'job_assigned')::integer, 1, 'The customer is notified that a worker was assigned');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a1d1","role":"authenticated"}', true);
select is((select count(*) from public.notifications where kind = 'job_auto_accepted')::integer, 1, 'The Auto worker is notified that Kael accepted the job');
select is((select count(*) from public.worker_jobs())::integer, 1, 'The assigned job appears in the worker jobs');

reset role;
update nestscout_private.worker_dispatch_eligibility set active = false where user_id = '00000000-0000-4000-8000-00000000a1d1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a1c1","role":"authenticated"}', true);
select set_config('test.ask', public.submit_service_request('31000000-0000-4000-8000-000000000005', 'Đèn bếp chập chờn', 'Quận 3', 'electric')::text, true);
select set_config('test.quote2', (select id::text from public.service_quotes where request_id = current_setting('test.ask')::uuid), true);
select lives_ok($$select public.accept_service_quote(current_setting('test.quote2')::uuid, 1)$$, 'The customer accepts the second price');
reset role;
select is((select count(*) from public.service_jobs where request_id = current_setting('test.ask')::uuid)::integer, 0, 'An Ask worker is never assigned automatically');
select is((select count(*) from public.service_invitations where request_id = current_setting('test.ask')::uuid)::integer, 1, 'Only the dispatchable matching worker is invited');
select is((select worker_id from public.service_invitations where request_id = current_setting('test.ask')::uuid), '00000000-0000-4000-8000-00000000a1d2'::uuid, 'The Ask worker receives an open offer');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a1d2","role":"authenticated"}', true);
select is((select count(*) from public.notifications where kind = 'job_offered')::integer, 1, 'The Ask worker is told about the offer');
select is((select count(*) from public.notifications where kind = 'job_auto_accepted')::integer, 0, 'The Ask worker receives no auto-accept notice');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a1d3","role":"authenticated"}', true);
select is((select count(*) from public.worker_offers())::integer, 0, 'A worker with another service gets no offer');

select * from finish();
rollback;
