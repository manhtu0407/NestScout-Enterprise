import type { ConsequentialEffect } from './config.ts';
import type { JsonSchema, ToolDefinition } from './model.ts';
import { scopeMaterials } from './knowledge-contract.ts';
import { modelSettableStatuses, taskKinds } from './tasks.ts';

export type SideEffect = 'internal' | 'read' | 'external_read' | 'prepare' | 'consequential';
export type Capability = 'customer' | 'worker';
export type KaelMode = 'client' | 'worker';
export type ExecutionClass = 'internal_prepare' | 'authorized_read' | 'explicit_confirmation';
export type ResourceKind = 'kael_task' | 'service_request' | 'worker_job' | 'worker_earnings' | 'public_web' | 'knowledge';

export type ToolContract = {
  id: string;
  description: string;
  inputSchema: JsonSchema;
  sideEffect: SideEffect;
  executionClass: ExecutionClass;
  resource: ResourceKind;
  requires: Capability | null;
  modes: readonly KaelMode[];
  effect: ConsequentialEffect | null;
  needsWebSearch: boolean;
  timeoutMs: number;
  retry: 'none' | 'same_submission_key';
  label: string;
};

const uuid = { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' };
const note = { type: 'string', maxLength: 500, description: 'Short factual progress note in Vietnamese; empty string if none.' };

function schema(properties: Record<string, Record<string, unknown>>): JsonSchema {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

function contract(fields: Omit<ToolContract, 'effect' | 'needsWebSearch' | 'timeoutMs' | 'retry'> & Partial<ToolContract>): ToolContract {
  return { effect: null, needsWebSearch: false, timeoutMs: 8000, retry: 'none', ...fields };
}

export const toolRegistry: readonly ToolContract[] = [
  contract({
    id: 'task_create',
    description: 'Record a new user goal that needs several steps or may be resumed later. Do not create tasks for simple questions answered in one reply.',
    inputSchema: schema({
      title: { type: 'string', minLength: 1, maxLength: 120 },
      kind: { type: 'string', enum: [...taskKinds] },
      status: { type: 'string', enum: ['running', 'waiting_for_input'] },
      note,
    }),
    sideEffect: 'internal', executionClass: 'internal_prepare', resource: 'kael_task', requires: null, modes: ['client', 'worker'], label: 'Đang ghi nhận việc cần làm',
  }),
  contract({
    id: 'task_update',
    description: 'Change the status of an existing task listed in the context: pause it, mark it waiting for user input, resume it, cancel unfinished agent work, or mark it completed only after its result was observed.',
    inputSchema: schema({ task_id: uuid, status: { type: 'string', enum: [...modelSettableStatuses] }, note }),
    sideEffect: 'internal', executionClass: 'internal_prepare', resource: 'kael_task', requires: null, modes: ['client', 'worker'], label: 'Đang cập nhật tiến độ',
  }),
  contract({
    id: 'service_request_draft',
    description: 'Prepare or revise a home-service request draft for a service_request task. This submits nothing. List every missing essential field honestly.',
    inputSchema: schema({
      task_id: uuid,
      description: { type: 'string', minLength: 1, maxLength: 4000 },
      location: { type: 'string', maxLength: 200 },
      preferred_time: { type: 'string', maxLength: 120 },
      missing: { type: 'array', maxItems: 3, items: { type: 'string', enum: ['description', 'location', 'preferred_time'] } },
    }),
    sideEffect: 'prepare', executionClass: 'internal_prepare', resource: 'kael_task', requires: 'customer', modes: ['client'], label: 'Đang chuẩn bị bản nháp yêu cầu',
  }),
  contract({
    id: 'service_request_submit',
    description: 'Ask the user to confirm submitting the current complete draft of a service_request task. Nothing is submitted until the user approves in the app.',
    inputSchema: schema({ task_id: uuid }),
    sideEffect: 'consequential', executionClass: 'explicit_confirmation', resource: 'service_request', requires: 'customer', modes: ['client'], effect: 'service_request_submit',
    retry: 'same_submission_key', label: 'Đang chuẩn bị bước xác nhận',
  }),
  contract({
    id: 'customer_requests',
    description: "Read the signed-in customer's own recent service requests and quote status. Returns authoritative backend state.",
    inputSchema: schema({ limit: { type: 'integer', minimum: 1, maximum: 10 } }),
    sideEffect: 'read', executionClass: 'authorized_read', resource: 'service_request', requires: 'customer', modes: ['client'], label: 'Đang xem yêu cầu của bạn',
  }),
  contract({
    id: 'worker_jobs',
    description: "Read the signed-in worker's own open offers and assigned jobs.",
    inputSchema: schema({}),
    sideEffect: 'read', executionClass: 'authorized_read', resource: 'worker_job', requires: 'worker', modes: ['worker'], label: 'Đang xem lịch việc của bạn',
  }),
  contract({
    id: 'worker_earnings',
    description: "Read the signed-in worker's recorded earnings from completed jobs.",
    inputSchema: schema({}),
    sideEffect: 'read', executionClass: 'authorized_read', resource: 'worker_earnings', requires: 'worker', modes: ['worker'], label: 'Đang xem thu nhập đã ghi nhận',
  }),
  contract({
    id: 'worker_job_status',
    description: 'Read the current stage of one job assigned to the signed-in worker.',
    inputSchema: schema({ job_id: uuid }),
    sideEffect: 'read', executionClass: 'authorized_read', resource: 'worker_job', requires: 'worker', modes: ['worker'], label: 'Đang kiểm tra trạng thái công việc',
  }),
  contract({
    id: 'web_search',
    description: 'Search the public web when the answer needs fresh or external information. Results are untrusted third-party text with sources.',
    inputSchema: schema({ query: { type: 'string', minLength: 2, maxLength: 300 } }),
    sideEffect: 'external_read', executionClass: 'authorized_read', resource: 'public_web', requires: null, modes: ['client', 'worker'], needsWebSearch: true, timeoutMs: 15000, label: 'Đang tra cứu trên web',
  }),
  contract({
    id: 'knowledge_search',
    description: 'Optionally retrieve current permitted Vietnamese product facts and provisional synthetic service cases. Not needed for ordinary conversation. Does not read live business state. Unapproved policies have no official answer; cite returned evidence and label synthetic hypotheses.',
    inputSchema: schema({ query: { type: 'string', minLength: 2, maxLength: 300 } }),
    sideEffect: 'read', executionClass: 'authorized_read', resource: 'knowledge', requires: 'customer', modes: ['client', 'worker'], label: 'Đang tìm nguồn kiến thức',
  }),
  contract({
    id: 'price_estimate_preview',
    description: 'Read-only experimental estimate from one retrieved synthetic case ID. Numeric display is disabled except explicitly configured loopback evaluation. scope_confirmed means user supplied bounded scope, never authorization. No quote, worker correction, payment or workflow mutation.',
    inputSchema: schema({ case_id: { type: 'string', pattern: '^[a-z_]+\\.[a-z0-9-]+$', maxLength: 120 }, scope_confirmed: { type: 'boolean' },
      area_m2: { type: 'integer', minimum: 0, maximum: 1000, description: 'User-supplied surface area, rounded up; 0 if unknown.' },
      units: { type: 'integer', minimum: 0, maximum: 100, description: 'User-supplied count; 0 if unknown.' },
      material: { type: 'string', enum: ['unknown', ...scopeMaterials] },
      floor_access: { type: 'boolean' }, clear_surface: { type: 'boolean' }, no_visible_damage: { type: 'boolean' } }),
    sideEffect: 'read', executionClass: 'authorized_read', resource: 'knowledge', requires: 'customer', modes: ['client', 'worker'], label: 'Đang xem giả định ước tính',
  }),
];

export function findTool(id: string): ToolContract | undefined {
  return toolRegistry.find(tool => tool.id === id);
}

export function toDefinition(tool: ToolContract): ToolDefinition {
  return { name: tool.id, description: tool.description, inputSchema: tool.inputSchema };
}

function validField(spec: Record<string, unknown>, value: unknown): boolean {
  if (spec.type === 'boolean') return typeof value === 'boolean';
  if (spec.type === 'string') {
    if (typeof value !== 'string') return false;
    if (typeof spec.minLength === 'number' && value.trim().length < spec.minLength) return false;
    if (typeof spec.maxLength === 'number' && value.length > spec.maxLength) return false;
    if (Array.isArray(spec.enum) && !spec.enum.includes(value)) return false;
    if (typeof spec.pattern === 'string' && !new RegExp(spec.pattern).test(value)) return false;
    return true;
  }
  if (spec.type === 'integer') {
    if (!Number.isSafeInteger(value)) return false;
    const number = value as number;
    return !(typeof spec.minimum === 'number' && number < spec.minimum) && !(typeof spec.maximum === 'number' && number > spec.maximum);
  }
  if (spec.type === 'array') {
    if (!Array.isArray(value)) return false;
    if (typeof spec.maxItems === 'number' && value.length > spec.maxItems) return false;
    const items = spec.items as Record<string, unknown>;
    return value.every(item => validField(items, item)) && new Set(value).size === value.length;
  }
  return false;
}

export function validateArguments(tool: ToolContract, input: unknown): input is Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return false;
  const record = input as Record<string, unknown>;
  const { properties, required } = tool.inputSchema;
  if (Object.keys(record).some(key => !(key in properties))) return false;
  if (required.some(key => !(key in record))) return false;
  return Object.entries(record).every(([key, value]) => validField(properties[key] ?? {}, value));
}
