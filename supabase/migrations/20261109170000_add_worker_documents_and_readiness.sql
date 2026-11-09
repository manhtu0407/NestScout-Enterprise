insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('worker-documents', 'worker-documents', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy worker_documents_select_owner on storage.objects
  for select to authenticated
  using (bucket_id = 'worker-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select nestscout_private.current_worker_eligible()));

create policy worker_documents_insert_owner on storage.objects
  for insert to authenticated
  with check (bucket_id = 'worker-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and (select nestscout_private.current_worker_eligible()));

create policy worker_documents_delete_owner on storage.objects
  for delete to authenticated
  using (bucket_id = 'worker-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select nestscout_private.current_worker_eligible()));

create table public.worker_documents (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('identity', 'qualification', 'portfolio')),
  title text not null check (title = btrim(title) and char_length(title) between 1 and 80),
  path text not null check (path like worker_id::text || '/%'),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now()
);
create unique index worker_documents_path on public.worker_documents (path);
create index worker_documents_worker_kind on public.worker_documents (worker_id, kind);

alter table public.worker_documents enable row level security;
revoke all on table public.worker_documents from public, anon, authenticated;

create function nestscout_private.worker_missing_items(p_worker uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.worker_public_profiles%rowtype;
  v_missing text[] := '{}';
begin
  select * into v_profile from public.worker_public_profiles p where p.worker_id = p_worker;
  if not found then
    return array['profile'];
  end if;
  if char_length(btrim(v_profile.about)) = 0 then
    v_missing := array_append(v_missing, 'about');
  end if;
  if cardinality(v_profile.skills) = 0 then
    v_missing := array_append(v_missing, 'skills');
  end if;
  if cardinality(v_profile.service_ids) = 0 then
    v_missing := array_append(v_missing, 'services');
  end if;
  if not exists (select 1 from public.worker_documents d where d.worker_id = p_worker and d.kind = 'identity' and d.status <> 'rejected') then
    v_missing := array_append(v_missing, 'identity');
  end if;
  return v_missing;
end;
$$;
revoke all on function nestscout_private.worker_missing_items(uuid) from public, anon, authenticated;

create function nestscout_private.add_worker_document(p_kind text, p_path text, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_limit integer;
  v_id uuid;
begin
  v_worker := nestscout_private.lock_current_worker();
  if p_kind is null or p_kind not in ('identity', 'qualification', 'portfolio') or p_path is null
    or char_length(v_title) not between 1 and 80 or p_path not like v_worker::text || '/%' or p_path like v_worker::text || '/%/%' then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'worker-documents' and o.name = p_path) then
    raise exception using errcode = '22023', message = 'file not found';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('worker_documents:' || v_worker::text, 0));
  select d.id into v_id from public.worker_documents d where d.path = p_path;
  if v_id is not null then
    return v_id;
  end if;
  v_limit := case p_kind when 'identity' then 2 when 'qualification' then 10 else 6 end;
  if (select count(*) from public.worker_documents d where d.worker_id = v_worker and d.kind = p_kind) >= v_limit then
    raise exception using errcode = '22023', message = 'document limit';
  end if;
  insert into public.worker_documents (worker_id, kind, title, path) values (v_worker, p_kind, v_title, p_path) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function nestscout_private.add_worker_document(text, text, text) from public, anon, authenticated;
grant execute on function nestscout_private.add_worker_document(text, text, text) to authenticated;

create function public.add_worker_document(p_kind text, p_path text, p_title text)
returns uuid language sql security invoker set search_path = ''
as $$ select nestscout_private.add_worker_document(p_kind, p_path, p_title); $$;
revoke all on function public.add_worker_document(text, text, text) from public, anon, authenticated;
grant execute on function public.add_worker_document(text, text, text) to authenticated;

create function nestscout_private.remove_worker_document(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
  v_path text;
begin
  v_worker := nestscout_private.lock_current_worker();
  if p_id is null then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  delete from public.worker_documents where id = p_id and worker_id = v_worker returning path into v_path;
  return v_path;
end;
$$;
revoke all on function nestscout_private.remove_worker_document(uuid) from public, anon, authenticated;
grant execute on function nestscout_private.remove_worker_document(uuid) to authenticated;

create function public.remove_worker_document(p_id uuid)
returns text language sql security invoker set search_path = ''
as $$ select nestscout_private.remove_worker_document(p_id); $$;
revoke all on function public.remove_worker_document(uuid) from public, anon, authenticated;
grant execute on function public.remove_worker_document(uuid) to authenticated;

create or replace function nestscout_private.set_worker_accepting(p_accepting boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
  v_id uuid;
begin
  v_worker := nestscout_private.lock_current_worker();
  if p_accepting is null then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  if p_accepting and cardinality(nestscout_private.worker_missing_items(v_worker)) > 0 then
    raise exception using errcode = '22023', message = 'profile incomplete';
  end if;
  update public.worker_public_profiles set accepting_jobs = p_accepting where worker_id = v_worker returning id into v_id;
  if v_id is null then
    raise exception using errcode = '22023', message = 'profile required';
  end if;
  return p_accepting;
end;
$$;

alter table public.worker_public_profiles alter column accepting_jobs set default false;
update public.worker_public_profiles p set accepting_jobs = false
where p.accepting_jobs and cardinality(nestscout_private.worker_missing_items(p.worker_id)) > 0;

drop function public.my_worker_profile();
drop function nestscout_private.my_worker_profile();

create function nestscout_private.my_worker_profile()
returns table (
  profile_id uuid, display_name text, trade text, area text, experience_years integer, skills text[], about text, radius_km integer,
  accepting_jobs boolean, service_ids text[], listed boolean, certificates jsonb, review_count integer, rating_average numeric,
  completed_jobs integer, strengths jsonb, reviews jsonb, documents jsonb, missing_items text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not nestscout_private.current_worker_eligible() then
    raise exception using errcode = '42501', message = 'worker unavailable';
  end if;
  return query
  select p.id, p.display_name, p.trade, p.area, p.experience_years, p.skills, p.about, p.radius_km, p.accepting_jobs, p.service_ids, p.listed,
    coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'status', c.status) order by c.created_at, c.id)
      from public.worker_certificates c where c.worker_id = p.worker_id), '[]'::jsonb),
    (select count(*)::integer from public.worker_reviews r where r.profile_id = p.id),
    coalesce((select round(avg(r.rating), 1) from public.worker_reviews r where r.profile_id = p.id), 0),
    (select count(*)::integer from public.service_jobs j where j.worker_id = p.worker_id and j.stage = 'completed'),
    coalesce((select jsonb_agg(jsonb_build_object('label', t.tag, 'count', t.n) order by t.n desc, t.tag)
      from (select u.tag, count(*)::integer as n from public.worker_reviews r cross join lateral unnest(r.tags) as u(tag)
        where r.profile_id = p.id group by u.tag order by count(*) desc, u.tag limit 5) t), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'author', l.author_label, 'service', l.service_label,
        'text', l.body, 'created_at', l.created_at) order by l.created_at desc, l.id)
      from (select r.id, r.author_label, r.service_label, r.body, r.created_at from public.worker_reviews r
        where r.profile_id = p.id order by r.created_at desc, r.id limit 20) l), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'title', d.title, 'status', d.status, 'path', d.path) order by d.created_at, d.id)
      from public.worker_documents d where d.worker_id = p.worker_id), '[]'::jsonb),
    nestscout_private.worker_missing_items(p.worker_id)
  from public.worker_public_profiles p
  where p.worker_id = auth.uid();
end;
$$;
revoke all on function nestscout_private.my_worker_profile() from public, anon, authenticated;
grant execute on function nestscout_private.my_worker_profile() to authenticated;

create function public.my_worker_profile()
returns table (
  profile_id uuid, display_name text, trade text, area text, experience_years integer, skills text[], about text, radius_km integer,
  accepting_jobs boolean, service_ids text[], listed boolean, certificates jsonb, review_count integer, rating_average numeric,
  completed_jobs integer, strengths jsonb, reviews jsonb, documents jsonb, missing_items text[]
)
language sql stable security invoker set search_path = ''
as $$ select * from nestscout_private.my_worker_profile(); $$;
revoke all on function public.my_worker_profile() from public, anon, authenticated;
grant execute on function public.my_worker_profile() to authenticated;

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
  delete from public.customer_saved_workers where customer_id = p_user;
  delete from public.customer_settings where user_id = p_user;
  delete from public.customer_profiles where user_id = p_user;
  delete from public.support_requests where owner_id = p_user;
  delete from public.notifications where recipient_id = p_user;
  update auth.users set banned_until = 'infinity'::timestamptz where id = p_user;
end;
$$;

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
        'messages', coalesce((select jsonb_agg(jsonb_build_object('seq', m.seq, 'role', m.role, 'content', m.content, 'created_at', m.created_at) order by m.seq)
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
