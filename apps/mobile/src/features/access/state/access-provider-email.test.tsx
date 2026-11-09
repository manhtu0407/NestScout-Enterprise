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
  return <Text testID="phase">{`${access.phase}:${access.identity}`}</Text>;
}

const phase = () => screen.getByTestId('phase').props.children as string;
const settle = () => act(async () => void (await Promise.resolve()));
const credentials = { email: 'ten@gmail.com', password: 'mat-khau-dai-123' };

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

describe('email accounts through the access provider', () => {
  test('a sign-up that returns a session establishes a verified session', async () => {
    const fake = await mount();
    await act(async () => {
      expect(await latest.signUpWithEmail(credentials)).toEqual({ ok: true, value: { status: 'signed_in', identity: { userId: 'user-a' } } });
    });
    expect(fake.calls.emailSignUps).toEqual(['ten@gmail.com']);
    expect(phase()).toBe('client:verified');
  });

  test('a sign-up awaiting confirmation leaves the visitor a guest', async () => {
    await mount({ signUpWithEmail: async () => ({ ok: true, value: { status: 'confirmation_required' } }) });
    await act(async () => {
      await latest.signUpWithEmail(credentials);
    });
    expect(phase()).toBe('guest:unverified');
  });

  test('a rejected sign-up or sign-in never creates a session', async () => {
    await mount({
      signUpWithEmail: async () => ({ ok: false, failure: 'email_taken' }),
      signInWithEmail: async () => ({ ok: false, failure: 'invalid_credentials' }),
    });
    await act(async () => {
      expect(await latest.signUpWithEmail(credentials)).toEqual({ ok: false, failure: 'email_taken' });
      expect(await latest.signInWithEmail(credentials)).toEqual({ ok: false, failure: 'invalid_credentials' });
    });
    expect(phase()).toBe('guest:unverified');
  });

  test('a successful email sign-in establishes a verified session', async () => {
    const fake = await mount();
    await act(async () => {
      expect(await latest.signInWithEmail(credentials)).toEqual({ ok: true, value: undefined });
    });
    expect(fake.calls.emailSignIns).toEqual(['ten@gmail.com']);
    expect(phase()).toBe('client:verified');
  });
});
