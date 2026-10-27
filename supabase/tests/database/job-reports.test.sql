begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users (id,aud,role) values
  ('00000000-0000-4000-8000-0000000000a1','authenticated','authenticated'),
  ('00000000-0000-4000-8000-0000000000b2','authenticated','authenticated'),
  ('00000000-0000-4000-8000-0000000000c3','authenticated','authenticated');
insert into public.worker_access_grants (user_id) values ('00000000-0000-4000-8000-0000000000b2');
insert into nestscout_private.worker_dispatch_eligibility (user_id,basis,active) values ('00000000-0000-4000-8000-0000000000b2','local_fixture',true);
insert into public.service_requests (id,owner_id,submission_key,description) values
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a1','20000000-0000-4000-8000-000000000001','Report fixture');
insert into public.service_quotes (id,request_id,version,scope,amount_minor,currency,expires_at,accepted_at,accepted_by) values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'Fixture',100,'VND',now()+interval '1 day',now(),'00000000-0000-4000-8000-0000000000a1');
insert into public.service_invitations (id,request_id,quote_id,worker_id,expires_at,state) values
  ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000b2',now()+interval '1 day','accepted');
insert into public.service_jobs (id,request_id,quote_id,invitation_id,worker_id,stage,version) values
  ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000b2','en_route',1);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}',true);
select lives_ok($$select public.report_service_job('50000000-0000-4000-8000-000000000001',1,'60000000-0000-4000-8000-000000000001','delay','Traffic delay')$$,'Worker reports a delay');
select lives_ok($$select public.report_service_job('50000000-0000-4000-8000-000000000001',1,'60000000-0000-4000-8000-000000000001','delay','Traffic delay')$$,'Report replay is safe');
select throws_ok($$select public.report_service_job('50000000-0000-4000-8000-000000000001',1,'60000000-0000-4000-8000-000000000001','delay','Changed')$$,'22023','report key conflict','Key binds the report');
select throws_ok($$select public.report_service_job('50000000-0000-4000-8000-000000000001',2,'60000000-0000-4000-8000-000000000002','customer_absent','Not seen')$$,'22023','invalid transition','Absence cannot be reported before arrival');
select is(public.advance_service_job('50000000-0000-4000-8000-000000000001',2,'arrived'),3,'Worker reports arrival');
select lives_ok($$select public.report_service_job('50000000-0000-4000-8000-000000000001',3,'60000000-0000-4000-8000-000000000003','customer_absent','No answer')$$,'Worker records an unverified absence report');
select is((select stage from public.service_jobs where id='50000000-0000-4000-8000-000000000001'),'arrived','Reports do not automatically cancel or reschedule');
select throws_ok($$select public.advance_service_job('50000000-0000-4000-8000-000000000001',4,'working')$$,
  '22023','absence recovery policy required','Work cannot start after a no-answer report without a recovery policy');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}',true);
select is((select count(*)::integer from public.service_job_reports),2,'Customer sees the two reported facts');
select is((select amount_minor from public.service_quotes),100::bigint,'Reports do not modify agreed money');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}',true);
select is_empty($$select 1 from public.service_job_reports$$,'Another account cannot read reports');
select throws_ok($$select public.report_service_job('50000000-0000-4000-8000-000000000001',4,'60000000-0000-4000-8000-000000000004','delay','Spoof')$$,'42501','worker unavailable','An unqualified account cannot report');
reset role;
select * from finish();
rollback;
