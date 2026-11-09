alter table public.account_deletion_requests add column processed_at timestamptz;

create function nestscout_private.erase_account_data(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.kael_messages where owner_id = p_user;
  delete from public.kael_memory_modes where owner_id = p_user;
  delete from public.push_tokens where user_id = p_user;
  delete from public.customer_saved_workers where customer_id = p_user;
  delete from public.customer_settings where user_id = p_user;
  delete from public.customer_profiles where user_id = p_user;
  delete from public.support_requests where owner_id = p_user;
  delete from public.notifications where recipient_id = p_user;
  update auth.users set banned_until = 'infinity'::timestamptz where id = p_user;
end;
$$;
revoke all on function nestscout_private.erase_account_data(uuid) from public, anon, authenticated;

create function nestscout_private.process_account_deletions(p_grace interval)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_done integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_grace is null or p_grace < interval '0 seconds' then
    raise exception using errcode = '22023', message = 'invalid grace period';
  end if;
  for v_user in
    select r.user_id from public.account_deletion_requests r
    where r.processed_at is null and r.requested_at <= clock_timestamp() - p_grace
    order by r.requested_at for update skip locked
  loop
    perform nestscout_private.erase_account_data(v_user);
    update public.account_deletion_requests set processed_at = clock_timestamp() where user_id = v_user;
    v_done := v_done + 1;
  end loop;
  return v_done;
end;
$$;
revoke all on function nestscout_private.process_account_deletions(interval) from public, anon, authenticated;

create function nestscout_private.purge_expired_data(p_kael_messages_older_than interval, p_read_notifications_older_than interval)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_messages integer;
  v_notifications integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_kael_messages_older_than is null or p_kael_messages_older_than < interval '1 day'
    or p_read_notifications_older_than is null or p_read_notifications_older_than < interval '1 day' then
    raise exception using errcode = '22023', message = 'invalid retention period';
  end if;
  delete from public.kael_messages m
  where m.created_at < clock_timestamp() - p_kael_messages_older_than
    and not exists (select 1 from public.kael_runs r where r.conversation_id = m.conversation_id and r.status = 'running');
  get diagnostics v_messages = row_count;
  delete from public.notifications n
  where n.read_at is not null and n.read_at < clock_timestamp() - p_read_notifications_older_than;
  get diagnostics v_notifications = row_count;
  return jsonb_build_object('kael_messages', v_messages, 'notifications', v_notifications);
end;
$$;
revoke all on function nestscout_private.purge_expired_data(interval, interval) from public, anon, authenticated;

create function public.process_account_deletions(p_grace interval)
returns integer language sql security invoker set search_path = ''
as $$ select nestscout_private.process_account_deletions(p_grace); $$;
revoke all on function public.process_account_deletions(interval) from public, anon, authenticated;
grant execute on function public.process_account_deletions(interval) to service_role;
grant execute on function nestscout_private.process_account_deletions(interval) to service_role;

create function public.purge_expired_data(p_kael_messages_older_than interval, p_read_notifications_older_than interval)
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.purge_expired_data(p_kael_messages_older_than, p_read_notifications_older_than); $$;
revoke all on function public.purge_expired_data(interval, interval) from public, anon, authenticated;
grant execute on function public.purge_expired_data(interval, interval) to service_role;
grant execute on function nestscout_private.purge_expired_data(interval, interval) to service_role;

create or replace function nestscout_private.cancel_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  delete from public.account_deletion_requests where user_id = v_owner and processed_at is null;
  return found;
end;
$$;
