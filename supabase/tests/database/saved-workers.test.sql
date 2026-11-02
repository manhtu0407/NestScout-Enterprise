begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e5', 'authenticated', 'authenticated');
insert into public.worker_public_profiles (id, worker_id, display_name, trade, area, experience_years, skills, service_areas, listed) values
  ('70000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000d4', 'Thợ Test', 'Thợ nước', 'Quận 1', 5, array['Sửa vòi'], array['Quận 1'], true),
  ('70000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000e5', 'Thợ Ẩn', 'Thợ điện', 'Quận 2', 2, array['Lắp đèn'], array['Quận 2'], false);
insert into public.worker_reviews (profile_id, author_label, service_label, rating, body, tags, created_at) values
  ('70000000-0000-4000-8000-0000000000d4', 'Chị A.', 'Sửa vòi', 5, 'Rất tốt', array['Đúng giờ', 'Gọn gàng'], now() - interval '2 days'),
  ('70000000-0000-4000-8000-0000000000d4', 'Anh B.', 'Thay van', 4, '', array['Đúng giờ'], now() - interval '1 day');

select ok((select relrowsecurity from pg_class where oid = 'public.worker_public_profiles'::regclass), 'Worker profiles use row security');
select ok((select relrowsecurity from pg_class where oid = 'public.worker_reviews'::regclass), 'Worker reviews use row security');
select ok((select relrowsecurity from pg_class where oid = 'public.customer_saved_workers'::regclass), 'Saved workers use row security');
select ok(not has_table_privilege('authenticated', 'public.worker_public_profiles', 'select'), 'Clients cannot read worker profiles directly');
select ok(not has_table_privilege('authenticated', 'public.worker_reviews', 'select'), 'Clients cannot read worker reviews directly');
select ok(not has_table_privilege('authenticated', 'public.customer_saved_workers', 'insert')
  and not has_table_privilege('authenticated', 'public.customer_saved_workers', 'update'), 'Clients cannot insert or update saved workers directly');
select ok(not has_function_privilege('anon', 'public.save_worker(uuid)', 'execute'), 'Anonymous role cannot save a worker');
select ok(not has_function_privilege('anon', 'public.unsave_worker(uuid)', 'execute'), 'Anonymous role cannot unsave a worker');
select ok(not has_function_privilege('anon', 'public.saved_workers()', 'execute'), 'Anonymous role cannot list saved workers');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select is_empty($$select 1 from public.saved_workers()$$, 'A new customer has no saved workers');
select is(public.save_worker('70000000-0000-4000-8000-0000000000d4'), '70000000-0000-4000-8000-0000000000d4'::uuid, 'Customer saves a listed worker');
select lives_ok($$select public.save_worker('70000000-0000-4000-8000-0000000000d4')$$, 'Saving twice is harmless');
select is((select count(*)::integer from public.customer_saved_workers), 1, 'A worker is saved once');
select throws_ok($$select public.save_worker('70000000-0000-4000-8000-0000000000e5')$$, '42501', 'worker unavailable', 'An unlisted worker cannot be saved');
select throws_ok($$select public.save_worker('70000000-0000-4000-8000-000000000999')$$, '42501', 'worker unavailable', 'An unknown worker cannot be saved');
select throws_ok($$select public.save_worker(null)$$, '42501', 'worker unavailable', 'A missing profile id is rejected');
select throws_ok($$insert into public.customer_saved_workers (customer_id, profile_id) values ('00000000-0000-4000-8000-0000000000a1', '70000000-0000-4000-8000-0000000000e5')$$,
  '42501', null, 'Clients cannot insert saved rows directly');

select is((select count(*)::integer from public.saved_workers()), 1, 'The saved list has one worker');
select is((select display_name from public.saved_workers()), 'Thợ Test', 'The saved list shows the worker name');
select is((select review_count from public.saved_workers()), 2, 'The saved list counts reviews');
select is((select rating_average from public.saved_workers()), 4.5::numeric, 'The saved list averages ratings');
select is((select strengths -> 0 ->> 'label' from public.saved_workers()), 'Đúng giờ', 'The most frequent strength comes first');
select is((select (strengths -> 0 ->> 'count')::integer from public.saved_workers()), 2, 'A strength carries its count');
select is((select reviews -> 0 ->> 'author' from public.saved_workers()), 'Anh B.', 'Reviews are newest first');
select is((select to_jsonb(w) ? 'worker_id' from public.saved_workers() w), false, 'The saved list never exposes the worker account id');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is_empty($$select 1 from public.saved_workers()$$, 'Another customer does not see the saved worker');
select is_empty($$select 1 from public.customer_saved_workers$$, 'Another customer does not read saved rows');
select lives_ok($$select public.unsave_worker('70000000-0000-4000-8000-0000000000d4')$$, 'Unsaving someone else save changes nothing');
reset role;
select is((select count(*)::integer from public.customer_saved_workers), 1, 'Another customer cannot remove the save');

update public.worker_public_profiles set listed = false where id = '70000000-0000-4000-8000-0000000000d4';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is_empty($$select 1 from public.saved_workers()$$, 'A worker who is no longer listed disappears from the list');
reset role;
update public.worker_public_profiles set listed = true where id = '70000000-0000-4000-8000-0000000000d4';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is(public.unsave_worker('70000000-0000-4000-8000-0000000000d4'), '70000000-0000-4000-8000-0000000000d4'::uuid, 'Customer unsaves a worker');
select lives_ok($$select public.unsave_worker('70000000-0000-4000-8000-0000000000d4')$$, 'Unsaving twice is harmless');
select is_empty($$select 1 from public.saved_workers()$$, 'Unsaving empties the list');
select throws_ok($$select public.unsave_worker(null)$$, '22023', 'invalid request', 'A missing profile id cannot be unsaved');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select public.save_worker('70000000-0000-4000-8000-0000000000d4')$$, '42501', 'authentication required', 'An anonymous session cannot save a worker');
select throws_ok($$select public.unsave_worker('70000000-0000-4000-8000-0000000000d4')$$, '42501', 'authentication required', 'An anonymous session cannot unsave a worker');
select throws_ok($$select * from public.saved_workers()$$, '42501', 'authentication required', 'An anonymous session cannot list saved workers');
reset role;

select * from finish();
rollback;
