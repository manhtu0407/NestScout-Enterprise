import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ReviewReactionCount, ReviewReactionId, ReviewReactionMap } from '@/features/shared';

export type ReviewReactionsApi = {
  load: (reviewIds: readonly string[], signal: AbortSignal) => Promise<ReviewReactionMap>;
  toggle: (reviewId: string, reaction: ReviewReactionId, signal: AbortSignal) => Promise<boolean>;
};

export type ReviewReactionsState = {
  reactionsFor: (reviewId: string) => readonly ReviewReactionCount[];
  toggle: (reviewId: string, reaction: ReviewReactionId) => void;
  failed: boolean;
};

const none: readonly ReviewReactionCount[] = [];

function flip(current: readonly ReviewReactionCount[], reaction: ReviewReactionId): readonly ReviewReactionCount[] {
  const found = current.find(item => item.id === reaction);
  if (found === undefined) return [...current, { id: reaction, count: 1, reacted: true }];
  const count = found.reacted ? found.count - 1 : found.count + 1;
  const next = current.map(item => (item.id === reaction ? { ...item, count, reacted: !item.reacted } : item));
  return next.filter(item => item.count > 0);
}

export function useReviewReactions(reviewIds: readonly string[], api: ReviewReactionsApi | undefined): ReviewReactionsState {
  const [map, setMap] = useState<ReviewReactionMap>({});
  const [failed, setFailed] = useState(false);
  const key = useMemo(() => reviewIds.join('|'), [reviewIds]);
  const pending = useRef(new Set<string>());

  useEffect(() => {
    if (api === undefined || key === '') return undefined;
    const controller = new AbortController();
    api.load(key.split('|'), controller.signal).then(
      loaded => { setMap(current => ({ ...current, ...loaded })); setFailed(false); },
      () => { if (!controller.signal.aborted) setFailed(true); },
    );
    return () => controller.abort();
  }, [api, key]);

  const toggle = useCallback((reviewId: string, reaction: ReviewReactionId) => {
    const lock = `${reviewId}:${reaction}`;
    if (pending.current.has(lock)) return;
    pending.current.add(lock);
    setFailed(false);
    setMap(current => ({ ...current, [reviewId]: flip(current[reviewId] ?? none, reaction) }));
    if (api === undefined) {
      pending.current.delete(lock);
      return;
    }
    api.toggle(reviewId, reaction, new AbortController().signal).then(
      () => { pending.current.delete(lock); },
      () => {
        pending.current.delete(lock);
        setFailed(true);
        setMap(current => ({ ...current, [reviewId]: flip(current[reviewId] ?? none, reaction) }));
      },
    );
  }, [api]);

  const reactionsFor = useCallback((reviewId: string) => map[reviewId] ?? none, [map]);

  return { reactionsFor, toggle, failed };
}
