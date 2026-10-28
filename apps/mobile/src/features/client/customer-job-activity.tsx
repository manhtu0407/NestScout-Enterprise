import { randomUUID } from 'expo-crypto';
import { Fragment, useEffect, useRef, useState } from 'react';
import { TextInput } from 'react-native';

import { ActionButton, BodyText, DraftRecovery, ErrorText, failureMessage, isDefinitiveFailure, useDraftRecovery, type JobReport, type ScopeChange } from '@/features/shared';
import { deviceStorage } from '@/lib/device-storage';

import { consentResume, decideScope, decideSubmission, openAftercare, type CustomerJob, type JobPause, type Submission, type SupportCase } from './customer-activity-repository';

type PendingCase = { key: string; reason: string };

type Props = {
  userId: string;
  job: CustomerJob;
  submissions: Submission[];
  cases: SupportCase[];
  changes?: ScopeChange[];
  reports?: JobReport[];
  pause?: JobPause;
  onRefresh(): void;
};

export function CustomerJobActivity(props: Props) {
  const storageKey = `nestscout.aftercare.${props.userId}.${props.job.id}`;
  return <CustomerJobDraft key={storageKey} storageKey={storageKey} {...props} />;
}

function CustomerJobDraft({ storageKey, userId, job, submissions, cases, changes = [], reports = [], pause, onRefresh }: Props & { storageKey: string }) {
  const [reason, setReason] = useState('');
  const [pendingCase, setPendingCase] = useState<PendingCase | null>(null);
  const [ready, setReady] = useState(false);
  const { attempt, unreadable, setUnreadable, retry } = useDraftRecovery();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
        if (typeof value !== 'object' || value === null) throw new Error('Invalid case');
        const item = value as Record<string, unknown>;
        if (typeof item.key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.key)
          || typeof item.reason !== 'string' || !item.reason.trim() || item.reason.length > 4000) throw new Error('Invalid case');
        setPendingCase({ key: item.key, reason: item.reason });
        setReason(item.reason);
      }
      setReady(true);
    }).catch(() => {
      if (!cancelled) {
        setUnreadable(true);
        setMessage('Could not read the pending support case on this device.');
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
      setPendingCase(null);
      setMessage(null);
      setReady(true);
    }, () => {
      if (active.current) setMessage('Could not discard the saved draft on this device.');
    });
  };

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
    } catch (error) {
      if (active.current) setMessage(failureMessage(error, 'The result was not confirmed. Refresh before trying again.'));
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
      try {
        await openAftercare(userId, job.id, item.key, item.reason, signal);
      } catch (error) {
        if (isDefinitiveFailure(error)) {
          await deviceStorage.removeItem(storageKey).then(() => { if (active.current) setPendingCase(null); }, () => undefined);
        }
        throw error;
      }
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
      {submissions.some((submission) => submission.decision === 'disputed') || cases.some((item) => item.kind === 'dispute')
        ? <BodyText>This job is under dispute. No automatic refund, fee or resolution applies; a manual review outside this app is required.</BodyText> : null}
      {reports.some((report) => report.kind === 'customer_absent')
        ? <BodyText>A no-answer report was filed. No fee or cancellation was applied; work cannot start until a manual recovery process outside this app is available.</BodyText> : null}
      {job.stage === 'paused' ? (
        !pause ? <BodyText>The pause state of this job could not be verified. Refresh before acting.</BodyText>
          : pause.category === 'safety_concern'
            ? <BodyText>Work was stopped for a safety concern. No safety clearance process is configured, so work cannot resume in this app; contact support.</BodyText>
            : (
              <>
                <BodyText>{pause.resume_requested
                  ? 'The Worker asks to resume work. Agreeing resumes this job on its current version and approved scope.'
                  : 'Work is paused for an ordinary interruption. The Worker has not asked to resume.'}</BodyText>
                {pause.resume_requested ? (
                  <ActionButton label="Agree to resume work" disabled={busy} onPress={() => void run((signal) => consentResume(userId, job, signal), 'Resume agreed. Refreshing the current state.')} />
                ) : null}
              </>
            )
      ) : null}
      {reports.map((report) => <BodyText key={report.id}>{`Worker report (${report.kind}): ${report.details}. This report has not been independently verified.`}</BodyText>)}
      {changes.map((change) => (
        <Fragment key={change.id}>
          <BodyText>{`Fixture scope change ${change.sequence}: ${change.old_scope} (${change.old_amount_minor} VND) → ${change.new_scope} (${change.new_amount_minor} VND); difference ${change.new_amount_minor - change.old_amount_minor} VND. ${change.rationale}. Status: ${change.decision}`}</BodyText>
          {change.decision === 'pending' && (job.stage === 'working' || job.stage === 'paused') ? (
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
      {unreadable ? <DraftRecovery onRetry={() => { setMessage(null); retry(); }} onDiscard={discardSaved} /> : null}
      {message ? <ErrorText>{message}</ErrorText> : null}
    </>
  );
}
