import { randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { TextInput } from 'react-native';

import { ActionButton, BasisNotice, BodyText, DraftRecovery, ErrorText, KaelStatus, acceptQuote, acceptedImageTypes, failureMessage, isFixtureBasis, readCustomerActivity, readQuotes, readRequests, maxRequestPhotos, rejectQuote, submitRequest, toPendingPhoto, useDraftRecovery, type CustomerActivity, type MediaFile, type ServiceQuote, type ServiceRequest } from '@/features/shared';

import { flushQueuedPhotos, loadQueuedPhotos, saveQueuedPhotos, type FlushResult, type QueuedPhoto } from './pending-photo-queue';
import { clearPendingRequest, loadPendingRequest, maxLocationLength, savePendingRequest, type PendingRequest } from './pending-request-store';
import { CustomerJobActivity } from './customer-job-activity';

function queueMessage(result: FlushResult): string | null {
  if (result.remaining.length > 0 && result.dropped > 0) return `${result.dropped} photo(s) could not be read and were discarded; ${result.remaining.length} still waiting to upload.`;
  if (result.remaining.length > 0) return `${result.remaining.length} photo(s) are waiting to upload. Retry from this screen.`;
  if (result.dropped > 0) return `${result.dropped} photo(s) could not be uploaded and were discarded.`;
  return null;
}

export function ServiceRequests({ userId, guestDraft = null, clearGuestDraft = () => undefined }: { userId: string; guestDraft?: string | null; clearGuestDraft?: () => void }) {
  const [description, setDescription] = useState(guestDraft ?? '');
  const [location, setLocation] = useState('');
  const [photos, setPhotos] = useState<readonly MediaFile[]>([]);
  const [queued, setQueued] = useState<readonly QueuedPhoto[]>([]);
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const { attempt, unreadable, setUnreadable, retry } = useDraftRecovery();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [quotes, setQuotes] = useState<ServiceQuote[]>([]);
  const [activity, setActivity] = useState<CustomerActivity>({ jobs: [], submissions: [], cases: [], changes: [], reports: [], pauses: [] });
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
    const queueController = new AbortController();
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
    loadQueuedPhotos(userId).then(
      async (items) => {
        if (!storageActive) return;
        setQueued(items);
        if (items.length === 0) return;
        const result = await flushQueuedPhotos(userId, items, queueController.signal);
        if (!storageActive) return;
        setQueued(result.remaining);
        const note = queueMessage(result);
        setMessage(note ?? 'Waiting photos were uploaded.');
      },
      () => {
        if (storageActive) {
          setUnreadable(true);
          setMessage('Could not read the pending photos on this device.');
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
      queueController.abort();
      submitController.current?.abort();
    };
  }, [userId, attempt, setUnreadable]);

  const discardSaved = () => {
    void Promise.all([clearPendingRequest(userId), saveQueuedPhotos(userId, [])]).then(() => {
      if (!mounted.current) return;
      setUnreadable(false);
      setPending(null);
      setQueued([]);
      setMessage(null);
      setStorageReady(true);
    }, () => {
      if (mounted.current) setMessage('Could not discard the saved draft on this device.');
    });
  };

  const attachPhotos = async (requestId: string, signal: AbortSignal): Promise<string | null> => {
    const chosen: QueuedPhoto[] = photos.map(photo => ({ ...toPendingPhoto(photo), requestId, attempts: 0 }));
    setPhotos([]);
    if (chosen.length === 0) return null;
    const all = [...queued, ...chosen];
    setQueued(all);
    try {
      await saveQueuedPhotos(userId, all);
    } catch {
      setMessage('Photos could not be saved for retry on this device.');
    }
    try {
      const result = await flushQueuedPhotos(userId, all, signal);
      if (mounted.current) setQueued(result.remaining);
      return queueMessage(result);
    } catch {
      return 'Photo uploads were interrupted. Retry from this screen.';
    }
  };

  const retryPhotos = async () => {
    if (inFlight.current || queued.length === 0) return;
    inFlight.current = true;
    const controller = new AbortController();
    submitController.current = controller;
    setBusy(true);
    setMessage(null);
    try {
      const result = await flushQueuedPhotos(userId, queued, controller.signal);
      if (!mounted.current) return;
      setQueued(result.remaining);
      setMessage(queueMessage(result) ?? 'Waiting photos were uploaded.');
    } catch {
      if (mounted.current) setMessage('Photo uploads were interrupted. Retry from this screen.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const pickPhotos = async () => {
    const remaining = maxRequestPhotos - photos.length;
    if (remaining <= 0) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 0.8 });
      if (result.canceled) return;
      const usable = result.assets.flatMap(asset => (asset.mimeType && acceptedImageTypes.includes(asset.mimeType) ? [{ uri: asset.uri, mimeType: asset.mimeType }] : []));
      setPhotos(current => [...current, ...usable].slice(0, maxRequestPhotos));
      if (usable.length < result.assets.length) setMessage('Only JPEG, PNG and WebP photos can be attached.');
    } catch {
      setMessage('Could not open the photo library.');
    }
  };

  const submit = async () => {
    if (inFlight.current || !storageReady) return;
    const item = pending ?? { key: randomUUID(), description: description.trim(), location: location.trim() };
    if (!item.description || item.description.length > 4000) {
      setMessage('Describe your request in 1 to 4000 characters.');
      return;
    }
    if (item.location.length > maxLocationLength) {
      setMessage('Keep the location within 200 characters.');
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
      const requestId = await submitRequest(userId, item.key, item.description, controller.signal, item.location);
      await clearPendingRequest(userId);
      if (!mounted.current) return;
      setPending(null);
      setDescription('');
      setLocation('');
      const photoNote = await attachPhotos(requestId, controller.signal);
      if (!mounted.current) return;
      setMessage(photoNote === null ? 'Request received. Refresh for its current status.' : `Request received. ${photoNote}`);
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
      <TextInput
        accessibilityLabel="Service location"
        value={pending ? pending.location : location}
        onChangeText={setLocation}
        editable={!pending && !busy}
        maxLength={maxLocationLength}
        placeholder="Location (optional)"
      />
      <ActionButton secondary label={photos.length === 0 ? 'Add photos' : `Add photos (${photos.length}/${maxRequestPhotos})`} onPress={() => void pickPhotos()} disabled={busy || photos.length >= maxRequestPhotos} />
      {photos.length > 0 ? <ActionButton secondary label="Clear photos" onPress={() => setPhotos([])} disabled={busy} /> : null}
      {queued.length > 0 ? <ActionButton secondary label={`Retry photo uploads (${queued.length})`} onPress={() => void retryPhotos()} disabled={busy} /> : null}
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
              reports={activity.reports.filter((report) => report.job_id === job.id)}
              pause={activity.pauses.find((pause) => pause.job_id === job.id)} onRefresh={() => void reload()} />
          ))}
        </Fragment>
      ))}
    </>
  );
}
