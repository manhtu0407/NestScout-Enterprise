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
select throws_ok($$select public.set_worker_accepting(true)$$, '22023', 'profile incomplete', 'A worker without an identity document cannot resume new jobs');
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
