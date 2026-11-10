insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('worker-payout-qr', 'worker-payout-qr', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy worker_payout_qr_select_owner on storage.objects
  for select to authenticated
  using (bucket_id = 'worker-payout-qr' and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select nestscout_private.current_worker_eligible()));

create policy worker_payout_qr_insert_owner on storage.objects
  for insert to authenticated
  with check (bucket_id = 'worker-payout-qr' and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and (select nestscout_private.current_worker_eligible()));

create policy worker_payout_qr_delete_owner on storage.objects
  for delete to authenticated
  using (bucket_id = 'worker-payout-qr' and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select nestscout_private.current_worker_eligible()));

create table public.worker_payout_accounts (
  worker_id uuid primary key references auth.users (id) on delete cascade,
  bank_code text not null check (bank_code ~ '^[A-Z0-9]{2,12}$'),
  bank_name text not null check (bank_name = btrim(bank_name) and char_length(bank_name) between 2 and 80),
  account_number text not null check (account_number ~ '^[0-9]{6,19}$'),
  account_holder text not null check (account_holder ~ '^[A-Z]+( [A-Z]+)*$' and char_length(account_holder) between 2 and 60),
  qr_path text not null check (qr_path like worker_id::text || '/%'),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index worker_payout_accounts_qr on public.worker_payout_accounts (qr_path);

alter table public.worker_payout_accounts enable row level security;
revoke all on table public.worker_payout_accounts from public, anon, authenticated;

create function nestscout_private.set_worker_payout_account(p_bank_code text, p_bank_name text, p_account_number text, p_account_holder text, p_qr_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
  v_bank_name text := btrim(coalesce(p_bank_name, ''));
  v_number text := regexp_replace(coalesce(p_account_number, ''), '\s', '', 'g');
  v_holder text := regexp_replace(btrim(coalesce(p_account_holder, '')), '\s+', ' ', 'g');
  v_previous text;
begin
  v_worker := nestscout_private.lock_current_worker();
  if p_bank_code is null or p_bank_code !~ '^[A-Z0-9]{2,12}$' or char_length(v_bank_name) not between 2 and 80
    or v_number !~ '^[0-9]{6,19}$' or v_holder !~ '^[A-Z]+( [A-Z]+)*$' or char_length(v_holder) not between 2 and 60
    or p_qr_path is null or p_qr_path not like v_worker::text || '/%' or p_qr_path like v_worker::text || '/%/%' then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'worker-payout-qr' and o.name = p_qr_path) then
    raise exception using errcode = '22023', message = 'file not found';
  end if;
  select a.qr_path into v_previous from public.worker_payout_accounts a where a.worker_id = v_worker for update;
  insert into public.worker_payout_accounts (worker_id, bank_code, bank_name, account_number, account_holder, qr_path)
  values (v_worker, p_bank_code, v_bank_name, v_number, v_holder, p_qr_path)
  on conflict (worker_id) do update set
    bank_code = excluded.bank_code, bank_name = excluded.bank_name, account_number = excluded.account_number,
    account_holder = excluded.account_holder, qr_path = excluded.qr_path, status = 'pending', updated_at = now();
  if v_previous is not null and v_previous <> p_qr_path then
    return v_previous;
  end if;
  return null;
end;
$$;
revoke all on function nestscout_private.set_worker_payout_account(text, text, text, text, text) from public, anon, authenticated;
grant execute on function nestscout_private.set_worker_payout_account(text, text, text, text, text) to authenticated;

create function public.set_worker_payout_account(p_bank_code text, p_bank_name text, p_account_number text, p_account_holder text, p_qr_path text)
returns text language sql security invoker set search_path = ''
as $$ select nestscout_private.set_worker_payout_account(p_bank_code, p_bank_name, p_account_number, p_account_holder, p_qr_path); $$;
revoke all on function public.set_worker_payout_account(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.set_worker_payout_account(text, text, text, text, text) to authenticated;

create function nestscout_private.remove_worker_payout_account()
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
  delete from public.worker_payout_accounts where worker_id = v_worker returning qr_path into v_path;
  return v_path;
end;
$$;
revoke all on function nestscout_private.remove_worker_payout_account() from public, anon, authenticated;
grant execute on function nestscout_private.remove_worker_payout_account() to authenticated;

create function public.remove_worker_payout_account()
returns text language sql security invoker set search_path = ''
as $$ select nestscout_private.remove_worker_payout_account(); $$;
revoke all on function public.remove_worker_payout_account() from public, anon, authenticated;
grant execute on function public.remove_worker_payout_account() to authenticated;

create function nestscout_private.my_worker_payout_account()
returns table (bank_code text, bank_name text, account_number text, account_holder text, qr_path text, status text, updated_at timestamptz)
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
  select a.bank_code, a.bank_name, a.account_number, a.account_holder, a.qr_path, a.status, a.updated_at
  from public.worker_payout_accounts a where a.worker_id = auth.uid();
end;
$$;
revoke all on function nestscout_private.my_worker_payout_account() from public, anon, authenticated;
grant execute on function nestscout_private.my_worker_payout_account() to authenticated;

create function public.my_worker_payout_account()
returns table (bank_code text, bank_name text, account_number text, account_holder text, qr_path text, status text, updated_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from nestscout_private.my_worker_payout_account(); $$;
revoke all on function public.my_worker_payout_account() from public, anon, authenticated;
grant execute on function public.my_worker_payout_account() to authenticated;

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
