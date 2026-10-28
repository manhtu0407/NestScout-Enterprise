import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { TextInput } from 'react-native';

import { ActionButton, BodyText, DraftRecovery, ErrorText, failureMessage, isDefinitiveFailure, useDraftRecovery } from '@/features/shared';
import { deviceStorage } from '@/lib/device-storage';

import { proposeScope, type Job } from './worker-repository';

type Pending = { key: string; version: number; scope: string; amount: number; rationale: string };

type Props = { userId: string; job: Job; hasPending: boolean; onRefresh(): void };

export function ScopeProposal(props: Props) {
  const storageKey = `nestscout.scope-proposal.${props.userId}.${props.job.job_id}`;
  return <ScopeProposalDraft key={storageKey} storageKey={storageKey} {...props} />;
}

function ScopeProposalDraft({ storageKey, userId, job, hasPending, onRefresh }: Props & { storageKey: string }) {
  const [scope, setScope] = useState('');
  const [amount, setAmount] = useState('');
  const [rationale, setRationale] = useState('');
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
        if (typeof value !== 'object' || value === null) throw new Error('Invalid proposal');
        const item = value as Record<string, unknown>;
        if (typeof item.key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.key)
          || typeof item.version !== 'number' || !Number.isSafeInteger(item.version) || item.version < 1
          || typeof item.scope !== 'string' || !item.scope.trim() || item.scope.length > 4000
          || typeof item.amount !== 'number' || !Number.isSafeInteger(item.amount) || item.amount < 0
          || typeof item.rationale !== 'string' || !item.rationale.trim() || item.rationale.length > 4000) throw new Error('Invalid proposal');
        const saved = { key: item.key, version: item.version, scope: item.scope, amount: item.amount, rationale: item.rationale };
        setPending(saved);
        setScope(saved.scope);
        setAmount(String(saved.amount));
        setRationale(saved.rationale);
      }
      setReady(true);
    }).catch(() => {
      if (!cancelled) {
        setUnreadable(true);
        setMessage('Could not read the pending scope proposal on this device.');
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
    if (!ready || running.current || (hasPending && !pending)) return;
    const numericAmount = Number(amount);
    const item = pending ?? { key: randomUUID(), version: job.version, scope: scope.trim(), amount: numericAmount, rationale: rationale.trim() };
    if (!item.scope || !item.rationale || (!pending && !/^\d+$/.test(amount)) || !Number.isSafeInteger(item.amount) || item.amount < 0) {
      setMessage('Enter scope, a whole VND amount and the reason.');
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
      await proposeScope(userId, job.job_id, item.version, item.key, item.scope, item.amount, item.rationale, request.signal);
      await deviceStorage.removeItem(storageKey);
      if (active.current) {
        setPending(null);
        setScope('');
        setAmount('');
        setRationale('');
        setMessage('Fixture proposal recorded. Refresh to see the current Customer decision.');
      }
    } catch (error) {
      if (active.current && isDefinitiveFailure(error)) {
        await deviceStorage.removeItem(storageKey).then(() => { if (active.current) setPending(null); }, () => undefined);
      }
      if (active.current) setMessage(failureMessage(error, 'Proposal was not confirmed. Retry the same terms or refresh the job.'));
    } finally {
      running.current = false;
      if (active.current) {
        setBusy(false);
        onRefresh();
      }
    }
  };

  if (job.stage !== 'working' && !pending && ready) return null;
  return (
    <>
      <BodyText>Propose test-only scope and VND amount. Real pricing authority is not configured.</BodyText>
      <TextInput accessibilityLabel="Proposed scope" value={scope} onChangeText={setScope} editable={ready && !pending && !busy && !hasPending} multiline maxLength={4000} />
      <TextInput accessibilityLabel="Proposed total VND" value={amount} onChangeText={setAmount} editable={ready && !pending && !busy && !hasPending} keyboardType="number-pad" />
      <TextInput accessibilityLabel="Reason for change" value={rationale} onChangeText={setRationale} editable={ready && !pending && !busy && !hasPending} multiline maxLength={4000} />
      <ActionButton secondary label={pending ? 'Retry scope proposal' : 'Propose scope change'} onPress={() => void submit()}
        disabled={!ready || (!pending && (hasPending || job.stage !== 'working'))} busy={busy} />
      {unreadable ? <DraftRecovery onRetry={() => { setMessage(null); retry(); }} onDiscard={discardSaved} /> : null}
      {message ? <ErrorText>{message}</ErrorText> : null}
    </>
  );
}
