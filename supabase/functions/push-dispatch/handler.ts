export type DispatchEnvironment = Record<string, string | undefined>;

export type DispatchDependencies = {
  env: DispatchEnvironment;
  fetcher?: typeof fetch;
  log?: (event: Record<string, string | number>) => void;
};

type Delivery = { notification_id: string; title: string; body: string; tokens: string[] };
type Ticket = { status?: unknown; message?: unknown };

const expoEndpoint = 'https://exp.host/--/api/v2/push/send';
const batchSize = 50;

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function isDelivery(value: unknown): value is Delivery {
  const row = typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
  return row !== null && typeof row.notification_id === 'string' && typeof row.title === 'string' && typeof row.body === 'string'
    && Array.isArray(row.tokens) && row.tokens.every(token => typeof token === 'string');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export function createPushDispatch({ env, fetcher = fetch, log = console.error }: DispatchDependencies) {
  const secret = env.PUSH_DISPATCH_SECRET?.trim();
  const baseUrl = env.SUPABASE_URL?.trim();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  const rpc = async (name: string, body: object): Promise<unknown> => {
    const response = await fetcher(`${baseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: serviceKey ?? '', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`rpc ${name} failed with ${response.status}`);
    return response.json();
  };

  const sendToExpo = async (delivery: Delivery): Promise<string | null> => {
    if (delivery.tokens.length === 0) return 'no_tokens';
    let failure: string | null = null;
    for (let start = 0; start < delivery.tokens.length; start += batchSize) {
      const batch = delivery.tokens.slice(start, start + batchSize).map(to => ({ to, title: delivery.title, body: delivery.body, sound: 'default' }));
      const response = await fetcher(expoEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(batch) });
      if (!response.ok) {
        failure = `expo_http_${response.status}`;
        continue;
      }
      const payload = await response.json() as { data?: Ticket[] };
      const rejected = (payload.data ?? []).find(ticket => ticket.status !== 'ok');
      if (rejected) failure = typeof rejected.message === 'string' ? rejected.message.slice(0, 160) : 'expo_ticket_error';
    }
    return failure;
  };

  return async function handle(request: Request): Promise<Response> {
    if (request.method !== 'POST') return respond(405, { error: 'Method not allowed.' });
    if (!secret || !baseUrl || !serviceKey) {
      log({ event: 'push_dispatch_misconfigured' });
      return respond(503, { error: 'Push delivery is not configured.' });
    }
    if (!constantTimeEqual(request.headers.get('x-dispatch-secret') ?? '', secret)) return respond(401, { error: 'Unauthorized.' });

    let claimed: unknown;
    try {
      claimed = await rpc('claim_push_deliveries', { p_limit: 100 });
    } catch {
      log({ event: 'push_claim_failed' });
      return respond(502, { error: 'Could not claim deliveries.' });
    }
    const deliveries = Array.isArray(claimed) ? claimed.filter(isDelivery) : [];

    let sent = 0;
    let failed = 0;
    for (const delivery of deliveries) {
      let failure: string | null;
      try {
        failure = await sendToExpo(delivery);
      } catch {
        failure = 'expo_unreachable';
      }
      try {
        await rpc('finish_push_delivery', { p_notification_id: delivery.notification_id, p_error: failure });
      } catch {
        log({ event: 'push_finish_failed', notification_id: delivery.notification_id });
      }
      if (failure === null) sent += 1;
      else failed += 1;
    }
    log({ event: 'push_dispatch_done', claimed: deliveries.length, sent, failed });
    return respond(200, { claimed: deliveries.length, sent, failed });
  };
}
