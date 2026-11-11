import type { NotificationItem } from './content';
import { BannerLive, projectRest, pullProgress, releaseOutcome, rubberBand, surfaceNotice } from './notification-banner-model';

const item = (id: string, unread = true): NotificationItem => ({ id, icon: 'bell', title: `Tiêu đề ${id}`, body: `Nội dung ${id}`, time: '1 phút trước', unread, today: true });

test('the first load seeds the seen set without raising a banner', () => {
  const first = surfaceNotice(null, [item('a'), item('b')]);
  expect(first.notice).toBeNull();
  expect([...first.seen].sort()).toEqual(['a', 'b']);
});

test('a new unread notification surfaces as the newest banner once', () => {
  const seeded = surfaceNotice(null, [item('a')]);
  const next = surfaceNotice(seeded.seen, [item('c'), item('b'), item('a')]);
  expect(next.notice).toMatchObject({ id: 'c', title: 'Tiêu đề c', body: 'Nội dung c', time: 'Bây giờ' });
  expect(surfaceNotice(next.seen, [item('c'), item('b'), item('a')]).notice).toBeNull();
});

test('already read notifications never raise a banner', () => {
  const seeded = surfaceNotice(null, []);
  expect(surfaceNotice(seeded.seen, [item('r', false)]).notice).toBeNull();
});

test('momentum projection follows the exponential deceleration form', () => {
  expect(projectRest(0)).toBe(0);
  expect(projectRest(400)).toBeCloseTo(199.6, 1);
  expect(projectRest(-400)).toBeCloseTo(-199.6, 1);
});

test('rubber banding resists progressively and never exceeds the pull', () => {
  expect(rubberBand(0)).toBe(0);
  expect(rubberBand(40)).toBeGreaterThan(0);
  expect(rubberBand(40)).toBeLessThan(40);
  expect(rubberBand(80) - rubberBand(40)).toBeLessThan(rubberBand(40));
});

test('pull progress is clamped between zero and one', () => {
  expect(pullProgress(-20)).toBe(0);
  expect(pullProgress(28)).toBeCloseTo(0.5, 5);
  expect(pullProgress(500)).toBe(1);
});

const base = { offset: 0, velocity: 0, height: 76, moved: true, expanded: false };

test('a gesture that barely moved is a tap', () => {
  expect(releaseOutcome({ ...base, moved: false })).toBe('open');
});

test('a flick upward dismisses even from a small offset', () => {
  expect(releaseOutcome({ ...base, offset: -8, velocity: -600 })).toBe('dismiss');
});

test('a slow drag past half the height dismisses and a shorter one settles back', () => {
  expect(releaseOutcome({ ...base, offset: -45 })).toBe('dismiss');
  expect(releaseOutcome({ ...base, offset: -20 })).toBe('settle');
});

test('pulling down past half the pull distance or flicking down expands', () => {
  expect(releaseOutcome({ ...base, offset: 40 })).toBe('expand');
  expect(releaseOutcome({ ...base, offset: 4, velocity: 500 })).toBe('expand');
  expect(releaseOutcome({ ...base, offset: 10 })).toBe('settle');
});

test('an expanded banner does not expand again and a reversal does not expand', () => {
  expect(releaseOutcome({ ...base, offset: 40, expanded: true })).toBe('settle');
  expect(releaseOutcome({ ...base, offset: -12, velocity: 500 })).toBe('settle');
});

test('the live gesture holder tracks the grab point and the drag offset', () => {
  const live = new BannerLive();
  live.grab(-10);
  expect(live.drag(25)).toBe(15);
  live.sync({ expanded: true });
  expect(live.expanded).toBe(true);
  expect(live.offset).toBe(15);
});
