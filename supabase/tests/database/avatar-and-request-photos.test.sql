begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated');
insert into public.service_requests (id, owner_id, submission_key, description) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-000000000001', 'Sửa vòi nước'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b2', '20000000-0000-4000-8000-000000000002', 'Yêu cầu của người khác');

select is((select public from storage.buckets where id = 'avatars'), false, 'The avatar bucket is private');
select is((select public from storage.buckets where id = 'request-photos'), false, 'The request photo bucket is private');
select is((select file_size_limit from storage.buckets where id = 'avatars'), 5242880::bigint, 'Avatars are limited to 5 MiB');
select is((select allowed_mime_types from storage.buckets where id = 'request-photos'), array['image/jpeg', 'image/png', 'image/webp'], 'Request photos accept only common image types');
select ok((select relrowsecurity from pg_class where oid = 'public.request_photos'::regclass), 'Request photos use row security');
select ok(not has_table_privilege('authenticated', 'public.request_photos', 'update')
  and not has_table_privilege('authenticated', 'public.request_photos', 'delete'), 'Clients cannot edit or delete photo rows');
select ok(not has_function_privilege('anon', 'public.set_customer_avatar(boolean)', 'execute'), 'Anonymous role cannot set an avatar');
select ok(not has_function_privilege('anon', 'public.add_request_photo(uuid,text)', 'execute'), 'Anonymous role cannot attach a photo');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select throws_ok($$select public.set_customer_avatar(true)$$, '22023', 'avatar not uploaded', 'An avatar cannot be set before the image exists');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-4000-8000-0000000000a1/avatar')$$, 'The owner uploads their avatar');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-4000-8000-0000000000b2/avatar')$$, '42501', null, 'The owner cannot upload into another account folder');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-4000-8000-0000000000a1/other')$$, '42501', null, 'Only the fixed avatar name is allowed');
select is(public.set_customer_avatar(true), '00000000-0000-4000-8000-0000000000a1'::uuid, 'The avatar is attached to the profile');
select is((select avatar_path from public.customer_profiles), '00000000-0000-4000-8000-0000000000a1/avatar', 'The profile stores the avatar path');
select lives_ok($$select public.save_customer_profile('Tú', '', '')$$, 'Saving the profile text keeps the avatar');
select is((select avatar_path from public.customer_profiles), '00000000-0000-4000-8000-0000000000a1/avatar', 'The avatar survives a text change');
select is((select count(*)::integer from storage.objects where bucket_id = 'avatars'), 1, 'The owner reads their own avatar');
select throws_ok($$delete from storage.objects where bucket_id = 'avatars' and name = '00000000-0000-4000-8000-0000000000a1/avatar'$$, '42501', null, 'Files are removed through the Storage API, never by direct SQL');
select is(public.set_customer_avatar(false), '00000000-0000-4000-8000-0000000000a1'::uuid, 'The avatar is cleared from the profile');
select is((select avatar_path from public.customer_profiles), '', 'The profile no longer points at an avatar');
select throws_ok($$select public.set_customer_avatar(null)$$, '22023', 'invalid request', 'A missing flag is rejected');

select lives_ok($$insert into storage.objects (bucket_id, name) values ('request-photos', '00000000-0000-4000-8000-0000000000a1/10000000-0000-4000-8000-000000000001/one.jpg')$$, 'The owner uploads a photo for their request');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('request-photos', '00000000-0000-4000-8000-0000000000a1/10000000-0000-4000-8000-000000000002/one.jpg')$$, '42501', null, 'A photo cannot be uploaded for a request the owner does not hold');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('request-photos', '00000000-0000-4000-8000-0000000000a1/loose.jpg')$$, '42501', null, 'A photo must sit under a request folder');
select isnt(public.add_request_photo('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1/10000000-0000-4000-8000-000000000001/one.jpg'), null, 'The photo is attached to the request');
select lives_ok($$select public.add_request_photo('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1/10000000-0000-4000-8000-000000000001/one.jpg')$$, 'Attaching twice is harmless');
select is((select count(*)::integer from public.request_photos), 1, 'A photo is attached once');
select throws_ok($$select public.add_request_photo('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1/10000000-0000-4000-8000-000000000001/missing.jpg')$$, '22023', 'photo not uploaded', 'A photo that was never uploaded is rejected');
select throws_ok($$select public.add_request_photo('10000000-0000-4000-8000-000000000001', '../escape')$$, '22023', 'invalid request', 'A path outside the request folder is rejected');
select throws_ok($$select public.add_request_photo('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1/10000000-0000-4000-8000-000000000002/one.jpg')$$, '42501', 'request unavailable', 'A photo cannot be attached to another request');

select lives_ok($$insert into storage.objects (bucket_id, name) select 'request-photos', '00000000-0000-4000-8000-0000000000a1/10000000-0000-4000-8000-000000000001/p' || n || '.jpg' from generate_series(2, 7) n$$, 'More objects can be uploaded');
select lives_ok($$select public.add_request_photo('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1/10000000-0000-4000-8000-000000000001/p' || n || '.jpg') from generate_series(2, 6) n$$, 'Up to six photos are attached');
select throws_ok($$select public.add_request_photo('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1/10000000-0000-4000-8000-000000000001/p7.jpg')$$, '22023', 'too many photos', 'A seventh photo is rejected');

select lives_ok($$insert into storage.objects (bucket_id, name) select 'request-photos', '00000000-0000-4000-8000-0000000000a1/10000000-0000-4000-8000-000000000001/p' || n || '.jpg' from generate_series(8, 12) n$$, 'Twelve objects fit in one request folder');
select is((select count(*)::integer from storage.objects where bucket_id = 'request-photos'), 12, 'The request folder now holds twelve objects');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('request-photos', '00000000-0000-4000-8000-0000000000a1/10000000-0000-4000-8000-000000000001/p13.jpg')$$, '42501', null, 'A thirteenth raw upload for one request is refused');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is_empty($$select 1 from public.request_photos$$, 'Another customer does not see the photo rows');
select is_empty($$select 1 from storage.objects where bucket_id = 'request-photos'$$, 'Another customer does not see the photo files');
select throws_ok($$select public.add_request_photo('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2/10000000-0000-4000-8000-000000000001/x.jpg')$$, '42501', 'request unavailable', 'Another customer cannot attach to the request');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select public.set_customer_avatar(false)$$, '42501', 'authentication required', 'An anonymous session cannot set an avatar');
select throws_ok($$select public.add_request_photo('10000000-0000-4000-8000-000000000001', 'x')$$, '42501', 'authentication required', 'An anonymous session cannot attach a photo');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-4000-8000-0000000000a1/avatar')$$, '42501', null, 'An anonymous session cannot upload an avatar');
reset role;

select * from finish();
rollback;
