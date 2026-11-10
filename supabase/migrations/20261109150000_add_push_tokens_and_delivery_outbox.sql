create table public.push_tokens (
  token text primary key check (char_length(token) between 10 and 200),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  registered_at timestamptz not null default clock_timestamp()
);
create index push_tokens_user on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
revoke all on table public.push_tokens from public, anon, authenticated;
grant select on table public.push_tokens to authenticated;

create policy push_tokens_select_owner on public.push_tokens
  for select to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create table nestscout_private.push_deliveries (
  notification_id uuid primary key references public.notifications (id) on delete cascade,
  claimed_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz,
  error text check (error is null or char_length(error) <= 200)
);
revoke all on table nestscout_private.push_deliveries from public, anon, authenticated;

create function nestscout_private.register_push_token(p_token text, p_platform text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_registered timestamptz;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_token is null or char_length(p_token) not between 10 and 200 or p_platform is null or p_platform not in ('ios', 'android') then
    raise exception using errcode = '22023', message = 'invalid token';
  end if;
  if not nestscout_private.has_consent(v_owner, 'push_notifications') then
    raise exception using errcode = '22023', message = 'consent required';
  end if;
  insert into public.push_tokens (token, user_id, platform) values (p_token, v_owner, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, registered_at = clock_timestamp()
  returning registered_at into v_registered;
  return v_registered;
end;
$$;
revoke all on function nestscout_private.register_push_token(text, text) from public, anon, authenticated;
grant execute on function nestscout_private.register_push_token(text, text) to authenticated;

create function nestscout_private.unregister_push_token(p_token text)
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
  delete from public.push_tokens where token = p_token and user_id = v_owner;
  return found;
end;
$$;
revoke all on function nestscout_private.unregister_push_token(text) from public, anon, authenticated;
grant execute on function nestscout_private.unregister_push_token(text) to authenticated;

create function public.register_push_token(p_token text, p_platform text)
returns timestamptz language sql security invoker set search_path = ''
as $$ select nestscout_private.register_push_token(p_token, p_platform); $$;
revoke all on function public.register_push_token(text, text) from public, anon, authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;

create function public.unregister_push_token(p_token text)
returns boolean language sql security invoker set search_path = ''
as $$ select nestscout_private.unregister_push_token(p_token); $$;
revoke all on function public.unregister_push_token(text) from public, anon, authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

create function nestscout_private.drop_push_tokens_on_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.purpose = 'push_notifications' and not new.granted then
    delete from public.push_tokens where user_id = new.user_id;
  end if;
  return new;
end;
$$;
revoke all on function nestscout_private.drop_push_tokens_on_withdrawal() from public, anon, authenticated;
create trigger consent_events_drop_push_tokens after insert on public.consent_events
  for each row execute function nestscout_private.drop_push_tokens_on_withdrawal();

create function nestscout_private.claim_push_deliveries(p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_limit is null or p_limit not between 1 and 200 then
    raise exception using errcode = '22023', message = 'invalid limit';
  end if;
  with due as (
    select n.id, n.title, n.body, n.recipient_id
    from public.notifications n
    where n.created_at > clock_timestamp() - interval '1 day'
      and not exists (select 1 from nestscout_private.push_deliveries d where d.notification_id = n.id)
      and nestscout_private.has_consent(n.recipient_id, 'push_notifications')
      and coalesce((select s.push from public.customer_settings s where s.user_id = n.recipient_id), true)
    order by n.created_at
    limit p_limit
    for update of n skip locked
  ), claimed as (
    insert into nestscout_private.push_deliveries (notification_id) select due.id from due
    on conflict do nothing returning notification_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('notification_id', due.id, 'title', due.title, 'body', due.body,
      'tokens', (select coalesce(jsonb_agg(t.token), '[]'::jsonb) from public.push_tokens t where t.user_id = due.recipient_id))), '[]'::jsonb)
  into v_result
  from due join claimed c on c.notification_id = due.id;
  return v_result;
end;
$$;
revoke all on function nestscout_private.claim_push_deliveries(integer) from public, anon, authenticated;

create function nestscout_private.finish_push_delivery(p_notification_id uuid, p_error text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  update nestscout_private.push_deliveries set sent_at = case when p_error is null then clock_timestamp() end, error = left(p_error, 200)
  where notification_id = p_notification_id;
  return found;
end;
$$;
revoke all on function nestscout_private.finish_push_delivery(uuid, text) from public, anon, authenticated;

create function public.claim_push_deliveries(p_limit integer)
returns jsonb language sql security invoker set search_path = ''
as $$ select nestscout_private.claim_push_deliveries(p_limit); $$;
revoke all on function public.claim_push_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_push_deliveries(integer) to service_role;

create function public.finish_push_delivery(p_notification_id uuid, p_error text)
returns boolean language sql security invoker set search_path = ''
as $$ select nestscout_private.finish_push_delivery(p_notification_id, p_error); $$;
revoke all on function public.finish_push_delivery(uuid, text) from public, anon, authenticated;
grant execute on function public.finish_push_delivery(uuid, text) to service_role;
grant execute on function nestscout_private.claim_push_deliveries(integer), nestscout_private.finish_push_delivery(uuid, text) to service_role;
