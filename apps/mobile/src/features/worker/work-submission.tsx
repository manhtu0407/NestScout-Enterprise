import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { TextInput } from 'react-native';

import { ActionButton, BodyText, DraftRecovery, ErrorText, failureMessage, isDefinitiveFailure, useDraftRecovery } from '@/features/shared';
import { deviceStorage } from '@/lib/device-storage';

import { submitWork, type Job } from './worker-repository';

type Pending = { key: string; version: number; evidence: string };

type Props = { userId: string; job: Job; scopePending?: boolean; locked?: boolean; onSettled(): void };

export function WorkSubmission(props: Props) {
  const storageKey = `nestscout.work-submission.${props.userId}.${props.job.job_id}`;
  return <WorkSubmissionDraft key={storageKey} storageKey={storageKey} {...props} />;
}

function WorkSubmissionDraft({ storageKey, userId, job, scopePending = false, locked = false, onSettled }: Props & { storageKey: string }) {
  const [evidence, setEvidence] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [ready, setReady] = useState(false);
  const { attempt, unreadable, setUnreadable, retry } = useDraftRecovery();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const active = useRef(true);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setUnreadable(false);
    deviceStorage.getItem(storageKey).then((raw) => {
      if (cancelled) return;
      if (raw !== null) {
        const item: unknown = JSON.parse(raw);
        if (typeof item !== 'object' || item === null) throw new Error('Invalid pending submission');
        const saved = item as Record<string, unknown>;
        if (typeof saved.key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.key)
          || typeof saved.version !== 'number' || !Number.isSafeInteger(saved.version) || saved.version < 1
          || typeof saved.evidence !== 'string' || !saved.evidence.trim() || saved.evidence.length > 4000) {
          throw new Error('Invalid pending submission');
        }
        const itemValue = { key: saved.key, version: saved.version, evidence: saved.evidence };
        setPending(itemValue);
        setEvidence(itemValue.evidence);
      }
      setReady(true);
    }).catch(() => {
      if (!cancelled) {
        setUnreadable(true);
        setMessage('Could not read the pending work submission on this device.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey, attempt, setUnreadable]);

  const discardSaved = () => {
    void deviceStorage.removeItem(storageKey).then(() => {
      if (!active.current) return;
      setUnreadable(false);
      setPending(null);
      setMessage(null);
      setReady(true);
    }, () => {
      if (active.current) setMessage('Could not discard the saved draft on this device.');
    });
  };

  const submit = async () => {
    if (!ready || locked || inFlight.current || (scopePending && !pending)) return;
    const item = pending ?? { key: randomUUID(), version: job.version, evidence: evidence.trim() };
    if (!item.evidence || item.evidence.length > 4000) {
      setMessage('Describe the completed work in 1 to 4000 characters.');
      return;
    }
    inFlight.current = true;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setMessage(null);
    try {
      if (!pending) await deviceStorage.setItem(storageKey, JSON.stringify(item));
      if (!active.current || request.signal.aborted) return;
      setPending(item);
      await submitWork(userId, job.job_id, item.version, item.key, item.evidence, request.signal);
      await deviceStorage.removeItem(storageKey);
      if (active.current) {
        setPending(null);
        setEvidence('');
        setMessage('Work submission recorded. Refresh for the current Customer decision. Payment is not configured.');
      }
    } catch (error) {
      if (active.current && isDefinitiveFailure(error)) {
        await deviceStorage.removeItem(storageKey).then(() => { if (active.current) setPending(null); }, () => undefined);
      }
      if (active.current) setMessage(failureMessage(error, 'Submission was not confirmed. Retry the same evidence or refresh the job.'));
    } finally {
      inFlight.current = false;
      if (active.current) {
        setBusy(false);
        onSettled();
      }
    }
  };

  if (job.stage !== 'working' && !pending && ready) return null;
  return (
    <>
      <BodyText>Describe the work for Customer review.</BodyText>
      {scopePending ? <BodyText>Wait for the Customer to decide on the scope before submitting new work.</BodyText> : null}
      <TextInput accessibilityLabel="Work evidence" value={evidence} onChangeText={setEvidence}
        editable={ready && !locked && !pending && !busy && !scopePending} multiline maxLength={4000} />
      <ActionButton label={pending ? 'Retry work submission' : 'Submit work'} onPress={() => void submit()} disabled={!ready || locked || (!pending && (job.stage !== 'working' || scopePending))} busy={busy} />
      {unreadable ? <DraftRecovery onRetry={() => { setMessage(null); retry(); }} onDiscard={discardSaved} /> : null}
      {message ? <ErrorText>{message}</ErrorText> : null}
    </>
  );
}
