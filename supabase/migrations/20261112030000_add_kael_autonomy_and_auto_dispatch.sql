create table public.kael_autonomy (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('customer', 'worker')),
  mode text not null check (mode in ('ask', 'auto')),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, role)
);

alter table public.kael_autonomy enable row level security;
revoke all on table public.kael_autonomy from public, anon, authenticated;
grant select on table public.kael_autonomy to authenticated;

create policy kael_autonomy_select_owner on public.kael_autonomy
  for select to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create function nestscout_private.set_kael_autonomy(p_role text, p_mode text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_role is null or p_mode is null or p_role not in ('customer', 'worker') or p_mode not in ('ask', 'auto') then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  if p_role = 'worker' then
    perform nestscout_private.lock_current_worker();
  end if;
  insert into public.kael_autonomy (user_id, role, mode) values (v_user, p_role, p_mode)
    on conflict (user_id, role) do update set mode = excluded.mode, updated_at = clock_timestamp();
  return p_mode;
end;
$$;
revoke all on function nestscout_private.set_kael_autonomy(text, text) from public, anon, authenticated;
grant execute on function nestscout_private.set_kael_autonomy(text, text) to authenticated;

create function public.set_kael_autonomy(p_role text, p_mode text)
returns text language sql security invoker set search_path = ''
as $$ select nestscout_private.set_kael_autonomy(p_role, p_mode); $$;
revoke all on function public.set_kael_autonomy(text, text) from public, anon, authenticated;
grant execute on function public.set_kael_autonomy(text, text) to authenticated;

create table nestscout_private.auto_dispatch_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  offer_minutes integer not null default 30 check (offer_minutes between 5 and 1440),
  max_invites integer not null default 3 check (max_invites between 1 and 10),
  basis text not null default 'local_fixture' check (basis = 'local_fixture')
);
insert into nestscout_private.auto_dispatch_settings default values;
revoke all on table nestscout_private.auto_dispatch_settings from public, anon, authenticated;

create table nestscout_private.fixture_service_prices (
  service_id text primary key check (service_id in ('electric', 'water', 'aircon', 'paint', 'sofa', 'other')),
  scope text not null check (char_length(btrim(scope)) between 1 and 4000),
  amount_minor bigint not null check (amount_minor between 1 and 9007199254740991),
  valid_minutes integer not null default 1440 check (valid_minutes between 5 and 10080)
);
revoke all on table nestscout_private.fixture_service_prices from public, anon, authenticated;
insert into nestscout_private.fixture_service_prices (service_id, scope, amount_minor) values
  ('electric', 'Công kiểm tra tại chỗ và báo phương án sửa điện. Chưa gồm vật tư và hạng mục phát sinh.', 250000),
  ('water', 'Công kiểm tra tại chỗ và báo phương án sửa nước. Chưa gồm vật tư và hạng mục phát sinh.', 250000),
  ('aircon', 'Công kiểm tra tại chỗ và báo phương án cho máy lạnh. Chưa gồm vật tư và hạng mục phát sinh.', 250000),
  ('paint', 'Công khảo sát tại chỗ và báo phương án sơn hoặc chống thấm. Chưa gồm vật tư và hạng mục phát sinh.', 250000),
  ('sofa', 'Công khảo sát tại chỗ và báo phương án vệ sinh sofa. Chưa gồm vật tư và hạng mục phát sinh.', 250000),
  ('other', 'Công khảo sát tại chỗ và báo phương án cho việc khách mô tả. Chưa gồm vật tư và hạng mục phát sinh.', 250000);

alter table public.service_requests
  add column service_id text check (service_id is null or service_id in ('electric', 'water', 'aircon', 'paint', 'sofa', 'other'));
grant insert (service_id) on public.service_requests to authenticated;

drop function public.submit_service_request(uuid, text, text);

create function public.submit_service_request(p_submission_key uuid, p_description text, p_location text default '', p_service_id text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_id uuid;
  v_description text;
  v_location text;
  v_service text;
  v_new_location text := btrim(coalesce(p_location, ''));
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_submission_key is null or p_description is null
    or char_length(btrim(p_description)) not between 1 and 4000 or char_length(v_new_location) > 200
    or (p_service_id is not null and p_service_id not in ('electric', 'water', 'aircon', 'paint', 'sofa', 'other')) then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;

  insert into public.service_requests (submission_key, description, location, service_id)
  values (p_submission_key, btrim(p_description), v_new_location, p_service_id)
  on conflict (owner_id, submission_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id, description, location, service_id into v_id, v_description, v_location, v_service
    from public.service_requests
    where owner_id = v_owner and submission_key = p_submission_key;
    if v_description is distinct from btrim(p_description) or v_location is distinct from v_new_location
      or v_service is distinct from p_service_id then
      raise exception using errcode = '22023', message = 'submission key conflict';
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.submit_service_request(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_service_request(uuid, text, text, text) to authenticated;

create function nestscout_private.auto_quote_new_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings nestscout_private.auto_dispatch_settings%rowtype;
  v_price nestscout_private.fixture_service_prices%rowtype;
begin
  if new.service_id is null then
    return new;
  end if;
  select * into v_settings from nestscout_private.auto_dispatch_settings;
  if not v_settings.enabled then
    return new;
  end if;
  select * into v_price from nestscout_private.fixture_service_prices p where p.service_id = new.service_id;
  if not found then
    return new;
  end if;
  insert into public.service_quotes (request_id, version, scope, amount_minor, currency, expires_at, basis)
    values (new.id, 1, v_price.scope, v_price.amount_minor, 'VND', clock_timestamp() + make_interval(mins => v_price.valid_minutes), 'local_fixture');
  return new;
end;
$$;
revoke all on function nestscout_private.auto_quote_new_request() from public, anon, authenticated;

create trigger service_requests_auto_quote after insert on public.service_requests
  for each row execute function nestscout_private.auto_quote_new_request();

create function nestscout_private.assign_invitation(p_invitation_id uuid, p_worker_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.service_invitations%rowtype;
  v_job uuid;
begin
  select * into v_invite from public.service_invitations i where i.id = p_invitation_id and i.worker_id = p_worker_id;
  if not found then
    raise exception using errcode = '42501', message = 'invitation unavailable';
  end if;
  insert into public.service_jobs (request_id, quote_id, invitation_id, worker_id)
    values (v_invite.request_id, v_invite.quote_id, v_invite.id, p_worker_id) returning id into v_job;
  insert into public.service_job_events (job_id, actor_id, event, version)
    values (v_job, p_worker_id, 'assigned', 1);
  update public.service_invitations set state = 'accepted' where id = v_invite.id;
  return v_job;
end;
$$;
revoke all on function nestscout_private.assign_invitation(uuid, uuid) from public, anon, authenticated;

create or replace function nestscout_private.accept_service_invitation(p_invitation_id uuid, p_quote_id uuid, p_quote_version integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
  v_invite public.service_invitations%rowtype;
  v_job uuid;
  v_request_id uuid;
begin
  v_worker := nestscout_private.lock_current_worker();
  select * into v_invite from public.service_invitations i
    where i.id = p_invitation_id and i.worker_id = v_worker;
  if not found then
    raise exception using errcode = '42501', message = 'invitation unavailable';
  end if;
  v_request_id := v_invite.request_id;
  perform 1 from public.service_requests r where r.id = v_request_id for update;
  select * into v_invite from public.service_invitations i
    where i.id = p_invitation_id and i.worker_id = v_worker and i.request_id = v_request_id for update;
  if not found then raise exception using errcode = '42501', message = 'invitation unavailable'; end if;
  if v_invite.quote_id is distinct from p_quote_id or not exists
    (select 1 from public.service_quotes q where q.id = v_invite.quote_id and q.version = p_quote_version) then
    raise exception using errcode = '40001', message = 'stale terms';
  end if;
  if v_invite.state = 'accepted' then
    select j.id into v_job from public.service_jobs j where j.invitation_id = v_invite.id and j.worker_id = v_worker;
    if v_job is not null then return v_job; end if;
  end if;
  if v_invite.state <> 'open' or v_invite.expires_at <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'invitation unavailable';
  end if;
  if not exists (select 1 from public.service_quotes q where q.id = v_invite.quote_id
    and q.request_id = v_invite.request_id and q.accepted_at is not null) then
    raise exception using errcode = '22023', message = 'agreement unavailable';
  end if;
  if exists (select 1 from public.service_jobs j where j.request_id = v_invite.request_id) then
    raise exception using errcode = '40001', message = 'already assigned';
  end if;
  return nestscout_private.assign_invitation(v_invite.id, v_worker);
end;
$$;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('quote_received', 'job_assigned', 'job_progress', 'work_submitted', 'job_completed', 'scope_proposed',
    'job_offered', 'work_approved', 'revision_requested', 'work_disputed', 'scope_approved', 'scope_rejected', 'resume_agreed', 'review_received',
    'change_requested', 'change_decided', 'job_auto_accepted'));

create function nestscout_private.auto_accept_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.service_invitations%rowtype;
  v_job uuid;
  v_label text;
begin
  select * into v_invite from public.service_invitations i where i.id = p_invitation_id;
  if not found then
    return null;
  end if;
  perform 1 from public.service_requests r where r.id = v_invite.request_id for update;
  select * into v_invite from public.service_invitations i where i.id = p_invitation_id for update;
  if v_invite.state <> 'open' or v_invite.expires_at <= clock_timestamp()
    or not exists (select 1 from public.service_quotes q where q.id = v_invite.quote_id and q.accepted_at is not null)
    or exists (select 1 from public.service_jobs j where j.request_id = v_invite.request_id)
    or not nestscout_private.fixture_worker_dispatchable(v_invite.worker_id)
    or not exists (select 1 from public.kael_autonomy a where a.user_id = v_invite.worker_id and a.role = 'worker' and a.mode = 'auto') then
    return null;
  end if;
  v_job := nestscout_private.assign_invitation(v_invite.id, v_invite.worker_id);
  select left(btrim(split_part(btrim(r.description), E'\n', 1)), 48) into v_label from public.service_requests r where r.id = v_invite.request_id;
  insert into public.notifications (recipient_id, kind, request_id, title, body)
    values (v_invite.worker_id, 'job_auto_accepted', v_invite.request_id, 'Kael đã nhận việc giúp bạn',
      'Việc “' || coalesce(v_label, '') || '” khớp hồ sơ của bạn nên Kael đã nhận. Bạn có thể xem trong Đã nhận việc.');
  return v_job;
end;
$$;
revoke all on function nestscout_private.auto_accept_invitation(uuid) from public, anon, authenticated;

create function nestscout_private.dispatch_accepted_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings nestscout_private.auto_dispatch_settings%rowtype;
  v_request public.service_requests%rowtype;
  v_worker uuid;
  v_invitation uuid;
begin
  select * into v_settings from nestscout_private.auto_dispatch_settings;
  if not v_settings.enabled then
    return new;
  end if;
  select * into v_request from public.service_requests r where r.id = new.request_id;
  if v_request.service_id is null then
    return new;
  end if;
  for v_worker in
    select p.worker_id from public.worker_public_profiles p
    where v_request.service_id = any (p.service_ids)
      and p.worker_id <> v_request.owner_id
      and nestscout_private.fixture_worker_dispatchable(p.worker_id)
      and not exists (select 1 from public.service_invitations i where i.request_id = new.request_id and i.worker_id = p.worker_id)
    order by (select count(*) from public.service_jobs j where j.worker_id = p.worker_id and j.stage not in ('submitted', 'completed')), p.worker_id
    limit v_settings.max_invites
  loop
    exit when exists (select 1 from public.service_jobs j where j.request_id = new.request_id);
    insert into public.service_invitations (request_id, quote_id, worker_id, expires_at)
      values (new.request_id, new.id, v_worker, clock_timestamp() + make_interval(mins => v_settings.offer_minutes))
      returning id into v_invitation;
    perform nestscout_private.auto_accept_invitation(v_invitation);
  end loop;
  return new;
end;
$$;
revoke all on function nestscout_private.dispatch_accepted_quote() from public, anon, authenticated;

create trigger service_quotes_auto_dispatch after update of accepted_at on public.service_quotes
  for each row when (old.accepted_at is null and new.accepted_at is not null)
  execute function nestscout_private.dispatch_accepted_quote();

create or replace function nestscout_private.kael_request_approval(p_actor uuid, p_run_id uuid, p_task_id uuid, p_expected_version integer, p_tool text,
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
  if v_run.id is null or p_tool is null
    or p_tool not in ('service_request_submit', 'service_quote_decision', 'worker_offer_decision', 'worker_job_advance', 'work_submission_decision')
    or p_fingerprint !~ '^[0-9a-f]{64}$'
    or p_ttl_seconds not between 60 and 3600 or jsonb_typeof(p_args) <> 'object' or jsonb_typeof(p_details) is distinct from 'object'
    or char_length(btrim(coalesce(p_summary, ''))) = 0 then
    return jsonb_build_object('status', 'invalid');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kael-effect:' || v_actor::text, 0));
  if nestscout_private.kael_effect_unresolved(v_actor, p_tool, null) then
    return jsonb_build_object('status', 'unresolved');
  end if;
  select * into v_task from public.kael_tasks t where t.id = p_task_id and t.owner_id = v_actor for update;
  if not found or v_task.status not in ('running', 'waiting_for_input') or p_args ->> 'task_id' is distinct from v_task.id::text then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_task.version <> p_expected_version then
    return jsonb_build_object('status', 'stale');
  end if;
  if p_tool = 'service_request_submit' then
    if v_task.kind <> 'service_request'
      or coalesce(jsonb_array_length(v_task.artifact #> '{draft,missing}'), 1) <> 0
      or char_length(btrim(coalesce(v_task.artifact #>> '{draft,description}', ''))) = 0
      or p_args ->> 'description' is distinct from v_task.artifact #>> '{draft,description}'
      or p_args ->> 'location' is distinct from v_task.artifact #>> '{draft,location}'
      or p_args ->> 'preferred_time' is distinct from v_task.artifact #>> '{draft,preferred_time}'
      or coalesce(p_args ->> 'service_id', '') is distinct from coalesce(v_task.artifact #>> '{draft,service_id}', '') then
      return jsonb_build_object('status', 'invalid');
    end if;
  elsif v_task.kind <> 'workflow_action' or not nestscout_private.kael_effect_target_valid(v_actor, p_tool, p_args) then
    return jsonb_build_object('status', 'invalid');
  end if;
  update nestscout_private.kael_approvals set status = 'superseded' where task_id = v_task.id and status = 'pending';
  v_from := v_task.status;
  update public.kael_tasks set status = 'waiting_for_approval', version = version + 1, updated_at = clock_timestamp(),
    summary = case when p_tool = 'service_request_submit' then 'Đang chờ bạn xác nhận gửi yêu cầu' else 'Đang chờ bạn xác nhận thao tác' end
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
