import { useRouter } from 'expo-router';

import { useAccess } from '@/features/access';

import { AccountScreen } from './account-screen';
import { useCustomerData } from './use-customer-data';

export function AccountSection({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const access = useAccess();
  const userId = access.identity === 'verified' ? access.userId : null;
  const { data } = useCustomerData(userId);
  const mode = access.phase === 'worker' ? 'worker' : access.phase === 'client' ? 'client' : 'guest';
  return <AccountScreen
    mode={mode}
    profileName={data.profile?.display_name || undefined}
    avatarUri={data.avatar?.uri}
    onBack={onBack}
    onChangeMode={onBack}
    onSignIn={role => { access.setIntent(role); router.push({ pathname: '/phone', params: { role } }); }}
    onSignOut={() => { void access.signOut(); }}
  />;
}
