create function nestscout_private.worker_job_cards()
returns table (kind text, ref_id uuid, title text, description text, photo_count integer, location text, customer_label text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select 'offer'::text, i.id, left(btrim(split_part(r.description, E'\n', 1)), 80), r.description,
    (select count(*)::integer from public.request_photos p where p.request_id = r.id),
    ''::text, ''::text, null::timestamptz
  from public.service_invitations i
  join public.service_quotes q on q.id = i.quote_id and q.request_id = i.request_id
  join public.service_requests r on r.id = i.request_id
  where i.worker_id = auth.uid() and nestscout_private.current_worker_eligible()
    and i.state = 'open' and i.expires_at > clock_timestamp() and q.accepted_at is not null
    and not exists (select 1 from public.service_jobs j where j.request_id = i.request_id)
  union all
  select 'job'::text, j.id, left(btrim(split_part(r.description, E'\n', 1)), 80), r.description,
    (select count(*)::integer from public.request_photos p where p.request_id = r.id),
    r.location,
    coalesce(nullif(regexp_replace(btrim(c.display_name), '^.*[[:space:]]', ''), ''), 'Khách hàng'),
    (select max(e.created_at) from public.service_job_events e where e.job_id = j.id)
  from public.service_jobs j
  join public.service_requests r on r.id = j.request_id
  left join public.customer_profiles c on c.user_id = r.owner_id
  where j.worker_id = auth.uid() and nestscout_private.current_worker_eligible();
$$;
revoke all on function nestscout_private.worker_job_cards() from public, anon, authenticated;
grant execute on function nestscout_private.worker_job_cards() to authenticated;

create function public.worker_job_cards()
returns table (kind text, ref_id uuid, title text, description text, photo_count integer, location text, customer_label text, updated_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from nestscout_private.worker_job_cards(); $$;
revoke all on function public.worker_job_cards() from public, anon, authenticated;
grant execute on function public.worker_job_cards() to authenticated;
