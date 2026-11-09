create table public.consent_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('ai_sharing', 'push_notifications')),
  granted boolean not null,
  policy_version text not null check (policy_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(-v[0-9]+(\.[0-9]+)*)?$'),
  recorded_at timestamptz not null default clock_timestamp()
);
create index consent_events_user_purpose on public.consent_events (user_id, purpose, id desc);

alter table public.consent_events enable row level security;
revoke all on table public.consent_events from public, anon, authenticated;
grant select on table public.consent_events to authenticated;

create policy consent_events_select_owner on public.consent_events
  for select to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create function nestscout_private.has_consent(p_user uuid, p_purpose text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select e.granted from public.consent_events e
    where e.user_id = p_user and e.purpose = p_purpose
    order by e.id desc limit 1
  ), false);
$$;
revoke all on function nestscout_private.has_consent(uuid, text) from public, anon, authenticated;

create function nestscout_private.set_consent(p_purpose text, p_granted boolean, p_version text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_recorded timestamptz;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_purpose is null or p_purpose not in ('ai_sharing', 'push_notifications') or p_granted is null
    or p_version is null or p_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(-v[0-9]+(\.[0-9]+)*)?$' then
    raise exception using errcode = '22023', message = 'invalid decision';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('consent:' || v_owner::text || ':' || p_purpose, 0));
  if nestscout_private.has_consent(v_owner, p_purpose) is distinct from p_granted then
    insert into public.consent_events (user_id, purpose, granted, policy_version) values (v_owner, p_purpose, p_granted, p_version);
  end if;
  select e.recorded_at into v_recorded from public.consent_events e
  where e.user_id = v_owner and e.purpose = p_purpose order by e.id desc limit 1;
  return v_recorded;
end;
$$;
revoke all on function nestscout_private.set_consent(text, boolean, text) from public, anon, authenticated;
grant execute on function nestscout_private.set_consent(text, boolean, text) to authenticated;

create function public.set_consent(p_purpose text, p_granted boolean, p_version text)
returns timestamptz language sql security invoker set search_path = ''
as $$ select nestscout_private.set_consent(p_purpose, p_granted, p_version); $$;
revoke all on function public.set_consent(text, boolean, text) from public, anon, authenticated;
grant execute on function public.set_consent(text, boolean, text) to authenticated;

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
