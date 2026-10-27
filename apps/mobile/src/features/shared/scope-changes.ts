import { authenticatedRequest } from '@/lib/authenticated-rest';

export type ScopeChange = {
  id: string;
  job_id: string;
  sequence: number;
  old_scope: string;
  old_amount_minor: number;
  new_scope: string;
  new_amount_minor: number;
  currency: 'VND';
  rationale: string;
  decision: 'pending' | 'approved' | 'rejected';
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readScopeChanges(userId: string, jobIds: string[], signal: AbortSignal): Promise<ScopeChange[]> {
  if (!jobIds.length) return [];
  if (!jobIds.every(id => uuid.test(id))) throw new Error('Invalid job identifier');
  const fields = 'id,job_id,sequence,old_scope,old_amount_minor,new_scope,new_amount_minor,currency,rationale,decision';
  const response = await authenticatedRequest(userId, `service_scope_changes?select=${fields}&job_id=in.(${jobIds.join(',')})`, { signal });
  if (!response.ok) throw new Error('Scope changes unavailable');
  const result: unknown = await response.json();
  if (!Array.isArray(result) || !result.every((value: unknown) => {
    if (typeof value !== 'object' || value === null) return false;
    const row = value as Record<string, unknown>;
    return typeof row.id === 'string' && typeof row.job_id === 'string' && jobIds.includes(row.job_id)
      && Number.isSafeInteger(row.sequence) && typeof row.old_scope === 'string' && typeof row.new_scope === 'string'
      && Number.isSafeInteger(row.old_amount_minor) && Number.isSafeInteger(row.new_amount_minor)
      && row.currency === 'VND' && typeof row.rationale === 'string'
      && ['pending', 'approved', 'rejected'].includes(String(row.decision));
  })) throw new Error('Invalid scope changes');
  return result as ScopeChange[];
}
