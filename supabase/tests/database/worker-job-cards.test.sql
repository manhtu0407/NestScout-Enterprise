begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated');
insert into public.worker_access_grants (user_id) values
  ('00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000000c3'),
  ('00000000-0000-4000-8000-0000000000d4');
insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active) values
  ('00000000-0000-4000-8000-0000000000b2', 'local_fixture', true),
  ('00000000-0000-4000-8000-0000000000c3', 'local_fixture', true),
  ('00000000-0000-4000-8000-0000000000d4', 'local_fixture', false);
insert into public.customer_profiles (user_id, display_name) values ('00000000-0000-4000-8000-0000000000a1', 'Nguyễn Văn Lan');

insert into public.service_requests (id, owner_id, submission_key, description, location)
select ('10000000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-4000-8000-0000000000a1',
  ('20000000-0000-4000-8000-00000000000' || n)::uuid,
  case when n = 1 then E'Sửa vòi nước\nVòi bồn rửa bị rò' else 'Việc ' || n end,
  case when n = 1 then '12 Lê Lợi, Quận 1' else '' end
from generate_series(1, 6) n;
insert into public.request_photos (owner_id, request_id, path) values
  ('00000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1/10000000-0000-4000-8000-000000000001/a.jpg'),
  ('00000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1/10000000-0000-4000-8000-000000000001/b.jpg');
insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at, accepted_at, accepted_by)
select ('30000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
  1, 'Synthetic scope', 100, 'VND', now() + interval '1 day', now(), '00000000-0000-4000-8000-0000000000a1'
from generate_series(1, 6) n;
insert into public.service_invitations (id, request_id, quote_id, worker_id, expires_at, state) values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', now() + interval '1 day', 'open'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b2', now() + interval '1 day', 'accepted'),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000c3', now() + interval '1 day', 'accepted'),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000b2', now() - interval '1 hour', 'open'),
  ('40000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-0000000000b2', now() + interval '1 day', 'declined'),
  ('40000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-0000000000d4', now() + interval '1 day', 'open');
insert into public.service_jobs (id, request_id, quote_id, invitation_id, worker_id, stage, version) values
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b2', 'working', 1),
  ('50000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000c3', 'working', 1);
insert into public.service_job_events (job_id, actor_id, event, version) values
  ('50000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b2', 'assigned', 1);

select ok(not has_function_privilege('anon', 'public.worker_job_cards()', 'execute'), 'Anonymous role cannot read worker job cards');
select ok(not has_function_privilege('anon', 'nestscout_private.worker_job_cards()', 'execute'), 'Anonymous role cannot call the private projection');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);

select is((select count(*)::integer from public.worker_job_cards()), 2, 'An eligible worker sees one open offer and one job');
select is((select ref_id from public.worker_job_cards() where kind = 'offer'), '40000000-0000-4000-8000-000000000001'::uuid, 'An offer is keyed by its invitation');
select is((select title from public.worker_job_cards() where kind = 'offer'), 'Sửa vòi nước', 'The title is the first line of the request');
select is((select photo_count from public.worker_job_cards() where kind = 'offer'), 2, 'An offer counts the request photos');
select is((select location from public.worker_job_cards() where kind = 'offer'), '', 'An offer hides the address');
select is((select customer_label from public.worker_job_cards() where kind = 'offer'), '', 'An offer hides the customer name');
select is((select updated_at from public.worker_job_cards() where kind = 'offer'), null::timestamptz, 'An offer has no stage time');
select is((select ref_id from public.worker_job_cards() where kind = 'job'), '50000000-0000-4000-8000-000000000002'::uuid, 'A job is keyed by its job id');
select is((select customer_label from public.worker_job_cards() where kind = 'job'), 'Lan', 'An assigned job shows the customer given name');
select isnt((select updated_at from public.worker_job_cards() where kind = 'job'), null::timestamptz, 'A job carries its latest stage time');
select is((select count(*)::integer from public.worker_job_cards() where ref_id in ('40000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000005')), 0, 'Expired and declined offers are not listed');
select is((select count(*)::integer from public.worker_job_cards() where ref_id = '50000000-0000-4000-8000-000000000003'), 0, 'Another worker job is not listed');
select is((select to_jsonb(w) ?| array['owner_id', 'worker_id', 'request_id', 'quote_id'] from public.worker_job_cards() w limit 1), false, 'Cards never expose account or resource ids');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
select is((select count(*)::integer from public.worker_job_cards()), 1, 'Another worker sees only their own job');
select is((select ref_id from public.worker_job_cards()), '50000000-0000-4000-8000-000000000003'::uuid, 'Another worker sees their own job id');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
select is_empty($$select 1 from public.worker_job_cards()$$, 'A worker without dispatch eligibility sees nothing');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is_empty($$select 1 from public.worker_job_cards()$$, 'A customer without a worker grant sees nothing');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated","is_anonymous":true}', true);
select is_empty($$select 1 from public.worker_job_cards()$$, 'An anonymous session sees nothing');

reset role;
select * from finish();
rollback;
