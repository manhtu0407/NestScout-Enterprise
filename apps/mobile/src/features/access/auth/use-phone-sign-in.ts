import { useCallback, useEffect, useRef, useState } from 'react';

import { normalizeVietnamPhone, type PhoneRejection } from '../phone/vietnam-phone';
import { useAccess } from '../state/access-provider';
import type { AuthFailure } from './auth-gateway';

export const otpLength = 6;

function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  const active = until !== null;
  useEffect(() => {
    if (!active) return;
    const refresh = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(refresh);
      clearInterval(timer);
    };
  }, [active]);
  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

export type PhoneSignIn = {
  busy: boolean;
  phoneError: PhoneRejection | null;
  failure: AuthFailure | null;
  codeInvalid: boolean;
  resendSeconds: number;
  submitPhone(raw: string): Promise<boolean>;
  submitCode(code: string): Promise<boolean>;
  resend(): Promise<void>;
  cancel(): void;
};

// Drives the request/verify screens: one request in flight at a time, no state
// updates after unmount, and nothing about the phone or code is logged.
export function usePhoneSignIn(): PhoneSignIn {
  const access = useAccess();
  const [busy, setBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<PhoneRejection | null>(null);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [codeInvalid, setCodeInvalid] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const resendSeconds = useCountdown(access.resendAvailableAt);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    try {
      return await action();
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);

  const requestFor = useCallback(
    async (phoneE164: string) => {
      const outcome = await access.requestOtp(phoneE164);
      if (!mounted.current) return outcome.ok;
      if (!outcome.ok) setFailure(outcome.failure);
      return outcome.ok;
    },
    [access],
  );

  return {
    busy,
    phoneError,
    failure,
    codeInvalid,
    resendSeconds,
    submitPhone: async (raw) => {
      const phone = normalizeVietnamPhone(raw);
      setPhoneError(phone.ok ? null : phone.reason);
      if (!phone.ok) return false;
      return (await run(() => requestFor(phone.e164))) ?? false;
    },
    submitCode: async (code) => {
      const valid = new RegExp(`^\\d{${otpLength}}$`).test(code);
      setCodeInvalid(!valid);
      if (!valid) return false;
      const outcome = await run(() => access.verifyOtp(code));
      if (!outcome) return false;
      if (!outcome.ok && mounted.current) setFailure(outcome.failure);
      return outcome.ok;
    },
    resend: async () => {
      if (access.otpPhone === null || resendSeconds > 0) return;
      const phone = access.otpPhone;
      await run(() => requestFor(phone));
    },
    cancel: () => access.cancelOtp(),
  };
}
