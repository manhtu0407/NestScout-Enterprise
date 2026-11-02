create function nestscout_private.request_photo_upload_count(p_request text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from storage.objects o
  where o.bucket_id = 'request-photos'
    and (storage.foldername(o.name))[1] = auth.uid()::text
    and (storage.foldername(o.name))[2] = p_request;
$$;

revoke all on function nestscout_private.request_photo_upload_count(text) from public, anon, authenticated;
grant execute on function nestscout_private.request_photo_upload_count(text) to authenticated;

drop policy request_photos_insert_owner on storage.objects;

create policy request_photos_insert_owner on storage.objects
  for insert to authenticated
  with check (bucket_id = 'request-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 2
    and exists (select 1 from public.service_requests r
      where r.id::text = (storage.foldername(name))[2] and r.owner_id = (select auth.uid()))
    and nestscout_private.request_photo_upload_count((storage.foldername(name))[2]) < 12
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');
