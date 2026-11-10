begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated');
insert into public.worker_access_grants (user_id) values
  ('00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000000c3'),
  ('00000000-0000-4000-8000-0000000000d4');
insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active) values
  ('00000000-0000-4000-8000-0000000000a2', 'local_fixture', true),
  ('00000000-0000-4000-8000-0000000000b2', 'local_fixture', true),
  ('00000000-0000-4000-8000-0000000000c3', 'local_fixture', true),
  ('00000000-0000-4000-8000-0000000000d4', 'local_fixture', true);

create temporary table job_fixture (n integer primary key, worker uuid, stage text, version integer, owner uuid not null default '00000000-0000-4000-8000-0000000000a1');
insert into job_fixture values
  (1, '00000000-0000-4000-8000-0000000000b2', 'working', 1),
  (2, '00000000-0000-4000-8000-0000000000b2', 'working', 1),
  (3, '00000000-0000-4000-8000-0000000000b2', 'working', 1),
  (4, '00000000-0000-4000-8000-0000000000b2', 'working', 1),
  (5, '00000000-0000-4000-8000-0000000000d4', 'working', 1),
  (6, '00000000-0000-4000-8000-0000000000b2', 'submitted', 3),
  (7, '00000000-0000-4000-8000-0000000000b2', 'arrived', 1),
  (8, '00000000-0000-4000-8000-0000000000b2', 'paused', 2),
  (9, '00000000-0000-4000-8000-0000000000c3', 'working', 1),
  (10, '00000000-0000-4000-8000-0000000000b2', 'submitted', 2),
  (11, '00000000-0000-4000-8000-0000000000b2', 'completed', 3),
  (12, '00000000-0000-4000-8000-0000000000d4', 'working', 1),
  (13, '00000000-0000-4000-8000-0000000000b2', 'paused', 3),
  (14, '00000000-0000-4000-8000-0000000000b2', 'paused', 3);
insert into job_fixture (n, worker, stage, version, owner) values
  (15, '00000000-0000-4000-8000-0000000000b2', 'paused', 2, '00000000-0000-4000-8000-0000000000a2'),
  (16, '00000000-0000-4000-8000-0000000000a2', 'paused', 2, '00000000-0000-4000-8000-0000000000a1');

insert into public.service_requests (id, owner_id, submission_key, description)
select ('10000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, owner,
  ('20000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'Pause fixture'
from job_fixture;
insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at, accepted_at, accepted_by)
select ('30000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  ('10000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  1, 'Synthetic scope', 100, 'VND', now() + interval '1 day', now(), owner
from job_fixture;
insert into public.service_invitations (id, request_id, quote_id, worker_id, expires_at, state)
select ('40000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  ('10000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  ('30000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, worker, now() + interval '1 day', 'accepted'
from job_fixture;
insert into public.service_jobs (id, request_id, quote_id, invitation_id, worker_id, stage, version)
select ('50000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  ('10000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  ('30000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  ('40000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, worker, stage, version
from job_fixture;

insert into public.service_scope_changes (job_id, proposed_by, proposal_key, proposed_from_version, sequence, old_scope,
  old_amount_minor, new_scope, new_amount_minor, currency, rationale, basis)
values ('50000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b2', '60000000-0000-4000-8000-000000000002',
  1, 1, 'Synthetic scope', 100, 'Larger scope', 150, 'VND', 'More work found', 'local_fixture');

insert into public.service_submissions (id, job_id, submitted_by, submission_key, submitted_from_version, evidence,
  decision, decided_by, decided_at, decided_from_version, decision_reason)
select ('70000000-0000-4000-8000-0000000000' || lpad(j::text, 2, '0'))::uuid,
  ('50000000-0000-4000-8000-0000000000' || lpad(j::text, 2, '0'))::uuid, '00000000-0000-4000-8000-0000000000b2',
  gen_random_uuid(), 1, 'Evidence', 'disputed', '00000000-0000-4000-8000-0000000000a1', now(), 2, 'Private dispute facts'
from unnest(array[6, 8, 13]) j;
insert into public.service_cases (job_id, submission_id, kind, opened_by, operation_key, reason)
select ('50000000-0000-4000-8000-0000000000' || lpad(j::text, 2, '0'))::uuid,
  ('70000000-0000-4000-8000-0000000000' || lpad(j::text, 2, '0'))::uuid, 'dispute',
  '00000000-0000-4000-8000-0000000000a1', gen_random_uuid(), 'Private dispute facts'
from unnest(array[6, 8, 13]) j;
insert into public.service_submissions (id, job_id, submitted_by, submission_key, submitted_from_version, evidence)
values ('70000000-0000-4000-8000-000000000010', '50000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-0000000000b2', gen_random_uuid(), 1, 'Evidence');
insert into public.service_job_reports (job_id, actor_id, report_key, reported_from_version, kind, details)
values ('50000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-0000000000b2', gen_random_uuid(), 1, 'customer_absent', 'No answer');
insert into public.service_job_pauses (job_id, category, prior_stage, paused_by, paused_from_version, resume_requested_by,
  resume_requested_from_version, resume_requested_at)
values ('50000000-0000-4000-8000-000000000015', 'ordinary_interruption', 'working', '00000000-0000-4000-8000-0000000000b2', 1, null, null, null),
  ('50000000-0000-4000-8000-000000000016', 'ordinary_interruption', 'working', '00000000-0000-4000-8000-0000000000a2', 1, null, null, null),
  ('50000000-0000-4000-8000-000000000008', 'ordinary_interruption', 'working', '00000000-0000-4000-8000-0000000000b2', 1, null, null, null),
  ('50000000-0000-4000-8000-000000000013', 'ordinary_interruption', 'working', '00000000-0000-4000-8000-0000000000b2', 1,
    '00000000-0000-4000-8000-0000000000b2', 2, now()),
  ('50000000-0000-4000-8000-000000000014', 'safety_concern', 'working', '00000000-0000-4000-8000-0000000000b2', 1,
    '00000000-0000-4000-8000-0000000000b2', 2, now());

select ok(not has_table_privilege('authenticated', 'public.service_job_pauses', 'insert'), 'Clients cannot insert pause rows');
select ok(not has_table_privilege('authenticated', 'public.service_job_pauses', 'update'), 'Clients cannot update pause rows');
select ok(not has_table_privilege('authenticated', 'public.service_job_pauses', 'delete'), 'Clients cannot delete pause rows');
select ok(not has_table_privilege('anon', 'public.service_job_pauses', 'select'), 'Anonymous clients cannot read pause rows');
select ok(not has_column_privilege('authenticated', 'public.service_job_pauses', 'paused_by', 'select'), 'The pausing account is not readable');
select ok(not has_column_privilege('authenticated', 'public.service_job_pauses', 'resume_requested_by', 'select'), 'The resume requester is not readable');
select ok(not has_column_privilege('authenticated', 'public.service_job_pauses', 'resumed_by', 'select'), 'The consenting account is not readable');
select ok(has_column_privilege('authenticated', 'public.service_job_pauses', 'category', 'select'), 'The pause category is readable by participants');
select ok(not (select p.prosecdef from pg_proc p where p.oid = 'public.pause_service_job(uuid,integer,text)'::regprocedure),
  'The public pause command runs with the caller privileges');
select ok(not has_function_privilege('anon', 'public.pause_service_job(uuid,integer,text)', 'execute'), 'Anonymous clients cannot pause');
select ok(not has_function_privilege('anon', 'public.worker_pauses()', 'execute'), 'Anonymous clients cannot read Worker pauses');
select ok(not has_function_privilege('anon', 'public.customer_pauses()', 'execute'), 'Anonymous clients cannot read Customer pauses');
select ok(not has_column_privilege('anon', 'public.service_job_pauses', 'category', 'select'), 'Anonymous clients cannot read the pause category');
select ok(not has_function_privilege('anon', 'public.request_service_resume(uuid,integer)', 'execute'), 'Anonymous clients cannot request a resume');
select ok(not has_function_privilege('anon', 'public.consent_service_resume(uuid,integer)', 'execute'), 'Anonymous clients cannot consent to a resume');
select ok(not has_function_privilege('authenticated', 'nestscout_private.job_has_dispute(uuid)', 'execute'), 'The dispute check is not a client operation');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is(public.pause_service_job('50000000-0000-4000-8000-000000000001', 1, 'ordinary_interruption'), 2,
  'The Worker pauses for an ordinary interruption');
select is(public.pause_service_job('50000000-0000-4000-8000-000000000001', 1, 'ordinary_interruption'), 2, 'An identical pause retry returns the original version');
select is((select count(*)::integer from public.service_job_pauses where job_id = '50000000-0000-4000-8000-000000000001'), 1, 'The retry recorded no second pause');
select is((select count(*)::integer from public.service_job_events where job_id = '50000000-0000-4000-8000-000000000001' and event = 'paused'), 1, 'The retry recorded no second event');
select is((select category from public.service_job_pauses where job_id = '50000000-0000-4000-8000-000000000001'), 'ordinary_interruption', 'The pause records its category');
select is((select prior_stage from public.service_job_pauses where job_id = '50000000-0000-4000-8000-000000000001'), 'working', 'The pause records the prior stage');
select is((select paused_from_version from public.service_job_pauses where job_id = '50000000-0000-4000-8000-000000000001'), 1, 'The pause records the version it was made from');
select throws_ok($$select public.pause_service_job('50000000-0000-4000-8000-000000000001', 1, 'safety_concern')$$, '40001', 'stale job', 'A pause with a stale version is refused');
select throws_ok($$select public.pause_service_job('50000000-0000-4000-8000-000000000001', 2, 'bogus')$$, '22023', 'invalid pause', 'An unknown pause category is refused');
select throws_ok($$select public.pause_service_job('50000000-0000-4000-8000-000000000001', 2, null)$$, '22023', 'invalid pause', 'A pause without a category is refused');
select throws_ok($$select public.advance_service_job('50000000-0000-4000-8000-000000000001', 2, 'paused')$$, '22023', 'invalid transition',
  'The unclassified pause path is closed');
select throws_ok($$select public.pause_service_job('50000000-0000-4000-8000-000000000001', 2, 'ordinary_interruption')$$, '22023', 'invalid transition',
  'A paused job cannot be paused again for an ordinary reason');
select throws_ok($$select public.request_service_resume('50000000-0000-4000-8000-000000000001', 1)$$, '40001', 'stale job', 'A resume request with a stale version is refused');
select is(public.request_service_resume('50000000-0000-4000-8000-000000000001', 2), 3, 'The Worker asks to resume');
select is(public.request_service_resume('50000000-0000-4000-8000-000000000001', 2), 3, 'An identical resume request returns the original version');
select is((select count(*)::integer from public.service_job_events where job_id = '50000000-0000-4000-8000-000000000001' and event = 'resume_requested'), 1,
  'The retry recorded no second request');
select throws_ok($$select public.request_service_resume('50000000-0000-4000-8000-000000000001', 3)$$, '22023', 'invalid transition', 'A resume cannot be requested twice');
select is((select stage from public.service_jobs where id = '50000000-0000-4000-8000-000000000001'), 'paused', 'A request alone does not resume the work');
select is((select count(*)::integer from public.worker_pauses() where job_id = '50000000-0000-4000-8000-000000000001' and resume_requested), 1,
  'The Worker sees that a request is waiting');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
select throws_ok($$select public.pause_service_job('50000000-0000-4000-8000-000000000001', 3, 'safety_concern')$$, '42501', 'job unavailable', 'Another Worker cannot pause the job');
select throws_ok($$select public.request_service_resume('50000000-0000-4000-8000-000000000001', 3)$$, '42501', 'job unavailable', 'Another Worker cannot request a resume');
select is_empty($$select 1 from public.worker_pauses()$$, 'Another Worker sees no pause');
select is_empty($$select 1 from public.customer_pauses()$$, 'Another Worker sees no pause as a Customer either');
select throws_ok($$select public.advance_service_job('50000000-0000-4000-8000-000000000009', 1, 'paused')$$, '22023', 'invalid transition',
  'The unclassified pause path stays closed for a working job');
select is((select stage from public.service_jobs where id = '50000000-0000-4000-8000-000000000009'), 'working', 'The refused pause left the job working');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select public.pause_service_job('50000000-0000-4000-8000-000000000001', 3, 'safety_concern')$$, '42501', null, 'A Customer cannot pause');
select throws_ok($$select public.request_service_resume('50000000-0000-4000-8000-000000000001', 3)$$, '42501', null, 'A Customer cannot request a resume');
select throws_ok($$select public.consent_service_resume('50000000-0000-4000-8000-000000000001', 2)$$, '40001', 'stale job', 'Consent to a stale version is refused');
select throws_ok($$select public.consent_service_resume('50000000-0000-4000-8000-000000000003', 1)$$, '22023', 'invalid transition', 'Consent without a paused job is refused');
select is(public.consent_service_resume('50000000-0000-4000-8000-000000000001', 3), 4, 'The Customer agrees to the exact version and the work resumes');
select is(public.consent_service_resume('50000000-0000-4000-8000-000000000001', 3), 4, 'A duplicate consent returns the original version');
select is((select count(*)::integer from public.service_job_events where job_id = '50000000-0000-4000-8000-000000000001' and event = 'resumed'), 1, 'The duplicate recorded no second event');
select is((select stage from public.service_jobs where id = '50000000-0000-4000-8000-000000000001'), 'working', 'The work returns to the recorded prior stage');
select throws_ok($$select public.consent_service_resume('50000000-0000-4000-8000-000000000001', 4)$$, '22023', 'invalid transition', 'Consent cannot be given when nothing is paused');
select is_empty($$select 1 from public.customer_pauses() where job_id = '50000000-0000-4000-8000-000000000001'$$, 'A resumed pause is no longer open');
reset role;

select is((select resumed_by from public.service_job_pauses where job_id = '50000000-0000-4000-8000-000000000001'), '00000000-0000-4000-8000-0000000000a1'::uuid,
  'The Customer who agreed is recorded');
select is((select resumed_from_version from public.service_job_pauses where job_id = '50000000-0000-4000-8000-000000000001'), 3, 'The consent records the version agreed');
select is((select actor_id from public.service_job_events where job_id = '50000000-0000-4000-8000-000000000001' and event = 'resumed'),
  '00000000-0000-4000-8000-0000000000a1'::uuid, 'The resume event names the Customer');
select is((select version from public.service_job_events where job_id = '50000000-0000-4000-8000-000000000001' and event = 'resumed'), 4, 'The resume event carries the new version');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
select throws_ok($$select public.consent_service_resume('50000000-0000-4000-8000-000000000001', 4)$$, '42501', 'job unavailable', 'Another Customer cannot consent');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is(public.pause_service_job('50000000-0000-4000-8000-000000000002', 1, 'ordinary_interruption'), 2, 'A job with a pending proposal can be paused');
select throws_ok($$select public.request_service_resume('50000000-0000-4000-8000-000000000002', 2)$$, '22023', 'scope decision pending',
  'A resume cannot be requested while the scope is undecided');
select is(public.pause_service_job('50000000-0000-4000-8000-000000000003', 1, 'safety_concern'), 2, 'The Worker stops immediately for a safety concern');
select throws_ok($$select public.request_service_resume('50000000-0000-4000-8000-000000000003', 2)$$, '22023', 'invalid transition',
  'A safety stop cannot be turned into a resume request');
select throws_ok($$select public.pause_service_job('50000000-0000-4000-8000-000000000003', 2, 'safety_concern')$$, '22023', 'invalid transition',
  'A safety stop cannot be paused again');
select is(public.pause_service_job('50000000-0000-4000-8000-000000000004', 1, 'ordinary_interruption'), 2, 'A fourth job is paused for an ordinary reason');
select is(public.request_service_resume('50000000-0000-4000-8000-000000000004', 2), 3, 'The Worker asks to resume the fourth job');
select is(public.pause_service_job('50000000-0000-4000-8000-000000000004', 3, 'safety_concern'), 4, 'The Worker escalates a pending resume to a safety stop');
select is(public.pause_service_job('50000000-0000-4000-8000-000000000004', 3, 'safety_concern'), 4, 'An identical escalation retry returns the original version');
select is((select count(*)::integer from public.service_job_events where job_id = '50000000-0000-4000-8000-000000000004' and event = 'safety_escalated'), 1,
  'The escalation retry recorded no second event');
select is((select category from public.service_job_pauses where job_id = '50000000-0000-4000-8000-000000000004' and resumed_at is null), 'safety_concern', 'The pause is now a safety stop');
select is((select resume_requested from public.worker_pauses() where job_id = '50000000-0000-4000-8000-000000000004'), false, 'An escalated pause shows no pending resume request');
select is((select category from public.worker_pauses() where job_id = '50000000-0000-4000-8000-000000000004'), 'safety_concern', 'The projection reports the safety stop');
select throws_ok($$select public.request_service_resume('50000000-0000-4000-8000-000000000004', 4)$$, '22023', 'invalid transition', 'An escalated pause cannot be resumed');
select throws_ok($$select public.pause_service_job('50000000-0000-4000-8000-000000000006', 3, 'safety_concern')$$, '22023', 'invalid transition', 'A disputed job cannot be paused');
select throws_ok($$select public.pause_service_job('50000000-0000-4000-8000-000000000010', 2, 'ordinary_interruption')$$, '22023', 'invalid transition', 'A job awaiting the Customer cannot be paused');
select throws_ok($$select public.pause_service_job('50000000-0000-4000-8000-000000000011', 3, 'safety_concern')$$, '22023', 'invalid transition', 'A completed job cannot be paused');
reset role;

select throws_ok($$update public.service_job_pauses set resume_requested_by = '00000000-0000-4000-8000-0000000000b2', resume_requested_from_version = 2,
  resume_requested_at = now(), resumed_by = '00000000-0000-4000-8000-0000000000a1', resumed_from_version = 2, resumed_at = now()
  where job_id = '50000000-0000-4000-8000-000000000003'$$, '23514', null, 'The database refuses to resume a safety stop');
select throws_ok($$insert into public.service_job_pauses (job_id, category, prior_stage, paused_by, paused_from_version)
  values ('50000000-0000-4000-8000-000000000003', 'ordinary_interruption', 'working', '00000000-0000-4000-8000-0000000000b2', 5)$$,
  '23505', null, 'A job has at most one open pause');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select public.consent_service_resume('50000000-0000-4000-8000-000000000004', 3)$$, '40001', 'stale job',
  'Consent given to the earlier request is stale after an escalation');
select throws_ok($$select public.consent_service_resume('50000000-0000-4000-8000-000000000004', 4)$$, '22023', 'invalid transition',
  'Consent cannot lift a safety stop');
select throws_ok($$select public.consent_service_resume('50000000-0000-4000-8000-000000000003', 2)$$, '22023', 'invalid transition',
  'Consent cannot lift a safety stop that had no request');
select throws_ok($$select public.consent_service_resume('50000000-0000-4000-8000-000000000002', 2)$$, '22023', 'invalid transition',
  'Consent needs the Worker request first');
select throws_ok($$select public.consent_service_resume('50000000-0000-4000-8000-000000000014', 3)$$, '22023', 'invalid transition',
  'Consent is refused for a safety stop even when its version matches a request');
select is((select count(*)::integer from public.customer_pauses() where category = 'safety_concern'), 3, 'The Customer sees all safety stops');
select throws_ok($$select paused_by from public.service_job_pauses$$, '42501', null, 'The Customer cannot read the pausing account');
select throws_ok($$select resumed_by from public.service_job_pauses$$, '42501', null, 'The Customer cannot read the consenting account');
select throws_ok($$update public.service_job_pauses set category = 'ordinary_interruption'$$, '42501', null, 'The Customer cannot rewrite a pause');
select throws_ok($$delete from public.service_job_pauses$$, '42501', null, 'The Customer cannot delete a pause');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select throws_ok($$select resume_requested_by from public.service_job_pauses$$, '42501', null, 'The Worker cannot read the requesting account column');
select throws_ok($$insert into public.service_job_pauses (job_id, category, prior_stage, paused_by, paused_from_version)
  values ('50000000-0000-4000-8000-000000000009', 'ordinary_interruption', 'working', '00000000-0000-4000-8000-0000000000b2', 1)$$,
  '42501', null, 'The Worker cannot write a pause directly');
select throws_ok($$update public.service_job_pauses set resume_requested_at = null$$, '42501', null, 'The Worker cannot withdraw a pause record');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select throws_ok($$select public.request_service_resume('50000000-0000-4000-8000-000000000008', 2)$$, '22023', 'dispute hold', 'A resume cannot be requested while a dispute is open');
select throws_ok($$select public.request_service_resume('50000000-0000-4000-8000-000000000014', 3)$$, '22023', 'invalid transition', 'A resume cannot be requested for a safety stop');
select throws_ok($$select public.submit_service_work('50000000-0000-4000-8000-000000000006', 3, gen_random_uuid(), 'More evidence')$$, '22023', 'invalid transition', 'A disputed job accepts no new evidence');
select throws_ok($$select public.advance_service_job('50000000-0000-4000-8000-000000000006', 3, 'en_route')$$, '22023', 'invalid transition', 'A disputed job cannot advance');
select throws_ok($$select public.propose_service_scope('50000000-0000-4000-8000-000000000006', 3, gen_random_uuid(), 'Scope', 1, 'Reason')$$, '22023', 'invalid transition', 'A disputed job accepts no scope proposal');
select throws_ok($$select public.report_service_job('50000000-0000-4000-8000-000000000006', 3, gen_random_uuid(), 'delay', 'Late')$$, '22023', 'invalid transition', 'A disputed job accepts no report');
select throws_ok($$select public.request_service_resume('50000000-0000-4000-8000-000000000006', 3)$$, '22023', 'invalid transition', 'A disputed job cannot be resumed');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select public.consent_service_resume('50000000-0000-4000-8000-000000000013', 3)$$, '22023', 'dispute hold', 'Consent is refused while a dispute is open');
select throws_ok($$select public.decide_service_submission('70000000-0000-4000-8000-000000000006', 3, 'accepted', null)$$, '22023', 'invalid transition', 'A dispute cannot be closed by the Customer decision command');
select throws_ok($$select public.decide_service_submission('70000000-0000-4000-8000-000000000006', 3, 'revision_requested', 'Again')$$, '22023', 'invalid transition', 'A dispute cannot be turned into a correction');
select throws_ok($$select public.open_service_aftercare('50000000-0000-4000-8000-000000000006', gen_random_uuid(), 'Support')$$, '22023', 'job not completed', 'A disputed job opens no aftercare case');
select throws_ok($$select public.consent_service_resume('50000000-0000-4000-8000-000000000006', 3)$$, '22023', 'invalid transition', 'A disputed job cannot be resumed');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is(public.pause_service_job('50000000-0000-4000-8000-000000000007', 1, 'ordinary_interruption'), 2, 'A Worker who reported a no-answer pauses');
select is(public.request_service_resume('50000000-0000-4000-8000-000000000007', 2), 3, 'The Worker asks to resume after the no-answer report');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is(public.consent_service_resume('50000000-0000-4000-8000-000000000007', 3), 4, 'The Customer agrees to resume');
select is((select stage from public.service_jobs where id = '50000000-0000-4000-8000-000000000007'), 'arrived', 'The job returns to arrival, not to work');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select throws_ok($$select public.advance_service_job('50000000-0000-4000-8000-000000000007', 4, 'working')$$, '22023', 'absence recovery policy required',
  'A no-answer report still blocks the start of work after a pause cycle');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
select is(public.pause_service_job('50000000-0000-4000-8000-000000000005', 1, 'ordinary_interruption'), 2, 'A Worker pauses a fifth job');
select is(public.pause_service_job('50000000-0000-4000-8000-000000000012', 1, 'ordinary_interruption'), 2, 'The same Worker pauses a twelfth job');
select is(public.request_service_resume('50000000-0000-4000-8000-000000000012', 2), 3, 'The Worker asks to resume the twelfth job');
reset role;

update public.worker_access_grants set status = 'revoked', revoked_at = now() where user_id = '00000000-0000-4000-8000-0000000000d4';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
select throws_ok($$select public.request_service_resume('50000000-0000-4000-8000-000000000005', 2)$$, '42501', 'worker unavailable', 'A revoked Worker cannot request a resume');
select throws_ok($$select public.pause_service_job('50000000-0000-4000-8000-000000000005', 2, 'safety_concern')$$, '42501', 'worker unavailable', 'A revoked Worker cannot escalate');
select is_empty($$select 1 from public.worker_pauses()$$, 'A revoked Worker sees no pause');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select public.consent_service_resume('50000000-0000-4000-8000-000000000012', 3)$$, '42501', 'worker unavailable',
  'Consent is refused when the requesting Worker has been revoked');
select is((select stage from public.service_jobs where id = '50000000-0000-4000-8000-000000000012'), 'paused', 'The job stays paused');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
select is((select array_agg(job_id) from public.worker_pauses()), array['50000000-0000-4000-8000-000000000016'::uuid],
  'An account that is both Customer and Worker receives only the pauses of the jobs it holds as Worker');
select is((select array_agg(job_id) from public.customer_pauses()), array['50000000-0000-4000-8000-000000000015'::uuid],
  'The same account receives only the pauses of the jobs it owns as Customer');
select is((select count(*)::integer from public.worker_jobs()), 1, 'The Worker mode of that account lists exactly the job it holds');
select is((select count(*)::integer from public.worker_pauses() p where p.job_id not in (select w.job_id from public.worker_jobs() w)), 0,
  'No Worker pause row falls outside the Worker job list');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select ok((select array_agg(job_id order by job_id) from public.worker_pauses()) @> array['50000000-0000-4000-8000-000000000015'::uuid],
  'The Worker of the dual-role account job sees that pause as Worker');
select is_empty($$select 1 from public.customer_pauses()$$, 'That Worker owns no job and so sees no pause as Customer');
reset role;

set local role anon;
select throws_ok($$select * from public.worker_pauses()$$, '42501', null, 'An unauthenticated client cannot read Worker pauses');
select throws_ok($$select * from public.customer_pauses()$$, '42501', null, 'An unauthenticated client cannot read Customer pauses');
reset role;

select * from finish();
rollback;
