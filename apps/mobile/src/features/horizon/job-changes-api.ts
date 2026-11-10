import { decideJobChange, readJobChanges, requestJobChange } from '@/features/shared';

import type { JobChangesApi } from './job-change-panel';

export function jobChangesApiFor(userId: string): JobChangesApi {
  return {
    read: jobId => readJobChanges(userId, jobId, new AbortController().signal),
    request: (jobId, kind, proposedFor, reason) => requestJobChange(userId, jobId, kind, proposedFor, reason, new AbortController().signal),
    decide: (changeId, decision) => decideJobChange(userId, changeId, decision, new AbortController().signal),
  };
}
