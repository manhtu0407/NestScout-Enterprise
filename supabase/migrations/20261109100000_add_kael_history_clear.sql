create function nestscout_private.clear_kael_history(p_mode text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_deleted integer;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_mode is null or p_mode not in ('client', 'worker') then
    raise exception using errcode = '22023', message = 'invalid mode';
  end if;
  if exists (select 1 from public.kael_runs r join public.kael_conversations c on c.id = r.conversation_id
    where c.owner_id = v_owner and c.mode = p_mode and r.status = 'running') then
    raise exception using errcode = '22023', message = 'run active';
  end if;
  delete from public.kael_messages m
  using public.kael_conversations c
  where m.conversation_id = c.id and c.owner_id = v_owner and c.mode = p_mode and m.owner_id = v_owner;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function nestscout_private.clear_kael_history(text) from public, anon, authenticated;
grant execute on function nestscout_private.clear_kael_history(text) to authenticated;

create function public.clear_kael_history(p_mode text)
returns integer language sql security invoker set search_path = ''
as $$ select nestscout_private.clear_kael_history(p_mode); $$;
revoke all on function public.clear_kael_history(text) from public, anon, authenticated;
grant execute on function public.clear_kael_history(text) to authenticated;
