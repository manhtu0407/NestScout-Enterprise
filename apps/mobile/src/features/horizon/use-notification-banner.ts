import { useCallback, useEffect, useRef, useState } from 'react';

import { horizonLayout } from '@/theme/layout';

import type { NotificationItem } from './content';
import { surfaceNotice } from './notification-banner-model';
import type { BannerNotice } from './notification-banner-model';

const metrics = horizonLayout.notificationBanner;

export function useNotificationBanner(items: readonly NotificationItem[], ready: boolean, scope: string | null) {
  const seen = useRef<ReadonlySet<string> | null>(null);
  const seenScope = useRef(scope);
  const wasReady = useRef(false);
  const [notice, setNotice] = useState<BannerNotice | null>(null);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (seenScope.current !== scope || (wasReady.current && !ready)) {
      seenScope.current = scope;
      seen.current = null;
      setNotice(null);
    }
    wasReady.current = ready;
    if (!ready) return;
    const surfaced = surfaceNotice(seen.current, items);
    seen.current = surfaced.seen;
    if (surfaced.notice !== null) setNotice(surfaced.notice);
  }, [items, ready, scope]);

  useEffect(() => {
    if (notice === null || held) return;
    const timer = setTimeout(() => setNotice(null), metrics.autoDismiss);
    return () => clearTimeout(timer);
  }, [notice, held]);

  const show = useCallback((next: BannerNotice) => setNotice(next), []);
  const dismiss = useCallback((id: string) => setNotice(current => current?.id === id ? null : current), []);
  return { notice, show, dismiss, hold: setHeld };
}
