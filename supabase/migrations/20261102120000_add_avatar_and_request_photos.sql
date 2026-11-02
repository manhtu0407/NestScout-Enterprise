insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('request-photos', 'request-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy avatars_select_owner on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create policy avatars_insert_owner on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar'
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create policy avatars_update_owner on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar'
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false')
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar');

create policy avatars_delete_owner on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar'
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create policy request_photos_select_owner on storage.objects
  for select to authenticated
  using (bucket_id = 'request-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create policy request_photos_insert_owner on storage.objects
  for insert to authenticated
  with check (bucket_id = 'request-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 2
    and exists (select 1 from public.service_requests r
      where r.id::text = (storage.foldername(name))[2] and r.owner_id = (select auth.uid()))
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

alter table public.customer_profiles
  add column avatar_path text not null default '' check (avatar_path = '' or avatar_path = user_id::text || '/avatar');

grant select (avatar_path) on public.customer_profiles to authenticated;

create function public.set_customer_avatar(p_has_avatar boolean)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_path text := v_owner::text || '/avatar';
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_has_avatar is null then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  if p_has_avatar and not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = v_path) then
    raise exception using errcode = '22023', message = 'avatar not uploaded';
  end if;
  insert into public.customer_profiles (avatar_path) values (case when p_has_avatar then v_path else '' end)
  on conflict (user_id) do update set avatar_path = excluded.avatar_path;
  return v_owner;
end;
$$;

revoke all on function public.set_customer_avatar(boolean) from public, anon, authenticated;
grant execute on function public.set_customer_avatar(boolean) to authenticated;
grant insert (avatar_path) on public.customer_profiles to authenticated;
grant update (avatar_path) on public.customer_profiles to authenticated;

create table public.request_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  request_id uuid not null references public.service_requests (id),
  path text not null unique check (char_length(path) <= 200),
  created_at timestamptz not null default now()
);
create index request_photos_request on public.request_photos (request_id);

alter table public.request_photos enable row level security;
revoke all on table public.request_photos from public, anon, authenticated;
grant select on table public.request_photos to authenticated;
grant insert (request_id, path) on public.request_photos to authenticated;

create policy request_photos_select_owner on public.request_photos
  for select to authenticated
  using ((select auth.uid()) = owner_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create policy request_photos_insert_owner on public.request_photos
  for insert to authenticated
  with check ((select auth.uid()) = owner_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
    and exists (select 1 from public.service_requests r where r.id = request_id and r.owner_id = (select auth.uid())));

create function public.add_request_photo(p_request_id uuid, p_path text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_id uuid;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_request_id is null or p_path is null or p_path !~ ('^' || v_owner::text || '/' || p_request_id::text || '/[A-Za-z0-9._-]{1,80}$') then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  if not exists (select 1 from public.service_requests r where r.id = p_request_id) then
    raise exception using errcode = '42501', message = 'request unavailable';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'request-photos' and o.name = p_path) then
    raise exception using errcode = '22023', message = 'photo not uploaded';
  end if;
  select id into v_id from public.request_photos where path = p_path;
  if v_id is not null then
    return v_id;
  end if;
  if (select count(*) from public.request_photos where request_id = p_request_id) >= 6 then
    raise exception using errcode = '22023', message = 'too many photos';
  end if;
  insert into public.request_photos (request_id, path) values (p_request_id, p_path) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.add_request_photo(uuid, text) from public, anon, authenticated;
grant execute on function public.add_request_photo(uuid, text) to authenticated;
