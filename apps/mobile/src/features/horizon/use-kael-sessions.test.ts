import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useKaelSessions, type KaelSessionsApi } from './use-kael-sessions';

const session = (id: string, title: string) => ({ id, title, preview: '', updatedAt: '2026-11-10T10:00:00Z', pinned: false, archived: false, busy: false, attention: false });

function api(overrides: Partial<KaelSessionsApi> = {}): KaelSessionsApi {
  return {
    list: jest.fn().mockResolvedValue({ pinned: [], items: [session('a', 'A')], hasMore: false }),
    rename: jest.fn().mockResolvedValue('B'),
    pin: jest.fn().mockResolvedValue(undefined),
    archive: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue('deleted'),
    ...overrides,
  };
}

test('loads real sessions only while active and refreshes after an action', async () => {
  const a = api();
  const { result, rerender } = await renderHook((props: { active: boolean }) => useKaelSessions('u', 'client', props.active, 'k', a), { initialProps: { active: false } });
  expect(a.list).not.toHaveBeenCalled();
  await rerender({ active: true });
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.items.map(item => item.title)).toEqual(['A']);
  await act(async () => { expect(await result.current.pin('a', true)).toBe('ok'); });
  expect(a.pin).toHaveBeenCalledWith('u', 'a', true, expect.any(AbortSignal));
  expect(jest.mocked(a.list).mock.calls.length).toBeGreaterThanOrEqual(2);
});

test('delete refusals and failures are reported, not hidden', async () => {
  const a = api({ remove: jest.fn().mockResolvedValueOnce('unresolved_effect').mockRejectedValueOnce(new Error('net')) });
  const { result } = await renderHook(() => useKaelSessions('u', 'client', true, 'k', a));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  await act(async () => { expect(await result.current.remove('a')).toBe('unresolved_effect'); });
  await act(async () => { expect(await result.current.remove('a')).toBe('failed'); });
});

test('a failing list surfaces an error state', async () => {
  const a = api({ list: jest.fn().mockRejectedValue(new Error('net')) });
  const { result } = await renderHook(() => useKaelSessions('u', 'client', true, 'k', a));
  await waitFor(() => expect(result.current.status).toBe('error'));
});
