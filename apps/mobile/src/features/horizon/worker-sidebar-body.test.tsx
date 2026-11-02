import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { WorkerSidebarBody, type WorkerSidebarState } from './worker-sidebar-body';

const initialMetrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } };

async function renderBody(workerProfile: WorkerSidebarState | undefined, onSetAccepting?: (accepting: boolean) => Promise<void>, workerStats?: { acceptedToday: string; nextJob: string }) {
  const onNavigate = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <WorkerSidebarBody onNavigate={onNavigate} onOpenAccount={jest.fn()} onChooseMode={jest.fn()} profileName="Minh Anh" accountLabel="Tài khoản" workerProfile={workerProfile} workerStats={workerStats} onSetAccepting={onSetAccepting} />
    </SafeAreaProvider>,
  );
  return onNavigate;
}

test('a saved profile shows its area and radius and reflects the stored availability', async () => {
  await renderBody({ area: 'Quận 7', radiusKm: 10, accepting: true }, jest.fn().mockResolvedValue(undefined));
  expect(screen.getByText('Quận 7 · bán kính 10 km')).toBeTruthy();
  expect(screen.getByText('Tắt nhận việc')).toBeTruthy();
});

test('switching availability asks for the opposite state and shows it while saving', async () => {
  let finish: () => void = () => undefined;
  const onSetAccepting = jest.fn().mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  await renderBody({ area: 'Quận 7', radiusKm: 5, accepting: true }, onSetAccepting);
  await fireEvent.press(screen.getByLabelText('Nhận việc mới'));
  expect(onSetAccepting).toHaveBeenCalledWith(false);
  expect(screen.getByText('Bật nhận việc')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Nhận việc mới'));
  expect(onSetAccepting).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  expect(screen.getByText('Tắt nhận việc')).toBeTruthy();
});

test('a worker without a profile is sent to create one instead of toggling', async () => {
  const onSetAccepting = jest.fn();
  const onNavigate = await renderBody(null, onSetAccepting);
  expect(screen.getByText('Chưa có hồ sơ nghề')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Nhận việc mới'));
  expect(onNavigate).toHaveBeenCalledWith('worker-profile');
  expect(onSetAccepting).not.toHaveBeenCalled();
});

test('while the profile loads the toggle does nothing', async () => {
  const onSetAccepting = jest.fn();
  const onNavigate = await renderBody('loading', onSetAccepting);
  expect(screen.getByText('Đang tải hồ sơ…')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Nhận việc mới'));
  expect(onNavigate).not.toHaveBeenCalled();
  expect(onSetAccepting).not.toHaveBeenCalled();
});

test('the preview keeps its own local toggle and sample summary', async () => {
  await renderBody(undefined);
  expect(screen.getByText('Quận 7 · bán kính 5 km')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Nhận việc mới'));
  expect(screen.getByText('Bật nhận việc')).toBeTruthy();
});

test('real stats replace the sample summary and a loading worker sees placeholders, never sample figures', async () => {
  await renderBody({ area: 'Quận 7', radiusKm: 5, accepting: true }, jest.fn(), { acceptedToday: '450.000 ₫', nextJob: 'Sửa ống · Quận 3' });
  expect(screen.getByText('450.000 ₫')).toBeTruthy();
  expect(screen.getByText('Sửa ống · Quận 3')).toBeTruthy();
  expect(screen.queryByText('1.250.000đ')).toBeNull();
});

test('while real data loads the stats are placeholders', async () => {
  await renderBody('loading');
  expect(screen.queryByText('1.250.000đ')).toBeNull();
  expect(screen.getAllByText('…')).toHaveLength(2);
});
