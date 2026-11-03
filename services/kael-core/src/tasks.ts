import type { KaelTaskStatus, KaelTaskView } from './events.ts';

export const taskTransitions: Readonly<Record<KaelTaskStatus, readonly KaelTaskStatus[]>> = {
  pending: ['running', 'waiting_for_input', 'cancelled'],
  running: ['waiting_for_input', 'waiting_for_approval', 'paused', 'completed', 'failed', 'cancelled'],
  waiting_for_input: ['running', 'waiting_for_approval', 'paused', 'cancelled'],
  waiting_for_approval: ['running', 'waiting_for_input', 'paused', 'cancelled'],
  paused: ['running', 'waiting_for_input', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

export const modelSettableStatuses: readonly KaelTaskStatus[] = ['running', 'waiting_for_input', 'paused', 'completed', 'failed', 'cancelled'];

export const taskKinds = ['general', 'service_request', 'customer_lookup', 'worker_assist', 'research', 'writing'] as const;

export type TaskKind = typeof taskKinds[number];

export type TaskArtifact = {
  draft?: { description: string; location: string; preferred_time: string; missing: string[] };
  effect_required?: boolean;
  effect_result?: { status: 'succeeded'; resource_kind: string; resource_id: string };
};

export type TaskRecord = KaelTaskView & { conversation_id: string; artifact: TaskArtifact; updated_at: string };

export function canTransition(from: KaelTaskStatus, to: KaelTaskStatus): boolean {
  return from === to || taskTransitions[from].includes(to);
}

export function isTerminal(status: KaelTaskStatus): boolean {
  return taskTransitions[status].length === 0;
}

export type TransitionCheck = { ok: true } | { ok: false; reason: 'invalid_transition' | 'not_model_settable' | 'effect_not_observed' };

export function checkModelTransition(task: TaskRecord, to: KaelTaskStatus): TransitionCheck {
  if (!modelSettableStatuses.includes(to)) return { ok: false, reason: 'not_model_settable' };
  if (task.status === 'waiting_for_approval' && to === 'running') return { ok: false, reason: 'not_model_settable' };
  if (!canTransition(task.status, to)) return { ok: false, reason: 'invalid_transition' };
  if (to === 'completed' && task.artifact.effect_required && task.artifact.effect_result?.status !== 'succeeded') {
    return { ok: false, reason: 'effect_not_observed' };
  }
  return { ok: true };
}

export function toTaskView(task: TaskRecord): KaelTaskView {
  return { id: task.id, title: task.title, kind: task.kind, status: task.status, version: task.version, summary: task.summary };
}
