import { ModeSwitchControl, SignOutControl } from '@/features/access';
import { BodyText, Heading, Screen } from '@/features/shared';

export function WorkerHomeScreen() {
  return (
    <Screen>
      <Heading>Worker mode</Heading>
      <BodyText>
        Technical placeholder for the Worker experience. Entry here reflects an active backend grant only; it is not
        a worker qualification, and no jobs or earnings exist yet.
      </BodyText>
      <ModeSwitchControl target="client" />
      <SignOutControl />
    </Screen>
  );
}
