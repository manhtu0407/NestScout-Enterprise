import { Fragment, useCallback, useEffect, useRef, useState } from 'react';

import { ActionButton, BodyText, ErrorText, KaelStatus, type JobReport, type ScopeChange } from '@/features/shared';

import { acceptOffer, advanceJob, declineOffer, readWorkerSnapshot, type Job, type Offer } from './worker-repository';
import { WorkSubmission } from './work-submission';
import { ScopeProposal } from './scope-proposal';
import { WorkerReport } from './worker-report';

const nextStage: Partial<Record<Job['stage'], Job['stage']>> = {
  assigned: 'en_route',
  en_route: 'arrived',
  arrived: 'working',
};

export function WorkerJobs({ userId }: { userId: string }) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [changes, setChanges] = useState<ScopeChange[]>([]);
  const [reports, setReports] = useState<JobReport[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const running = useRef(false);
  const reader = useRef<AbortController | null>(null);
  const action = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    reader.current?.abort();
    const controller = new AbortController();
    reader.current = controller;
    try {
      const snapshot = await readWorkerSnapshot(userId, controller.signal);
      if (mounted.current && !controller.signal.aborted) {
        setOffers(snapshot.offers);
        setJobs(snapshot.jobs);
        setChanges(snapshot.changes);
        setReports(snapshot.reports);
      }
    } catch {
      if (mounted.current && !controller.signal.aborted) {
        setOffers([]);
        setJobs([]);
        setChanges([]);
        setReports([]);
        setMessage('Could not load Worker activity. Try refreshing.');
      }
    }
  }, [userId]);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    reader.current = controller;
    readWorkerSnapshot(userId, controller.signal).then(
      (snapshot) => {
        if (mounted.current && !controller.signal.aborted) {
          setOffers(snapshot.offers);
          setJobs(snapshot.jobs);
          setChanges(snapshot.changes);
          setReports(snapshot.reports);
        }
      },
      () => {
        if (mounted.current && !controller.signal.aborted) setMessage('Could not load Worker activity. Try refreshing.');
      },
    );
    return () => {
      mounted.current = false;
      reader.current?.abort();
      action.current?.abort();
    };
  }, [userId]);

  const run = async (operation: (signal: AbortSignal) => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    const controller = new AbortController();
    action.current = controller;
    setBusy(true);
    setMessage(null);
    try {
      await operation(controller.signal);
      if (mounted.current) setMessage('Action recorded. Refreshing the current state.');
    } catch {
      if (mounted.current) setMessage('The action was not confirmed. Refresh the current state before retrying.');
    } finally {
      running.current = false;
      if (mounted.current) {
        setBusy(false);
        void reload();
      }
    }
  };

  return (
    <>
      <BodyText>Local test offers only. Worker qualification and real dispatch are not configured.</BodyText>
      {message ? <ErrorText>{message}</ErrorText> : null}
      <ActionButton secondary label="Refresh Worker activity" onPress={() => void reload()} />
      {offers.map((offer) => (
        <Fragment key={offer.invitation_id}>
          <BodyText>{`Offer: ${offer.scope} — ${offer.amount_minor} ${offer.currency}; expires ${offer.expires_at}`}</BodyText>
          <ActionButton label="Accept displayed offer" disabled={busy} onPress={() => void run((signal) => acceptOffer(userId, offer, signal))} />
          <ActionButton secondary label="Decline displayed offer" disabled={busy} onPress={() => void run((signal) => declineOffer(userId, offer, signal))} />
        </Fragment>
      ))}
      {jobs.map((job) => (
        <Fragment key={job.job_id}>
          <BodyText>{`Job: ${job.scope} — ${job.amount_minor} ${job.currency}; stage: ${job.stage}`}</BodyText>
          <KaelStatus userId={userId} resourceId={job.job_id} kind="worker_job" />
          {reports.filter((report) => report.job_id === job.job_id).map((report) => (
            <BodyText key={report.id}>{`Worker report (${report.kind}): ${report.details}. No automatic fee or rescheduling applied.`}</BodyText>
          ))}
          {changes.filter((change) => change.job_id === job.job_id).map((change) => (
            <BodyText key={change.id}>{`Fixture change ${change.sequence}: ${change.old_scope} (${change.old_amount_minor} VND) → ${change.new_scope} (${change.new_amount_minor} VND); ${change.decision}. ${change.rationale}`}</BodyText>
          ))}
          {nextStage[job.stage] ? (
            <ActionButton label={`Mark ${nextStage[job.stage]}`} disabled={busy || (job.stage === 'arrived' && reports.some((report) => report.job_id === job.job_id && report.kind === 'customer_absent'))} onPress={() => {
              const next = nextStage[job.stage];
              if (next) void run((signal) => advanceJob(userId, job, next, signal));
            }} />
          ) : null}
          {job.stage === 'arrived' && reports.some((report) => report.job_id === job.job_id && report.kind === 'customer_absent')
            ? <BodyText>A no-answer report needs an approved recovery process before work can start.</BodyText> : null}
          {job.stage !== 'paused' && job.stage !== 'completed' ? (
            <ActionButton secondary label="Pause for safety" disabled={busy} onPress={() => void run((signal) => advanceJob(userId, job, 'paused', signal))} />
          ) : job.stage === 'paused' ? <BodyText>Work is paused. Recovery requires an approved safety process.</BodyText> : null}
          <ScopeProposal userId={userId} job={job} hasPending={changes.some((change) => change.job_id === job.job_id && change.decision === 'pending')} onRefresh={() => void reload()} />
          <WorkSubmission userId={userId} job={job} scopePending={changes.some((change) => change.job_id === job.job_id && change.decision === 'pending')} onSettled={() => void reload()} />
          <WorkerReport userId={userId} job={job} onRefresh={() => void reload()} />
        </Fragment>
      ))}
    </>
  );
}
