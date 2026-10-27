import { Stack } from 'expo-router';

import { canEnterArea } from '../routing/route-policy';
import { useAccess } from '../state/access-provider';

// Client-side route protection only; unreachable areas fall back to the entry
// route, which redirects to the destination the current access state allows.
export function AccessStack() {
  const access = useAccess();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={canEnterArea(access, 'guest')}>
        <Stack.Screen name="(guest)/explore" />
      </Stack.Protected>
      <Stack.Protected guard={canEnterArea(access, 'auth')}>
        <Stack.Screen name="(auth)/phone" />
        <Stack.Screen name="(auth)/verify" />
      </Stack.Protected>
      <Stack.Protected guard={canEnterArea(access, 'client')}>
        <Stack.Screen name="(client)/client-home" />
      </Stack.Protected>
      <Stack.Protected guard={canEnterArea(access, 'worker')}>
        <Stack.Screen name="(worker)/worker-home" />
      </Stack.Protected>
    </Stack>
  );
}
