begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated');
insert into public.worker_public_profiles (id, worker_id, display_name, trade, area, experience_years, skills, service_areas, listed) values
  ('70000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000b2', 'Thợ Test', 'Thợ nước', 'Quận 1', 5, array['Sửa vòi'], array['Quận 1'], true);
insert into public.customer_profiles (user_id, display_name) values ('00000000-0000-4000-8000-0000000000a1', 'Nguyễn Văn Tú');

insert into public.service_requests (id, owner_id, submission_key, description)
select ('10000000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-4000-8000-0000000000a1',
  ('20000000-0000-4000-8000-00000000000' || n)::uuid, 'Sửa vòi nước ' || n || E'\nChi tiết'
from generate_series(1, 4) n;
insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at, accepted_at, accepted_by)
select ('30000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
  1, 'Synthetic scope', 100, 'VND', now() + interval '1 day', now(), '00000000-0000-4000-8000-0000000000a1'
from generate_series(1, 4) n;
insert into public.service_invitations (id, request_id, quote_id, worker_id, expires_at, state)
select ('40000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
  ('30000000-0000-4000-8000-00000000000' || n)::uuid,
  case when n = 4 then '00000000-0000-4000-8000-0000000000c3' else '00000000-0000-4000-8000-0000000000b2' end::uuid,
  now() + interval '1 day', 'accepted'
from generate_series(1, 4) n;
insert into public.service_jobs (id, request_id, quote_id, invitation_id, worker_id, stage, version)
select ('50000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
  ('30000000-0000-4000-8000-00000000000' || n)::uuid, ('40000000-0000-4000-8000-00000000000' || n)::uuid,
  case when n = 4 then '00000000-0000-4000-8000-0000000000c3' else '00000000-0000-4000-8000-0000000000b2' end::uuid,
  case when n = 2 then 'working' else 'completed' end, 1
from generate_series(1, 4) n;

select ok(not has_function_privilege('anon', 'public.review_job_worker(uuid,integer,text,text[])', 'execute'), 'Anonymous role cannot review a worker');
select ok(not has_function_privilege('anon', 'public.job_worker_cards()', 'execute'), 'Anonymous role cannot list job workers');
select ok(not has_table_privilege('authenticated', 'public.worker_reviews', 'insert'), 'Clients cannot insert reviews directly');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select is((select count(*)::integer from public.job_worker_cards()), 3, 'Only jobs whose worker has a profile are offered');
select is_empty($$select 1 from public.job_worker_cards() where job_id = '50000000-0000-4000-8000-000000000004'$$, 'A job whose worker has no profile is not offered');
select is((select profile_id from public.job_worker_cards() where job_id = '50000000-0000-4000-8000-000000000001'), '70000000-0000-4000-8000-0000000000b2'::uuid, 'The card carries the opaque profile id');
select is((select to_jsonb(c) ? 'worker_id' from public.job_worker_cards() c limit 1), false, 'The card never exposes the worker account id');
select is((select saved from public.job_worker_cards() where job_id = '50000000-0000-4000-8000-000000000001'), false, 'The worker starts unsaved');
select is((select review_rating from public.job_worker_cards() where job_id = '50000000-0000-4000-8000-000000000001'), null, 'The job starts unreviewed');

select is(public.save_worker('70000000-0000-4000-8000-0000000000b2'), '70000000-0000-4000-8000-0000000000b2'::uuid, 'The customer saves the worker of a job');
select is((select saved from public.job_worker_cards() where job_id = '50000000-0000-4000-8000-000000000001'), true, 'The card reports the worker as saved');

select throws_ok($$select public.review_job_worker('50000000-0000-4000-8000-000000000002', 5, '', array[]::text[])$$, '22023', 'job not completed', 'A job in progress cannot be reviewed');
select throws_ok($$select public.review_job_worker('50000000-0000-4000-8000-000000000004', 5, '', array[]::text[])$$, '42501', 'worker unavailable', 'A worker without a profile cannot be reviewed');
select throws_ok($$select public.review_job_worker('50000000-0000-4000-8000-000000000999', 5, '', array[]::text[])$$, '42501', 'job unavailable', 'An unknown job cannot be reviewed');
select throws_ok($$select public.review_job_worker(null, 5, '', array[]::text[])$$, '22023', 'invalid request', 'A missing job is rejected');
select throws_ok($$select public.review_job_worker('50000000-0000-4000-8000-000000000001', 0, '', array[]::text[])$$, '22023', 'invalid request', 'A rating below one is rejected');
select throws_ok($$select public.review_job_worker('50000000-0000-4000-8000-000000000001', 6, '', array[]::text[])$$, '22023', 'invalid request', 'A rating above five is rejected');
select throws_ok($$select public.review_job_worker('50000000-0000-4000-8000-000000000001', 5, '', array['a','b','c','d','e','f'])$$, '22023', 'invalid request', 'More than five tags are rejected');
select throws_ok($$select public.review_job_worker('50000000-0000-4000-8000-000000000001', 5, '', array[' '])$$, '22023', 'invalid request', 'A blank tag is rejected');

select isnt(public.review_job_worker('50000000-0000-4000-8000-000000000001', 5, '  Rất tốt  ', array['Đúng giờ', ' Gọn gàng ']), null, 'The customer reviews a completed job');
select is((select review_rating from public.job_worker_cards() where job_id = '50000000-0000-4000-8000-000000000001'), 5, 'The card reports the rating given');
select lives_ok($$select public.review_job_worker('50000000-0000-4000-8000-000000000001', 5, 'Rất tốt', array['Đúng giờ', 'Gọn gàng'])$$, 'Repeating the same review is harmless');
select throws_ok($$select public.review_job_worker('50000000-0000-4000-8000-000000000001', 3, 'Khác', array[]::text[])$$, '22023', 'review conflict', 'A different review of the same job is rejected');

reset role;
select is((select count(*)::integer from public.worker_reviews where job_id = '50000000-0000-4000-8000-000000000001'), 1, 'A job holds one review');
select is((select author_label from public.worker_reviews where job_id = '50000000-0000-4000-8000-000000000001'), 'Tú', 'The author is shown by given name only');
select is((select service_label from public.worker_reviews where job_id = '50000000-0000-4000-8000-000000000001'), 'Sửa vòi nước 1', 'The service is the first line of the request');
select is((select basis from public.worker_reviews where job_id = '50000000-0000-4000-8000-000000000001'), 'customer_submitted', 'A customer review is not labelled as fixture data');
select is((select tags from public.worker_reviews where job_id = '50000000-0000-4000-8000-000000000001'), array['Đúng giờ', 'Gọn gàng'], 'Tags are trimmed and keep their order');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select review_count from public.saved_workers()), 1, 'The saved list counts the new review');
select is((select rating_average from public.saved_workers()), 5.0::numeric, 'The saved list averages the new review');
select is((select completed_jobs from public.saved_workers()), 2, 'Completed jobs count the finished work');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
select is_empty($$select 1 from public.job_worker_cards()$$, 'Another customer sees no job workers');
select throws_ok($$select public.review_job_worker('50000000-0000-4000-8000-000000000001', 1, '', array[]::text[])$$, '42501', 'job unavailable', 'Another customer cannot review the job');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select public.review_job_worker('50000000-0000-4000-8000-000000000001', 5, '', array[]::text[])$$, '42501', 'authentication required', 'An anonymous session cannot review');
select throws_ok($$select * from public.job_worker_cards()$$, '42501', 'authentication required', 'An anonymous session cannot list job workers');
reset role;

select * from finish();
rollback;
