import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NotificationBanner } from './notification-banner';
import type { BannerNotice } from './notification-banner-model';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const notice: BannerNotice = { id: 'n1', title: 'Báo giá mới', body: 'Yêu cầu “Sửa vòi nước” có báo giá mới.', time: 'Bây giờ' };
const later: BannerNotice = { id: 'n2', title: 'Thợ đã nhận việc', body: 'Anh Hùng sẽ đến lúc 14:00.', time: 'Bây giờ' };

function banner(props: { notice: BannerNotice | null; onOpen?: (notice: BannerNotice) => void; onDismiss?: (id: string) => void; onHold?: (held: boolean) => void }) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <NotificationBanner notice={props.notice} onOpen={props.onOpen ?? jest.fn()} onDismiss={props.onDismiss ?? jest.fn()} onHold={props.onHold ?? jest.fn()} />
    </SafeAreaProvider>
  );
}

afterEach(() => jest.restoreAllMocks());

test('nothing renders without a notification', async () => {
  await render(banner({ notice: null }));
  expect(screen.queryByText('Báo giá mới')).toBeNull();
});

test('a notification shows its title, body and time and is announced to assistive tech', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  await render(banner({ notice }));
  expect(screen.getByText('Báo giá mới')).toBeTruthy();
  expect(screen.getByText('Yêu cầu “Sửa vòi nước” có báo giá mới.')).toBeTruthy();
  expect(screen.getByText('Bây giờ')).toBeTruthy();
  expect(announce).toHaveBeenCalledWith('Báo giá mới. Yêu cầu “Sửa vòi nước” có báo giá mới.');
});

test('the assistive activate action opens the notification', async () => {
  const onOpen = jest.fn();
  await render(banner({ notice, onOpen }));
  await fireEvent(screen.getByLabelText('Báo giá mới. Yêu cầu “Sửa vòi nước” có báo giá mới.'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(onOpen).toHaveBeenCalledWith(notice);
});

test('the assistive dismiss action slides it away and then reports the dismissal', async () => {
  const onDismiss = jest.fn();
  await render(banner({ notice, onDismiss }));
  await fireEvent(screen.getByLabelText('Báo giá mới. Yêu cầu “Sửa vòi nước” có báo giá mới.'), 'accessibilityAction', { nativeEvent: { actionName: 'dismiss' } });
  await waitFor(() => expect(onDismiss).toHaveBeenCalledWith('n1'));
});

test('removing the notification slides the banner out and unmounts it', async () => {
  const view = await render(banner({ notice }));
  await view.rerender(banner({ notice: null }));
  await waitFor(() => expect(screen.queryByText('Báo giá mới')).toBeNull());
});

test('a newer notification replaces the current one', async () => {
  const view = await render(banner({ notice }));
  await view.rerender(banner({ notice: later }));
  await waitFor(() => expect(screen.getByText('Thợ đã nhận việc')).toBeTruthy());
  expect(screen.queryByText('Báo giá mới')).toBeNull();
});

test('the expanded actions stay out of the accessibility tree until the banner is expanded', async () => {
  await act(async () => { await render(banner({ notice })); });
  expect(screen.queryByLabelText('Bỏ qua thông báo')).toBeNull();
});

test('replacing or removing the notification releases the countdown hold', async () => {
  const onHold = jest.fn();
  const view = await render(banner({ notice, onHold }));
  await view.rerender(banner({ notice: later, onHold }));
  await waitFor(() => expect(onHold).toHaveBeenCalledWith(false));
  onHold.mockClear();
  await view.rerender(banner({ notice: null, onHold }));
  await waitFor(() => expect(onHold).toHaveBeenCalledWith(false));
});
