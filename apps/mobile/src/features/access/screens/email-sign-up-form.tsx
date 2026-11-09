import { useState } from 'react';

import { emailModes, useEmailAuth, type EmailMode } from '../auth/use-email-auth';
import { EmailGate } from '../sign-in/email-gate';
import type { SignInRole } from '../sign-in/sign-in-types';

type Props = {
  role: SignInRole;
  onRoleChange: (role: SignInRole) => void;
  onBack: () => void;
};

export function EmailSignUpForm({ role, onRoleChange, onBack }: Props) {
  const emailAuth = useEmailAuth();
  const [mode, setMode] = useState<EmailMode>(emailModes.signUp);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const changeMode = (next: EmailMode) => {
    emailAuth.reset();
    setPassword('');
    setConfirm('');
    setMode(next);
  };

  return (
    <EmailGate
      role={role}
      onRoleChange={onRoleChange}
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
      onBack={onBack}
    />
  );
}
