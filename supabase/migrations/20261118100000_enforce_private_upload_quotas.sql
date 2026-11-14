create table nestscout_private.storage_upload_counters (
  bucket_id text not null check (bucket_id in ('request-photos', 'worker-documents', 'worker-payout-qr')),
  owner_id uuid not null,
  scope text not null,
  object_count integer not null check (object_count >= 0),
  primary key (bucket_id, owner_id, scope),
  check (
    (bucket_id = 'request-photos' and scope ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    or (bucket_id in ('worker-documents', 'worker-payout-qr') and scope = '')
  )
);

revoke all on table nestscout_private.storage_upload_counters from public, anon, authenticated, service_role;

insert into nestscout_private.storage_upload_counters (bucket_id, owner_id, scope, object_count)
select bucket_id, owner_text::uuid, scope, object_count
from (
  select o.bucket_id,
    (storage.foldername(o.name))[1] as owner_text,
    case when o.bucket_id = 'request-photos' then (storage.foldername(o.name))[2] else '' end as scope,
    count(*)::integer as object_count
  from storage.objects o
  where o.bucket_id in ('request-photos', 'worker-documents', 'worker-payout-qr')
  group by o.bucket_id, (storage.foldername(o.name))[1],
    case when o.bucket_id = 'request-photos' then (storage.foldername(o.name))[2] else '' end
) existing
where owner_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (
    (bucket_id = 'request-photos' and scope ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    or (bucket_id in ('worker-documents', 'worker-payout-qr') and scope = '')
  );

drop policy request_photos_insert_owner on storage.objects;
drop policy worker_documents_insert_owner on storage.objects;
drop policy worker_payout_qr_insert_owner on storage.objects;
drop function if exists nestscout_private.request_photo_upload_count(text);
drop function if exists nestscout_private.worker_upload_count(text);

create function nestscout_private.reserve_storage_upload()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_folders text[];
  v_old_folders text[];
  v_owner uuid;
  v_scope text;
  v_limit integer;
  v_count integer;
  v_new_key text;
  v_old_key text;
  v_first_key text;
  v_second_key text;
  v_old_owner uuid;
  v_old_scope text;
begin
  if new.bucket_id in ('request-photos', 'worker-documents', 'worker-payout-qr') then
    v_folders := storage.foldername(new.name);
    if v_folders is null or array_length(v_folders, 1) < 1
      or v_folders[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode = '42501', message = 'invalid upload path';
    end if;
    v_owner := v_folders[1]::uuid;
    if new.bucket_id = 'request-photos' then
      v_scope := v_folders[2];
      v_limit := 12;
      if array_length(v_folders, 1) <> 2
        or v_scope is null
        or v_scope !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception using errcode = '42501', message = 'invalid upload path';
      end if;
    else
      v_scope := '';
      v_limit := case new.bucket_id when 'worker-documents' then 18 else 2 end;
      if array_length(v_folders, 1) <> 1 then
        raise exception using errcode = '42501', message = 'invalid upload path';
      end if;
    end if;
    v_new_key := new.bucket_id || ':' || v_owner::text || ':' || v_scope;
  end if;

  if tg_op = 'UPDATE' then
    if old.bucket_id in ('request-photos', 'worker-documents', 'worker-payout-qr') then
      v_old_folders := storage.foldername(old.name);
      if v_old_folders is not null and array_length(v_old_folders, 1) >= 1
        and v_old_folders[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_old_owner := v_old_folders[1]::uuid;
        if old.bucket_id = 'request-photos' then
          v_old_scope := v_old_folders[2];
          if v_old_scope is not null
            and v_old_scope ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
            v_old_key := old.bucket_id || ':' || v_old_owner::text || ':' || v_old_scope;
          end if;
        else
          v_old_scope := '';
          v_old_key := old.bucket_id || ':' || v_old_owner::text || ':' || v_old_scope;
        end if;
      end if;
    end if;
  end if;
  if v_new_key is not distinct from v_old_key then
    return new;
  end if;

  if v_new_key is not null and v_old_key is not null then
    v_first_key := least(v_new_key, v_old_key);
    v_second_key := greatest(v_new_key, v_old_key);
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-quota:' || v_first_key, 0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-quota:' || v_second_key, 0));
  elsif v_new_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-quota:' || v_new_key, 0));
  elsif v_old_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-quota:' || v_old_key, 0));
  end if;

  if v_new_key is not null then
    insert into nestscout_private.storage_upload_counters (bucket_id, owner_id, scope, object_count)
    values (new.bucket_id, v_owner, v_scope, 1)
    on conflict (bucket_id, owner_id, scope) do update
      set object_count = nestscout_private.storage_upload_counters.object_count + 1
      where nestscout_private.storage_upload_counters.object_count < v_limit
    returning object_count into v_count;
    if not found then
      raise exception using errcode = '42501', message = 'upload quota exceeded';
    end if;
  end if;

  if v_old_key is not null then
    update nestscout_private.storage_upload_counters
    set object_count = object_count - 1
    where bucket_id = old.bucket_id and owner_id = v_old_owner and scope = v_old_scope and object_count > 0;
    if not found then
      raise exception using errcode = '55000', message = 'upload quota state unavailable';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function nestscout_private.reserve_storage_upload() from public, anon, authenticated, service_role;

create trigger storage_upload_quota_reserve
  after insert on storage.objects
  for each row execute function nestscout_private.reserve_storage_upload();

create trigger storage_upload_quota_move
  after update of bucket_id, name on storage.objects
  for each row execute function nestscout_private.reserve_storage_upload();

create function nestscout_private.release_storage_upload()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_folders text[];
  v_owner uuid;
  v_scope text;
begin
  if old.bucket_id not in ('request-photos', 'worker-documents', 'worker-payout-qr') then
    return old;
  end if;
  v_folders := storage.foldername(old.name);
  if v_folders is null or array_length(v_folders, 1) < 1
    or v_folders[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return old;
  end if;
  v_owner := v_folders[1]::uuid;
  v_scope := case when old.bucket_id = 'request-photos' then v_folders[2] else '' end;
  if v_scope is null then
    return old;
  end if;
  update nestscout_private.storage_upload_counters
  set object_count = object_count - 1
  where bucket_id = old.bucket_id and owner_id = v_owner and scope = v_scope and object_count > 0;
  if not found then
    raise exception using errcode = '55000', message = 'upload quota state unavailable';
  end if;
  return old;
end;
$$;

revoke all on function nestscout_private.release_storage_upload() from public, anon, authenticated, service_role;

create trigger storage_upload_quota_release
  after delete on storage.objects
  for each row execute function nestscout_private.release_storage_upload();

create policy request_photos_insert_owner on storage.objects
  for insert to authenticated
  with check (bucket_id = 'request-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 2
    and exists (select 1 from public.service_requests r
      where r.id::text = (storage.foldername(name))[2] and r.owner_id = (select auth.uid()))
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create policy worker_documents_insert_owner on storage.objects
  for insert to authenticated
  with check (bucket_id = 'worker-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and (select nestscout_private.current_worker_eligible()));

create policy worker_payout_qr_insert_owner on storage.objects
  for insert to authenticated
  with check (bucket_id = 'worker-payout-qr' and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and (select nestscout_private.current_worker_eligible()));

revoke insert on table public.request_photos from public, anon, authenticated;
revoke insert (request_id, path) on table public.request_photos from public, anon, authenticated;

create or replace function nestscout_private.add_request_photo(p_request_id uuid, p_path text)
returns uuid
language plpgsql
security definer
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
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('request-photo-rows:' || v_owner::text || ':' || p_request_id::text, 0)
  );
  if not exists (select 1 from public.service_requests r where r.id = p_request_id and r.owner_id = v_owner) then
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

revoke all on function nestscout_private.add_request_photo(uuid, text) from public, anon, authenticated;
grant execute on function nestscout_private.add_request_photo(uuid, text) to authenticated;

create or replace function public.add_request_photo(p_request_id uuid, p_path text)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select nestscout_private.add_request_photo(p_request_id, p_path); $$;

revoke all on function public.add_request_photo(uuid, text) from public, anon, authenticated;
grant execute on function public.add_request_photo(uuid, text) to authenticated;
