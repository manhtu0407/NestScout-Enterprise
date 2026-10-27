import { ModeSwitchControl, SignOutControl, WorkerAccessNotice } from '@/features/access';
import { BodyText, Heading, Screen } from '@/features/shared';

export function ClientHomeScreen() {
  return (
    <Screen>
      <Heading>Client mode</Heading>
      <BodyText>
        Technical placeholder for the signed-in Client experience. No service catalog, booking or assistant exists yet.
      </BodyText>
      <WorkerAccessNotice />
      <ModeSwitchControl target="worker" />
      <SignOutControl />
    </Screen>
  );
}
