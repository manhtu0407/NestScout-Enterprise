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
select * from finish();
rollback;
