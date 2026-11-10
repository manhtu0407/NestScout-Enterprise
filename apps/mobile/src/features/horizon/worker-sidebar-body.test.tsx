import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { WorkerSidebarBody, type WorkerSidebarState } from './worker-sidebar-body';

const switchOn = () => screen.getByLabelText('Nhận việc mới').props.accessibilityState.checked;

const initialMetrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } };

async function renderBody(workerProfile: WorkerSidebarState | undefined, onSetAccepting?: (accepting: boolean) => Promise<void>) {
  const onNavigate = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <WorkerSidebarBody onNavigate={onNavigate} onOpenAccount={jest.fn()} onChooseMode={jest.fn()} profileName="Minh Anh" accountLabel="Tài khoản" workerProfile={workerProfile} onSetAccepting={onSetAccepting} />
    </SafeAreaProvider>,
  );
  return onNavigate;
}

test('a saved profile shows its area and radius and reflects the stored availability', async () => {
  await renderBody({ area: 'Quận 7', radiusKm: 10, accepting: true, missing: [] }, jest.fn().mockResolvedValue(undefined));
  expect(screen.getByText('Quận 7 · bán kính 10 km')).toBeTruthy();
  expect(switchOn()).toBe(true);
  expect(screen.getByText('Đang bật · sẵn sàng nhận việc')).toBeTruthy();
});

test('switching availability asks for the opposite state and shows it while saving', async () => {
  let finish: () => void = () => undefined;
  const onSetAccepting = jest.fn().mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  await renderBody({ area: 'Quận 7', radiusKm: 5, accepting: true, missing: [] }, onSetAccepting);
  await fireEvent.press(screen.getByLabelText('Nhận việc mới'));
  expect(onSetAccepting).toHaveBeenCalledWith(false);
  expect(switchOn()).toBe(false);
  await fireEvent.press(screen.getByLabelText('Nhận việc mới'));
  expect(onSetAccepting).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  expect(switchOn()).toBe(false);
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
  expect(switchOn()).toBe(true);
  await fireEvent.press(screen.getByLabelText('Nhận việc mới'));
  expect(switchOn()).toBe(false);
});

test('a profile with missing items is sent to complete it instead of switching on', async () => {
  const onSetAccepting = jest.fn();
  const onNavigate = await renderBody({ area: 'Quận 7', radiusKm: 5, accepting: false, missing: ['identity'] }, onSetAccepting);
  expect(screen.getByText('Cần bổ sung 1 mục hồ sơ')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Nhận việc mới'));
  expect(onNavigate).toHaveBeenCalledWith('worker-profile');
  expect(onSetAccepting).not.toHaveBeenCalled();
});
