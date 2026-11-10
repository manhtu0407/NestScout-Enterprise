begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated');
insert into public.worker_access_grants (user_id) values ('00000000-0000-4000-8000-0000000000b2');
insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active)
  values ('00000000-0000-4000-8000-0000000000b2', 'local_fixture', true);

insert into public.service_requests (id, owner_id, submission_key, description)
select ('10000000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-4000-8000-0000000000a1',
  ('20000000-0000-4000-8000-00000000000' || n)::uuid, 'Visibility fixture'
from generate_series(1, 3) n;
insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at, accepted_at, accepted_by)
select ('30000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
  1, 'Synthetic scope', 100, 'VND', now() + interval '1 day', now(), '00000000-0000-4000-8000-0000000000a1'
from generate_series(1, 3) n;
insert into public.service_invitations (id, request_id, quote_id, worker_id, expires_at, state)
select ('40000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
  ('30000000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-4000-8000-0000000000b2', now() + interval '1 day',
  case when n = 3 then 'open' else 'accepted' end
from generate_series(1, 3) n;
insert into public.service_jobs (id, request_id, quote_id, invitation_id, worker_id, stage, version)
select ('50000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
  ('30000000-0000-4000-8000-00000000000' || n)::uuid, ('40000000-0000-4000-8000-00000000000' || n)::uuid,
  '00000000-0000-4000-8000-0000000000b2', case when n = 1 then 'working' else 'en_route' end, 1
from generate_series(1, 2) n;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select lives_ok($$select public.propose_service_scope('50000000-0000-4000-8000-000000000001', 1, '60000000-0000-4000-8000-000000000001', 'Larger scope', 150, 'More work found')$$,
  'Worker proposes a scope change');
select lives_ok($$select public.report_service_job('50000000-0000-4000-8000-000000000002', 1, '60000000-0000-4000-8000-000000000002', 'delay', 'Stuck in traffic')$$,
  'Worker reports a delay');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select lives_ok($$select public.decide_service_scope((select id from public.service_scope_changes), 2, 1, 'approved')$$,
  'Customer approves the proposal');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select lives_ok($$select public.submit_service_work('50000000-0000-4000-8000-000000000001', 3, '60000000-0000-4000-8000-000000000003', 'Done')$$,
  'Worker submits work');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select lives_ok($$select public.decide_service_submission((select id from public.service_submissions), 4, 'revision_requested', 'Reseal the joint')$$,
  'Customer requests a correction');
reset role;

select is_empty($$
  select format('%I.%I', c.relname, a.attname)
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_constraint k on k.conrelid = c.oid and k.contype = 'f' and k.confrelid = 'auth.users'::regclass and a.attnum = any (k.conkey)
  where c.relnamespace = 'public'::regnamespace
    and c.relname in ('service_job_events', 'service_scope_changes', 'service_job_reports', 'service_submissions', 'service_jobs')
    and a.attname <> 'id'
    and has_column_privilege('authenticated', c.oid, a.attnum, 'select')
$$, 'No table readable by both parties exposes an account id column');
select is_empty($$
  select format('%I.%I', c.relname, a.attname)
  from pg_attribute a join pg_class c on c.oid = a.attrelid
  where c.relnamespace = 'public'::regnamespace
    and c.relname in ('service_job_events', 'service_scope_changes', 'service_job_reports', 'service_submissions', 'service_jobs')
    and a.attnum > 0 and not a.attisdropped
    and (a.attname ~ '_key$' or a.attname in ('decision_reason', 'decided_by', 'proposed_by', 'actor_id', 'worker_id', 'submitted_by'))
    and has_column_privilege('authenticated', c.oid, a.attnum, 'select')
$$, 'Idempotency tokens, private reasons and actor columns are not client-readable');
select is_empty($$
  select c.relname from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relname in ('service_job_events', 'service_scope_changes', 'service_job_reports', 'service_submissions', 'service_jobs')
    and has_table_privilege('authenticated', c.oid, 'select')
$$, 'No shared workflow table keeps a table-wide client SELECT grant');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select actor_id from public.service_job_events$$, '42501', null, 'Customer cannot read event actors');
select throws_ok($$select worker_id from public.service_jobs$$, '42501', null, 'Customer cannot read the assigned Worker account id');
select throws_ok($$select proposed_by from public.service_scope_changes$$, '42501', null, 'Customer cannot read the proposer account id');
select throws_ok($$select actor_id from public.service_job_reports$$, '42501', null, 'Customer cannot read the reporter account id');
select throws_ok($$select submitted_by from public.service_submissions$$, '42501', null, 'Customer cannot read the submitter account id');
select is((select count(*)::integer from public.service_jobs), 2, 'Customer still sees both jobs through row policy');
select is((select count(*)::integer from public.service_jobs where stage = 'submitted' or stage = 'working'), 1,
  'Customer reads the job columns the app uses');
select is((select count(*)::integer from (select id, request_id, stage, version from public.service_jobs) j), 2,
  'The Customer job projection used by the app is readable');
select is((select count(*)::integer from (select id, job_id, sequence, old_scope, old_amount_minor, new_scope, new_amount_minor, currency, rationale, decision from public.service_scope_changes) s), 1,
  'The Customer scope projection used by the app is readable');
select is((select count(*)::integer from (select id, job_id, kind, details from public.service_job_reports) r), 1,
  'The Customer report projection used by the app is readable');
select is((select count(*)::integer from (select event, version from public.service_job_events) e where e.event in ('scope_proposed', 'scope_approved', 'submitted', 'revision_requested')), 4,
  'The event timeline remains readable without actors');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select throws_ok($$select actor_id from public.service_job_events$$, '42501', null, 'Worker cannot read event actors');
select throws_ok($$select decided_by from public.service_scope_changes$$, '42501', null, 'Worker cannot read the Customer account id from a scope decision');
select throws_ok($$select * from public.service_jobs$$, '42501', null, 'A wildcard read of jobs cannot reach the account columns');
select is((select count(*)::integer from public.service_jobs), 2, 'Worker still sees assigned jobs through row policy');
select is((select count(*)::integer from public.worker_jobs()), 2, 'The Worker job projection is unchanged');
select is((select basis from public.worker_offers()), 'local_fixture', 'The Worker offer projection carries fixture provenance');
select is((select count(*)::integer from public.worker_offers()), 1, 'The offer projection still lists only the live open offer');
reset role;

select * from finish();
rollback;
