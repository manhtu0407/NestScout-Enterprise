import { useCallback, useEffect, useRef, useState } from 'react';

import {
  WorkflowError, acceptQuote, cancelRequest, clearKaelHistory, markNotificationsRead, readAccountPhone, readCustomerActivity, readCustomerProfile, readCustomerSettings, readDispatchSummaries, readJobWorkerCards,
  readAvatarSource, readNotifications, readPinnedRequestIds, readQuotes, readRequestPhotos, readRequests, readSavedWorkers, rejectQuote, removeAvatar, retryDispatchRequest, setRequestService,
  reviewJobWorker, saveCustomerProfile, uploadAvatar,
  saveCustomerSettings, saveWorker, setRequestPinned, unsaveWorker,
  type CustomerActivity, type CustomerNotification, type CustomerProfile, type CustomerSettings, type DispatchServiceId, type DispatchSummary, type JobReview, type JobWorkerCard, type MediaFile, type RetryResult,
  type SavedWorkerRecord, type ServiceQuote, type ServiceRequest, type StorageSource, type StoredCustomerProfile,
} from '@/features/shared';

export type CustomerDataStatus = 'idle' | 'loading' | 'ready' | 'error';

export type CustomerData = {
  requests: readonly ServiceRequest[];
  quotes: readonly ServiceQuote[];
  activity: CustomerActivity;
  pinnedIds: ReadonlySet<string>;
  notifications: readonly CustomerNotification[];
  profile: StoredCustomerProfile | null;
  avatar: StorageSource | null;
  photos: ReadonlyMap<string, readonly StorageSource[]>;
  savedWorkers: readonly SavedWorkerRecord[];
  settings: CustomerSettings | null;
  phone: string;
  jobWorkers: readonly JobWorkerCard[];
  dispatch: ReadonlyMap<string, DispatchSummary>;
};

const emptyActivity: CustomerActivity = { jobs: [], submissions: [], cases: [], changes: [], reports: [], pauses: [] };

const emptyData: CustomerData = { requests: [], quotes: [], activity: emptyActivity, pinnedIds: new Set(), notifications: [], profile: null, avatar: null, photos: new Map(), savedWorkers: [], settings: null, phone: '', jobWorkers: [], dispatch: new Map() };

export type CustomerDataController = {
  data: CustomerData;
  status: CustomerDataStatus;
  loaded: boolean;
  refresh: () => void;
  togglePin: (requestId: string) => Promise<void>;
  decideQuote: (quote: { id: string; version: number }, decision: 'accepted' | 'rejected') => Promise<void>;
  markRead: (ids: readonly string[]) => Promise<void>;
  saveProfile: (profile: CustomerProfile) => Promise<void>;
  removeSavedWorker: (profileId: string) => Promise<void>;
  saveSettings: (settings: CustomerSettings) => Promise<void>;
  clearChatHistory: () => Promise<void>;
  changeAvatar: (file: MediaFile) => Promise<void>;
  clearAvatar: () => Promise<void>;
  setWorkerSaved: (profileId: string, saved: boolean) => Promise<void>;
  reviewJob: (jobId: string, review: JobReview) => Promise<void>;
  retryDispatch: (requestId: string) => Promise<RetryResult>;
  classifyRequest: (requestId: string, serviceId: DispatchServiceId) => Promise<void>;
  cancelServiceRequest: (requestId: string) => Promise<void>;
};

async function loadAll(userId: string, signal: AbortSignal): Promise<CustomerData> {
  const requests = await readRequests(userId, signal);
  const [quotes, activity, pinned, notifications, profile, savedWorkers, settings, phone, jobWorkers, photos, summaries] = await Promise.all([
    readQuotes(userId, signal),
    readCustomerActivity(userId, requests.map(request => request.id), signal),
    readPinnedRequestIds(userId, signal),
    readNotifications(userId, signal),
    readCustomerProfile(userId, signal),
    readSavedWorkers(userId, signal),
    readCustomerSettings(userId, signal),
    readAccountPhone(userId, signal),
    readJobWorkerCards(userId, signal),
    readRequestPhotos(userId, signal),
    readDispatchSummaries(userId, requests.map(request => request.id), signal),
  ]);
  const avatar = profile && profile.avatar_path ? await readAvatarSource(userId, profile.avatar_path, profile.updated_at, signal) : null;
  const dispatch = new Map(summaries.map(summary => [summary.requestId, summary]));
  return { requests, quotes, activity, pinnedIds: new Set(pinned), notifications, profile, avatar, photos, savedWorkers, settings, phone, jobWorkers, dispatch };
}

type Snapshot = { owner: string | null; data: CustomerData; loaded: boolean };

const emptySnapshot: Snapshot = { owner: null, data: emptyData, loaded: false };

export function useCustomerData(userId: string | null): CustomerDataController {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const mounted = useRef(true);
  const current = snapshot.owner === userId ? snapshot : emptySnapshot;
  const data = current.data;
  const status: CustomerDataStatus = userId === null ? 'idle' : failedFor === userId ? 'error' : current.loaded ? 'ready' : 'loading';

  const patch = useCallback((update: (value: CustomerData) => CustomerData) => {
    setSnapshot(previous => (previous.owner === userId ? { ...previous, data: update(previous.data) } : previous));
  }, [userId]);

  const refresh = useCallback(() => {
    setFailedFor(null);
    setReloadKey(key => key + 1);
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (userId === null) return undefined;
    const controller = new AbortController();
    loadAll(userId, controller.signal).then(
      next => {
        if (controller.signal.aborted) return;
        setSnapshot({ owner: userId, data: next, loaded: true });
        setFailedFor(null);
      },
      () => {
        if (!controller.signal.aborted) setFailedFor(userId);
      },
    );
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [userId, reloadKey]);

  const requireOwner = useCallback((): string => {
    if (userId === null) throw new WorkflowError('forbidden');
    return userId;
  }, [userId]);

  const togglePin = useCallback(async (requestId: string) => {
    const id = requireOwner();
    const pinned = !data.pinnedIds.has(requestId);
    const apply = (value: boolean) => patch(previous => {
      const next = new Set(previous.pinnedIds);
      if (value) next.add(requestId);
      else next.delete(requestId);
      return { ...previous, pinnedIds: next };
    });
    apply(pinned);
    try {
      await setRequestPinned(id, requestId, pinned, new AbortController().signal);
    } catch (error) {
      if (mounted.current) apply(!pinned);
      throw error;
    }
  }, [data.pinnedIds, patch, requireOwner]);

  const decideQuote = useCallback(async (quote: { id: string; version: number }, decision: 'accepted' | 'rejected') => {
    const id = requireOwner();
    const signal = new AbortController().signal;
    try {
      if (decision === 'accepted') await acceptQuote(id, quote.id, quote.version, signal);
      else await rejectQuote(id, quote.id, quote.version, signal);
    } finally {
      refresh();
    }
  }, [refresh, requireOwner]);

  const markRead = useCallback(async (ids: readonly string[]) => {
    const id = requireOwner();
    const targets = new Set(ids);
    const readAt = new Date().toISOString();
    patch(previous => ({
      ...previous,
      notifications: previous.notifications.map(item => (targets.has(item.id) && item.read_at === null ? { ...item, read_at: readAt } : item)),
    }));
    try {
      await markNotificationsRead(id, ids, new AbortController().signal);
    } catch (error) {
      refresh();
      throw error;
    }
  }, [patch, refresh, requireOwner]);

  const saveProfile = useCallback(async (profile: CustomerProfile) => {
    const id = requireOwner();
    await saveCustomerProfile(id, profile, new AbortController().signal);
    if (mounted.current) patch(previous => ({ ...previous, profile: { avatar_path: '', updated_at: new Date().toISOString(), ...previous.profile, ...profile } }));
  }, [patch, requireOwner]);

  const removeSavedWorker = useCallback(async (profileId: string) => {
    const id = requireOwner();
    try {
      await unsaveWorker(id, profileId, new AbortController().signal);
    } finally {
      refresh();
    }
  }, [refresh, requireOwner]);

  const changeAvatar = useCallback(async (file: MediaFile) => {
    const id = requireOwner();
    try {
      await uploadAvatar(id, file, new AbortController().signal);
    } finally {
      refresh();
    }
  }, [refresh, requireOwner]);

  const clearAvatar = useCallback(async () => {
    const id = requireOwner();
    try {
      await removeAvatar(id, new AbortController().signal);
    } finally {
      refresh();
    }
  }, [refresh, requireOwner]);

  const saveSettings = useCallback(async (settings: CustomerSettings) => {
    const id = requireOwner();
    const previous = data.settings;
    patch(value => ({ ...value, settings }));
    try {
      await saveCustomerSettings(id, settings, new AbortController().signal);
    } catch (error) {
      if (mounted.current) patch(value => ({ ...value, settings: previous }));
      throw error;
    }
  }, [data.settings, patch, requireOwner]);

  const clearChatHistory = useCallback(async () => {
    const id = requireOwner();
    await clearKaelHistory(id, 'client', new AbortController().signal);
  }, [requireOwner]);

  const setWorkerSaved = useCallback(async (profileId: string, saved: boolean) => {
    const id = requireOwner();
    const signal = new AbortController().signal;
    try {
      if (saved) await saveWorker(id, profileId, signal);
      else await unsaveWorker(id, profileId, signal);
    } finally {
      refresh();
    }
  }, [refresh, requireOwner]);

  const reviewJob = useCallback(async (jobId: string, review: JobReview) => {
    const id = requireOwner();
    try {
      await reviewJobWorker(id, jobId, review, new AbortController().signal);
    } finally {
      refresh();
    }
  }, [refresh, requireOwner]);

  const retryDispatch = useCallback(async (requestId: string) => {
    const id = requireOwner();
    try {
      return await retryDispatchRequest(id, requestId, new AbortController().signal);
    } finally {
      refresh();
    }
  }, [refresh, requireOwner]);

  const classifyRequest = useCallback(async (requestId: string, serviceId: DispatchServiceId) => {
    const id = requireOwner();
    try {
      await setRequestService(id, requestId, serviceId, new AbortController().signal);
    } finally {
      refresh();
    }
  }, [refresh, requireOwner]);

  const cancelServiceRequest = useCallback(async (requestId: string) => {
    const id = requireOwner();
    try {
      await cancelRequest(id, requestId, new AbortController().signal);
    } finally {
      refresh();
    }
  }, [refresh, requireOwner]);

  return {
    data, status, loaded: current.loaded, refresh, togglePin, decideQuote, markRead, saveProfile, removeSavedWorker, saveSettings, clearChatHistory, changeAvatar, clearAvatar, setWorkerSaved, reviewJob, retryDispatch, classifyRequest, cancelServiceRequest,
  };
}
