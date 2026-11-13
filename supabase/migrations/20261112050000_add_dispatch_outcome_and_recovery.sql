alter table public.service_requests add column cancelled_at timestamptz;
alter table public.service_requests add column cancelled_by uuid references auth.users (id);
alter table public.service_requests add constraint service_requests_cancellation_consistent
  check ((cancelled_at is null) = (cancelled_by is null));

alter table nestscout_private.auto_dispatch_settings
  add column max_rounds integer not null default 3 check (max_rounds between 1 and 10),
  add column retry_cooldown_minutes integer not null default 5 check (retry_cooldown_minutes between 1 and 1440);

create table public.service_dispatch_rounds (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id),
  quote_id uuid not null,
  round integer not null check (round > 0),
  invited_count integer not null check (invited_count >= 0),
  reason text not null check (reason in ('quote_accepted', 'declined', 'manual_retry')),
  created_at timestamptz not null default now(),
  unique (request_id, round),
  foreign key (quote_id, request_id) references public.service_quotes (id, request_id)
);

alter table public.service_dispatch_rounds enable row level security;
revoke all on table public.service_dispatch_rounds from public, anon, authenticated;
grant select on table public.service_dispatch_rounds to authenticated;

create policy service_dispatch_rounds_select_owner on public.service_dispatch_rounds
  for select to authenticated
  using (coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
    and exists (select 1 from public.service_requests r where r.id = request_id and r.owner_id = (select auth.uid())));

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('quote_received', 'job_assigned', 'job_progress', 'work_submitted', 'job_completed', 'scope_proposed',
    'job_offered', 'work_approved', 'revision_requested', 'work_disputed', 'scope_approved', 'scope_rejected', 'resume_agreed', 'review_received',
    'change_requested', 'change_decided', 'job_auto_accepted', 'dispatch_exhausted'));

create function nestscout_private.dispatch_request(p_request_id uuid, p_quote_id uuid, p_reason text)
returns integer
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
  v_label text;
begin
  select * into v_settings from nestscout_private.auto_dispatch_settings;
  if not v_settings.enabled then
    return null;
  end if;
  select * into v_request from public.service_requests r where r.id = p_request_id for update;
  if not found or v_request.service_id is null or v_request.cancelled_at is not null
    or exists (select 1 from public.service_jobs j where j.request_id = p_request_id)
    or not exists (select 1 from public.service_quotes q where q.id = p_quote_id and q.request_id = p_request_id and q.accepted_at is not null) then
    return null;
  end if;
  select coalesce(max(d.round), 0) + 1 into v_round from public.service_dispatch_rounds d where d.request_id = p_request_id;
  if p_reason = 'manual_retry' or v_round <= v_settings.max_rounds then
    for v_worker in
      select p.worker_id from public.worker_public_profiles p
      where v_request.service_id = any (p.service_ids)
        and p.worker_id <> v_request.owner_id
        and nestscout_private.fixture_worker_dispatchable(p.worker_id)
        and not exists (select 1 from public.service_invitations i where i.request_id = p_request_id and i.worker_id = p.worker_id)
      order by (select count(*) from public.service_jobs j where j.worker_id = p.worker_id and j.stage not in ('submitted', 'completed')), p.worker_id
      limit v_settings.max_invites
    loop
      exit when exists (select 1 from public.service_jobs j where j.request_id = p_request_id);
      insert into public.service_invitations (request_id, quote_id, worker_id, expires_at)
        values (p_request_id, p_quote_id, v_worker, clock_timestamp() + make_interval(mins => v_settings.offer_minutes))
        returning id into v_invitation;
      v_invited := v_invited + 1;
      perform nestscout_private.auto_accept_invitation(v_invitation);
    end loop;
  end if;
  insert into public.service_dispatch_rounds (request_id, quote_id, round, invited_count, reason)
    values (p_request_id, p_quote_id, v_round, v_invited, p_reason);
  if v_invited = 0 and p_reason <> 'manual_retry' then
    v_label := left(btrim(split_part(btrim(v_request.description), E'\n', 1)), 48);
    insert into public.notifications (recipient_id, kind, request_id, title, body)
      values (v_request.owner_id, 'dispatch_exhausted', p_request_id, 'Chưa có thợ nhận việc',
        'Yêu cầu “' || coalesce(v_label, '') || '” chưa có thợ nhận. Bạn có thể mời lại hoặc hủy trong Yêu cầu của tôi.');
  end if;
  return v_invited;
end;
$$;
revoke all on function nestscout_private.dispatch_request(uuid, uuid, text) from public, anon, authenticated;

create or replace function nestscout_private.dispatch_accepted_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform nestscout_private.dispatch_request(new.request_id, new.id, 'quote_accepted');
  return new;
end;
$$;
revoke all on function nestscout_private.dispatch_accepted_quote() from public, anon, authenticated;

create function nestscout_private.redispatch_after_decline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.service_invitations i where i.request_id = new.request_id and i.state = 'open' and i.expires_at > clock_timestamp())
    or exists (select 1 from public.service_jobs j where j.request_id = new.request_id) then
    return new;
  end if;
  perform nestscout_private.dispatch_request(new.request_id, new.quote_id, 'declined');
  return new;
end;
$$;
revoke all on function nestscout_private.redispatch_after_decline() from public, anon, authenticated;

create trigger service_invitations_redispatch after update of state on public.service_invitations
  for each row when (old.state = 'open' and new.state = 'declined')
  execute function nestscout_private.redispatch_after_decline();

create function nestscout_private.dispatch_summary(p_request_ids uuid[])
returns table (request_id uuid, state text, open_invites integer, earliest_expiry timestamptz, rounds integer, can_retry boolean, can_cancel boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_settings nestscout_private.auto_dispatch_settings%rowtype;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_request_ids is null or cardinality(p_request_ids) > 100 then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  select * into v_settings from nestscout_private.auto_dispatch_settings;
  return query
  with f as (
    select r.id as rid, r.service_id as sid, r.cancelled_at is not null as cancelled,
      exists (select 1 from public.service_jobs j where j.request_id = r.id) as has_job,
      exists (select 1 from public.service_quotes q where q.request_id = r.id and q.accepted_at is not null) as has_accepted,
      (select count(*) from public.service_invitations i where i.request_id = r.id and i.state = 'open' and i.expires_at > clock_timestamp()) as live,
      (select min(i.expires_at) from public.service_invitations i where i.request_id = r.id and i.state = 'open' and i.expires_at > clock_timestamp()) as next_expiry,
      (select count(*) from public.service_invitations i where i.request_id = r.id) as total,
      (select count(*) from public.service_dispatch_rounds d where d.request_id = r.id) as round_count,
      (select max(d.created_at) from public.service_dispatch_rounds d where d.request_id = r.id) as last_round
    from public.service_requests r
    where r.id = any (p_request_ids) and r.owner_id = v_owner
  ), s as (
    select f.*,
      case
        when f.cancelled then 'cancelled'
        when f.has_job then 'assigned'
        when not f.has_accepted then 'awaiting_acceptance'
        when f.live > 0 then 'searching'
        when f.total = 0 and f.round_count = 0 then 'not_dispatched'
        when f.total = 0 then 'no_match'
        else 'exhausted'
      end as outcome
    from f
  )
  select s.rid, s.outcome, s.live::integer, s.next_expiry, s.round_count::integer,
    s.outcome in ('no_match', 'exhausted') and v_settings.enabled and s.sid is not null
      and (s.last_round is null or s.last_round <= clock_timestamp() - make_interval(mins => v_settings.retry_cooldown_minutes)),
    s.outcome not in ('cancelled', 'assigned')
  from s;
end;
$$;
revoke all on function nestscout_private.dispatch_summary(uuid[]) from public, anon, authenticated;
grant execute on function nestscout_private.dispatch_summary(uuid[]) to authenticated;

create function public.get_dispatch_summary(p_request_ids uuid[])
returns table (request_id uuid, state text, open_invites integer, earliest_expiry timestamptz, rounds integer, can_retry boolean, can_cancel boolean)
language sql
security invoker
set search_path = ''
as $$ select * from nestscout_private.dispatch_summary(p_request_ids); $$;
revoke all on function public.get_dispatch_summary(uuid[]) from public, anon, authenticated;
grant execute on function public.get_dispatch_summary(uuid[]) to authenticated;

create function nestscout_private.cancel_service_request(p_request_id uuid)
returns uuid
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
  select * into v_request from public.service_requests r where r.id = p_request_id and r.owner_id = v_owner for update;
  if not found then
    raise exception using errcode = '42501', message = 'request unavailable';
  end if;
  if v_request.cancelled_at is not null then
    return v_request.id;
  end if;
  if exists (select 1 from public.service_jobs j where j.request_id = v_request.id) then
    raise exception using errcode = '40001', message = 'already assigned';
  end if;
  update public.service_requests set cancelled_at = clock_timestamp(), cancelled_by = v_owner where id = v_request.id;
  update public.service_invitations set state = 'cancelled' where request_id = v_request.id and state = 'open';
  return v_request.id;
end;
$$;
revoke all on function nestscout_private.cancel_service_request(uuid) from public, anon, authenticated;
grant execute on function nestscout_private.cancel_service_request(uuid) to authenticated;

create function public.cancel_service_request(p_request_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select nestscout_private.cancel_service_request(p_request_id); $$;
revoke all on function public.cancel_service_request(uuid) from public, anon, authenticated;
grant execute on function public.cancel_service_request(uuid) to authenticated;

create function nestscout_private.redispatch_service_request(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_request public.service_requests%rowtype;
  v_quote uuid;
  v_summary record;
  v_invited integer;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  select * into v_request from public.service_requests r where r.id = p_request_id and r.owner_id = v_owner for update;
  if not found then
    raise exception using errcode = '42501', message = 'request unavailable';
  end if;
  select * into v_summary from nestscout_private.dispatch_summary(array[p_request_id]);
  if not found or not v_summary.can_retry then
    raise exception using errcode = '22023', message = 'dispatch unavailable';
  end if;
  select q.id into v_quote from public.service_quotes q where q.request_id = p_request_id and q.accepted_at is not null;
  v_invited := nestscout_private.dispatch_request(p_request_id, v_quote, 'manual_retry');
  if v_invited is null then
    raise exception using errcode = '22023', message = 'dispatch unavailable';
  end if;
  return v_invited;
end;
$$;
revoke all on function nestscout_private.redispatch_service_request(uuid) from public, anon, authenticated;
grant execute on function nestscout_private.redispatch_service_request(uuid) to authenticated;

create function public.redispatch_service_request(p_request_id uuid)
returns integer
language sql
security invoker
set search_path = ''
as $$ select nestscout_private.redispatch_service_request(p_request_id); $$;
revoke all on function public.redispatch_service_request(uuid) from public, anon, authenticated;
grant execute on function public.redispatch_service_request(uuid) to authenticated;

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
  if v_quote.version is distinct from p_version then raise exception using errcode = '40001', message = 'stale quote'; end if;
  if v_quote.accepted_at is not null then return v_quote.id; end if;
  if v_quote.rejected_at is not null
    or exists (select 1 from public.service_quotes q where q.request_id = v_request_id and q.accepted_at is not null)
    or exists (select 1 from public.service_quotes q where q.request_id = v_request_id and q.version > v_quote.version) then
    raise exception using errcode = '40001', message = 'stale quote';
  end if;
  if exists (select 1 from public.service_requests r where r.id = v_request_id and r.cancelled_at is not null) then
    raise exception using errcode = '22023', message = 'request cancelled';
  end if;
  if v_quote.expires_at <= clock_timestamp() then raise exception using errcode = '22023', message = 'quote expired'; end if;
  update public.service_quotes set accepted_at = clock_timestamp(), accepted_by = v_owner where id = p_quote_id;
  return p_quote_id;
end;
$$;
