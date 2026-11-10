alter table public.kael_conversations
  add column title text check (title is null or (title = btrim(title) and char_length(title) between 1 and 80)),
  add column pinned_at timestamptz,
  add column archived_at timestamptz,
  add column deleted_at timestamptz;
create index kael_conversations_owner_listing on public.kael_conversations (owner_id, mode, updated_at desc) where deleted_at is null;

drop policy kael_conversations_select_owner on public.kael_conversations;
create policy kael_conversations_select_owner on public.kael_conversations for select to authenticated
  using ((select auth.uid()) = owner_id and deleted_at is null and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create or replace function nestscout_private.kael_start_run(p_actor uuid, p_request_id uuid, p_conversation_id uuid, p_mode text, p_user_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_server_actor(p_actor);
  v_run public.kael_runs;
  v_conversation uuid := p_conversation_id;
  v_mode text;
  v_text text;
  v_seq integer;
begin
  if p_request_id is null or p_mode is null or p_mode not in ('client', 'worker')
    or p_user_text is null or char_length(btrim(p_user_text)) not between 1 and 4000 then
    return jsonb_build_object('status', 'invalid');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kael:' || v_actor::text, 0));

  select * into v_run from public.kael_runs r where r.owner_id = v_actor and r.request_id = p_request_id;
  if found then
    select m.content into v_text from public.kael_messages m
      where m.run_id = v_run.id and m.role = 'assistant' order by m.seq desc limit 1;
    return jsonb_build_object('status', 'replay', 'run_id', v_run.id, 'conversation_id', v_run.conversation_id,
      'run_status', v_run.status, 'assistant_text', v_text);
  end if;

  if not nestscout_private.has_consent(v_actor, 'ai_sharing') then
    return jsonb_build_object('status', 'consent_required');
  end if;

  update public.kael_runs set status = 'interrupted', finished_at = clock_timestamp(), error_code = 'stale'
    where owner_id = v_actor and status = 'running' and started_at < clock_timestamp() - interval '3 minutes';

  if (select count(*) from public.kael_runs r where r.owner_id = v_actor and r.started_at > clock_timestamp() - interval '1 minute') >= 12
    or (select count(*) from public.kael_runs r where r.owner_id = v_actor and r.started_at > clock_timestamp() - interval '1 day') >= 300 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  if v_conversation is null then
    insert into public.kael_conversations (owner_id, mode) values (v_actor, p_mode) returning id into v_conversation;
  else
    select c.mode into v_mode from public.kael_conversations c where c.id = v_conversation and c.owner_id = v_actor and c.deleted_at is null for update;
    if not found or v_mode <> p_mode then
      return jsonb_build_object('status', 'invalid');
    end if;
    if exists (select 1 from public.kael_runs r where r.conversation_id = v_conversation and r.status = 'running') then
      return jsonb_build_object('status', 'busy');
    end if;
  end if;

  insert into public.kael_runs (conversation_id, owner_id, request_id) values (v_conversation, v_actor, p_request_id) returning * into v_run;
  select coalesce(max(m.seq), 0) + 1 into v_seq from public.kael_messages m where m.conversation_id = v_conversation;
  insert into public.kael_messages (conversation_id, owner_id, run_id, seq, role, content)
    values (v_conversation, v_actor, v_run.id, v_seq, 'user', btrim(p_user_text));
  update public.kael_conversations set updated_at = clock_timestamp(), archived_at = null where id = v_conversation;
  return jsonb_build_object('status', 'started', 'run_id', v_run.id, 'conversation_id', v_conversation);
end;
$$;

create function nestscout_private.kael_conversation_title(p_conversation_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(c.title, (
    select case when char_length(x.line) > 60 then left(x.line, 59) || '…' else x.line end
    from (select regexp_replace(btrim(m.content), '\s+', ' ', 'g') as line from public.kael_messages m
      where m.conversation_id = c.id and m.role = 'user' order by m.seq limit 1) x), '')
  from public.kael_conversations c where c.id = p_conversation_id;
$$;
revoke all on function nestscout_private.kael_conversation_title(uuid) from public, anon, authenticated;

create function nestscout_private.kael_conversation_snapshot(p_mode text, p_conversation_id uuid)
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
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'role', m.role, 'content', m.content, 'status', m.status) order by m.seq), '[]'::jsonb)
      from (select * from public.kael_messages x where x.conversation_id = v_conversation and x.owner_id = v_actor order by x.seq desc limit 60) m),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'kind', t.kind, 'status', t.status, 'version', t.version, 'summary', t.summary)
      order by t.updated_at), '[]'::jsonb)
      from (select * from public.kael_tasks x where x.conversation_id = v_conversation and x.owner_id = v_actor order by x.updated_at desc limit 12) t),
    'approvals', v_approvals
  );
end;
$$;

create or replace function nestscout_private.kael_conversation_state(p_mode text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select nestscout_private.kael_conversation_snapshot(p_mode, null); $$;

create or replace function nestscout_private.kael_context_tasks(p_conversation_id uuid, p_mode text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(nestscout_private.kael_task_json(t) order by t.updated_at desc), '[]'::jsonb)
  from (
    select t.* from public.kael_tasks t
    join public.kael_conversations c on c.id = t.conversation_id
    where t.owner_id = nestscout_private.kael_actor() and t.conversation_id = p_conversation_id
      and c.mode = p_mode and c.deleted_at is null
      and (t.status not in ('completed', 'failed', 'cancelled') or t.updated_at > clock_timestamp() - interval '1 day')
    order by t.updated_at desc
    limit 12
  ) t;
$$;

create function nestscout_private.kael_list_conversations(p_mode text, p_search text default null, p_archived boolean default false,
  p_limit integer default 30, p_before timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_actor();
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  if p_mode is null or p_mode not in ('client', 'worker') or p_archived is null or char_length(v_search) > 80 then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'preview', x.preview, 'updated_at', x.updated_at,
      'pinned', x.pinned_at is not null, 'archived', x.archived_at is not null) order by (x.pinned_at is not null) desc, x.updated_at desc)
    from (
      select c.id, c.updated_at, c.pinned_at, c.archived_at,
        nestscout_private.kael_conversation_title(c.id) as title,
        coalesce((select left(regexp_replace(btrim(m.content), '\s+', ' ', 'g'), 120) from public.kael_messages m
          where m.conversation_id = c.id and m.owner_id = v_actor order by m.seq desc limit 1), '') as preview
      from public.kael_conversations c
      where c.owner_id = v_actor and c.mode = p_mode and c.deleted_at is null and (c.archived_at is not null) = p_archived
        and (c.title is not null or exists (select 1 from public.kael_messages m where m.conversation_id = c.id and m.owner_id = v_actor))
        and (v_search = '' or position(v_search in lower(nestscout_private.kael_conversation_title(c.id))) > 0)
        and (p_before is null or (c.pinned_at is null and c.updated_at < p_before))
      order by (c.pinned_at is not null) desc, c.updated_at desc
      limit v_limit
    ) x), '[]'::jsonb);
end;
$$;

create function nestscout_private.kael_rename_conversation(p_conversation_id uuid, p_title text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_actor();
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  if p_conversation_id is null or (v_title is not null and char_length(v_title) > 80) then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  update public.kael_conversations set title = v_title
    where id = p_conversation_id and owner_id = v_actor and deleted_at is null;
  if not found then
    raise exception using errcode = '22023', message = 'conversation unavailable';
  end if;
  return jsonb_build_object('id', p_conversation_id, 'title', nestscout_private.kael_conversation_title(p_conversation_id));
end;
$$;

create function nestscout_private.kael_set_conversation_pinned(p_conversation_id uuid, p_pinned boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_actor();
begin
  if p_conversation_id is null or p_pinned is null then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  update public.kael_conversations
    set pinned_at = case when p_pinned then coalesce(pinned_at, clock_timestamp()) end
    where id = p_conversation_id and owner_id = v_actor and deleted_at is null;
  if not found then
    raise exception using errcode = '22023', message = 'conversation unavailable';
  end if;
  return jsonb_build_object('id', p_conversation_id, 'pinned', p_pinned);
end;
$$;

create function nestscout_private.kael_set_conversation_archived(p_conversation_id uuid, p_archived boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_actor();
begin
  if p_conversation_id is null or p_archived is null then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  update public.kael_conversations
    set archived_at = case when p_archived then coalesce(archived_at, clock_timestamp()) end,
      pinned_at = case when p_archived then null else pinned_at end
    where id = p_conversation_id and owner_id = v_actor and deleted_at is null;
  if not found then
    raise exception using errcode = '22023', message = 'conversation unavailable';
  end if;
  return jsonb_build_object('id', p_conversation_id, 'archived', p_archived);
end;
$$;

create function nestscout_private.kael_delete_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_actor();
  v_id uuid;
begin
  if p_conversation_id is null then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kael:' || v_actor::text, 0));
  select c.id into v_id from public.kael_conversations c
    where c.id = p_conversation_id and c.owner_id = v_actor and c.deleted_at is null for update;
  if v_id is null then
    raise exception using errcode = '22023', message = 'conversation unavailable';
  end if;
  update public.kael_runs set status = 'interrupted', finished_at = clock_timestamp(), error_code = 'stale'
    where conversation_id = v_id and status = 'running' and started_at < clock_timestamp() - interval '3 minutes';
  if exists (select 1 from public.kael_runs r where r.conversation_id = v_id and r.status = 'running') then
    raise exception using errcode = '22023', message = 'run active';
  end if;
  if exists (select 1 from nestscout_private.kael_approvals a join public.kael_tasks t on t.id = a.task_id
    where t.conversation_id = v_id and a.status = 'consumed' and (a.outcome is null or a.outcome = 'uncertain')) then
    raise exception using errcode = '22023', message = 'effect unresolved';
  end if;
  delete from public.kael_task_events e using public.kael_tasks t where e.task_id = t.id and t.conversation_id = v_id;
  delete from nestscout_private.kael_approvals a using public.kael_tasks t where a.task_id = t.id and t.conversation_id = v_id;
  delete from nestscout_private.kael_tool_executions x using public.kael_tasks t where x.task_id = t.id and t.conversation_id = v_id;
  delete from nestscout_private.kael_tool_executions x using public.kael_runs r where x.run_id = r.id and r.conversation_id = v_id;
  delete from public.kael_messages where conversation_id = v_id;
  delete from public.kael_tasks where conversation_id = v_id;
  update public.kael_conversations set deleted_at = clock_timestamp(), title = null, pinned_at = null, archived_at = null where id = v_id;
  return jsonb_build_object('id', v_id, 'deleted', true);
end;
$$;

revoke all on function nestscout_private.kael_conversation_snapshot(text, uuid) from public, anon, authenticated;
revoke all on function nestscout_private.kael_list_conversations(text, text, boolean, integer, timestamptz) from public, anon, authenticated;
revoke all on function nestscout_private.kael_rename_conversation(uuid, text) from public, anon, authenticated;
revoke all on function nestscout_private.kael_set_conversation_pinned(uuid, boolean) from public, anon, authenticated;
revoke all on function nestscout_private.kael_set_conversation_archived(uuid, boolean) from public, anon, authenticated;
revoke all on function nestscout_private.kael_delete_conversation(uuid) from public, anon, authenticated;
grant execute on function nestscout_private.kael_conversation_snapshot(text, uuid) to authenticated;
grant execute on function nestscout_private.kael_list_conversations(text, text, boolean, integer, timestamptz) to authenticated;
grant execute on function nestscout_private.kael_rename_conversation(uuid, text) to authenticated;
grant execute on function nestscout_private.kael_set_conversation_pinned(uuid, boolean) to authenticated;
grant execute on function nestscout_private.kael_set_conversation_archived(uuid, boolean) to authenticated;
grant execute on function nestscout_private.kael_delete_conversation(uuid) to authenticated;

create function public.kael_open_conversation(p_conversation_id uuid, p_mode text)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select nestscout_private.kael_conversation_snapshot(p_mode, p_conversation_id); $$;
create function public.kael_list_conversations(p_mode text, p_search text default null, p_archived boolean default false,
  p_limit integer default 30, p_before timestamptz default null)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select nestscout_private.kael_list_conversations(p_mode, p_search, p_archived, p_limit, p_before); $$;
create function public.kael_rename_conversation(p_conversation_id uuid, p_title text)
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_rename_conversation(p_conversation_id, p_title); $$;
create function public.kael_set_conversation_pinned(p_conversation_id uuid, p_pinned boolean)
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_set_conversation_pinned(p_conversation_id, p_pinned); $$;
create function public.kael_set_conversation_archived(p_conversation_id uuid, p_archived boolean)
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_set_conversation_archived(p_conversation_id, p_archived); $$;
create function public.kael_delete_conversation(p_conversation_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_delete_conversation(p_conversation_id); $$;

revoke all on function public.kael_open_conversation(uuid, text) from public, anon, authenticated;
revoke all on function public.kael_list_conversations(text, text, boolean, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.kael_rename_conversation(uuid, text) from public, anon, authenticated;
revoke all on function public.kael_set_conversation_pinned(uuid, boolean) from public, anon, authenticated;
revoke all on function public.kael_set_conversation_archived(uuid, boolean) from public, anon, authenticated;
revoke all on function public.kael_delete_conversation(uuid) from public, anon, authenticated;
grant execute on function public.kael_open_conversation(uuid, text) to authenticated;
grant execute on function public.kael_list_conversations(text, text, boolean, integer, timestamptz) to authenticated;
grant execute on function public.kael_rename_conversation(uuid, text) to authenticated;
grant execute on function public.kael_set_conversation_pinned(uuid, boolean) to authenticated;
grant execute on function public.kael_set_conversation_archived(uuid, boolean) to authenticated;
grant execute on function public.kael_delete_conversation(uuid) to authenticated;
