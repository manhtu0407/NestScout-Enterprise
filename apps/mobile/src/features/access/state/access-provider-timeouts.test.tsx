import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { createFakeAccessServices, type FakeOptions } from '../testing/fake-access-services';
import { AccessProvider, accessTimeouts, useAccess } from './access-provider';

function Probe() {
  const access = useAccess();
  return <Text testID="phase">{`${access.phase}:${access.workerStatus}:${access.identity}`}</Text>;
}

const never = () => new Promise<never>(() => undefined);
const phase = () => screen.getByTestId('phase').props.children as string;
const advance = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));

async function mount(options: FakeOptions) {
  const fake = createFakeAccessServices(options);
  await render(
    <AccessProvider services={fake.services}>
      <Probe />
    </AccessProvider>,
  );
  return fake;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('hanging backend', () => {
  test('a restore that never answers ends in the guest shell instead of a permanent splash', async () => {
    await mount({ restore: never });
    expect(phase()).toBe('bootstrapping:checking:unverified');
    await advance(accessTimeouts.restoreMs);
    expect(phase()).toBe('guest:checking:unverified');
  });

  test('an identity check that never answers keeps the stored account in Client, unverified', async () => {
    const fake = await mount({ session: { userId: 'user-a' }, verifyIdentity: never, capability: { kind: 'resolved', worker: 'none' } });
    await advance(0);
    await advance(accessTimeouts.identityMs);
    expect(phase()).toBe('client:none:unverified');
    expect(fake.calls.signOut).toBe(0);
  });

  test('a capability lookup that never answers falls back to Client with Worker unknown', async () => {
    await mount({ session: { userId: 'user-a' }, capability: never, storedMode: { userId: 'user-a', mode: 'worker' } });
    await advance(0);
    expect(phase()).toBe('resolving:checking:verified');
    await advance(accessTimeouts.capabilityMs);
    expect(phase()).toBe('client:unknown:verified');
  });

  test('a re-check that hangs during Worker mode fails closed once it times out', async () => {
    let calls = 0;
    const fake = await mount({
      session: { userId: 'user-a' },
      storedMode: { userId: 'user-a', mode: 'worker' },
      capability: () => (calls++ === 0 ? Promise.resolve({ kind: 'resolved', worker: 'active' } as const) : never()),
    });
    await advance(0);
    expect(phase()).toBe('worker:authorized:verified');
    await act(async () => fake.emit({ type: 'refreshed', identity: { userId: 'user-a' } }));
    expect(phase()).toBe('worker:authorized:verified');
    await advance(accessTimeouts.capabilityMs);
    expect(phase()).toBe('client:unknown:verified');
  });

  test('an answer that arrives after the timeout is discarded', async () => {
    let release: () => void = () => undefined;
    await mount({
      session: { userId: 'user-a' },
      storedMode: { userId: 'user-a', mode: 'worker' },
      capability: () => new Promise((resolve) => (release = () => resolve({ kind: 'resolved', worker: 'active' }))),
    });
    await advance(accessTimeouts.capabilityMs);
    expect(phase()).toBe('client:unknown:verified');
    await act(async () => release());
    expect(phase()).toBe('client:unknown:verified');
  });
});
