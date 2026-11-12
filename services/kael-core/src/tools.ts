import type { ConsequentialEffect } from './config.ts';
import type { JsonSchema, ToolDefinition } from './model.ts';
import { scopeMaterials } from './knowledge-contract.ts';
import { modelSettableStatuses, taskKinds } from './tasks.ts';

export type SideEffect = 'internal' | 'read' | 'external_read' | 'prepare' | 'consequential';
export type Capability = 'customer' | 'worker';
export type KaelMode = 'client' | 'worker';
export type ExecutionClass = 'internal_prepare' | 'authorized_read' | 'explicit_confirmation';
export type ResourceKind = 'kael_task' | 'service_request' | 'service_quote' | 'service_submission' | 'worker_offer' | 'worker_job' | 'worker_earnings' | 'public_web' | 'knowledge';

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
      service_id: { type: 'string', enum: ['electric', 'water', 'aircon', 'paint', 'sofa', 'other', ''], description: 'Service category of the work: electric, water, aircon, paint, sofa or other. Empty string only when the category is genuinely unknown.' },
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
    id: 'ask_user_choice',
    description: 'Show the user one short question with up to five tappable answers in the app, for example to collect a missing draft field or let the user pick between options you already explained. Set allow_date to let the user pick a day instead. The user answers in their next message, so end your reply right after calling it. Never use it to ask for confirmation of a business operation.',
    inputSchema: schema({
      question: { type: 'string', minLength: 3, maxLength: 200 },
      options: { type: 'array', maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 60 } },
      allow_date: { type: 'boolean' },
    }),
    sideEffect: 'internal', executionClass: 'internal_prepare', resource: 'kael_task', requires: null, modes: ['client', 'worker'], label: 'Đang chuẩn bị câu hỏi',
  }),
  contract({
    id: 'service_quote_decision',
    description: 'Ask the customer to confirm accepting or rejecting one current quote returned by customer_requests, inside an open workflow_action task. Nothing changes until the user confirms in the app. An accepted quote is an agreement on scope and price only: no worker, appointment or payment exists until backend data shows it.',
    inputSchema: schema({ task_id: uuid, quote_id: uuid, quote_version: { type: 'integer', minimum: 1, maximum: 1000 }, decision: { type: 'string', enum: ['accepted', 'rejected'] } }),
    sideEffect: 'consequential', executionClass: 'explicit_confirmation', resource: 'service_quote', requires: 'customer', modes: ['client'], effect: 'service_quote_decision',
    retry: 'same_submission_key', label: 'Đang chuẩn bị bước xác nhận báo giá',
  }),
  contract({
    id: 'work_submission_decision',
    description: "Ask the customer to confirm accepting submitted work or requesting a correction for a pending submission returned by customer_requests, inside an open workflow_action task. A correction needs a short reason in the user's own words; acceptance needs an empty reason. Accepting work is not a payment.",
    inputSchema: schema({
      task_id: uuid, submission_id: uuid, job_version: { type: 'integer', minimum: 1, maximum: 100000 },
      decision: { type: 'string', enum: ['accepted', 'revision_requested'] }, reason: { type: 'string', maxLength: 500 },
    }),
    sideEffect: 'consequential', executionClass: 'explicit_confirmation', resource: 'service_submission', requires: 'customer', modes: ['client'], effect: 'work_submission_decision',
    retry: 'same_submission_key', label: 'Đang chuẩn bị bước nghiệm thu',
  }),
  contract({
    id: 'worker_offer_decision',
    description: 'Ask the worker to confirm accepting or declining one open offer returned by worker_jobs, inside an open workflow_action task. Nothing changes until the worker confirms in the app; only one worker can win an assignment.',
    inputSchema: schema({
      task_id: uuid, invitation_id: uuid, quote_id: uuid, quote_version: { type: 'integer', minimum: 1, maximum: 1000 },
      decision: { type: 'string', enum: ['accept', 'decline'] },
    }),
    sideEffect: 'consequential', executionClass: 'explicit_confirmation', resource: 'worker_offer', requires: 'worker', modes: ['worker'], effect: 'worker_offer_decision',
    retry: 'same_submission_key', label: 'Đang chuẩn bị bước nhận việc',
  }),
  contract({
    id: 'worker_job_advance',
    description: 'Ask the worker to confirm moving one assigned job returned by worker_jobs to its next stage (assigned to en_route, en_route to arrived, arrived to working), using the version returned there, inside an open workflow_action task. Pausing, scope changes and submitting work stay in the Jobs screen.',
    inputSchema: schema({ task_id: uuid, job_id: uuid, version: { type: 'integer', minimum: 1, maximum: 100000 }, next: { type: 'string', enum: ['en_route', 'arrived', 'working'] } }),
    sideEffect: 'consequential', executionClass: 'explicit_confirmation', resource: 'worker_job', requires: 'worker', modes: ['worker'], effect: 'worker_job_advance',
    retry: 'same_submission_key', label: 'Đang chuẩn bị bước cập nhật tiến độ',
  }),
  contract({
    id: 'customer_requests',
    description: "Read the signed-in customer's own recent service requests with the current quote, assigned job stage and any work submission waiting for acceptance. Returns authoritative backend state.",
    inputSchema: schema({ limit: { type: 'integer', minimum: 1, maximum: 10 } }),
    sideEffect: 'read', executionClass: 'authorized_read', resource: 'service_request', requires: 'customer', modes: ['client'], label: 'Đang xem yêu cầu của bạn',
  }),
  contract({
    id: 'worker_jobs',
    description: "Read the signed-in worker's own open offers and assigned jobs with the ids, versions and stages needed for offer and progress decisions.",
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
