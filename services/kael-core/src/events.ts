export const kaelProtocolVersion = 1;

export const kaelTaskStatuses = [
  'pending', 'running', 'waiting_for_input', 'waiting_for_approval', 'paused', 'completed', 'failed', 'cancelled',
] as const;

export type KaelTaskStatus = typeof kaelTaskStatuses[number];

export type KaelTaskView = {
  id: string;
  title: string;
  kind: string;
  status: KaelTaskStatus;
  version: number;
  summary: string;
};

export type KaelApprovalView = {
  id: string;
  task_id: string;
  tool: string;
  summary: string;
  details: Record<string, string>;
  fingerprint: string;
  expires_at: string;
};

export type KaelToolOutcome = 'succeeded' | 'failed' | 'denied' | 'approval_required' | 'unavailable';

export const kaelFailureCodes = [
  'unauthenticated', 'invalid_request', 'rate_limited', 'busy', 'provider_unavailable', 'provider_error',
  'incomplete_output', 'budget_exhausted', 'approval_invalid', 'cancelled', 'internal',
] as const;

export type KaelFailureCode = typeof kaelFailureCodes[number];

export type KaelEventBody =
  | { type: 'run_started'; conversation_id: string; request_id: string; replayed: boolean }
  | { type: 'message_delta'; text: string }
  | { type: 'tool_started'; call_id: string; tool: string; label: string }
  | { type: 'tool_completed'; call_id: string; tool: string; outcome: KaelToolOutcome; label: string }
  | { type: 'task_updated'; task: KaelTaskView }
  | { type: 'approval_required'; approval: KaelApprovalView }
  | { type: 'run_completed'; text: string }
  | { type: 'run_failed'; code: KaelFailureCode; message: string; retryable: boolean };

export type KaelEvent = KaelEventBody & { v: typeof kaelProtocolVersion; run_id: string; seq: number };

export type KaelEmitter = (event: KaelEventBody) => void;

export function isTerminalEvent(event: KaelEventBody): boolean {
  return event.type === 'run_completed' || event.type === 'run_failed';
}

export function encodeEvent(event: KaelEvent): string {
  return `${JSON.stringify(event)}\n`;
}
