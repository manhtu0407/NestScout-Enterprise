create function nestscout_private.require_fixture_operator()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_operator uuid := auth.uid();
begin
  if v_operator is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'operator unavailable';
  end if;
  if not exists (
    select 1 from nestscout_private.fixture_operators o
    where o.user_id = v_operator and o.active and o.basis = 'local_fixture'
  ) then
    raise exception using errcode = '42501', message = 'operator unavailable';
  end if;
  return v_operator;
end;
$$;
revoke all on function nestscout_private.require_fixture_operator() from public, anon, authenticated;

create or replace function nestscout_private.fixture_dispatch_queue()
returns table (request_id uuid, description text, location text, created_at timestamptz, latest_quote_id uuid, latest_quote_version integer,
  quote_state text, accepted_quote_id uuid, open_invitations integer, job_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform nestscout_private.require_fixture_operator();
  return query
  select r.id, left(r.description, 300), r.location, r.created_at, q.id, q.version,
    case when q.id is null then 'none' when q.accepted_at is not null then 'accepted' when q.rejected_at is not null then 'rejected'
      when q.expires_at <= clock_timestamp() then 'expired' else 'issued' end,
    (select a.id from public.service_quotes a where a.request_id = r.id and a.accepted_at is not null),
    (select count(*)::integer from public.service_invitations i where i.request_id = r.id and i.state = 'open' and i.expires_at > clock_timestamp()),
    (select j.id from public.service_jobs j where j.request_id = r.id)
  from public.service_requests r
  left join lateral (select * from public.service_quotes x where x.request_id = r.id order by x.version desc limit 1) q on true
  order by r.created_at desc
  limit 100;
end;
$$;

create or replace function nestscout_private.fixture_dispatch_candidates()
returns table (worker_id uuid, display_name text, trade text, area text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform nestscout_private.require_fixture_operator();
  return query
  select p.worker_id, p.display_name, p.trade, p.area
  from public.worker_public_profiles p
  where nestscout_private.fixture_worker_dispatchable(p.worker_id)
  order by p.display_name, p.worker_id;
end;
$$;
