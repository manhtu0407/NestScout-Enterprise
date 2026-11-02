create table public.worker_public_profiles (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null check (display_name = btrim(display_name) and char_length(display_name) between 1 and 80),
  trade text not null check (trade = btrim(trade) and char_length(trade) between 1 and 80),
  area text not null check (area = btrim(area) and char_length(area) between 1 and 80),
  experience_years integer not null check (experience_years between 0 and 80),
  skills text[] not null default '{}' check (cardinality(skills) <= 20),
  service_areas text[] not null default '{}' check (cardinality(service_areas) <= 20),
  listed boolean not null default false,
  basis text not null default 'local_fixture' check (basis = 'local_fixture')
);

alter table public.worker_public_profiles enable row level security;
revoke all on table public.worker_public_profiles from public, anon, authenticated;

create table public.worker_reviews (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.worker_public_profiles (id) on delete cascade,
  job_id uuid unique references public.service_jobs (id),
  author_label text not null check (char_length(btrim(author_label)) between 1 and 40),
  service_label text not null check (char_length(btrim(service_label)) between 1 and 80),
  rating integer not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 1000),
  tags text[] not null default '{}' check (cardinality(tags) <= 5),
  created_at timestamptz not null default now(),
  basis text not null default 'local_fixture' check (basis = 'local_fixture')
);
create index worker_reviews_profile_time on public.worker_reviews (profile_id, created_at desc);

alter table public.worker_reviews enable row level security;
revoke all on table public.worker_reviews from public, anon, authenticated;

create table public.customer_saved_workers (
  customer_id uuid not null default auth.uid() references auth.users (id),
  profile_id uuid not null references public.worker_public_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, profile_id)
);

alter table public.customer_saved_workers enable row level security;
revoke all on table public.customer_saved_workers from public, anon, authenticated;
grant select, delete on table public.customer_saved_workers to authenticated;

create policy customer_saved_workers_select_owner on public.customer_saved_workers
  for select to authenticated
  using ((select auth.uid()) = customer_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create policy customer_saved_workers_delete_owner on public.customer_saved_workers
  for delete to authenticated
  using ((select auth.uid()) = customer_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create function nestscout_private.save_worker(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid := auth.uid();
begin
  if v_customer is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_profile_id is null or not exists (select 1 from public.worker_public_profiles p where p.id = p_profile_id and p.listed) then
    raise exception using errcode = '42501', message = 'worker unavailable';
  end if;
  insert into public.customer_saved_workers (customer_id, profile_id) values (v_customer, p_profile_id) on conflict do nothing;
  return p_profile_id;
end;
$$;
revoke all on function nestscout_private.save_worker(uuid) from public, anon, authenticated;
grant execute on function nestscout_private.save_worker(uuid) to authenticated;

create function public.save_worker(p_profile_id uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select nestscout_private.save_worker(p_profile_id); $$;
revoke all on function public.save_worker(uuid) from public, anon, authenticated;
grant execute on function public.save_worker(uuid) to authenticated;

create function public.unsave_worker(p_profile_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_profile_id is null then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  delete from public.customer_saved_workers where profile_id = p_profile_id and customer_id = auth.uid();
  return p_profile_id;
end;
$$;
revoke all on function public.unsave_worker(uuid) from public, anon, authenticated;
grant execute on function public.unsave_worker(uuid) to authenticated;

create function nestscout_private.saved_workers()
returns table (
  profile_id uuid, display_name text, trade text, area text, experience_years integer, skills text[], service_areas text[],
  saved_at timestamptz, review_count integer, rating_average numeric, completed_jobs integer, strengths jsonb, reviews jsonb, basis text
)
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
  select p.id, p.display_name, p.trade, p.area, p.experience_years, p.skills, p.service_areas, s.created_at,
    (select count(*)::integer from public.worker_reviews r where r.profile_id = p.id),
    coalesce((select round(avg(r.rating), 1) from public.worker_reviews r where r.profile_id = p.id), 0),
    (select count(*)::integer from public.service_jobs j where j.worker_id = p.worker_id and j.stage = 'completed'),
    coalesce((select jsonb_agg(jsonb_build_object('label', t.tag, 'count', t.n) order by t.n desc, t.tag)
      from (select u.tag, count(*)::integer as n from public.worker_reviews r cross join lateral unnest(r.tags) as u(tag)
        where r.profile_id = p.id group by u.tag order by count(*) desc, u.tag limit 5) t), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'author', l.author_label, 'service', l.service_label,
        'text', l.body, 'created_at', l.created_at) order by l.created_at desc)
      from (select r.id, r.author_label, r.service_label, r.body, r.created_at from public.worker_reviews r
        where r.profile_id = p.id order by r.created_at desc limit 5) l), '[]'::jsonb),
    p.basis
  from public.customer_saved_workers s
  join public.worker_public_profiles p on p.id = s.profile_id
  where s.customer_id = auth.uid() and p.listed
  order by s.created_at desc;
end;
$$;
revoke all on function nestscout_private.saved_workers() from public, anon, authenticated;
grant execute on function nestscout_private.saved_workers() to authenticated;

create function public.saved_workers()
returns table (
  profile_id uuid, display_name text, trade text, area text, experience_years integer, skills text[], service_areas text[],
  saved_at timestamptz, review_count integer, rating_average numeric, completed_jobs integer, strengths jsonb, reviews jsonb, basis text
)
language sql stable security invoker set search_path = ''
as $$ select * from nestscout_private.saved_workers(); $$;
revoke all on function public.saved_workers() from public, anon, authenticated;
grant execute on function public.saved_workers() to authenticated;
