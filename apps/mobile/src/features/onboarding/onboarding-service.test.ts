import type { AsyncStringStorage } from '@/lib/chunked-storage';

import { createOnboardingLocalStore, type OnboardingLocalStore } from './onboarding-local-store';
import type { OnboardingMark } from './onboarding-record';
import type { OnboardingRemote } from './onboarding-remote';
import { createOnboardingService, OnboardingPersistError } from './onboarding-service';

function memoryStorage() {
  const data = new Map<string, string>();
  const storage: AsyncStringStorage = {
    getItem: async key => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async key => {
      data.delete(key);
    },
  };
  return storage;
}

type RemoteOptions = { mark?: OnboardingMark | null; cached?: OnboardingMark | null; history?: boolean };

function fakeRemote(options: RemoteOptions = {}) {
  const remote = {
    cachedMark: jest.fn(async () => options.cached ?? null),
    freshMark: jest.fn(async () => options.mark ?? null),
    writeMark: jest.fn(async () => undefined),
    hasHistory: jest.fn(async () => options.history ?? false),
  };
  return remote satisfies OnboardingRemote;
}

const live = new AbortController().signal;
const stamp = new Date('2026-11-14T08:30:00.000Z');
const mark: OnboardingMark = { outcome: 'completed', at: '2026-11-01T00:00:00.000Z' };
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function setup(options: RemoteOptions = {}) {
  const local = createOnboardingLocalStore(memoryStorage());
  const remote = fakeRemote(options);
  return { local, remote, service: createOnboardingService(local, remote, () => stamp) };
}

const brokenLocal: OnboardingLocalStore = { read: async () => null, write: async () => { throw new Error('disk full'); } };

describe('onboarding service decisions', () => {
  test('shows the tour from the first step to a genuinely new account', async () => {
    const { service, remote } = setup();
    expect(await service.evaluate('user-a', live)).toEqual({ show: true, step: 0 });
    expect(remote.freshMark).toHaveBeenCalledWith('user-a');
    expect(remote.hasHistory).toHaveBeenCalledWith('user-a', live);
  });

  test('never shows the tour to an account with earlier conversations or requests, and remembers that', async () => {
    const { service, local, remote } = setup({ history: true });
    expect(await service.evaluate('user-a', live)).toEqual({ show: false });
    expect(await local.read('user-a')).toEqual({ state: 'existing' });
    remote.hasHistory.mockClear();
    expect(await service.evaluate('user-a', live)).toEqual({ show: false });
    expect(remote.hasHistory).not.toHaveBeenCalled();
  });

  test('never shows the tour to an account whose server record says it was seen, and caches that locally', async () => {
    const { service, local, remote } = setup({ mark });
    expect(await service.evaluate('user-a', live)).toEqual({ show: false });
    expect(await local.read('user-a')).toEqual({ state: 'done', outcome: 'completed', at: mark.at });
    expect(remote.hasHistory).not.toHaveBeenCalled();
  });

  test('does not ask the server again once the device knows the tour was seen', async () => {
    const { service, local, remote } = setup({ cached: mark });
    await local.write('user-a', { state: 'done', outcome: 'skipped', at: mark.at });
    expect(await service.evaluate('user-a', live)).toEqual({ show: false });
    expect(remote.freshMark).not.toHaveBeenCalled();
    expect(remote.hasHistory).not.toHaveBeenCalled();
  });

  test('re-sends a device-only completion to the server when the account has no record yet', async () => {
    const { service, local, remote } = setup();
    await local.write('user-a', { state: 'done', outcome: 'skipped', at: mark.at });
    await service.evaluate('user-a', live);
    await settle();
    expect(remote.writeMark).toHaveBeenCalledWith('user-a', { outcome: 'skipped', at: mark.at });
  });

  test('leaves the server alone when it already holds the record', async () => {
    const { service, local, remote } = setup({ cached: mark });
    await local.write('user-a', { state: 'done', outcome: 'completed', at: mark.at });
    await service.evaluate('user-a', live);
    await settle();
    expect(remote.writeMark).not.toHaveBeenCalled();
  });

  test('a failing background re-send does not change the decision', async () => {
    const { service, local, remote } = setup();
    remote.cachedMark.mockRejectedValue(new Error('offline'));
    await local.write('user-a', { state: 'done', outcome: 'completed', at: mark.at });
    expect(await service.evaluate('user-a', live)).toEqual({ show: false });
  });

  test('resumes an interrupted tour at the saved step without a history lookup', async () => {
    const { service, local, remote } = setup();
    await local.write('user-a', { state: 'progress', step: 2 });
    expect(await service.evaluate('user-a', live)).toEqual({ show: true, step: 2 });
    expect(remote.hasHistory).not.toHaveBeenCalled();
  });

  test('a server record beats a saved step from another device', async () => {
    const { service, local } = setup({ mark });
    await local.write('user-a', { state: 'progress', step: 1 });
    expect(await service.evaluate('user-a', live)).toEqual({ show: false });
  });

  test('fails closed when the server record cannot be read', async () => {
    const { service, remote } = setup();
    remote.freshMark.mockRejectedValue(new Error('offline'));
    await expect(service.evaluate('user-a', live)).rejects.toThrow('offline');
  });

  test('fails closed when the history lookup fails', async () => {
    const { service, remote } = setup();
    remote.hasHistory.mockRejectedValue(new Error('offline'));
    await expect(service.evaluate('user-a', live)).rejects.toThrow('offline');
  });

  test('stays hidden when the check is aborted before it finishes', async () => {
    const { service, remote } = setup();
    const controller = new AbortController();
    remote.hasHistory.mockImplementation(async () => {
      controller.abort();
      return false;
    });
    expect(await service.evaluate('user-a', controller.signal)).toEqual({ show: false });
  });

  test('judges every account on its own', async () => {
    const { service } = setup();
    await service.conclude('user-a', 'skipped');
    expect(await service.evaluate('user-b', live)).toEqual({ show: true, step: 0 });
    expect(await service.evaluate('user-a', live)).toEqual({ show: false });
  });
});

describe('onboarding service writes', () => {
  test('progress records the step on the device only', async () => {
    const { service, local, remote } = setup();
    await service.progress('user-a', 3);
    expect(await local.read('user-a')).toEqual({ state: 'progress', step: 3 });
    expect(remote.writeMark).not.toHaveBeenCalled();
  });

  test('concluding stores the outcome on the device and on the account', async () => {
    const { service, local, remote } = setup();
    await service.conclude('user-a', 'skipped');
    expect(await local.read('user-a')).toEqual({ state: 'done', outcome: 'skipped', at: stamp.toISOString() });
    expect(remote.writeMark).toHaveBeenCalledWith('user-a', { outcome: 'skipped', at: stamp.toISOString() });
  });

  test('concluding succeeds when only the account write fails, and the tour does not return', async () => {
    const { service, local, remote } = setup();
    remote.writeMark.mockRejectedValue(new Error('offline'));
    await expect(service.conclude('user-a', 'completed')).resolves.toBeUndefined();
    expect(await local.read('user-a')).toMatchObject({ state: 'done', outcome: 'completed' });
    expect(await service.evaluate('user-a', live)).toEqual({ show: false });
  });

  test('concluding succeeds when only the device write fails', async () => {
    const remote = fakeRemote();
    const service = createOnboardingService(brokenLocal, remote, () => stamp);
    await expect(service.conclude('user-a', 'completed')).resolves.toBeUndefined();
    expect(remote.writeMark).toHaveBeenCalled();
  });

  test('concluding reports a failure only when nothing could be stored, yet the tour still does not return this session', async () => {
    const remote = fakeRemote();
    remote.writeMark.mockRejectedValue(new Error('offline'));
    const service = createOnboardingService(brokenLocal, remote, () => stamp);
    await expect(service.conclude('user-a', 'completed')).rejects.toBeInstanceOf(OnboardingPersistError);
    expect(await service.evaluate('user-a', live)).toEqual({ show: false });
  });
});
