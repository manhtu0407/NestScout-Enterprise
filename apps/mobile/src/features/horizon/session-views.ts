import type { KaelSession } from '@/features/shared';

import type { RecentSession } from './recent-session';
import { relativeTimeLabel } from './request-views';

export const untitledSession = 'Cuộc trò chuyện mới';

export function toSessionRows(sessions: readonly KaelSession[], now: Date): RecentSession[] {
  return sessions.map(session => ({
    id: session.id,
    title: session.title || untitledSession,
    preview: session.preview,
    timeLabel: relativeTimeLabel(session.updatedAt, now),
    phase: null,
    pinned: session.pinned,
  }));
}
