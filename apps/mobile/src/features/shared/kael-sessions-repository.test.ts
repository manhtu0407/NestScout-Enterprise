import { deleteKaelSession, KaelSessionError, listKaelSessions, openKaelConversation, renameKaelSession, setKaelSessionArchived, setKaelSessionPinned } from './kael-sessions-repository';

const first = '22222222-2222-4222-8222-222222222222';
const second = '33333333-3333-4333-8333-333333333333';
const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: 'Sửa vòi nước', preview: 'Đã ghi nhận', updated_at: '2026-11-10T08:00:00+00:00', pinned: false, archived: false, ...extra });

function reply(body: unknown, status = 200) {
  const request = jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response);
  return request;
}

const signal = new AbortController().signal;

test('lists the owner sessions through the list function with a bounded query', async () => {
  const request = reply([row(first, { pinned: true }), row(second)]);
  const sessions = await listKaelSessions('user-a', 'client', { search: '  vòi ', archived: false }, signal, request);
  expect(sessions).toEqual([
    { id: first, title: 'Sửa vòi nước', preview: 'Đã ghi nhận', updatedAt: '2026-11-10T08:00:00+00:00', pinned: true, archived: false },
    { id: second, title: 'Sửa vòi nước', preview: 'Đã ghi nhận', updatedAt: '2026-11-10T08:00:00+00:00', pinned: false, archived: false },
  ]);
  const [userId, path, init] = request.mock.calls[0] as unknown as [string, string, { body: string }];
  expect(userId).toBe('user-a');
  expect(path).toBe('rpc/kael_list_conversations');
  expect(JSON.parse(init.body)).toEqual({ p_mode: 'client', p_search: 'vòi', p_archived: false, p_limit: 30, p_before: null });
});

test('rejects a list response outside the contract instead of showing partial history', async () => {
  await expect(listKaelSessions('user-a', 'client', {}, signal, reply([row(first), { id: 'x' }]))).rejects.toBeInstanceOf(KaelSessionError);
  await expect(listKaelSessions('user-a', 'client', {}, signal, reply({ rows: [] }))).rejects.toBeInstanceOf(KaelSessionError);
});

test('opens a conversation by identifier and refuses a snapshot for a different one', async () => {
  const snapshot = (id: string) => ({ conversation_id: id, busy: false, messages: [{ id: '44444444-4444-4444-8444-444444444444', role: 'user', content: 'Xin chào', status: 'complete' }], tasks: [], approvals: [] });
  const opened = await openKaelConversation('user-a', 'client', first, signal, reply(snapshot(first)));
  expect(opened.conversationId).toBe(first);
  expect(opened.messages.map(message => message.text)).toEqual(['Xin chào']);
  await expect(openKaelConversation('user-a', 'client', first, signal, reply(snapshot(second)))).rejects.toMatchObject({ failure: 'failed' });
});

test.each([
  ['conversation unavailable', 'unavailable'],
  ['run active', 'run_active'],
  ['effect unresolved', 'effect_unresolved'],
  ['invalid request', 'invalid'],
  ['something else', 'failed'],
])('maps the %s database refusal to %s', async (message, failure) => {
  await expect(deleteKaelSession('user-a', first, signal, reply({ code: '22023', message }, 400))).rejects.toMatchObject({ failure });
});

test('an unreadable error body is a plain failure', async () => {
  const request = jest.fn(async () => ({ ok: false, status: 500, json: async () => { throw new Error('bad body'); } }) as unknown as Response);
  await expect(deleteKaelSession('user-a', first, signal, request)).rejects.toMatchObject({ failure: 'failed' });
});

test('mutations send the owner-scoped function arguments and verify the echoed result', async () => {
  const rename = reply({ id: first, title: 'Sửa vòi bếp' });
  await expect(renameKaelSession('user-a', first, 'Sửa vòi bếp', signal, rename)).resolves.toBe('Sửa vòi bếp');
  expect(JSON.parse((rename.mock.calls[0] as unknown as [string, string, { body: string }])[2].body)).toEqual({ p_conversation_id: first, p_title: 'Sửa vòi bếp' });

  const pin = reply({ id: first, pinned: true });
  await expect(setKaelSessionPinned('user-a', first, true, signal, pin)).resolves.toBeUndefined();
  expect((pin.mock.calls[0] as unknown as [string, string])[1]).toBe('rpc/kael_set_conversation_pinned');

  const archive = reply({ id: first, archived: true });
  await expect(setKaelSessionArchived('user-a', first, true, signal, archive)).resolves.toBeUndefined();

  const remove = reply({ id: first, deleted: true });
  await expect(deleteKaelSession('user-a', first, signal, remove)).resolves.toBeUndefined();
  expect((remove.mock.calls[0] as unknown as [string, string])[1]).toBe('rpc/kael_delete_conversation');
});

test('does not report success when the server echoes a different state or conversation', async () => {
  await expect(setKaelSessionPinned('user-a', first, true, signal, reply({ id: first, pinned: false }))).rejects.toMatchObject({ failure: 'failed' });
  await expect(setKaelSessionArchived('user-a', first, true, signal, reply({ id: second, archived: true }))).rejects.toMatchObject({ failure: 'failed' });
  await expect(deleteKaelSession('user-a', first, signal, reply({ id: first, deleted: false }))).rejects.toMatchObject({ failure: 'failed' });
});
