alter table public.service_requests add column preferred_visit_at timestamptz;

create function nestscout_private.set_request_preferred_visit(p_request_id uuid, p_at timestamptz)
returns timestamptz
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
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  perform 1 from public.service_requests r where r.id = p_request_id and r.owner_id = v_owner for update;
  if not found then
    raise exception using errcode = '42501', message = 'request unavailable';
  end if;
  if p_at is not null and (p_at < clock_timestamp() + interval '1 hour' or p_at > clock_timestamp() + interval '60 days') then
    raise exception using errcode = '22023', message = 'invalid visit time';
  end if;
  if exists (select 1 from public.service_jobs j where j.request_id = p_request_id) then
    raise exception using errcode = '22023', message = 'step unavailable';
  end if;
  update public.service_requests set preferred_visit_at = p_at where id = p_request_id;
  return p_at;
end;
$$;
revoke all on function nestscout_private.set_request_preferred_visit(uuid, timestamptz) from public, anon, authenticated;
grant execute on function nestscout_private.set_request_preferred_visit(uuid, timestamptz) to authenticated;

create function public.set_request_preferred_visit(p_request_id uuid, p_at timestamptz)
returns timestamptz language sql security invoker set search_path = ''
as $$ select nestscout_private.set_request_preferred_visit(p_request_id, p_at); $$;
revoke all on function public.set_request_preferred_visit(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.set_request_preferred_visit(uuid, timestamptz) to authenticated;

drop function public.worker_job_cards();
drop function nestscout_private.worker_job_cards();

create function nestscout_private.worker_job_cards()
returns table (kind text, ref_id uuid, title text, description text, photo_count integer, location text, customer_label text, updated_at timestamptz,
  preferred_visit_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select 'offer'::text, i.id, left(btrim(split_part(r.description, E'\n', 1)), 80), r.description,
    (select count(*)::integer from public.request_photos p where p.request_id = r.id),
    ''::text, ''::text, null::timestamptz, r.preferred_visit_at
  from public.service_invitations i
  join public.service_quotes q on q.id = i.quote_id and q.request_id = i.request_id
  join public.service_requests r on r.id = i.request_id
  where i.worker_id = auth.uid() and nestscout_private.current_worker_eligible()
    and i.state = 'open' and i.expires_at > clock_timestamp() and q.accepted_at is not null
    and not exists (select 1 from public.service_jobs j where j.request_id = i.request_id)
  union all
  select 'job'::text, j.id, left(btrim(split_part(r.description, E'\n', 1)), 80), r.description,
    (select count(*)::integer from public.request_photos p where p.request_id = r.id),
    r.location,
    coalesce(nullif(regexp_replace(btrim(c.display_name), '^.*[[:space:]]', ''), ''), 'Khách hàng'),
    (select max(e.created_at) from public.service_job_events e where e.job_id = j.id),
    r.preferred_visit_at
  from public.service_jobs j
  join public.service_requests r on r.id = j.request_id
  left join public.customer_profiles c on c.user_id = r.owner_id
  where j.worker_id = auth.uid() and nestscout_private.current_worker_eligible();
$$;
revoke all on function nestscout_private.worker_job_cards() from public, anon, authenticated;
grant execute on function nestscout_private.worker_job_cards() to authenticated;

create function public.worker_job_cards()
returns table (kind text, ref_id uuid, title text, description text, photo_count integer, location text, customer_label text, updated_at timestamptz,
  preferred_visit_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from nestscout_private.worker_job_cards(); $$;
revoke all on function public.worker_job_cards() from public, anon, authenticated;
grant execute on function public.worker_job_cards() to authenticated;

create table public.kael_message_feedback (
  message_id uuid primary key references public.kael_messages (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  rating text not null check (rating in ('up', 'down')),
  reason text check (reason is null or reason in ('inaccurate', 'too_long', 'ignored_request', 'other')),
  updated_at timestamptz not null default clock_timestamp(),
  check (rating = 'down' or reason is null)
);
alter table public.kael_message_feedback enable row level security;
revoke all on table public.kael_message_feedback from public, anon, authenticated;
grant select on table public.kael_message_feedback to authenticated;
create policy kael_message_feedback_select_owner on public.kael_message_feedback for select to authenticated
  using ((select auth.uid()) = owner_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create function nestscout_private.set_kael_feedback(p_message_id uuid, p_rating text, p_reason text)
returns text
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
  if p_message_id is null or (p_rating is not null and p_rating not in ('up', 'down'))
    or (p_reason is not null and (p_rating is distinct from 'down' or p_reason not in ('inaccurate', 'too_long', 'ignored_request', 'other'))) then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  perform 1 from public.kael_messages m where m.id = p_message_id and m.owner_id = v_owner and m.role = 'assistant';
  if not found then
    raise exception using errcode = '42501', message = 'message unavailable';
  end if;
  if p_rating is null then
    delete from public.kael_message_feedback where message_id = p_message_id and owner_id = v_owner;
    return null;
  end if;
  insert into public.kael_message_feedback (message_id, owner_id, rating, reason)
    values (p_message_id, v_owner, p_rating, p_reason)
    on conflict (message_id) do update set rating = excluded.rating, reason = excluded.reason, updated_at = clock_timestamp()
    where public.kael_message_feedback.owner_id = v_owner;
  return p_rating;
end;
$$;
revoke all on function nestscout_private.set_kael_feedback(uuid, text, text) from public, anon, authenticated;
grant execute on function nestscout_private.set_kael_feedback(uuid, text, text) to authenticated;

create function public.set_kael_feedback(p_message_id uuid, p_rating text, p_reason text)
returns text language sql security invoker set search_path = ''
as $$ select nestscout_private.set_kael_feedback(p_message_id, p_rating, p_reason); $$;
revoke all on function public.set_kael_feedback(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_kael_feedback(uuid, text, text) to authenticated;

create or replace function nestscout_private.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  return jsonb_build_object(
    'exported_at', clock_timestamp(),
    'account', (select jsonb_build_object('id', u.id, 'phone', u.phone, 'email', u.email, 'created_at', u.created_at)
      from auth.users u where u.id = v_owner),
    'customer_profile', (select to_jsonb(p) from public.customer_profiles p where p.user_id = v_owner),
    'customer_settings', (select to_jsonb(s) from public.customer_settings s where s.user_id = v_owner),
    'worker_profile', (select to_jsonb(w) from public.worker_public_profiles w where w.worker_id = v_owner),
    'worker_documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'title', d.title, 'status', d.status, 'created_at', d.created_at) order by d.created_at)
      from public.worker_documents d where d.worker_id = v_owner), '[]'::jsonb),
    'worker_payout_account', (select jsonb_build_object('bank_name', a.bank_name, 'account_number', a.account_number, 'account_holder', a.account_holder, 'status', a.status, 'updated_at', a.updated_at)
      from public.worker_payout_accounts a where a.worker_id = v_owner),
    'service_requests', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.service_requests r where r.owner_id = v_owner), '[]'::jsonb),
    'request_photos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'request_id', p.request_id, 'created_at', p.created_at) order by p.created_at)
      from public.request_photos p where p.owner_id = v_owner), '[]'::jsonb),
    'quotes_received', coalesce((select jsonb_agg(to_jsonb(q) order by q.request_id, q.version) from public.service_quotes q
      join public.service_requests r on r.id = q.request_id where r.owner_id = v_owner), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'request_id', j.request_id, 'stage', j.stage, 'created_at', j.created_at) order by j.created_at)
      from public.service_jobs j join public.service_requests r on r.id = j.request_id where r.owner_id = v_owner or j.worker_id = v_owner), '[]'::jsonb),
    'job_change_requests', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.job_change_requests c
      where nestscout_private.job_change_participant(c.job_id, v_owner)), '[]'::jsonb),
    'saved_workers', coalesce((select jsonb_agg(jsonb_build_object('profile_id', s.profile_id, 'created_at', s.created_at) order by s.created_at)
      from public.customer_saved_workers s where s.customer_id = v_owner), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from public.notifications n where n.recipient_id = v_owner), '[]'::jsonb),
    'support_requests', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from public.support_requests s where s.owner_id = v_owner), '[]'::jsonb),
    'kael_conversations', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'mode', c.mode, 'updated_at', c.updated_at,
        'messages', coalesce((select jsonb_agg(jsonb_build_object('seq', m.seq, 'role', m.role, 'content', m.content, 'created_at', m.created_at,
            'feedback', (select jsonb_build_object('rating', f.rating, 'reason', f.reason, 'updated_at', f.updated_at)
              from public.kael_message_feedback f where f.message_id = m.id and f.owner_id = v_owner)) order by m.seq)
          from public.kael_messages m where m.conversation_id = c.id), '[]'::jsonb)) order by c.updated_at)
      from public.kael_conversations c where c.owner_id = v_owner), '[]'::jsonb),
    'kael_memory', coalesce((select jsonb_agg(jsonb_build_object('mode', p.mode, 'preference', p.preference, 'value', p.value, 'updated_at', p.updated_at) order by p.mode, p.preference)
      from public.kael_memory_preferences p where p.owner_id = v_owner), '[]'::jsonb),
    'consents', coalesce((select jsonb_agg(jsonb_build_object('purpose', e.purpose, 'granted', e.granted, 'policy_version', e.policy_version, 'recorded_at', e.recorded_at) order by e.id)
      from public.consent_events e where e.user_id = v_owner), '[]'::jsonb),
    'terms_acceptances', coalesce((select jsonb_agg(to_jsonb(t) order by t.accepted_at) from public.terms_acceptances t where t.user_id = v_owner), '[]'::jsonb),
    'account_deletion_request', (select to_jsonb(d) from public.account_deletion_requests d where d.user_id = v_owner)
  );
end;
$$;
