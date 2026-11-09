import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { emailModes, useEmailAuth, type EmailMode } from '../auth/use-email-auth';
import { EmailGate } from '../sign-in/email-gate';
import { parseSignInRole, type SignInRole } from '../sign-in/sign-in-types';
import { useAccess } from '../state/access-provider';

export function EmailSignUpScreen() {
  const router = useRouter();
  const emailAuth = useEmailAuth();
  const { cancelHorizonTransfer, setIntent } = useAccess();
  const { role: roleParam } = useLocalSearchParams<{ role?: string }>();
  const role = parseSignInRole(roleParam);
  const [mode, setMode] = useState<EmailMode>(emailModes.signUp);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  useEffect(() => () => cancelHorizonTransfer(), [cancelHorizonTransfer]);

  const changeRole = (next: SignInRole) => {
    setIntent(next);
    router.setParams({ role: next });
  };

  const changeMode = (next: EmailMode) => {
    emailAuth.reset();
    setPassword('');
    setConfirm('');
    setMode(next);
  };

  return (
    <EmailGate
      role={role}
      onRoleChange={changeRole}
      mode={mode}
      onModeChange={changeMode}
      email={email}
      onEmailChange={setEmail}
      password={password}
      onPasswordChange={setPassword}
      confirm={confirm}
      onConfirmChange={setConfirm}
      errors={emailAuth.errors}
      failure={emailAuth.failure}
      busy={emailAuth.busy}
      confirmationEmail={emailAuth.confirmationEmail}
      onSubmit={() => void emailAuth.submit(mode, { email, password, confirm })}
      onBack={() => router.back()}
    />
  );
}
