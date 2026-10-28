import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { TextInput } from 'react-native';

import { ActionButton, BodyText, DraftRecovery, ErrorText, failureMessage, isDefinitiveFailure, useDraftRecovery, type JobReport } from '@/features/shared';
import { deviceStorage } from '@/lib/device-storage';

import { reportJob, type Job } from './worker-repository';

type Pending = { key: string; version: number; kind: JobReport['kind']; details: string };

type Props = { userId: string; job: Job; onRefresh(): void };

export function WorkerReport(props: Props) {
  const storageKey = `nestscout.worker-report.${props.userId}.${props.job.job_id}`;
  return <WorkerReportDraft key={storageKey} storageKey={storageKey} {...props} />;
}

function WorkerReportDraft({ storageKey, userId, job, onRefresh }: Props & { storageKey: string }) {
  const [details, setDetails] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [ready, setReady] = useState(false);
  const { attempt, unreadable, setUnreadable, retry } = useDraftRecovery();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const active = useRef(true);
  const running = useRef(false);
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
        const value: unknown = JSON.parse(raw);
        if (typeof value !== 'object' || value === null) throw new Error('Invalid report');
        const item = value as Record<string, unknown>;
        if (typeof item.key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.key)
          || typeof item.version !== 'number' || !Number.isSafeInteger(item.version) || item.version < 1
          || (item.kind !== 'delay' && item.kind !== 'customer_absent')
          || typeof item.details !== 'string' || !item.details.trim() || item.details.length > 4000) throw new Error('Invalid report');
        const saved: Pending = { key: item.key, version: item.version, kind: item.kind, details: item.details };
        setPending(saved);
        setDetails(saved.details);
      }
      setReady(true);
    }).catch(() => {
      if (!cancelled) {
        setUnreadable(true);
        setMessage('Could not read the pending report on this device.');
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

  const submit = async (kind: JobReport['kind']) => {
    if (!ready || running.current) return;
    const item = pending ?? { key: randomUUID(), version: job.version, kind, details: details.trim() };
    if (!item.details) {
      setMessage('Describe what happened.');
      return;
    }
    running.current = true;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setMessage(null);
    try {
      if (!pending) await deviceStorage.setItem(storageKey, JSON.stringify(item));
      if (!active.current || request.signal.aborted) return;
      setPending(item);
      await reportJob(userId, job.job_id, item.version, item.key, item.kind, item.details, request.signal);
      await deviceStorage.removeItem(storageKey);
      if (active.current) {
        setPending(null);
        setDetails('');
        setMessage('Report recorded. No automatic fee, cancellation or rescheduling was applied.');
      }
    } catch (error) {
      if (active.current && isDefinitiveFailure(error)) {
        await deviceStorage.removeItem(storageKey).then(() => { if (active.current) setPending(null); }, () => undefined);
      }
      if (active.current) setMessage(failureMessage(error, 'Report was not confirmed. Retry the same details or refresh the job.'));
    } finally {
      running.current = false;
      if (active.current) {
        setBusy(false);
        onRefresh();
      }
    }
  };

  if (!pending && ready && job.stage !== 'en_route' && job.stage !== 'arrived') return null;
  const kind = pending?.kind ?? (job.stage === 'arrived' ? 'customer_absent' : 'delay');
  return (
    <>
      <BodyText>{kind === 'delay' ? 'Report a delay without promising an exact arrival time.' : 'Report that the Customer did not answer; the report is not independently verified.'}</BodyText>
      <TextInput accessibilityLabel="Report details" value={details} onChangeText={setDetails} editable={ready && !pending && !busy} multiline maxLength={4000} />
      <ActionButton secondary label={pending ? 'Retry report' : kind === 'delay' ? 'Report delay' : 'Report no answer'}
        disabled={!ready} busy={busy} onPress={() => void submit(kind)} />
      {unreadable ? <DraftRecovery onRetry={() => { setMessage(null); retry(); }} onDiscard={discardSaved} /> : null}
      {message ? <ErrorText>{message}</ErrorText> : null}
    </>
  );
}
