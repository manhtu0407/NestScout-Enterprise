import { act, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { createFakeAccessServices, type FakeOptions } from '../testing/fake-access-services';
import { AccessProvider, useAccess, type AccessApi } from './access-provider';

let latest: AccessApi;

function Probe() {
  const access = useAccess();
  useEffect(() => {
    latest = access;
  });
  return <Text testID="phase">{`${access.phase}:${access.identity}:${access.redirectFailure ?? 'none'}`}</Text>;
}

const phase = () => screen.getByTestId('phase').props.children as string;
const settle = () => act(async () => void (await Promise.resolve()));

async function mount(options: FakeOptions = {}) {
  const fake = createFakeAccessServices(options);
  await render(
    <AccessProvider services={fake.services}>
      <Probe />
    </AccessProvider>,
  );
  await settle();
  return fake;
}

describe('provider sign-in through the access provider', () => {
  test('a completed provider sign-in establishes a verified session', async () => {
    const fake = await mount();
    expect(phase()).toBe('guest:unverified:none');
    await act(async () => {
      expect(await latest.signInWithProvider('google')).toEqual({ ok: true, value: { status: 'signed_in', identity: { userId: 'user-a' } } });
    });
    expect(fake.calls.providers).toEqual(['google']);
    expect(phase()).toBe('client:verified:none');
  });

  test('a cancelled or failed provider sign-in leaves the visitor a guest', async () => {
    const fake = await mount({ signInWithProvider: async () => ({ ok: false, failure: 'cancelled' }) });
    await act(async () => {
      expect(await latest.signInWithProvider('apple')).toEqual({ ok: false, failure: 'cancelled' });
    });
    expect(fake.calls.providers).toEqual(['apple']);
    expect(phase()).toBe('guest:unverified:none');
  });

  test('a web redirect in progress does not claim a session', async () => {
    await mount({ signInWithProvider: async () => ({ ok: true, value: { status: 'redirecting' } }) });
    await act(async () => {
      await latest.signInWithProvider('google');
    });
    expect(phase()).toBe('guest:unverified:none');
  });
});

describe('returning from the provider page', () => {
  test('a failed return is surfaced and can be dismissed', async () => {
    await mount({ completeRedirect: async () => ({ ok: false, failure: 'cancelled' }) });
    expect(phase()).toBe('guest:unverified:cancelled');
    await act(async () => latest.dismissRedirectFailure());
    expect(phase()).toBe('guest:unverified:none');
  });

  test('a successful return restores the stored session', async () => {
    await mount({ completeRedirect: async () => ({ ok: true, value: { userId: 'user-a' } }), restore: async () => ({ userId: 'user-a' }), capability: { kind: 'resolved', worker: 'none' } });
    expect(phase()).toBe('client:verified:none');
  });
});
