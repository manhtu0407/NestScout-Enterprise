import type { TargetRect } from './onboarding-targets';

export type OverlaySize = Readonly<{ width: number; height: number }>;

export type SpotlightBox = Readonly<{ x: number; y: number; width: number; height: number; radius: number }>;

export type CardPlacement =
  | Readonly<{ kind: 'center' }>
  | Readonly<{ kind: 'above'; left: number; bottom: number }>
  | Readonly<{ kind: 'below'; left: number; top: number }>;

export function spotlightBox(rect: TargetRect, size: OverlaySize, padding: number, maxRadius: number): SpotlightBox {
  const x = Math.max(0, rect.x - padding);
  const y = Math.max(0, rect.y - padding);
  const width = Math.min(size.width, rect.x + rect.width + padding) - x;
  const height = Math.min(size.height, rect.y + rect.height + padding) - y;
  return { x, y, width, height, radius: Math.min(maxRadius, Math.min(width, height) / 2) };
}

export function cardWidthFor(size: OverlaySize, maxWidth: number, gutter: number): number {
  return Math.max(0, Math.min(size.width - gutter * 2, maxWidth));
}

export function placeCard(box: SpotlightBox | null, size: OverlaySize, cardWidth: number, gap: number, gutter: number): CardPlacement {
  if (box === null) return { kind: 'center' };
  const centered = box.x + box.width / 2 - cardWidth / 2;
  const left = Math.max(gutter, Math.min(centered, size.width - gutter - cardWidth));
  if (box.y + box.height / 2 > size.height / 2) return { kind: 'above', left, bottom: size.height - box.y + gap };
  return { kind: 'below', left, top: box.y + box.height + gap };
}

export function clampStep(step: number, total: number): number {
  return Math.max(0, Math.min(step, total - 1));
}
