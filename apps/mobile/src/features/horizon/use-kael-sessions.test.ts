import { act, renderHook, waitFor } from '@testing-library/react-native';

import { KaelSessionError, type KaelSession } from '@/features/shared';

import { searchDelayMs, useKaelSessions, type KaelSessionsApi } from './use-kael-sessions';

const session = (id: string, title: string, extra: Partial<KaelSession> = {}): KaelSession => ({ id, title, preview: 'xin chào', updatedAt: '2026-11-10T08:00:00+00:00', pinned: false, archived: false, ...extra });

function apiWith(overrides: Partial<KaelSessionsApi> = {}): jest.Mocked<KaelSessionsApi> {
  return {
    list: jest.fn(async () => [session('a', 'Sửa vòi nước')]),
    rename: jest.fn(async () => 'x'),
    pin: jest.fn(async () => undefined),
    archive: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
    ...overrides,
  } as jest.Mocked<KaelSessionsApi>;
}

test('loads real conversations only while the sidebar is open', async () => {
  const api = apiWith();
  const { result, rerender } = await renderHook(({ active }: { active: boolean }) => useKaelSessions('user-a', 'client', active, api), { initialProps: { active: false } });
  expect(api.list).not.toHaveBeenCalled();
  await rerender({ active: true });
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.sessions.map(item => item.title)).toEqual(['Sửa vòi nước']);
  expect(api.list.mock.calls[0]?.slice(0, 3)).toEqual(['user-a', 'client', { search: '', archived: false, limit: 50 }]);
});

test('reports a failed load and recovers on retry', async () => {
  const api = apiWith({ list: jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue([session('a', 'Sửa vòi nước')]) });
  const { result } = await renderHook(() => useKaelSessions('user-a', 'client', true, api));
  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(result.current.sessions).toEqual([]);
  await act(() => result.current.reload());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.sessions).toHaveLength(1);
});

test('searches after a short delay and switches to the archive view', async () => {
  jest.useFakeTimers();
  try {
    const api = apiWith();
    const { result } = await renderHook(() => useKaelSessions('user-a', 'client', true, api));
    await act(async () => { await jest.advanceTimersByTimeAsync(0); });
    await act(() => result.current.setQuery('sofa'));
    expect(api.list).toHaveBeenCalledTimes(1);
    await act(async () => { await jest.advanceTimersByTimeAsync(searchDelayMs + 1); });
    expect(api.list).toHaveBeenLastCalledWith('user-a', 'client', { search: 'sofa', archived: false, limit: 50 }, expect.any(AbortSignal));
    await act(() => result.current.setArchived(true));
    await act(async () => { await jest.advanceTimersByTimeAsync(1); });
    expect(api.list).toHaveBeenLastCalledWith('user-a', 'client', { search: 'sofa', archived: true, limit: 50 }, expect.any(AbortSignal));
  } finally {
    jest.useRealTimers();
  }
});

test('ignores a slow response for a previous scope', async () => {
  let release: (value: KaelSession[]) => void = () => undefined;
  const slow = new Promise<KaelSession[]>(resolve => { release = resolve; });
  const api = apiWith({ list: jest.fn().mockReturnValueOnce(slow).mockResolvedValue([session('b', 'Tài khoản hai')]) });
  const { result, rerender } = await renderHook(({ user }: { user: string }) => useKaelSessions(user, 'client', true, api), { initialProps: { user: 'user-a' } });
  await rerender({ user: 'user-b' });
  await waitFor(() => expect(result.current.sessions.map(item => item.title)).toEqual(['Tài khoản hai']));
  await act(async () => { release([session('a', 'Của tài khoản một')]); await slow; });
  expect(result.current.sessions.map(item => item.title)).toEqual(['Tài khoản hai']);
});

test('shows nothing from the previous account while the next one loads', async () => {
  const api = apiWith({ list: jest.fn().mockResolvedValueOnce([session('a', 'Riêng tư')]).mockReturnValue(new Promise(() => undefined)) });
  const { result, rerender } = await renderHook(({ user }: { user: string }) => useKaelSessions(user, 'client', true, api), { initialProps: { user: 'user-a' } });
  await waitFor(() => expect(result.current.sessions).toHaveLength(1));
  await rerender({ user: 'user-b' });
  expect(result.current.sessions).toEqual([]);
});

test('mutations call the owner scoped functions and reload; refusals are returned, not hidden', async () => {
  const api = apiWith({ remove: jest.fn().mockRejectedValue(new KaelSessionError('effect_unresolved')) });
  const { result } = await renderHook(() => useKaelSessions('user-a', 'client', true, api));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  await act(async () => { await expect(result.current.rename('a', 'Tên mới')).resolves.toEqual({ ok: true }); });
  expect(api.rename).toHaveBeenCalledWith('user-a', 'a', 'Tên mới', expect.any(AbortSignal));
  await act(async () => { await result.current.setPinned('a', true); });
  expect(api.pin).toHaveBeenCalledWith('user-a', 'a', true, expect.any(AbortSignal));
  await act(async () => { await result.current.setSessionArchived('a', true); });
  expect(api.archive).toHaveBeenCalledWith('user-a', 'a', true, expect.any(AbortSignal));
  await waitFor(() => expect(api.list.mock.calls.length).toBeGreaterThanOrEqual(4));
  const before = api.list.mock.calls.length;
  await act(async () => { await expect(result.current.remove('a')).resolves.toEqual({ ok: false, failure: 'effect_unresolved' }); });
  expect(api.list.mock.calls.length).toBe(before);
});
