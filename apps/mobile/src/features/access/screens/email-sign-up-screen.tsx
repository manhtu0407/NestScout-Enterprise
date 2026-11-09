import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { parseSignInRole, type SignInRole } from '../sign-in/sign-in-types';
import { useAccess } from '../state/access-provider';
import { EmailSignUpForm } from './email-sign-up-form';

export function EmailSignUpScreen() {
  const router = useRouter();
  const { cancelHorizonTransfer, setIntent } = useAccess();
  const { role: roleParam } = useLocalSearchParams<{ role?: string }>();
  const role = parseSignInRole(roleParam);

  useEffect(() => () => cancelHorizonTransfer(), [cancelHorizonTransfer]);

  const changeRole = (next: SignInRole) => {
    setIntent(next);
    router.setParams({ role: next });
  };

  return <EmailSignUpForm role={role} onRoleChange={changeRole} onBack={() => router.back()} />;
}
