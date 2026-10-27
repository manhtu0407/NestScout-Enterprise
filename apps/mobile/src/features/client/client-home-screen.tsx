import { ModeSwitchControl, SignOutControl, WorkerAccessNotice, useAccess } from '@/features/access';
import { BodyText, Heading, Screen } from '@/features/shared';

import { ServiceRequests } from './service-requests';

export function ClientHomeScreen() {
  const access = useAccess();
  return (
    <Screen>
      <Heading>Client mode</Heading>
      {access.identity === 'verified' && access.userId ? (
        <ServiceRequests key={access.userId} userId={access.userId} guestDraft={access.guestDraft} clearGuestDraft={access.clearGuestDraft} />
      ) : <BodyText>Verify your session before submitting or viewing requests.</BodyText>}
      <WorkerAccessNotice />
      <ModeSwitchControl target="worker" />
      <SignOutControl />
    </Screen>
  );
}
