begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.security_findings()
returns table (check_name text, object_name text)
language sql as $checks$
  select 'rls', c.relname::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  union all
  select 'view_security', c.relname::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and (has_any_column_privilege('anon', c.oid, 'select') or has_any_column_privilege('authenticated', c.oid, 'select'))
    and not coalesce(c.reloptions @> array['security_invoker=true'], false)
  union all
  select 'non_rls_relation', c.relname::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('m', 'f')
    and (has_any_column_privilege('anon', c.oid, 'select') or has_any_column_privilege('authenticated', c.oid, 'select'))
  union all
  select case when p.prorettype in ('event_trigger'::regtype, 'trigger'::regtype)
    then 'hook_execute' else 'rpc_execute' end, p.proname::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
  union all
  select 'search_path', p.proname::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not coalesce(p.proconfig && array['search_path=pg_catalog', 'search_path=""', 'search_path=pg_catalog, pg_temp'], false);
$checks$;

select is_empty($$select * from pg_temp.security_findings()$$,
  'Actual local public catalog satisfies the reviewed metadata invariants; not hosted or business authorization coverage');

create table public.__audit_table (id integer);
select results_eq($$select check_name from pg_temp.security_findings() where object_name = '__audit_table'$$,
  array['rls'], 'Detect a real table without RLS');
alter table public.__audit_table enable row level security;
select is_empty($$select * from pg_temp.security_findings() where object_name = '__audit_table'$$,
  'Accept the same table after RLS is enabled');

create view public.__audit_view as select id from public.__audit_table;
revoke select on public.__audit_view from public, anon, authenticated;
grant select (id) on public.__audit_view to anon;
select results_eq($$select check_name from pg_temp.security_findings() where object_name = '__audit_view'$$,
  array['view_security'], 'Detect definer views readable through column-only grants');
alter view public.__audit_view set (security_invoker = true);
select is_empty($$select * from pg_temp.security_findings() where object_name = '__audit_view'$$,
  'Accept the same view with invoker security');

create materialized view public.__audit_snapshot as select id from public.__audit_table;
grant select on public.__audit_snapshot to authenticated;
select results_eq($$select check_name from pg_temp.security_findings() where object_name = '__audit_snapshot'$$,
  array['non_rls_relation'], 'Detect readable materialized snapshots that cannot enforce row RLS');
revoke select on public.__audit_snapshot from public, anon, authenticated;
select is_empty($$select * from pg_temp.security_findings() where object_name = '__audit_snapshot'$$,
  'Accept a snapshot unavailable to client roles');

create function public.__audit_rpc() returns integer language sql security definer set search_path = pg_catalog as $$select 1$$;
select results_eq($$select check_name from pg_temp.security_findings() where object_name = '__audit_rpc'$$,
  array['rpc_execute'], 'Detect SECURITY DEFINER EXECUTE inherited from client/default grants');
revoke execute on function public.__audit_rpc() from public, anon, authenticated;
select is_empty($$select * from pg_temp.security_findings() where object_name = '__audit_rpc'$$,
  'Accept explicit removal of all client EXECUTE paths');
alter function public.__audit_rpc() set search_path = public;
select results_eq($$select check_name from pg_temp.security_findings() where object_name = '__audit_rpc'$$,
  array['search_path'], 'Reject a pinned application search_path; presence alone is insufficient');
alter function public.__audit_rpc() set search_path = pg_catalog;
select is_empty($$select * from pg_temp.security_findings() where object_name = '__audit_rpc'$$,
  'Accept the reviewed catalog-only search_path');

create function public.__audit_hook() returns event_trigger language plpgsql security definer set search_path = pg_catalog as $$begin return; end$$;
select results_eq($$select check_name from pg_temp.security_findings() where object_name = '__audit_hook'$$,
  array['hook_execute'], 'Report event-trigger ACL hygiene separately from ordinary RPC exposure');
revoke execute on function public.__audit_hook() from public, anon, authenticated;
select is_empty($$select * from pg_temp.security_findings() where object_name = '__audit_hook'$$,
  'Accept non-client hook execution without invoking or installing the hook');

select * from finish();
rollback;
