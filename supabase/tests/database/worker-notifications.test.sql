begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated');

insert into public.service_requests (id, owner_id, submission_key, description) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-000000000001', E'Sửa vòi nước\nChi tiết riêng');
insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at, accepted_at, accepted_by) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'Synthetic scope', 100000, 'VND', now() + interval '1 day', now(), '00000000-0000-4000-8000-0000000000a1');

insert into public.service_invitations (id, request_id, quote_id, worker_id, expires_at, state) values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', now() + interval '1 day', 'open');

select is((select count(*)::integer from public.notifications where request_id = '10000000-0000-4000-8000-000000000001' and recipient_id = '00000000-0000-4000-8000-0000000000b2' and kind = 'job_offered'), 1, 'An open invitation notifies the invited worker');
select is((select body from public.notifications where request_id = '10000000-0000-4000-8000-000000000001' and kind = 'job_offered'), 'Việc “Sửa vòi nước” đang chờ bạn phản hồi.', 'The offer text carries only the request title');
select is((select count(*)::integer from public.notifications where request_id = '10000000-0000-4000-8000-000000000001' and kind = 'job_offered' and recipient_id <> '00000000-0000-4000-8000-0000000000b2'), 0, 'Nobody else is notified of the offer');

update public.service_invitations set state = 'accepted' where id = '40000000-0000-4000-8000-000000000001';
insert into public.service_jobs (id, request_id, quote_id, invitation_id, worker_id, stage, version) values
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', 'submitted', 1);

insert into public.service_job_events (job_id, actor_id, event, version) values
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'submitted', 2),
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'revision_requested', 3),
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'disputed', 4),
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'scope_approved', 5),
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'scope_rejected', 6),
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'resumed', 7),
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'accepted', 8);

select is((select count(*)::integer from public.notifications where request_id = '10000000-0000-4000-8000-000000000001' and recipient_id = '00000000-0000-4000-8000-0000000000b2' and kind = 'job_offered'), 1, 'Job events do not repeat the offer');
select results_eq(
  $$select kind from public.notifications where request_id = '10000000-0000-4000-8000-000000000001' and recipient_id = '00000000-0000-4000-8000-0000000000b2' and kind <> 'job_offered' order by kind$$,
  $$values ('resume_agreed'::text), ('revision_requested'), ('scope_approved'), ('scope_rejected'), ('work_approved'), ('work_disputed')$$,
  'Each customer decision notifies the job worker once');
select is((select count(*)::integer from public.notifications where request_id = '10000000-0000-4000-8000-000000000001' and recipient_id = '00000000-0000-4000-8000-0000000000b2' and kind in ('job_progress', 'job_en_route', 'job_arrived', 'job_working', 'job_paused')), 0, 'The worker gets no customer progress notice');
select is((select count(*)::integer from public.notifications where request_id = '10000000-0000-4000-8000-000000000001' and recipient_id = '00000000-0000-4000-8000-0000000000a1' and kind in ('job_offered', 'work_approved', 'revision_requested', 'work_disputed', 'scope_approved', 'scope_rejected', 'resume_agreed', 'review_received')), 0, 'The customer never receives worker notices');

insert into public.worker_public_profiles (id, worker_id, display_name, trade, area, experience_years) values
  ('60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', 'Minh Anh', 'Thợ điện nước', 'Quận 7', 6);
insert into public.worker_reviews (profile_id, job_id, author_label, service_label, rating) values
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'Khách A', 'Sửa vòi', 5);
select is((select count(*)::integer from public.notifications where request_id = '10000000-0000-4000-8000-000000000001' and recipient_id = '00000000-0000-4000-8000-0000000000b2' and kind = 'review_received'), 1, 'A review notifies the reviewed worker');

select ok(not has_function_privilege('authenticated', 'nestscout_private.notify_job_worker(uuid, text, text, text)', 'execute'), 'Clients cannot create worker notifications');
select throws_ok($$insert into public.notifications (recipient_id, kind, request_id, title, body) values ('00000000-0000-4000-8000-0000000000b2', 'made_up', '10000000-0000-4000-8000-000000000001', 't', 'b')$$, '23514', null, 'Unknown notification kinds are refused');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is((select count(*)::integer from public.notifications where request_id = '10000000-0000-4000-8000-000000000001'), 8, 'A worker reads exactly their own notifications');
select is((select public.mark_notifications_read(array(select id from public.notifications where request_id = '10000000-0000-4000-8000-000000000001' and kind = 'job_offered'))), 1, 'A worker can mark their notice read');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
select is((select count(*)::integer from public.notifications where request_id = '10000000-0000-4000-8000-000000000001'), 0, 'Another worker sees none of them');

reset role;
select * from finish();
rollback;
