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
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a1','20000000-0000-4000-8000-000000000001','Quote fixture'),
  ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-0000000000a1','20000000-0000-4000-8000-000000000002','Offer fixture');
insert into public.service_quotes (id,request_id,version,scope,amount_minor,currency,expires_at,accepted_at,accepted_by) values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'Fixture',100,'VND',now()+interval '1 day',null,null),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',1,'Fixture',100,'VND',now()+interval '1 day',now(),'00000000-0000-4000-8000-0000000000a1');
insert into public.service_invitations (id,request_id,quote_id,worker_id,expires_at) values
  ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-0000000000b2',now()+interval '1 day');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}',true);
select throws_ok($$select public.reject_service_quote('30000000-0000-4000-8000-000000000001',1)$$,'42501','quote unavailable','Another customer cannot reject');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}',true);
select throws_ok($$select public.reject_service_quote('30000000-0000-4000-8000-000000000001',2)$$,'40001','stale quote','Wrong version cannot be rejected');
select lives_ok($$select public.reject_service_quote('30000000-0000-4000-8000-000000000001',1)$$,'Owner rejects quote');
select lives_ok($$select public.reject_service_quote('30000000-0000-4000-8000-000000000001',1)$$,'Reject replay is safe');
select throws_ok($$select public.accept_service_quote('30000000-0000-4000-8000-000000000001',1)$$,'40001','stale quote','Rejected quote cannot be accepted');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}',true);
select throws_ok($$select public.decline_service_invitation('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',2)$$,'40001','stale terms','Worker cannot decline unseen terms');
select lives_ok($$select public.decline_service_invitation('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1)$$,'Invited Worker declines');
select lives_ok($$select public.decline_service_invitation('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1)$$,'Decline replay is safe');
select throws_ok($$select public.accept_service_invitation('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1)$$,'22023','invitation unavailable','Declined invitation cannot be accepted');
select is_empty($$select 1 from public.worker_offers()$$,'Declined offer disappears without automatic rematching');
reset role;
select is((select count(*)::integer from public.service_jobs),0,'Decline creates no assignment');
select * from finish();
rollback;
