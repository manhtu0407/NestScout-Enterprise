alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('quote_received', 'job_assigned', 'job_progress', 'work_submitted', 'job_completed', 'scope_proposed', 'job_offered', 'work_approved',
    'revision_requested', 'work_disputed', 'scope_approved', 'scope_rejected', 'resume_agreed', 'review_received', 'change_requested', 'change_decided',
    'job_auto_accepted', 'dispatch_exhausted', 'job_released', 'job_withdrawn', 'job_escalated', 'escalation_received', 'escalation_resolved',
    'job_en_route', 'job_arrived', 'job_working', 'job_paused'));

create or replace function nestscout_private.notify_job_stage_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stage = 'submitted' then
    perform nestscout_private.notify_request_owner(new.request_id, 'work_submitted', 'Thợ đã gửi kết quả', 'đang chờ bạn nghiệm thu.');
  elsif new.stage = 'completed' then
    perform nestscout_private.notify_request_owner(new.request_id, 'job_completed', 'Việc đã hoàn tất', 'đã hoàn tất.');
  elsif new.stage = 'en_route' then
    perform nestscout_private.notify_request_owner(new.request_id, 'job_en_route', 'Công việc có cập nhật', 'có thợ đang trên đường tới.');
  elsif new.stage = 'arrived' then
    perform nestscout_private.notify_request_owner(new.request_id, 'job_arrived', 'Công việc có cập nhật', 'có thợ đã đến nơi.');
  elsif new.stage = 'working' then
    perform nestscout_private.notify_request_owner(new.request_id, 'job_working', 'Công việc có cập nhật', 'đang được thực hiện.');
  elsif new.stage = 'paused' then
    perform nestscout_private.notify_request_owner(new.request_id, 'job_paused', 'Công việc có cập nhật', 'đang tạm dừng.');
  else
    perform nestscout_private.notify_request_owner(new.request_id, 'job_progress', 'Công việc có cập nhật', 'có cập nhật mới.');
  end if;
  return new;
end;
$$;
revoke all on function nestscout_private.notify_job_stage_changed() from public, anon, authenticated;
