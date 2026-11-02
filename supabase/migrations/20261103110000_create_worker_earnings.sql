create function nestscout_private.worker_earnings()
returns table (job_id uuid, title text, amount_minor bigint, currency text, accepted_at timestamptz, completed_on date)
language sql
stable
security definer
set search_path = ''
as $$
  select j.id, left(btrim(split_part(r.description, E'\n', 1)), 80), coalesce(s.new_amount_minor, q.amount_minor), q.currency,
    a.accepted_at, (a.accepted_at at time zone 'Asia/Ho_Chi_Minh')::date
  from public.service_jobs j
  join public.service_quotes q on q.id = j.quote_id and q.request_id = j.request_id
  join public.service_requests r on r.id = j.request_id
  join lateral (select max(e.created_at) as accepted_at from public.service_job_events e where e.job_id = j.id and e.event = 'accepted') a on a.accepted_at is not null
  left join lateral (select c.new_amount_minor from public.service_scope_changes c
    where c.job_id = j.id and c.decision = 'approved' order by c.sequence desc limit 1) s on true
  where j.worker_id = auth.uid() and j.stage = 'completed' and nestscout_private.current_worker_eligible()
  order by a.accepted_at desc, j.id
  limit 500;
$$;
revoke all on function nestscout_private.worker_earnings() from public, anon, authenticated;
grant execute on function nestscout_private.worker_earnings() to authenticated;

create function public.worker_earnings()
returns table (job_id uuid, title text, amount_minor bigint, currency text, accepted_at timestamptz, completed_on date)
language sql stable security invoker set search_path = ''
as $$ select * from nestscout_private.worker_earnings(); $$;
revoke all on function public.worker_earnings() from public, anon, authenticated;
grant execute on function public.worker_earnings() to authenticated;
