import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AccountSheet } from './account-sheet';
import { Sidebar } from './sidebar';

const initialMetrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } };
const headers = { apikey: 'key', Authorization: 'Bearer token' };
const uri = 'https://example.test/storage/v1/object/authenticated/avatars/u1/avatar?v=1';

function renderSidebar(avatar: { uri?: string; headers?: Record<string, string> }) {
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <Sidebar visible onClose={jest.fn()} onNavigate={jest.fn()} mode="client" modePending={false} modeNotice={null} onModeSelect={jest.fn()} onModeCancel={jest.fn()} onDismissModeNotice={jest.fn()} profileName="Nguyễn Minh" profileAvatarUri={avatar.uri} profileAvatarHeaders={avatar.headers} />
    </SafeAreaProvider>,
  );
}

test('the sidebar account row shows the stored avatar with its request headers', async () => {
  await renderSidebar({ uri, headers });
  const image = screen.getByLabelText('Ảnh đại diện');
  expect(image.props.source).toEqual({ uri, headers });
});

test('the account sheet shows the stored avatar with its request headers', async () => {
  await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <AccountSheet profileName="Nguyễn Minh" avatarUri={uri} avatarHeaders={headers} modeLabel="Khách hàng" reduceMotion closeRequest={0} onClose={jest.fn()} />
    </SafeAreaProvider>,
  );
  expect(screen.getByLabelText('Ảnh đại diện').props.source).toEqual({ uri, headers });
});

test('the customer sidebar has a single notifications row and no search button', async () => {
  await renderSidebar({});
  await fireEvent.press(screen.getByLabelText('Hỗ trợ'));
  expect(screen.getAllByText('Thông báo')).toHaveLength(1);
  expect(screen.queryByLabelText('Tìm kiếm cuộc trò chuyện')).toBeNull();
});

test('without an avatar the sidebar shows the initial of the profile name', async () => {
  await renderSidebar({});
  expect(screen.queryByLabelText('Ảnh đại diện')).toBeNull();
  expect(screen.getByText('N')).toBeTruthy();
});
