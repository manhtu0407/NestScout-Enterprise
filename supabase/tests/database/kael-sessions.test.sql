begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated');
insert into auth.users (id, aud, role, is_anonymous) values
  ('00000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated', true);

select ok(not has_function_privilege('anon', 'public.kael_list_sessions(text,text,boolean,integer,timestamptz)', 'execute'), 'Anonymous role cannot list sessions');
select ok(not has_function_privilege('anon', 'public.kael_delete_session(uuid)', 'execute'), 'Anonymous role cannot delete sessions');
select ok(not has_table_privilege('authenticated', 'public.kael_conversations', 'update'), 'Clients cannot edit conversations directly');
select ok(not has_table_privilege('authenticated', 'public.kael_conversations', 'delete'), 'Clients cannot delete conversations directly');
select ok(not has_function_privilege('authenticated', 'nestscout_private.kael_session_title(text)', 'execute'), 'The title helper is internal');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select isnt(public.set_consent('ai_sharing', true, '2026-11-09'), null, 'Owner A allows AI sharing');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select isnt(public.set_consent('ai_sharing', true, '2026-11-09'), null, 'Owner B allows AI sharing');
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('test.s1', public.kael_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000001', null, 'client',
  E'  Cần sửa điện\nphòng khách  ')::text, true);
select is(current_setting('test.s1')::jsonb ->> 'status', 'started', 'Session one starts on the first message');
select set_config('test.c1', current_setting('test.s1')::jsonb ->> 'conversation_id', true);
select ok(public.kael_finish_run('00000000-0000-4000-8000-0000000000a1', (current_setting('test.s1')::jsonb ->> 'run_id')::uuid, 'completed', 'Mình sẽ hỗ trợ ngay', true, null, null, 0, 0, 0, null),
  'Session one finishes a turn');
select set_config('test.s2', public.kael_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000002', null, 'client', 'Giá vệ sinh sofa 3 chỗ')::text, true);
select set_config('test.c2', current_setting('test.s2')::jsonb ->> 'conversation_id', true);
select ok(public.kael_finish_run('00000000-0000-4000-8000-0000000000a1', (current_setting('test.s2')::jsonb ->> 'run_id')::uuid, 'completed', 'Cần biết chất liệu sofa', true, null, null, 0, 0, 0, null),
  'Session two finishes a turn');
select set_config('test.s3', public.kael_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000003', null, 'worker', 'Lịch nhận việc tuần này')::text, true);
select set_config('test.c3', current_setting('test.s3')::jsonb ->> 'conversation_id', true);
select ok(public.kael_finish_run('00000000-0000-4000-8000-0000000000a1', (current_setting('test.s3')::jsonb ->> 'run_id')::uuid, 'completed', 'Đã ghi nhận', true, null, null, 0, 0, 0, null),
  'The worker-mode session finishes a turn');
select set_config('test.s4', public.kael_start_run('00000000-0000-4000-8000-0000000000b2', '30000000-0000-4000-8000-000000000004', null, 'client', 'Phiên riêng của người dùng B')::text, true);
select set_config('test.c4', current_setting('test.s4')::jsonb ->> 'conversation_id', true);
select ok(public.kael_finish_run('00000000-0000-4000-8000-0000000000b2', (current_setting('test.s4')::jsonb ->> 'run_id')::uuid, 'completed', 'Trả lời B', true, null, null, 0, 0, 0, null),
  'Owner B session finishes a turn');
reset role;

select is((select title from public.kael_conversations where id = current_setting('test.c1')::uuid), 'Cần sửa điện phòng khách',
  'The default title is derived from the first message with whitespace collapsed');
select is(nestscout_private.kael_session_title(repeat('a', 100)), repeat('a', 59) || '…', 'Long first messages are shortened to a readable title');
select is(nestscout_private.kael_session_title('   '), 'Cuộc trò chuyện', 'A blank message falls back to a generic title');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select is((select jsonb_array_length(public.kael_list_sessions('client') -> 'items')), 2, 'Owner A lists exactly the two client sessions');
select is((public.kael_list_sessions('client') -> 'items' -> 0 ->> 'id')::uuid, current_setting('test.c2')::uuid, 'Sessions are ordered by latest activity');
select is((public.kael_list_sessions('client') -> 'items' -> 0 ->> 'preview'), 'Cần biết chất liệu sofa', 'Each row previews the latest message');
select is((select jsonb_array_length(public.kael_list_sessions('worker') -> 'items')), 1, 'Worker mode lists only worker sessions');
select is((public.kael_list_sessions('worker') -> 'items' -> 0 ->> 'id')::uuid, current_setting('test.c3')::uuid, 'The worker list holds the worker session');
select is((select count(*)::integer from public.kael_conversations), 3, 'Row security shows owner A only their own conversations');
select throws_ok($$ select public.kael_list_sessions('admin') $$, '22023', 'invalid mode', 'An unknown mode is rejected');

select is((public.kael_open_session('client', current_setting('test.c1')::uuid) ->> 'title'), 'Cần sửa điện phòng khách', 'Opening a session returns its title');
select is((select jsonb_array_length(public.kael_open_session('client', current_setting('test.c1')::uuid) -> 'messages')), 2, 'Opening loads that session messages');
select is((public.kael_open_session('client', current_setting('test.c1')::uuid) #>> '{messages,0,content}'), E'Cần sửa điện
phòng khách',
  'Session one shows its own first message');
select ok(public.kael_open_session('client', current_setting('test.c2')::uuid)::text not like '%phòng khách%', 'Session two shows none of session one content');
select throws_ok(format($$ select public.kael_open_session('client', %L) $$, current_setting('test.c4')), 'P0002', 'session not found',
  'A session of another owner cannot be opened');
select throws_ok(format($$ select public.kael_open_session('worker', %L) $$, current_setting('test.c1')), 'P0002', 'session not found',
  'A session cannot be opened in the other mode');
select throws_ok($$ select public.kael_open_session('client', null) $$, '22023', 'session required', 'An explicit session is required');
select is((public.kael_conversation_state('client') ->> 'conversation_id')::uuid, current_setting('test.c2')::uuid, 'Restoring after restart resumes the latest session');

select is(public.kael_rename_session(current_setting('test.c1')::uuid, E'  Sửa điện\nnhà bếp '), 'Sửa điện nhà bếp', 'A session can be renamed');
select is((public.kael_open_session('client', current_setting('test.c1')::uuid) ->> 'title'), 'Sửa điện nhà bếp', 'The new name persists on the server');
select throws_ok(format($$ select public.kael_rename_session(%L, '   ') $$, current_setting('test.c1')), '22023', 'invalid title', 'A blank name is rejected');
select throws_ok(format($$ select public.kael_rename_session(%L, repeat('x', 81)) $$, current_setting('test.c1')), '22023', 'invalid title', 'An overlong name is rejected');
select throws_ok(format($$ select public.kael_rename_session(%L, 'Chiếm quyền') $$, current_setting('test.c4')), 'P0002', 'session not found', 'Another owner session cannot be renamed');

select is(public.kael_pin_session(current_setting('test.c1')::uuid, true), true, 'A session can be pinned');
select is((public.kael_list_sessions('client') -> 'pinned' -> 0 ->> 'id')::uuid, current_setting('test.c1')::uuid, 'Pinned sessions are listed separately');
select is((select jsonb_array_length(public.kael_list_sessions('client') -> 'items')), 1, 'A pinned session leaves the recent list');
select throws_ok(format($$ select public.kael_pin_session(%L, true) $$, current_setting('test.c4')), 'P0002', 'session not found', 'Another owner session cannot be pinned');

select is((select jsonb_array_length(public.kael_list_sessions('client', 'SOFA') -> 'items')), 1, 'Search matches names without regard to case');
select is((select jsonb_array_length(public.kael_list_sessions('client', 'nhà bếp') -> 'pinned')), 1, 'Search covers pinned sessions');
select is((select jsonb_array_length(public.kael_list_sessions('client', 'khongco') -> 'items')), 0, 'Search with no match returns nothing');
select is((select jsonb_array_length(public.kael_list_sessions('client', '%') -> 'items')), 0, 'A percent sign in search is literal, not a wildcard');
select is((select jsonb_array_length(public.kael_list_sessions('client', 'Phiên riêng') -> 'items')), 0, 'Search never finds another owner session');

select is(public.kael_archive_session(current_setting('test.c1')::uuid, true), true, 'A session can be archived');
select is((select jsonb_array_length(public.kael_list_sessions('client') -> 'pinned')), 0, 'Archiving removes the pin');
select is((public.kael_list_sessions('client', null, true) -> 'items' -> 0 ->> 'id')::uuid, current_setting('test.c1')::uuid, 'Archived sessions appear in the archived list');
select is((public.kael_open_session('client', current_setting('test.c1')::uuid) ->> 'archived')::boolean, true, 'An archived session still opens with its content');
select is((select jsonb_array_length(public.kael_open_session('client', current_setting('test.c1')::uuid) -> 'messages')), 2, 'Archiving keeps the messages');
select throws_ok(format($$ select public.kael_pin_session(%L, true) $$, current_setting('test.c1')), '22023', 'archived sessions cannot be pinned', 'An archived session cannot be pinned');
select is(public.kael_archive_session(current_setting('test.c1')::uuid, false), false, 'A session can be restored from the archive');
select is(public.kael_archive_session(current_setting('test.c2')::uuid, true), true, 'The latest session can be archived');
select is((public.kael_conversation_state('client') ->> 'conversation_id')::uuid, current_setting('test.c1')::uuid, 'Restoring skips archived sessions');
select is(public.kael_archive_session(current_setting('test.c2')::uuid, false), false, 'The latest session returns from the archive');
select is((select jsonb_array_length(public.kael_list_sessions('client') -> 'items')), 2, 'A restored session returns to the recent list');
select throws_ok(format($$ select public.kael_archive_session(%L, true) $$, current_setting('test.c4')), 'P0002', 'session not found', 'Another owner session cannot be archived');
select is((select count(*)::integer from jsonb_array_elements(public.kael_list_sessions('client', null, false, 1) -> 'items')), 1, 'The list honors a page size');
select is((public.kael_list_sessions('client', null, false, 1) ->> 'has_more')::boolean, true, 'The list reports more pages');
select is((public.kael_list_sessions('client', null, false, 1, (public.kael_list_sessions('client', null, false, 1) -> 'items' -> 0 ->> 'updated_at')::timestamptz) -> 'items' -> 0 ->> 'id')::uuid,
  current_setting('test.c1')::uuid, 'The next page continues after the cursor');

reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select public.submit_service_request('40000000-0000-4000-8000-000000000001', 'Sửa điện phòng khách', 'Quận 3') $$, 'Owner A submits a service request');
select set_config('test.request', (select id::text from public.service_requests limit 1), true);
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.kael_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000005', current_setting('test.c1')::uuid, 'client', 'Thêm câu hỏi') ->> 'status',
  'started', 'Sending to a session continues the same conversation');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is(public.kael_delete_session(current_setting('test.c1')::uuid) ->> 'status', 'busy', 'A session with a running turn cannot be deleted');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(public.kael_finish_run('00000000-0000-4000-8000-0000000000a1',
  (select id from public.kael_runs where request_id = '30000000-0000-4000-8000-000000000005'), 'completed', 'Đã rõ', true, null, null, 0, 0, 0, null),
  'The running turn finishes');
reset role;

select is((select archived_at from public.kael_conversations where id = current_setting('test.c1')::uuid), null, 'Sending to a session keeps it active');
update public.kael_conversations set archived_at = clock_timestamp() where id = current_setting('test.c1')::uuid;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('test.s5', public.kael_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000006', current_setting('test.c1')::uuid, 'client', 'Quay lại phiên cũ')::text, true);
select ok(public.kael_finish_run('00000000-0000-4000-8000-0000000000a1', (current_setting('test.s5')::jsonb ->> 'run_id')::uuid, 'completed', 'Chào lại', true, null, null, 0, 0, 0, null), 'The archived session answers');
reset role;
select is((select archived_at from public.kael_conversations where id = current_setting('test.c1')::uuid), null, 'Messaging an archived session restores it');


set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('test.s6', public.kael_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000007', current_setting('test.c2')::uuid, 'client', 'Vệ sinh sofa 3 chỗ vải')::text, true);
select set_config('test.task', public.kael_save_task('00000000-0000-4000-8000-0000000000a1', null, current_setting('test.c2')::uuid,
  (current_setting('test.s6')::jsonb ->> 'run_id')::uuid, null,
  'Vệ sinh sofa', 'service_request', 'running', 'Đang nhận thông tin', '{"draft":{"description":"nội dung riêng tư","missing":[]}}'::jsonb, 'created')::text, true);
select set_config('test.task_id', current_setting('test.task')::jsonb #>> '{task,id}', true);
reset role;
insert into nestscout_private.kael_approvals (owner_id, task_id, run_id, tool, args, fingerprint, summary, task_version, expires_at)
  values ('00000000-0000-4000-8000-0000000000a1', current_setting('test.task_id')::uuid, (current_setting('test.s6')::jsonb ->> 'run_id')::uuid,
    'service_request_submit', '{"description":"nội dung riêng tư"}', repeat('a', 64), 'Gửi yêu cầu', 1, clock_timestamp() + interval '10 minutes');
select is((select count(*)::integer from public.kael_tasks where conversation_id = current_setting('test.c2')::uuid), 1, 'Session two has a task with a pending approval');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is(public.kael_delete_session(current_setting('test.c2')::uuid) ->> 'status', 'busy', 'A session whose turn is still running cannot be deleted');
select is((public.kael_list_sessions('client') -> 'items' -> 0 ->> 'busy')::boolean, true, 'The list marks a running session');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(public.kael_finish_run('00000000-0000-4000-8000-0000000000a1', (current_setting('test.s6')::jsonb ->> 'run_id')::uuid, 'completed', 'Ok', true, null, null, 0, 0, 0, null), 'The turn finishes');
reset role;

update nestscout_private.kael_approvals set status = 'consumed', decided_at = clock_timestamp(), effect_run_id = (current_setting('test.s6')::jsonb ->> 'run_id')::uuid, effect_task_version = 1
  where task_id = current_setting('test.task_id')::uuid;
update public.kael_tasks set status = 'paused' where id = current_setting('test.task_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is(public.kael_delete_session(current_setting('test.c2')::uuid) ->> 'status', 'unresolved_effect', 'A session with an unconfirmed submission cannot be deleted');
select is((public.kael_list_sessions('client') -> 'items' -> 0 ->> 'attention')::boolean, true, 'The list flags a session that needs reconciliation');
select is((select count(*)::integer from public.kael_messages where conversation_id = current_setting('test.c2')::uuid), 4, 'Refusing keeps every message');
reset role;

update nestscout_private.kael_approvals set outcome = 'succeeded' where task_id = current_setting('test.task_id')::uuid;
update public.kael_tasks set status = 'completed' where id = current_setting('test.task_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is(public.kael_delete_session(current_setting('test.c2')::uuid) ->> 'status', 'not_found', 'Another owner cannot delete the session');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is(public.kael_delete_session(current_setting('test.c2')::uuid) ->> 'status', 'deleted', 'A settled session can be deleted');
select is(public.kael_delete_session(current_setting('test.c2')::uuid) ->> 'status', 'not_found', 'Deleting twice is reported as not found');
select is((select count(*)::integer from public.service_requests), 1, 'Deleting a session leaves the service request untouched');
select is((select count(*)::integer from jsonb_array_elements(public.kael_list_sessions('client') -> 'items')), 1, 'A deleted session leaves the list');
select throws_ok(format($$ select public.kael_open_session('client', %L) $$, current_setting('test.c2')), 'P0002', 'session not found', 'A deleted session cannot be opened');
select throws_ok(format($$ select public.kael_rename_session(%L, 'Hồi sinh') $$, current_setting('test.c2')), 'P0002', 'session not found', 'A deleted session cannot be renamed');
select is((public.kael_conversation_state('client') ->> 'conversation_id')::uuid, current_setting('test.c1')::uuid, 'Restoring skips deleted sessions');
select is((select count(*)::integer from public.kael_conversations where id = current_setting('test.c2')::uuid), 0, 'Row security hides the deleted conversation');
reset role;

select is((select count(*)::integer from public.kael_messages where conversation_id = current_setting('test.c2')::uuid), 0, 'Deleting removes the messages');
select is((select title from public.kael_tasks where id = current_setting('test.task_id')::uuid), 'Cuộc trò chuyện đã xóa', 'The settled task keeps only its audit shell');
select is((select artifact from public.kael_tasks where id = current_setting('test.task_id')::uuid), '{"effect_required":true}'::jsonb, 'The task draft content is erased');
select is((select count(*)::integer from nestscout_private.kael_approvals where task_id = current_setting('test.task_id')::uuid and status = 'consumed'), 1,
  'The settled approval stays as the effect record');
select isnt((select deleted_at from public.kael_conversations where id = current_setting('test.c2')::uuid), null, 'The conversation remains as a tombstone');
select is((select title from public.kael_conversations where id = current_setting('test.c2')::uuid), null, 'The tombstone holds no title');
select is((select count(*)::integer from public.kael_runs where conversation_id = current_setting('test.c2')::uuid), 2, 'The run ledger is kept');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.kael_start_run('00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-000000000008', current_setting('test.c2')::uuid, 'client', 'Gửi vào phiên đã xóa') ->> 'status',
  'invalid', 'A deleted session cannot receive new messages');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select jsonb_array_length(public.kael_list_sessions('client') -> 'items')), 1, 'The other session is untouched by the deletion');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select is((select jsonb_array_length(public.kael_list_sessions('client') -> 'items')), 1, 'Owner B still sees only their own session');
select is((public.kael_list_sessions('client') -> 'items' -> 0 ->> 'id')::uuid, current_setting('test.c4')::uuid, 'Owner B session is unchanged');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$ select public.kael_list_sessions('client') $$, '42501', 'authentication required', 'Anonymous sessions cannot list sessions');
select throws_ok($$ select public.kael_delete_session(gen_random_uuid()) $$, '42501', 'authentication required', 'Anonymous sessions cannot delete sessions');
reset role;

select * from finish();
rollback;
