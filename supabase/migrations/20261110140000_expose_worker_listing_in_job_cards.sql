drop function public.job_worker_cards();
drop function nestscout_private.job_worker_cards();

create function nestscout_private.job_worker_cards()
returns table (job_id uuid, request_id uuid, profile_id uuid, display_name text, saved boolean, review_rating integer, listed boolean)
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
    (select r.rating from public.worker_reviews r where r.job_id = j.id),
    p.listed
  from public.service_jobs j
  join public.service_requests q on q.id = j.request_id and q.owner_id = auth.uid()
  join public.worker_public_profiles p on p.worker_id = j.worker_id;
end;
$$;
revoke all on function nestscout_private.job_worker_cards() from public, anon, authenticated;
grant execute on function nestscout_private.job_worker_cards() to authenticated;

create function public.job_worker_cards()
returns table (job_id uuid, request_id uuid, profile_id uuid, display_name text, saved boolean, review_rating integer, listed boolean)
language sql stable security invoker set search_path = ''
as $$ select * from nestscout_private.job_worker_cards(); $$;
revoke all on function public.job_worker_cards() from public, anon, authenticated;
grant execute on function public.job_worker_cards() to authenticated;
