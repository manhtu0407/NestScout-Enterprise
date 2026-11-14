begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated');
insert into public.worker_access_grants (user_id) values
  ('00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000000c3'),
  ('00000000-0000-4000-8000-0000000000d4');
insert into storage.objects (bucket_id, name)
select 'worker-documents', '00000000-0000-4000-8000-0000000000b2/orphan-' || n || '.jpg'
from generate_series(1, 16) n;
insert into storage.objects (bucket_id, name) values ('worker-payout-qr', '00000000-0000-4000-8000-0000000000b2/old-qr.jpg');
insert into storage.objects (bucket_id, name) values ('worker-documents', '00000000-0000-4000-8000-0000000000b2/preexisting-17.jpg');
delete from nestscout_private.storage_upload_counters
where owner_id = '00000000-0000-4000-8000-0000000000b2'
  and bucket_id in ('worker-documents', 'worker-payout-qr');
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
select is((select object_count from nestscout_private.storage_upload_counters where bucket_id = 'worker-documents' and owner_id = '00000000-0000-4000-8000-0000000000b2' and scope = ''), 17, 'The backfill query reconstructs the count from existing Worker objects');
select is((select object_count from nestscout_private.storage_upload_counters where bucket_id = 'worker-payout-qr' and owner_id = '00000000-0000-4000-8000-0000000000b2' and scope = ''), 1, 'The backfill query reconstructs the count from an existing payout QR');
select lives_ok($$insert into storage.objects (id, bucket_id, name)
  select id, bucket_id, name from storage.objects where bucket_id = 'worker-documents' and name = '00000000-0000-4000-8000-0000000000b2/orphan-1.jpg'
  on conflict (id) do update set bucket_id = excluded.bucket_id, name = excluded.name, updated_at = now()$$,
  'An ON CONFLICT update at the migration backfill count does not reserve a second quota slot');
select is((select object_count from nestscout_private.storage_upload_counters where bucket_id = 'worker-documents' and owner_id = '00000000-0000-4000-8000-0000000000b2' and scope = ''), 17,
  'An ON CONFLICT update leaves the Worker document counter unchanged');
insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active) values
  ('00000000-0000-4000-8000-0000000000b2', 'local_fixture', true),
  ('00000000-0000-4000-8000-0000000000c3', 'local_fixture', true),
  ('00000000-0000-4000-8000-0000000000d4', 'local_fixture', false);
insert into public.customer_profiles (user_id, display_name) values ('00000000-0000-4000-8000-0000000000a1', 'Nguyễn Văn Tú');

select ok(not has_function_privilege('anon', 'public.my_worker_profile()', 'execute'), 'Anonymous role cannot read a worker profile');
select ok(not has_function_privilege('anon', 'public.save_worker_profile(text,text,text,integer,text,text[])', 'execute'), 'Anonymous role cannot save a worker profile');
select ok(not has_function_privilege('anon', 'public.save_worker_coverage(integer,text[])', 'execute'), 'Anonymous role cannot save coverage');
select ok(not has_function_privilege('anon', 'public.set_worker_accepting(boolean)', 'execute'), 'Anonymous role cannot change availability');
select ok(not has_function_privilege('anon', 'public.add_worker_certificate(text)', 'execute'), 'Anonymous role cannot add a certificate');
select ok(not has_function_privilege('anon', 'public.remove_worker_certificate(uuid)', 'execute'), 'Anonymous role cannot remove a certificate');
select ok(not has_table_privilege('authenticated', 'public.worker_certificates', 'select'), 'Clients cannot read certificates directly');
select ok(not has_table_privilege('authenticated', 'public.worker_certificates', 'update'), 'Clients cannot change a certificate status');
select ok(not has_table_privilege('authenticated', 'public.worker_public_profiles', 'update'), 'Clients cannot update profiles directly');
select ok(exists (select 1 from pg_trigger where tgrelid = 'storage.objects'::regclass and tgname = 'storage_upload_quota_reserve' and not tgisinternal)
  and position('on conflict' in lower(pg_get_functiondef('nestscout_private.reserve_storage_upload()'::regprocedure))) > 0,
  'Worker Storage quotas reserve slots through an atomic insert trigger');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
select throws_ok($$select * from public.my_worker_profile()$$, '42501', 'worker unavailable', 'A worker without dispatch eligibility cannot read a profile');
select throws_ok($$select public.save_worker_profile('Thợ', 'Thợ nước', 'Quận 1', 3, '', array[]::text[])$$, '42501', 'worker unavailable', 'A worker without dispatch eligibility cannot save a profile');
select throws_ok($$select public.add_worker_certificate('Chứng chỉ')$$, '42501', 'worker unavailable', 'A worker without dispatch eligibility cannot add a certificate');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select * from public.my_worker_profile()$$, '42501', 'worker unavailable', 'A customer without a worker grant cannot read a worker profile');
select throws_ok($$select public.set_worker_accepting(true)$$, '42501', 'worker unavailable', 'A customer cannot change worker availability');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select * from public.my_worker_profile()$$, '42501', 'worker unavailable', 'An anonymous session cannot read a worker profile');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);

select lives_ok($$insert into storage.objects (bucket_id, name) values ('worker-documents', '00000000-0000-4000-8000-0000000000b2/orphan-18.jpg')$$,
  'A Worker can upload up to eighteen document objects even before metadata is attached');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('worker-documents', '00000000-0000-4000-8000-0000000000b2/orphan-19.jpg')$$,
  '42501', null, 'A nineteenth raw document upload is refused by Storage policy');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('worker-payout-qr', '00000000-0000-4000-8000-0000000000b2/new-qr.jpg')$$,
  'A Worker can upload a replacement payout QR while the previous image remains');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('worker-payout-qr', '00000000-0000-4000-8000-0000000000b2/extra-qr.jpg')$$,
  '42501', null, 'A third raw payout QR upload is refused by Storage policy');

reset role;
select is((select object_count from nestscout_private.storage_upload_counters where bucket_id = 'worker-documents' and owner_id = '00000000-0000-4000-8000-0000000000b2' and scope = ''), 18, 'A refused Worker document consumes no quota');
select is((select object_count from nestscout_private.storage_upload_counters where bucket_id = 'worker-payout-qr' and owner_id = '00000000-0000-4000-8000-0000000000b2' and scope = ''), 2, 'A refused payout QR consumes no quota');select lives_ok($$insert into storage.objects (id, bucket_id, name)
  select id, bucket_id, name from storage.objects where bucket_id = 'worker-documents' and name = '00000000-0000-4000-8000-0000000000b2/orphan-1.jpg'
  on conflict (id) do update set bucket_id = excluded.bucket_id, name = excluded.name, updated_at = now()$$,
  'An ON CONFLICT update at quota does not exceed the Worker document limit');
select is((select object_count from nestscout_private.storage_upload_counters where bucket_id = 'worker-documents' and owner_id = '00000000-0000-4000-8000-0000000000b2' and scope = ''), 18,
  'An ON CONFLICT update at quota preserves the existing counter');
select lives_ok($$update storage.objects set name = '00000000-0000-4000-8000-0000000000b2/moved.jpg'
  where bucket_id = 'worker-documents' and name = '00000000-0000-4000-8000-0000000000b2/orphan-1.jpg'$$,
  'Moving an object within one Worker quota scope succeeds');
select is((select object_count from nestscout_private.storage_upload_counters where bucket_id = 'worker-documents' and owner_id = '00000000-0000-4000-8000-0000000000b2' and scope = ''), 18,
  'A same-owner move does not change the quota counter');
select lives_ok($$update storage.objects set name = '00000000-0000-4000-8000-0000000000c3/moved.jpg'
  where bucket_id = 'worker-documents' and name = '00000000-0000-4000-8000-0000000000b2/moved.jpg'$$,
  'Moving an object to another owner updates the quota scopes');
select is((select object_count from nestscout_private.storage_upload_counters where bucket_id = 'worker-documents' and owner_id = '00000000-0000-4000-8000-0000000000b2' and scope = ''), 17,
  'A cross-owner move releases one slot from the old scope');
select is((select object_count from nestscout_private.storage_upload_counters where bucket_id = 'worker-documents' and owner_id = '00000000-0000-4000-8000-0000000000c3' and scope = ''), 1,
  'A cross-owner move reserves one slot in the new scope');


set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is_empty($$select * from public.my_worker_profile()$$, 'A worker without a profile reads nothing');
select throws_ok($$select public.set_worker_accepting(false)$$, '22023', 'profile required', 'Availability needs a profile');
select throws_ok($$select public.save_worker_coverage(5, array['water'])$$, '22023', 'profile required', 'Coverage needs a profile');

select throws_ok($$select public.save_worker_profile(' ', 'Thợ nước', 'Quận 1', 3, '', array[]::text[])$$, '22023', 'invalid request', 'A blank name is rejected');
select throws_ok($$select public.save_worker_profile('Thợ', '', 'Quận 1', 3, '', array[]::text[])$$, '22023', 'invalid request', 'A blank trade is rejected');
select throws_ok($$select public.save_worker_profile('Thợ', 'Thợ nước', '', 3, '', array[]::text[])$$, '22023', 'invalid request', 'A blank area is rejected');
select throws_ok($$select public.save_worker_profile('Thợ', 'Thợ nước', 'Quận 1', 81, '', array[]::text[])$$, '22023', 'invalid request', 'Too many years of experience are rejected');
select throws_ok($$select public.save_worker_profile('Thợ', 'Thợ nước', 'Quận 1', null, '', array[]::text[])$$, '22023', 'invalid request', 'Missing experience is rejected');
select throws_ok($$select public.save_worker_profile('Thợ', 'Thợ nước', 'Quận 1', 3, repeat('a', 601), array[]::text[])$$, '22023', 'invalid request', 'A long introduction is rejected');
select throws_ok($$select public.save_worker_profile('Thợ', 'Thợ nước', 'Quận 1', 3, '', null)$$, '22023', 'invalid request', 'Missing skills are rejected');
select throws_ok($$select public.save_worker_profile('Thợ', 'Thợ nước', 'Quận 1', 3, '', array[repeat('a', 41)])$$, '22023', 'invalid request', 'A long skill is rejected');
select throws_ok($$select public.save_worker_profile('Thợ', 'Thợ nước', 'Quận 1', 3, '', array[' '])$$, '22023', 'invalid request', 'A blank skill is rejected');
select throws_ok($$select public.save_worker_profile('Thợ', 'Thợ nước', 'Quận 1', 3, '', array['a','b','c','d','e','f','g','h','i','j','k','l','m'])$$, '22023', 'invalid request', 'More than twelve skills are rejected');

select isnt(public.save_worker_profile('  Trần Minh Anh ', ' Thợ điện nước ', ' Quận 7 ', 6, '  Nhận sửa điện nước.  ', array[' Thay vòi ', 'Lắp đèn', 'Thay vòi']), null, 'A worker creates a profile');
select is((select count(*)::integer from public.my_worker_profile()), 1, 'The worker reads back one profile');
select is((select display_name from public.my_worker_profile()), 'Trần Minh Anh', 'The name is trimmed');
select is((select area from public.my_worker_profile()), 'Quận 7', 'The area is trimmed');
select is((select skills from public.my_worker_profile()), array['Thay vòi', 'Lắp đèn'], 'Skills are trimmed, deduplicated and keep their order');
select is((select about from public.my_worker_profile()), 'Nhận sửa điện nước.', 'The introduction is trimmed');
select is((select listed from public.my_worker_profile()), false, 'A worker cannot list themselves');
select is((select accepting_jobs from public.my_worker_profile()), false, 'A new profile does not accept jobs before its readiness items are complete');
select ok(cardinality((select missing_items from public.my_worker_profile())) > 0, 'A new profile reports the readiness items it still misses');
select is((select radius_km from public.my_worker_profile()), 5, 'A new profile covers five kilometres');
select is((select service_ids from public.my_worker_profile()), array[]::text[], 'A new profile has no services');
select is((select to_jsonb(p) ? 'worker_id' from public.my_worker_profile() p), false, 'The profile never exposes the worker account id');

select is(public.save_worker_profile('Trần Minh Anh', 'Thợ điện nước', 'Quận 7', 7, 'Mới.', array['Lắp đèn']), (select profile_id from public.my_worker_profile()), 'Saving again updates the same profile');
select is((select experience_years from public.my_worker_profile()), 7, 'The update is stored');
select is((select skills from public.my_worker_profile()), array['Lắp đèn'], 'The skills are replaced');

select is(public.save_worker_coverage(10, array['water', 'electric', 'water']), (select profile_id from public.my_worker_profile()), 'Coverage is saved');
select is((select radius_km from public.my_worker_profile()), 10, 'The radius is stored');
select is((select service_ids from public.my_worker_profile()), array['electric', 'water'], 'Services are deduplicated and sorted');
select is(public.save_worker_coverage(10, array['water', 'electric']), (select profile_id from public.my_worker_profile()), 'Saving the same coverage again is harmless');
select throws_ok($$select public.save_worker_coverage(4, array['water'])$$, '22023', 'invalid request', 'An unsupported radius is rejected');
select throws_ok($$select public.save_worker_coverage(5, array['plumbing'])$$, '22023', 'invalid request', 'An unknown service is rejected');
select throws_ok($$select public.save_worker_coverage(5, null)$$, '22023', 'invalid request', 'Missing services are rejected');
select is((select radius_km from public.my_worker_profile()), 10, 'A rejected change leaves the coverage alone');

select is(public.set_worker_accepting(false), false, 'A worker pauses new jobs');
select is((select accepting_jobs from public.my_worker_profile()), false, 'The availability is stored');
select throws_ok($$select public.set_worker_accepting(null)$$, '22023', 'invalid request', 'A missing availability is rejected');
select is(public.set_worker_accepting(true), true, 'An eligible fixture Worker can resume test jobs without uploading identity documents');
reset role;
insert into public.worker_documents (worker_id, kind, title, path)
  values ('00000000-0000-4000-8000-0000000000b2', 'identity', 'CCCD', '00000000-0000-4000-8000-0000000000b2/identity.jpg');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is((select missing_items from public.my_worker_profile()), '{}'::text[], 'A pending identity document completes the readiness items');
select is(public.set_worker_accepting(true), true, 'A worker with complete readiness resumes new jobs');

select throws_ok($$select public.add_worker_certificate(' ')$$, '22023', 'invalid request', 'A blank certificate title is rejected');
select throws_ok($$select public.add_worker_certificate(repeat('a', 81))$$, '22023', 'invalid request', 'A long certificate title is rejected');
select isnt(public.add_worker_certificate('  Chứng chỉ an toàn điện '), null, 'A worker adds a certificate');
select is(public.add_worker_certificate('chứng chỉ AN TOÀN điện'), (select (certificates -> 0 ->> 'id')::uuid from public.my_worker_profile()), 'Adding the same title again returns the existing certificate');
select is((select jsonb_array_length(certificates) from public.my_worker_profile()), 1, 'A repeated title is stored once');
select is((select certificates -> 0 ->> 'title' from public.my_worker_profile()), 'Chứng chỉ an toàn điện', 'The title is trimmed');
select is((select certificates -> 0 ->> 'status' from public.my_worker_profile()), 'pending', 'A new certificate is pending verification');
select lives_ok($$select public.add_worker_certificate('Chứng nhận ' || n) from generate_series(1, 9) n$$, 'A worker reaches ten certificates');
select throws_ok($$select public.add_worker_certificate('Chứng nhận 10')$$, '22023', 'certificate limit', 'An eleventh certificate is rejected');
select is(public.add_worker_certificate('Chứng nhận 1'), (select (c ->> 'id')::uuid from public.my_worker_profile() p, jsonb_array_elements(p.certificates) c where c ->> 'title' = 'Chứng nhận 1'), 'An existing title still succeeds at the limit');

reset role;
update public.worker_certificates set id = '00000000-0000-4000-8000-000000000001' where worker_id = '00000000-0000-4000-8000-0000000000b2' and title = 'Chứng nhận 2';
set local role authenticated;
select is((select certificates -> 0 ->> 'title' from public.my_worker_profile()), 'Chứng nhận 2', 'Removal fixture puts the later verification target first');
select lives_ok($$select public.remove_worker_certificate((select (c ->> 'id')::uuid from public.my_worker_profile() p, jsonb_array_elements(p.certificates) c where c ->> 'title' = 'Chứng chỉ an toàn điện'))$$, 'A worker removes a certificate');
select is((select jsonb_array_length(certificates) from public.my_worker_profile()), 9, 'The certificate is gone');
select is_empty($$select c from public.my_worker_profile() p, jsonb_array_elements(p.certificates) c where c ->> 'title' = 'Chứng chỉ an toàn điện'$$, 'The intended certificate is removed regardless of display order');
select throws_ok($$select public.remove_worker_certificate(null)$$, '22023', 'invalid request', 'A missing certificate id is rejected');
select throws_ok($$select * from public.worker_certificates$$, '42501', 'permission denied for table worker_certificates', 'A worker cannot read the certificate table directly');
select throws_ok($$update public.worker_public_profiles set listed = true$$, '42501', 'permission denied for table worker_public_profiles', 'A worker cannot list their own profile');

reset role;
select is((select basis from public.worker_public_profiles where worker_id = '00000000-0000-4000-8000-0000000000b2'), 'worker_submitted', 'A saved profile records its source');
update public.worker_certificates set status = 'verified' where worker_id = '00000000-0000-4000-8000-0000000000b2' and title = 'Chứng nhận 2';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
select is_empty($$select * from public.my_worker_profile()$$, 'Another worker does not see the profile');
select isnt(public.save_worker_profile('Lê Hoa', 'Thợ sơn', 'Quận 3', 2, '', array[]::text[]), null, 'Another worker creates their own profile');
select is((select jsonb_array_length(certificates) from public.my_worker_profile()), 0, 'Another worker has no certificates');
select lives_ok($$select public.remove_worker_certificate((select id from (select '00000000-0000-4000-8000-000000000000'::uuid as id) x))$$, 'Removing an unknown certificate changes nothing');

reset role;
select is((select count(*)::integer from public.worker_certificates where worker_id = '00000000-0000-4000-8000-0000000000b2'), 9, 'Another worker cannot remove a certificate');
select is((select status from public.worker_certificates where title = 'Chứng nhận 2'), 'verified', 'The operator can verify a certificate');

insert into public.service_requests (id, owner_id, submission_key, description)
select ('10000000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-4000-8000-0000000000a1',
  ('20000000-0000-4000-8000-00000000000' || n)::uuid, 'Sửa vòi nước ' || n || E'\nChi tiết'
from generate_series(1, 3) n;
insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at, accepted_at, accepted_by)
select ('30000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
  1, 'Synthetic scope', 100, 'VND', now() + interval '1 day', now(), '00000000-0000-4000-8000-0000000000a1'
from generate_series(1, 3) n;
insert into public.service_invitations (id, request_id, quote_id, worker_id, expires_at, state)
select ('40000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
  ('30000000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-4000-8000-0000000000b2', now() + interval '1 day', 'accepted'
from generate_series(1, 3) n;
insert into public.service_jobs (id, request_id, quote_id, invitation_id, worker_id, stage, version)
select ('50000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
  ('30000000-0000-4000-8000-00000000000' || n)::uuid, ('40000000-0000-4000-8000-00000000000' || n)::uuid,
  '00000000-0000-4000-8000-0000000000b2', 'completed', 1
from generate_series(1, 3) n;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select count(*)::integer from public.job_worker_cards()), 3, 'A customer sees the worker of a job even when the profile is not listed');
select isnt(public.review_job_worker('50000000-0000-4000-8000-000000000001', 5, 'Đúng giờ', array['Đúng giờ', 'Làm gọn gàng']), null, 'A customer can review a worker whose profile is not listed');
select isnt(public.review_job_worker('50000000-0000-4000-8000-000000000002', 4, 'Tốt', array['Đúng giờ']), null, 'A second review is stored');
select throws_ok($$select public.save_worker((select profile_id from public.job_worker_cards() limit 1))$$, '42501', 'worker unavailable', 'An unlisted worker still cannot be saved');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is((select review_count from public.my_worker_profile()), 2, 'The worker counts their reviews');
select is((select rating_average from public.my_worker_profile()), 4.5, 'The worker reads the average rating');
select is((select completed_jobs from public.my_worker_profile()), 3, 'The worker counts completed jobs');
select is((select strengths -> 0 ->> 'label' from public.my_worker_profile()), 'Đúng giờ', 'The most praised strength comes first');
select is((select (strengths -> 0 ->> 'count')::integer from public.my_worker_profile()), 2, 'The strength count is stored');
select is((select jsonb_array_length(reviews) from public.my_worker_profile()), 2, 'The worker reads their reviews');
select is((select reviews -> 0 ->> 'author' from public.my_worker_profile()), 'Tú', 'A review shows only the customer given name');
select is((select to_jsonb(p) ->> 'completed_jobs' from public.my_worker_profile() p), '3', 'The profile reports completed jobs as a number');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
select is((select review_count from public.my_worker_profile()), 0, 'Another worker does not see these reviews');

reset role;
select * from finish();
rollback;
