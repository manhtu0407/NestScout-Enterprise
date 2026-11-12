import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedRequest } from '@/lib/authenticated-rest';

export type KaelAutonomy = 'ask' | 'auto';
export type KaelAutonomyMode = 'client' | 'worker';

const roleOf = (mode: KaelAutonomyMode): 'customer' | 'worker' => (mode === 'worker' ? 'worker' : 'customer');

export async function readKaelAutonomy(userId: string, mode: KaelAutonomyMode, signal: AbortSignal): Promise<KaelAutonomy> {
  const response = await authenticatedRequest(userId, `kael_autonomy?select=mode&role=eq.${roleOf(mode)}`, { signal });
  if (!response.ok) throw new Error('Autonomy is unavailable');
  const rows = await response.json() as { mode?: unknown }[];
  return rows[0]?.mode === 'auto' ? 'auto' : 'ask';
}

export async function saveKaelAutonomy(userId: string, mode: KaelAutonomyMode, value: KaelAutonomy, signal: AbortSignal): Promise<void> {
  const response = await authenticatedRequest(userId, 'rpc/set_kael_autonomy', {
    method: 'POST', body: JSON.stringify({ p_role: roleOf(mode), p_mode: value }), signal,
  });
  if (!response.ok || await response.json() !== value) throw new Error('Autonomy was not saved');
}

export type KaelAutonomyState = { value: KaelAutonomy; saving: boolean; failed: boolean; ready: boolean; choose: (value: KaelAutonomy) => void };

type Snapshot = { scope: string; value: KaelAutonomy; ready: boolean; saving: boolean; failed: boolean };

const initial = (scope: string): Snapshot => ({ scope, value: 'ask', ready: false, saving: false, failed: false });

export function useKaelAutonomy(userId: string | null, mode: KaelAutonomyMode): KaelAutonomyState {
  const scope = `${userId ?? ''}:${mode}`;
  const [stored, setStored] = useState<Snapshot>(() => initial(scope));
  const current = useRef<AbortController | null>(null);
  const confirmed = useRef<KaelAutonomy>('ask');
  const snapshot = stored.scope === scope ? stored : initial(scope);

  useEffect(() => {
    current.current?.abort();
    confirmed.current = 'ask';
    if (userId === null) return undefined;
    const controller = new AbortController();
    current.current = controller;
    void readKaelAutonomy(userId, mode, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      confirmed.current = value;
      setStored({ scope, value, ready: true, saving: false, failed: false });
    }).catch(() => {
      if (!controller.signal.aborted) setStored({ ...initial(scope), failed: true });
    });
    return () => controller.abort();
  }, [userId, mode, scope]);

  const choose = useCallback((next: KaelAutonomy) => {
    if (userId === null) return;
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    setStored({ scope, value: next, ready: true, saving: true, failed: false });
    void saveKaelAutonomy(userId, mode, next, controller.signal).then(() => {
      if (controller.signal.aborted) return;
      confirmed.current = next;
      setStored({ scope, value: next, ready: true, saving: false, failed: false });
    }).catch(() => {
      if (controller.signal.aborted) return;
      setStored({ scope, value: confirmed.current, ready: true, saving: false, failed: true });
    });
  }, [userId, mode, scope]);

  return { value: snapshot.value, saving: snapshot.saving, failed: snapshot.failed, ready: snapshot.ready, choose };
}
