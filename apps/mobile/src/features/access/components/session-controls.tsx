import { useState } from 'react';

import { ActionButton, BodyText, ErrorText } from '@/features/shared';

import type { AppMode } from '../mode/app-mode';
import { useAccess } from '../state/access-provider';

export function SignOutControl() {
  const access = useAccess();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const signOut = async () => {
    setBusy(true);
    const outcome = await access.signOut();
    setFailed(!outcome.ok);
    setBusy(false);
  };
  return (
    <>
      <ActionButton secondary label="Sign out" onPress={signOut} busy={busy} />
      {failed ? <ErrorText>Could not sign out. Check your connection and try again.</ErrorText> : null}
    </>
  );
}

export function ModeSwitchControl({ target }: { target: AppMode }) {
  const access = useAccess();
  if (target === 'worker' && !access.canUseWorker) return null;
  return (
    <ActionButton
      label={target === 'worker' ? 'Switch to Worker mode' : 'Switch to Client mode'}
      onPress={() => access.switchMode(target)}
      hint="Changes the active mode without signing in again"
    />
  );
}

export function WorkerAccessNotice() {
  const access = useAccess();
  if (access.notice === 'worker_unavailable') {
    return (
      <>
        <ErrorText>Worker mode is not available for this account.</ErrorText>
        <ActionButton secondary label="Dismiss" onPress={access.dismissNotice} />
      </>
    );
  }
  if (access.notice === 'worker_unverified' || access.workerStatus === 'unknown') {
    return (
      <>
        <ErrorText>Worker access could not be verified, so Client mode is shown.</ErrorText>
        <ActionButton secondary label="Check Worker access again" onPress={access.recheck} />
      </>
    );
  }
  return access.workerStatus === 'checking' ? <BodyText muted>Checking Worker access…</BodyText> : null;
}
