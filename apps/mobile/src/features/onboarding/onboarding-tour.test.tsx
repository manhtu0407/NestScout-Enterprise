import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import type { Language } from '@/lib/preferences';

import { OnboardingTargetsProvider, useOnboardingTarget } from './onboarding-targets';
import { OnboardingTour } from './onboarding-tour';
import type { OnboardingService } from './onboarding-service';
import { useOnboarding, type OnboardingController } from './use-onboarding';

const measure = jest.fn();

beforeAll(() => {
  Object.assign(View.prototype, { measureInWindow: measure });
});

function Targets({ composer = true, autonomy = true, menu = true }: { composer?: boolean; autonomy?: boolean; menu?: boolean }) {
  const composerTarget = useOnboardingTarget('composer');
  const autonomyTarget = useOnboardingTarget('autonomy');
  const menuTarget = useOnboardingTarget('menu');
  return <>
    {composer && <View {...composerTarget} testID="composer-target"/>}
    {autonomy && <View {...autonomyTarget} testID="autonomy-target"/>}
    {menu && <View {...menuTarget} testID="menu-target"/>}
  </>;
}

type HarnessProps = {
  service: OnboardingService;
  userId?: string | null;
  language?: Language;
  role?: 'client' | 'worker';
  consentNeeded?: boolean;
  profileIncomplete?: boolean;
  hidden?: boolean;
  targets?: { composer?: boolean; autonomy?: boolean; menu?: boolean };
  onController?: (controller: OnboardingController) => void;
  onOpenMenu?: () => void;
  onOpenPrivacy?: () => void;
  onOpenProfile?: () => void;
};

function Harness({ service, userId = 'user-a', language = 'vi', role = 'client', consentNeeded = false, profileIncomplete = false, hidden = false, targets, onController, onOpenMenu = jest.fn(), onOpenPrivacy = jest.fn(), onOpenProfile = jest.fn() }: HarnessProps) {
  const controller = useOnboarding(userId, service);
  onController?.(controller);
  return <OnboardingTargetsProvider>
    <Targets {...targets}/>
    <OnboardingTour controller={controller} role={role} language={language} consentNeeded={consentNeeded} profileIncomplete={profileIncomplete} hidden={hidden} onOpenMenu={onOpenMenu} onOpenPrivacy={onOpenPrivacy} onOpenProfile={onOpenProfile}/>
  </OnboardingTargetsProvider>;
}

function fakeService(decision: { show: false } | { show: true; step: number } = { show: true, step: 0 }) {
  return {
    evaluate: jest.fn(async () => decision),
    progress: jest.fn(async () => undefined),
    conclude: jest.fn(async () => undefined),
  } satisfies OnboardingService;
}

async function elapse(milliseconds: number) {
  await act(async () => { jest.advanceTimersByTime(milliseconds); });
}

async function settle() {
  const overlay = screen.queryByTestId('onboarding-overlay');
  if (overlay === null) return;
  await fireEvent(overlay, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } } });
  await elapse(100);
}

async function open(props: HarnessProps) {
  await render(<Harness {...props}/>);
  await elapse(1200);
  await settle();
}

beforeEach(() => {
  jest.useFakeTimers();
  measure.mockReset();
  measure.mockImplementation((callback: (x: number, y: number, width: number, height: number) => void) => callback(20, 600, 300, 60));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('onboarding tour', () => {
  test('waits for the controls to settle, then opens on the welcome step', async () => {
    const service = fakeService();
    await render(<Harness service={service}/>);
    await elapse(300);
    expect(screen.queryByTestId('onboarding-overlay')).toBeNull();
    await elapse(900);
    await settle();
    expect(screen.getByText('Chào mừng đến NestScout')).toBeTruthy();
    expect(screen.getByLabelText('Hướng dẫn làm quen NestScout')).toBeTruthy();
  });

  test('stays away from an account that must not see it', async () => {
    const service = fakeService({ show: false });
    await open({ service });
    expect(screen.queryByText('Chào mừng đến NestScout')).toBeNull();
    expect(service.progress).not.toHaveBeenCalled();
    expect(service.conclude).not.toHaveBeenCalled();
  });

  test('does not start without a signed-in account', async () => {
    const service = fakeService();
    await open({ service, userId: null });
    expect(service.evaluate).not.toHaveBeenCalled();
    expect(screen.queryByText('Chào mừng đến NestScout')).toBeNull();
  });

  test('does not start while the sidebar or another overlay is covering the home screen', async () => {
    const service = fakeService();
    const view = await render(<Harness service={service} hidden/>);
    await elapse(1500);
    expect(screen.queryByText('Chào mừng đến NestScout')).toBeNull();
    await view.rerender(<Harness service={service} hidden={false}/>);
    await elapse(1200);
    await settle();
    expect(screen.getByText('Chào mừng đến NestScout')).toBeTruthy();
  });

  test('does not start until both the composer and the sidebar button are on screen', async () => {
    const service = fakeService();
    await open({ service, targets: { menu: false } });
    expect(screen.queryByText('Chào mừng đến NestScout')).toBeNull();
  });

  test('walks every step in order and remembers each one', async () => {
    const service = fakeService();
    await open({ service });
    await fireEvent.press(screen.getByLabelText('Bắt đầu'));
    await elapse(400);
    expect(screen.getByText('Kể cho Kael việc cần làm')).toBeTruthy();
    expect(service.progress).toHaveBeenLastCalledWith('user-a', 1);
    await fireEvent.press(screen.getByLabelText('Tiếp'));
    await elapse(400);
    expect(screen.getByText('Chọn cách Kael làm việc')).toBeTruthy();
    expect(service.progress).toHaveBeenLastCalledWith('user-a', 2);
    await fireEvent.press(screen.getByLabelText('Tiếp'));
    await elapse(400);
    expect(screen.getByText('Mọi thứ nằm trong thanh bên')).toBeTruthy();
    expect(service.progress).toHaveBeenLastCalledWith('user-a', 3);
    expect(service.conclude).not.toHaveBeenCalled();
  });

  test('finishing marks the tour completed and closes it', async () => {
    const service = fakeService({ show: true, step: 3 });
    await open({ service });
    await fireEvent.press(screen.getByLabelText('Bắt đầu với Kael'));
    await elapse(400);
    expect(service.conclude).toHaveBeenCalledTimes(1);
    expect(service.conclude).toHaveBeenCalledWith('user-a', 'completed');
    expect(screen.queryByText('Mọi thứ nằm trong thanh bên')).toBeNull();
  });

  test('skipping marks the tour skipped from any step', async () => {
    const service = fakeService();
    await open({ service });
    await fireEvent.press(screen.getByLabelText('Bắt đầu'));
    await elapse(400);
    await fireEvent.press(screen.getByLabelText('Bỏ qua'));
    await elapse(400);
    expect(service.conclude).toHaveBeenCalledTimes(1);
    expect(service.conclude).toHaveBeenCalledWith('user-a', 'skipped');
    expect(screen.queryByText('Kể cho Kael việc cần làm')).toBeNull();
  });

  test('a second press while closing does not conclude twice', async () => {
    const service = fakeService({ show: true, step: 3 });
    await open({ service });
    await fireEvent.press(screen.getByLabelText('Bỏ qua'));
    await fireEvent.press(screen.getByLabelText('Bỏ qua'));
    await elapse(400);
    expect(service.conclude).toHaveBeenCalledTimes(1);
  });

  test('back returns to the previous step and keeps the saved step in sync', async () => {
    const service = fakeService({ show: true, step: 2 });
    await open({ service });
    expect(screen.getByText('Chọn cách Kael làm việc')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Quay lại'));
    await elapse(400);
    expect(screen.getByText('Kể cho Kael việc cần làm')).toBeTruthy();
    expect(service.progress).toHaveBeenLastCalledWith('user-a', 1);
  });

  test('the first step has no back button', async () => {
    await open({ service: fakeService() });
    expect(screen.queryByLabelText('Quay lại')).toBeNull();
  });

  test('a step dot jumps straight to that step', async () => {
    const service = fakeService();
    await open({ service });
    await fireEvent.press(screen.getAllByLabelText('3/4')[0]!);
    await elapse(400);
    expect(screen.getByText('Chọn cách Kael làm việc')).toBeTruthy();
    expect(service.progress).toHaveBeenLastCalledWith('user-a', 2);
  });

  test('an interrupted tour resumes on the step the account stopped at', async () => {
    await open({ service: fakeService({ show: true, step: 2 }) });
    expect(screen.getByText('Chọn cách Kael làm việc')).toBeTruthy();
  });

  test('a step is skipped when its control is not on the screen', async () => {
    await open({ service: fakeService(), targets: { autonomy: false } });
    await fireEvent.press(screen.getByLabelText('Bắt đầu'));
    await elapse(400);
    await fireEvent.press(screen.getByLabelText('Tiếp'));
    await elapse(400);
    expect(screen.getByText('Mọi thứ nằm trong thanh bên')).toBeTruthy();
    expect(screen.queryByText('Chọn cách Kael làm việc')).toBeNull();
  });

  test('the sidebar step can open the sidebar and ends the tour as completed', async () => {
    const service = fakeService({ show: true, step: 3 });
    const onOpenMenu = jest.fn();
    await open({ service, onOpenMenu });
    await fireEvent.press(screen.getByLabelText('Mở thanh bên'));
    await elapse(400);
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
    expect(service.conclude).toHaveBeenCalledWith('user-a', 'completed');
  });

  test('a missing AI sharing consent is explained and leads to Privacy without granting anything', async () => {
    const service = fakeService({ show: true, step: 1 });
    const onOpenPrivacy = jest.fn();
    await open({ service, consentNeeded: true, onOpenPrivacy });
    expect(screen.getByText(/Chia sẻ dữ liệu với AI/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Tiếp'));
    await elapse(400);
    await fireEvent.press(screen.getByLabelText('Tiếp'));
    await elapse(400);
    await fireEvent.press(screen.getByLabelText('Mở Quyền riêng tư'));
    await elapse(400);
    expect(onOpenPrivacy).toHaveBeenCalledTimes(1);
    expect(service.conclude).toHaveBeenCalledWith('user-a', 'completed');
  });

  test('a worker with an incomplete profile is offered the profile', async () => {
    const onOpenProfile = jest.fn();
    await open({ service: fakeService({ show: true, step: 3 }), role: 'worker', profileIncomplete: true, onOpenProfile });
    await fireEvent.press(screen.getByLabelText('Hoàn thiện hồ sơ'));
    await elapse(400);
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });

  test('English copy follows the language preference', async () => {
    await open({ service: fakeService(), language: 'en' });
    expect(screen.getByText('Welcome to NestScout')).toBeTruthy();
    expect(screen.getByLabelText('Skip')).toBeTruthy();
  });

  test('a replay runs the whole tour without touching what the account has stored', async () => {
    const service = fakeService({ show: false });
    let controller: OnboardingController | undefined;
    await open({ service, onController: value => { controller = value; } });
    expect(screen.queryByText('Chào mừng đến NestScout')).toBeNull();
    await act(async () => { controller?.requestReplay(); });
    await elapse(600);
    await settle();
    expect(screen.getByText('Chào mừng đến NestScout')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Bắt đầu'));
    await elapse(400);
    await fireEvent.press(screen.getByLabelText('Bỏ qua'));
    await elapse(400);
    expect(screen.queryByText('Kể cho Kael việc cần làm')).toBeNull();
    expect(service.progress).not.toHaveBeenCalled();
    expect(service.conclude).not.toHaveBeenCalled();
  });

  test('a replay finishes cleanly and can be run again', async () => {
    const service = fakeService({ show: false });
    let controller: OnboardingController | undefined;
    await open({ service, onController: value => { controller = value; } });
    for (let run = 0; run < 2; run += 1) {
      await act(async () => { controller?.requestReplay(); });
      await elapse(600);
      await settle();
      expect(screen.getByText('Chào mừng đến NestScout')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Bỏ qua'));
      await elapse(400);
      expect(screen.queryByText('Chào mừng đến NestScout')).toBeNull();
    }
  });

  test('switching accounts judges the new account afresh', async () => {
    const service = fakeService({ show: false });
    const view = await render(<Harness service={service} userId="user-a"/>);
    await elapse(1200);
    expect(service.evaluate).toHaveBeenCalledTimes(1);
    service.evaluate.mockResolvedValueOnce({ show: true, step: 0 });
    await view.rerender(<Harness service={service} userId="user-b"/>);
    await elapse(1500);
    await settle();
    expect(service.evaluate).toHaveBeenLastCalledWith('user-b', expect.any(AbortSignal));
    expect(screen.getByText('Chào mừng đến NestScout')).toBeTruthy();
  });
});
