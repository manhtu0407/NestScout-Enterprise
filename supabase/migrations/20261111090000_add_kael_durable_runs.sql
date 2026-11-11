create table nestscout_private.kael_durable_runs (
  run_id uuid primary key references public.kael_runs (id),
  owner_id uuid not null references auth.users (id),
  conversation_id uuid not null references public.kael_conversations (id),
  mode text not null check (mode in ('client', 'worker')),
  epoch bigint not null default 1 check (epoch >= 1),
  holder text check (holder ~ '^[A-Za-z0-9._-]{1,80}$'),
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  journal_state text not null default 'live' check (journal_state in ('live', 'purge_pending', 'purged')),
  admitted_at timestamptz not null default clock_timestamp(),
  journal_purged_at timestamptz,
  check ((holder is null) = (lease_expires_at is null)),
  check ((journal_state = 'purged') = (journal_purged_at is not null))
);
create index kael_durable_runs_owner on nestscout_private.kael_durable_runs (owner_id);
create index kael_durable_runs_unpurged on nestscout_private.kael_durable_runs (admitted_at) where journal_state <> 'purged';

alter table nestscout_private.kael_durable_runs enable row level security;
revoke all on table nestscout_private.kael_durable_runs from public, anon, authenticated;

create function nestscout_private.kael_lease_ok(p_run_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_durable nestscout_private.kael_durable_runs;
  v_claim text;
begin
  select * into v_durable from nestscout_private.kael_durable_runs d where d.run_id = p_run_id for share;
  if not found then
    return true;
  end if;
  v_claim := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-kael-lease';
  return v_claim is not null and v_durable.holder is not null and v_claim = v_durable.holder || ':' || v_durable.epoch::text;
end;
$$;
revoke all on function nestscout_private.kael_lease_ok(uuid) from public, anon, authenticated;

create or replace function nestscout_private.kael_running_run(p_run_id uuid, p_actor uuid)
returns public.kael_runs
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_run public.kael_runs;
begin
  select * into v_run from public.kael_runs r where r.id = p_run_id and r.owner_id = p_actor and r.status = 'running';
  if v_run.id is not null and not nestscout_private.kael_lease_ok(v_run.id) then
    raise exception using errcode = '42501', message = 'run lease not held';
  end if;
  return v_run;
end;
$$;

create or replace function nestscout_private.kael_effect_in_flight(p_run_id uuid, p_except uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.kael_runs r
    where r.id = p_run_id and r.id is distinct from p_except and r.status = 'running'
      and (r.started_at > clock_timestamp() - interval '3 minutes'
        or exists (select 1 from nestscout_private.kael_durable_runs d
          where d.run_id = r.id and d.lease_expires_at > clock_timestamp())));
$$;

create or replace function nestscout_private.kael_finish_run(p_actor uuid, p_run_id uuid, p_status text, p_text text, p_complete boolean, p_provider text,
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
  if not nestscout_private.kael_lease_ok(p_run_id) then
    raise exception using errcode = '42501', message = 'run lease not held';
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
      values (v_run.conversation_id, v_actor, v_run.id, v_seq, 'assistant', left(p_text, 32000),
        case when p_complete and p_status = 'completed' then 'complete' else 'incomplete' end);
    update public.kael_conversations set updated_at = clock_timestamp() where id = v_run.conversation_id;
  end if;
  return true;
end;
$$;

create or replace function nestscout_private.kael_record_tool(p_actor uuid, p_run_id uuid, p_call_id text, p_task_id uuid, p_tool text, p_side_effect text,
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
  if not nestscout_private.kael_lease_ok(p_run_id) then
    raise exception using errcode = '42501', message = 'run lease not held';
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

  update public.kael_runs r set status = 'interrupted', finished_at = clock_timestamp(), error_code = 'stale'
    where r.owner_id = v_actor and r.status = 'running'
      and ((not exists (select 1 from nestscout_private.kael_durable_runs d where d.run_id = r.id)
          and r.started_at < clock_timestamp() - interval '3 minutes')
        or exists (select 1 from nestscout_private.kael_durable_runs d
          where d.run_id = r.id and (d.lease_expires_at is null or d.lease_expires_at < clock_timestamp())
            and r.started_at < clock_timestamp() - interval '30 minutes'));

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

create function nestscout_private.kael_require_service()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
end;
$$;
revoke all on function nestscout_private.kael_require_service() from public, anon, authenticated;

create function nestscout_private.kael_durable_start_run(p_actor uuid, p_request_id uuid, p_conversation_id uuid, p_mode text, p_user_text text,
  p_holder text, p_lease_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_server_actor(p_actor);
  v_started jsonb;
  v_durable nestscout_private.kael_durable_runs;
begin
  if p_holder is null or p_holder !~ '^[A-Za-z0-9._-]{1,80}$' or p_lease_seconds is null or p_lease_seconds not between 10 and 600 then
    return jsonb_build_object('status', 'invalid');
  end if;
  v_started := nestscout_private.kael_start_run(v_actor, p_request_id, p_conversation_id, p_mode, p_user_text);
  if v_started ->> 'status' = 'started' then
    insert into nestscout_private.kael_durable_runs (run_id, owner_id, conversation_id, mode, epoch, holder, lease_expires_at, heartbeat_at)
      values ((v_started ->> 'run_id')::uuid, v_actor, (v_started ->> 'conversation_id')::uuid, p_mode, 1, p_holder,
        clock_timestamp() + make_interval(secs => p_lease_seconds), clock_timestamp());
    return v_started || jsonb_build_object('runtime', 'durable', 'epoch', 1);
  end if;
  if v_started ->> 'status' = 'replay' then
    select * into v_durable from nestscout_private.kael_durable_runs d where d.run_id = (v_started ->> 'run_id')::uuid;
    if found then
      return v_started || jsonb_build_object('runtime', 'durable', 'epoch', v_durable.epoch, 'journal_state', v_durable.journal_state,
        'lease_live', v_durable.lease_expires_at is not null and v_durable.lease_expires_at > clock_timestamp());
    end if;
    return v_started || jsonb_build_object('runtime', 'legacy');
  end if;
  return v_started;
end;
$$;

create function nestscout_private.kael_durable_claim(p_actor uuid, p_run_id uuid, p_holder text, p_lease_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_server_actor(p_actor);
  v_durable nestscout_private.kael_durable_runs;
  v_status text;
  v_renew boolean;
begin
  if p_holder is null or p_holder !~ '^[A-Za-z0-9._-]{1,80}$' or p_lease_seconds is null or p_lease_seconds not between 10 and 600 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_durable from nestscout_private.kael_durable_runs d where d.run_id = p_run_id and d.owner_id = v_actor for update;
  if not found then
    return jsonb_build_object('status', 'gone');
  end if;
  select r.status into v_status from public.kael_runs r where r.id = p_run_id;
  if v_status <> 'running' or v_durable.journal_state <> 'live' then
    return jsonb_build_object('status', 'gone', 'run_status', v_status);
  end if;
  v_renew := v_durable.holder = p_holder and v_durable.lease_expires_at > clock_timestamp();
  if v_durable.holder is not null and not v_renew and v_durable.lease_expires_at > clock_timestamp() then
    return jsonb_build_object('status', 'held', 'epoch', v_durable.epoch);
  end if;
  update nestscout_private.kael_durable_runs set holder = p_holder,
    epoch = case when v_renew then epoch else epoch + 1 end,
    lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds), heartbeat_at = clock_timestamp()
    where run_id = p_run_id returning * into v_durable;
  return jsonb_build_object('status', 'claimed', 'epoch', v_durable.epoch);
end;
$$;

create function nestscout_private.kael_durable_heartbeat(p_actor uuid, p_run_id uuid, p_holder text, p_epoch bigint, p_lease_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_server_actor(p_actor);
begin
  if p_lease_seconds is null or p_lease_seconds not between 10 and 600 then
    raise exception using errcode = '22023', message = 'invalid lease';
  end if;
  update nestscout_private.kael_durable_runs d set lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
    heartbeat_at = clock_timestamp()
    where d.run_id = p_run_id and d.owner_id = v_actor and d.holder = p_holder and d.epoch = p_epoch and d.journal_state = 'live'
      and exists (select 1 from public.kael_runs r where r.id = d.run_id and r.status = 'running');
  return found;
end;
$$;

create function nestscout_private.kael_durable_release(p_actor uuid, p_run_id uuid, p_holder text, p_epoch bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_server_actor(p_actor);
begin
  update nestscout_private.kael_durable_runs d set holder = null, lease_expires_at = null
    where d.run_id = p_run_id and d.owner_id = v_actor and d.holder = p_holder and d.epoch = p_epoch;
  return found;
end;
$$;

create function nestscout_private.kael_durable_claim_next(p_holder text, p_lease_seconds integer, p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed jsonb := '[]'::jsonb;
  v_row nestscout_private.kael_durable_runs;
begin
  perform nestscout_private.kael_require_service();
  if p_holder is null or p_holder !~ '^[A-Za-z0-9._-]{1,80}$' or p_lease_seconds is null or p_lease_seconds not between 10 and 600
    or p_limit is null or p_limit not between 1 and 50 then
    raise exception using errcode = '22023', message = 'invalid claim request';
  end if;
  for v_row in
    select d.* from nestscout_private.kael_durable_runs d
    join public.kael_runs r on r.id = d.run_id
    where r.status = 'running' and d.journal_state = 'live' and (d.lease_expires_at is null or d.lease_expires_at < clock_timestamp())
    order by d.admitted_at for update of d skip locked limit p_limit
  loop
    update nestscout_private.kael_durable_runs set holder = p_holder, epoch = epoch + 1,
      lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds), heartbeat_at = clock_timestamp()
      where run_id = v_row.run_id returning * into v_row;
    v_claimed := v_claimed || jsonb_build_array(jsonb_build_object('run_id', v_row.run_id, 'owner_id', v_row.owner_id,
      'conversation_id', v_row.conversation_id, 'mode', v_row.mode, 'epoch', v_row.epoch));
  end loop;
  return v_claimed;
end;
$$;

create function nestscout_private.kael_durable_expire(p_max_age interval)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform nestscout_private.kael_require_service();
  if p_max_age is null or p_max_age < interval '5 minutes' then
    raise exception using errcode = '22023', message = 'invalid maximum age';
  end if;
  update public.kael_runs r set status = 'interrupted', finished_at = clock_timestamp(), error_code = 'stale'
    where r.status = 'running' and r.started_at < clock_timestamp() - p_max_age
      and exists (select 1 from nestscout_private.kael_durable_runs d
        where d.run_id = r.id and (d.lease_expires_at is null or d.lease_expires_at < clock_timestamp()));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function nestscout_private.kael_durable_purge_queue(p_limit integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform nestscout_private.kael_require_service();
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception using errcode = '22023', message = 'invalid limit';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('run_id', q.run_id, 'owner_id', q.owner_id))
    from (select d.run_id, d.owner_id from nestscout_private.kael_durable_runs d
      join public.kael_runs r on r.id = d.run_id
      where d.journal_state <> 'purged' and (d.journal_state = 'purge_pending' or r.status <> 'running')
      order by d.admitted_at limit p_limit) q), '[]'::jsonb);
end;
$$;

create function nestscout_private.kael_durable_mark_purged(p_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform nestscout_private.kael_require_service();
  update nestscout_private.kael_durable_runs d set journal_state = 'purged', journal_purged_at = clock_timestamp(),
    holder = null, lease_expires_at = null
    where d.run_id = p_run_id and d.journal_state <> 'purged'
      and (d.journal_state = 'purge_pending' or not exists (select 1 from public.kael_runs r where r.id = d.run_id and r.status = 'running'));
  return found;
end;
$$;

create function nestscout_private.kael_durable_known(p_run_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform nestscout_private.kael_require_service();
  if p_run_ids is null or cardinality(p_run_ids) > 500 then
    raise exception using errcode = '22023', message = 'invalid run list';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('run_id', d.run_id, 'journal_state', d.journal_state, 'run_status', r.status))
    from nestscout_private.kael_durable_runs d join public.kael_runs r on r.id = d.run_id
    where d.run_id = any (p_run_ids)), '[]'::jsonb);
end;
$$;

create function nestscout_private.kael_durable_erasure_pending(p_user uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform nestscout_private.kael_require_service();
  return (select count(*)::integer from nestscout_private.kael_durable_runs d where d.owner_id = p_user and d.journal_state <> 'purged');
end;
$$;

create or replace function nestscout_private.erase_account_data(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.kael_runs set status = 'interrupted', finished_at = clock_timestamp(), error_code = 'erased'
    where owner_id = p_user and status = 'running';
  update nestscout_private.kael_durable_runs set journal_state = 'purge_pending', holder = null, lease_expires_at = null, epoch = epoch + 1
    where owner_id = p_user and journal_state <> 'purged';
  delete from public.kael_messages where owner_id = p_user;
  delete from public.kael_memory_modes where owner_id = p_user;
  delete from public.push_tokens where user_id = p_user;
  delete from public.worker_documents where worker_id = p_user;
  delete from public.worker_payout_accounts where worker_id = p_user;
  update public.worker_public_profiles set listed = false, accepting_jobs = false where worker_id = p_user;
  delete from public.customer_saved_workers where customer_id = p_user;
  delete from public.customer_settings where user_id = p_user;
  delete from public.customer_profiles where user_id = p_user;
  delete from public.support_requests where owner_id = p_user;
  delete from public.notifications where recipient_id = p_user;
  update auth.users set banned_until = 'infinity'::timestamptz where id = p_user;
end;
$$;

create or replace function nestscout_private.kael_delete_conversation(p_conversation_id uuid)
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
  update public.kael_runs r set status = 'interrupted', finished_at = clock_timestamp(), error_code = 'stale'
    where r.conversation_id = v_id and r.status = 'running'
      and ((not exists (select 1 from nestscout_private.kael_durable_runs d where d.run_id = r.id)
          and r.started_at < clock_timestamp() - interval '3 minutes')
        or exists (select 1 from nestscout_private.kael_durable_runs d
          where d.run_id = r.id and (d.lease_expires_at is null or d.lease_expires_at < clock_timestamp())
            and r.started_at < clock_timestamp() - interval '30 minutes'));
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
  update nestscout_private.kael_durable_runs set journal_state = 'purge_pending', holder = null, lease_expires_at = null, epoch = epoch + 1
    where conversation_id = v_id and journal_state <> 'purged';
  update public.kael_conversations set deleted_at = clock_timestamp(), title = null, pinned_at = null, archived_at = null where id = v_id;
  return jsonb_build_object('id', v_id, 'deleted', true);
end;
$$;

create function public.kael_durable_start_run(p_actor uuid, p_request_id uuid, p_conversation_id uuid, p_mode text, p_user_text text,
  p_holder text, p_lease_seconds integer)
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_durable_start_run(p_actor, p_request_id, p_conversation_id, p_mode, p_user_text, p_holder, p_lease_seconds); $$;
create function public.kael_durable_claim(p_actor uuid, p_run_id uuid, p_holder text, p_lease_seconds integer)
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_durable_claim(p_actor, p_run_id, p_holder, p_lease_seconds); $$;
create function public.kael_durable_heartbeat(p_actor uuid, p_run_id uuid, p_holder text, p_epoch bigint, p_lease_seconds integer)
returns boolean language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_durable_heartbeat(p_actor, p_run_id, p_holder, p_epoch, p_lease_seconds); $$;
create function public.kael_durable_release(p_actor uuid, p_run_id uuid, p_holder text, p_epoch bigint)
returns boolean language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_durable_release(p_actor, p_run_id, p_holder, p_epoch); $$;
create function public.kael_durable_claim_next(p_holder text, p_lease_seconds integer, p_limit integer)
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_durable_claim_next(p_holder, p_lease_seconds, p_limit); $$;
create function public.kael_durable_expire(p_max_age interval)
returns integer language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_durable_expire(p_max_age); $$;
create function public.kael_durable_purge_queue(p_limit integer)
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_durable_purge_queue(p_limit); $$;
create function public.kael_durable_mark_purged(p_run_id uuid)
returns boolean language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_durable_mark_purged(p_run_id); $$;
create function public.kael_durable_known(p_run_ids uuid[])
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_durable_known(p_run_ids); $$;
create function public.kael_durable_erasure_pending(p_user uuid)
returns integer language sql security invoker set search_path = ''
as $$ select nestscout_private.kael_durable_erasure_pending(p_user); $$;

revoke all on function nestscout_private.kael_durable_start_run(uuid, uuid, uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function nestscout_private.kael_durable_claim(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function nestscout_private.kael_durable_heartbeat(uuid, uuid, text, bigint, integer) from public, anon, authenticated;
revoke all on function nestscout_private.kael_durable_release(uuid, uuid, text, bigint) from public, anon, authenticated;
revoke all on function nestscout_private.kael_durable_claim_next(text, integer, integer) from public, anon, authenticated;
revoke all on function nestscout_private.kael_durable_expire(interval) from public, anon, authenticated;
revoke all on function nestscout_private.kael_durable_purge_queue(integer) from public, anon, authenticated;
revoke all on function nestscout_private.kael_durable_mark_purged(uuid) from public, anon, authenticated;
revoke all on function nestscout_private.kael_durable_known(uuid[]) from public, anon, authenticated;
revoke all on function nestscout_private.kael_durable_erasure_pending(uuid) from public, anon, authenticated;
revoke all on function public.kael_durable_start_run(uuid, uuid, uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.kael_durable_claim(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.kael_durable_heartbeat(uuid, uuid, text, bigint, integer) from public, anon, authenticated;
revoke all on function public.kael_durable_release(uuid, uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.kael_durable_claim_next(text, integer, integer) from public, anon, authenticated;
revoke all on function public.kael_durable_expire(interval) from public, anon, authenticated;
revoke all on function public.kael_durable_purge_queue(integer) from public, anon, authenticated;
revoke all on function public.kael_durable_mark_purged(uuid) from public, anon, authenticated;
revoke all on function public.kael_durable_known(uuid[]) from public, anon, authenticated;
revoke all on function public.kael_durable_erasure_pending(uuid) from public, anon, authenticated;

grant execute on function nestscout_private.kael_durable_start_run(uuid, uuid, uuid, text, text, text, integer) to service_role;
grant execute on function nestscout_private.kael_durable_claim(uuid, uuid, text, integer) to service_role;
grant execute on function nestscout_private.kael_durable_heartbeat(uuid, uuid, text, bigint, integer) to service_role;
grant execute on function nestscout_private.kael_durable_release(uuid, uuid, text, bigint) to service_role;
grant execute on function nestscout_private.kael_durable_claim_next(text, integer, integer) to service_role;
grant execute on function nestscout_private.kael_durable_expire(interval) to service_role;
grant execute on function nestscout_private.kael_durable_purge_queue(integer) to service_role;
grant execute on function nestscout_private.kael_durable_mark_purged(uuid) to service_role;
grant execute on function nestscout_private.kael_durable_known(uuid[]) to service_role;
grant execute on function nestscout_private.kael_durable_erasure_pending(uuid) to service_role;
grant execute on function public.kael_durable_start_run(uuid, uuid, uuid, text, text, text, integer) to service_role;
grant execute on function public.kael_durable_claim(uuid, uuid, text, integer) to service_role;
grant execute on function public.kael_durable_heartbeat(uuid, uuid, text, bigint, integer) to service_role;
grant execute on function public.kael_durable_release(uuid, uuid, text, bigint) to service_role;
grant execute on function public.kael_durable_claim_next(text, integer, integer) to service_role;
grant execute on function public.kael_durable_expire(interval) to service_role;
grant execute on function public.kael_durable_purge_queue(integer) to service_role;
grant execute on function public.kael_durable_mark_purged(uuid) to service_role;
grant execute on function public.kael_durable_known(uuid[]) to service_role;
grant execute on function public.kael_durable_erasure_pending(uuid) to service_role;
