begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='nestscout_private' and p.prosecdef
    and not coalesce(p.proconfig @> array['search_path=""'], false)
$$, 'Private privileged functions have an empty search path');

select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='nestscout_private' and has_function_privilege('anon',p.oid,'execute')
$$, 'Anonymous users cannot execute private functions');

select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='nestscout_private' and has_function_privilege('authenticated',p.oid,'execute')
    and p.proname not in ('accept_service_quote','reject_service_quote','current_worker_eligible',
      'worker_offers','worker_jobs','accept_service_invitation','decline_service_invitation',
      'advance_service_job','submit_service_work','decide_service_submission','open_service_aftercare',
      'kael_read_context','propose_service_scope','decide_service_scope','report_service_job',
      'pause_service_job','request_service_resume','consent_service_resume','save_worker','saved_workers','account_phone','job_worker_cards','review_job_worker','request_photo_upload_count','worker_job_cards','save_worker_profile','save_worker_coverage','set_worker_accepting','add_worker_certificate','remove_worker_certificate','my_worker_profile','worker_earnings',
      'kael_actor_capabilities','kael_context_tasks','kael_conversation_state','kael_conversation_snapshot','kael_list_conversations','kael_rename_conversation','kael_set_conversation_pinned','kael_set_conversation_archived','kael_delete_conversation','kael_pilot_status','knowledge_actor_valid',
      'clear_kael_history','accept_terms','request_account_deletion','cancel_account_deletion','set_consent','export_my_data',
      'register_push_token','unregister_push_token','job_change_participant','request_job_change','decide_job_change',
      'add_worker_document','remove_worker_document','my_worker_payout_account','set_worker_payout_account','remove_worker_payout_account',
      'toggle_review_reaction','review_reactions',
      'issue_fixture_quote','invite_fixture_worker','fixture_dispatch_queue','fixture_dispatch_candidates','set_kael_autonomy',
      'set_request_preferred_visit','set_kael_feedback',
      'dispatch_summary','cancel_service_request','redispatch_service_request','retry_service_dispatch','set_request_service','release_service_job','request_service_reassignment','escalate_service_job',
      'operator_escalation_queue','review_service_escalation','resolve_service_escalation','operator_access')
$$, 'Only reviewed private operations are callable by authenticated users');

select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='nestscout_private' and has_function_privilege('service_role',p.oid,'execute')
    and p.proname not in ('kael_start_run','kael_finish_run','kael_save_task','kael_record_tool',
      'kael_request_approval','kael_consume_approval','kael_complete_approval','kael_reject_approval','kael_pilot_charge',
      'kael_durable_start_run','kael_durable_claim','kael_durable_heartbeat','kael_durable_release','kael_durable_claim_next','kael_durable_expire',
      'kael_durable_purge_queue','kael_durable_mark_purged','kael_durable_known','kael_durable_erasure_pending',
      'claim_push_deliveries','finish_push_delivery','process_account_deletions','purge_expired_data')
$$, 'The trusted server role reaches only the reviewed Kael-internal operations in the private schema');

select ok(not has_schema_privilege('anon','nestscout_private','usage'), 'Anonymous users cannot use the private schema');
select ok(not has_function_privilege('authenticated','nestscout_private.lock_current_worker()','execute'),
  'Worker lock helper is not a client operation');
select ok(not has_function_privilege('authenticated','nestscout_private.require_fixture_operator()','execute')
  and not has_function_privilege('authenticated','nestscout_private.lock_fixture_operator()','execute'),
  'Fixture operator checks are not client operations');
select ok(not has_function_privilege('authenticated','nestscout_private.require_escalation_operator()','execute')
  and not has_function_privilege('authenticated','nestscout_private.lock_escalation_operator()','execute')
  and not has_function_privilege('authenticated','nestscout_private.is_escalation_operator(uuid)','execute')
  and not has_function_privilege('authenticated','nestscout_private.escalation_review_stale(timestamptz, uuid)','execute'),
  'Escalation operator checks are not client operations');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','nestscout_private') and p.proname ~* '(pay|paid|settle|refund|webhook)'
    and p.proname not in ('my_worker_payout_account','set_worker_payout_account','remove_worker_payout_account')
$$, 'No payment, settlement, refund or provider callback function exists');

select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','nestscout_private') and c.relkind in ('r','v','m','p')
    and c.relname ~* '(pay|paid|settle|refund|webhook|ledger)'
    and c.relname not in ('worker_payout_accounts','worker_payout_accounts_qr')
$$, 'No payment or ledger relation exists to be set by a client');

select is_empty($$
  select a.attrelid::regclass::text || '.' || a.attname from pg_attribute a
  join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','nestscout_private') and c.relkind in ('r','v','m','p')
    and a.attnum > 0 and not a.attisdropped and a.attname ~* '(^|_)(paid|payment|settled)(_|$)'
$$, 'No work or job row carries a paid or settled flag');

select is_empty($$
  select a.attname from pg_attribute a
  where a.attrelid = 'public.worker_payout_accounts'::regclass and a.attnum > 0 and not a.attisdropped
    and a.attname ~* '(amount|balance|minor|currency|transfer|withdraw|paid|settle)'
$$, 'Worker payout account details carry no amount, balance or money movement');

select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','nestscout_private') and p.proname ~* '((^|_)(withdraw|transfer|disburse)(_|$)|payout_request)'
$$, 'No withdrawal, transfer or disbursement operation exists');

select * from finish();
rollback;
