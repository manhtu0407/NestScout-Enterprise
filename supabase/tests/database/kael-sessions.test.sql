begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated');
insert into auth.users (id, aud, role, is_anonymous) values
  ('00000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select isnt(public.set_consent('ai_sharing', true, '2026-11-09'), null, 'Owner one consents to AI sharing');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select isnt(public.set_consent('ai_sharing', true, '2026-11-09'), null, 'Owner two consents to AI sharing');
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('test.a', public.kael_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000001', null, 'client', 'Sửa vòi nước bị rò ở bếp')::text, true);
select set_config('test.a_conv', current_setting('test.a')::jsonb ->> 'conversation_id', true);
select ok(public.kael_finish_run('00000000-0000-4000-8000-0000000000a1', (current_setting('test.a')::jsonb ->> 'run_id')::uuid, 'completed', 'Mình đã ghi nhận việc sửa vòi nước', true, null, null, 0, 0, 0, null), 'Session A finishes its first turn');
select set_config('test.b', public.kael_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000002', null, 'client', 'Cần vệ sinh sofa vải ba chỗ ngồi')::text, true);
select set_config('test.b_conv', current_setting('test.b')::jsonb ->> 'conversation_id', true);
select ok(public.kael_finish_run('00000000-0000-4000-8000-0000000000a1', (current_setting('test.b')::jsonb ->> 'run_id')::uuid, 'completed', 'Đã rõ, sofa ba chỗ', true, null, null, 0, 0, 0, null), 'Session B finishes its first turn');
select set_config('test.c', public.kael_start_run('00000000-0000-4000-8000-0000000000b2', '30000000-0000-4000-8000-000000000003', null, 'client', 'Tin nhắn riêng của chủ khác')::text, true);
select set_config('test.c_conv', current_setting('test.c')::jsonb ->> 'conversation_id', true);
select ok(public.kael_finish_run('00000000-0000-4000-8000-0000000000b2', (current_setting('test.c')::jsonb ->> 'run_id')::uuid, 'completed', 'Chào bạn', true, null, null, 0, 0, 0, null), 'Another owner has a session');
select isnt(current_setting('test.a_conv'), current_setting('test.b_conv'), 'Each first message opens its own persistent conversation');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select set_config('test.list', public.kael_list_conversations('client')::text, true);
select is(jsonb_array_length(current_setting('test.list')::jsonb), 2, 'The list holds only the owner''s conversations');
select is(current_setting('test.list')::jsonb #>> '{0,id}', current_setting('test.b_conv'), 'The newest conversation is listed first');
select is(current_setting('test.list')::jsonb #>> '{1,title}', 'Sửa vòi nước bị rò ở bếp', 'The default title is read from the first message');
select is(current_setting('test.list')::jsonb #>> '{0,preview}', 'Đã rõ, sofa ba chỗ', 'The preview is the latest message');
select is(public.kael_list_conversations('worker'), '[]'::jsonb, 'The list is scoped to the mode');
select is(jsonb_array_length(public.kael_list_conversations('client', 'sofa')), 1, 'Search finds a conversation by its name');
select is(jsonb_array_length(public.kael_list_conversations('client', 'SOFA')), 1, 'Search ignores case');
select is(jsonb_array_length(public.kael_list_conversations('client', '%')), 0, 'Search treats wildcard characters literally');
select throws_ok($$ select public.kael_list_conversations('admin') $$, '22023', null, 'An unknown mode is rejected');

select is(public.kael_open_conversation(current_setting('test.a_conv')::uuid, 'client') #>> '{messages,0,content}', 'Sửa vòi nước bị rò ở bếp', 'Opening by identifier loads that conversation''s messages');
select is(jsonb_array_length(public.kael_open_conversation(current_setting('test.a_conv')::uuid, 'client') -> 'messages'), 2, 'Opening loads only that conversation''s messages');
select is(public.kael_open_conversation(current_setting('test.b_conv')::uuid, 'client') #>> '{messages,0,content}', 'Cần vệ sinh sofa vải ba chỗ ngồi', 'Another session opens independently');
select throws_ok(format($$ select public.kael_open_conversation(%L, 'client') $$, current_setting('test.c_conv')), '22023', null, 'Another owner''s conversation cannot be opened');
select throws_ok(format($$ select public.kael_open_conversation(%L, 'worker') $$, current_setting('test.a_conv')), '22023', null, 'A conversation cannot be opened in the other mode');
select is(public.kael_conversation_state('client') ->> 'conversation_id', current_setting('test.b_conv'), 'Restoring the latest session still returns the newest conversation');

select is(public.kael_rename_conversation(current_setting('test.a_conv')::uuid, '  Sửa vòi bếp  ') ->> 'title', 'Sửa vòi bếp', 'A conversation is renamed');
select is(jsonb_array_length(public.kael_list_conversations('client', 'vòi bếp')), 1, 'The new name is searchable');
select is(public.kael_list_conversations('client') #>> '{1,title}', 'Sửa vòi bếp', 'Renaming does not reorder by recency');
select is(public.kael_rename_conversation(current_setting('test.a_conv')::uuid, '   ') ->> 'title', 'Sửa vòi nước bị rò ở bếp', 'A blank name restores the default title');
select throws_ok(format($$ select public.kael_rename_conversation(%L, %L) $$, current_setting('test.a_conv'), repeat('x', 81)), '22023', null, 'An overlong name is rejected');
select throws_ok(format($$ select public.kael_rename_conversation(%L, 'Chiếm quyền') $$, current_setting('test.c_conv')), '22023', null, 'Another owner''s conversation cannot be renamed');

select is(public.kael_set_conversation_pinned(current_setting('test.a_conv')::uuid, true) ->> 'pinned', 'true', 'A conversation is pinned');
select is(public.kael_list_conversations('client') #>> '{0,id}', current_setting('test.a_conv'), 'Pinned conversations are listed first');
select is(public.kael_list_conversations('client') #>> '{0,pinned}', 'true', 'The list reports the pinned flag');
select throws_ok(format($$ select public.kael_set_conversation_pinned(%L, true) $$, current_setting('test.c_conv')), '22023', null, 'Another owner''s conversation cannot be pinned');

select is(public.kael_set_conversation_archived(current_setting('test.a_conv')::uuid, true) ->> 'archived', 'true', 'A conversation is archived');
select is(jsonb_array_length(public.kael_list_conversations('client')), 1, 'Archived conversations leave the main list');
select is(public.kael_list_conversations('client', null, true) #>> '{0,id}', current_setting('test.a_conv'), 'Archived conversations are listed separately');
select is(public.kael_list_conversations('client', null, true) #>> '{0,pinned}', 'false', 'Archiving clears the pin');
select is(jsonb_array_length(public.kael_open_conversation(current_setting('test.a_conv')::uuid, 'client') -> 'messages'), 2, 'Archiving keeps the content');
select is(public.kael_set_conversation_archived(current_setting('test.a_conv')::uuid, false) ->> 'archived', 'false', 'A conversation is unarchived');
select is(jsonb_array_length(public.kael_list_conversations('client')), 2, 'Unarchived conversations return to the main list');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is(jsonb_array_length(public.kael_list_conversations('client')), 1, 'Another owner lists only their own conversation');
select is((select count(*)::integer from public.kael_conversations), 1, 'Direct reads are limited to the owner');
select is((select count(*)::integer from public.kael_messages where conversation_id = current_setting('test.a_conv')::uuid), 0, 'Another owner reads none of the messages');
select throws_ok(format($$ select public.kael_delete_conversation(%L) $$, current_setting('test.a_conv')), '22023', null, 'Another owner''s conversation cannot be deleted');
select throws_ok(format($$ update public.kael_conversations set title = 'x' where id = %L $$, current_setting('test.b_conv')), '42501', null, 'Clients cannot write conversation columns directly');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$ select public.kael_list_conversations('client') $$, '42501', null, 'Anonymous sessions cannot list conversations');
select throws_ok(format($$ select public.kael_delete_conversation(%L) $$, current_setting('test.a_conv')), '42501', null, 'Anonymous sessions cannot delete conversations');
reset role;
set local role anon;
select throws_ok($$ select public.kael_list_conversations('client') $$, '42501', null, 'The anonymous role cannot list conversations');
reset role;

insert into public.service_requests (owner_id, submission_key, description, location) values
  ('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000f1', 'Sửa vòi nước bếp', 'Quận 3');
insert into public.kael_tasks (id, conversation_id, owner_id, title, kind, status) values
  ('30000000-0000-4000-8000-0000000000e1', current_setting('test.a_conv')::uuid, '00000000-0000-4000-8000-0000000000a1', 'Sửa vòi', 'service_request', 'running');
insert into nestscout_private.kael_approvals (id, owner_id, task_id, run_id, tool, args, fingerprint, summary, task_version, status, outcome, expires_at, decided_at, effect_run_id, effect_task_version)
  values ('30000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000e1', (current_setting('test.a')::jsonb ->> 'run_id')::uuid,
    'service_request_submit', '{}'::jsonb, repeat('a', 64), 'Gửi yêu cầu', 1, 'consumed', 'uncertain', clock_timestamp() + interval '1 hour', clock_timestamp(), (current_setting('test.a')::jsonb ->> 'run_id')::uuid, 1);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok(format($$ select public.kael_delete_conversation(%L) $$, current_setting('test.a_conv')), '22023', null, 'A conversation with an unreconciled effect cannot be deleted');
select is(jsonb_array_length(public.kael_open_conversation(current_setting('test.a_conv')::uuid, 'client') -> 'messages'), 2, 'A refused delete leaves the conversation intact');
select is(jsonb_array_length(public.kael_conversation_state('client') -> 'approvals'), 1, 'The unresolved check stays reconcilable');
reset role;
update nestscout_private.kael_approvals set outcome = 'succeeded', result = '{}'::jsonb where id = '30000000-0000-4000-8000-0000000000e2';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is(public.kael_delete_conversation(current_setting('test.a_conv')::uuid) ->> 'deleted', 'true', 'A reconciled conversation is deleted');
select is(jsonb_array_length(public.kael_list_conversations('client')), 1, 'A deleted conversation leaves the list');
select is(jsonb_array_length(public.kael_list_conversations('client', null, true)), 0, 'A deleted conversation is not in the archive either');
select throws_ok(format($$ select public.kael_open_conversation(%L, 'client') $$, current_setting('test.a_conv')), '22023', null, 'A deleted conversation cannot be opened');
select throws_ok(format($$ select public.kael_rename_conversation(%L, 'Lại') $$, current_setting('test.a_conv')), '22023', null, 'A deleted conversation cannot be renamed');
select throws_ok(format($$ select public.kael_delete_conversation(%L) $$, current_setting('test.a_conv')), '22023', null, 'A conversation cannot be deleted twice');
select is((select count(*)::integer from public.service_requests), 1, 'Deleting a conversation never removes the service request');
reset role;
select is((select count(*)::integer from public.kael_messages where conversation_id = current_setting('test.a_conv')::uuid), 0, 'Deleting removes the message content');
select is((select count(*)::integer from public.kael_tasks where conversation_id = current_setting('test.a_conv')::uuid), 0, 'Deleting removes the conversation''s tasks');
select is((select count(*)::integer from nestscout_private.kael_approvals where task_id = '30000000-0000-4000-8000-0000000000e1'), 0, 'Deleting removes the reconciled approvals');
select is((select count(*)::integer from public.kael_runs where conversation_id = current_setting('test.a_conv')::uuid), 1, 'Deleting keeps the run ledger');
select is((select count(*)::integer from public.service_requests where owner_id = '00000000-0000-4000-8000-0000000000a1'), 1, 'The request is unchanged for its owner');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.kael_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000004', current_setting('test.a_conv')::uuid, 'client', 'Tiếp tục') ->> 'status', 'invalid', 'A deleted conversation cannot be continued');
select set_config('test.d', public.kael_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000005', current_setting('test.b_conv')::uuid, 'client', 'Thêm ghế bọc da')::text, true);
select is(current_setting('test.d')::jsonb ->> 'status', 'started', 'An existing session continues after another one is deleted');
select ok(public.kael_finish_run('00000000-0000-4000-8000-0000000000a1', (current_setting('test.d')::jsonb ->> 'run_id')::uuid, 'completed', 'Đã thêm', true, null, null, 0, 0, 0, null), 'The continued turn finishes');
reset role;

update public.kael_conversations set archived_at = clock_timestamp() where id = current_setting('test.b_conv')::uuid;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('test.e', public.kael_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000006', current_setting('test.b_conv')::uuid, 'client', 'Quay lại')::text, true);
select is(current_setting('test.e')::jsonb ->> 'status', 'started', 'Sending to an archived session continues it');
reset role;
select is((select archived_at is null from public.kael_conversations where id = current_setting('test.b_conv')::uuid), true, 'Sending to an archived session unarchives it');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok(format($$ select public.kael_delete_conversation(%L) $$, current_setting('test.b_conv')), '22023', null, 'A conversation with a running turn cannot be deleted');
reset role;

select * from finish();
rollback;
