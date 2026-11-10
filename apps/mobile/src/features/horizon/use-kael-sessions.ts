import { useCallback, useEffect, useRef, useState } from 'react';

import { archiveKaelSession, deleteKaelSession, listKaelSessions, pinKaelSession, renameKaelSession, type KaelMode, type KaelSessionDeleteResult, type KaelSessionSummary } from '@/features/shared';

export type KaelSessionsApi = {
  list: typeof listKaelSessions;
  rename: typeof renameKaelSession;
  pin: typeof pinKaelSession;
  archive: typeof archiveKaelSession;
  remove: typeof deleteKaelSession;
};

const defaultApi: KaelSessionsApi = { list: listKaelSessions, rename: renameKaelSession, pin: pinKaelSession, archive: archiveKaelSession, remove: deleteKaelSession };

export type KaelSessionsStatus = 'idle' | 'ready' | 'error';
export type KaelSessionActionResult = 'ok' | 'failed' | KaelSessionDeleteResult;

type View = { pinned: readonly KaelSessionSummary[]; items: readonly KaelSessionSummary[]; hasMore: boolean; status: KaelSessionsStatus; loadingMore: boolean };

const empty: View = { pinned: [], items: [], hasMore: false, status: 'idle', loadingMore: false };

export function useKaelSessions(userId: string | null, mode: KaelMode, active: boolean, refreshKey: string, api: KaelSessionsApi = defaultApi) {
  const scope = `${userId ?? 'guest'}:${mode}`;
  const [seenScope, setSeenScope] = useState(scope);
  const [view, setView] = useState<View>(empty);
  const [search, setSearch] = useState('');
  const [archivedView, setArchivedView] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  if (seenScope !== scope) {
    setSeenScope(scope);
    setView(empty);
    setSearch('');
    setArchivedView(false);
  }

  const fetchPage = useCallback(async (before: string | null) => {
    if (userId === null) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    let page: Awaited<ReturnType<typeof api.list>> | null = null;
    try {
      page = await api.list(userId, { mode, search, archived: archivedView, before }, controller.signal);
    } catch {
      page = null;
    }
    if (controller.signal.aborted) return;
    const loaded = page;
    setView(current => {
      if (loaded === null) return { ...current, status: 'error', loadingMore: false };
      return before === null
        ? { pinned: loaded.pinned, items: loaded.items, hasMore: loaded.hasMore, status: 'ready', loadingMore: false }
        : { ...current, items: [...current.items, ...loaded.items.filter(item => !current.items.some(existing => existing.id === item.id))], hasMore: loaded.hasMore, loadingMore: false };
    });
  }, [api, archivedView, mode, search, userId]);

  useEffect(() => {
    if (!active || userId === null) return;
    const timer = setTimeout(() => { void fetchPage(null); }, 0);
    return () => { clearTimeout(timer); controllerRef.current?.abort(); };
  }, [active, fetchPage, refreshKey, userId]);

  const refresh = useCallback(() => fetchPage(null), [fetchPage]);

  const loadMore = useCallback(() => {
    const last = view.items.at(-1);
    if (!view.hasMore || view.loadingMore || !last) return Promise.resolve();
    setView(current => ({ ...current, loadingMore: true }));
    return fetchPage(last.updatedAt);
  }, [fetchPage, view.hasMore, view.items, view.loadingMore]);

  const perform = useCallback(async (action: (userId: string, signal: AbortSignal) => Promise<KaelSessionActionResult | void>): Promise<KaelSessionActionResult> => {
    if (userId === null) return 'failed';
    let result: KaelSessionActionResult = 'ok';
    try {
      const outcome = await action(userId, new AbortController().signal);
      if (outcome) result = outcome;
    } catch {
      result = 'failed';
    }
    await fetchPage(null);
    return result;
  }, [fetchPage, userId]);

  const rename = useCallback((id: string, title: string) => perform((user, signal) => api.rename(user, id, title, signal).then(() => undefined)), [api, perform]);
  const pin = useCallback((id: string, pinned: boolean) => perform((user, signal) => api.pin(user, id, pinned, signal)), [api, perform]);
  const archive = useCallback((id: string, archived: boolean) => perform((user, signal) => api.archive(user, id, archived, signal)), [api, perform]);
  const remove = useCallback((id: string) => perform((user, signal) => api.remove(user, id, signal)), [api, perform]);

  return { ...view, search, setSearch, archivedView, setArchivedView, refresh, loadMore, rename, pin, archive, remove };
}
