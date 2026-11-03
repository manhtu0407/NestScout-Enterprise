create table public.kael_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id),
  mode text not null check (mode in ('client', 'worker')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index kael_conversations_owner_recent on public.kael_conversations (owner_id, updated_at desc);

create table public.kael_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.kael_conversations (id),
  owner_id uuid not null references auth.users (id),
  request_id uuid not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'cancelled', 'interrupted')),
  provider text check (provider in ('anthropic', 'deepseek')),
  model text check (char_length(model) <= 80),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  steps integer not null default 0 check (steps between 0 and 100),
  error_code text check (char_length(error_code) <= 40),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  unique (owner_id, request_id),
  check ((status = 'running') = (finished_at is null))
);
create unique index kael_runs_one_active_per_conversation on public.kael_runs (conversation_id) where status = 'running';
create index kael_runs_owner_time on public.kael_runs (owner_id, started_at);

create table public.kael_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.kael_conversations (id),
  owner_id uuid not null references auth.users (id),
  run_id uuid not null references public.kael_runs (id),
  seq integer not null check (seq > 0),
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 32000),
  status text not null default 'complete' check (status in ('complete', 'incomplete')),
  created_at timestamptz not null default clock_timestamp(),
  unique (conversation_id, seq)
);
create index kael_messages_run on public.kael_messages (run_id);

create table public.kael_tasks (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.kael_conversations (id),
  owner_id uuid not null references auth.users (id),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  kind text not null check (kind in ('general', 'service_request', 'customer_lookup', 'worker_assist', 'research', 'writing')),
  status text not null check (status in ('pending', 'running', 'waiting_for_input', 'waiting_for_approval', 'paused', 'completed', 'failed', 'cancelled')),
  version integer not null default 1 check (version > 0),
  summary text not null default '' check (char_length(summary) <= 500),
  artifact jsonb not null default '{}'::jsonb check (jsonb_typeof(artifact) = 'object' and pg_column_size(artifact) <= 16384),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index kael_tasks_owner_status on public.kael_tasks (owner_id, status, updated_at desc);
create index kael_tasks_conversation on public.kael_tasks (conversation_id);

create table public.kael_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.kael_tasks (id),
  owner_id uuid not null references auth.users (id),
  run_id uuid references public.kael_runs (id),
  event text not null check (char_length(event) between 1 and 40),
  from_status text,
  to_status text not null,
  version integer not null,
  created_at timestamptz not null default clock_timestamp()
);
create index kael_task_events_task on public.kael_task_events (task_id, created_at);

create table nestscout_private.kael_tool_executions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.kael_runs (id),
  owner_id uuid not null references auth.users (id),
  call_id text not null check (char_length(call_id) between 1 and 128),
  task_id uuid references public.kael_tasks (id),
  tool text not null check (char_length(tool) between 1 and 64),
  side_effect text not null check (side_effect in ('internal', 'read', 'external_read', 'prepare', 'consequential', 'unknown')),
  outcome text not null check (outcome in ('succeeded', 'failed', 'denied', 'approval_required', 'unavailable', 'uncertain')),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  error_code text check (char_length(error_code) <= 120),
  created_at timestamptz not null default clock_timestamp(),
  unique (run_id, call_id)
);
create index kael_tool_executions_owner_time on nestscout_private.kael_tool_executions (owner_id, created_at);

create table nestscout_private.kael_approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id),
  task_id uuid not null references public.kael_tasks (id),
  run_id uuid not null references public.kael_runs (id),
  tool text not null check (tool in ('service_request_submit')),
  args jsonb not null check (jsonb_typeof(args) = 'object' and pg_column_size(args) <= 16384),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  summary text not null check (char_length(summary) between 1 and 200),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 4096),
  task_version integer not null check (task_version > 0),
  status text not null default 'pending' check (status in ('pending', 'consumed', 'rejected', 'expired', 'superseded')),
  outcome text check (outcome in ('succeeded', 'failed', 'uncertain')),
  result jsonb check (result is null or (jsonb_typeof(result) = 'object' and pg_column_size(result) <= 4096)),
  expires_at timestamptz not null,
  decided_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check ((status = 'pending') = (decided_at is null) or status = 'expired' or status = 'superseded')
);
create unique index kael_approvals_one_pending on nestscout_private.kael_approvals (task_id) where status = 'pending';

alter table public.kael_conversations enable row level security;
alter table public.kael_runs enable row level security;
alter table public.kael_messages enable row level security;
alter table public.kael_tasks enable row level security;
alter table public.kael_task_events enable row level security;
revoke all on table public.kael_conversations, public.kael_runs, public.kael_messages, public.kael_tasks, public.kael_task_events from public, anon, authenticated;
revoke all on table nestscout_private.kael_tool_executions, nestscout_private.kael_approvals from public, anon, authenticated;
grant select on table public.kael_conversations, public.kael_runs, public.kael_messages, public.kael_tasks, public.kael_task_events to authenticated;

create policy kael_conversations_select_owner on public.kael_conversations for select to authenticated
  using ((select auth.uid()) = owner_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');
create policy kael_runs_select_owner on public.kael_runs for select to authenticated
  using ((select auth.uid()) = owner_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');
create policy kael_messages_select_owner on public.kael_messages for select to authenticated
  using ((select auth.uid()) = owner_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');
create policy kael_tasks_select_owner on public.kael_tasks for select to authenticated
  using ((select auth.uid()) = owner_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');
create policy kael_task_events_select_owner on public.kael_task_events for select to authenticated
  using ((select auth.uid()) = owner_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create function nestscout_private.kael_actor()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  return auth.uid();
end;
$$;
revoke all on function nestscout_private.kael_actor() from public, anon, authenticated;

create function nestscout_private.kael_server_actor(p_actor uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' or p_actor is null or not exists (
    select 1 from auth.users u
    where u.id = p_actor and not u.is_anonymous and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= clock_timestamp())
  ) then
    raise exception using errcode = '42501', message = 'verified Kael actor required';
  end if;
  return p_actor;
end;
$$;
revoke all on function nestscout_private.kael_server_actor(uuid) from public, anon, authenticated;

create function nestscout_private.kael_task_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_from = p_to or (p_from, p_to) in (values
    ('pending', 'running'), ('pending', 'waiting_for_input'), ('pending', 'cancelled'),
    ('running', 'waiting_for_input'), ('running', 'waiting_for_approval'), ('running', 'paused'),
    ('running', 'completed'), ('running', 'failed'), ('running', 'cancelled'),
    ('waiting_for_input', 'running'), ('waiting_for_input', 'waiting_for_approval'), ('waiting_for_input', 'paused'), ('waiting_for_input', 'cancelled'),
    ('waiting_for_approval', 'running'), ('waiting_for_approval', 'waiting_for_input'), ('waiting_for_approval', 'paused'), ('waiting_for_approval', 'cancelled'),
    ('paused', 'running'), ('paused', 'waiting_for_input'), ('paused', 'cancelled')
  );
$$;
revoke all on function nestscout_private.kael_task_transition_allowed(text, text) from public, anon, authenticated;

create function nestscout_private.kael_task_json(p_task public.kael_tasks)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('id', p_task.id, 'conversation_id', p_task.conversation_id, 'title', p_task.title, 'kind', p_task.kind,
    'status', p_task.status, 'version', p_task.version, 'summary', p_task.summary, 'artifact', p_task.artifact, 'updated_at', p_task.updated_at);
$$;
revoke all on function nestscout_private.kael_task_json(public.kael_tasks) from public, anon, authenticated;

create function nestscout_private.kael_actor_capabilities()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    return jsonb_build_object('customer', false, 'worker', false);
  end if;
  return jsonb_build_object('customer', true, 'worker', nestscout_private.current_worker_eligible());
end;
$$;

create function nestscout_private.kael_start_run(p_actor uuid, p_request_id uuid, p_conversation_id uuid, p_mode text, p_user_text text)
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

  update public.kael_runs set status = 'interrupted', finished_at = clock_timestamp(), error_code = 'stale'
    where owner_id = v_actor and status = 'running' and started_at < clock_timestamp() - interval '3 minutes';

  if (select count(*) from public.kael_runs r where r.owner_id = v_actor and r.started_at > clock_timestamp() - interval '1 minute') >= 12
    or (select count(*) from public.kael_runs r where r.owner_id = v_actor and r.started_at > clock_timestamp() - interval '1 day') >= 300 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  if v_conversation is null then
    insert into public.kael_conversations (owner_id, mode) values (v_actor, p_mode) returning id into v_conversation;
  else
    select c.mode into v_mode from public.kael_conversations c where c.id = v_conversation and c.owner_id = v_actor for update;
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
  update public.kael_conversations set updated_at = clock_timestamp() where id = v_conversation;
  return jsonb_build_object('status', 'started', 'run_id', v_run.id, 'conversation_id', v_conversation);
end;
$$;

create function nestscout_private.kael_finish_run(p_actor uuid, p_run_id uuid, p_status text, p_text text, p_complete boolean, p_provider text,
  p_model text, p_input_tokens integer, p_output_tokens integer, p_steps integer, p_error text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_server_actor(p_actor);
  v_run public.kael_runs;
  v_seq integer;
begin
  if p_status not in ('completed', 'failed', 'cancelled', 'interrupted') then
    raise exception using errcode = '22023', message = 'invalid run status';
  end if;
  update public.kael_runs set status = p_status, finished_at = clock_timestamp(),
    provider = case when p_provider in ('anthropic', 'deepseek') then p_provider end,
    model = left(p_model, 80), input_tokens = greatest(coalesce(p_input_tokens, 0), 0), output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
    steps = least(greatest(coalesce(p_steps, 0), 0), 100), error_code = left(p_error, 40)
    where id = p_run_id and owner_id = v_actor and status = 'running'
    returning * into v_run;
  if not found then
    return false;
  end if;
  if char_length(btrim(coalesce(p_text, ''))) > 0 then
    perform 1 from public.kael_conversations c where c.id = v_run.conversation_id for update;
    select coalesce(max(m.seq), 0) + 1 into v_seq from public.kael_messages m where m.conversation_id = v_run.conversation_id;
    insert into public.kael_messages (conversation_id, owner_id, run_id, seq, role, content, status)
      values (v_run.conversation_id, v_actor, v_run.id, v_seq, 'assistant', left(btrim(p_text), 32000),
        case when p_complete and p_status = 'completed' then 'complete' else 'incomplete' end);
    update public.kael_conversations set updated_at = clock_timestamp() where id = v_run.conversation_id;
  end if;
  return true;
end;
$$;

create function nestscout_private.kael_context_tasks(p_conversation_id uuid, p_mode text)
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
    where t.owner_id = nestscout_private.kael_actor() and c.mode = p_mode
      and (t.status not in ('completed', 'failed', 'cancelled')
        or (t.conversation_id = p_conversation_id and t.updated_at > clock_timestamp() - interval '1 day'))
    order by t.updated_at desc
    limit 12
  ) t;
$$;

create function nestscout_private.kael_running_run(p_run_id uuid, p_actor uuid)
returns public.kael_runs
language sql
stable
set search_path = ''
as $$
  select * from public.kael_runs r where r.id = p_run_id and r.owner_id = p_actor and r.status = 'running';
$$;
revoke all on function nestscout_private.kael_running_run(uuid, uuid) from public, anon, authenticated;

create function nestscout_private.kael_save_task(p_actor uuid, p_task_id uuid, p_conversation_id uuid, p_run_id uuid, p_expected_version integer,
  p_title text, p_kind text, p_status text, p_summary text, p_artifact jsonb, p_event text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_server_actor(p_actor);
  v_run public.kael_runs := nestscout_private.kael_running_run(p_run_id, v_actor);
  v_task public.kael_tasks;
  v_from text;
  v_artifact jsonb := coalesce(p_artifact, '{}'::jsonb);
begin
  if v_run.id is null or jsonb_typeof(v_artifact) <> 'object' or char_length(coalesce(p_event, '')) not between 1 and 40 then
    return jsonb_build_object('status', 'not_found');
  end if;
  v_artifact := v_artifact - 'effect_required' - 'effect_result';

  if p_task_id is null then
    if p_status not in ('pending', 'running', 'waiting_for_input') or p_conversation_id is distinct from v_run.conversation_id then
      return jsonb_build_object('status', 'invalid_transition');
    end if;
    if (select count(*) from public.kael_tasks t where t.conversation_id = v_run.conversation_id) >= 50 then
      return jsonb_build_object('status', 'limit');
    end if;
    if p_kind = 'service_request' then
      v_artifact := v_artifact || '{"effect_required": true}'::jsonb;
    end if;
    insert into public.kael_tasks (conversation_id, owner_id, title, kind, status, summary, artifact)
      values (v_run.conversation_id, v_actor, btrim(p_title), p_kind, p_status, left(coalesce(p_summary, ''), 500), v_artifact)
      returning * into v_task;
    insert into public.kael_task_events (task_id, owner_id, run_id, event, from_status, to_status, version)
      values (v_task.id, v_actor, v_run.id, p_event, null, v_task.status, v_task.version);
    return jsonb_build_object('status', 'ok', 'task', nestscout_private.kael_task_json(v_task));
  end if;

  select * into v_task from public.kael_tasks t where t.id = p_task_id and t.owner_id = v_actor for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_task.version <> p_expected_version then
    return jsonb_build_object('status', 'conflict');
  end if;
  v_from := v_task.status;
  if not nestscout_private.kael_task_transition_allowed(v_from, p_status)
    or (p_status = 'waiting_for_approval' and v_from <> 'waiting_for_approval')
    or (v_from = 'waiting_for_approval' and p_status = 'running')
    or (p_status = 'completed' and v_from <> 'completed' and coalesce(v_task.artifact ->> 'effect_required', 'false') = 'true'
      and coalesce(v_task.artifact #>> '{effect_result,status}', '') <> 'succeeded') then
    return jsonb_build_object('status', 'invalid_transition');
  end if;
  v_artifact := v_artifact || jsonb_strip_nulls(jsonb_build_object('effect_required', v_task.artifact -> 'effect_required', 'effect_result', v_task.artifact -> 'effect_result'));
  update public.kael_tasks set title = btrim(p_title), status = p_status, summary = left(coalesce(p_summary, ''), 500), artifact = v_artifact,
    version = version + 1, updated_at = clock_timestamp()
    where id = v_task.id returning * into v_task;
  insert into public.kael_task_events (task_id, owner_id, run_id, event, from_status, to_status, version)
    values (v_task.id, v_actor, v_run.id, p_event, v_from, v_task.status, v_task.version);
  return jsonb_build_object('status', 'ok', 'task', nestscout_private.kael_task_json(v_task));
end;
$$;

create function nestscout_private.kael_record_tool(p_actor uuid, p_run_id uuid, p_call_id text, p_task_id uuid, p_tool text, p_side_effect text,
  p_outcome text, p_fingerprint text, p_error text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_server_actor(p_actor);
  v_inserted integer;
begin
  if not exists (select 1 from public.kael_runs r where r.id = p_run_id and r.owner_id = v_actor) then
    return false;
  end if;
  insert into nestscout_private.kael_tool_executions (run_id, owner_id, call_id, task_id, tool, side_effect, outcome, fingerprint, error_code)
    values (p_run_id, v_actor, p_call_id,
      (select t.id from public.kael_tasks t where t.id = p_task_id and t.owner_id = v_actor),
      p_tool, p_side_effect, p_outcome, p_fingerprint, left(p_error, 120))
    on conflict (run_id, call_id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

create function nestscout_private.kael_request_approval(p_actor uuid, p_run_id uuid, p_task_id uuid, p_expected_version integer, p_tool text,
  p_args jsonb, p_fingerprint text, p_summary text, p_details jsonb, p_ttl_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_server_actor(p_actor);
  v_run public.kael_runs := nestscout_private.kael_running_run(p_run_id, v_actor);
  v_task public.kael_tasks;
  v_from text;
  v_approval uuid;
  v_expires timestamptz;
begin
  if v_run.id is null or p_tool <> 'service_request_submit' or p_fingerprint !~ '^[0-9a-f]{64}$'
    or p_ttl_seconds not between 60 and 3600 or jsonb_typeof(p_args) <> 'object' or jsonb_typeof(p_details) is distinct from 'object' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_task from public.kael_tasks t where t.id = p_task_id and t.owner_id = v_actor for update;
  if found and exists (select 1 from nestscout_private.kael_approvals a where a.task_id = v_task.id and a.status = 'consumed'
    and (a.outcome is null or a.outcome = 'uncertain')) then
    return jsonb_build_object('status', 'unresolved');
  end if;
  if not found or v_task.kind <> 'service_request' or v_task.status not in ('running', 'waiting_for_input') then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_task.version <> p_expected_version then
    return jsonb_build_object('status', 'stale');
  end if;
  if coalesce(jsonb_array_length(v_task.artifact #> '{draft,missing}'), 1) <> 0
    or char_length(btrim(coalesce(v_task.artifact #>> '{draft,description}', ''))) = 0
    or p_args ->> 'task_id' is distinct from v_task.id::text
    or p_args ->> 'description' is distinct from v_task.artifact #>> '{draft,description}'
    or p_args ->> 'location' is distinct from v_task.artifact #>> '{draft,location}'
    or p_args ->> 'preferred_time' is distinct from v_task.artifact #>> '{draft,preferred_time}' then
    return jsonb_build_object('status', 'invalid');
  end if;
  update nestscout_private.kael_approvals set status = 'superseded' where task_id = v_task.id and status = 'pending';
  v_from := v_task.status;
  update public.kael_tasks set status = 'waiting_for_approval', version = version + 1, updated_at = clock_timestamp(),
    summary = 'Đang chờ bạn xác nhận gửi yêu cầu'
    where id = v_task.id returning * into v_task;
  v_expires := clock_timestamp() + make_interval(secs => p_ttl_seconds);
  insert into nestscout_private.kael_approvals (owner_id, task_id, run_id, tool, args, fingerprint, summary, details, task_version, expires_at)
    values (v_actor, v_task.id, v_run.id, p_tool, p_args, p_fingerprint, left(p_summary, 200), p_details, v_task.version, v_expires)
    returning id into v_approval;
  insert into public.kael_task_events (task_id, owner_id, run_id, event, from_status, to_status, version)
    values (v_task.id, v_actor, v_run.id, 'approval_requested', v_from, v_task.status, v_task.version);
  return jsonb_build_object('status', 'ok', 'approval_id', v_approval, 'expires_at', v_expires, 'task', nestscout_private.kael_task_json(v_task));
end;
$$;

create function nestscout_private.kael_consume_approval(p_actor uuid, p_run_id uuid, p_approval_id uuid, p_fingerprint text, p_allowed_tools text[],
  p_intent text default 'approve')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_server_actor(p_actor);
  v_run public.kael_runs := nestscout_private.kael_running_run(p_run_id, v_actor);
  v_approval nestscout_private.kael_approvals;
  v_task public.kael_tasks;
  v_from text;
begin
  select * into v_approval from nestscout_private.kael_approvals a where a.id = p_approval_id and a.owner_id = v_actor for update;
  if not found or v_run.id is null or p_intent is null or p_intent not in ('approve', 'reconcile') then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_task from public.kael_tasks t where t.id = v_approval.task_id and t.owner_id = v_actor for update;
  if v_task.conversation_id <> v_run.conversation_id then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_approval.fingerprint <> coalesce(p_fingerprint, '') then
    return jsonb_build_object('status', 'mismatch');
  end if;
  if p_intent = 'reconcile' and v_approval.status <> 'consumed' then
    return jsonb_build_object('status', 'unconfirmed');
  end if;
  if not (v_approval.tool = any (coalesce(p_allowed_tools, '{}'::text[]))) then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if v_approval.status = 'consumed' then
    if v_approval.outcome is null or v_approval.outcome = 'uncertain' then
      if v_task.status not in ('running', 'paused', 'waiting_for_input') then
        return jsonb_build_object('status', 'stale');
      end if;
      if v_task.status <> 'running' then
        v_from := v_task.status;
        update public.kael_tasks set status = 'running', version = version + 1, updated_at = clock_timestamp(),
          summary = 'Đang kiểm tra lại yêu cầu đã được xác nhận'
          where id = v_task.id returning * into v_task;
        insert into public.kael_task_events (task_id, owner_id, run_id, event, from_status, to_status, version)
          values (v_task.id, v_actor, v_run.id, 'effect_reconciling', v_from, v_task.status, v_task.version);
      end if;
      return jsonb_build_object('status', 'reconcile', 'tool', v_approval.tool, 'args', v_approval.args, 'task_id', v_approval.task_id,
        'summary', v_approval.summary, 'details', v_approval.details);
    end if;
    return jsonb_build_object('status', 'consumed', 'outcome', coalesce(v_approval.outcome, 'pending'), 'result', v_approval.result, 'task_id', v_approval.task_id);
  end if;
  if v_approval.status = 'rejected' then
    return jsonb_build_object('status', 'rejected');
  end if;
  if v_approval.status <> 'pending' then
    return jsonb_build_object('status', case when v_approval.status = 'expired' then 'expired' else 'stale' end);
  end if;
  if v_approval.expires_at <= clock_timestamp() then
    update nestscout_private.kael_approvals set status = 'expired' where id = v_approval.id;
    return jsonb_build_object('status', 'expired');
  end if;
  if v_task.version <> v_approval.task_version or v_task.status <> 'waiting_for_approval' then
    update nestscout_private.kael_approvals set status = 'superseded' where id = v_approval.id;
    return jsonb_build_object('status', 'stale');
  end if;
  update nestscout_private.kael_approvals set status = 'consumed', decided_at = clock_timestamp() where id = v_approval.id;
  update public.kael_tasks set status = 'running', version = version + 1, updated_at = clock_timestamp(), summary = 'Đang gửi yêu cầu đã được xác nhận'
    where id = v_task.id returning * into v_task;
  insert into public.kael_task_events (task_id, owner_id, run_id, event, from_status, to_status, version)
    values (v_task.id, v_actor, null, 'approval_consumed', 'waiting_for_approval', v_task.status, v_task.version);
  return jsonb_build_object('status', 'ok', 'tool', v_approval.tool, 'args', v_approval.args, 'task_id', v_approval.task_id,
    'summary', v_approval.summary, 'details', v_approval.details);
end;
$$;

create function nestscout_private.kael_complete_approval(p_actor uuid, p_run_id uuid, p_approval_id uuid, p_outcome text, p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_server_actor(p_actor);
  v_run public.kael_runs := nestscout_private.kael_running_run(p_run_id, v_actor);
  v_approval nestscout_private.kael_approvals;
  v_task public.kael_tasks;
  v_outcome text := p_outcome;
  v_resource uuid;
  v_result jsonb;
  v_from text;
  v_status text;
  v_summary text;
  v_artifact jsonb;
begin
  if p_outcome not in ('succeeded', 'failed', 'uncertain') then
    raise exception using errcode = '22023', message = 'invalid outcome';
  end if;
  select * into v_approval from nestscout_private.kael_approvals a
    where a.id = p_approval_id and a.owner_id = v_actor and a.status = 'consumed' for update;
  if not found or v_run.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_task from public.kael_tasks t where t.id = v_approval.task_id and t.owner_id = v_actor for update;
  if v_task.conversation_id <> v_run.conversation_id then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_approval.outcome in ('succeeded', 'failed') then
    return jsonb_build_object('status', 'final', 'outcome', v_approval.outcome, 'result', v_approval.result, 'task', nestscout_private.kael_task_json(v_task));
  end if;
  if v_outcome = 'succeeded' then
    begin
      v_resource := (p_result ->> 'resource_id')::uuid;
    exception when invalid_text_representation then
      v_resource := null;
    end;
    if v_resource is null or not exists (select 1 from public.service_requests r
      where r.id = v_resource and r.owner_id = v_actor and r.submission_key = v_approval.id) then
      v_outcome := 'uncertain';
    end if;
  end if;
  v_from := v_task.status;
  v_artifact := v_task.artifact;
  if v_outcome = 'succeeded' then
    v_status := 'completed';
    v_summary := 'Đã gửi yêu cầu dịch vụ; chưa có thợ hay lịch hẹn được xác nhận';
    v_result := jsonb_build_object('resource_kind', 'service_request', 'resource_id', v_resource);
    v_artifact := v_artifact || jsonb_build_object('effect_result', jsonb_build_object('status', 'succeeded', 'resource_kind', 'service_request', 'resource_id', v_resource));
  elsif v_outcome = 'failed' then
    v_status := 'waiting_for_input';
    v_summary := 'Hệ thống chưa nhận yêu cầu; bản nháp vẫn được giữ';
    v_result := jsonb_build_object('reason', left(coalesce(p_result ->> 'reason', 'backend_refused'), 80));
  else
    v_status := 'paused';
    v_summary := 'Chưa xác định được kết quả gửi; có thể xác nhận lại an toàn';
    v_result := jsonb_build_object('reason', case when p_outcome = 'succeeded' then 'unverified_result'
      else left(coalesce(p_result ->> 'reason', 'unverified_result'), 80) end);
  end if;
  if v_from <> 'running' or not nestscout_private.kael_task_transition_allowed(v_from, v_status) then
    v_result := jsonb_build_object('reason', 'task_changed');
    update nestscout_private.kael_approvals set outcome = 'uncertain', result = v_result where id = v_approval.id;
    return jsonb_build_object('status', 'conflict', 'outcome', 'uncertain', 'result', v_result, 'task', nestscout_private.kael_task_json(v_task));
  end if;
  update nestscout_private.kael_approvals set outcome = v_outcome, result = v_result where id = v_approval.id;
  update public.kael_tasks set status = v_status, summary = v_summary, artifact = v_artifact, version = version + 1, updated_at = clock_timestamp()
    where id = v_task.id returning * into v_task;
  insert into public.kael_task_events (task_id, owner_id, run_id, event, from_status, to_status, version)
    values (v_task.id, v_actor, v_run.id, 'effect_' || v_outcome, v_from, v_task.status, v_task.version);
  return jsonb_build_object('status', 'ok', 'outcome', v_outcome, 'result', v_result, 'task', nestscout_private.kael_task_json(v_task));
end;
$$;

create function nestscout_private.kael_reject_approval(p_actor uuid, p_run_id uuid, p_approval_id uuid, p_fingerprint text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_server_actor(p_actor);
  v_run public.kael_runs := nestscout_private.kael_running_run(p_run_id, v_actor);
  v_approval nestscout_private.kael_approvals;
  v_task public.kael_tasks;
begin
  select * into v_approval from nestscout_private.kael_approvals a where a.id = p_approval_id and a.owner_id = v_actor for update;
  if not found or v_run.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_task from public.kael_tasks t where t.id = v_approval.task_id and t.owner_id = v_actor for update;
  if v_task.conversation_id <> v_run.conversation_id then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_approval.fingerprint <> coalesce(p_fingerprint, '') then
    return jsonb_build_object('status', 'mismatch');
  end if;
  if v_approval.status <> 'pending' then
    return jsonb_build_object('status', case v_approval.status when 'rejected' then 'rejected' when 'consumed' then 'consumed'
      when 'expired' then 'expired' else 'stale' end);
  end if;
  if v_approval.expires_at <= clock_timestamp() then
    update nestscout_private.kael_approvals set status = 'expired' where id = v_approval.id;
    return jsonb_build_object('status', 'expired');
  end if;
  update nestscout_private.kael_approvals set status = 'rejected', decided_at = clock_timestamp() where id = v_approval.id;
  if v_task.status = 'waiting_for_approval' and v_task.version = v_approval.task_version then
    update public.kael_tasks set status = 'waiting_for_input', version = version + 1, updated_at = clock_timestamp(),
      summary = 'Bạn đã dừng bước gửi; bản nháp vẫn được giữ'
      where id = v_task.id returning * into v_task;
    insert into public.kael_task_events (task_id, owner_id, run_id, event, from_status, to_status, version)
      values (v_task.id, v_actor, v_run.id, 'approval_rejected', 'waiting_for_approval', v_task.status, v_task.version);
  end if;
  return jsonb_build_object('status', 'ok', 'task', nestscout_private.kael_task_json(v_task));
end;
$$;

create function nestscout_private.kael_conversation_state(p_mode text)
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
begin
  if p_mode is null or p_mode not in ('client', 'worker') then
    raise exception using errcode = '22023', message = 'invalid mode';
  end if;
  select c.id into v_conversation from public.kael_conversations c
    where c.owner_id = v_actor and c.mode = p_mode order by c.updated_at desc limit 1;
  if v_conversation is null then
    return jsonb_build_object('conversation_id', null, 'busy', false, 'messages', '[]'::jsonb, 'tasks', '[]'::jsonb, 'approvals', '[]'::jsonb);
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
    'approvals', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'task_id', a.task_id, 'tool', a.tool, 'summary', a.summary, 'details', a.details,
      'fingerprint', a.fingerprint, 'kind', case when a.status = 'pending' then 'confirm' else 'reconcile' end,
      'expires_at', case when a.status = 'pending' then a.expires_at end) order by a.created_at), '[]'::jsonb)
      from nestscout_private.kael_approvals a join public.kael_tasks t on t.id = a.task_id
      where a.owner_id = v_actor and t.conversation_id = v_conversation
        and ((a.status = 'pending' and a.expires_at > clock_timestamp() and t.status = 'waiting_for_approval' and t.version = a.task_version)
          or (a.status = 'consumed' and (a.outcome = 'uncertain' or (a.outcome is null and not v_busy))
            and t.status in ('running', 'paused', 'waiting_for_input'))))
  );
end;
$$;

revoke all on function nestscout_private.kael_actor_capabilities() from public, anon, authenticated;
revoke all on function nestscout_private.kael_context_tasks(uuid, text) from public, anon, authenticated;
revoke all on function nestscout_private.kael_conversation_state(text) from public, anon, authenticated;
revoke all on function nestscout_private.kael_start_run(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function nestscout_private.kael_finish_run(uuid, uuid, text, text, boolean, text, text, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function nestscout_private.kael_save_task(uuid, uuid, uuid, uuid, integer, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function nestscout_private.kael_record_tool(uuid, uuid, text, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function nestscout_private.kael_request_approval(uuid, uuid, uuid, integer, text, jsonb, text, text, jsonb, integer) from public, anon, authenticated;
revoke all on function nestscout_private.kael_consume_approval(uuid, uuid, uuid, text, text[], text) from public, anon, authenticated;
revoke all on function nestscout_private.kael_complete_approval(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function nestscout_private.kael_reject_approval(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function nestscout_private.kael_actor_capabilities() to authenticated;
grant execute on function nestscout_private.kael_context_tasks(uuid, text) to authenticated;
grant execute on function nestscout_private.kael_conversation_state(text) to authenticated;
grant usage on schema nestscout_private to service_role;
grant execute on function nestscout_private.kael_start_run(uuid, uuid, uuid, text, text) to service_role;
grant execute on function nestscout_private.kael_finish_run(uuid, uuid, text, text, boolean, text, text, integer, integer, integer, text) to service_role;
grant execute on function nestscout_private.kael_save_task(uuid, uuid, uuid, uuid, integer, text, text, text, text, jsonb, text) to service_role;
grant execute on function nestscout_private.kael_record_tool(uuid, uuid, text, uuid, text, text, text, text, text) to service_role;
grant execute on function nestscout_private.kael_request_approval(uuid, uuid, uuid, integer, text, jsonb, text, text, jsonb, integer) to service_role;
grant execute on function nestscout_private.kael_consume_approval(uuid, uuid, uuid, text, text[], text) to service_role;
grant execute on function nestscout_private.kael_complete_approval(uuid, uuid, uuid, text, jsonb) to service_role;
grant execute on function nestscout_private.kael_reject_approval(uuid, uuid, uuid, text) to service_role;

create function public.kael_actor_capabilities()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select nestscout_private.kael_actor_capabilities(); $$;
create function public.kael_context_tasks(p_conversation_id uuid, p_mode text)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select nestscout_private.kael_context_tasks(p_conversation_id, p_mode); $$;
create function public.kael_conversation_state(p_mode text)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select nestscout_private.kael_conversation_state(p_mode); $$;
create function public.kael_start_run(p_actor uuid, p_request_id uuid, p_conversation_id uuid, p_mode text, p_user_text text)
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_start_run(p_actor, p_request_id, p_conversation_id, p_mode, p_user_text); $$;
create function public.kael_finish_run(p_actor uuid, p_run_id uuid, p_status text, p_text text, p_complete boolean, p_provider text,
  p_model text, p_input_tokens integer, p_output_tokens integer, p_steps integer, p_error text)
returns boolean language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_finish_run(p_actor, p_run_id, p_status, p_text, p_complete, p_provider, p_model, p_input_tokens, p_output_tokens, p_steps, p_error); $$;
create function public.kael_save_task(p_actor uuid, p_task_id uuid, p_conversation_id uuid, p_run_id uuid, p_expected_version integer,
  p_title text, p_kind text, p_status text, p_summary text, p_artifact jsonb, p_event text)
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_save_task(p_actor, p_task_id, p_conversation_id, p_run_id, p_expected_version, p_title, p_kind, p_status, p_summary, p_artifact, p_event); $$;
create function public.kael_record_tool(p_actor uuid, p_run_id uuid, p_call_id text, p_task_id uuid, p_tool text, p_side_effect text,
  p_outcome text, p_fingerprint text, p_error text)
returns boolean language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_record_tool(p_actor, p_run_id, p_call_id, p_task_id, p_tool, p_side_effect, p_outcome, p_fingerprint, p_error); $$;
create function public.kael_request_approval(p_actor uuid, p_run_id uuid, p_task_id uuid, p_expected_version integer, p_tool text,
  p_args jsonb, p_fingerprint text, p_summary text, p_details jsonb, p_ttl_seconds integer)
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_request_approval(p_actor, p_run_id, p_task_id, p_expected_version, p_tool, p_args, p_fingerprint, p_summary, p_details, p_ttl_seconds); $$;
create function public.kael_consume_approval(p_actor uuid, p_run_id uuid, p_approval_id uuid, p_fingerprint text, p_allowed_tools text[],
  p_intent text default 'approve')
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_consume_approval(p_actor, p_run_id, p_approval_id, p_fingerprint, p_allowed_tools, p_intent); $$;
create function public.kael_complete_approval(p_actor uuid, p_run_id uuid, p_approval_id uuid, p_outcome text, p_result jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_complete_approval(p_actor, p_run_id, p_approval_id, p_outcome, p_result); $$;
create function public.kael_reject_approval(p_actor uuid, p_run_id uuid, p_approval_id uuid, p_fingerprint text)
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_reject_approval(p_actor, p_run_id, p_approval_id, p_fingerprint); $$;

revoke all on function public.kael_actor_capabilities() from public, anon, authenticated;
revoke all on function public.kael_context_tasks(uuid, text) from public, anon, authenticated;
revoke all on function public.kael_conversation_state(text) from public, anon, authenticated;
revoke all on function public.kael_start_run(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.kael_finish_run(uuid, uuid, text, text, boolean, text, text, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function public.kael_save_task(uuid, uuid, uuid, uuid, integer, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.kael_record_tool(uuid, uuid, text, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.kael_request_approval(uuid, uuid, uuid, integer, text, jsonb, text, text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.kael_consume_approval(uuid, uuid, uuid, text, text[], text) from public, anon, authenticated;
revoke all on function public.kael_complete_approval(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.kael_reject_approval(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.kael_actor_capabilities() to authenticated;
grant execute on function public.kael_context_tasks(uuid, text) to authenticated;
grant execute on function public.kael_conversation_state(text) to authenticated;
grant execute on function public.kael_start_run(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.kael_finish_run(uuid, uuid, text, text, boolean, text, text, integer, integer, integer, text) to service_role;
grant execute on function public.kael_save_task(uuid, uuid, uuid, uuid, integer, text, text, text, text, jsonb, text) to service_role;
grant execute on function public.kael_record_tool(uuid, uuid, text, uuid, text, text, text, text, text) to service_role;
grant execute on function public.kael_request_approval(uuid, uuid, uuid, integer, text, jsonb, text, text, jsonb, integer) to service_role;
grant execute on function public.kael_consume_approval(uuid, uuid, uuid, text, text[], text) to service_role;
grant execute on function public.kael_complete_approval(uuid, uuid, uuid, text, jsonb) to service_role;
grant execute on function public.kael_reject_approval(uuid, uuid, uuid, text) to service_role;
