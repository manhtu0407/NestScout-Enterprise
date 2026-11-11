import { act, renderHook } from '@testing-library/react-native';

import type { NotificationItem } from './content';
import { useNotificationBanner } from './use-notification-banner';

const item = (id: string, unread = true): NotificationItem => ({ id, icon: 'bell', title: `Tiêu đề ${id}`, body: `Nội dung ${id}`, time: '1 phút trước', unread, today: true });

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

type Input = { items: readonly NotificationItem[]; ready: boolean; scope: string | null };

test('existing unread notifications do not raise a banner when data first loads', async () => {
  const view = await renderHook((props: Input) => useNotificationBanner(props.items, props.ready, props.scope), { initialProps: { items: [] as readonly NotificationItem[], ready: false, scope: 'u1:client' } });
  await view.rerender({ items: [item('a')], ready: true, scope: 'u1:client' });
  expect(view.result.current.notice).toBeNull();
});

test('a notification that arrives after load raises a banner that dismisses itself', async () => {
  const view = await renderHook((props: Input) => useNotificationBanner(props.items, props.ready, props.scope), { initialProps: { items: [item('a')] as readonly NotificationItem[], ready: true, scope: 'u1:client' } });
  await view.rerender({ items: [item('b'), item('a')], ready: true, scope: 'u1:client' });
  expect(view.result.current.notice?.id).toBe('b');
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(view.result.current.notice).toBeNull();
});

test('holding the banner pauses the countdown until it is released', async () => {
  const view = await renderHook((props: Input) => useNotificationBanner(props.items, props.ready, props.scope), { initialProps: { items: [] as readonly NotificationItem[], ready: true, scope: 'u1:client' } });
  await view.rerender({ items: [item('b')], ready: true, scope: 'u1:client' });
  expect(view.result.current.notice?.id).toBe('b');
  await act(async () => { view.result.current.hold(true); });
  await act(async () => { jest.advanceTimersByTime(20000); });
  expect(view.result.current.notice?.id).toBe('b');
  await act(async () => { view.result.current.hold(false); });
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(view.result.current.notice).toBeNull();
});

test('switching scope reseeds so the other role existing notifications stay quiet', async () => {
  const view = await renderHook((props: Input) => useNotificationBanner(props.items, props.ready, props.scope), { initialProps: { items: [item('a')] as readonly NotificationItem[], ready: true, scope: 'u1:client' } });
  await view.rerender({ items: [item('w1'), item('w2')], ready: true, scope: 'u1:worker' });
  expect(view.result.current.notice).toBeNull();
  await view.rerender({ items: [item('w3'), item('w1'), item('w2')], ready: true, scope: 'u1:worker' });
  expect(view.result.current.notice?.id).toBe('w3');
});

test('dismiss only clears the banner it names and show replaces the current one', async () => {
  const view = await renderHook(() => useNotificationBanner([], false, null));
  await act(async () => { view.result.current.show({ id: 'x', title: 'X', body: 'x', time: 'Bây giờ' }); });
  await act(async () => { view.result.current.dismiss('other'); });
  expect(view.result.current.notice?.id).toBe('x');
  await act(async () => { view.result.current.show({ id: 'y', title: 'Y', body: 'y', time: 'Bây giờ' }); });
  expect(view.result.current.notice?.id).toBe('y');
  await act(async () => { view.result.current.dismiss('y'); });
  expect(view.result.current.notice).toBeNull();
});
