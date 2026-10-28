import { Fragment, useCallback, useEffect, useRef, useState } from 'react';

import { ActionButton, BasisNotice, BodyText, ErrorText, KaelStatus, failureMessage, isFixtureBasis, type JobReport, type ScopeChange } from '@/features/shared';

import { acceptOffer, advanceJob, declineOffer, pauseJob, readWorkerSnapshot, requestResume, type Correction, type Job, type Offer, type Pause } from './worker-repository';
import { WorkSubmission } from './work-submission';
import { ScopeProposal } from './scope-proposal';
import { WorkerReport } from './worker-report';

const nextStage: Partial<Record<Job['stage'], 'en_route' | 'arrived' | 'working'>> = {
  assigned: 'en_route',
  en_route: 'arrived',
  arrived: 'working',
};

type Snapshot = Awaited<ReturnType<typeof readWorkerSnapshot>>;
type Status = 'loading' | 'verified' | 'stale' | 'unavailable';

export function WorkerJobs({ userId }: { userId: string }) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [changes, setChanges] = useState<ScopeChange[]>([]);
  const [reports, setReports] = useState<JobReport[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [pauses, setPauses] = useState<Pause[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const running = useRef(false);
  const verified = useRef(false);
  const reader = useRef<AbortController | null>(null);
  const action = useRef<AbortController | null>(null);

  const apply = useCallback((snapshot: Snapshot) => {
    verified.current = true;
    setOffers(snapshot.offers);
    setJobs(snapshot.jobs);
    setChanges(snapshot.changes);
    setReports(snapshot.reports);
    setCorrections(snapshot.corrections);
    setPauses(snapshot.pauses);
    setStatus('verified');
  }, []);

  const read = useCallback((controller: AbortController) => {
    reader.current = controller;
    return readWorkerSnapshot(userId, controller.signal).then(
      (snapshot) => {
        if (mounted.current && !controller.signal.aborted) apply(snapshot);
      },
      () => {
        if (mounted.current && !controller.signal.aborted) setStatus(verified.current ? 'stale' : 'unavailable');
      },
    );
  }, [apply, userId]);

  const reload = useCallback(async () => {
    reader.current?.abort();
    await read(new AbortController());
  }, [read]);

  useEffect(() => {
    mounted.current = true;
    void read(new AbortController());
    return () => {
      mounted.current = false;
      reader.current?.abort();
      action.current?.abort();
    };
  }, [read]);

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
    } catch (error) {
      if (mounted.current) setMessage(failureMessage(error, 'The action was not confirmed. Refresh the current state before retrying.'));
    } finally {
      running.current = false;
      if (mounted.current) {
        setBusy(false);
        void reload();
      }
    }
  };

  const locked = status === 'stale' || status === 'unavailable';

  return (
    <>
      <BodyText>Local test offers only. Worker qualification and real dispatch are not configured.</BodyText>
      {message ? <ErrorText>{message}</ErrorText> : null}
      {locked ? <ErrorText>Worker activity could not be verified. Actions are disabled until a refresh succeeds.</ErrorText> : null}
      {status === 'stale' ? <BodyText>Showing the last verified state, which may be out of date.</BodyText> : null}
      <ActionButton secondary label="Refresh Worker activity" onPress={() => void reload()} />
      {offers.map((offer) => (
        <Fragment key={offer.invitation_id}>
          <BodyText>{`Offer: ${offer.scope} — ${offer.amount_minor} ${offer.currency}; expires ${offer.expires_at}`}</BodyText>
          <BasisNotice basis={offer.basis} noun="offer" />
          <ActionButton label="Accept displayed offer" disabled={busy || locked || !isFixtureBasis(offer.basis)} onPress={() => void run((signal) => acceptOffer(userId, offer, signal))} />
          <ActionButton secondary label="Decline displayed offer" disabled={busy || locked} onPress={() => void run((signal) => declineOffer(userId, offer, signal))} />
        </Fragment>
      ))}
      {jobs.map((job) => (
        <Fragment key={job.job_id}>
          <BodyText>{`Job: ${job.scope} — ${job.amount_minor} ${job.currency}; stage: ${job.stage}`}</BodyText>
          <KaelStatus userId={userId} resourceId={job.job_id} kind="worker_job" />
          {corrections.filter((correction) => correction.job_id === job.job_id).map((correction) => (
            <BodyText key={correction.job_id}>{`Customer requested a correction: ${correction.note}`}</BodyText>
          ))}
          {reports.filter((report) => report.job_id === job.job_id).map((report) => (
            <BodyText key={report.id}>{`Worker report (${report.kind}): ${report.details}. No automatic fee or rescheduling applied.`}</BodyText>
          ))}
          {changes.filter((change) => change.job_id === job.job_id).map((change) => (
            <BodyText key={change.id}>{`Fixture change ${change.sequence}: ${change.old_scope} (${change.old_amount_minor} VND) → ${change.new_scope} (${change.new_amount_minor} VND); ${change.decision}. ${change.rationale}`}</BodyText>
          ))}
          {nextStage[job.stage] ? (
            <ActionButton label={`Mark ${nextStage[job.stage]}`} disabled={busy || locked || (job.stage === 'arrived' && reports.some((report) => report.job_id === job.job_id && report.kind === 'customer_absent'))} onPress={() => {
              const next = nextStage[job.stage];
              if (next) void run((signal) => advanceJob(userId, job, next, signal));
            }} />
          ) : null}
          {job.stage === 'arrived' && reports.some((report) => report.job_id === job.job_id && report.kind === 'customer_absent')
            ? <BodyText>A no-answer report needs an approved recovery process before work can start.</BodyText> : null}
          {['assigned', 'en_route', 'arrived', 'working'].includes(job.stage) ? (
            <>
              <ActionButton secondary label="Pause work (ordinary interruption)" disabled={busy || locked} onPress={() => void run((signal) => pauseJob(userId, job, 'ordinary_interruption', signal))} />
              <ActionButton secondary label="Stop work (safety concern)" disabled={busy || locked} onPress={() => void run((signal) => pauseJob(userId, job, 'safety_concern', signal))} />
            </>
          ) : job.stage === 'paused' ? <PausedJob userId={userId} job={job} pause={pauses.find((pause) => pause.job_id === job.job_id)} busy={busy} locked={locked} run={run} />
            : job.stage === 'submitted' ? <BodyText>Work is submitted. The Customer review, or a manual dispute process outside this app, is pending; nothing more can be done here.</BodyText> : null}
          <ScopeProposal userId={userId} job={job} locked={locked} hasPending={changes.some((change) => change.job_id === job.job_id && change.decision === 'pending')} onRefresh={() => void reload()} />
          <WorkSubmission userId={userId} job={job} locked={locked} scopePending={changes.some((change) => change.job_id === job.job_id && change.decision === 'pending')} onSettled={() => void reload()} />
          <WorkerReport userId={userId} job={job} locked={locked} onRefresh={() => void reload()} />
        </Fragment>
      ))}
    </>
  );
}

type RunOperation = (operation: (signal: AbortSignal) => Promise<void>) => Promise<void>;

function PausedJob({ userId, job, pause, busy, locked, run }: { userId: string; job: Job; pause: Pause | undefined; busy: boolean; locked: boolean; run: RunOperation }) {
  if (!pause) return <BodyText>The pause state of this job could not be verified. Refresh before acting.</BodyText>;
  if (pause.category === 'safety_concern') {
    return <BodyText>Work is stopped for a safety concern. No safety clearance process is configured, so work cannot resume in this app; contact support.</BodyText>;
  }
  return (
    <>
      <BodyText>{pause.resume_requested
        ? 'Resume requested. Waiting for the Customer to agree to the current scope.'
        : 'Work is paused for an ordinary interruption. Resuming needs the Customer to agree to the current scope.'}</BodyText>
      {pause.resume_requested ? null : (
        <ActionButton label="Request to resume work" disabled={busy || locked} onPress={() => void run((signal) => requestResume(userId, job, signal))} />
      )}
      <ActionButton secondary label="Stop work (safety concern)" disabled={busy || locked} onPress={() => void run((signal) => pauseJob(userId, job, 'safety_concern', signal))} />
    </>
  );
}
