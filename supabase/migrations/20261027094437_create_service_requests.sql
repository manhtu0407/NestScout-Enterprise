create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id),
  submission_key uuid not null,
  description text not null check (description = btrim(description) and char_length(description) between 1 and 4000),
  created_at timestamptz not null default now(),
  unique (owner_id, submission_key)
);

alter table public.service_requests enable row level security;

revoke all on table public.service_requests from public, anon, authenticated;
grant select on table public.service_requests to authenticated;
grant insert (submission_key, description) on public.service_requests to authenticated;

create policy service_requests_select_owner on public.service_requests
  for select to authenticated
  using ((select auth.uid()) = owner_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create policy service_requests_insert_owner on public.service_requests
  for insert to authenticated
  with check ((select auth.uid()) = owner_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create function public.submit_service_request(p_submission_key uuid, p_description text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_id uuid;
  v_description text;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_submission_key is null or p_description is null
    or char_length(btrim(p_description)) not between 1 and 4000 then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;

  insert into public.service_requests (submission_key, description)
  values (p_submission_key, btrim(p_description))
  on conflict (owner_id, submission_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id, description into v_id, v_description
    from public.service_requests
    where owner_id = v_owner and submission_key = p_submission_key;
    if v_description is distinct from btrim(p_description) then
      raise exception using errcode = '22023', message = 'submission key conflict';
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.submit_service_request(uuid, text) from public, anon, authenticated;
grant execute on function public.submit_service_request(uuid, text) to authenticated;
