create table public.job_change_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.service_jobs (id),
  requested_by uuid not null default auth.uid() references auth.users (id),
  kind text not null check (kind in ('cancel', 'reschedule')),
  proposed_for timestamptz,
  reason text check (reason is null or char_length(btrim(reason)) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'agreed', 'declined', 'withdrawn')),
  created_at timestamptz not null default clock_timestamp(),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  check ((kind = 'reschedule') = (proposed_for is not null)),
  check ((status = 'pending') = (decided_at is null)),
  check ((status in ('agreed', 'declined')) = (decided_by is not null))
);
create unique index job_change_requests_one_pending on public.job_change_requests (job_id) where status = 'pending';
create index job_change_requests_job_time on public.job_change_requests (job_id, created_at desc);

alter table public.job_change_requests enable row level security;
revoke all on table public.job_change_requests from public, anon, authenticated;
grant select on table public.job_change_requests to authenticated;

create function nestscout_private.job_change_participant(p_job_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.service_jobs j join public.service_requests r on r.id = j.request_id
    where j.id = p_job_id and (j.worker_id = p_user or r.owner_id = p_user)
  );
$$;
revoke all on function nestscout_private.job_change_participant(uuid, uuid) from public, anon, authenticated;
grant execute on function nestscout_private.job_change_participant(uuid, uuid) to authenticated;

create policy job_change_requests_select_participant on public.job_change_requests
  for select to authenticated
  using (coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
    and nestscout_private.job_change_participant(job_id, (select auth.uid())));

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('quote_received', 'job_assigned', 'job_progress', 'work_submitted', 'job_completed', 'scope_proposed',
    'job_offered', 'work_approved', 'revision_requested', 'work_disputed', 'scope_approved', 'scope_rejected', 'resume_agreed', 'review_received',
    'change_requested', 'change_decided'));

create function nestscout_private.notify_job_counterparty(p_job_id uuid, p_actor uuid, p_kind text, p_title text, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
  v_owner uuid;
  v_request uuid;
  v_label text;
begin
  select j.worker_id, r.owner_id, j.request_id, left(btrim(split_part(btrim(r.description), E'\n', 1)), 48)
    into v_worker, v_owner, v_request, v_label
  from public.service_jobs j join public.service_requests r on r.id = j.request_id where j.id = p_job_id;
  if v_request is null then return; end if;
  insert into public.notifications (recipient_id, kind, request_id, title, body)
  values (case when p_actor = v_worker then v_owner else v_worker end, p_kind, v_request, p_title, 'Việc “' || v_label || '” ' || p_action);
end;
$$;
revoke all on function nestscout_private.notify_job_counterparty(uuid, uuid, text, text, text) from public, anon, authenticated;

create function nestscout_private.request_job_change(p_job_id uuid, p_kind text, p_proposed_for timestamptz, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_stage text;
  v_id uuid;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_actor is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_job_id is null or p_kind is null or p_kind not in ('cancel', 'reschedule')
    or (p_kind = 'reschedule') <> (p_proposed_for is not null)
    or (p_kind = 'reschedule' and p_proposed_for <= clock_timestamp())
    or (v_reason is not null and char_length(v_reason) > 500) then
    raise exception using errcode = '22023', message = 'invalid change request';
  end if;
  select j.stage into v_stage from public.service_jobs j where j.id = p_job_id for update;
  if not found or not nestscout_private.job_change_participant(p_job_id, v_actor) then
    raise exception using errcode = '42501', message = 'job not available';
  end if;
  if v_stage = 'completed' then
    raise exception using errcode = '22023', message = 'job closed';
  end if;
  if exists (select 1 from public.job_change_requests c where c.job_id = p_job_id and c.status = 'pending') then
    raise exception using errcode = '22023', message = 'change pending';
  end if;
  insert into public.job_change_requests (job_id, requested_by, kind, proposed_for, reason)
  values (p_job_id, v_actor, p_kind, p_proposed_for, v_reason) returning id into v_id;
  perform nestscout_private.notify_job_counterparty(p_job_id, v_actor, 'change_requested',
    case p_kind when 'cancel' then 'Có đề nghị huỷ việc' else 'Có đề nghị đổi lịch' end, 'có đề nghị thay đổi đang chờ bạn phản hồi.');
  return v_id;
end;
$$;
revoke all on function nestscout_private.request_job_change(uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function nestscout_private.request_job_change(uuid, text, timestamptz, text) to authenticated;

create function nestscout_private.decide_job_change(p_change_id uuid, p_decision text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_change public.job_change_requests;
begin
  if v_actor is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_change_id is null or p_decision is null or p_decision not in ('agreed', 'declined', 'withdrawn') then
    raise exception using errcode = '22023', message = 'invalid decision';
  end if;
  select * into v_change from public.job_change_requests c where c.id = p_change_id for update;
  if not found or not nestscout_private.job_change_participant(v_change.job_id, v_actor) then
    raise exception using errcode = '42501', message = 'change not available';
  end if;
  if v_change.status <> 'pending' then
    raise exception using errcode = '22023', message = 'change closed';
  end if;
  if (p_decision = 'withdrawn') <> (v_change.requested_by = v_actor) then
    raise exception using errcode = '42501', message = 'wrong party';
  end if;
  update public.job_change_requests set status = p_decision, decided_at = clock_timestamp(),
    decided_by = case when p_decision = 'withdrawn' then null else v_actor end
  where id = p_change_id;
  if p_decision <> 'withdrawn' then
    perform nestscout_private.notify_job_counterparty(v_change.job_id, v_actor, 'change_decided',
      case p_decision when 'agreed' then 'Đề nghị thay đổi được đồng ý' else 'Đề nghị thay đổi bị từ chối' end,
      case p_decision when 'agreed' then 'đã được bên kia đồng ý đề nghị thay đổi.' else 'đã bị bên kia từ chối đề nghị thay đổi.' end);
  end if;
  return p_decision;
end;
$$;
revoke all on function nestscout_private.decide_job_change(uuid, text) from public, anon, authenticated;
grant execute on function nestscout_private.decide_job_change(uuid, text) to authenticated;

create function public.request_job_change(p_job_id uuid, p_kind text, p_proposed_for timestamptz, p_reason text)
returns uuid language sql security invoker set search_path = ''
as $$ select nestscout_private.request_job_change(p_job_id, p_kind, p_proposed_for, p_reason); $$;
revoke all on function public.request_job_change(uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.request_job_change(uuid, text, timestamptz, text) to authenticated;

create function public.decide_job_change(p_change_id uuid, p_decision text)
returns text language sql security invoker set search_path = ''
as $$ select nestscout_private.decide_job_change(p_change_id, p_decision); $$;
revoke all on function public.decide_job_change(uuid, text) from public, anon, authenticated;
grant execute on function public.decide_job_change(uuid, text) to authenticated;
