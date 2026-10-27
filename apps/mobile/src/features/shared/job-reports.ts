import { authenticatedRequest } from '@/lib/authenticated-rest';

export type JobReport = { id: string; job_id: string; kind: 'delay' | 'customer_absent'; details: string };

export async function readJobReports(userId: string, jobIds: string[], signal: AbortSignal): Promise<JobReport[]> {
  if (!jobIds.length) return [];
  if (!jobIds.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw new Error('Invalid job identifier');
  const response = await authenticatedRequest(userId, `service_job_reports?select=id,job_id,kind,details&job_id=in.(${jobIds.join(',')})`, { signal });
  if (!response.ok) throw new Error('Reports unavailable');
  const result: unknown = await response.json();
  if (!Array.isArray(result) || !result.every((value: unknown) => {
    if (typeof value !== 'object' || value === null) return false;
    const row = value as Record<string, unknown>;
    return typeof row.id === 'string' && typeof row.job_id === 'string' && jobIds.includes(row.job_id)
      && (row.kind === 'delay' || row.kind === 'customer_absent') && typeof row.details === 'string';
  })) throw new Error('Invalid reports');
  return result as JobReport[];
}
