import { horizonLayout } from '@/theme/layout';

import type { NotificationItem } from './content';

const metrics = horizonLayout.notificationBanner;

export type BannerNotice = { id: string; title: string; body: string; time: string };
export type ReleaseOutcome = 'open' | 'dismiss' | 'expand' | 'settle';
export type Release = { offset: number; velocity: number; height: number; moved: boolean; expanded: boolean };

export function noticeFromItem(item: NotificationItem): BannerNotice {
  return { id: item.id, title: item.title, body: item.body, time: metrics.nowLabel };
}

export function surfaceNotice(seen: ReadonlySet<string> | null, items: readonly NotificationItem[]): { seen: ReadonlySet<string>; notice: BannerNotice | null } {
  const next = new Set(items.map(item => item.id));
  if (seen === null) return { seen: next, notice: null };
  const fresh = items.find(item => item.unread && !seen.has(item.id));
  for (const id of seen) next.add(id);
  return { seen: next, notice: fresh === undefined ? null : noticeFromItem(fresh) };
}

export function projectRest(velocity: number): number {
  return (velocity / 1000) * metrics.deceleration / (1 - metrics.deceleration);
}

export function rubberBand(overshoot: number): number {
  const { rubberDimension: dimension, rubberConstant: constant } = metrics;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export function releaseOutcome({ offset, velocity, height, moved, expanded }: Release): ReleaseOutcome {
  if (!moved) return 'open';
  const projected = offset + projectRest(velocity);
  if (velocity <= -metrics.dismissVelocity || projected <= -height * metrics.dismissProjection) return 'dismiss';
  if (!expanded && offset >= 0 && (offset >= metrics.expandPull / 2 || velocity >= metrics.expandVelocity)) return 'expand';
  return 'settle';
}

export function pullProgress(offset: number): number {
  return Math.min(1, Math.max(0, offset / metrics.expandPull));
}

export type BannerLiveValues = {
  hidden: number;
  reduceMotion: boolean;
  expanded: boolean;
  shown: BannerNotice | null;
  onHold: (held: boolean) => void;
  onOpen: (notice: BannerNotice) => void;
  onDismiss: (id: string) => void;
};

export class BannerLive implements BannerLiveValues {
  start = 0;
  offset = 0;
  hidden = 0;
  reduceMotion = false;
  expanded = false;
  shown: BannerNotice | null = null;
  onHold: (held: boolean) => void = () => undefined;
  onOpen: (notice: BannerNotice) => void = () => undefined;
  onDismiss: (id: string) => void = () => undefined;

  sync(values: Partial<BannerLiveValues>) {
    Object.assign(this, values);
  }

  grab(value: number) {
    this.start = value;
    this.offset = value;
  }

  drag(delta: number): number {
    this.offset = this.start + delta;
    return this.offset;
  }
}
