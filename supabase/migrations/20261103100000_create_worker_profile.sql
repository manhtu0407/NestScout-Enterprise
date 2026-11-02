alter table public.worker_public_profiles
  add column about text not null default '' check (char_length(about) <= 600),
  add column radius_km integer not null default 5 check (radius_km in (3, 5, 10)),
  add column accepting_jobs boolean not null default true,
  add column service_ids text[] not null default '{}'
    check (cardinality(service_ids) <= 5 and service_ids <@ array['electric', 'water', 'aircon', 'paint', 'sofa']::text[]);

alter table public.worker_public_profiles drop constraint worker_public_profiles_basis_check;
alter table public.worker_public_profiles add constraint worker_public_profiles_basis_check check (basis in ('local_fixture', 'worker_submitted'));

create table public.worker_certificates (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (title = btrim(title) and char_length(title) between 1 and 80),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now()
);
create unique index worker_certificates_worker_title on public.worker_certificates (worker_id, lower(title));

alter table public.worker_certificates enable row level security;
revoke all on table public.worker_certificates from public, anon, authenticated;

create function nestscout_private.save_worker_profile(p_display_name text, p_trade text, p_area text, p_experience_years integer, p_about text, p_skills text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
  v_name text := btrim(coalesce(p_display_name, ''));
  v_trade text := btrim(coalesce(p_trade, ''));
  v_area text := btrim(coalesce(p_area, ''));
  v_about text := btrim(coalesce(p_about, ''));
  v_skills text[];
  v_id uuid;
begin
  v_worker := nestscout_private.lock_current_worker();
  if char_length(v_name) not between 1 and 80 or char_length(v_trade) not between 1 and 80 or char_length(v_area) not between 1 and 80
    or p_experience_years is null or p_experience_years not between 0 and 80 or char_length(v_about) > 600 or p_skills is null then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  select coalesce(array_agg(s.skill order by s.first_position), '{}') into v_skills
  from (select btrim(u.skill) as skill, min(u.idx) as first_position
    from unnest(p_skills) with ordinality as u(skill, idx) group by btrim(u.skill)) s;
  if cardinality(v_skills) > 12 or exists (select 1 from unnest(v_skills) as x(skill) where char_length(x.skill) not between 1 and 40) then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  insert into public.worker_public_profiles (worker_id, display_name, trade, area, experience_years, about, skills, service_areas, basis)
  values (v_worker, v_name, v_trade, v_area, p_experience_years, v_about, v_skills, array[v_area], 'worker_submitted')
  on conflict (worker_id) do update set display_name = excluded.display_name, trade = excluded.trade, area = excluded.area,
    experience_years = excluded.experience_years, about = excluded.about, skills = excluded.skills,
    service_areas = excluded.service_areas, basis = 'worker_submitted'
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function nestscout_private.save_worker_profile(text, text, text, integer, text, text[]) from public, anon, authenticated;
grant execute on function nestscout_private.save_worker_profile(text, text, text, integer, text, text[]) to authenticated;

create function public.save_worker_profile(p_display_name text, p_trade text, p_area text, p_experience_years integer, p_about text, p_skills text[])
returns uuid language sql security invoker set search_path = ''
as $$ select nestscout_private.save_worker_profile(p_display_name, p_trade, p_area, p_experience_years, p_about, p_skills); $$;
revoke all on function public.save_worker_profile(text, text, text, integer, text, text[]) from public, anon, authenticated;
grant execute on function public.save_worker_profile(text, text, text, integer, text, text[]) to authenticated;

create function nestscout_private.save_worker_coverage(p_radius_km integer, p_service_ids text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
  v_services text[];
  v_id uuid;
begin
  v_worker := nestscout_private.lock_current_worker();
  if p_radius_km is null or p_radius_km not in (3, 5, 10) or p_service_ids is null
    or not (p_service_ids <@ array['electric', 'water', 'aircon', 'paint', 'sofa']::text[]) then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  select coalesce(array_agg(u.service_id order by u.service_id), '{}') into v_services from (select distinct x as service_id from unnest(p_service_ids) as x) u;
  update public.worker_public_profiles set radius_km = p_radius_km, service_ids = v_services where worker_id = v_worker returning id into v_id;
  if v_id is null then
    raise exception using errcode = '22023', message = 'profile required';
  end if;
  return v_id;
end;
$$;
revoke all on function nestscout_private.save_worker_coverage(integer, text[]) from public, anon, authenticated;
grant execute on function nestscout_private.save_worker_coverage(integer, text[]) to authenticated;

create function public.save_worker_coverage(p_radius_km integer, p_service_ids text[])
returns uuid language sql security invoker set search_path = ''
as $$ select nestscout_private.save_worker_coverage(p_radius_km, p_service_ids); $$;
revoke all on function public.save_worker_coverage(integer, text[]) from public, anon, authenticated;
grant execute on function public.save_worker_coverage(integer, text[]) to authenticated;

create function nestscout_private.set_worker_accepting(p_accepting boolean)
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
  update public.worker_public_profiles set accepting_jobs = p_accepting where worker_id = v_worker returning id into v_id;
  if v_id is null then
    raise exception using errcode = '22023', message = 'profile required';
  end if;
  return p_accepting;
end;
$$;
revoke all on function nestscout_private.set_worker_accepting(boolean) from public, anon, authenticated;
grant execute on function nestscout_private.set_worker_accepting(boolean) to authenticated;

create function public.set_worker_accepting(p_accepting boolean)
returns boolean language sql security invoker set search_path = ''
as $$ select nestscout_private.set_worker_accepting(p_accepting); $$;
revoke all on function public.set_worker_accepting(boolean) from public, anon, authenticated;
grant execute on function public.set_worker_accepting(boolean) to authenticated;

create function nestscout_private.add_worker_certificate(p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_id uuid;
begin
  v_worker := nestscout_private.lock_current_worker();
  if char_length(v_title) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('worker_certificates:' || v_worker::text, 0));
  select c.id into v_id from public.worker_certificates c where c.worker_id = v_worker and lower(c.title) = lower(v_title);
  if v_id is not null then
    return v_id;
  end if;
  if (select count(*) from public.worker_certificates c where c.worker_id = v_worker) >= 10 then
    raise exception using errcode = '22023', message = 'certificate limit';
  end if;
  insert into public.worker_certificates (worker_id, title) values (v_worker, v_title) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function nestscout_private.add_worker_certificate(text) from public, anon, authenticated;
grant execute on function nestscout_private.add_worker_certificate(text) to authenticated;

create function public.add_worker_certificate(p_title text)
returns uuid language sql security invoker set search_path = ''
as $$ select nestscout_private.add_worker_certificate(p_title); $$;
revoke all on function public.add_worker_certificate(text) from public, anon, authenticated;
grant execute on function public.add_worker_certificate(text) to authenticated;

create function nestscout_private.remove_worker_certificate(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
begin
  v_worker := nestscout_private.lock_current_worker();
  if p_id is null then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  delete from public.worker_certificates where id = p_id and worker_id = v_worker;
  return p_id;
end;
$$;
revoke all on function nestscout_private.remove_worker_certificate(uuid) from public, anon, authenticated;
grant execute on function nestscout_private.remove_worker_certificate(uuid) to authenticated;

create function public.remove_worker_certificate(p_id uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select nestscout_private.remove_worker_certificate(p_id); $$;
revoke all on function public.remove_worker_certificate(uuid) from public, anon, authenticated;
grant execute on function public.remove_worker_certificate(uuid) to authenticated;

create function nestscout_private.my_worker_profile()
returns table (
  profile_id uuid, display_name text, trade text, area text, experience_years integer, skills text[], about text, radius_km integer,
  accepting_jobs boolean, service_ids text[], listed boolean, certificates jsonb, review_count integer, rating_average numeric,
  completed_jobs integer, strengths jsonb, reviews jsonb
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
        where r.profile_id = p.id order by r.created_at desc, r.id limit 20) l), '[]'::jsonb)
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
  completed_jobs integer, strengths jsonb, reviews jsonb
)
language sql stable security invoker set search_path = ''
as $$ select * from nestscout_private.my_worker_profile(); $$;
revoke all on function public.my_worker_profile() from public, anon, authenticated;
grant execute on function public.my_worker_profile() to authenticated;

create or replace function nestscout_private.job_worker_cards()
returns table (job_id uuid, request_id uuid, profile_id uuid, display_name text, saved boolean, review_rating integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  return query
  select j.id, j.request_id, p.id, p.display_name,
    exists (select 1 from public.customer_saved_workers s where s.customer_id = auth.uid() and s.profile_id = p.id),
    (select r.rating from public.worker_reviews r where r.job_id = j.id)
  from public.service_jobs j
  join public.service_requests q on q.id = j.request_id and q.owner_id = auth.uid()
  join public.worker_public_profiles p on p.worker_id = j.worker_id;
end;
$$;

create or replace function nestscout_private.review_job_worker(p_job_id uuid, p_rating integer, p_body text, p_tags text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_tags text[];
  v_job record;
  v_profile uuid;
  v_author text;
  v_id uuid;
  v_existing public.worker_reviews%rowtype;
begin
  if v_customer is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_job_id is null or p_rating is null or p_rating not between 1 and 5 or char_length(v_body) > 1000 or p_tags is null then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  select coalesce(array_agg(btrim(t) order by o), '{}') into v_tags from unnest(p_tags) with ordinality as u(t, o);
  if cardinality(v_tags) > 5 or exists (select 1 from unnest(v_tags) as x(t) where char_length(x.t) not between 1 and 30) then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  select j.id, j.worker_id, j.stage, left(btrim(split_part(q.description, E'\n', 1)), 80) as service into v_job
  from public.service_jobs j join public.service_requests q on q.id = j.request_id
  where j.id = p_job_id and q.owner_id = v_customer;
  if v_job.id is null then
    raise exception using errcode = '42501', message = 'job unavailable';
  end if;
  if v_job.stage <> 'completed' then
    raise exception using errcode = '22023', message = 'job not completed';
  end if;
  select p.id into v_profile from public.worker_public_profiles p where p.worker_id = v_job.worker_id;
  if v_profile is null then
    raise exception using errcode = '42501', message = 'worker unavailable';
  end if;
  select coalesce(nullif(regexp_replace(btrim(c.display_name), '^.*[[:space:]]', ''), ''), 'Khách hàng') into v_author
  from (select 1) one left join public.customer_profiles c on c.user_id = v_customer;
  insert into public.worker_reviews (profile_id, job_id, author_label, service_label, rating, body, tags, basis)
  values (v_profile, p_job_id, left(coalesce(v_author, 'Khách hàng'), 40), coalesce(nullif(v_job.service, ''), 'Dịch vụ'), p_rating, v_body, v_tags, 'customer_submitted')
  on conflict (job_id) do nothing
  returning id into v_id;
  if v_id is null then
    select * into v_existing from public.worker_reviews where job_id = p_job_id;
    if v_existing.rating is distinct from p_rating or v_existing.body is distinct from v_body or v_existing.tags is distinct from v_tags then
      raise exception using errcode = '22023', message = 'review conflict';
    end if;
    v_id := v_existing.id;
  end if;
  return v_id;
end;
$$;
