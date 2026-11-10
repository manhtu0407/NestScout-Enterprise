begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, phone) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', '84901234567'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', null);

select ok((select relrowsecurity from pg_class where oid = 'public.customer_settings'::regclass), 'Settings use row security');
select ok(not has_function_privilege('anon', 'public.save_customer_settings(boolean,boolean,boolean,boolean,boolean)', 'execute'), 'Anonymous role cannot save settings');
select ok(not has_function_privilege('anon', 'public.account_phone()', 'execute'), 'Anonymous role cannot read a phone number');
select ok(not has_table_privilege('authenticated', 'public.customer_settings', 'delete'), 'Clients cannot delete settings');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select is_empty($$select 1 from public.customer_settings$$, 'A new customer has no stored settings');
select is(public.save_customer_settings(false, true, false, true, true), '00000000-0000-4000-8000-0000000000a1'::uuid, 'The customer saves settings');
select is((select push from public.customer_settings), false, 'The push preference is stored');
select is((select promotions from public.customer_settings), true, 'The promotions preference is stored');
select is((select reduce_motion from public.customer_settings), true, 'The reduce motion preference is stored');
select lives_ok($$select public.save_customer_settings(true, true, true, false, false)$$, 'Settings can be saved again');
select is((select count(*)::integer from public.customer_settings), 1, 'A customer holds one settings row');
select is((select push from public.customer_settings), true, 'The latest settings win');
select throws_ok($$select public.save_customer_settings(null, true, true, true, true)$$, '22023', 'invalid settings', 'A missing preference is rejected');
select throws_ok($$insert into public.customer_settings (user_id, push) values ('00000000-0000-4000-8000-0000000000b2', true)$$, '42501', null, 'Clients cannot write settings for someone else');
select is(public.account_phone(), '84901234567', 'The customer reads the phone number of the account');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is_empty($$select 1 from public.customer_settings$$, 'Another customer does not read the settings');
select is(public.account_phone(), '', 'An account without a phone number reads an empty value');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select public.save_customer_settings(true, true, true, true, true)$$, '42501', 'authentication required', 'An anonymous session cannot save settings');
select throws_ok($$select public.account_phone()$$, '42501', 'authentication required', 'An anonymous session cannot read a phone number');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select isnt(public.submit_service_request('20000000-0000-4000-8000-000000000001', 'Sửa vòi nước', '  12 Nguyễn Huệ, Quận 1  '), null, 'A request is submitted with a location');
select is((select location from public.service_requests), '12 Nguyễn Huệ, Quận 1', 'The location is trimmed and stored');
select lives_ok($$select public.submit_service_request('20000000-0000-4000-8000-000000000001', 'Sửa vòi nước', '12 Nguyễn Huệ, Quận 1')$$, 'Retrying with the same location is harmless');
select throws_ok($$select public.submit_service_request('20000000-0000-4000-8000-000000000001', 'Sửa vòi nước', 'Nơi khác')$$, '22023', 'submission key conflict', 'Reusing a key with another location is rejected');
select isnt(public.submit_service_request('20000000-0000-4000-8000-000000000002', 'Không có địa điểm'), null, 'A request without a location is still accepted');
select is((select location from public.service_requests where description = 'Không có địa điểm'), '', 'A missing location is stored empty');
select throws_ok($$select public.submit_service_request('20000000-0000-4000-8000-000000000003', 'Quá dài', repeat('a', 201))$$, '22023', 'invalid request', 'A location over 200 characters is rejected');
reset role;

select * from finish();
rollback;
