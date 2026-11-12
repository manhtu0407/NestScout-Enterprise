create or replace function nestscout_private.kael_conversation_snapshot(p_mode text, p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_actor();
  v_conversation uuid;
  v_busy boolean;
  v_approvals jsonb;
begin
  if p_mode is null or p_mode not in ('client', 'worker') then
    raise exception using errcode = '22023', message = 'invalid mode';
  end if;
  if p_conversation_id is null then
    select c.id into v_conversation from public.kael_conversations c
      where c.owner_id = v_actor and c.mode = p_mode and c.deleted_at is null and c.archived_at is null
      order by c.updated_at desc limit 1;
  else
    select c.id into v_conversation from public.kael_conversations c
      where c.id = p_conversation_id and c.owner_id = v_actor and c.mode = p_mode and c.deleted_at is null;
    if v_conversation is null then
      raise exception using errcode = '22023', message = 'conversation unavailable';
    end if;
  end if;
  select coalesce(jsonb_agg(x.item order by x.created_at), '[]'::jsonb) into v_approvals from (
    select a.created_at, jsonb_build_object('id', a.id, 'task_id', a.task_id, 'tool', a.tool, 'summary', a.summary, 'details', a.details,
      'fingerprint', a.fingerprint, 'kind', case when a.status = 'pending' then 'confirm' else 'reconcile' end,
      'expires_at', case when a.status = 'pending' then a.expires_at end) as item
    from nestscout_private.kael_approvals a
    join public.kael_tasks t on t.id = a.task_id and t.owner_id = v_actor
    join public.kael_conversations c on c.id = t.conversation_id and c.owner_id = v_actor
    where a.owner_id = v_actor and c.mode = p_mode
      and ((a.status = 'pending' and t.conversation_id = v_conversation and a.expires_at > clock_timestamp()
          and t.status = 'waiting_for_approval' and t.version = a.task_version)
        or (a.status = 'consumed' and (a.outcome is null or a.outcome = 'uncertain')
          and not nestscout_private.kael_effect_in_flight(a.effect_run_id, null)
          and t.status in ('running', 'paused', 'waiting_for_input', 'cancelled', 'failed')))
    order by (a.status = 'consumed') desc, a.created_at
    limit 12
  ) x;
  if v_conversation is null then
    return jsonb_build_object('conversation_id', null, 'busy', false, 'messages', '[]'::jsonb, 'tasks', '[]'::jsonb, 'approvals', v_approvals);
  end if;
  v_busy := exists (select 1 from public.kael_runs r where r.conversation_id = v_conversation and r.status = 'running'
    and r.started_at > clock_timestamp() - interval '3 minutes');
  return jsonb_build_object(
    'conversation_id', v_conversation,
    'busy', v_busy,
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'role', m.role, 'content', m.content, 'status', m.status, 'created_at', m.created_at) order by m.seq), '[]'::jsonb)
      from (select * from public.kael_messages x where x.conversation_id = v_conversation and x.owner_id = v_actor order by x.seq desc limit 60) m),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'kind', t.kind, 'status', t.status, 'version', t.version, 'summary', t.summary)
      order by t.updated_at), '[]'::jsonb)
      from (select * from public.kael_tasks x where x.conversation_id = v_conversation and x.owner_id = v_actor order by x.updated_at desc limit 12) t),
    'approvals', v_approvals
  );
end;
$$;
