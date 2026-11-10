import { archiveKaelSession, deleteKaelSession, KaelSessionError, listKaelSessions, openKaelSession, parseKaelSessionPage, pinKaelSession, renameKaelSession } from './kael-sessions-repository';

const id = '11111111-1111-4111-8111-111111111111';
const summary = { id, title: 'Sửa vòi nước', preview: 'Kael: ok', updated_at: '2026-11-10T10:00:00Z', pinned: false, archived: false, busy: false, attention: false };
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const signal = new AbortController().signal;

test('list sends the typed RPC arguments and parses sessions', async () => {
  const request = jest.fn().mockReturnValue(json({ pinned: [], items: [summary], has_more: true }));
  const page = await listKaelSessions('u', { mode: 'client', search: '  nước ', archived: false, before: null }, signal, request);
  expect(request.mock.calls[0]![1]).toBe('rpc/kael_list_sessions');
  expect(JSON.parse(request.mock.calls[0]![2].body)).toEqual({ p_mode: 'client', p_search: 'nước', p_archived: false, p_limit: 30, p_before: null });
  expect(page.items[0]).toMatchObject({ id, title: 'Sửa vòi nước', updatedAt: '2026-11-10T10:00:00Z' });
  expect(page.hasMore).toBe(true);
});

test('responses outside the contract are rejected', async () => {
  expect(parseKaelSessionPage({ pinned: [], items: [{ ...summary, id: 'x' }], has_more: false })).toBeNull();
  expect(parseKaelSessionPage({ pinned: [], items: [], has_more: 'no' })).toBeNull();
  const request = jest.fn().mockReturnValue(json({ nope: true }));
  await expect(listKaelSessions('u', { mode: 'client', search: '', archived: false, before: null }, signal, request)).rejects.toBeInstanceOf(KaelSessionError);
});

test('open maps a missing session to not_found and parses a valid one', async () => {
  const missing = jest.fn().mockReturnValue(json({ code: 'P0002' }, 404));
  await expect(openKaelSession('u', 'client', id, signal, missing)).rejects.toMatchObject({ reason: 'not_found' });
  const ok = jest.fn().mockReturnValue(json({ conversation_id: id, title: 'T', pinned: true, archived: false, busy: false, messages: [], tasks: [], approvals: [] }));
  await expect(openKaelSession('u', 'client', id, signal, ok)).resolves.toMatchObject({ conversationId: id, title: 'T', pinned: true });
});

test('rename, pin, archive and delete call their own RPCs', async () => {
  const request = jest.fn()
    .mockReturnValueOnce(json('Tên mới')).mockReturnValueOnce(json(true)).mockReturnValueOnce(json(true)).mockReturnValueOnce(json({ status: 'busy' }));
  await expect(renameKaelSession('u', id, 'Tên mới', signal, request)).resolves.toBe('Tên mới');
  await pinKaelSession('u', id, true, signal, request);
  await archiveKaelSession('u', id, true, signal, request);
  await expect(deleteKaelSession('u', id, signal, request)).resolves.toBe('busy');
  expect(request.mock.calls.map(call => call[1])).toEqual(['rpc/kael_rename_session', 'rpc/kael_pin_session', 'rpc/kael_archive_session', 'rpc/kael_delete_session']);
});

test('failed requests surface as errors instead of success', async () => {
  const request = jest.fn().mockReturnValue(json({}, 500));
  await expect(pinKaelSession('u', id, true, signal, request)).rejects.toMatchObject({ reason: 'failed' });
  const invalid = jest.fn().mockReturnValue(json({ code: '22023' }, 400));
  await expect(renameKaelSession('u', id, '', signal, invalid)).rejects.toMatchObject({ reason: 'invalid' });
});
