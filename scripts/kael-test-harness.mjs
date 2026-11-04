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

const reconcilableStatuses = ['running', 'paused', 'waiting_for_input', 'cancelled', 'failed'];
const unresolved = approval => approval.status === 'consumed' && (approval.outcome === null || approval.outcome === 'uncertain');
const inFlight = (db, runId, except = null) => runId !== except && db.runs.get(runId)?.status === 'running';
const effectUnresolved = (db, owner, tool, except = null) => [...db.approvals.values()].some(item => item.owner === owner && item.tool === tool && item.id !== except && unresolved(item));

export function conversationState(db, owner, mode) {
  const conversation = [...db.conversations.values()].filter(item => item.owner === owner && item.mode === mode).at(-1) ?? null;
  const approvals = [...db.approvals.values()].filter(approval => {
    const task = db.tasks.get(approval.task_id);
    if (approval.owner !== owner || task.owner !== owner || db.conversations.get(task.conversation_id)?.mode !== mode) return false;
    if (approval.status === 'pending') {
      return task.conversation_id === conversation?.id && Date.parse(approval.expires_at) > Date.now() && task.status === 'waiting_for_approval' && task.version === approval.task_version;
    }
    return unresolved(approval) && !inFlight(db, approval.effect_run_id) && reconcilableStatuses.includes(task.status);
  }).sort((a, b) => Number(b.status === 'consumed') - Number(a.status === 'consumed')).slice(0, 12).map(approval => ({
    id: approval.id, task_id: approval.task_id, tool: approval.tool, summary: approval.summary, details: clone(approval.details), fingerprint: approval.fingerprint,
    kind: approval.status === 'pending' ? 'confirm' : 'reconcile', expires_at: approval.status === 'pending' ? approval.expires_at : null,
  }));
  if (!conversation) return { conversation_id: null, busy: false, messages: [], tasks: [], approvals };
  const busy = [...db.runs.values()].some(run => run.conversation_id === conversation.id && run.status === 'running');
  const tasks = [...db.tasks.values()].filter(task => task.owner === owner && task.conversation_id === conversation.id);
  return {
    conversation_id: conversation.id,
    busy,
    messages: db.messages.filter(m => m.conversation_id === conversation.id && m.owner === owner).map(m => ({ id: m.id, role: m.role, content: m.content, status: m.status })),
    tasks: tasks.map(task => ({ id: task.id, title: task.title, kind: task.kind, status: task.status, version: task.version, summary: task.summary })),
    approvals,
  };
}

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
      db.messages.push({ id: randomUUID(), conversation_id: conversation, owner, run_id: run.id, role: 'user', content: userText.trim(), status: 'complete' });
      return { status: 'started', run_id: run.id, conversation_id: conversation };
    },
    async finishRun(input) {
      const run = runningRun(input.runId);
      if (!run) return;
      Object.assign(run, { status: input.status, provider: input.provider, steps: input.steps, error: input.error });
      if (input.text.trim()) db.messages.push({ id: randomUUID(), conversation_id: run.conversation_id, owner, run_id: run.id, role: 'assistant', content: input.text.trim(), status: input.complete && input.status === 'completed' ? 'complete' : 'incomplete' });
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
      if (!runningRun(input.runId)) return { status: 'invalid' };
      if (effectUnresolved(db, owner, input.tool)) return { status: 'unresolved' };
      const task = ownTask(input.taskId);
      if (!task || task.kind !== 'service_request' || !['running', 'waiting_for_input'].includes(task.status)) return { status: 'invalid' };
      if (task.version !== input.expectedVersion) return { status: 'stale' };
      const draft = task.artifact.draft;
      if (!draft || draft.missing.length > 0 || input.args.description !== draft.description || input.args.location !== draft.location || input.args.preferred_time !== draft.preferred_time) return { status: 'invalid' };
      for (const approval of db.approvals.values()) if (approval.task_id === task.id && approval.status === 'pending') approval.status = 'superseded';
      touch(task, 'waiting_for_approval', 'Đang chờ bạn xác nhận gửi yêu cầu');
      const approval = { id: randomUUID(), owner, task_id: task.id, tool: input.tool, args: clone(input.args), fingerprint: input.fingerprint, summary: input.summary, details: clone(input.details), task_version: task.version, status: 'pending', outcome: null, result: null, effect_run_id: null, effect_task_version: null, expires_at: new Date(Date.now() + input.ttlSeconds * 1000).toISOString() };
      db.approvals.set(approval.id, approval);
      return { status: 'ok', approval_id: approval.id, expires_at: approval.expires_at, task: taskJson(task) };
    },
    async consumeApproval(runId, id, fingerprint, allowedTools, intent) {
      const approval = db.approvals.get(id);
      const run = runningRun(runId);
      if (!approval || approval.owner !== owner || !run || !['approve', 'reconcile'].includes(intent)) return { status: 'invalid' };
      const task = db.tasks.get(approval.task_id);
      if ((intent === 'approve' && task.conversation_id !== run.conversation_id)
        || db.conversations.get(task.conversation_id)?.mode !== db.conversations.get(run.conversation_id)?.mode) return { status: 'invalid' };
      if (approval.fingerprint !== fingerprint) return { status: 'mismatch' };
      if (intent === 'reconcile' && approval.status !== 'consumed') return { status: 'unconfirmed' };
      if (!allowedTools.includes(approval.tool)) return { status: 'unavailable' };
      const view = { tool: approval.tool, args: clone(approval.args), task_id: task.id, summary: approval.summary, details: clone(approval.details) };
      if (approval.status === 'consumed') {
        if (approval.outcome === null || approval.outcome === 'uncertain') {
          if (inFlight(db, approval.effect_run_id, run.id)) return { status: 'busy' };
          if (!reconcilableStatuses.includes(task.status)) return { status: 'stale' };
          if (task.status === 'paused' || task.status === 'waiting_for_input') touch(task, 'running', 'Đang kiểm tra lại yêu cầu đã được xác nhận');
          Object.assign(approval, { effect_run_id: run.id, effect_task_version: task.version });
          return { status: 'reconcile', ...view };
        }
        return { status: 'consumed', outcome: approval.outcome, result: clone(approval.result), task_id: task.id };
      }
      if (approval.status === 'rejected') return { status: 'rejected' };
      if (approval.status !== 'pending') return { status: approval.status === 'expired' ? 'expired' : 'stale' };
      if (Date.parse(approval.expires_at) <= Date.now()) { approval.status = 'expired'; return { status: 'expired' }; }
      if (task.version !== approval.task_version || task.status !== 'waiting_for_approval') { approval.status = 'superseded'; return { status: 'stale' }; }
      if (effectUnresolved(db, owner, approval.tool, approval.id)) return { status: 'unresolved' };
      touch(task, 'running', 'Đang gửi yêu cầu đã được xác nhận');
      Object.assign(approval, { status: 'consumed', effect_run_id: run.id, effect_task_version: task.version });
      return { status: 'ok', ...view };
    },
    async completeApproval(runId, id, outcome, result) {
      const approval = db.approvals.get(id);
      const run = runningRun(runId);
      if (!approval || approval.owner !== owner || approval.status !== 'consumed' || !run || approval.effect_run_id !== run.id) return { status: 'invalid' };
      const task = db.tasks.get(approval.task_id);
      if (approval.outcome === 'succeeded' || approval.outcome === 'failed') return { status: 'final', outcome: approval.outcome, result: clone(approval.result), task: taskJson(task) };
      let verified = outcome;
      const created = db.requests.get(result.resource_id);
      if (outcome === 'succeeded' && (created?.owner !== owner || created?.key !== id)) verified = 'uncertain';
      const target = verified === 'succeeded' ? 'completed' : verified === 'failed' ? 'waiting_for_input' : 'paused';
      const closed = task.status === 'cancelled' || task.status === 'failed';
      if (task.version !== approval.effect_task_version || !(closed || task.status === 'running') || (!closed && !canTransition(task.status, target))) {
        approval.outcome = 'uncertain';
        approval.result = { reason: 'task_changed' };
        return { status: 'conflict', outcome: 'uncertain', result: clone(approval.result), task: taskJson(task) };
      }
      approval.outcome = verified;
      approval.result = verified === 'succeeded' ? { resource_kind: 'service_request', resource_id: result.resource_id } : { reason: outcome === 'succeeded' ? 'unverified_result' : result.reason ?? 'unverified_result' };
      if (closed) {
        if (verified === 'succeeded') {
          task.artifact.effect_result = { status: 'succeeded', resource_kind: 'service_request', resource_id: result.resource_id };
          touch(task, task.status);
        }
        return { status: 'ok', outcome: verified, result: clone(approval.result), task: taskJson(task) };
      }
      if (verified === 'succeeded') {
        task.artifact.effect_result = { status: 'succeeded', resource_kind: 'service_request', resource_id: result.resource_id };
        touch(task, 'completed', 'Đã gửi yêu cầu dịch vụ; chưa có thợ hay lịch hẹn được xác nhận');
      } else if (verified === 'failed') touch(task, 'waiting_for_input', 'Hệ thống chưa nhận yêu cầu; bản nháp vẫn được giữ');
      else touch(task, 'paused', 'Chưa xác định được kết quả gửi; có thể xác nhận lại an toàn');
      return { status: 'ok', outcome: verified, result: clone(approval.result), task: taskJson(task) };
    },
    async rejectApproval(runId, id, fingerprint) {
      const approval = db.approvals.get(id);
      const run = runningRun(runId);
      if (!approval || approval.owner !== owner || !run) return { status: 'invalid' };
      const task = db.tasks.get(approval.task_id);
      if (task.conversation_id !== run.conversation_id) return { status: 'invalid' };
      if (approval.fingerprint !== fingerprint) return { status: 'mismatch' };
      if (approval.status !== 'pending') return { status: ['rejected', 'consumed', 'expired'].includes(approval.status) ? approval.status : 'stale' };
      if (Date.parse(approval.expires_at) <= Date.now()) { approval.status = 'expired'; return { status: 'expired' }; }
      approval.status = 'rejected';
      if (task.status === 'waiting_for_approval' && task.version === approval.task_version) touch(task, 'waiting_for_input', 'Bạn đã dừng bước gửi; bản nháp vẫn được giữ');
      return { status: 'ok', task: taskJson(task) };
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
    if (url.pathname === '/rest/v1/rpc/kael_knowledge_search') return fixtures.knowledge ? fixtures.knowledge(JSON.parse(init.body), user, init) : json(404, {});
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
        provider: id, model: step.servedModel ?? `${id}-scripted`, requestedModel: `${id}-scripted`, text: [...(step.partial ?? []), ...(step.text ?? [])].join(''), toolCalls: tools,
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

export function harness({ env = {}, providers = () => [], fixtures = {}, db = createDb(), wrapStore = store => store, wrapFetcher = fetcher => fetcher } = {}) {
  const service = backend(db, fixtures);
  const logs = [];
  const handle = createKaelHandler({
    env: { ...baseEnv, ...env },
    fetcher: wrapFetcher(service.fetcher),
    now: () => new Date('2026-11-03T03:00:00Z'),
    log: event => logs.push(event),
    providers,
    store: (_rest, userId) => wrapStore(memoryStore(db, userId)),
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
  async function reconcile(user, conversation, approval, fingerprint = approval.fingerprint) {
    return send(user, { request_id: randomUUID(), conversation_id: conversation, mode: 'client', action: { type: 'reconcile', approval_id: approval.id, fingerprint } });
  }
  return { db, service, handle, send, message, decide, reconcile, logs };
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
