import { renderHook } from '@testing-library/react-native';

import { useActiveSessionTitle } from './use-active-session-title';

const named = [{ id: 'a', title: 'Máy lạnh không mát' }, { id: 'b', title: 'Vệ sinh sofa' }];

test('returns the listed title of the active session', async () => {
  const { result } = await renderHook(() => useActiveSessionTitle('a', named));
  expect(result.current).toBe('Máy lạnh không mát');
});

test('keeps the known title when a filtered list no longer contains the active session', async () => {
  const { result, rerender } = await renderHook((props: { sessions: typeof named }) => useActiveSessionTitle('a', props.sessions), { initialProps: { sessions: named } });
  expect(result.current).toBe('Máy lạnh không mát');
  await rerender({ sessions: [named[1]!] });
  expect(result.current).toBe('Máy lạnh không mát');
  await rerender({ sessions: [] });
  expect(result.current).toBe('Máy lạnh không mát');
});

test('follows a rename and never leaks another session title', async () => {
  const { result, rerender } = await renderHook((props: { id: string | null; sessions: typeof named }) => useActiveSessionTitle(props.id, props.sessions), { initialProps: { id: 'a' as string | null, sessions: named } });
  await rerender({ id: 'a', sessions: [{ id: 'a', title: 'Tên mới' }] });
  expect(result.current).toBe('Tên mới');
  await rerender({ id: 'b', sessions: [] });
  expect(result.current).toBeNull();
  await rerender({ id: null, sessions: named });
  expect(result.current).toBeNull();
});
