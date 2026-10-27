import { useRouter } from 'expo-router';

import { ActionButton, BodyText, Heading, Screen } from '@/features/shared';

import { useAccess } from '../state/access-provider';

export function GuestLandingScreen() {
  const router = useRouter();
  const access = useAccess();
  const signIn = (intent: 'client' | 'worker' | null) => {
    access.setIntent(intent);
    router.push('/phone');
  };
  return (
    <Screen>
      <Heading>NestScout</Heading>
      <BodyText>
        You are exploring as a guest. This build is a technical foundation: no services, prices, bookings or assistant
        are available yet.
      </BodyText>
      <ActionButton label="Sign in with phone" onPress={() => signIn(null)} hint="Opens phone number sign-in" />
      <BodyText muted>Protected areas need an account. These actions only demonstrate the sign-in transition.</BodyText>
      <ActionButton
        secondary
        label="Open Client area"
        onPress={() => signIn('client')}
        hint="Requires sign-in, then opens the Client area"
      />
      <ActionButton
        secondary
        label="Open Worker area"
        onPress={() => signIn('worker')}
        hint="Requires sign-in and Worker access granted by the backend"
      />
    </Screen>
  );
}
