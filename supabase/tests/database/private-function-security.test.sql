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
      'kael_read_context','propose_service_scope','decide_service_scope','report_service_job')
$$, 'Only reviewed private operations are callable by authenticated users');

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
