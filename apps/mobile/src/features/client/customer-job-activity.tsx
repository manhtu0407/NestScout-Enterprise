import { randomUUID } from 'expo-crypto';
import { Fragment, useEffect, useRef, useState } from 'react';
import { TextInput } from 'react-native';

import { ActionButton, BodyText, ErrorText, type JobReport, type ScopeChange } from '@/features/shared';
import { deviceStorage } from '@/lib/device-storage';

import { decideScope, decideSubmission, openAftercare, type CustomerJob, type Submission, type SupportCase } from './customer-activity-repository';

type PendingCase = { key: string; reason: string };

export function CustomerJobActivity({ userId, job, submissions, cases, changes = [], reports = [], onRefresh }: {
  userId: string;
  job: CustomerJob;
  submissions: Submission[];
  cases: SupportCase[];
  changes?: ScopeChange[];
  reports?: JobReport[];
  onRefresh(): void;
}) {
  const [reason, setReason] = useState('');
  const [pendingCase, setPendingCase] = useState<PendingCase | null>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const storageKey = `nestscout.aftercare.${userId}.${job.id}`;

  useEffect(() => {
    active.current = true;
    deviceStorage.getItem(storageKey).then((raw) => {
      if (!active.current) return;
      if (raw !== null) {
        const value: unknown = JSON.parse(raw);
        if (typeof value !== 'object' || value === null) throw new Error('Invalid case');
        const item = value as Record<string, unknown>;
        if (typeof item.key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.key)
          || typeof item.reason !== 'string' || !item.reason.trim() || item.reason.length > 4000) throw new Error('Invalid case');
        setPendingCase({ key: item.key, reason: item.reason });
        setReason(item.reason);
      }
      setReady(true);
    }).catch(() => {
      if (active.current) setMessage('Could not read the pending support case on this device.');
    });
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, [storageKey]);

  const run = async (operation: (signal: AbortSignal) => Promise<void>, success: string) => {
    if (running.current) return;
    running.current = true;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setMessage(null);
    try {
      await operation(request.signal);
      if (active.current) setMessage(success);
    } catch {
      if (active.current) setMessage('The result was not confirmed. Refresh before trying again.');
    } finally {
      running.current = false;
      if (active.current) {
        setBusy(false);
        onRefresh();
      }
    }
  };

  const decide = (submission: Submission, decision: 'accepted' | 'revision_requested' | 'disputed') => {
    const detail = decision === 'accepted' ? null : reason.trim();
    if (decision !== 'accepted' && !detail) {
      setMessage('Explain the correction or dispute.');
      return;
    }
    void run((signal) => decideSubmission(userId, submission.id, job.version, decision, detail, signal), 'Decision recorded. Payment is not configured.');
  };

  const aftercare = () => {
    const item = pendingCase ?? { key: randomUUID(), reason: reason.trim() };
    if (!item.reason) {
      setMessage('Describe the support request.');
      return;
    }
    void run(async (signal) => {
      if (!pendingCase) await deviceStorage.setItem(storageKey, JSON.stringify(item));
      if (!active.current || signal.aborted) throw new Error('Cancelled');
      setPendingCase(item);
      await openAftercare(userId, job.id, item.key, item.reason, signal);
      await deviceStorage.removeItem(storageKey);
      if (active.current) setPendingCase(null);
    }, 'Support case opened. Warranty coverage has not been determined.');
  };

  const decideChange = (change: ScopeChange, decision: 'approved' | 'rejected') => {
    void run((signal) => decideScope(userId, change.id, job.version, change.sequence, decision, signal),
      'Fixture scope decision recorded. No payment is configured.');
  };

  return (
    <>
      <BodyText>{`Work stage: ${job.stage}. Payment is not configured.`}</BodyText>
      {submissions.map((submission) => (
        <BodyText key={submission.id}>{`Work evidence: ${submission.evidence}; decision: ${submission.decision}`}</BodyText>
      ))}
      {cases.map((item) => <BodyText key={item.id}>{`Support case (${item.kind}): ${item.reason}`}</BodyText>)}
      {reports.map((report) => <BodyText key={report.id}>{`Worker report (${report.kind}): ${report.details}. This report has not been independently verified.`}</BodyText>)}
      {changes.map((change) => (
        <Fragment key={change.id}>
          <BodyText>{`Fixture scope change ${change.sequence}: ${change.old_scope} (${change.old_amount_minor} VND) → ${change.new_scope} (${change.new_amount_minor} VND); difference ${change.new_amount_minor - change.old_amount_minor} VND. ${change.rationale}. Status: ${change.decision}`}</BodyText>
          {change.decision === 'pending' && job.stage === 'working' ? (
            <>
              <ActionButton label="Approve fixture scope" disabled={busy} onPress={() => decideChange(change, 'approved')} />
              <ActionButton secondary label="Reject fixture scope" disabled={busy} onPress={() => decideChange(change, 'rejected')} />
            </>
          ) : null}
        </Fragment>
      ))}
      {(job.stage === 'submitted' || job.stage === 'completed' || pendingCase) ? (
        <TextInput accessibilityLabel="Correction or support details" value={reason} onChangeText={setReason}
          editable={!busy && !pendingCase} multiline maxLength={4000} />
      ) : null}
      {submissions.filter((submission) => submission.decision === 'pending' && job.stage === 'submitted').map((submission) => (
        <Fragment key={submission.id}>
          <ActionButton label="Accept submitted work" disabled={busy} onPress={() => decide(submission, 'accepted')} />
          <ActionButton secondary label="Request correction" disabled={busy} onPress={() => decide(submission, 'revision_requested')} />
          <ActionButton secondary label="Open dispute" disabled={busy} onPress={() => decide(submission, 'disputed')} />
        </Fragment>
      ))}
      {(job.stage === 'completed' || pendingCase) ? (
        <ActionButton secondary label={pendingCase ? 'Retry support case' : 'Open support case'} disabled={busy || !ready} onPress={aftercare} />
      ) : null}
      {message ? <ErrorText>{message}</ErrorText> : null}
    </>
  );
}
