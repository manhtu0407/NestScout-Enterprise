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
      'kael_actor_capabilities','kael_context_tasks','kael_conversation_state','kael_pilot_status','knowledge_actor_valid')
$$, 'Only reviewed private operations are callable by authenticated users');

select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='nestscout_private' and has_function_privilege('service_role',p.oid,'execute')
    and p.proname not in ('kael_start_run','kael_finish_run','kael_save_task','kael_record_tool',
      'kael_request_approval','kael_consume_approval','kael_complete_approval','kael_reject_approval','kael_pilot_charge','kael_provider_charge')
$$, 'The trusted server role reaches only the reviewed Kael-internal operations in the private schema');

select ok(not has_schema_privilege('anon','nestscout_private','usage'), 'Anonymous users cannot use the private schema');
select ok(not has_function_privilege('authenticated','nestscout_private.lock_current_worker()','execute'),
  'Worker lock helper is not a client operation');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','nestscout_private') and p.proname ~* '(pay|paid|settle|refund|webhook)'
$$, 'No payment, settlement, refund or provider callback function exists');

select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','nestscout_private') and c.relkind in ('r','v','m','p')
    and c.relname ~* '(pay|paid|settle|refund|webhook|ledger)'
$$, 'No payment or ledger relation exists to be set by a client');

select is_empty($$
  select a.attrelid::regclass::text || '.' || a.attname from pg_attribute a
  join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','nestscout_private') and c.relkind in ('r','v','m','p')
    and a.attnum > 0 and not a.attisdropped and a.attname ~* '(^|_)(paid|payment|settled)(_|$)'
$$, 'No work or job row carries a paid or settled flag');

select * from finish();
rollback;
