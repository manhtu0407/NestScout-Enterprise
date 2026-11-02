insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-00000000f001', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000f002', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.worker_public_profiles (id, worker_id, display_name, trade, area, experience_years, skills, service_areas, listed) values
  ('70000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000f001', 'Thợ Minh', 'Thợ nước', 'Quận 7', 8,
    array['Thay vòi và van nước', 'Sửa ống nước bị rò', 'Lắp thiết bị vệ sinh'], array['Quận 7', 'Quận 4', 'Nhà Bè'], true),
  ('70000000-0000-4000-8000-00000000f002', '00000000-0000-4000-8000-00000000f002', 'Thợ Hạnh', 'Vệ sinh sofa', 'Quận 3', 3,
    array['Giặt sofa vải', 'Vệ sinh nệm'], array['Quận 3', 'Quận 1'], true)
on conflict (id) do nothing;

insert into public.worker_reviews (id, profile_id, author_label, service_label, rating, body, tags, created_at) values
  ('71000000-0000-4000-8000-00000000f001', '70000000-0000-4000-8000-00000000f001', 'Chị L.', 'Sửa vòi bồn rửa', 5,
    'Thợ đến đúng giờ, giải thích rõ ràng và dọn sạch sau khi làm.', array['Đúng giờ', 'Giải thích rõ ràng'], now() - interval '7 days'),
  ('71000000-0000-4000-8000-00000000f002', '70000000-0000-4000-8000-00000000f001', 'Anh H.', 'Lắp vòi sen', 5,
    'Làm nhanh, giá đúng như đã báo.', array['Đúng giờ', 'Giá đúng như báo'], now() - interval '14 days'),
  ('71000000-0000-4000-8000-00000000f003', '70000000-0000-4000-8000-00000000f001', 'Chị T.', 'Thay van nước', 4,
    '', array['Đúng giờ'], now() - interval '30 days'),
  ('71000000-0000-4000-8000-00000000f004', '70000000-0000-4000-8000-00000000f002', 'Chị M.', 'Giặt sofa', 5,
    'Nhẹ nhàng với đồ đạc.', array['Nhẹ nhàng với đồ đạc'], now() - interval '3 days')
on conflict (id) do nothing;

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-00000000f003', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000f004', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.customer_profiles (user_id, display_name) values ('00000000-0000-4000-8000-00000000f004', 'Nguyễn Văn Lan')
on conflict (user_id) do nothing;

insert into public.worker_access_grants (user_id) values ('00000000-0000-4000-8000-00000000f003')
on conflict (user_id) do nothing;

insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active) values ('00000000-0000-4000-8000-00000000f003', 'local_fixture', true)
on conflict (user_id) do nothing;

insert into public.service_requests (id, owner_id, submission_key, description, location) values
  ('10000000-0000-4000-8000-00000000f101', '00000000-0000-4000-8000-00000000f004', '20000000-0000-4000-8000-00000000f101', E'Sửa vòi nước bồn rửa\nVòi bồn rửa bếp bị rò ở chân vòi.', '12 Lê Lợi, Quận 1'),
  ('10000000-0000-4000-8000-00000000f102', '00000000-0000-4000-8000-00000000f004', '20000000-0000-4000-8000-00000000f102', E'Lắp quạt trần phòng ngủ\nQuạt đã có sẵn chân đế.', '45 Nguyễn Huệ, Quận 1'),
  ('10000000-0000-4000-8000-00000000f103', '00000000-0000-4000-8000-00000000f004', '20000000-0000-4000-8000-00000000f103', E'Thay ổ khoá cửa chính\nKhoá cũ bị kẹt chìa.', '8 Pasteur, Quận 3'),
  ('10000000-0000-4000-8000-00000000f104', '00000000-0000-4000-8000-00000000f004', '20000000-0000-4000-8000-00000000f104', E'Vệ sinh máy lạnh\nHai máy lạnh treo tường.', '99 Trần Hưng Đạo, Quận 5')
on conflict (id) do nothing;

insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at, accepted_at, accepted_by)
select ('30000000-0000-4000-8000-00000000f1' || n)::uuid, ('10000000-0000-4000-8000-00000000f1' || n)::uuid,
  1, 'Phạm vi ' || n, 450000 + n::integer * 10000, 'VND', now() + interval '7 days', now(), '00000000-0000-4000-8000-00000000f004'
from (values ('01'), ('02'), ('03'), ('04')) as t(n)
on conflict (id) do nothing;

insert into public.service_invitations (id, request_id, quote_id, worker_id, expires_at, state)
select ('40000000-0000-4000-8000-00000000f1' || n)::uuid, ('10000000-0000-4000-8000-00000000f1' || n)::uuid,
  ('30000000-0000-4000-8000-00000000f1' || n)::uuid, '00000000-0000-4000-8000-00000000f003', now() + interval '1 day',
  case when n = '01' then 'open' else 'accepted' end
from (values ('01'), ('02'), ('03'), ('04')) as t(n)
on conflict (id) do nothing;

insert into public.service_jobs (id, request_id, quote_id, invitation_id, worker_id, stage, version)
select ('50000000-0000-4000-8000-00000000f1' || n)::uuid, ('10000000-0000-4000-8000-00000000f1' || n)::uuid,
  ('30000000-0000-4000-8000-00000000f1' || n)::uuid, ('40000000-0000-4000-8000-00000000f1' || n)::uuid,
  '00000000-0000-4000-8000-00000000f003', stage, 1
from (values ('02', 'assigned'), ('03', 'working'), ('04', 'submitted')) as t(n, stage)
on conflict (id) do nothing;

insert into public.service_job_events (job_id, actor_id, event, version)
select ('50000000-0000-4000-8000-00000000f1' || n)::uuid, '00000000-0000-4000-8000-00000000f003', 'assigned', 1
from (values ('02'), ('03'), ('04')) as t(n)
on conflict do nothing;
