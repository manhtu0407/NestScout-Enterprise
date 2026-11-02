create table public.request_pins (
  owner_id uuid not null default auth.uid() references auth.users (id),
  request_id uuid not null references public.service_requests (id),
  created_at timestamptz not null default now(),
  primary key (owner_id, request_id)
);

alter table public.request_pins enable row level security;
revoke all on table public.request_pins from public, anon, authenticated;
grant select, delete on table public.request_pins to authenticated;
grant insert (request_id) on public.request_pins to authenticated;

create policy request_pins_select_owner on public.request_pins
  for select to authenticated
  using ((select auth.uid()) = owner_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create policy request_pins_insert_owner on public.request_pins
  for insert to authenticated
  with check ((select auth.uid()) = owner_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
    and exists (select 1 from public.service_requests r where r.id = request_id and r.owner_id = (select auth.uid())));

create policy request_pins_delete_owner on public.request_pins
  for delete to authenticated
  using ((select auth.uid()) = owner_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create function public.set_request_pinned(p_request_id uuid, p_pinned boolean)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_request_id is null or p_pinned is null then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  if p_pinned then
    if not exists (select 1 from public.service_requests r where r.id = p_request_id) then
      raise exception using errcode = '42501', message = 'request unavailable';
    end if;
    insert into public.request_pins (request_id) values (p_request_id) on conflict do nothing;
  else
    delete from public.request_pins where request_id = p_request_id and owner_id = auth.uid();
  end if;
  return p_pinned;
end;
$$;

revoke all on function public.set_request_pinned(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_request_pinned(uuid, boolean) to authenticated;

create function nestscout_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function nestscout_private.touch_updated_at() from public, anon, authenticated;

create table public.customer_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null default '' check (display_name = btrim(display_name) and char_length(display_name) <= 80),
  email text not null default '' check (email = btrim(email) and char_length(email) <= 254
    and (email = '' or email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$')),
  address text not null default '' check (address = btrim(address) and char_length(address) <= 300),
  updated_at timestamptz not null default clock_timestamp()
);

create trigger customer_profiles_touch before update on public.customer_profiles
  for each row execute function nestscout_private.touch_updated_at();

alter table public.customer_profiles enable row level security;
revoke all on table public.customer_profiles from public, anon, authenticated;
grant select on table public.customer_profiles to authenticated;
grant insert (display_name, email, address) on public.customer_profiles to authenticated;
grant update (display_name, email, address) on public.customer_profiles to authenticated;

create policy customer_profiles_select_owner on public.customer_profiles
  for select to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create policy customer_profiles_insert_owner on public.customer_profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create policy customer_profiles_update_owner on public.customer_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false')
  with check ((select auth.uid()) = user_id);

create function public.save_customer_profile(p_display_name text, p_email text, p_address text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_name text := btrim(coalesce(p_display_name, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_address text := btrim(coalesce(p_address, ''));
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if char_length(v_name) > 80 or char_length(v_address) > 300 or char_length(v_email) > 254
    or (v_email <> '' and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$') then
    raise exception using errcode = '22023', message = 'invalid profile';
  end if;
  insert into public.customer_profiles (display_name, email, address) values (v_name, v_email, v_address)
  on conflict (user_id) do update set display_name = excluded.display_name, email = excluded.email, address = excluded.address;
  return v_owner;
end;
$$;

revoke all on function public.save_customer_profile(text, text, text) from public, anon, authenticated;
grant execute on function public.save_customer_profile(text, text, text) to authenticated;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id),
  kind text not null check (kind in ('quote_received', 'job_assigned', 'job_progress', 'work_submitted', 'job_completed', 'scope_proposed')),
  request_id uuid not null references public.service_requests (id),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz
);
create index notifications_recipient_time on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on table public.notifications from public, anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notifications_select_recipient on public.notifications
  for select to authenticated
  using ((select auth.uid()) = recipient_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create policy notifications_update_recipient on public.notifications
  for update to authenticated
  using ((select auth.uid()) = recipient_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false')
  with check ((select auth.uid()) = recipient_id);

create function public.mark_notifications_read(p_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) > 200 then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  update public.notifications set read_at = clock_timestamp()
  where id = any (p_ids) and recipient_id = auth.uid() and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_notifications_read(uuid[]) from public, anon, authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

create function nestscout_private.notify_request_owner(p_request_id uuid, p_kind text, p_title text, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_label text;
begin
  select r.owner_id, left(btrim(split_part(btrim(r.description), E'\n', 1)), 48) into v_owner, v_label
  from public.service_requests r where r.id = p_request_id;
  if v_owner is null then return; end if;
  insert into public.notifications (recipient_id, kind, request_id, title, body)
  values (v_owner, p_kind, p_request_id, p_title, 'Yêu cầu “' || v_label || '” ' || p_action);
end;
$$;
revoke all on function nestscout_private.notify_request_owner(uuid, text, text, text) from public, anon, authenticated;

create function nestscout_private.notify_quote_inserted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform nestscout_private.notify_request_owner(new.request_id, 'quote_received', 'Báo giá mới', 'có báo giá mới đang chờ bạn quyết định.');
  return new;
end;
$$;
revoke all on function nestscout_private.notify_quote_inserted() from public, anon, authenticated;

create function nestscout_private.notify_job_inserted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform nestscout_private.notify_request_owner(new.request_id, 'job_assigned', 'Đã có thợ nhận việc', 'đã có thợ nhận việc.');
  return new;
end;
$$;
revoke all on function nestscout_private.notify_job_inserted() from public, anon, authenticated;

create function nestscout_private.notify_job_stage_changed()
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
  else
    perform nestscout_private.notify_request_owner(new.request_id, 'job_progress', 'Công việc có cập nhật',
      case new.stage
        when 'en_route' then 'có thợ đang trên đường tới.'
        when 'arrived' then 'có thợ đã đến nơi.'
        when 'working' then 'đang được thực hiện.'
        when 'paused' then 'đang tạm dừng.'
        else 'có cập nhật mới.'
      end);
  end if;
  return new;
end;
$$;
revoke all on function nestscout_private.notify_job_stage_changed() from public, anon, authenticated;

create function nestscout_private.notify_scope_proposed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request uuid;
begin
  select j.request_id into v_request from public.service_jobs j where j.id = new.job_id;
  if v_request is not null then
    perform nestscout_private.notify_request_owner(v_request, 'scope_proposed', 'Đề xuất đổi phạm vi', 'có đề xuất thay đổi phạm vi đang chờ bạn quyết định.');
  end if;
  return new;
end;
$$;
revoke all on function nestscout_private.notify_scope_proposed() from public, anon, authenticated;

create trigger service_quotes_notify after insert on public.service_quotes
  for each row execute function nestscout_private.notify_quote_inserted();
create trigger service_jobs_notify_assigned after insert on public.service_jobs
  for each row execute function nestscout_private.notify_job_inserted();
create trigger service_jobs_notify_stage after update of stage on public.service_jobs
  for each row when (old.stage is distinct from new.stage) execute function nestscout_private.notify_job_stage_changed();
create trigger service_scope_changes_notify after insert on public.service_scope_changes
  for each row execute function nestscout_private.notify_scope_proposed();

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  submission_key uuid not null,
  subject text not null check (subject = btrim(subject) and char_length(subject) between 1 and 120),
  body text not null check (body = btrim(body) and char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  unique (owner_id, submission_key)
);

alter table public.support_requests enable row level security;
revoke all on table public.support_requests from public, anon, authenticated;
grant select on table public.support_requests to authenticated;
grant insert (submission_key, subject, body) on public.support_requests to authenticated;

create policy support_requests_select_owner on public.support_requests
  for select to authenticated
  using ((select auth.uid()) = owner_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create policy support_requests_insert_owner on public.support_requests
  for insert to authenticated
  with check ((select auth.uid()) = owner_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create function public.submit_support_request(p_submission_key uuid, p_subject text, p_body text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_id uuid;
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_existing public.support_requests%rowtype;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_submission_key is null or char_length(v_subject) not between 1 and 120 or char_length(v_body) not between 1 and 4000 then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  insert into public.support_requests (submission_key, subject, body) values (p_submission_key, v_subject, v_body)
  on conflict (owner_id, submission_key) do nothing
  returning id into v_id;
  if v_id is null then
    select * into v_existing from public.support_requests where owner_id = v_owner and submission_key = p_submission_key;
    if v_existing.subject is distinct from v_subject or v_existing.body is distinct from v_body then
      raise exception using errcode = '22023', message = 'submission key conflict';
    end if;
    v_id := v_existing.id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.submit_support_request(uuid, text, text) from public, anon, authenticated;
grant execute on function public.submit_support_request(uuid, text, text) to authenticated;
