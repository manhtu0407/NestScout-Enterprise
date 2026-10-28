import { randomUUID } from 'expo-crypto';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { TextInput } from 'react-native';

import { ActionButton, BasisNotice, BodyText, DraftRecovery, ErrorText, KaelStatus, failureMessage, isFixtureBasis, useDraftRecovery } from '@/features/shared';

import { clearPendingRequest, loadPendingRequest, savePendingRequest, type PendingRequest } from './pending-request-store';
import { CustomerJobActivity } from './customer-job-activity';
import { readCustomerActivity, type CustomerActivity } from './customer-activity-repository';
import { acceptQuote, readQuotes, readRequests, rejectQuote, submitRequest, type ServiceQuote, type ServiceRequest } from './service-request-repository';

export function ServiceRequests({ userId, guestDraft = null, clearGuestDraft = () => undefined }: { userId: string; guestDraft?: string | null; clearGuestDraft?: () => void }) {
  const [description, setDescription] = useState(guestDraft ?? '');
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const { attempt, unreadable, setUnreadable, retry } = useDraftRecovery();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [quotes, setQuotes] = useState<ServiceQuote[]>([]);
  const [activity, setActivity] = useState<CustomerActivity>({ jobs: [], submissions: [], cases: [], changes: [], reports: [] });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const reloadController = useRef<AbortController | null>(null);
  const submitController = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    reloadController.current?.abort();
    const controller = new AbortController();
    reloadController.current = controller;
    try {
      const requestResult = await readRequests(userId, controller.signal);
      const [quoteResult, activityResult] = await Promise.all([
        readQuotes(userId, controller.signal), readCustomerActivity(userId, requestResult.map(item => item.id), controller.signal),
      ]);
      if (mounted.current && !controller.signal.aborted) {
        setRequests(requestResult);
        setQuotes(quoteResult);
        setActivity(activityResult);
      }
    } catch {
      if (mounted.current && !controller.signal.aborted) setMessage('Could not load requests. Please try again.');
    }
  }, [userId]);

  useEffect(() => {
    mounted.current = true;
    let storageActive = true;
    const controller = new AbortController();
    reloadController.current = controller;
    setUnreadable(false);
    loadPendingRequest(userId).then(
      (item) => {
        if (!storageActive) return;
        setPending(item);
        if (item) setDescription(item.description);
        setStorageReady(true);
      },
      () => {
        if (storageActive) {
          setUnreadable(true);
          setMessage('Could not read the pending request on this device.');
        }
      },
    );
    readRequests(userId, controller.signal).then(async (requestResult) => ({
      requestResult,
      quoteResult: await readQuotes(userId, controller.signal),
      activityResult: await readCustomerActivity(userId, requestResult.map(item => item.id), controller.signal),
    })).then(
      ({ requestResult, quoteResult, activityResult }) => {
        if (mounted.current && !controller.signal.aborted) {
          setRequests(requestResult);
          setQuotes(quoteResult);
          setActivity(activityResult);
        }
      },
      () => {
        if (mounted.current && !controller.signal.aborted) setMessage('Could not load requests. Please try again.');
      },
    );
    return () => {
      storageActive = false;
      mounted.current = false;
      reloadController.current?.abort();
      submitController.current?.abort();
    };
  }, [userId, attempt, setUnreadable]);

  const discardSaved = () => {
    void clearPendingRequest(userId).then(() => {
      if (!mounted.current) return;
      setUnreadable(false);
      setPending(null);
      setMessage(null);
      setStorageReady(true);
    }, () => {
      if (mounted.current) setMessage('Could not discard the saved draft on this device.');
    });
  };

  const submit = async () => {
    if (inFlight.current || !storageReady) return;
    const item = pending ?? { key: randomUUID(), description: description.trim() };
    if (!item.description || item.description.length > 4000) {
      setMessage('Describe your request in 1 to 4000 characters.');
      return;
    }
    inFlight.current = true;
    const controller = new AbortController();
    submitController.current = controller;
    setBusy(true);
    setMessage(null);
    try {
      if (!pending) await savePendingRequest(userId, item);
      if (!mounted.current || controller.signal.aborted) return;
      setPending(item);
      clearGuestDraft();
      await submitRequest(userId, item.key, item.description, controller.signal);
      await clearPendingRequest(userId);
      if (!mounted.current) return;
      setPending(null);
      setDescription('');
      setMessage('Request received. Refresh for its current status.');
      await reload();
    } catch (error) {
      if (mounted.current) setMessage(failureMessage(error, 'The outcome is unknown. Retry the same request to check safely.'));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const decideQuote = async (quote: ServiceQuote, decision: 'accept' | 'reject') => {
    if (inFlight.current) return;
    inFlight.current = true;
    const controller = new AbortController();
    submitController.current = controller;
    setBusy(true);
    setMessage(null);
    try {
      if (decision === 'accept') await acceptQuote(userId, quote.id, quote.version, controller.signal);
      else await rejectQuote(userId, quote.id, quote.version, controller.signal);
      if (mounted.current) setMessage(decision === 'accept'
        ? 'The displayed quote was accepted. Payment is not configured; check assignment separately.'
        : 'The displayed quote was rejected.');
    } catch (error) {
      if (mounted.current) setMessage(failureMessage(error, 'The quote decision was not confirmed. Refresh before trying again.'));
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        void reload();
      }
    }
  };

  return (
    <>
      <BodyText>Describe what you need. Live pricing and Worker dispatch are not configured.</BodyText>
      <TextInput
        accessibilityLabel="Service request"
        value={description}
        onChangeText={setDescription}
        editable={!pending && !busy}
        multiline
        maxLength={4000}
        placeholder="Describe the problem"
      />
      <ActionButton label={pending ? 'Retry request' : 'Submit request'} onPress={() => void submit()} busy={busy} disabled={!storageReady} />
      {unreadable ? <DraftRecovery onRetry={() => { setMessage(null); retry(); }} onDiscard={discardSaved} /> : null}
      {message ? <ErrorText>{message}</ErrorText> : null}
      <ActionButton secondary label="Refresh requests" onPress={() => void reload()} />
      {requests.map((request) => (
        <Fragment key={request.id}>
          <BodyText>{request.description}</BodyText>
          <KaelStatus userId={userId} resourceId={request.id} kind="customer_request" />
          {quotes.filter((quote) => quote.request_id === request.id).map((quote) => (
            <Fragment key={quote.id}>
              <BodyText>{`Quote ${quote.version}: ${quote.scope} — ${quote.amount_minor} ${quote.currency}; expires ${quote.expires_at}`}</BodyText>
              <BasisNotice basis={quote.basis} noun="quote" />
              {quote.accepted_at ? <BodyText>Accepted</BodyText> : quote.rejected_at ? <BodyText>Rejected</BodyText> : (
                <>
                  <ActionButton secondary label={`Accept quote ${quote.version}`} onPress={() => void decideQuote(quote, 'accept')} disabled={busy || !isFixtureBasis(quote.basis) || quotes.some((other) => other.request_id === request.id && (other.version > quote.version || other.accepted_at !== null))} />
                  <ActionButton secondary label={`Reject quote ${quote.version}`} onPress={() => void decideQuote(quote, 'reject')} disabled={busy || quotes.some((other) => other.request_id === request.id && (other.version > quote.version || other.accepted_at !== null))} />
                </>
              )}
            </Fragment>
          ))}
          {activity.jobs.filter((job) => job.request_id === request.id).map((job) => (
            <CustomerJobActivity key={job.id} userId={userId} job={job}
              submissions={activity.submissions.filter((submission) => submission.job_id === job.id)}
              cases={activity.cases.filter((item) => item.job_id === job.id)}
              changes={activity.changes.filter((change) => change.job_id === job.id)}
              reports={activity.reports.filter((report) => report.job_id === job.id)} onRefresh={() => void reload()} />
          ))}
        </Fragment>
      ))}
    </>
  );
}
