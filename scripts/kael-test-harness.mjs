import { randomUUID } from 'node:crypto';
import { createKaelHandler } from '../services/kael-core/src/gateway.ts';
import { ProviderError } from '../services/kael-core/src/model.ts';
import { canTransition, isTerminal } from '../services/kael-core/src/tasks.ts';
import { parseKaelEvent } from '../apps/mobile/src/features/shared/kael-events.ts';

export const users = {
  customer: { id: '00000000-0000-4000-8000-0000000000a1', token: 'token-customer-aaaaaaaaaaaaaaaaaaaa' },
  other: { id: '00000000-0000-4000-8000-0000000000b2', token: 'token-other-bbbbbbbbbbbbbbbbbbbbbbbbb' },
  worker: { id: '00000000-0000-4000-8000-0000000000c3', token: 'token-worker-cccccccccccccccccccccccc' },
};

export const baseEnv = { SUPABASE_URL: 'https://project.supabase.test', SUPABASE_ANON_KEY: 'anon-key-for-tests', SUPABASE_SERVICE_ROLE_KEY: 'server-key-for-tests' };

export function createDb() {
  return { conversations: new Map(), runs: new Map(), messages: [], tasks: new Map(), events: [], approvals: new Map(), tools: [], requests: new Map(), capabilities: new Map() };
}

const now = () => new Date().toISOString();
const clone = value => structuredClone(value);
const taskJson = task => clone({ id: task.id, conversation_id: task.conversation_id, title: task.title, kind: task.kind, status: task.status, version: task.version, summary: task.summary, artifact: task.artifact, updated_at: task.updated_at });

export function memoryStore(db, owner) {
  const runningRun = runId => {
    const run = db.runs.get(runId);
    return run && run.owner === owner && run.status === 'running' ? run : null;
  };
  const ownTask = id => {
    const task = db.tasks.get(id);
    return task && task.owner === owner ? task : null;
  };
  const touch = (task, status, summary) => {
    task.status = status;
    if (summary !== undefined) task.summary = summary;
    task.version += 1;
    task.updated_at = now();
  };
  return {
    async capabilities() {
      return new Set(db.capabilities.get(owner) ?? ['customer']);
    },
    async startRun(requestId, conversationId, mode, userText) {
      const existing = [...db.runs.values()].find(run => run.owner === owner && run.request_id === requestId);
      if (existing) {
        const reply = db.messages.filter(m => m.run_id === existing.id && m.role === 'assistant').at(-1);
        return { status: 'replay', run_id: existing.id, conversation_id: existing.conversation_id, run_status: existing.status, assistant_text: reply?.content ?? null };
      }
      if (!userText.trim()) return { status: 'invalid' };
      let conversation = conversationId;
      if (conversation === null) {
        conversation = randomUUID();
        db.conversations.set(conversation, { id: conversation, owner, mode });
      } else {
        const found = db.conversations.get(conversation);
        if (!found || found.owner !== owner || found.mode !== mode) return { status: 'invalid' };
        if ([...db.runs.values()].some(run => run.conversation_id === conversation && run.status === 'running')) return { status: 'busy' };
      }
      const run = { id: randomUUID(), owner, conversation_id: conversation, request_id: requestId, status: 'running' };
      db.runs.set(run.id, run);
      db.messages.push({ conversation_id: conversation, owner, run_id: run.id, role: 'user', content: userText.trim(), status: 'complete' });
      return { status: 'started', run_id: run.id, conversation_id: conversation };
    },
    async finishRun(input) {
      const run = runningRun(input.runId);
      if (!run) return;
      Object.assign(run, { status: input.status, provider: input.provider, steps: input.steps, error: input.error });
      if (input.text.trim()) db.messages.push({ conversation_id: run.conversation_id, owner, run_id: run.id, role: 'assistant', content: input.text.trim(), status: input.complete && input.status === 'completed' ? 'complete' : 'incomplete' });
    },
    async loadContext(conversationId, mode, limit) {
      const history = db.messages.filter(m => m.conversation_id === conversationId && m.owner === owner).slice(-limit).map(m => ({ role: m.role, content: m.content, status: m.status }));
      const tasks = [...db.tasks.values()].filter(task => task.owner === owner && db.conversations.get(task.conversation_id)?.mode === mode
        && (!isTerminal(task.status) || task.conversation_id === conversationId)).map(taskJson);
      return { history, tasks };
    },
    async saveTask(input) {
      const run = runningRun(input.runId);
      if (!run) return { status: 'not_found' };
      const artifact = clone(input.artifact);
      delete artifact.effect_required;
      delete artifact.effect_result;
      if (input.taskId === null) {
        if (!['pending', 'running', 'waiting_for_input'].includes(input.status) || input.conversationId !== run.conversation_id) return { status: 'invalid_transition' };
        if (input.kind === 'service_request') artifact.effect_required = true;
        const task = { id: randomUUID(), owner, conversation_id: run.conversation_id, title: input.title, kind: input.kind, status: input.status, version: 1, summary: input.summary, artifact, updated_at: now() };
        db.tasks.set(task.id, task);
        db.events.push({ task_id: task.id, event: input.event, to: task.status });
        return { status: 'ok', task: taskJson(task) };
      }
      const task = ownTask(input.taskId);
      if (!task) return { status: 'not_found' };
      if (task.version !== input.expectedVersion) return { status: 'conflict' };
      const from = task.status;
      if (!canTransition(from, input.status) || (input.status === 'waiting_for_approval' && from !== 'waiting_for_approval')
        || (from === 'waiting_for_approval' && input.status === 'running')
        || (input.status === 'completed' && from !== 'completed' && task.artifact.effect_required && task.artifact.effect_result?.status !== 'succeeded')) return { status: 'invalid_transition' };
      if (task.artifact.effect_required) artifact.effect_required = true;
      if (task.artifact.effect_result) artifact.effect_result = task.artifact.effect_result;
      task.title = input.title;
      task.artifact = artifact;
      touch(task, input.status, input.summary);
      db.events.push({ task_id: task.id, event: input.event, from, to: task.status });
      return { status: 'ok', task: taskJson(task) };
    },
    async recordTool(input) {
      if (!db.tools.some(row => row.runId === input.runId && row.callId === input.callId)) db.tools.push({ ...input, owner });
    },
    async requestApproval(input) {
      const task = ownTask(input.taskId);
      if (!runningRun(input.runId) || !task || task.kind !== 'service_request' || !['running', 'waiting_for_input'].includes(task.status)) return { status: 'invalid' };
      if (task.version !== input.expectedVersion) return { status: 'stale' };
      const draft = task.artifact.draft;
      if (!draft || draft.missing.length > 0 || input.args.description !== draft.description || input.args.location !== draft.location || input.args.preferred_time !== draft.preferred_time) return { status: 'invalid' };
      for (const approval of db.approvals.values()) if (approval.task_id === task.id && approval.status === 'pending') approval.status = 'superseded';
      touch(task, 'waiting_for_approval', 'Đang chờ bạn xác nhận gửi yêu cầu');
      const approval = { id: randomUUID(), owner, task_id: task.id, tool: input.tool, args: clone(input.args), fingerprint: input.fingerprint, task_version: task.version, status: 'pending', outcome: null, result: null, expires_at: new Date(Date.now() + input.ttlSeconds * 1000).toISOString() };
      db.approvals.set(approval.id, approval);
      return { status: 'ok', approval_id: approval.id, expires_at: approval.expires_at, task: taskJson(task) };
    },
    async consumeApproval(runId, id, fingerprint, allowedTools) {
      const approval = db.approvals.get(id);
      const run = runningRun(runId);
      if (!approval || approval.owner !== owner || !run) return { status: 'invalid' };
      const task = db.tasks.get(approval.task_id);
      if (task.conversation_id !== run.conversation_id) return { status: 'invalid' };
      if (approval.fingerprint !== fingerprint) return { status: 'mismatch' };
      if (!allowedTools.includes(approval.tool)) return { status: 'unavailable' };
      if (approval.status === 'consumed') {
        if (approval.outcome === null || approval.outcome === 'uncertain') {
          if (isTerminal(task.status)) return { status: 'stale' };
          if (task.status === 'paused') touch(task, 'running');
          return { status: 'reconcile', tool: approval.tool, args: clone(approval.args), task_id: task.id };
        }
        return { status: 'consumed', outcome: approval.outcome, result: clone(approval.result), task_id: task.id };
      }
      if (approval.status === 'rejected') return { status: 'rejected' };
      if (approval.status !== 'pending') return { status: approval.status === 'expired' ? 'expired' : 'stale' };
      if (Date.parse(approval.expires_at) <= Date.now()) { approval.status = 'expired'; return { status: 'expired' }; }
      if (task.version !== approval.task_version || task.status !== 'waiting_for_approval') { approval.status = 'superseded'; return { status: 'stale' }; }
      approval.status = 'consumed';
      touch(task, 'running', 'Đang gửi yêu cầu đã được xác nhận');
      return { status: 'ok', tool: approval.tool, args: clone(approval.args), task_id: task.id };
    },
    async completeApproval(id, outcome, result) {
      const approval = db.approvals.get(id);
      if (!approval || approval.owner !== owner || approval.status !== 'consumed') return null;
      let verified = outcome;
      const created = db.requests.get(result.resource_id);
      if (outcome === 'succeeded' && (created?.owner !== owner || created?.key !== id)) verified = 'uncertain';
      approval.outcome = verified;
      approval.result = verified === 'succeeded' ? { resource_kind: 'service_request', resource_id: result.resource_id } : { reason: result.reason ?? 'unverified_result' };
      const task = db.tasks.get(approval.task_id);
      if (task.status !== 'running') return taskJson(task);
      if (verified === 'succeeded') {
        task.artifact.effect_result = { status: 'succeeded', resource_kind: 'service_request', resource_id: result.resource_id };
        touch(task, 'completed', 'Đã gửi yêu cầu dịch vụ; chưa có thợ hay lịch hẹn được xác nhận');
      } else if (verified === 'failed') touch(task, 'waiting_for_input', 'Hệ thống chưa nhận yêu cầu; bản nháp vẫn được giữ');
      else touch(task, 'paused', 'Chưa xác định được kết quả gửi; có thể xác nhận lại an toàn');
      return taskJson(task);
    },
    async rejectApproval(id) {
      const approval = db.approvals.get(id);
      if (!approval || approval.owner !== owner || approval.status !== 'pending') return null;
      approval.status = 'rejected';
      const task = db.tasks.get(approval.task_id);
      if (task.status === 'waiting_for_approval' && task.version === approval.task_version) touch(task, 'waiting_for_input', 'Bạn đã dừng bước gửi; bản nháp vẫn được giữ');
      return taskJson(task);
    },
  };
}

export function backend(db, options = {}) {
  const calls = [];
  const fixtures = { requests: [], quotes: [], jobs: [], workerCards: [], earnings: [], search: null, ...options };
  const userFor = header => Object.values(users).find(user => header === `Bearer ${user.token}`);
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  async function fetcher(input, init = {}) {
    const url = new URL(String(input));
    const user = userFor(init.headers?.authorization ?? init.headers?.Authorization);
    calls.push({ path: url.pathname + url.search, method: init.method ?? 'GET', user: user?.id ?? null, body: init.body ? JSON.parse(init.body) : null });
    if (url.hostname === 'api.perplexity.ai') return fixtures.search ? fixtures.search(init) : json(500, {});
    if (url.pathname === '/auth/v1/user') return user ? json(200, { id: user.id, is_anonymous: false }) : json(401, {});
    if (!user) return json(401, {});
    if (url.pathname === '/rest/v1/service_requests') return json(200, fixtures.requests.filter(row => row.owner_id === user.id).map(({ owner_id: _owner, ...row }) => row));
    if (url.pathname === '/rest/v1/service_quotes') return json(200, fixtures.quotes.filter(row => fixtures.requests.some(r => r.id === row.request_id && r.owner_id === user.id)));
    if (url.pathname === '/rest/v1/service_jobs') return json(200, fixtures.jobs.filter(row => fixtures.requests.some(r => r.id === row.request_id && r.owner_id === user.id)));
    const worker = (db.capabilities.get(user.id) ?? []).includes('worker');
    if (url.pathname === '/rest/v1/rpc/worker_job_cards') return json(200, worker ? fixtures.workerCards : []);
    if (url.pathname === '/rest/v1/rpc/worker_earnings') return json(200, worker ? fixtures.earnings : []);
    if (url.pathname === '/rest/v1/rpc/kael_read_context') return json(200, worker ? { status: 'ok', state: 'assigned' } : { status: 'unavailable' });
    if (url.pathname === '/rest/v1/rpc/submit_service_request') {
      if (fixtures.submitFailure) return fixtures.submitFailure();
      const body = JSON.parse(init.body);
      const existing = [...db.requests.values()].find(row => row.owner === user.id && row.key === body.p_submission_key);
      if (existing) return json(200, existing.id);
      const id = randomUUID();
      db.requests.set(id, { id, owner: user.id, key: body.p_submission_key, description: body.p_description, location: body.p_location });
      return json(200, id);
    }
    return json(404, {});
  }
  return { fetcher, calls, fixtures };
}

export function scriptedProvider(id, steps) {
  const requests = [];
  return {
    id,
    model: `${id}-scripted`,
    requests,
    async complete(request, onText) {
      requests.push({ system: request.system, transcript: clone(request.transcript), tools: request.tools.map(tool => tool.name) });
      const next = steps.shift();
      if (!next) throw new Error('scripted provider exhausted');
      const step = typeof next === 'function' ? await next(request) : next;
      for (const chunk of step.partial ?? []) onText(chunk);
      if (step.error) throw new ProviderError(id, step.error, 'scripted failure', (step.partial ?? []).length > 0);
      for (const chunk of step.text ?? []) onText(chunk);
      const tools = step.tools ?? [];
      return {
        provider: id, model: `${id}-scripted`, text: [...(step.partial ?? []), ...(step.text ?? [])].join(''), toolCalls: tools,
        stopReason: step.stop ?? (tools.length > 0 ? 'tool_use' : 'end_turn'), usage: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 0 }, providerState: null,
      };
    },
  };
}

export function lastToolResults(request) {
  const item = [...request.transcript].reverse().find(entry => entry.role === 'tool');
  return item ? item.results.map(result => JSON.parse(result.content)) : [];
}

export function call(name, input, id = `call_${randomUUID().slice(0, 8)}`) {
  return { id, name, input };
}

export function harness({ env = {}, providers = () => [], fixtures = {}, db = createDb() } = {}) {
  const service = backend(db, fixtures);
  const handle = createKaelHandler({
    env: { ...baseEnv, ...env },
    fetcher: service.fetcher,
    now: () => new Date('2026-11-03T03:00:00Z'),
    log: () => {},
    providers,
    store: (_rest, userId) => memoryStore(db, userId),
  });
  async function send(user, body) {
    const response = await handle(new Request('https://edge.test/functions/v1/kael', {
      method: 'POST',
      headers: { authorization: `Bearer ${user.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    if (!response.headers.get('content-type')?.startsWith('application/x-ndjson')) return { status: response.status, error: await response.json(), events: [] };
    const lines = (await response.text()).split('\n').filter(Boolean);
    const events = lines.map(line => {
      const event = parseKaelEvent(line);
      if (!event) throw new Error(`Event rejected by the mobile contract parser: ${line}`);
      return event;
    });
    return { status: response.status, events, runId: response.headers.get('x-kael-run-id') };
  }
  async function message(user, text, { mode = 'client', conversation = null, requestId = randomUUID() } = {}) {
    return send(user, { request_id: requestId, conversation_id: conversation, mode, action: { type: 'message', text } });
  }
  async function decide(user, conversation, approval, approve = true, fingerprint = approval.fingerprint, mode = 'client') {
    return send(user, { request_id: randomUUID(), conversation_id: conversation, mode, action: { type: approve ? 'approve' : 'reject', approval_id: approval.id, fingerprint } });
  }
  return { db, service, handle, send, message, decide };
}

export function terminal(result) {
  return result.events.at(-1);
}

export function conversationOf(result) {
  return result.events.find(event => event.type === 'run_started')?.conversation_id ?? null;
}

export function effectsCount(db) {
  return db.requests.size;
}
