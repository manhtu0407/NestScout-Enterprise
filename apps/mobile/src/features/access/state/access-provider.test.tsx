import { act, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';

import { createFakeAccessServices, type FakeOptions } from '../testing/fake-access-services';
import { AccessProvider, useAccess } from './access-provider';

function Probe() {
  const access = useAccess();
  return <Text testID="phase">{`${access.phase}:${access.workerStatus}`}</Text>;
}

let appStateHandler: (state: string) => void = () => undefined;
const removeAppState = jest.fn();

beforeEach(() => {
  removeAppState.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, handler: (state: string) => void) => {
    appStateHandler = handler;
    return { remove: removeAppState };
  }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function mount(options: FakeOptions) {
  const fake = createFakeAccessServices(options);
  const view = await render(
    <AccessProvider services={fake.services}>
      <Probe />
    </AccessProvider>,
  );
  return { ...view, fake };
}

const phase = () => screen.getByTestId('phase').props.children as string;

describe('access provider lifecycle', () => {
  test('releases the auth subscription and app-state listener on unmount', async () => {
    const subscribe = jest.fn(() => jest.fn());
    const fake = createFakeAccessServices({ session: null });
    fake.services.auth.subscribe = subscribe;
    const view = await render(
      <AccessProvider services={fake.services}>
        <Probe />
      </AccessProvider>,
    );
    const unsubscribe = (subscribe.mock.results[0] as { value: jest.Mock }).value;
    await view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(removeAppState).toHaveBeenCalledTimes(1);
  });

  test('returning to the foreground re-checks authorization and drops a revoked Worker', async () => {
    let grant: 'active' | 'revoked' = 'active';
    const { fake } = await mount({
      session: { userId: 'user-a' },
      storedMode: { userId: 'user-a', mode: 'worker' },
      capability: async () => ({ kind: 'resolved', worker: grant }),
    });
    await waitFor(() => expect(phase()).toBe('worker:authorized'));
    const before = fake.calls.capability;
    grant = 'revoked';
    await act(async () => appStateHandler('active'));
    await waitFor(() => expect(phase()).toBe('client:revoked'));
    expect(fake.calls.capability).toBe(before + 1);
  });

  test('a token refresh re-checks authorization without another sign-in', async () => {
    const { fake } = await mount({ session: { userId: 'user-a' }, capability: { kind: 'resolved', worker: 'none' } });
    await waitFor(() => expect(phase()).toBe('client:none'));
    const before = fake.calls.capability;
    await act(async () => fake.emit({ type: 'refreshed', identity: { userId: 'user-a' } }));
    await waitFor(() => expect(fake.calls.capability).toBe(before + 1));
    expect(fake.calls.requestOtp).toHaveLength(0);
  });

  test('an answer that arrives after sign-out is discarded', async () => {
    let release: () => void = () => undefined;
    const { fake } = await mount({
      session: { userId: 'user-a' },
      capability: () => new Promise((resolve) => (release = () => resolve({ kind: 'resolved', worker: 'active' }))),
    });
    await waitFor(() => expect(fake.calls.capability).toBe(1));
    await act(async () => fake.emit({ type: 'signed_out' }));
    await waitFor(() => expect(phase()).toBe('guest:checking'));
    await act(async () => release());
    expect(phase()).toBe('guest:checking');
  });

  test('a session the backend rejects during the lookup is signed out', async () => {
    const { fake } = await mount({ session: { userId: 'user-a' }, capability: { kind: 'session_invalid' } });
    await waitFor(() => expect(phase()).toBe('guest:checking'));
    expect(fake.calls.signOut).toBe(1);
  });

  test('resuming with no session does nothing', async () => {
    const { fake } = await mount({ session: null });
    await waitFor(() => expect(phase()).toBe('guest:checking'));
    await act(async () => appStateHandler('active'));
    expect(fake.calls.capability).toBe(0);
  });
});
