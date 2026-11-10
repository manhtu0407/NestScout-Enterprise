export const kaelTaskStatuses = ['pending', 'running', 'waiting_for_input', 'waiting_for_approval', 'paused', 'completed', 'failed', 'cancelled'] as const;
export type KaelTaskStatus = typeof kaelTaskStatuses[number];

export type KaelTask = { id: string; title: string; kind: string; status: KaelTaskStatus; version: number; summary: string };

export const kaelApprovalKinds = ['confirm', 'reconcile'] as const;

export type KaelApproval = {
  id: string;
  task_id: string;
  tool: string;
  summary: string;
  details: Record<string, string>;
  fingerprint: string;
  kind: typeof kaelApprovalKinds[number];
  expires_at: string | null;
};

export type KaelQuestion = { id: string; prompt: string; options: readonly string[]; date: boolean };

export const kaelToolOutcomes = ['succeeded', 'failed', 'denied', 'approval_required', 'unavailable', 'uncertain'] as const;
export type KaelToolOutcome = typeof kaelToolOutcomes[number];

export const kaelFailureCodes = [
  'unauthenticated', 'invalid_request', 'rate_limited', 'busy', 'provider_unavailable', 'provider_error',
  'incomplete_output', 'budget_exhausted', 'approval_invalid', 'consent_required', 'cancelled', 'internal',
] as const;
export type KaelFailureCode = typeof kaelFailureCodes[number];

export type KaelEventPayload =
  | { type: 'run_started'; conversation_id: string; request_id: string; replayed: boolean }
  | { type: 'message_delta'; text: string }
  | { type: 'tool_started'; call_id: string; tool: string; label: string }
  | { type: 'tool_completed'; call_id: string; tool: string; outcome: KaelToolOutcome; label: string }
  | { type: 'task_updated'; task: KaelTask }
  | { type: 'approval_required'; approval: KaelApproval }
  | { type: 'question'; question: KaelQuestion }
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
  const { id, task_id, tool, summary, fingerprint, kind, expires_at } = value;
  const details = Object.entries(value.details);
  if (!isId(id) || !isId(task_id) || !isText(tool, 64) || !isText(summary, 200) || typeof fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(fingerprint)
    || !oneOf(kaelApprovalKinds, kind) || (kind === 'confirm' ? !isText(expires_at, 40) : expires_at !== null) || details.length > 12 || !details.every(([key, item]) => isText(key, 60) && isText(item, 4000))) return null;
  return { id, task_id, tool, summary, fingerprint, kind, expires_at: expires_at as string | null, details: Object.fromEntries(details) as Record<string, string> };
}

function parseQuestion(value: unknown): KaelQuestion | null {
  if (!isObject(value) || !Array.isArray(value.options)) return null;
  const { id, prompt, options, date } = value;
  if (!isId(id) || !isText(prompt, 200) || prompt.trim() === '' || typeof date !== 'boolean' || options.length > 5
    || !options.every(option => isText(option, 60) && option.trim() !== '') || (options.length === 0 && !date)) return null;
  return { id, prompt, options: options as string[], date };
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
    case 'question': {
      const question = parseQuestion(value.question);
      return question ? { type: 'question', question } : null;
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

export type KaelSequenceVerdict = 'accept' | 'duplicate' | 'broken';

export function createKaelSequence(): (event: Pick<KaelEvent, 'run_id' | 'seq'>) => KaelSequenceVerdict {
  let runId: string | null = null;
  let last = 0;
  return event => {
    if (runId === null) {
      if (event.seq !== 1) return 'broken';
      runId = event.run_id;
      last = 1;
      return 'accept';
    }
    if (event.run_id !== runId) return 'broken';
    if (event.seq <= last) return 'duplicate';
    if (event.seq !== last + 1) return 'broken';
    last = event.seq;
    return 'accept';
  };
}

export type KaelStoredMessage = { id: string; role: 'user' | 'assistant'; text: string; incomplete: boolean };

export type KaelConversationSnapshot = {
  conversationId: string | null;
  busy: boolean;
  messages: KaelStoredMessage[];
  tasks: KaelTask[];
  approvals: KaelApproval[];
};

function parseStoredMessage(value: unknown): KaelStoredMessage | null {
  if (!isObject(value)) return null;
  const { id, role, content, status } = value;
  if (!isId(id) || (role !== 'user' && role !== 'assistant') || !isText(content) || (status !== 'complete' && status !== 'incomplete')) return null;
  return { id, role, text: content, incomplete: status === 'incomplete' };
}

function parseAll<T>(value: unknown, limit: number, parse: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > limit) return null;
  const parsed = value.map(parse);
  return parsed.every(item => item !== null) ? parsed as T[] : null;
}

export function parseKaelConversationSnapshot(value: unknown): KaelConversationSnapshot | null {
  if (!isObject(value) || typeof value.busy !== 'boolean') return null;
  const conversationId = value.conversation_id;
  if (conversationId !== null && !isId(conversationId)) return null;
  const messages = parseAll(value.messages, 60, parseStoredMessage);
  const tasks = parseAll(value.tasks, 12, parseTask);
  const approvals = parseAll(value.approvals, 12, parseApproval);
  if (!messages || !tasks || !approvals) return null;
  return { conversationId, busy: value.busy, messages, tasks, approvals };
}
