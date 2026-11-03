export const kaelTaskStatuses = ['pending', 'running', 'waiting_for_input', 'waiting_for_approval', 'paused', 'completed', 'failed', 'cancelled'] as const;
export type KaelTaskStatus = typeof kaelTaskStatuses[number];

export type KaelTask = { id: string; title: string; kind: string; status: KaelTaskStatus; version: number; summary: string };

export type KaelApproval = {
  id: string;
  task_id: string;
  tool: string;
  summary: string;
  details: Record<string, string>;
  fingerprint: string;
  expires_at: string;
};

export const kaelToolOutcomes = ['succeeded', 'failed', 'denied', 'approval_required', 'unavailable'] as const;
export type KaelToolOutcome = typeof kaelToolOutcomes[number];

export const kaelFailureCodes = [
  'unauthenticated', 'invalid_request', 'rate_limited', 'busy', 'provider_unavailable', 'provider_error',
  'incomplete_output', 'budget_exhausted', 'approval_invalid', 'cancelled', 'internal',
] as const;
export type KaelFailureCode = typeof kaelFailureCodes[number];

export type KaelEventPayload =
  | { type: 'run_started'; conversation_id: string; request_id: string; replayed: boolean }
  | { type: 'message_delta'; text: string }
  | { type: 'tool_started'; call_id: string; tool: string; label: string }
  | { type: 'tool_completed'; call_id: string; tool: string; outcome: KaelToolOutcome; label: string }
  | { type: 'task_updated'; task: KaelTask }
  | { type: 'approval_required'; approval: KaelApproval }
  | { type: 'run_completed'; text: string }
  | { type: 'run_failed'; code: KaelFailureCode; message: string; retryable: boolean };

export type KaelEvent = KaelEventPayload & { v: 1; run_id: string; seq: number };

type Json = Record<string, unknown>;

const isText = (value: unknown, max = 32000): value is string => typeof value === 'string' && value.length <= max;
const isId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === 'string' && (values as readonly string[]).includes(value);

function parseTask(value: unknown): KaelTask | null {
  if (!isObject(value)) return null;
  const { id, title, kind, status, version, summary } = value;
  if (!isId(id) || !isText(title, 200) || !isText(kind, 40) || !oneOf(kaelTaskStatuses, status) || !Number.isSafeInteger(version) || !isText(summary, 600)) return null;
  return { id, title, kind, status, version: version as number, summary };
}

function parseApproval(value: unknown): KaelApproval | null {
  if (!isObject(value) || !isObject(value.details)) return null;
  const { id, task_id, tool, summary, fingerprint, expires_at } = value;
  const details = Object.entries(value.details);
  if (!isId(id) || !isId(task_id) || !isText(tool, 64) || !isText(summary, 200) || typeof fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(fingerprint)
    || !isText(expires_at, 40) || details.length > 12 || !details.every(([key, item]) => isText(key, 60) && isText(item, 4000))) return null;
  return { id, task_id, tool, summary, fingerprint, expires_at, details: Object.fromEntries(details) as Record<string, string> };
}

function parsePayload(value: Json): KaelEventPayload | null {
  switch (value.type) {
    case 'run_started':
      return isId(value.conversation_id) && isId(value.request_id) && typeof value.replayed === 'boolean'
        ? { type: 'run_started', conversation_id: value.conversation_id, request_id: value.request_id, replayed: value.replayed } : null;
    case 'message_delta':
      return isText(value.text) ? { type: 'message_delta', text: value.text } : null;
    case 'tool_started':
      return isText(value.call_id, 200) && isText(value.tool, 64) && isText(value.label, 120)
        ? { type: 'tool_started', call_id: value.call_id, tool: value.tool, label: value.label } : null;
    case 'tool_completed':
      return isText(value.call_id, 200) && isText(value.tool, 64) && isText(value.label, 120) && oneOf(kaelToolOutcomes, value.outcome)
        ? { type: 'tool_completed', call_id: value.call_id, tool: value.tool, outcome: value.outcome, label: value.label } : null;
    case 'task_updated': {
      const task = parseTask(value.task);
      return task ? { type: 'task_updated', task } : null;
    }
    case 'approval_required': {
      const approval = parseApproval(value.approval);
      return approval ? { type: 'approval_required', approval } : null;
    }
    case 'run_completed':
      return isText(value.text, 64000) ? { type: 'run_completed', text: value.text } : null;
    case 'run_failed':
      return oneOf(kaelFailureCodes, value.code) && isText(value.message, 500) && typeof value.retryable === 'boolean'
        ? { type: 'run_failed', code: value.code, message: value.message, retryable: value.retryable } : null;
    default:
      return null;
  }
}

export function parseKaelEvent(line: string): KaelEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isObject(value) || value.v !== 1 || !isId(value.run_id) || !Number.isSafeInteger(value.seq) || (value.seq as number) < 1) return null;
  const payload = parsePayload(value);
  return payload ? { ...payload, v: 1, run_id: value.run_id, seq: value.seq as number } : null;
}
