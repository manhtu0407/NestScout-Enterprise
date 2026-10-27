export type AppMode = 'client' | 'worker';

export function isAppMode(value: unknown): value is AppMode {
  return value === 'client' || value === 'worker';
}
