import { ModeSwitchControl, SignOutControl } from '@/features/access';
import { Heading, Screen } from '@/features/shared';

export function WorkerHomeScreen() {
  return (
    <Screen>
      <Heading>Worker mode</Heading>
      <ModeSwitchControl target="client" />
      <SignOutControl />
    </Screen>
  );
}
