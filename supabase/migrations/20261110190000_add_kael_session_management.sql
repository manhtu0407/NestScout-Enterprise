alter table public.kael_conversations
  add column title text check (title is null or (title = btrim(title) and char_length(title) between 1 and 80)),
  add column pinned_at timestamptz,
  add column archived_at timestamptz,
  add column deleted_at timestamptz,
  add constraint kael_conversations_pin_not_archived check (pinned_at is null or archived_at is null),
  add constraint kael_conversations_deleted_is_blank check (deleted_at is null or (title is null and pinned_at is null and archived_at is null));

create index kael_conversations_owner_sessions on public.kael_conversations (owner_id, mode, updated_at desc) where deleted_at is null;

drop policy kael_conversations_select_owner on public.kael_conversations;
create policy kael_conversations_select_owner on public.kael_conversations for select to authenticated
  using ((select auth.uid()) = owner_id and deleted_at is null and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create function nestscout_private.kael_session_title(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when t = '' then 'Cuộc trò chuyện'
    when char_length(t) > 60 then btrim(left(t, 59)) || '…'
    else t
  end
  from (select regexp_replace(btrim(coalesce(p_text, '')), '[[:space:]]+', ' ', 'g') as t) x;
$$;
revoke all on function nestscout_private.kael_session_title(text) from public, anon, authenticated;

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
  v_deleted timestamptz;
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
    insert into public.kael_conversations (owner_id, mode, title)
      values (v_actor, p_mode, nestscout_private.kael_session_title(p_user_text)) returning id into v_conversation;
  else
    select c.mode, c.deleted_at into v_mode, v_deleted from public.kael_conversations c where c.id = v_conversation and c.owner_id = v_actor for update;
    if not found or v_mode <> p_mode or v_deleted is not null then
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
    where t.owner_id = nestscout_private.kael_actor() and c.mode = p_mode and c.deleted_at is null
      and (t.status not in ('completed', 'failed', 'cancelled')
        or (t.conversation_id = p_conversation_id and t.updated_at > clock_timestamp() - interval '1 day'))
    order by t.updated_at desc
    limit 12
  ) t;
$$;

create function nestscout_private.kael_session_state(p_mode text, p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_actor();
  v_conversation public.kael_conversations;
  v_busy boolean;
  v_approvals jsonb;
begin
  if p_mode is null or p_mode not in ('client', 'worker') then
    raise exception using errcode = '22023', message = 'invalid mode';
  end if;
  if p_conversation_id is null then
    select * into v_conversation from public.kael_conversations c
      where c.owner_id = v_actor and c.mode = p_mode and c.deleted_at is null and c.archived_at is null
      order by c.updated_at desc limit 1;
  else
    select * into v_conversation from public.kael_conversations c
      where c.id = p_conversation_id and c.owner_id = v_actor and c.mode = p_mode and c.deleted_at is null;
    if not found then
      raise exception using errcode = 'P0002', message = 'session not found';
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
      and ((a.status = 'pending' and t.conversation_id = v_conversation.id and a.expires_at > clock_timestamp()
          and t.status = 'waiting_for_approval' and t.version = a.task_version)
        or (a.status = 'consumed' and (a.outcome is null or a.outcome = 'uncertain')
          and not nestscout_private.kael_effect_in_flight(a.effect_run_id, null)
          and t.status in ('running', 'paused', 'waiting_for_input', 'cancelled', 'failed')))
    order by (a.status = 'consumed') desc, a.created_at
    limit 12
  ) x;
  if v_conversation.id is null then
    return jsonb_build_object('conversation_id', null, 'title', null, 'pinned', false, 'archived', false, 'busy', false,
      'messages', '[]'::jsonb, 'tasks', '[]'::jsonb, 'approvals', v_approvals);
  end if;
  v_busy := exists (select 1 from public.kael_runs r where r.conversation_id = v_conversation.id and r.status = 'running'
    and r.started_at > clock_timestamp() - interval '3 minutes');
  return jsonb_build_object(
    'conversation_id', v_conversation.id,
    'title', coalesce(v_conversation.title, nestscout_private.kael_session_title((select m.content from public.kael_messages m
      where m.conversation_id = v_conversation.id and m.owner_id = v_actor and m.role = 'user' order by m.seq limit 1))),
    'pinned', v_conversation.pinned_at is not null,
    'archived', v_conversation.archived_at is not null,
    'busy', v_busy,
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'role', m.role, 'content', m.content, 'status', m.status) order by m.seq), '[]'::jsonb)
      from (select * from public.kael_messages x where x.conversation_id = v_conversation.id and x.owner_id = v_actor order by x.seq desc limit 60) m),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'kind', t.kind, 'status', t.status, 'version', t.version, 'summary', t.summary)
      order by t.updated_at), '[]'::jsonb)
      from (select * from public.kael_tasks x where x.conversation_id = v_conversation.id and x.owner_id = v_actor order by x.updated_at desc limit 12) t),
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
as $$ select nestscout_private.kael_session_state(p_mode, null) - 'title' - 'pinned' - 'archived'; $$;

create function nestscout_private.kael_open_session(p_mode text, p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_session_id is null then
    raise exception using errcode = '22023', message = 'session required';
  end if;
  return nestscout_private.kael_session_state(p_mode, p_session_id);
end;
$$;

create function nestscout_private.kael_list_sessions(p_mode text, p_search text, p_archived boolean, p_limit integer, p_before timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_actor();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50);
  v_archived boolean := coalesce(p_archived, false);
  v_pattern text;
  v_result jsonb;
begin
  if p_mode is null or p_mode not in ('client', 'worker') then
    raise exception using errcode = '22023', message = 'invalid mode';
  end if;
  if nullif(btrim(coalesce(p_search, '')), '') is not null then
    v_pattern := '%' || replace(replace(replace(left(btrim(p_search), 80), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  end if;
  v_result := (
    with base as (
      select c.id, c.updated_at, c.pinned_at, c.archived_at,
        coalesce(c.title, nestscout_private.kael_session_title((select m.content from public.kael_messages m
          where m.conversation_id = c.id and m.owner_id = c.owner_id and m.role = 'user' order by m.seq limit 1))) as title,
        (select left(regexp_replace(btrim(m.content), '[[:space:]]+', ' ', 'g'), 80) from public.kael_messages m
          where m.conversation_id = c.id and m.owner_id = c.owner_id order by m.seq desc limit 1) as preview,
        exists (select 1 from public.kael_runs r where r.conversation_id = c.id and r.status = 'running'
          and r.started_at > clock_timestamp() - interval '3 minutes') as busy,
        exists (select 1 from nestscout_private.kael_approvals a join public.kael_tasks t on t.id = a.task_id
          where t.conversation_id = c.id and a.owner_id = c.owner_id
            and ((a.status = 'pending' and a.expires_at > clock_timestamp())
              or (a.status = 'consumed' and (a.outcome is null or a.outcome = 'uncertain')))) as attention
      from public.kael_conversations c
      where c.owner_id = v_actor and c.mode = p_mode and c.deleted_at is null and (c.archived_at is not null) = v_archived
    ), matched as (
      select * from base where v_pattern is null or title ilike v_pattern
    ), pinned as (
      select * from matched where pinned_at is not null and p_before is null order by pinned_at desc limit 50
    ), page as (
      select * from matched where pinned_at is null and (p_before is null or updated_at < p_before)
      order by updated_at desc, id limit v_limit + 1
    ), shown as (
      select * from page order by updated_at desc, id limit v_limit
    )
    select jsonb_build_object(
      'pinned', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'preview', preview, 'updated_at', updated_at,
        'pinned', true, 'archived', false, 'busy', busy, 'attention', attention) order by pinned_at desc) from pinned), '[]'::jsonb),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'preview', preview, 'updated_at', updated_at,
        'pinned', false, 'archived', archived_at is not null, 'busy', busy, 'attention', attention) order by updated_at desc, id) from shown), '[]'::jsonb),
      'has_more', (select count(*) from page) > v_limit
    )
  );
  return v_result;
end;
$$;

create function nestscout_private.kael_rename_session(p_session_id uuid, p_title text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_actor();
  v_title text := btrim(regexp_replace(coalesce(p_title, ''), '[[:space:]]+', ' ', 'g'));
begin
  if char_length(v_title) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'invalid title';
  end if;
  update public.kael_conversations set title = v_title
    where id = p_session_id and owner_id = v_actor and deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'session not found';
  end if;
  return v_title;
end;
$$;

create function nestscout_private.kael_pin_session(p_session_id uuid, p_pinned boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_actor();
  v_archived timestamptz;
begin
  if p_pinned is null then
    raise exception using errcode = '22023', message = 'pinned required';
  end if;
  select c.archived_at into v_archived from public.kael_conversations c
    where c.id = p_session_id and c.owner_id = v_actor and c.deleted_at is null for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'session not found';
  end if;
  if p_pinned and v_archived is not null then
    raise exception using errcode = '22023', message = 'archived sessions cannot be pinned';
  end if;
  update public.kael_conversations set pinned_at = case when p_pinned then clock_timestamp() end where id = p_session_id;
  return p_pinned;
end;
$$;

create function nestscout_private.kael_archive_session(p_session_id uuid, p_archived boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_actor();
begin
  if p_archived is null then
    raise exception using errcode = '22023', message = 'archived required';
  end if;
  update public.kael_conversations
    set archived_at = case when p_archived then clock_timestamp() end,
      pinned_at = case when p_archived then null else pinned_at end
    where id = p_session_id and owner_id = v_actor and deleted_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'session not found';
  end if;
  return p_archived;
end;
$$;

create function nestscout_private.kael_delete_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_actor();
  v_conversation uuid;
  v_removable uuid[];
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kael:' || v_actor::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kael-effect:' || v_actor::text, 0));
  select c.id into v_conversation from public.kael_conversations c
    where c.id = p_session_id and c.owner_id = v_actor and c.deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  update public.kael_runs set status = 'interrupted', finished_at = clock_timestamp(), error_code = 'stale'
    where conversation_id = v_conversation and status = 'running' and started_at < clock_timestamp() - interval '3 minutes';
  if exists (select 1 from public.kael_runs r where r.conversation_id = v_conversation and r.status = 'running') then
    return jsonb_build_object('status', 'busy');
  end if;
  if exists (select 1 from nestscout_private.kael_approvals a join public.kael_tasks t on t.id = a.task_id
    where t.conversation_id = v_conversation and a.owner_id = v_actor and a.status = 'consumed'
      and (a.outcome is null or a.outcome = 'uncertain')) then
    return jsonb_build_object('status', 'unresolved_effect');
  end if;

  delete from nestscout_private.kael_approvals a using public.kael_tasks t
    where a.task_id = t.id and t.conversation_id = v_conversation and a.owner_id = v_actor and a.status <> 'consumed';
  select coalesce(array_agg(t.id), '{}') into v_removable from public.kael_tasks t
    where t.conversation_id = v_conversation and t.owner_id = v_actor
      and not exists (select 1 from nestscout_private.kael_approvals a where a.task_id = t.id);
  update nestscout_private.kael_tool_executions set task_id = null where task_id = any (v_removable);
  delete from public.kael_task_events where task_id = any (v_removable);
  delete from public.kael_tasks where id = any (v_removable);
  update public.kael_tasks
    set title = 'Cuộc trò chuyện đã xóa', summary = '',
      artifact = jsonb_strip_nulls(jsonb_build_object('effect_required', artifact -> 'effect_required', 'effect_result', artifact -> 'effect_result')),
      status = case when status in ('completed', 'failed', 'cancelled') then status else 'cancelled' end,
      version = version + 1, updated_at = clock_timestamp()
    where conversation_id = v_conversation and owner_id = v_actor;
  delete from public.kael_messages where conversation_id = v_conversation and owner_id = v_actor;
  update public.kael_conversations set deleted_at = clock_timestamp(), title = null, pinned_at = null, archived_at = null where id = v_conversation;
  return jsonb_build_object('status', 'deleted');
end;
$$;

revoke all on function nestscout_private.kael_session_state(text, uuid) from public, anon, authenticated;
revoke all on function nestscout_private.kael_open_session(text, uuid) from public, anon, authenticated;
revoke all on function nestscout_private.kael_list_sessions(text, text, boolean, integer, timestamptz) from public, anon, authenticated;
revoke all on function nestscout_private.kael_rename_session(uuid, text) from public, anon, authenticated;
revoke all on function nestscout_private.kael_pin_session(uuid, boolean) from public, anon, authenticated;
revoke all on function nestscout_private.kael_archive_session(uuid, boolean) from public, anon, authenticated;
revoke all on function nestscout_private.kael_delete_session(uuid) from public, anon, authenticated;
grant execute on function nestscout_private.kael_session_state(text, uuid) to authenticated;
grant execute on function nestscout_private.kael_open_session(text, uuid) to authenticated;
grant execute on function nestscout_private.kael_list_sessions(text, text, boolean, integer, timestamptz) to authenticated;
grant execute on function nestscout_private.kael_rename_session(uuid, text) to authenticated;
grant execute on function nestscout_private.kael_pin_session(uuid, boolean) to authenticated;
grant execute on function nestscout_private.kael_archive_session(uuid, boolean) to authenticated;
grant execute on function nestscout_private.kael_delete_session(uuid) to authenticated;

create function public.kael_open_session(p_mode text, p_session_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select nestscout_private.kael_open_session(p_mode, p_session_id); $$;
create function public.kael_list_sessions(p_mode text, p_search text default null, p_archived boolean default false, p_limit integer default 30, p_before timestamptz default null)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select nestscout_private.kael_list_sessions(p_mode, p_search, p_archived, p_limit, p_before); $$;
create function public.kael_rename_session(p_session_id uuid, p_title text)
returns text language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_rename_session(p_session_id, p_title); $$;
create function public.kael_pin_session(p_session_id uuid, p_pinned boolean)
returns boolean language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_pin_session(p_session_id, p_pinned); $$;
create function public.kael_archive_session(p_session_id uuid, p_archived boolean)
returns boolean language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_archive_session(p_session_id, p_archived); $$;
create function public.kael_delete_session(p_session_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_delete_session(p_session_id); $$;

revoke all on function public.kael_open_session(text, uuid) from public, anon, authenticated;
revoke all on function public.kael_list_sessions(text, text, boolean, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.kael_rename_session(uuid, text) from public, anon, authenticated;
revoke all on function public.kael_pin_session(uuid, boolean) from public, anon, authenticated;
revoke all on function public.kael_archive_session(uuid, boolean) from public, anon, authenticated;
revoke all on function public.kael_delete_session(uuid) from public, anon, authenticated;
grant execute on function public.kael_open_session(text, uuid) to authenticated;
grant execute on function public.kael_list_sessions(text, text, boolean, integer, timestamptz) to authenticated;
grant execute on function public.kael_rename_session(uuid, text) to authenticated;
grant execute on function public.kael_pin_session(uuid, boolean) to authenticated;
grant execute on function public.kael_archive_session(uuid, boolean) to authenticated;
grant execute on function public.kael_delete_session(uuid) to authenticated;
