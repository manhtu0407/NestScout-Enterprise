export const dispatchServiceIds = ['electric', 'water', 'aircon', 'paint', 'sofa', 'other'] as const;

export type DispatchServiceId = typeof dispatchServiceIds[number];

export function isDispatchServiceId(value: unknown): value is DispatchServiceId {
  return typeof value === 'string' && (dispatchServiceIds as readonly string[]).includes(value);
}
