begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select is_empty(
  $$select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity$$,
  'Public application tables have RLS enabled'
);
select is_empty(
  $$select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and (has_table_privilege('anon', c.oid, 'select')
        or has_table_privilege('authenticated', c.oid, 'select'))
      and not coalesce(c.reloptions @> array['security_invoker=true'], false)$$,
  'Client-readable public views use invoker security'
);
select is_empty(
  $$select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and p.prorettype <> 'event_trigger'::regtype
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'))$$,
  'Public SECURITY DEFINER RPCs require reviewed private access'
);
select is_empty(
  $$select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(p.proconfig) setting
        where setting like 'search_path=%')$$,
  'Public SECURITY DEFINER functions pin search_path'
);

select * from finish();
rollback;
