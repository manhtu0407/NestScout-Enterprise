import { useCallback, useEffect, useRef, useState } from 'react';

import { useAccess } from '../state/access-provider';
import type { AuthFailure } from './auth-gateway';
import { checkConfirmation, checkEmail, checkPassword, normalizeEmail, type ConfirmRejection, type EmailRejection, type PasswordRejection } from './email-credentials';

export const emailModes = { signUp: 'signup', signIn: 'signin' } as const;

export type EmailMode = (typeof emailModes)[keyof typeof emailModes];

export type EmailFieldErrors = {
  email: EmailRejection | null;
  password: PasswordRejection | null;
  confirm: ConfirmRejection | null;
};

export type EmailAuthState = {
  busy: boolean;
  errors: EmailFieldErrors;
  failure: AuthFailure | null;
  confirmationEmail: string | null;
  submit(mode: EmailMode, fields: { email: string; password: string; confirm: string }): Promise<void>;
  reset(): void;
};

const clean: EmailFieldErrors = { email: null, password: null, confirm: null };

function judge(mode: EmailMode, fields: { email: string; password: string; confirm: string }): EmailFieldErrors {
  return {
    email: checkEmail(fields.email),
    password: mode === 'signup' ? checkPassword(fields.password) : fields.password.length === 0 ? 'password_empty' : null,
    confirm: mode === 'signup' ? checkConfirmation(fields.password, fields.confirm) : null,
  };
}

export function useEmailAuth(): EmailAuthState {
  const access = useAccess();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<EmailFieldErrors>(clean);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const submit = useCallback<EmailAuthState['submit']>(
    async (mode, fields) => {
      if (inFlight.current) return;
      const found = judge(mode, fields);
      setErrors(found);
      setFailure(null);
      if (found.email || found.password || found.confirm) return;
      inFlight.current = true;
      setBusy(true);
      const credentials = { email: normalizeEmail(fields.email), password: fields.password };
      try {
        if (mode === 'signup') {
          const outcome = await access.signUpWithEmail(credentials);
          if (!mounted.current) return;
          if (!outcome.ok) setFailure(outcome.failure);
          else if (outcome.value.status === 'confirmation_required') setConfirmationEmail(credentials.email);
        } else {
          const outcome = await access.signInWithEmail(credentials);
          if (!outcome.ok && mounted.current) setFailure(outcome.failure);
        }
      } finally {
        inFlight.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [access],
  );

  const reset = useCallback(() => {
    setErrors(clean);
    setFailure(null);
    setConfirmationEmail(null);
  }, []);

  return { busy, errors, failure, confirmationEmail, submit, reset };
}
