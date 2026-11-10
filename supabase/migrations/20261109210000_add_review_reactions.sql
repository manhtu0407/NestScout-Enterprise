create table public.review_reactions (
  review_id uuid not null references public.worker_reviews (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reaction text not null check (reaction in ('helpful', 'thanks', 'accurate', 'detailed')),
  created_at timestamptz not null default now(),
  primary key (review_id, user_id, reaction)
);
create index review_reactions_review on public.review_reactions (review_id, reaction);

alter table public.review_reactions enable row level security;
revoke all on table public.review_reactions from public, anon, authenticated;

create function nestscout_private.toggle_review_reaction(p_review_id uuid, p_reaction text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_review_id is null or p_reaction is null or p_reaction not in ('helpful', 'thanks', 'accurate', 'detailed') then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  if not exists (
    select 1 from public.worker_reviews r join public.worker_public_profiles p on p.id = r.profile_id
    where r.id = p_review_id and p.listed
  ) then
    raise exception using errcode = '22023', message = 'review not found';
  end if;
  delete from public.review_reactions where review_id = p_review_id and user_id = v_user and reaction = p_reaction;
  if found then
    return false;
  end if;
  insert into public.review_reactions (review_id, user_id, reaction) values (p_review_id, v_user, p_reaction);
  return true;
end;
$$;
revoke all on function nestscout_private.toggle_review_reaction(uuid, text) from public, anon, authenticated;
grant execute on function nestscout_private.toggle_review_reaction(uuid, text) to authenticated;

create function public.toggle_review_reaction(p_review_id uuid, p_reaction text)
returns boolean language sql security invoker set search_path = ''
as $$ select nestscout_private.toggle_review_reaction(p_review_id, p_reaction); $$;
revoke all on function public.toggle_review_reaction(uuid, text) from public, anon, authenticated;
grant execute on function public.toggle_review_reaction(uuid, text) to authenticated;

create function nestscout_private.review_reactions(p_review_ids uuid[])
returns table (review_id uuid, reaction text, total integer, reacted boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_review_ids is null or cardinality(p_review_ids) > 50 then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  return query
  select x.review_id, x.reaction, count(*)::integer, bool_or(x.user_id = auth.uid())
  from public.review_reactions x
  join public.worker_reviews r on r.id = x.review_id
  join public.worker_public_profiles p on p.id = r.profile_id and p.listed
  where x.review_id = any (p_review_ids)
  group by x.review_id, x.reaction
  order by x.review_id, x.reaction;
end;
$$;
revoke all on function nestscout_private.review_reactions(uuid[]) from public, anon, authenticated;
grant execute on function nestscout_private.review_reactions(uuid[]) to authenticated;

create function public.review_reactions(p_review_ids uuid[])
returns table (review_id uuid, reaction text, total integer, reacted boolean)
language sql stable security invoker set search_path = ''
as $$ select * from nestscout_private.review_reactions(p_review_ids); $$;
revoke all on function public.review_reactions(uuid[]) from public, anon, authenticated;
grant execute on function public.review_reactions(uuid[]) to authenticated;
