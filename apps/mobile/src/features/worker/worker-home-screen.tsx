import { ModeSwitchControl, SignOutControl, useAccess } from '@/features/access';
import { Heading, Screen } from '@/features/shared';

import { WorkerJobs } from './worker-jobs';

export function WorkerHomeScreen() {
  const access = useAccess();
  return (
    <Screen>
      <Heading>Worker mode</Heading>
      {access.userId && access.canUseWorker ? <WorkerJobs key={access.userId} userId={access.userId} /> : null}
      <ModeSwitchControl target="client" />
      <SignOutControl />
    </Screen>
  );
}
