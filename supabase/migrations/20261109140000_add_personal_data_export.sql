create function nestscout_private.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  return jsonb_build_object(
    'exported_at', clock_timestamp(),
    'account', (select jsonb_build_object('id', u.id, 'phone', u.phone, 'email', u.email, 'created_at', u.created_at)
      from auth.users u where u.id = v_owner),
    'customer_profile', (select to_jsonb(p) from public.customer_profiles p where p.user_id = v_owner),
    'customer_settings', (select to_jsonb(s) from public.customer_settings s where s.user_id = v_owner),
    'worker_profile', (select to_jsonb(w) from public.worker_public_profiles w where w.worker_id = v_owner),
    'service_requests', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.service_requests r where r.owner_id = v_owner), '[]'::jsonb),
    'request_photos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'request_id', p.request_id, 'created_at', p.created_at) order by p.created_at)
      from public.request_photos p where p.owner_id = v_owner), '[]'::jsonb),
    'quotes_received', coalesce((select jsonb_agg(to_jsonb(q) order by q.request_id, q.version) from public.service_quotes q
      join public.service_requests r on r.id = q.request_id where r.owner_id = v_owner), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'request_id', j.request_id, 'stage', j.stage, 'created_at', j.created_at) order by j.created_at)
      from public.service_jobs j join public.service_requests r on r.id = j.request_id where r.owner_id = v_owner or j.worker_id = v_owner), '[]'::jsonb),
    'job_change_requests', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.job_change_requests c
      where nestscout_private.job_change_participant(c.job_id, v_owner)), '[]'::jsonb),
    'saved_workers', coalesce((select jsonb_agg(jsonb_build_object('profile_id', s.profile_id, 'created_at', s.created_at) order by s.created_at)
      from public.customer_saved_workers s where s.customer_id = v_owner), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from public.notifications n where n.recipient_id = v_owner), '[]'::jsonb),
    'support_requests', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from public.support_requests s where s.owner_id = v_owner), '[]'::jsonb),
    'kael_conversations', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'mode', c.mode, 'updated_at', c.updated_at,
        'messages', coalesce((select jsonb_agg(jsonb_build_object('seq', m.seq, 'role', m.role, 'content', m.content, 'created_at', m.created_at) order by m.seq)
          from public.kael_messages m where m.conversation_id = c.id), '[]'::jsonb)) order by c.updated_at)
      from public.kael_conversations c where c.owner_id = v_owner), '[]'::jsonb),
    'kael_memory', coalesce((select jsonb_agg(jsonb_build_object('mode', p.mode, 'preference', p.preference, 'value', p.value, 'updated_at', p.updated_at) order by p.mode, p.preference)
      from public.kael_memory_preferences p where p.owner_id = v_owner), '[]'::jsonb),
    'consents', coalesce((select jsonb_agg(jsonb_build_object('purpose', e.purpose, 'granted', e.granted, 'policy_version', e.policy_version, 'recorded_at', e.recorded_at) order by e.id)
      from public.consent_events e where e.user_id = v_owner), '[]'::jsonb),
    'terms_acceptances', coalesce((select jsonb_agg(to_jsonb(t) order by t.accepted_at) from public.terms_acceptances t where t.user_id = v_owner), '[]'::jsonb),
    'account_deletion_request', (select to_jsonb(d) from public.account_deletion_requests d where d.user_id = v_owner)
  );
end;
$$;
revoke all on function nestscout_private.export_my_data() from public, anon, authenticated;
grant execute on function nestscout_private.export_my_data() to authenticated;

create function public.export_my_data()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select nestscout_private.export_my_data(); $$;
revoke all on function public.export_my_data() from public, anon, authenticated;
grant execute on function public.export_my_data() to authenticated;
