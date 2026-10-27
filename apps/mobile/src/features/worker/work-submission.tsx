import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { TextInput } from 'react-native';

import { ActionButton, BodyText, ErrorText } from '@/features/shared';
import { deviceStorage } from '@/lib/device-storage';

import { submitWork, type Job } from './worker-repository';

type Pending = { key: string; version: number; evidence: string };

export function WorkSubmission({ userId, job, scopePending = false, onSettled }: { userId: string; job: Job; scopePending?: boolean; onSettled(): void }) {
  const [evidence, setEvidence] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const active = useRef(true);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const storageKey = `nestscout.work-submission.${userId}.${job.job_id}`;

  useEffect(() => {
    active.current = true;
    deviceStorage.getItem(storageKey).then((raw) => {
      if (!active.current) return;
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
      if (active.current) setMessage('Could not read the pending work submission on this device.');
    });
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, [storageKey]);

  const submit = async () => {
    if (!ready || inFlight.current || (scopePending && !pending)) return;
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
    } catch {
      if (active.current) setMessage('Submission was not confirmed. Retry the same evidence or refresh the job.');
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
        editable={ready && !pending && !busy && !scopePending} multiline maxLength={4000} />
      <ActionButton label={pending ? 'Retry work submission' : 'Submit work'} onPress={() => void submit()} disabled={!ready || (!pending && (job.stage !== 'working' || scopePending))} busy={busy} />
      {message ? <ErrorText>{message}</ErrorText> : null}
    </>
  );
}
