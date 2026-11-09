let pending = false;

export function markSidebarReturn(): void {
  pending = true;
}

export function consumeSidebarReturn(): boolean {
  const was = pending;
  pending = false;
  return was;
}
