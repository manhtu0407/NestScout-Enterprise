import { useState } from 'react';

type Titled = { id: string; title: string };
type Known = { id: string; title: string } | null;

export function useActiveSessionTitle(activeId: string | null, sessions: readonly Titled[]): string | null {
  const [known, setKnown] = useState<Known>(null);
  const listed = activeId === null ? undefined : sessions.find(item => item.id === activeId)?.title;
  if (activeId !== null && listed !== undefined && (known?.id !== activeId || known.title !== listed)) setKnown({ id: activeId, title: listed });
  if (activeId === null) return null;
  if (listed !== undefined) return listed;
  return known?.id === activeId ? known.title : null;
}
