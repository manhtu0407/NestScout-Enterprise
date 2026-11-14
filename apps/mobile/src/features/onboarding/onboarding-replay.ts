let requested = false;

export function requestOnboardingReplay(): void {
  requested = true;
}

export function takeOnboardingReplay(): boolean {
  const pending = requested;
  requested = false;
  return pending;
}
