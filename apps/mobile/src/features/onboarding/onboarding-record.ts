export const onboardingOutcomes = ['completed', 'skipped'] as const;

export type OnboardingOutcome = (typeof onboardingOutcomes)[number];

export type OnboardingMark = Readonly<{ outcome: OnboardingOutcome; at: string }>;

export type OnboardingEntry =
  | Readonly<{ state: 'done'; outcome: OnboardingOutcome; at: string }>
  | Readonly<{ state: 'existing' }>
  | Readonly<{ state: 'progress'; step: number }>;

export const metadataKey = 'onboarding';
export const recordVersion = 1;

export function isOnboardingOutcome(value: unknown): value is OnboardingOutcome {
  return onboardingOutcomes.some(outcome => outcome === value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function parseMark(value: unknown): OnboardingMark | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.v !== recordVersion || !isOnboardingOutcome(record.outcome) || !isTimestamp(record.at)) return null;
  return { outcome: record.outcome, at: record.at };
}

export function markFromUser(user: unknown): OnboardingMark | null {
  if (typeof user !== 'object' || user === null) return null;
  const metadata = (user as { user_metadata?: unknown }).user_metadata;
  if (typeof metadata !== 'object' || metadata === null) return null;
  return parseMark((metadata as Record<string, unknown>)[metadataKey]);
}

export function metadataFor(mark: OnboardingMark): Record<string, unknown> {
  return { [metadataKey]: { v: recordVersion, outcome: mark.outcome, at: mark.at } };
}

export function parseEntry(value: unknown): OnboardingEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.state === 'existing') return { state: 'existing' };
  if (record.state === 'progress') {
    return typeof record.step === 'number' && Number.isInteger(record.step) && record.step >= 0 ? { state: 'progress', step: record.step } : null;
  }
  if (record.state === 'done' && isOnboardingOutcome(record.outcome) && isTimestamp(record.at)) return { state: 'done', outcome: record.outcome, at: record.at };
  return null;
}
