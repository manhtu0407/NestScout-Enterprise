import { workflowErrorFrom } from '@/features/shared';
import { authenticatedRequest } from '@/lib/authenticated-rest';

export type ServiceRequest = { id: string; description: string; created_at: string };
export type ServiceQuote = {
  id: string;
  request_id: string;
  version: number;
  scope: string;
  amount_minor: number;
  currency: 'VND';
  expires_at: string;
  accepted_at: string | null;
  rejected_at: string | null;
};

export async function readRequests(userId: string, signal: AbortSignal): Promise<ServiceRequest[]> {
  const response = await authenticatedRequest(userId, 'service_requests?select=id,description,created_at&order=created_at.desc', { signal });
  if (!response.ok) throw new Error('Could not read requests');
  const result: unknown = await response.json();
  if (!Array.isArray(result) || !result.every((row: unknown) => {
    if (typeof row !== 'object' || row === null) return false;
    const item = row as Record<string, unknown>;
    return typeof item.id === 'string' && typeof item.description === 'string' && typeof item.created_at === 'string';
  })) throw new Error('Invalid request response');
  return result as ServiceRequest[];
}

export async function submitRequest(userId: string, key: string, description: string, signal: AbortSignal): Promise<string> {
  const response = await authenticatedRequest(userId, 'rpc/submit_service_request', {
    method: 'POST',
    signal,
    body: JSON.stringify({ p_submission_key: key, p_description: description }),
  });
  if (!response.ok) throw await workflowErrorFrom(response);
  const result: unknown = await response.json();
  if (typeof result !== 'string') throw new Error('Invalid submission response');
  return result;
}

export async function readQuotes(userId: string, signal: AbortSignal): Promise<ServiceQuote[]> {
  const response = await authenticatedRequest(userId, 'service_quotes?select=id,request_id,version,scope,amount_minor,currency,expires_at,accepted_at,rejected_at', { signal });
  if (!response.ok) throw new Error('Could not read quotes');
  const result: unknown = await response.json();
  if (!Array.isArray(result) || !result.every((row: unknown) => {
    if (typeof row !== 'object' || row === null) return false;
    const item = row as Record<string, unknown>;
    return typeof item.id === 'string' && typeof item.request_id === 'string' && Number.isSafeInteger(item.version)
      && typeof item.scope === 'string' && Number.isSafeInteger(item.amount_minor) && item.currency === 'VND'
      && typeof item.expires_at === 'string' && (item.accepted_at === null || typeof item.accepted_at === 'string')
      && (item.rejected_at === null || typeof item.rejected_at === 'string');
  })) throw new Error('Invalid quote response');
  return result as ServiceQuote[];
}

export async function acceptQuote(userId: string, quoteId: string, version: number, signal: AbortSignal): Promise<string> {
  const response = await authenticatedRequest(userId, 'rpc/accept_service_quote', {
    method: 'POST',
    signal,
    body: JSON.stringify({ p_quote_id: quoteId, p_version: version }),
  });
  if (!response.ok) throw await workflowErrorFrom(response);
  const result: unknown = await response.json();
  if (result !== quoteId) throw new Error('Invalid acceptance response');
  return result;
}

export async function rejectQuote(userId: string, quoteId: string, version: number, signal: AbortSignal): Promise<string> {
  const response = await authenticatedRequest(userId, 'rpc/reject_service_quote', {
    method: 'POST', signal, body: JSON.stringify({ p_quote_id: quoteId, p_version: version }),
  });
  if (!response.ok) throw await workflowErrorFrom(response);
  const result: unknown = await response.json();
  if (result !== quoteId) throw new Error('Invalid rejection response');
  return result;
}
