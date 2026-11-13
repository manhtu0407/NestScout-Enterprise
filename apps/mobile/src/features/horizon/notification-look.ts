import { CalendarCheck, CalendarClock, CalendarX, CircleX, FilePenLine, Hammer, Hourglass, MapPinCheck, PackageCheck, Pause, Play, Receipt, Truck, Undo2, UserRoundX, Zap } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

import type { NotificationKind } from '@/features/shared';

import type { KaelExpression } from './kael-phase';

export type GlyphTone = 'info' | 'success' | 'attention' | 'critical' | 'delight';
export type GlyphMotionName = 'slide' | 'drop' | 'rise' | 'tap' | 'settle' | 'pop' | 'shake' | 'spin' | 'unwind';
export type GlyphSpringName = 'calm' | 'lively' | 'wobble';
export type GlyphHaptic = 'light' | 'success' | 'warning';

export type NotificationLook = Readonly<{ expression: KaelExpression; tone: GlyphTone; motion: GlyphMotionName; badge?: LucideIcon }>;
export type GlyphMotion = Readonly<{ x?: number; y?: number; turn?: number; scale?: number; spring: GlyphSpringName; ring?: number }>;

export const glyphMotions: Readonly<Record<GlyphMotionName, GlyphMotion>> = {
  slide: { x: -26, spring: 'calm' },
  drop: { y: -26, spring: 'lively', ring: 150 },
  rise: { y: 26, spring: 'calm' },
  tap: { turn: -38, spring: 'wobble' },
  settle: { scale: 0.7, spring: 'calm' },
  pop: { scale: 0.45, spring: 'lively', ring: 0 },
  shake: { x: -7, spring: 'wobble', ring: 0 },
  spin: { turn: -200, spring: 'calm' },
  unwind: { turn: 80, spring: 'lively' },
};

export const hapticForTone: Readonly<Record<GlyphTone, GlyphHaptic>> = {
  info: 'light',
  delight: 'light',
  success: 'success',
  attention: 'warning',
  critical: 'warning',
};

const look = (expression: KaelExpression, tone: GlyphTone, motion: GlyphMotionName, badge?: LucideIcon): NotificationLook =>
  badge === undefined ? { expression, tone, motion } : { expression, tone, motion, badge };

const looks: Readonly<Record<NotificationKind, NotificationLook>> = {
  quote_received: look('thinking', 'info', 'rise', Receipt),
  job_assigned: look('happy', 'success', 'pop'),
  job_progress: look('focus', 'info', 'spin'),
  work_submitted: look('thinking', 'info', 'pop', PackageCheck),
  job_completed: look('happy', 'success', 'pop'),
  scope_proposed: look('thinking', 'info', 'rise', FilePenLine),
  dispatch_exhausted: look('calm', 'attention', 'spin', Hourglass),
  job_released: look('calm', 'attention', 'unwind', UserRoundX),
  escalation_received: look('alert', 'critical', 'shake'),
  escalation_resolved: look('calm', 'success', 'pop'),
  job_offered: look('focus', 'info', 'pop', Zap),
  work_approved: look('happy', 'success', 'pop'),
  revision_requested: look('calm', 'attention', 'unwind', Undo2),
  work_disputed: look('alert', 'critical', 'shake'),
  scope_approved: look('happy', 'success', 'pop'),
  scope_rejected: look('calm', 'attention', 'shake', CircleX),
  resume_agreed: look('happy', 'success', 'pop', Play),
  review_received: look('heart', 'delight', 'pop'),
  job_auto_accepted: look('idle', 'info', 'pop'),
  job_withdrawn: look('calm', 'attention', 'unwind', UserRoundX),
  job_escalated: look('alert', 'critical', 'shake'),
  change_requested: look('thinking', 'info', 'slide', CalendarClock),
  change_decided: look('calm', 'info', 'settle', CalendarClock),
};

const fallback = look('idle', 'info', 'settle');

const refinements: Readonly<Partial<Record<NotificationKind, readonly (readonly [string, NotificationLook])[]>>> = {
  job_progress: [
    ['có thợ đang trên đường tới.', look('focus', 'info', 'slide', Truck)],
    ['có thợ đã đến nơi.', look('happy', 'info', 'drop', MapPinCheck)],
    ['đang được thực hiện.', look('focus', 'info', 'tap', Hammer)],
    ['đang tạm dừng.', look('calm', 'attention', 'settle', Pause)],
  ],
  change_decided: [
    ['đã được bên kia đồng ý đề nghị thay đổi.', look('happy', 'success', 'pop', CalendarCheck)],
    ['đã bị bên kia từ chối đề nghị thay đổi.', look('calm', 'attention', 'shake', CalendarX)],
  ],
};

export function lookFor(kind: NotificationKind | undefined, body: string): NotificationLook {
  if (kind === undefined) return fallback;
  const refined = refinements[kind]?.find(([ending]) => body.endsWith(ending));
  return refined === undefined ? looks[kind] : refined[1];
}
