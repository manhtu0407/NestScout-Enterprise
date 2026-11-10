create or replace function nestscout_private.set_consent(p_purpose text, p_granted boolean, p_version text)
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
  if not exists (select 1 from public.consent_events e where e.user_id = v_owner and e.purpose = p_purpose)
    or nestscout_private.has_consent(v_owner, p_purpose) is distinct from p_granted then
    insert into public.consent_events (user_id, purpose, granted, policy_version) values (v_owner, p_purpose, p_granted, p_version);
  end if;
  select e.recorded_at into v_recorded from public.consent_events e
  where e.user_id = v_owner and e.purpose = p_purpose order by e.id desc limit 1;
  return v_recorded;
end;
$$;

create or replace function nestscout_private.erase_account_data(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
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

alter table nestscout_private.push_deliveries
  add column attempts integer not null default 1 check (attempts between 1 and 5);

create or replace function nestscout_private.claim_push_deliveries(p_limit integer)
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
      and not exists (
        select 1 from nestscout_private.push_deliveries d
        where d.notification_id = n.id
          and (d.sent_at is not null or d.attempts >= 5 or d.claimed_at > clock_timestamp() - interval '5 minutes')
      )
      and nestscout_private.has_consent(n.recipient_id, 'push_notifications')
      and coalesce((select s.push from public.customer_settings s where s.user_id = n.recipient_id), true)
    order by n.created_at
    limit p_limit
    for update of n skip locked
  ), claimed as (
    insert into nestscout_private.push_deliveries as d (notification_id) select due.id from due
    on conflict (notification_id) do update
      set claimed_at = clock_timestamp(), attempts = d.attempts + 1, error = null
      where d.sent_at is null and d.attempts < 5
    returning d.notification_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('notification_id', due.id, 'title', due.title, 'body', due.body,
      'tokens', (select coalesce(jsonb_agg(t.token), '[]'::jsonb) from public.push_tokens t where t.user_id = due.recipient_id))), '[]'::jsonb)
  into v_result
  from due join claimed c on c.notification_id = due.id;
  return v_result;
end;
$$;
