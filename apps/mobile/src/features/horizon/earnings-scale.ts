const fallbackCeiling = 1_000_000;
const steps = [1, 2, 2.5, 5, 10] as const;

export function niceCeiling(peakMinor: number): number {
  if (!(peakMinor > 0)) return fallbackCeiling;
  const magnitude = 10 ** Math.floor(Math.log10(peakMinor));
  const step = steps.find(candidate => candidate * magnitude >= peakMinor) ?? 10;
  return step * magnitude;
}

function trimmed(value: number): string {
  return (Math.round(value * 10) / 10).toString().replace('.', ',');
}

export function compactMoney(amountMinor: number): string {
  if (amountMinor >= 1_000_000) return `${trimmed(amountMinor / 1_000_000)}tr`;
  if (amountMinor >= 1_000) return `${trimmed(amountMinor / 1_000)}K`;
  return String(Math.round(amountMinor));
}
