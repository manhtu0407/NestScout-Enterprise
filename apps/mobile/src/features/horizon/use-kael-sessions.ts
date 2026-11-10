import { useCallback, useEffect, useRef, useState } from 'react';

import { deleteKaelSession, KaelSessionError, listKaelSessions, renameKaelSession, setKaelSessionArchived, setKaelSessionPinned, type KaelMode, type KaelSession, type KaelSessionFailure } from '@/features/shared';

export type KaelSessionsApi = {
  list: typeof listKaelSessions;
  rename: typeof renameKaelSession;
  pin: typeof setKaelSessionPinned;
  archive: typeof setKaelSessionArchived;
  remove: typeof deleteKaelSession;
};

const defaultApi: KaelSessionsApi = { list: listKaelSessions, rename: renameKaelSession, pin: setKaelSessionPinned, archive: setKaelSessionArchived, remove: deleteKaelSession };

export type KaelSessionsStatus = 'idle' | 'loading' | 'ready' | 'error';

export type KaelSessionResult = { ok: true } | { ok: false; failure: KaelSessionFailure };

export const sessionListLimit = 50;
export const searchDelayMs = 250;

type Listing = { scope: string; key: string; status: 'ready' | 'error'; sessions: readonly KaelSession[] };

function failureOf(error: unknown): KaelSessionFailure {
  return error instanceof KaelSessionError ? error.failure : 'failed';
}

export function useKaelSessions(userId: string | null, mode: KaelMode, active: boolean, api: KaelSessionsApi = defaultApi) {
  const scope = `${userId ?? 'guest'}:${mode}`;
  const [listing, setListing] = useState<Listing | null>(null);
  const [query, setQueryState] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [archived, setArchivedState] = useState(false);
  const [version, setVersion] = useState(0);
  const mutating = useRef(false);
  const key = `${scope}|${searchTerm}|${archived}|${version}`;

  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(query), query === '' ? 0 : searchDelayMs);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!active || userId === null) return;
    const controller = new AbortController();
    api.list(userId, mode, { search: searchTerm, archived, limit: sessionListLimit }, controller.signal).then(
      sessions => {
        if (!controller.signal.aborted) setListing({ scope, key, status: 'ready', sessions });
      },
      () => {
        if (!controller.signal.aborted) setListing(current => ({ scope, key, status: 'error', sessions: current?.scope === scope ? current.sessions : [] }));
      },
    );
    return () => controller.abort();
  }, [active, api, archived, key, mode, scope, searchTerm, userId]);

  const reload = useCallback(() => setVersion(current => current + 1), []);

  const mutate = useCallback(async (action: (id: string, signal: AbortSignal) => Promise<unknown>, id: string): Promise<KaelSessionResult> => {
    if (userId === null) return { ok: false, failure: 'failed' };
    if (mutating.current) return { ok: false, failure: 'failed' };
    mutating.current = true;
    try {
      await action(id, new AbortController().signal);
      reload();
      return { ok: true };
    } catch (error) {
      return { ok: false, failure: failureOf(error) };
    } finally {
      mutating.current = false;
    }
  }, [reload, userId]);

  const rename = useCallback((id: string, title: string | null) => mutate((target, signal) => api.rename(userId as string, target, title, signal), id), [api, mutate, userId]);
  const setPinned = useCallback((id: string, pinned: boolean) => mutate((target, signal) => api.pin(userId as string, target, pinned, signal), id), [api, mutate, userId]);
  const setArchived = useCallback((id: string, next: boolean) => mutate((target, signal) => api.archive(userId as string, target, next, signal), id), [api, mutate, userId]);
  const remove = useCallback((id: string) => mutate((target, signal) => api.remove(userId as string, target, signal), id), [api, mutate, userId]);

  const visible = listing !== null && listing.scope === scope ? listing : null;
  const status: KaelSessionsStatus = !active || userId === null ? 'idle' : visible === null || visible.key !== key ? 'loading' : visible.status;
  return {
    sessions: visible?.sessions ?? [],
    status,
    query,
    setQuery: setQueryState,
    archived,
    setArchived: setArchivedState,
    reload,
    rename,
    setPinned,
    setSessionArchived: setArchived,
    remove,
  };
}
