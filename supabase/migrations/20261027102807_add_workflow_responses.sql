alter table public.service_quotes add column rejected_at timestamptz;
alter table public.service_quotes add column rejected_by uuid references auth.users (id);
alter table public.service_quotes add constraint service_quotes_rejection_consistent
  check ((rejected_at is null) = (rejected_by is null) and not (rejected_at is not null and accepted_at is not null));

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
  if v_quote.expires_at <= clock_timestamp() then raise exception using errcode = '22023', message = 'quote expired'; end if;
  update public.service_quotes set accepted_at = clock_timestamp(), accepted_by = v_owner where id = p_quote_id;
  return p_quote_id;
end;
$$;

create function nestscout_private.reject_service_quote(p_quote_id uuid, p_version integer)
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
revoke all on function nestscout_private.reject_service_quote(uuid, integer) from public, anon, authenticated;
grant execute on function nestscout_private.reject_service_quote(uuid, integer) to authenticated;

create function public.reject_service_quote(p_quote_id uuid, p_version integer)
returns uuid language sql security invoker set search_path = ''
as $$ select nestscout_private.reject_service_quote(p_quote_id, p_version); $$;
revoke all on function public.reject_service_quote(uuid, integer) from public, anon, authenticated;
grant execute on function public.reject_service_quote(uuid, integer) to authenticated;

create function nestscout_private.decline_service_invitation(p_invitation_id uuid, p_quote_id uuid, p_quote_version integer)
returns uuid
language plpgsql security definer set search_path = ''
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
  if v_invite.state <> 'open' or v_invite.expires_at <= clock_timestamp()
    or exists (select 1 from public.service_jobs j where j.request_id = v_invite.request_id) then
    raise exception using errcode = '22023', message = 'invitation unavailable';
  end if;
  update public.service_invitations set state = 'declined' where id = p_invitation_id;
  return p_invitation_id;
end;
$$;
revoke all on function nestscout_private.decline_service_invitation(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function nestscout_private.decline_service_invitation(uuid, uuid, integer) to authenticated;

create function public.decline_service_invitation(p_invitation_id uuid, p_quote_id uuid, p_quote_version integer)
returns uuid language sql security invoker set search_path = ''
as $$ select nestscout_private.decline_service_invitation(p_invitation_id, p_quote_id, p_quote_version); $$;
revoke all on function public.decline_service_invitation(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.decline_service_invitation(uuid, uuid, integer) to authenticated;
