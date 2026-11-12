alter table nestscout_private.auto_dispatch_settings
  add column max_manual_retries integer not null default 3 check (max_manual_retries between 1 and 10),
  add column empty_retry_cooldown_seconds integer not null default 60 check (empty_retry_cooldown_seconds between 10 and 3600),
  add column max_invites_per_worker integer not null default 2 check (max_invites_per_worker between 1 and 5),
  add column reinvite_declined_after_minutes integer not null default 1440 check (reinvite_declined_after_minutes between 5 and 43200),
  add column reinvite_expired_after_minutes integer not null default 60 check (reinvite_expired_after_minutes between 5 and 43200),
  add column sweep_batch integer not null default 25 check (sweep_batch between 1 and 500);

alter table public.service_invitations drop constraint service_invitations_state_check;
alter table public.service_invitations add constraint service_invitations_state_check
  check (state in ('open', 'accepted', 'declined', 'cancelled', 'expired'));
alter table public.service_invitations add column resolved_at timestamptz;

create index service_invitations_request_state on public.service_invitations (request_id, state);
create index service_invitations_worker_state on public.service_invitations (worker_id, state);
create index service_invitations_open_expiry on public.service_invitations (expires_at) where state = 'open';

create function nestscout_private.stamp_invitation_resolved()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.state is distinct from old.state and new.state <> 'open' then
    new.resolved_at := clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function nestscout_private.stamp_invitation_resolved() from public, anon, authenticated;

create trigger service_invitations_stamp_resolved before update of state on public.service_invitations
  for each row execute function nestscout_private.stamp_invitation_resolved();

alter table public.service_dispatch_rounds
  add column outcome text not null default 'invited' check (outcome in ('invited', 'no_eligible_worker', 'limit_reached'));
update public.service_dispatch_rounds set outcome = 'no_eligible_worker' where invited_count = 0;
alter table public.service_dispatch_rounds add constraint service_dispatch_rounds_outcome_consistent
  check ((outcome = 'invited') = (invited_count > 0));
alter table public.service_dispatch_rounds drop constraint service_dispatch_rounds_reason_check;
alter table public.service_dispatch_rounds add constraint service_dispatch_rounds_reason_check
  check (reason in ('quote_accepted', 'declined', 'expired', 'manual_retry', 'recovery'));
create index service_dispatch_rounds_request_time on public.service_dispatch_rounds (request_id, created_at);

drop function public.get_dispatch_summary(uuid[]);
drop function nestscout_private.dispatch_summary(uuid[]);
drop function nestscout_private.dispatch_request(uuid, uuid, text);

create function nestscout_private.dispatch_request(p_request_id uuid, p_quote_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings nestscout_private.auto_dispatch_settings%rowtype;
  v_request public.service_requests%rowtype;
  v_round integer;
  v_worker uuid;
  v_invitation uuid;
  v_invited integer := 0;
  v_automatic_used integer;
  v_manual_used integer;
  v_retry_at timestamptz;
  v_outcome text;
  v_customer_started boolean := p_reason in ('manual_retry', 'recovery');
  v_label text;
begin
  if p_reason is null or p_reason not in ('quote_accepted', 'declined', 'expired', 'manual_retry', 'recovery') then
    raise exception using errcode = '22023', message = 'invalid dispatch reason';
  end if;
  select * into v_settings from nestscout_private.auto_dispatch_settings;
  if not v_settings.enabled then
    return jsonb_build_object('outcome', 'dispatch_disabled');
  end if;
  select * into v_request from public.service_requests r where r.id = p_request_id for update;
  if not found or not exists (select 1 from public.service_quotes q
    where q.id = p_quote_id and q.request_id = p_request_id and q.accepted_at is not null) then
    return jsonb_build_object('outcome', 'invalid_request');
  end if;
  if v_request.cancelled_at is not null then
    return jsonb_build_object('outcome', 'cancelled');
  end if;
  if exists (select 1 from public.service_jobs j where j.request_id = p_request_id) then
    return jsonb_build_object('outcome', 'already_assigned');
  end if;
  if v_request.service_id is null then
    return jsonb_build_object('outcome', 'needs_service');
  end if;
  update public.service_invitations set state = 'expired'
    where request_id = p_request_id and state = 'open' and expires_at <= clock_timestamp();
  if exists (select 1 from public.service_invitations i
    where i.request_id = p_request_id and i.state = 'open' and i.expires_at > clock_timestamp()) then
    return jsonb_build_object('outcome', 'already_searching');
  end if;
  select coalesce(max(d.round), 0) + 1,
    count(*) filter (where d.reason <> 'manual_retry' and d.outcome <> 'limit_reached'),
    count(*) filter (where d.reason = 'manual_retry' and d.outcome = 'invited'),
    greatest(max(d.created_at) filter (where d.outcome = 'invited') + make_interval(mins => v_settings.retry_cooldown_minutes),
      max(d.created_at) filter (where d.outcome = 'no_eligible_worker' and d.reason in ('manual_retry', 'recovery'))
        + make_interval(secs => v_settings.empty_retry_cooldown_seconds))
    into v_round, v_automatic_used, v_manual_used, v_retry_at
    from public.service_dispatch_rounds d where d.request_id = p_request_id;
  if v_customer_started then
    if p_reason = 'manual_retry' and v_manual_used >= v_settings.max_manual_retries then
      return jsonb_build_object('outcome', 'limit_reached');
    end if;
    if v_retry_at is not null and v_retry_at > clock_timestamp() then
      return jsonb_build_object('outcome', 'cooldown', 'next_retry_at', v_retry_at);
    end if;
  end if;
  v_label := left(btrim(split_part(btrim(v_request.description), E'\n', 1)), 48);
  if not v_customer_started and v_automatic_used >= v_settings.max_rounds then
    insert into public.service_dispatch_rounds (request_id, quote_id, round, invited_count, reason, outcome)
      values (p_request_id, p_quote_id, v_round, 0, p_reason, 'limit_reached');
    insert into public.notifications (recipient_id, kind, request_id, title, body)
      values (v_request.owner_id, 'dispatch_exhausted', p_request_id, 'Đã hết lượt tìm thợ tự động',
        'Yêu cầu “' || coalesce(v_label, '') || '” đã hết lượt tìm thợ tự động. Bạn có thể mời lại hoặc hủy trong Yêu cầu của tôi.');
    return jsonb_build_object('outcome', 'limit_reached', 'round', v_round, 'invited', 0);
  end if;
  for v_worker in
    select p.worker_id from public.worker_public_profiles p
    where v_request.service_id = any (p.service_ids)
      and p.worker_id <> v_request.owner_id
      and nestscout_private.fixture_worker_dispatchable(p.worker_id)
      and not exists (select 1 from public.service_invitations i
        where i.request_id = p_request_id and i.worker_id = p.worker_id
          and (i.state in ('open', 'accepted', 'cancelled')
            or (i.state = 'declined' and coalesce(i.resolved_at, i.created_at) > clock_timestamp() - make_interval(mins => v_settings.reinvite_declined_after_minutes))
            or (i.state = 'expired' and i.expires_at > clock_timestamp() - make_interval(mins => v_settings.reinvite_expired_after_minutes))))
      and (select count(*) from public.service_invitations i where i.request_id = p_request_id and i.worker_id = p.worker_id) < v_settings.max_invites_per_worker
    order by (select count(*) from public.service_invitations i where i.request_id = p_request_id and i.worker_id = p.worker_id),
      (select count(*) from public.service_jobs j where j.worker_id = p.worker_id and j.stage not in ('submitted', 'completed')),
      p.worker_id
    limit v_settings.max_invites
  loop
    exit when exists (select 1 from public.service_jobs j where j.request_id = p_request_id);
    insert into public.service_invitations (request_id, quote_id, worker_id, expires_at)
      values (p_request_id, p_quote_id, v_worker, clock_timestamp() + make_interval(mins => v_settings.offer_minutes))
      returning id into v_invitation;
    v_invited := v_invited + 1;
    perform nestscout_private.auto_accept_invitation(v_invitation);
  end loop;
  v_outcome := case when v_invited > 0 then 'invited' else 'no_eligible_worker' end;
  insert into public.service_dispatch_rounds (request_id, quote_id, round, invited_count, reason, outcome)
    values (p_request_id, p_quote_id, v_round, v_invited, p_reason, v_outcome);
  if v_invited = 0 and not v_customer_started then
    insert into public.notifications (recipient_id, kind, request_id, title, body)
      values (v_request.owner_id, 'dispatch_exhausted', p_request_id, 'Chưa có thợ nhận việc',
        'Yêu cầu “' || coalesce(v_label, '') || '” chưa có thợ nhận. Bạn có thể mời lại hoặc hủy trong Yêu cầu của tôi.');
  end if;
  return jsonb_build_object('outcome', v_outcome, 'round', v_round, 'invited', v_invited);
end;
$$;
revoke all on function nestscout_private.dispatch_request(uuid, uuid, text) from public, anon, authenticated;

create function nestscout_private.dispatch_state(p_owner uuid, p_request_ids uuid[])
returns table (request_id uuid, state text, open_invites integer, earliest_expiry timestamptz, rounds integer, can_retry boolean,
  can_cancel boolean, can_reclassify boolean, next_retry_at timestamptz, retries_left integer, last_outcome text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings nestscout_private.auto_dispatch_settings%rowtype;
begin
  select * into v_settings from nestscout_private.auto_dispatch_settings;
  return query
  with f as (
    select r.id as rid, r.service_id as sid, r.cancelled_at is not null as cancelled,
      exists (select 1 from public.service_jobs j where j.request_id = r.id) as has_job,
      exists (select 1 from public.service_quotes q where q.request_id = r.id and q.accepted_at is not null) as has_accepted,
      (select count(*) from public.service_invitations i where i.request_id = r.id and i.state = 'open' and i.expires_at > clock_timestamp()) as live,
      (select min(i.expires_at) from public.service_invitations i where i.request_id = r.id and i.state = 'open' and i.expires_at > clock_timestamp()) as next_expiry,
      (select count(*) from public.service_invitations i where i.request_id = r.id and i.state = 'open' and i.expires_at <= clock_timestamp()) as lapsed,
      (select count(*) from public.service_invitations i where i.request_id = r.id) as total,
      d.round_count, d.last_outcome as last_round_outcome, d.manual_used, d.last_invited, d.last_empty
    from public.service_requests r
    left join lateral (
      select count(*) as round_count,
        (array_agg(x.outcome order by x.round desc))[1] as last_outcome,
        count(*) filter (where x.reason = 'manual_retry' and x.outcome = 'invited') as manual_used,
        max(x.created_at) filter (where x.outcome = 'invited') as last_invited,
        max(x.created_at) filter (where x.outcome = 'no_eligible_worker' and x.reason in ('manual_retry', 'recovery')) as last_empty
      from public.service_dispatch_rounds x where x.request_id = r.id
    ) d on true
    where r.id = any (p_request_ids) and r.owner_id = p_owner
  ), s as (
    select f.*,
      case
        when f.cancelled then 'cancelled'
        when f.has_job then 'assigned'
        when not f.has_accepted then 'awaiting_acceptance'
        when f.live > 0 then 'searching'
        when f.lapsed > 0 then 'recovering'
        when f.sid is null then 'needs_service'
        when f.total = 0 and f.round_count = 0 then 'not_dispatched'
        when f.total = 0 then 'no_match'
        else 'exhausted'
      end as st,
      greatest(f.last_invited + make_interval(mins => v_settings.retry_cooldown_minutes),
        f.last_empty + make_interval(secs => v_settings.empty_retry_cooldown_seconds)) as retry_at
    from f
  )
  select s.rid, s.st, s.live::integer, s.next_expiry, s.round_count::integer,
    s.st in ('not_dispatched', 'no_match', 'exhausted') and v_settings.enabled
      and (s.st = 'not_dispatched' or s.manual_used < v_settings.max_manual_retries)
      and (s.retry_at is null or s.retry_at <= clock_timestamp()),
    s.st not in ('cancelled', 'assigned'),
    s.st = 'needs_service',
    case when s.retry_at > clock_timestamp() then s.retry_at end,
    case when s.st in ('not_dispatched', 'no_match', 'exhausted') then greatest(v_settings.max_manual_retries - s.manual_used, 0)::integer end,
    s.last_round_outcome
  from s;
end;
$$;
revoke all on function nestscout_private.dispatch_state(uuid, uuid[]) from public, anon, authenticated;

create function nestscout_private.dispatch_summary(p_request_ids uuid[])
returns table (request_id uuid, state text, open_invites integer, earliest_expiry timestamptz, rounds integer, can_retry boolean,
  can_cancel boolean, can_reclassify boolean, next_retry_at timestamptz, retries_left integer, last_outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_request_ids is null or cardinality(p_request_ids) > 100 then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  return query select * from nestscout_private.dispatch_state(v_owner, p_request_ids);
end;
$$;
revoke all on function nestscout_private.dispatch_summary(uuid[]) from public, anon, authenticated;
grant execute on function nestscout_private.dispatch_summary(uuid[]) to authenticated;

create function public.get_dispatch_summary(p_request_ids uuid[])
returns table (request_id uuid, state text, open_invites integer, earliest_expiry timestamptz, rounds integer, can_retry boolean,
  can_cancel boolean, can_reclassify boolean, next_retry_at timestamptz, retries_left integer, last_outcome text)
language sql
security invoker
set search_path = ''
as $$ select * from nestscout_private.dispatch_summary(p_request_ids); $$;
revoke all on function public.get_dispatch_summary(uuid[]) from public, anon, authenticated;
grant execute on function public.get_dispatch_summary(uuid[]) to authenticated;

create function nestscout_private.sweep_expired_invitations(p_batch integer default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch integer := coalesce(p_batch, (select s.sweep_batch from nestscout_private.auto_dispatch_settings s));
  v_request uuid;
  v_quote uuid;
  v_expired integer;
  v_handled integer := 0;
begin
  if v_batch is null or v_batch not between 1 and 500 then
    raise exception using errcode = '22023', message = 'invalid batch';
  end if;
  for v_request in
    select i.request_id from public.service_invitations i
    where i.state = 'open' and i.expires_at <= clock_timestamp()
    group by i.request_id
    order by min(i.expires_at)
    limit v_batch
  loop
    perform 1 from public.service_requests r where r.id = v_request for update skip locked;
    if not found then
      continue;
    end if;
    update public.service_invitations set state = 'expired'
      where request_id = v_request and state = 'open' and expires_at <= clock_timestamp();
    get diagnostics v_expired = row_count;
    if v_expired = 0 then
      continue;
    end if;
    v_handled := v_handled + 1;
    select q.id into v_quote from public.service_quotes q where q.request_id = v_request and q.accepted_at is not null;
    if v_quote is not null then
      perform nestscout_private.dispatch_request(v_request, v_quote, 'expired');
    end if;
  end loop;
  return v_handled;
end;
$$;
revoke all on function nestscout_private.sweep_expired_invitations(integer) from public, anon, authenticated;

create function nestscout_private.schedule_dispatch_sweeper()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_extension e where e.extname = 'pg_cron') then
    return 'pg_cron not installed';
  end if;
  execute 'select cron.unschedule(j.jobid) from cron.job j where j.jobname = ''nestscout-dispatch-sweeper''';
  execute 'select cron.schedule(''nestscout-dispatch-sweeper'', ''* * * * *'', ''select nestscout_private.sweep_expired_invitations()'')';
  return 'scheduled';
end;
$$;
revoke all on function nestscout_private.schedule_dispatch_sweeper() from public, anon, authenticated;

create function nestscout_private.retry_service_dispatch(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_state record;
  v_quote uuid;
  v_result jsonb;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  perform 1 from public.service_requests r where r.id = p_request_id and r.owner_id = v_owner for update;
  if not found then
    raise exception using errcode = '42501', message = 'request unavailable';
  end if;
  select * into v_state from nestscout_private.dispatch_state(v_owner, array[p_request_id]);
  v_result := case v_state.state
    when 'cancelled' then jsonb_build_object('outcome', 'cancelled')
    when 'assigned' then jsonb_build_object('outcome', 'already_assigned')
    when 'awaiting_acceptance' then jsonb_build_object('outcome', 'invalid_request')
    when 'needs_service' then jsonb_build_object('outcome', 'needs_service')
    when 'searching' then jsonb_build_object('outcome', 'already_searching')
    when 'recovering' then jsonb_build_object('outcome', 'already_searching')
    else null
  end;
  if v_result is null then
    select q.id into v_quote from public.service_quotes q where q.request_id = p_request_id and q.accepted_at is not null;
    v_result := nestscout_private.dispatch_request(p_request_id, v_quote,
      case when v_state.state = 'not_dispatched' then 'recovery' else 'manual_retry' end);
  end if;
  select * into v_state from nestscout_private.dispatch_state(v_owner, array[p_request_id]);
  return v_result || jsonb_build_object('state', v_state.state, 'can_retry', v_state.can_retry, 'retries_left', v_state.retries_left,
    'open_invites', v_state.open_invites, 'next_retry_at', coalesce(v_state.next_retry_at, (v_result ->> 'next_retry_at')::timestamptz));
end;
$$;
revoke all on function nestscout_private.retry_service_dispatch(uuid) from public, anon, authenticated;
grant execute on function nestscout_private.retry_service_dispatch(uuid) to authenticated;

create function public.retry_service_dispatch(p_request_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select nestscout_private.retry_service_dispatch(p_request_id); $$;
revoke all on function public.retry_service_dispatch(uuid) from public, anon, authenticated;
grant execute on function public.retry_service_dispatch(uuid) to authenticated;

create or replace function nestscout_private.redispatch_service_request(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb := nestscout_private.retry_service_dispatch(p_request_id);
begin
  if v_result ->> 'outcome' = 'invited' then
    return (v_result ->> 'invited')::integer;
  end if;
  if v_result ->> 'outcome' = 'already_assigned' then
    raise exception using errcode = '40001', message = 'already assigned';
  end if;
  raise exception using errcode = '22023', message = coalesce(v_result ->> 'outcome', 'dispatch unavailable');
end;
$$;

create function nestscout_private.set_request_service(p_request_id uuid, p_service_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_request public.service_requests%rowtype;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_service_id is null or p_service_id not in ('electric', 'water', 'aircon', 'paint', 'sofa', 'other') then
    raise exception using errcode = '22023', message = 'invalid service';
  end if;
  select * into v_request from public.service_requests r where r.id = p_request_id and r.owner_id = v_owner for update;
  if not found then
    raise exception using errcode = '42501', message = 'request unavailable';
  end if;
  if v_request.cancelled_at is not null then
    raise exception using errcode = '22023', message = 'request cancelled';
  end if;
  if exists (select 1 from public.service_jobs j where j.request_id = p_request_id) then
    raise exception using errcode = '40001', message = 'already assigned';
  end if;
  if v_request.service_id is not null then
    if v_request.service_id = p_service_id then
      return p_service_id;
    end if;
    raise exception using errcode = '22023', message = 'service already set';
  end if;
  update public.service_requests set service_id = p_service_id where id = p_request_id;
  return p_service_id;
end;
$$;
revoke all on function nestscout_private.set_request_service(uuid, text) from public, anon, authenticated;
grant execute on function nestscout_private.set_request_service(uuid, text) to authenticated;

create function public.set_request_service(p_request_id uuid, p_service_id text)
returns text
language sql
security invoker
set search_path = ''
as $$ select nestscout_private.set_request_service(p_request_id, p_service_id); $$;
revoke all on function public.set_request_service(uuid, text) from public, anon, authenticated;
grant execute on function public.set_request_service(uuid, text) to authenticated;

create or replace function nestscout_private.accept_service_quote(p_quote_id uuid, p_version integer)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_request_id uuid;
  v_quote public.service_quotes%rowtype;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  select q.request_id into v_request_id from public.service_quotes q
    join public.service_requests r on r.id = q.request_id where q.id = p_quote_id and r.owner_id = v_owner;
  if v_request_id is null then raise exception using errcode = '42501', message = 'quote unavailable'; end if;
  perform 1 from public.service_requests r where r.id = v_request_id and r.owner_id = v_owner for update;
  if not found then raise exception using errcode = '42501', message = 'quote unavailable'; end if;
  select * into v_quote from public.service_quotes q where q.id = p_quote_id and q.request_id = v_request_id for update;
  if not found then raise exception using errcode = '42501', message = 'quote unavailable'; end if;
  if exists (select 1 from public.service_requests r where r.id = v_request_id and r.cancelled_at is not null) then
    raise exception using errcode = '22023', message = 'request cancelled';
  end if;
  if v_quote.version is distinct from p_version then raise exception using errcode = '40001', message = 'stale quote'; end if;
  if v_quote.accepted_at is not null then return v_quote.id; end if;
  if v_quote.rejected_at is not null
    or exists (select 1 from public.service_quotes q where q.request_id = v_request_id and q.accepted_at is not null)
    or exists (select 1 from public.service_quotes q where q.request_id = v_request_id and q.version > v_quote.version) then
    raise exception using errcode = '40001', message = 'stale quote';
  end if;
  if v_quote.expires_at <= clock_timestamp() then raise exception using errcode = '22023', message = 'quote expired'; end if;
  update public.service_quotes set accepted_at = clock_timestamp(), accepted_by = v_owner where id = p_quote_id;
  return p_quote_id;
end;
$$;

create or replace function nestscout_private.reject_service_quote(p_quote_id uuid, p_version integer)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_request_id uuid;
  v_quote public.service_quotes%rowtype;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  select q.request_id into v_request_id from public.service_quotes q
    join public.service_requests r on r.id = q.request_id where q.id = p_quote_id and r.owner_id = v_owner;
  if v_request_id is null then raise exception using errcode = '42501', message = 'quote unavailable'; end if;
  perform 1 from public.service_requests r where r.id = v_request_id and r.owner_id = v_owner for update;
  if not found then raise exception using errcode = '42501', message = 'quote unavailable'; end if;
  select * into v_quote from public.service_quotes q where q.id = p_quote_id and q.request_id = v_request_id for update;
  if not found then raise exception using errcode = '42501', message = 'quote unavailable'; end if;
  if exists (select 1 from public.service_requests r where r.id = v_request_id and r.cancelled_at is not null) then
    raise exception using errcode = '22023', message = 'request cancelled';
  end if;
  if v_quote.version is distinct from p_version then raise exception using errcode = '40001', message = 'stale quote'; end if;
  if v_quote.rejected_at is not null then return v_quote.id; end if;
  if v_quote.accepted_at is not null
    or exists (select 1 from public.service_quotes q where q.request_id = v_request_id and q.accepted_at is not null)
    or exists (select 1 from public.service_quotes q where q.request_id = v_request_id and q.version > v_quote.version) then
    raise exception using errcode = '40001', message = 'stale quote';
  end if;
  if v_quote.expires_at <= clock_timestamp() then raise exception using errcode = '22023', message = 'quote expired'; end if;
  update public.service_quotes set rejected_at = clock_timestamp(), rejected_by = v_owner where id = p_quote_id;
  return p_quote_id;
end;
$$;

create or replace function nestscout_private.accept_service_invitation(p_invitation_id uuid, p_quote_id uuid, p_quote_version integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
  v_invite public.service_invitations%rowtype;
  v_job uuid;
  v_request_id uuid;
begin
  v_worker := nestscout_private.lock_current_worker();
  select * into v_invite from public.service_invitations i
    where i.id = p_invitation_id and i.worker_id = v_worker;
  if not found then
    raise exception using errcode = '42501', message = 'invitation unavailable';
  end if;
  v_request_id := v_invite.request_id;
  perform 1 from public.service_requests r where r.id = v_request_id for update;
  select * into v_invite from public.service_invitations i
    where i.id = p_invitation_id and i.worker_id = v_worker and i.request_id = v_request_id for update;
  if not found then raise exception using errcode = '42501', message = 'invitation unavailable'; end if;
  if v_invite.quote_id is distinct from p_quote_id or not exists
    (select 1 from public.service_quotes q where q.id = v_invite.quote_id and q.version = p_quote_version) then
    raise exception using errcode = '40001', message = 'stale terms';
  end if;
  if v_invite.state = 'accepted' then
    select j.id into v_job from public.service_jobs j where j.invitation_id = v_invite.id and j.worker_id = v_worker;
    if v_job is not null then return v_job; end if;
  end if;
  if exists (select 1 from public.service_requests r where r.id = v_request_id and r.cancelled_at is not null) then
    raise exception using errcode = '22023', message = 'request cancelled';
  end if;
  if exists (select 1 from public.service_jobs j where j.request_id = v_invite.request_id) then
    raise exception using errcode = '40001', message = 'already assigned';
  end if;
  if v_invite.state = 'expired' or (v_invite.state = 'open' and v_invite.expires_at <= clock_timestamp()) then
    raise exception using errcode = '22023', message = 'invitation expired';
  end if;
  if v_invite.state <> 'open' then
    raise exception using errcode = '22023', message = 'invitation unavailable';
  end if;
  if not exists (select 1 from public.service_quotes q where q.id = v_invite.quote_id
    and q.request_id = v_invite.request_id and q.accepted_at is not null) then
    raise exception using errcode = '22023', message = 'agreement unavailable';
  end if;
  return nestscout_private.assign_invitation(v_invite.id, v_worker);
end;
$$;

create or replace function nestscout_private.decline_service_invitation(p_invitation_id uuid, p_quote_id uuid, p_quote_version integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
  v_invite public.service_invitations%rowtype;
  v_request_id uuid;
begin
  v_worker := nestscout_private.lock_current_worker();
  select * into v_invite from public.service_invitations i where i.id = p_invitation_id and i.worker_id = v_worker;
  if not found then raise exception using errcode = '42501', message = 'invitation unavailable'; end if;
  v_request_id := v_invite.request_id;
  perform 1 from public.service_requests r where r.id = v_request_id for update;
  select * into v_invite from public.service_invitations i
    where i.id = p_invitation_id and i.worker_id = v_worker and i.request_id = v_request_id for update;
  if not found then raise exception using errcode = '42501', message = 'invitation unavailable'; end if;
  if v_invite.quote_id is distinct from p_quote_id or not exists
    (select 1 from public.service_quotes q where q.id = v_invite.quote_id and q.version = p_quote_version) then
    raise exception using errcode = '40001', message = 'stale terms';
  end if;
  if v_invite.state = 'declined' then return v_invite.id; end if;
  if exists (select 1 from public.service_requests r where r.id = v_request_id and r.cancelled_at is not null) then
    raise exception using errcode = '22023', message = 'request cancelled';
  end if;
  if exists (select 1 from public.service_jobs j where j.request_id = v_invite.request_id) then
    raise exception using errcode = '22023', message = 'invitation unavailable';
  end if;
  if v_invite.state = 'expired' or (v_invite.state = 'open' and v_invite.expires_at <= clock_timestamp()) then
    raise exception using errcode = '22023', message = 'invitation expired';
  end if;
  if v_invite.state <> 'open' then
    raise exception using errcode = '22023', message = 'invitation unavailable';
  end if;
  update public.service_invitations set state = 'declined' where id = p_invitation_id;
  return p_invitation_id;
end;
$$;

create or replace function nestscout_private.auto_accept_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.service_invitations%rowtype;
  v_job uuid;
  v_label text;
begin
  select * into v_invite from public.service_invitations i where i.id = p_invitation_id;
  if not found then
    return null;
  end if;
  perform 1 from public.service_requests r where r.id = v_invite.request_id for update;
  select * into v_invite from public.service_invitations i where i.id = p_invitation_id for update;
  if v_invite.state <> 'open' or v_invite.expires_at <= clock_timestamp()
    or exists (select 1 from public.service_requests r where r.id = v_invite.request_id and r.cancelled_at is not null)
    or not exists (select 1 from public.service_quotes q where q.id = v_invite.quote_id and q.accepted_at is not null)
    or exists (select 1 from public.service_jobs j where j.request_id = v_invite.request_id)
    or not nestscout_private.fixture_worker_dispatchable(v_invite.worker_id)
    or not exists (select 1 from public.kael_autonomy a where a.user_id = v_invite.worker_id and a.role = 'worker' and a.mode = 'auto') then
    return null;
  end if;
  v_job := nestscout_private.assign_invitation(v_invite.id, v_invite.worker_id);
  select left(btrim(split_part(btrim(r.description), E'\n', 1)), 48) into v_label from public.service_requests r where r.id = v_invite.request_id;
  insert into public.notifications (recipient_id, kind, request_id, title, body)
    values (v_invite.worker_id, 'job_auto_accepted', v_invite.request_id, 'Kael đã nhận việc giúp bạn',
      'Việc “' || coalesce(v_label, '') || '” khớp hồ sơ của bạn nên Kael đã nhận. Bạn có thể xem trong Đã nhận việc.');
  return v_job;
end;
$$;

alter table nestscout_private.kael_approvals drop constraint kael_approvals_tool_check;
alter table nestscout_private.kael_approvals add constraint kael_approvals_tool_check
  check (tool in ('service_request_submit', 'service_quote_decision', 'worker_offer_decision', 'worker_job_advance', 'work_submission_decision',
    'service_request_redispatch', 'service_request_cancel'));

create or replace function nestscout_private.kael_effect_target_valid(p_actor uuid, p_tool text, p_args jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_quote public.service_quotes%rowtype;
  v_invite public.service_invitations%rowtype;
  v_job public.service_jobs%rowtype;
  v_submission public.service_submissions%rowtype;
  v_request public.service_requests%rowtype;
  v_state record;
  v_version integer;
  v_decision text := p_args ->> 'decision';
  v_reason text := p_args ->> 'reason';
begin
  if p_tool = 'service_quote_decision' then
    v_version := nestscout_private.kael_json_int(p_args -> 'quote_version');
    select q.* into v_quote from public.service_quotes q join public.service_requests r on r.id = q.request_id
      where q.id = nestscout_private.kael_json_uuid(p_args -> 'quote_id') and r.owner_id = p_actor and r.cancelled_at is null;
    return found and v_decision in ('accepted', 'rejected') and v_quote.version = v_version
      and v_quote.accepted_at is null and v_quote.rejected_at is null and v_quote.expires_at > clock_timestamp()
      and not exists (select 1 from public.service_quotes x where x.request_id = v_quote.request_id
        and (x.version > v_quote.version or x.accepted_at is not null));
  elsif p_tool = 'worker_offer_decision' then
    v_version := nestscout_private.kael_json_int(p_args -> 'quote_version');
    select * into v_invite from public.service_invitations i
      where i.id = nestscout_private.kael_json_uuid(p_args -> 'invitation_id') and i.worker_id = p_actor;
    return found and v_decision in ('accept', 'decline') and nestscout_private.kael_worker_dispatchable(p_actor)
      and v_invite.state = 'open' and v_invite.expires_at > clock_timestamp()
      and v_invite.quote_id = nestscout_private.kael_json_uuid(p_args -> 'quote_id')
      and exists (select 1 from public.service_quotes q where q.id = v_invite.quote_id and q.version = v_version and q.accepted_at is not null)
      and not exists (select 1 from public.service_requests r where r.id = v_invite.request_id and r.cancelled_at is not null)
      and not exists (select 1 from public.service_jobs j where j.request_id = v_invite.request_id);
  elsif p_tool = 'worker_job_advance' then
    v_version := nestscout_private.kael_json_int(p_args -> 'version');
    select * into v_job from public.service_jobs j
      where j.id = nestscout_private.kael_json_uuid(p_args -> 'job_id') and j.worker_id = p_actor;
    return found and nestscout_private.kael_worker_dispatchable(p_actor) and v_job.version = v_version
      and ((v_job.stage = 'assigned' and p_args ->> 'next' = 'en_route')
        or (v_job.stage = 'en_route' and p_args ->> 'next' = 'arrived')
        or (v_job.stage = 'arrived' and p_args ->> 'next' = 'working'));
  elsif p_tool = 'work_submission_decision' then
    v_version := nestscout_private.kael_json_int(p_args -> 'job_version');
    select s.* into v_submission from public.service_submissions s
      join public.service_jobs j on j.id = s.job_id
      join public.service_requests r on r.id = j.request_id
      where s.id = nestscout_private.kael_json_uuid(p_args -> 'submission_id') and r.owner_id = p_actor
        and j.version = v_version and j.stage = 'submitted';
    return found and v_submission.decision = 'pending'
      and ((v_decision = 'accepted' and coalesce(v_reason, '') = '')
        or (v_decision = 'revision_requested' and char_length(btrim(coalesce(v_reason, ''))) between 1 and 4000));
  elsif p_tool = 'service_request_redispatch' then
    select * into v_request from public.service_requests r
      where r.id = nestscout_private.kael_json_uuid(p_args -> 'request_id') and r.owner_id = p_actor;
    if not found then
      return false;
    end if;
    select * into v_state from nestscout_private.dispatch_state(p_actor, array[v_request.id]);
    return found and v_state.can_retry and v_state.rounds = nestscout_private.kael_json_int(p_args -> 'rounds');
  elsif p_tool = 'service_request_cancel' then
    return exists (select 1 from public.service_requests r
      where r.id = nestscout_private.kael_json_uuid(p_args -> 'request_id') and r.owner_id = p_actor and r.cancelled_at is null
        and not exists (select 1 from public.service_jobs j where j.request_id = r.id));
  end if;
  return false;
end;
$$;
revoke all on function nestscout_private.kael_effect_target_valid(uuid, text, jsonb) from public, anon, authenticated;

create or replace function nestscout_private.kael_effect_observed(p_actor uuid, p_approval nestscout_private.kael_approvals, p_resource uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_args jsonb := p_approval.args;
begin
  if p_resource is null then
    return null;
  end if;
  if p_approval.tool = 'service_request_submit' then
    return case when exists (select 1 from public.service_requests r
      where r.id = p_resource and r.owner_id = p_actor and r.submission_key = p_approval.id) then 'service_request' end;
  elsif p_approval.tool = 'service_quote_decision' then
    return case when exists (select 1 from public.service_quotes q
      where q.id = p_resource and q.id = nestscout_private.kael_json_uuid(v_args -> 'quote_id')
        and ((v_args ->> 'decision' = 'accepted' and q.accepted_by = p_actor) or (v_args ->> 'decision' = 'rejected' and q.rejected_by = p_actor)))
      then 'service_quote' end;
  elsif p_approval.tool = 'worker_offer_decision' then
    if v_args ->> 'decision' = 'accept' then
      return case when exists (select 1 from public.service_jobs j
        where j.id = p_resource and j.worker_id = p_actor and j.invitation_id = nestscout_private.kael_json_uuid(v_args -> 'invitation_id'))
        then 'service_job' end;
    end if;
    return case when exists (select 1 from public.service_invitations i
      where i.id = p_resource and i.id = nestscout_private.kael_json_uuid(v_args -> 'invitation_id') and i.worker_id = p_actor and i.state = 'declined')
      then 'service_invitation' end;
  elsif p_approval.tool = 'worker_job_advance' then
    return case when exists (select 1 from public.service_job_events e
      where e.job_id = p_resource and e.job_id = nestscout_private.kael_json_uuid(v_args -> 'job_id') and e.actor_id = p_actor
        and e.version = nestscout_private.kael_json_int(v_args -> 'version') + 1 and e.event = v_args ->> 'next')
      then 'service_job' end;
  elsif p_approval.tool = 'work_submission_decision' then
    return case when exists (select 1 from public.service_submissions s
      where s.id = p_resource and s.id = nestscout_private.kael_json_uuid(v_args -> 'submission_id')
        and s.decided_by = p_actor and s.decision = v_args ->> 'decision')
      then 'service_submission' end;
  elsif p_approval.tool = 'service_request_redispatch' then
    return case when exists (select 1 from public.service_dispatch_rounds d
      join public.service_requests r on r.id = d.request_id
      where r.id = p_resource and r.owner_id = p_actor and r.id = nestscout_private.kael_json_uuid(v_args -> 'request_id')
        and d.round = nestscout_private.kael_json_int(v_args -> 'rounds') + 1 and d.outcome = 'invited')
      then 'dispatch_round' end;
  elsif p_approval.tool = 'service_request_cancel' then
    return case when exists (select 1 from public.service_requests r
      where r.id = p_resource and r.id = nestscout_private.kael_json_uuid(v_args -> 'request_id')
        and r.owner_id = p_actor and r.cancelled_by = p_actor)
      then 'service_request' end;
  end if;
  return null;
end;
$$;
revoke all on function nestscout_private.kael_effect_observed(uuid, nestscout_private.kael_approvals, uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION nestscout_private.kael_request_approval(p_actor uuid, p_run_id uuid, p_task_id uuid, p_expected_version integer, p_tool text, p_args jsonb, p_fingerprint text, p_summary text, p_details jsonb, p_ttl_seconds integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_actor uuid := nestscout_private.kael_server_actor(p_actor);
  v_run public.kael_runs := nestscout_private.kael_running_run(p_run_id, v_actor);
  v_task public.kael_tasks;
  v_from text;
  v_approval uuid;
  v_expires timestamptz;
begin
  if v_run.id is null or p_tool is null
    or p_tool not in ('service_request_submit', 'service_quote_decision', 'worker_offer_decision', 'worker_job_advance', 'work_submission_decision', 'service_request_redispatch', 'service_request_cancel')
    or p_fingerprint !~ '^[0-9a-f]{64}$'
    or p_ttl_seconds not between 60 and 3600 or jsonb_typeof(p_args) <> 'object' or jsonb_typeof(p_details) is distinct from 'object'
    or char_length(btrim(coalesce(p_summary, ''))) = 0 then
    return jsonb_build_object('status', 'invalid');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kael-effect:' || v_actor::text, 0));
  if nestscout_private.kael_effect_unresolved(v_actor, p_tool, null) then
    return jsonb_build_object('status', 'unresolved');
  end if;
  select * into v_task from public.kael_tasks t where t.id = p_task_id and t.owner_id = v_actor for update;
  if not found or v_task.status not in ('running', 'waiting_for_input') or p_args ->> 'task_id' is distinct from v_task.id::text then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_task.version <> p_expected_version then
    return jsonb_build_object('status', 'stale');
  end if;
  if p_tool = 'service_request_submit' then
    if v_task.kind <> 'service_request'
      or coalesce(jsonb_array_length(v_task.artifact #> '{draft,missing}'), 1) <> 0
      or char_length(btrim(coalesce(v_task.artifact #>> '{draft,description}', ''))) = 0
      or p_args ->> 'description' is distinct from v_task.artifact #>> '{draft,description}'
      or p_args ->> 'location' is distinct from v_task.artifact #>> '{draft,location}'
      or p_args ->> 'preferred_time' is distinct from v_task.artifact #>> '{draft,preferred_time}'
      or coalesce(p_args ->> 'service_id', '') is distinct from coalesce(v_task.artifact #>> '{draft,service_id}', '') then
      return jsonb_build_object('status', 'invalid');
    end if;
  elsif v_task.kind <> 'workflow_action' or not nestscout_private.kael_effect_target_valid(v_actor, p_tool, p_args) then
    return jsonb_build_object('status', 'invalid');
  end if;
  update nestscout_private.kael_approvals set status = 'superseded' where task_id = v_task.id and status = 'pending';
  v_from := v_task.status;
  update public.kael_tasks set status = 'waiting_for_approval', version = version + 1, updated_at = clock_timestamp(),
    summary = case when p_tool = 'service_request_submit' then 'Đang chờ bạn xác nhận gửi yêu cầu' else 'Đang chờ bạn xác nhận thao tác' end
    where id = v_task.id returning * into v_task;
  v_expires := clock_timestamp() + make_interval(secs => p_ttl_seconds);
  insert into nestscout_private.kael_approvals (owner_id, task_id, run_id, tool, args, fingerprint, summary, details, task_version, expires_at)
    values (v_actor, v_task.id, v_run.id, p_tool, p_args, p_fingerprint, left(p_summary, 200), p_details, v_task.version, v_expires)
    returning id into v_approval;
  insert into public.kael_task_events (task_id, owner_id, run_id, event, from_status, to_status, version)
    values (v_task.id, v_actor, v_run.id, 'approval_requested', v_from, v_task.status, v_task.version);
  return jsonb_build_object('status', 'ok', 'approval_id', v_approval, 'expires_at', v_expires, 'task', nestscout_private.kael_task_json(v_task));
end;
$$;

CREATE OR REPLACE FUNCTION nestscout_private.kael_complete_approval(p_actor uuid, p_run_id uuid, p_approval_id uuid, p_outcome text, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_actor uuid := nestscout_private.kael_server_actor(p_actor);
  v_run public.kael_runs := nestscout_private.kael_running_run(p_run_id, v_actor);
  v_approval nestscout_private.kael_approvals;
  v_task public.kael_tasks;
  v_outcome text := p_outcome;
  v_resource uuid;
  v_kind text;
  v_result jsonb;
  v_from text;
  v_status text;
  v_summary text;
  v_artifact jsonb;
begin
  if p_outcome not in ('succeeded', 'failed', 'uncertain') then
    raise exception using errcode = '22023', message = 'invalid outcome';
  end if;
  select * into v_approval from nestscout_private.kael_approvals a
    where a.id = p_approval_id and a.owner_id = v_actor and a.status = 'consumed' for update;
  if not found or v_run.id is null or v_approval.effect_run_id is distinct from v_run.id then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_task from public.kael_tasks t where t.id = v_approval.task_id and t.owner_id = v_actor for update;
  if v_approval.outcome in ('succeeded', 'failed') then
    return jsonb_build_object('status', 'final', 'outcome', v_approval.outcome, 'result', v_approval.result, 'task', nestscout_private.kael_task_json(v_task));
  end if;
  if v_outcome = 'succeeded' then
    begin
      v_resource := (p_result ->> 'resource_id')::uuid;
    exception when invalid_text_representation then
      v_resource := null;
    end;
    v_kind := nestscout_private.kael_effect_observed(v_actor, v_approval, v_resource);
    if v_kind is null then
      v_outcome := 'uncertain';
    end if;
  end if;
  v_from := v_task.status;
  v_artifact := v_task.artifact;
  if v_outcome = 'succeeded' then
    v_status := 'completed';
    v_summary := case v_approval.tool
      when 'service_request_submit' then 'Đã gửi yêu cầu dịch vụ; chưa có thợ hay lịch hẹn được xác nhận'
      when 'service_quote_decision' then case when v_approval.args ->> 'decision' = 'accepted'
        then 'Đã chấp nhận báo giá; chưa có thợ nhận việc' else 'Đã từ chối báo giá' end
      when 'worker_offer_decision' then case when v_approval.args ->> 'decision' = 'accept'
        then 'Đã nhận việc; công việc đã được giao cho bạn' else 'Đã từ chối lời mời' end
      when 'worker_job_advance' then 'Đã cập nhật tiến độ công việc'
      when 'service_request_redispatch' then 'Đã mời thêm thợ; chưa có thợ nhận việc'
      when 'service_request_cancel' then 'Đã hủy yêu cầu'
      else case when v_approval.args ->> 'decision' = 'accepted'
        then 'Đã nghiệm thu công việc; thanh toán chưa được xác nhận' else 'Đã yêu cầu thợ sửa lại' end
    end;
    v_result := jsonb_build_object('resource_kind', v_kind, 'resource_id', v_resource);
    v_artifact := v_artifact || jsonb_build_object('effect_result', jsonb_build_object('status', 'succeeded', 'resource_kind', v_kind, 'resource_id', v_resource));
  elsif v_outcome = 'failed' then
    v_status := 'waiting_for_input';
    v_summary := case when v_approval.tool = 'service_request_submit' then 'Hệ thống chưa nhận yêu cầu; bản nháp vẫn được giữ'
      else 'Hệ thống chưa thực hiện thao tác; chưa có gì thay đổi' end;
    v_result := jsonb_build_object('reason', left(coalesce(p_result ->> 'reason', 'backend_refused'), 80));
  else
    v_status := 'paused';
    v_summary := case when v_approval.tool = 'service_request_submit' then 'Chưa xác định được kết quả gửi; có thể xác nhận lại an toàn'
      else 'Chưa xác định được kết quả thao tác; có thể kiểm tra lại an toàn' end;
    v_result := jsonb_build_object('reason', case when p_outcome = 'succeeded' then 'unverified_result'
      else left(coalesce(p_result ->> 'reason', 'unverified_result'), 80) end);
  end if;
  if v_task.version <> v_approval.effect_task_version or v_from not in ('running', 'cancelled', 'failed')
    or (v_from = 'running' and not nestscout_private.kael_task_transition_allowed(v_from, v_status)) then
    v_result := jsonb_build_object('reason', 'task_changed');
    update nestscout_private.kael_approvals set outcome = 'uncertain', result = v_result where id = v_approval.id;
    return jsonb_build_object('status', 'conflict', 'outcome', 'uncertain', 'result', v_result, 'task', nestscout_private.kael_task_json(v_task));
  end if;
  if v_from <> 'running' then
    update nestscout_private.kael_approvals set outcome = v_outcome, result = v_result where id = v_approval.id;
    if v_outcome = 'succeeded' then
      update public.kael_tasks set artifact = v_artifact, version = version + 1, updated_at = clock_timestamp()
        where id = v_task.id returning * into v_task;
      insert into public.kael_task_events (task_id, owner_id, run_id, event, from_status, to_status, version)
        values (v_task.id, v_actor, v_run.id, 'effect_succeeded', v_from, v_task.status, v_task.version);
    end if;
    return jsonb_build_object('status', 'ok', 'outcome', v_outcome, 'result', v_result, 'task', nestscout_private.kael_task_json(v_task));
  end if;
  update nestscout_private.kael_approvals set outcome = v_outcome, result = v_result where id = v_approval.id;
  update public.kael_tasks set status = v_status, summary = v_summary, artifact = v_artifact, version = version + 1, updated_at = clock_timestamp()
    where id = v_task.id returning * into v_task;
  insert into public.kael_task_events (task_id, owner_id, run_id, event, from_status, to_status, version)
    values (v_task.id, v_actor, v_run.id, 'effect_' || v_outcome, v_from, v_task.status, v_task.version);
  return jsonb_build_object('status', 'ok', 'outcome', v_outcome, 'result', v_result, 'task', nestscout_private.kael_task_json(v_task));
end;
$$;

select nestscout_private.schedule_dispatch_sweeper();
