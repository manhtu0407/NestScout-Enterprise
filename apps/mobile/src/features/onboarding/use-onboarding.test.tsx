import { act, renderHook } from '@testing-library/react-native';

import type { OnboardingDecision, OnboardingService } from './onboarding-service';
import { useOnboarding } from './use-onboarding';

function fakeService(decide: (userId: string) => Promise<OnboardingDecision> = async () => ({ show: true, step: 0 })) {
  return {
    evaluate: jest.fn((userId: string) => decide(userId)),
    progress: jest.fn(async () => undefined),
    conclude: jest.fn(async () => undefined),
  } satisfies OnboardingService;
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

describe('useOnboarding', () => {
  test('is off without an account and never asks the service', async () => {
    const service = fakeService();
    const { result } = await renderHook(() => useOnboarding(null, service));
    await flush();
    expect(result.current.status).toBe('off');
    expect(service.evaluate).not.toHaveBeenCalled();
  });

  test('checks first, then becomes eligible at the step the service names', async () => {
    let release: (decision: OnboardingDecision) => void = () => undefined;
    const service = fakeService(() => new Promise<OnboardingDecision>(resolve => { release = resolve; }));
    const { result } = await renderHook(() => useOnboarding('user-a', service));
    expect(result.current.status).toBe('checking');
    await act(async () => { release({ show: true, step: 2 }); });
    expect(result.current).toMatchObject({ status: 'eligible', step: 2, replay: false });
  });

  test('turns off when the service says the account must not see the tour', async () => {
    const { result } = await renderHook(() => useOnboarding('user-a', fakeService(async () => ({ show: false }))));
    await flush();
    expect(result.current.status).toBe('off');
  });

  test('turns off when the check fails', async () => {
    const { result } = await renderHook(() => useOnboarding('user-a', fakeService(async () => { throw new Error('offline'); })));
    await flush();
    expect(result.current.status).toBe('off');
  });

  test('begin, go and conclude walk the tour and record each stage', async () => {
    const service = fakeService();
    const { result } = await renderHook(() => useOnboarding('user-a', service));
    await flush();
    await act(async () => { result.current.begin(); });
    expect(result.current.status).toBe('running');
    await act(async () => { result.current.go(2); });
    expect(result.current.step).toBe(2);
    expect(service.progress).toHaveBeenCalledWith('user-a', 2);
    await act(async () => { result.current.conclude('skipped'); });
    expect(result.current.status).toBe('off');
    expect(service.conclude).toHaveBeenCalledWith('user-a', 'skipped');
  });

  test('a failing write does not break the tour or surface an error', async () => {
    const service = fakeService();
    service.progress.mockRejectedValue(new Error('disk full'));
    service.conclude.mockRejectedValue(new Error('disk full'));
    const { result } = await renderHook(() => useOnboarding('user-a', service));
    await flush();
    await act(async () => { result.current.begin(); });
    await act(async () => { result.current.go(1); });
    await act(async () => { result.current.conclude('completed'); });
    expect(result.current.status).toBe('off');
  });

  test('begin only works once the account is eligible', async () => {
    const { result } = await renderHook(() => useOnboarding('user-a', fakeService(async () => ({ show: false }))));
    await flush();
    await act(async () => { result.current.begin(); });
    expect(result.current.status).toBe('off');
  });

  test('a replay starts from the first step and records nothing', async () => {
    const service = fakeService(async () => ({ show: false }));
    const { result } = await renderHook(() => useOnboarding('user-a', service));
    await flush();
    await act(async () => { result.current.requestReplay(); });
    expect(result.current).toMatchObject({ status: 'eligible', step: 0, replay: true });
    await act(async () => { result.current.begin(); });
    await act(async () => { result.current.go(3); });
    await act(async () => { result.current.conclude('completed'); });
    expect(result.current.status).toBe('off');
    expect(service.progress).not.toHaveBeenCalled();
    expect(service.conclude).not.toHaveBeenCalled();
  });

  test('a replay is ignored without an account', async () => {
    const { result } = await renderHook(() => useOnboarding(null, fakeService()));
    await act(async () => { result.current.requestReplay(); });
    expect(result.current.status).toBe('off');
  });

  test('a replay cannot interrupt a tour already running', async () => {
    const { result } = await renderHook(() => useOnboarding('user-a', fakeService()));
    await flush();
    await act(async () => { result.current.begin(); });
    await act(async () => { result.current.requestReplay(); });
    expect(result.current).toMatchObject({ status: 'running', replay: false });
  });

  test('switching accounts starts a fresh check and ignores the earlier account answer', async () => {
    let releaseA: (decision: OnboardingDecision) => void = () => undefined;
    const service = fakeService(userId => userId === 'user-a' ? new Promise<OnboardingDecision>(resolve => { releaseA = resolve; }) : Promise.resolve({ show: false }));
    const { result, rerender } = await renderHook((props: { userId: string | null }) => useOnboarding(props.userId, service), { initialProps: { userId: 'user-a' as string | null } });
    expect(result.current.status).toBe('checking');
    await rerender({ userId: 'user-b' });
    await flush();
    expect(result.current.status).toBe('off');
    await act(async () => { releaseA({ show: true, step: 1 }); });
    expect(result.current.status).toBe('off');
    expect(service.evaluate).toHaveBeenCalledTimes(2);
  });

  test('signing out ends the tour', async () => {
    const { result, rerender } = await renderHook((props: { userId: string | null }) => useOnboarding(props.userId, fakeService()), { initialProps: { userId: 'user-a' as string | null } });
    await flush();
    await act(async () => { result.current.begin(); });
    await rerender({ userId: null });
    expect(result.current.status).toBe('off');
  });
});
