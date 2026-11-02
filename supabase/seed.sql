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
