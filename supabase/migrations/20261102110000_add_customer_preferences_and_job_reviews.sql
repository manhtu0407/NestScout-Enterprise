create table public.customer_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  push boolean not null default true,
  quotes boolean not null default true,
  messages boolean not null default true,
  promotions boolean not null default false,
  reduce_motion boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);

create trigger customer_settings_touch before update on public.customer_settings
  for each row execute function nestscout_private.touch_updated_at();

alter table public.customer_settings enable row level security;
revoke all on table public.customer_settings from public, anon, authenticated;
grant select on table public.customer_settings to authenticated;
grant insert (push, quotes, messages, promotions, reduce_motion) on public.customer_settings to authenticated;
grant update (push, quotes, messages, promotions, reduce_motion) on public.customer_settings to authenticated;

create policy customer_settings_select_owner on public.customer_settings
  for select to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create policy customer_settings_insert_owner on public.customer_settings
  for insert to authenticated
  with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create policy customer_settings_update_owner on public.customer_settings
  for update to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false')
  with check ((select auth.uid()) = user_id);

create function public.save_customer_settings(p_push boolean, p_quotes boolean, p_messages boolean, p_promotions boolean, p_reduce_motion boolean)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_push is null or p_quotes is null or p_messages is null or p_promotions is null or p_reduce_motion is null then
    raise exception using errcode = '22023', message = 'invalid settings';
  end if;
  insert into public.customer_settings (push, quotes, messages, promotions, reduce_motion)
  values (p_push, p_quotes, p_messages, p_promotions, p_reduce_motion)
  on conflict (user_id) do update set push = excluded.push, quotes = excluded.quotes, messages = excluded.messages,
    promotions = excluded.promotions, reduce_motion = excluded.reduce_motion;
  return v_owner;
end;
$$;

revoke all on function public.save_customer_settings(boolean, boolean, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.save_customer_settings(boolean, boolean, boolean, boolean, boolean) to authenticated;

create function nestscout_private.account_phone()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_phone text;
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  select u.phone into v_phone from auth.users u where u.id = auth.uid();
  return coalesce(v_phone, '');
end;
$$;
revoke all on function nestscout_private.account_phone() from public, anon, authenticated;
grant execute on function nestscout_private.account_phone() to authenticated;

create function public.account_phone()
returns text language sql stable security invoker set search_path = ''
as $$ select nestscout_private.account_phone(); $$;
revoke all on function public.account_phone() from public, anon, authenticated;
grant execute on function public.account_phone() to authenticated;

alter table public.service_requests
  add column location text not null default '' check (location = btrim(location) and char_length(location) <= 200);
grant insert (location) on public.service_requests to authenticated;

drop function public.submit_service_request(uuid, text);

create function public.submit_service_request(p_submission_key uuid, p_description text, p_location text default '')
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_id uuid;
  v_description text;
  v_location text;
  v_new_location text := btrim(coalesce(p_location, ''));
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_submission_key is null or p_description is null
    or char_length(btrim(p_description)) not between 1 and 4000 or char_length(v_new_location) > 200 then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;

  insert into public.service_requests (submission_key, description, location)
  values (p_submission_key, btrim(p_description), v_new_location)
  on conflict (owner_id, submission_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id, description, location into v_id, v_description, v_location
    from public.service_requests
    where owner_id = v_owner and submission_key = p_submission_key;
    if v_description is distinct from btrim(p_description) or v_location is distinct from v_new_location then
      raise exception using errcode = '22023', message = 'submission key conflict';
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.submit_service_request(uuid, text, text) from public, anon, authenticated;
grant execute on function public.submit_service_request(uuid, text, text) to authenticated;

alter table public.worker_reviews drop constraint worker_reviews_basis_check;
alter table public.worker_reviews add constraint worker_reviews_basis_check check (basis in ('local_fixture', 'customer_submitted'));

create function nestscout_private.job_worker_cards()
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
  join public.worker_public_profiles p on p.worker_id = j.worker_id and p.listed;
end;
$$;
revoke all on function nestscout_private.job_worker_cards() from public, anon, authenticated;
grant execute on function nestscout_private.job_worker_cards() to authenticated;

create function public.job_worker_cards()
returns table (job_id uuid, request_id uuid, profile_id uuid, display_name text, saved boolean, review_rating integer)
language sql stable security invoker set search_path = ''
as $$ select * from nestscout_private.job_worker_cards(); $$;
revoke all on function public.job_worker_cards() from public, anon, authenticated;
grant execute on function public.job_worker_cards() to authenticated;

create function nestscout_private.review_job_worker(p_job_id uuid, p_rating integer, p_body text, p_tags text[])
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
  select p.id into v_profile from public.worker_public_profiles p where p.worker_id = v_job.worker_id and p.listed;
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
revoke all on function nestscout_private.review_job_worker(uuid, integer, text, text[]) from public, anon, authenticated;
grant execute on function nestscout_private.review_job_worker(uuid, integer, text, text[]) to authenticated;

create function public.review_job_worker(p_job_id uuid, p_rating integer, p_body text, p_tags text[])
returns uuid language sql security invoker set search_path = ''
as $$ select nestscout_private.review_job_worker(p_job_id, p_rating, p_body, p_tags); $$;
revoke all on function public.review_job_worker(uuid, integer, text, text[]) from public, anon, authenticated;
grant execute on function public.review_job_worker(uuid, integer, text, text[]) to authenticated;
