import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { useAccess } from '@/features/access';
import { readOperatorAccess } from '@/features/shared';

import { AccountScreen } from './account-screen';
import { useCustomerData } from './use-customer-data';

export function AccountSection({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const access = useAccess();
  const userId = access.identity === 'verified' ? access.userId : null;
  const { data } = useCustomerData(userId);
  const [found, setFound] = useState<{ userId: string; cases: number } | null>(null);
  useEffect(() => {
    if (userId === null) return undefined;
    const controller = new AbortController();
    readOperatorAccess(userId, controller.signal).then(
      operator => { if (!controller.signal.aborted) setFound(operator === null ? null : { userId, cases: operator.openCases }); },
      () => { if (!controller.signal.aborted) setFound(null); },
    );
    return () => controller.abort();
  }, [userId]);
  const operatorCases = found !== null && found.userId === userId ? found.cases : null;
  const mode = access.phase === 'worker' ? 'worker' : access.phase === 'client' ? 'client' : 'guest';
  return <AccountScreen
    mode={mode}
    profileName={data.profile?.display_name || undefined}
    avatarUri={data.avatar?.uri}
    onBack={onBack}
    onChangeMode={onBack}
    onSignIn={role => { access.setIntent(role); router.push({ pathname: '/phone', params: { role } }); }}
    onSignOut={() => { void access.signOut(); }}
    operatorCases={operatorCases}
    onOpenOperator={() => router.push({ pathname: '/section', params: { id: 'operator-escalations' } })}
    onEditProfile={userId === null ? undefined : () => router.push({ pathname: '/section', params: { id: 'settings' } })}
  />;
}
