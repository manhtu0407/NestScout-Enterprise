alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('quote_received', 'job_assigned', 'job_progress', 'work_submitted', 'job_completed', 'scope_proposed',
    'job_offered', 'work_approved', 'revision_requested', 'work_disputed', 'scope_approved', 'scope_rejected', 'resume_agreed', 'review_received'));

create function nestscout_private.notify_job_worker(p_job_id uuid, p_kind text, p_title text, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
  v_request uuid;
  v_label text;
begin
  select j.worker_id, j.request_id, left(btrim(split_part(btrim(r.description), E'\n', 1)), 48) into v_worker, v_request, v_label
  from public.service_jobs j join public.service_requests r on r.id = j.request_id where j.id = p_job_id;
  if v_worker is null then return; end if;
  insert into public.notifications (recipient_id, kind, request_id, title, body)
  values (v_worker, p_kind, v_request, p_title, 'Việc “' || v_label || '” ' || p_action);
end;
$$;
revoke all on function nestscout_private.notify_job_worker(uuid, text, text, text) from public, anon, authenticated;

create function nestscout_private.notify_worker_job_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  case new.event
    when 'accepted' then
      perform nestscout_private.notify_job_worker(new.job_id, 'work_approved', 'Khách đã nghiệm thu', 'đã được khách nghiệm thu.');
    when 'revision_requested' then
      perform nestscout_private.notify_job_worker(new.job_id, 'revision_requested', 'Khách yêu cầu chỉnh sửa', 'cần chỉnh sửa theo ghi chú của khách.');
    when 'disputed' then
      perform nestscout_private.notify_job_worker(new.job_id, 'work_disputed', 'Khách khiếu nại kết quả', 'đang có khiếu nại từ khách.');
    when 'scope_approved' then
      perform nestscout_private.notify_job_worker(new.job_id, 'scope_approved', 'Khách đồng ý đổi phạm vi', 'có đề xuất phạm vi đã được khách đồng ý.');
    when 'scope_rejected' then
      perform nestscout_private.notify_job_worker(new.job_id, 'scope_rejected', 'Khách từ chối đổi phạm vi', 'có đề xuất phạm vi bị khách từ chối.');
    when 'resumed' then
      perform nestscout_private.notify_job_worker(new.job_id, 'resume_agreed', 'Khách đồng ý làm tiếp', 'được khách đồng ý làm tiếp.');
    else
      null;
  end case;
  return new;
end;
$$;
revoke all on function nestscout_private.notify_worker_job_event() from public, anon, authenticated;

create function nestscout_private.notify_worker_invited()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text;
begin
  if new.state <> 'open' then return new; end if;
  select left(btrim(split_part(btrim(r.description), E'\n', 1)), 48) into v_label from public.service_requests r where r.id = new.request_id;
  insert into public.notifications (recipient_id, kind, request_id, title, body)
  values (new.worker_id, 'job_offered', new.request_id, 'Có việc mới', 'Việc “' || coalesce(v_label, '') || '” đang chờ bạn phản hồi.');
  return new;
end;
$$;
revoke all on function nestscout_private.notify_worker_invited() from public, anon, authenticated;

create function nestscout_private.notify_worker_reviewed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.job_id is not null then
    perform nestscout_private.notify_job_worker(new.job_id, 'review_received', 'Bạn có đánh giá mới', 'đã được khách đánh giá.');
  end if;
  return new;
end;
$$;
revoke all on function nestscout_private.notify_worker_reviewed() from public, anon, authenticated;

create trigger service_job_events_notify_worker after insert on public.service_job_events
  for each row execute function nestscout_private.notify_worker_job_event();
create trigger service_invitations_notify_worker after insert on public.service_invitations
  for each row execute function nestscout_private.notify_worker_invited();
create trigger worker_reviews_notify_worker after insert on public.worker_reviews
  for each row execute function nestscout_private.notify_worker_reviewed();
