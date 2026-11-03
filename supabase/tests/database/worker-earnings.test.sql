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

insert into public.service_requests (id, owner_id, submission_key, description)
select ('10000000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-4000-8000-0000000000a1',
  ('20000000-0000-4000-8000-00000000000' || n)::uuid, 'Việc ' || n || E'\nChi tiết'
from generate_series(1, 6) n;
insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at, accepted_at, accepted_by)
select ('30000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
  1, 'Synthetic scope', n * 100000, 'VND', now() + interval '1 day', now(), '00000000-0000-4000-8000-0000000000a1'
from generate_series(1, 6) n;
insert into public.service_invitations (id, request_id, quote_id, worker_id, expires_at, state)
select ('40000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
  ('30000000-0000-4000-8000-00000000000' || n)::uuid,
  case when n = 5 then '00000000-0000-4000-8000-0000000000c3' when n = 6 then '00000000-0000-4000-8000-0000000000d4' else '00000000-0000-4000-8000-0000000000b2' end::uuid,
  now() + interval '1 day', 'accepted'
from generate_series(1, 6) n;
insert into public.service_jobs (id, request_id, quote_id, invitation_id, worker_id, stage, version)
select ('50000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
  ('30000000-0000-4000-8000-00000000000' || n)::uuid, ('40000000-0000-4000-8000-00000000000' || n)::uuid,
  case when n = 5 then '00000000-0000-4000-8000-0000000000c3' when n = 6 then '00000000-0000-4000-8000-0000000000d4' else '00000000-0000-4000-8000-0000000000b2' end::uuid,
  case when n = 3 then 'working' else 'completed' end, 1
from generate_series(1, 6) n;
insert into public.service_job_events (job_id, actor_id, event, version, created_at) values
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'accepted', 2, '2026-11-02 17:30:00+00'),
  ('50000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1', 'accepted', 2, '2026-11-01 05:00:00+00'),
  ('50000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-0000000000a1', 'accepted', 2, '2026-11-01 05:00:00+00'),
  ('50000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-0000000000a1', 'accepted', 2, '2026-11-01 05:00:00+00');
insert into public.service_scope_changes (job_id, proposed_by, proposal_key, proposed_from_version, sequence, old_scope, old_amount_minor, new_scope, new_amount_minor, currency, rationale, basis, decision, decided_by, decided_from_version, decided_at)
values ('50000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b2', '60000000-0000-4000-8000-000000000001', 1, 1, 'Synthetic scope', 200000, 'Phạm vi mới', 999000, 'VND', 'Phát sinh', 'local_fixture', 'approved', '00000000-0000-4000-8000-0000000000a1', 1, now());

select ok(not has_function_privilege('anon', 'public.worker_earnings()', 'execute'), 'Anonymous role cannot read earnings');
select ok(not has_function_privilege('anon', 'nestscout_private.worker_earnings()', 'execute'), 'Anonymous role cannot call the private projection');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is((select count(*)::integer from public.worker_earnings()), 2, 'Only accepted completed jobs of this worker are listed');
select is((select job_id from public.worker_earnings() limit 1), '50000000-0000-4000-8000-000000000001'::uuid, 'The most recent acceptance comes first');
select is((select completed_on from public.worker_earnings() where job_id = '50000000-0000-4000-8000-000000000001'), '2026-11-03'::date, 'The day follows Ho Chi Minh time');
select is((select completed_on from public.worker_earnings() where job_id = '50000000-0000-4000-8000-000000000002'), '2026-11-01'::date, 'An earlier acceptance keeps its own day');
select is((select amount_minor from public.worker_earnings() where job_id = '50000000-0000-4000-8000-000000000001'), 100000::bigint, 'The amount is the accepted quote');
select is((select amount_minor from public.worker_earnings() where job_id = '50000000-0000-4000-8000-000000000002'), 999000::bigint, 'An approved scope change replaces the amount');
select is((select title from public.worker_earnings() where job_id = '50000000-0000-4000-8000-000000000001'), 'Việc 1', 'The title is the first line of the request');
select is_empty($$select 1 from public.worker_earnings() where job_id = '50000000-0000-4000-8000-000000000003'$$, 'A job still in progress is not income');
select is_empty($$select 1 from public.worker_earnings() where job_id = '50000000-0000-4000-8000-000000000004'$$, 'A completed job without an acceptance event is not income');
select is_empty($$select 1 from public.worker_earnings() where job_id = '50000000-0000-4000-8000-000000000005'$$, 'Another worker income is not listed');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
select is_empty($$select 1 from public.worker_earnings()$$, 'A worker without dispatch eligibility sees nothing');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is_empty($$select 1 from public.worker_earnings()$$, 'A customer sees nothing');

reset role;
select * from finish();
rollback;
