const pulseKeys: readonly (readonly [number, number])[] = [[0, 0], [0.15, 1], [0.45, 0], [1, 0]];

function pulseAt(local: number): number {
  const index = pulseKeys.findIndex(([end]) => local <= end);
  const next = pulseKeys[index];
  const previous = pulseKeys[index - 1];
  if (!next || !previous) return 0;
  return previous[1] + (next[1] - previous[1]) * ((local - previous[0]) / (next[0] - previous[0]));
}

function wrap(value: number): number {
  return ((value % 1) + 1) % 1;
}

export function matrixStops(delay: number): { inputRange: number[]; outputRange: number[] } {
  const stops = new Map<number, number>();
  for (const [at, value] of pulseKeys.slice(0, -1)) stops.set(wrap(delay + at), value);
  const edge = pulseAt(wrap(-delay));
  if (!stops.has(0)) stops.set(0, edge);
  stops.set(1, edge);
  const ordered = [...stops.entries()].sort(([a], [b]) => a - b);
  return { inputRange: ordered.map(([position]) => position), outputRange: ordered.map(([, value]) => value) };
}
