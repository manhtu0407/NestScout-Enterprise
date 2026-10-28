import { useEffect, useRef, useState } from 'react';

import { authenticatedRequest } from '@/lib/authenticated-rest';

import { ActionButton } from './action-button';
import { BodyText } from './text';

type Kind = 'customer_request' | 'worker_job';

const messages: Record<string, string> = {
  request_received: 'Your request was received. Review its current details above.',
  assigned: 'The job is assigned.',
  en_route: 'The Worker is en route.',
  arrived: 'The Worker reported arrival.',
  working: 'Work is in progress.',
  paused: 'Work is paused.',
  submitted: 'Work was submitted for Customer review.',
  completed: 'The Customer accepted the work. Payment is not configured.',
};

export function KaelStatus({ userId, resourceId, kind }: { userId: string; resourceId: string; kind: Kind }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      inFlight.current?.abort();
    };
  }, [userId, resourceId, kind]);

  const check = async () => {
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error('Timed out'));
      }, 5000);
    });
    setBusy(true);
    setMessage(null);
    try {
      const operation = async (): Promise<unknown> => {
        const response = await authenticatedRequest(userId, 'rpc/kael_read_context', {
          method: 'POST', signal: controller.signal, body: JSON.stringify({ p_kind: kind, p_resource_id: resourceId }),
        });
        if (!response.ok) throw new Error('Unavailable');
        return response.json();
      };
      const data: unknown = await Promise.race([operation(), deadline]);
      if (typeof data !== 'object' || data === null) throw new Error('Invalid response');
      const value = data as Record<string, unknown>;
      if (value.status !== 'ok' || value.kind !== kind || value.resource_id !== resourceId
        || typeof value.state !== 'string' || !Object.hasOwn(messages, value.state)) throw new Error('Unavailable');
      if ((kind === 'customer_request') !== (value.state === 'request_received')) throw new Error('Invalid context');
      if (controller.signal.aborted) throw new Error('Timed out');
      if (active.current) setMessage(messages[value.state] ?? null);
    } catch {
      if (active.current) setMessage('Status assistance is unavailable. Continue using the manual controls.');
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      inFlight.current = null;
      if (active.current) setBusy(false);
    }
  };

  return (
    <>
      <BodyText>Kael status is a fixed lookup. AI assistance is not configured.</BodyText>
      <ActionButton secondary label="Kael: check status" onPress={() => void check()} busy={busy} />
      {message ? <BodyText>{message}</BodyText> : null}
    </>
  );
}
