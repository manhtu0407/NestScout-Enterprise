create table nestscout_private.kael_tool_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id),
  resource_kind text not null,
  resource_id uuid,
  outcome text not null check (outcome in ('allowed', 'unavailable')),
  created_at timestamptz not null default clock_timestamp()
);
create index kael_tool_audit_actor_time on nestscout_private.kael_tool_audit (actor_id, created_at);
revoke all on table nestscout_private.kael_tool_audit from public, anon, authenticated;

create function nestscout_private.kael_read_context(p_kind text, p_resource_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
declare
  v_actor uuid := auth.uid();
  v_stage text;
  v_outcome text := 'unavailable';
  v_result jsonb := jsonb_build_object('status', 'unavailable');
begin
  if v_actor is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    return v_result;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text, 0));
  if (select count(*) from nestscout_private.kael_tool_audit a
      where a.actor_id = v_actor and a.created_at > clock_timestamp() - interval '1 minute') >= 20 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if char_length(p_kind) <= 32 and p_kind = 'customer_request' and p_resource_id is not null
    and exists (select 1 from public.service_requests r where r.id = p_resource_id and r.owner_id = v_actor) then
    v_outcome := 'allowed';
    v_result := jsonb_build_object('status', 'ok', 'kind', 'customer_request', 'resource_id', p_resource_id, 'state', 'request_received');
  elsif char_length(p_kind) <= 32 and p_kind = 'worker_job' and p_resource_id is not null and nestscout_private.current_worker_eligible() then
    select j.stage into v_stage from public.service_jobs j where j.id = p_resource_id and j.worker_id = v_actor;
    if found then
      v_outcome := 'allowed';
      v_result := jsonb_build_object('status', 'ok', 'kind', 'worker_job', 'resource_id', p_resource_id, 'state', v_stage);
    end if;
  end if;
  insert into nestscout_private.kael_tool_audit (actor_id, resource_kind, resource_id, outcome)
    values (v_actor, case when p_kind in ('customer_request', 'worker_job') then p_kind else 'invalid' end, p_resource_id, v_outcome);
  return v_result;
end;
$$;
revoke all on function nestscout_private.kael_read_context(text, uuid) from public, anon, authenticated;
grant execute on function nestscout_private.kael_read_context(text, uuid) to authenticated;

create function public.kael_read_context(p_kind text, p_resource_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_read_context(p_kind, p_resource_id); $$;
revoke all on function public.kael_read_context(text, uuid) from public, anon, authenticated;
grant execute on function public.kael_read_context(text, uuid) to authenticated;
