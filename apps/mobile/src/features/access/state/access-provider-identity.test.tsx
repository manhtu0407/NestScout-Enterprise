import { act, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import type { IdentityCheck } from '../auth/auth-gateway';
import type { CapabilityResult } from '../capability/capability-repository';
import { createFakeAccessServices, type FakeOptions } from '../testing/fake-access-services';
import { AccessProvider, accessTimeouts, useAccess, type AccessApi } from './access-provider';

let latest: AccessApi;

function Probe() {
  const access = useAccess();
  useEffect(() => {
    latest = access;
  });
  return <Text testID="phase">{`${access.phase}:${access.workerStatus}:${access.identity}`}</Text>;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

const never = () => new Promise<never>(() => undefined);
const active: CapabilityResult = { kind: 'resolved', worker: 'active' };
const workerPreference = { userId: 'user-a', mode: 'worker' } as const;
const phase = () => screen.getByTestId('phase').props.children as string;
const settle = () => act(async () => void (await Promise.resolve()));
const advance = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));

async function mount(options: FakeOptions) {
  const fake = createFakeAccessServices(options);
  await render(
    <AccessProvider services={fake.services}>
      <Probe />
    </AccessProvider>,
  );
  await settle();
  return fake;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Worker requires a verified identity (ACCESS-02, ACCESS-03)', () => {
  test('an unreachable identity check with an active grant and a saved Worker preference stays in Client', async () => {
    await mount({
      session: { userId: 'user-a' },
      identityCheck: { status: 'unreachable' },
      capability: active,
      storedMode: workerPreference,
    });
    expect(phase()).toBe('client:unknown:unverified');
    expect(latest.canUseWorker).toBe(false);
  });

  test('an identity check that times out stays in Client even with an active grant', async () => {
    const fake = await mount({ session: { userId: 'user-a' }, verifyIdentity: never, capability: active, storedMode: workerPreference });
    await advance(accessTimeouts.identityMs);
    expect(phase()).toBe('client:unknown:unverified');
    expect(latest.canUseWorker).toBe(false);
    expect(fake.calls.signOut).toBe(0);
  });

  test('a SIGNED_IN event from the cached session cannot override an unreachable getUser', async () => {
    const check = deferred<IdentityCheck>();
    const fake = await mount({ session: { userId: 'user-a' }, verifyIdentity: () => check.promise, capability: active, storedMode: workerPreference });
    await act(async () => fake.emit({ type: 'signed_in', identity: { userId: 'user-a' } }));
    await act(async () => check.resolve({ status: 'unreachable' }));
    expect(phase()).toBe('client:unknown:unverified');
    await act(async () => fake.emit({ type: 'refreshed', identity: { userId: 'user-a' } }));
    await act(async () => fake.emit({ type: 'updated', identity: { userId: 'user-a' } }));
    expect(phase()).toBe('client:unknown:unverified');
  });

  test('events that arrive before the stored session is restored still wait for getUser', async () => {
    const restore = deferred<{ userId: string } | null>();
    const check = deferred<IdentityCheck>();
    const fake = await mount({ restore: () => restore.promise, verifyIdentity: () => check.promise, capability: active, storedMode: workerPreference });
    await act(async () => fake.emit({ type: 'signed_in', identity: { userId: 'user-a' } }));
    expect(phase().endsWith(':unverified')).toBe(true);
    expect(latest.canUseWorker).toBe(false);
    await act(async () => restore.resolve({ userId: 'user-a' }));
    await act(async () => check.resolve({ status: 'unreachable' }));
    expect(phase()).toBe('client:unknown:unverified');
  });

  test('a getUser answer for another account never verifies the current one', async () => {
    await mount({
      session: { userId: 'user-a' },
      identityCheck: { status: 'valid', identity: { userId: 'user-b' } },
      capability: active,
      storedMode: workerPreference,
    });
    expect(phase()).toBe('client:unknown:unverified');
  });

  test('a later successful re-check verifies the account and the saved preference then applies', async () => {
    let answer: IdentityCheck = { status: 'unreachable' };
    const fake = await mount({ session: { userId: 'user-a' }, verifyIdentity: async () => answer, capability: active, storedMode: workerPreference });
    expect(phase()).toBe('client:unknown:unverified');
    answer = { status: 'valid', identity: { userId: 'user-a' } };
    await act(async () => latest.recheck());
    expect(phase()).toBe('worker:authorized:verified');
    expect(fake.calls.requestOtp).toHaveLength(0);
  });
});

describe('verified identity with a current grant (ACCESS-04)', () => {
  test('enters Worker from the saved preference and switches modes without another sign-in', async () => {
    const fake = await mount({ session: { userId: 'user-a' }, capability: active, storedMode: workerPreference });
    expect(phase()).toBe('worker:authorized:verified');
    await act(async () => latest.switchMode('client'));
    expect(phase()).toBe('client:authorized:verified');
    await act(async () => latest.switchMode('worker'));
    await settle();
    expect(phase()).toBe('worker:authorized:verified');
    expect(fake.calls.requestOtp).toHaveLength(0);
    expect(fake.calls.verifyOtp).toHaveLength(0);
  });

  test('an interactive OTP confirmation is a verified login that does not wait for getUser', async () => {
    await mount({ session: null, verifyIdentity: never, capability: active, signInIdentity: { userId: 'user-a' } });
    expect(phase()).toBe('guest:checking:unverified');
    await act(async () => void (await latest.requestOtp('+84912345678')));
    await act(async () => void (await latest.verifyOtp('654321')));
    await settle();
    expect(phase()).toBe('client:authorized:verified');
  });
});

describe('late and superseded answers (ACCESS-06)', () => {
  test('a stale active answer after an account switch cannot reopen Worker for the new account', async () => {
    const first = deferred<CapabilityResult>();
    const fake = await mount({
      session: { userId: 'user-a' },
      storedMode: workerPreference,
      capability: ({ userId }) => (userId === 'user-a' ? first.promise : Promise.resolve({ kind: 'resolved', worker: 'none' })),
      identityCheck: { status: 'valid', identity: { userId: 'user-a' } },
    });
    await act(async () => fake.emit({ type: 'signed_in', identity: { userId: 'user-b' } }));
    await act(async () => void (await latest.verifyOtp('x')));
    await act(async () => first.resolve(active));
    expect(latest.userId).toBe('user-b');
    expect(latest.canUseWorker).toBe(false);
    expect(phase().startsWith('worker')).toBe(false);
  });

  test('sign-out while a lookup is pending, then a late active answer, stays a guest', async () => {
    const pending = deferred<CapabilityResult>();
    const fake = await mount({ session: { userId: 'user-a' }, storedMode: workerPreference, capability: () => pending.promise });
    await act(async () => void (await latest.signOut()));
    await act(async () => pending.resolve(active));
    expect(phase()).toBe('guest:checking:unverified');
    expect(fake.calls.signOut).toBe(1);
  });

  test('a failed sign-out keeps the account and its Worker access unchanged', async () => {
    const fake = await mount({ session: { userId: 'user-a' }, storedMode: workerPreference, capability: active, signOut: async () => ({ ok: false, failure: 'network' }) });
    expect(phase()).toBe('worker:authorized:verified');
    await act(async () => void (await latest.signOut()));
    expect(phase()).toBe('worker:authorized:verified');
    expect(latest.userId).toBe('user-a');
    expect(fake.calls.signOut).toBe(1);
  });

  test('a late active answer after the capability timeout does not reopen Worker', async () => {
    const pending = deferred<CapabilityResult>();
    await mount({ session: { userId: 'user-a' }, storedMode: workerPreference, capability: () => pending.promise });
    await advance(accessTimeouts.capabilityMs);
    expect(phase()).toBe('client:unknown:verified');
    await act(async () => pending.resolve(active));
    expect(phase()).toBe('client:unknown:verified');
  });

  test('overlapping re-checks: an older active answer cannot override a newer revocation', async () => {
    const first = deferred<CapabilityResult>();
    const second = deferred<CapabilityResult>();
    let call = 0;
    await mount({
      session: { userId: 'user-a' },
      storedMode: workerPreference,
      capability: () => {
        call += 1;
        if (call === 1) return Promise.resolve(active);
        return call === 2 ? first.promise : second.promise;
      },
    });
    expect(phase()).toBe('worker:authorized:verified');
    await act(async () => latest.recheck());
    await act(async () => latest.recheck());
    await act(async () => second.resolve({ kind: 'resolved', worker: 'revoked' }));
    expect(phase()).toBe('client:revoked:verified');
    await act(async () => first.resolve(active));
    expect(phase()).toBe('client:revoked:verified');
  });

  test('a superseded lookup is aborted so the underlying request is cancelled where supported', async () => {
    const fake = await mount({ session: { userId: 'user-a' }, capability: never });
    const [first] = fake.calls.signals;
    await act(async () => latest.recheck());
    expect(first?.aborted).toBe(true);
  });

  test('an invalid-session answer for a superseded identity check does not sign out the new session', async () => {
    const check = deferred<IdentityCheck>();
    let call = 0;
    const fake = await mount({
      session: { userId: 'user-a' },
      verifyIdentity: () => (call++ === 0 ? check.promise : Promise.resolve({ status: 'valid', identity: { userId: 'user-b' } })),
      capability: active,
    });
    await act(async () => fake.emit({ type: 'signed_in', identity: { userId: 'user-b' } }));
    await act(async () => check.resolve({ status: 'invalid' }));
    expect(fake.calls.signOut).toBe(0);
    expect(latest.userId).toBe('user-b');
    expect(latest.identity).toBe('verified');
  });

  test('an account that signs in again after its session was refused stays signed in', async () => {
    const fake = await mount({ session: { userId: 'user-a' }, identityCheck: { status: 'invalid' }, signInIdentity: { userId: 'user-a' }, capability: active });
    expect(phase()).toBe('guest:checking:unverified');
    await act(async () => void (await latest.requestOtp('+84912345678')));
    await act(async () => void (await latest.verifyOtp('654321')));
    await settle();
    expect(latest.userId).toBe('user-a');
    expect(phase()).toBe('client:authorized:verified');
    expect(fake.calls.signOut).toBe(0);
  });

  test('foreground resume repeated while pending does not stack lookups into a stale grant', async () => {
    const pending = [deferred<CapabilityResult>(), deferred<CapabilityResult>(), deferred<CapabilityResult>()];
    let call = 0;
    await mount({ session: { userId: 'user-a' }, storedMode: workerPreference, capability: () => (pending[call++] ?? pending[2]!).promise });
    await act(async () => latest.recheck());
    await act(async () => latest.recheck());
    await act(async () => pending[2]!.resolve({ kind: 'resolved', worker: 'none' }));
    await act(async () => pending[0]!.resolve(active));
    await act(async () => pending[1]!.resolve(active));
    expect(phase()).toBe('client:none:verified');
  });
});

describe('session rejection (ACCESS-07)', () => {
  test('an invalid getUser answer ends the session and signs out once', async () => {
    const fake = await mount({ session: { userId: 'user-a' }, identityCheck: { status: 'invalid' }, capability: active, storedMode: workerPreference });
    expect(phase()).toBe('guest:checking:unverified');
    expect(fake.calls.signOut).toBe(0);
  });

  test('a rejected access token on the lookup re-verifies identity instead of signing out directly', async () => {
    let check: IdentityCheck = { status: 'valid', identity: { userId: 'user-a' } };
    const fake = await mount({
      session: { userId: 'user-a' },
      verifyIdentity: async () => check,
      capability: { kind: 'unauthenticated' },
      storedMode: workerPreference,
    });
    // The lookup was rejected, so the account is not trusted until getUser answers; it did.
    expect(fake.calls.verifyIdentity).toBeGreaterThanOrEqual(2);
    expect(fake.calls.signOut).toBe(0);
    expect(latest.canUseWorker).toBe(false);
    expect(phase()).toBe('client:unknown:verified');
    check = { status: 'invalid' };
    await act(async () => latest.recheck());
    await act(async () => latest.recheck());
    expect(phase()).toBe('guest:checking:unverified');
    expect(fake.calls.signOut).toBe(0);
  });

  test('a rejected token while the server is unreachable keeps the session but not Worker', async () => {
    const fake = await mount({
      session: { userId: 'user-a' },
      identityCheck: { status: 'unreachable' },
      capability: { kind: 'unauthenticated' },
      storedMode: workerPreference,
    });
    expect(phase()).toBe('client:unknown:unverified');
    expect(fake.calls.signOut).toBe(0);
  });

  test('a lookup rejected on every attempt does not loop on identity checks', async () => {
    const fake = await mount({ session: { userId: 'user-a' }, capability: { kind: 'unauthenticated' } });
    await advance(accessTimeouts.capabilityMs);
    expect(fake.calls.capability).toBeLessThanOrEqual(2);
    expect(fake.calls.verifyIdentity).toBeLessThanOrEqual(2);
  });
});

describe('bootstrap never hangs (ACCESS-08)', () => {
  test('a saved-preference read that never answers settles to Client', async () => {
    const fake = createFakeAccessServices({ session: { userId: 'user-a' }, capability: active });
    fake.services.preferredMode.load = never;
    await render(
      <AccessProvider services={fake.services}>
        <Probe />
      </AccessProvider>,
    );
    await settle();
    expect(phase().startsWith('resolving')).toBe(true);
    await advance(accessTimeouts.preferenceMs);
    expect(phase()).toBe('client:authorized:verified');
  });

  test('a saved-preference read that rejects settles to Client', async () => {
    const fake = createFakeAccessServices({ session: { userId: 'user-a' }, capability: active });
    fake.services.preferredMode.load = () => Promise.reject(new Error('keychain unavailable'));
    await render(
      <AccessProvider services={fake.services}>
        <Probe />
      </AccessProvider>,
    );
    await settle();
    expect(phase()).toBe('client:authorized:verified');
  });

  test('a restore that rejects settles to the guest shell', async () => {
    await mount({ restore: () => Promise.reject(new Error('storage corrupt')) });
    expect(phase()).toBe('guest:checking:unverified');
  });

  test('repeated foreground resumes with a hanging backend leave no pending state behind', async () => {
    const fake = await mount({ session: { userId: 'user-a' }, capability: never, storedMode: workerPreference });
    for (let index = 0; index < 5; index++) {
      await act(async () => latest.recheck());
      await advance(accessTimeouts.capabilityMs);
    }
    expect(phase()).toBe('client:unknown:verified');
    expect(fake.calls.signals.slice(0, -1).every((signal) => signal.aborted)).toBe(true);
  });
});

describe('account isolation (ACCESS-09)', () => {
  test('a saved Worker preference of one account never applies to another', async () => {
    const fake = await mount({ session: { userId: 'user-b' }, capability: active, storedMode: workerPreference });
    expect(phase()).toBe('client:authorized:verified');
    expect(fake.storedMode()).toEqual({ userId: 'user-b', mode: 'client' });
  });

  test('signing out clears the saved preference', async () => {
    const fake = await mount({ session: { userId: 'user-a' }, capability: active, storedMode: workerPreference });
    await act(async () => void (await latest.signOut()));
    await settle();
    expect(fake.storedMode()).toBeNull();
  });
});
