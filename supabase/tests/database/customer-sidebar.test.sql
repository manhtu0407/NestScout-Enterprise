begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated');
insert into public.service_requests (id, owner_id, submission_key, description) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-000000000001', E'Sửa vòi nước bồn rửa\nChi tiết thêm'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b2', '20000000-0000-4000-8000-000000000002', 'Yêu cầu của người khác');

select ok((select relrowsecurity from pg_class where oid = 'public.request_pins'::regclass), 'Pins use row security');
select ok((select relrowsecurity from pg_class where oid = 'public.customer_profiles'::regclass), 'Profiles use row security');
select ok((select relrowsecurity from pg_class where oid = 'public.notifications'::regclass), 'Notifications use row security');
select ok((select relrowsecurity from pg_class where oid = 'public.support_requests'::regclass), 'Support requests use row security');
select ok(not has_function_privilege('anon', 'public.set_request_pinned(uuid,boolean)', 'execute'), 'Anonymous role cannot pin');
select ok(not has_function_privilege('anon', 'public.save_customer_profile(text,text,text)', 'execute'), 'Anonymous role cannot save a profile');
select ok(not has_function_privilege('anon', 'public.mark_notifications_read(uuid[])', 'execute'), 'Anonymous role cannot mark notifications');
select ok(not has_function_privilege('anon', 'public.submit_support_request(uuid,text,text)', 'execute'), 'Anonymous role cannot submit support');
select ok(not has_function_privilege('authenticated', 'nestscout_private.notify_request_owner(uuid,text,text,text)', 'execute'),
  'Clients cannot create notifications directly');
select ok(not has_table_privilege('authenticated', 'public.notifications', 'insert')
  and not has_table_privilege('authenticated', 'public.notifications', 'delete'), 'Clients cannot insert or delete notifications');
select ok(not has_column_privilege('authenticated', 'public.notifications', 'title', 'update'), 'Clients can only change the read marker');
select ok(not has_table_privilege('authenticated', 'public.support_requests', 'update')
  and not has_table_privilege('authenticated', 'public.support_requests', 'delete'), 'Clients cannot edit support requests');

insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'Fixture terms', 100, 'VND', now() + interval '1 day'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 1, 'Other terms', 100, 'VND', now() + interval '1 day');

select is((select count(*)::integer from public.notifications where recipient_id = '00000000-0000-4000-8000-0000000000a1' and kind = 'quote_received'), 1,
  'A new quote notifies the request owner once');
select is((select count(*)::integer from public.notifications where recipient_id = '00000000-0000-4000-8000-0000000000b2' and kind = 'quote_received'), 1,
  'A quote notifies only its own request owner');
select is((select body from public.notifications where recipient_id = '00000000-0000-4000-8000-0000000000a1'),
  'Yêu cầu “Sửa vòi nước bồn rửa” có báo giá mới đang chờ bạn quyết định.', 'The notification names the first line of the request');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select is((select count(*)::integer from public.notifications), 1, 'Owner sees only their notifications');
select is(public.mark_notifications_read(array[(select id from public.notifications)]), 1, 'Owner marks a notification read');
select is(public.mark_notifications_read(array[(select id from public.notifications)]), 0, 'Marking again changes nothing');
select isnt((select read_at from public.notifications), null, 'The read marker is stored');
select throws_ok($$select public.mark_notifications_read(null)$$, '22023', 'invalid request', 'A missing id list is rejected');
select throws_ok($$update public.notifications set title = 'Forged'$$, '42501', null, 'Notification text cannot be edited');

select is(public.set_request_pinned('10000000-0000-4000-8000-000000000001', true), true, 'Owner pins a request');
select lives_ok($$select public.set_request_pinned('10000000-0000-4000-8000-000000000001', true)$$, 'Pinning twice is harmless');
select is((select count(*)::integer from public.request_pins), 1, 'A request has one pin');
select throws_ok($$select public.set_request_pinned('10000000-0000-4000-8000-000000000002', true)$$,
  '42501', 'request unavailable', 'Another owner request cannot be pinned');
select throws_ok($$insert into public.request_pins (owner_id, request_id) values ('00000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'A pin cannot name another owner');
select is(public.set_request_pinned('10000000-0000-4000-8000-000000000001', false), false, 'Owner unpins a request');
select is((select count(*)::integer from public.request_pins), 0, 'Unpinning removes the pin');
select lives_ok($$select public.set_request_pinned('10000000-0000-4000-8000-000000000001', false)$$, 'Unpinning twice is harmless');

select is(public.save_customer_profile('  Minh Anh ', 'minh@example.com', ' 12 Nguyễn Huệ '), '00000000-0000-4000-8000-0000000000a1'::uuid, 'Owner saves a profile');
select is((select display_name || '|' || email || '|' || address from public.customer_profiles), 'Minh Anh|minh@example.com|12 Nguyễn Huệ', 'Profile text is trimmed');
select lives_ok($$select public.save_customer_profile('Minh', '', '')$$, 'Owner updates the profile and clears optional fields');
select is((select count(*)::integer from public.customer_profiles), 1, 'A user has one profile');
select throws_ok($$select public.save_customer_profile('Minh', 'not-an-email', '')$$, '22023', 'invalid profile', 'A malformed email is rejected');
select throws_ok($$select public.save_customer_profile(repeat('a', 81), '', '')$$, '22023', 'invalid profile', 'An oversized name is rejected');
select throws_ok($$insert into public.customer_profiles (user_id, display_name) values ('00000000-0000-4000-8000-0000000000b2', 'Forged')$$,
  '42501', null, 'A profile cannot be created for another user');

select lives_ok($$select public.submit_support_request('40000000-0000-4000-8000-000000000001', 'Không nhận được mã', 'Tôi chưa nhận được mã xác thực.')$$,
  'Owner submits a support request');
select lives_ok($$select public.submit_support_request('40000000-0000-4000-8000-000000000001', 'Không nhận được mã', 'Tôi chưa nhận được mã xác thực.')$$,
  'An identical retry is accepted');
select is((select count(*)::integer from public.support_requests), 1, 'A retry creates one support request');
select throws_ok($$select public.submit_support_request('40000000-0000-4000-8000-000000000001', 'Khác', 'Nội dung khác')$$,
  '22023', 'submission key conflict', 'A key cannot be reused for different content');
select throws_ok($$select public.submit_support_request('40000000-0000-4000-8000-000000000002', '   ', 'Nội dung')$$,
  '22023', 'invalid request', 'A blank subject is rejected');
select throws_ok($$insert into public.support_requests (owner_id, submission_key, subject, body)
  values ('00000000-0000-4000-8000-0000000000b2', '40000000-0000-4000-8000-000000000003', 'Forged', 'Forged')$$,
  '42501', null, 'A support request cannot name another owner');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
select is_empty($$select 1 from public.notifications$$, 'A stranger sees no notifications');
select is_empty($$select 1 from public.customer_profiles$$, 'A stranger sees no profiles');
select is_empty($$select 1 from public.support_requests$$, 'A stranger sees no support requests');
select is_empty($$select 1 from public.request_pins$$, 'A stranger sees no pins');
select is(public.mark_notifications_read(array(select id from public.notifications)), 0, 'A stranger marks nothing');
reset role;

select is((select read_at is not null from public.notifications where recipient_id = '00000000-0000-4000-8000-0000000000a1'), true,
  'A stranger left the owner read marker intact');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","is_anonymous":true}', true);
select is_empty($$select 1 from public.notifications$$, 'An anonymous session sees no notifications');
select throws_ok($$select public.set_request_pinned('10000000-0000-4000-8000-000000000001', true)$$, '42501', 'authentication required', 'An anonymous session cannot pin');
select throws_ok($$select public.save_customer_profile('Minh', '', '')$$, '42501', 'authentication required', 'An anonymous session cannot save a profile');
select throws_ok($$select public.submit_support_request('40000000-0000-4000-8000-000000000009', 'A', 'B')$$, '42501', 'authentication required', 'An anonymous session cannot submit support');
reset role;

insert into public.worker_access_grants (user_id) values ('00000000-0000-4000-8000-0000000000c3');
insert into public.service_invitations (id, request_id, quote_id, worker_id, expires_at, state) values
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c3', now() + interval '1 day', 'accepted');
insert into public.service_jobs (id, request_id, quote_id, invitation_id, worker_id) values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c3');
select is((select count(*)::integer from public.notifications where kind = 'job_assigned' and recipient_id = '00000000-0000-4000-8000-0000000000a1'), 1,
  'Assigning a worker notifies the customer');
update public.service_jobs set stage = 'en_route', version = version + 1 where id = '60000000-0000-4000-8000-000000000001';
update public.service_jobs set stage = 'submitted', version = version + 1 where id = '60000000-0000-4000-8000-000000000001';
update public.service_jobs set stage = 'completed', version = version + 1 where id = '60000000-0000-4000-8000-000000000001';
select is((select array_agg(kind order by created_at) from public.notifications
  where kind in ('job_en_route', 'work_submitted', 'job_completed') and recipient_id = '00000000-0000-4000-8000-0000000000a1'),
  array['job_en_route', 'work_submitted', 'job_completed'], 'Stage changes notify the customer');
update public.service_jobs set version = version + 1 where id = '60000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.notifications where kind in ('job_en_route', 'work_submitted', 'job_completed')), 3,
  'A change that keeps the stage does not notify');

select * from finish();
rollback;
