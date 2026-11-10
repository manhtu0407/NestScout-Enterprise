import { mkdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createKaelSequence, parseKaelConversationSnapshot, parseKaelEvent } from '../apps/mobile/src/features/shared/kael-events.ts';
import { createKaelHandler } from '../services/kael-core/src/gateway.ts';
import { call, lastToolResults, scriptedProvider } from './kael-test-harness.mjs';
import { applyPilotApproval } from './kael-developer-pilot.mjs';
import { knowledgeSeedSnapshot, knowledgeSources, knowledgeSnapshot } from '../services/kael-core/src/knowledge-sources.ts';
import { knowledgeSeedSql, localKnowledgeDatabase, sqlLiteral } from './kael-knowledge.mjs';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { localRuntime, withLocalLock } from './supabase-local.mjs';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { root } from './tool-path.mjs';
import { localTools } from './supabase-mcp.mjs';

const barrierKey = () => Number.parseInt(randomUUID().slice(0, 7), 16);
const holdBarrier = key => `select pg_advisory_xact_lock(1638597420, ${key}); select pg_sleep(8);`;

test('pilot budget serializes concurrent workers and retains held spend across worker restart', { timeout: 120000 }, async () => {
  await withLocalLock(async () => {
    const database = localKnowledgeDatabase();
    const actor = randomUUID();
    const conversation = randomUUID();
    const run = randomUUID();
    const pilot = randomUUID();
    const callA = randomUUID();
    const callB = randomUUID();
    const key = barrierKey();
    const session = { id: pilot, stack_id: 'integration-local', accounts: [{ id: actor }] };
    const now = Date.now();
    const approval = { approval_id: randomUUID(), pilot_id: pilot, approved_at: new Date(now).toISOString(),
      purpose: 'kael_developer_8085', provider: 'deepseek', model: 'deepseek-flash', owner_approved: true,
      cap_micro_usd: 1000000, max_calls: 3, expires_at: new Date(now + 1800000).toISOString(), rates_checked_at: new Date(now).toISOString(),
      rate_source: 'https://api-docs.deepseek.com/quick_start/pricing/', input_rate: 0.3, cached_rate: 0.006, output_rate: 1.2 };
    let generation;
    const charge = callId => `set local request.jwt.claims='{"role":"service_role"}';
      set local request.headers=${sqlLiteral(JSON.stringify(generation ? { 'x-kael-pilot-generation': generation } : {}))};
      select public.kael_pilot_charge('${pilot}','${actor}','${run}','${callId}','reserve',false,'deepseek-flash',0,0,0);`;
    let first;
    let second;
    try {
      database.query(`insert into auth.users (id,aud,role) values ('${actor}','authenticated','authenticated');
        insert into public.kael_conversations (id,owner_id,mode) values ('${conversation}','${actor}','client');
        insert into public.kael_runs (id,conversation_id,owner_id,request_id) values ('${run}','${conversation}','${actor}',gen_random_uuid());`);
      assert.throws(() => applyPilotApproval(database, session, { ...approval, owner_approved: false }), /owner authorization/);
      assert.equal(applyPilotApproval(database, session, approval), 'AUTHORIZED_DISABLED');
      assert.match(database.query(`begin; ${charge(callA)} rollback;`), /disabled_expired_or_halted/);
      assert.equal(database.query(`select nestscout_private.kael_pilot_arm('${pilot}','integration-local',${sqlLiteral(approval.approved_at)});`).trim(), 'BUDGET_ENABLED');
      assert.match(database.query(`begin; ${charge(callA)} rollback;`), /edge_authorization_mismatch/);
      generation = database.query(`select to_json(authorized_at)#>>'{}' from nestscout_private.kael_pilot_effective_budget where id='${pilot}';`).trim();
      first = database.concurrentTransaction(`${charge(callA)} ${holdBarrier(key)}`);
      await waitForBarrier(database.query, key);
      second = database.concurrentTransaction(charge(callB));
      first.commit();
      second.commit();
      assert.match(await first.done, /"ok": true/);
      assert.match(await second.done, /unreconciled_call/);
      assert.equal(database.query(`select count(*) from nestscout_private.kael_pilot_calls where pilot_id='${pilot}';`).trim(), '1');
      const restarted = localKnowledgeDatabase();
      assert.match(restarted.query(`begin; ${charge(randomUUID())} rollback;`), /unreconciled_call/);
      assert.throws(() => applyPilotApproval(restarted, session, approval), /APPROVAL_ALREADY_USED/);
      assert.equal(restarted.query(`select sum(reserved_micro_usd) from nestscout_private.kael_pilot_calls where pilot_id='${pilot}';`).trim(), '319488');
    } finally {
      first?.rollback();
      second?.rollback();
      await Promise.allSettled([first?.done, second?.done]);
      database.query(`delete from nestscout_private.kael_pilot_calls where pilot_id='${pilot}';
        delete from nestscout_private.kael_pilot_renewals where pilot_id='${pilot}';
        delete from nestscout_private.kael_pilot_budgets where id='${pilot}';
        delete from public.kael_runs where id='${run}'; delete from public.kael_conversations where id='${conversation}';
        delete from auth.users where id='${actor}';`);
    }
  });
});

async function waitForBarrier(query, key) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (query(`select pg_try_advisory_lock(1638597420, ${key});`).trim() === 'f') return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('The first transaction did not acquire its barrier');
}

test('real local MCP exposes diagnostics, queries catalogs and rejects migration tools', { timeout: 240000 }, async () => {
  const client = new Client({ name: 'nestscout-local-verification', version: '1.0.0' });
  try {
    await client.connect(new StdioClientTransport({
      command: process.execPath, args: ['scripts/supabase-mcp.mjs'], cwd: root, stderr: 'inherit',
    }), { timeout: 180000 });
    const inventory = await client.listTools();
    assert.deepEqual(inventory.tools.map(tool => tool.name).sort(), [...localTools].sort());
    const result = await client.callTool({ name: 'execute_sql', arguments: {
      query: "select count(*)::int as public_table_count from pg_catalog.pg_tables where schemaname = 'public'",
    } });
    assert.ok(!result.isError, 'Local catalog query failed.');
    assert.ok(result.content.some(item => item.type === 'text' && item.text.includes('public_table_count')));
    await assert.rejects(client.callTool({ name: 'apply_migration', arguments: {
      name: 'denied_metadata_probe', query: 'select 1;',
    } }), /outside the local allowlist/);
    const synthetic = '__audit_' + 'sensitive_identifier';
    const failure = await client.callTool({ name: 'execute_sql', arguments: {
      query: `select * from public.${synthetic}`,
    } }).then(result => ({ result }), error => ({ error }));
    assert.ok(failure.error || failure.result?.isError, 'Invalid SQL must propagate failure.');
    assert.ok(!JSON.stringify(failure.error?.message ?? failure.result).includes(synthetic), 'Upstream SQL error detail must not leak through MCP.');
  } finally {
    await client.close();
  }
});

test('overlapping submissions by one customer produce one durable request', async () => {
  await withLocalLock(async () => {
    const runtime = localRuntime();
    const stack = runtime.verify();
    const ids = execFileSync('docker', ['ps', '--filter', `label=com.supabase.stack=${stack.id}`, '--filter', 'label=com.supabase.service=database', '--format', '{{.ID}}'], { encoding: 'utf8' }).trim().split(/\s+/);
    assert.equal(ids.length, 1);
    assert.match(ids[0], /^[a-f0-9]{12,64}$/);
    const container = ids[0];
    const user = randomUUID();
    const key = randomUUID();
    const args = ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
    const query = sql => execFileSync('docker', args, { input: sql, encoding: 'utf8' });
    const run = barrier => new Promise((resolve, reject) => {
      const child = spawn('docker', args);
      let output = '';
      let errors = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { errors += chunk; });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve(output) : reject(new Error(errors)));
      child.stdin.end(`begin; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true); select public.submit_service_request('${key}', 'Concurrent request'); ${barrier === null ? '' : holdBarrier(barrier)} commit;`);
    });
    let created = false;
    try {
      query(`insert into auth.users (id, aud, role) values ('${user}', 'authenticated', 'authenticated');`);
      created = true;
      const barrier = barrierKey();
      const first = run(barrier);
      await waitForBarrier(query, barrier);
      const secondStarted = Date.now();
      const second = run(null).then(output => ({ output, elapsed: Date.now() - secondStarted }));
      const [firstResult, secondResult] = await Promise.all([first, second]);
      assert.ok(secondResult.elapsed >= 1500, 'The competing call must wait for the first transaction');
      const requestId = firstResult.match(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi)?.at(-1);
      assert.ok(requestId);
      assert.ok(secondResult.output.includes(requestId));
      assert.equal(query(`select count(*) from public.service_requests where owner_id='${user}' and submission_key='${key}';`).trim(), '1');
    } finally {
      if (created) query(`delete from public.notifications where request_id in (select id from public.service_requests where owner_id='${user}' and submission_key='${key}'); delete from public.service_requests where owner_id='${user}' and submission_key='${key}'; delete from auth.users where id='${user}';`);
    }
  });
});

test('a quote expiring while acceptance waits for its request lock is rejected', async () => {
  await withLocalLock(async () => {
    const runtime = localRuntime();
    const stack = runtime.verify();
    const ids = execFileSync('docker', ['ps', '--filter', `label=com.supabase.stack=${stack.id}`, '--filter', 'label=com.supabase.service=database', '--format', '{{.ID}}'], { encoding: 'utf8' }).trim().split(/\s+/);
    assert.equal(ids.length, 1);
    assert.match(ids[0], /^[a-f0-9]{12,64}$/);
    const args = ['exec', '-i', ids[0], 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
    const query = sql => execFileSync('docker', args, { input: sql, encoding: 'utf8' });
    const run = sql => new Promise((resolve, reject) => {
      const child = spawn('docker', args);
      let output = '';
      let errors = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { errors += chunk; });
      child.on('error', reject);
      child.on('close', code => resolve({ code, output, errors }));
      child.stdin.end(sql);
    });
    const user = randomUUID();
    const request = randomUUID();
    const key = randomUUID();
    const quote = randomUUID();
    let created = false;
    try {
      query(`insert into auth.users (id, aud, role) values ('${user}', 'authenticated', 'authenticated');`);
      created = true;
      query(`insert into public.service_requests (id, owner_id, submission_key, description) values ('${request}', '${user}', '${key}', 'Quote expiry fixture'); insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at) values ('${quote}', '${request}', 1, 'Fixture terms', 100, 'VND', clock_timestamp() + interval '2 seconds');`);
      const barrier = barrierKey();
      const holder = run(`begin; select id from public.service_requests where id='${request}' for update; ${holdBarrier(barrier)} commit;`);
      await waitForBarrier(query, barrier);
      const started = Date.now();
      const attempt = run(`begin; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true); select public.accept_service_quote('${quote}', 1); commit;`)
        .then(result => ({ ...result, elapsed: Date.now() - started }));
      const [held, result] = await Promise.all([holder, attempt]);
      assert.equal(held.code, 0);
      assert.ok(result.elapsed >= 1500, 'Acceptance must wait for the held request lock');
      assert.notEqual(result.code, 0);
      assert.match(result.errors, /quote expired/);
      assert.equal(query(`select count(*) from public.service_quotes where id='${quote}' and accepted_at is not null;`).trim(), '0');
    } finally {
      if (created) query(`delete from public.service_quotes where id='${quote}'; delete from public.notifications where request_id in (select id from public.service_requests where id='${request}'); delete from public.service_requests where id='${request}'; delete from auth.users where id='${user}';`);
    }
  });
});

test('real local Auth and REST enforce participant ownership', { timeout: 240000 }, async () => {
  await withLocalLock(async () => {
    const runtime = localRuntime();
    const stack = runtime.verify();
    const status = runtime.status();
    const serviceKey = status.env.SERVICE_ROLE_KEY;
    const publicKey = status.env.ANON_KEY;
    assert.ok(serviceKey && publicKey);
    const origin = stack.endpoints['rest.http'].url.replace(/\/$/, '');
    const ids = execFileSync('docker', ['ps', '--filter', `label=com.supabase.stack=${stack.id}`, '--filter', 'label=com.supabase.service=database', '--format', '{{.ID}}'], { encoding: 'utf8' }).trim().split(/\s+/);
    assert.equal(ids.length, 1);
    assert.match(ids[0], /^[a-f0-9]{12,64}$/);
    const query = sql => execFileSync('docker', ['exec', '-i', ids[0], 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input: sql, encoding: 'utf8' });
    const users = [];
    let requestId;
    const quote = randomUUID();
    const invitation = randomUUID();
    const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
    const call = (path, token, options = {}) => fetch(`${origin}${path}`, {
      ...options,
      headers: { apikey: publicKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    try {
      for (let index = 0; index < 2; index++) {
        const email = `${randomUUID()}@example.invalid`;
        const password = randomUUID();
        const created = await fetch(`${origin}/auth/v1/admin/users`, {
          method: 'POST', headers: admin, body: JSON.stringify({ email, password, email_confirm: true }),
        });
        assert.equal(created.status, 200, 'Local test account creation failed');
        const account = await created.json();
        assert.match(account.id, /^[a-f0-9-]{36}$/);
        users.push(account.id);
        const login = await fetch(`${origin}/auth/v1/token?grant_type=password`, {
          method: 'POST', headers: { apikey: publicKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
        });
        assert.equal(login.status, 200, 'Local test login failed');
        const session = await login.json();
        assert.ok(typeof session.access_token === 'string');
        users[index] = { id: account.id, token: session.access_token };
      }
      const key = randomUUID();
      const submit = () => call('/rest/v1/rpc/submit_service_request', users[0].token, {
        method: 'POST', body: JSON.stringify({ p_submission_key: key, p_description: 'Local integration fixture' }),
      });
      const first = await submit();
      assert.equal(first.status, 200);
      requestId = await first.json();
      assert.match(requestId, /^[a-f0-9-]{36}$/);
      const repeated = await submit();
      assert.equal(repeated.status, 200);
      assert.equal(await repeated.json(), requestId);
      const otherRead = await call(`/rest/v1/service_requests?id=eq.${requestId}&select=id`, users[1].token);
      assert.equal(otherRead.status, 200);
      assert.deepEqual(await otherRead.json(), []);
      query(`insert into public.service_quotes (id, request_id, version, scope, amount_minor, currency, expires_at) values ('${quote}', '${requestId}', 1, 'Synthetic local terms', 100, 'VND', clock_timestamp() + interval '1 hour');`);
      const accept = (token, version) => call('/rest/v1/rpc/accept_service_quote', token, {
        method: 'POST', body: JSON.stringify({ p_quote_id: quote, p_version: version }),
      });
      assert.equal((await accept(users[1].token, 1)).status, 403);
      assert.notEqual((await accept(users[0].token, 2)).status, 200);
      const accepted = await accept(users[0].token, 1);
      assert.equal(accepted.status, 200);
      assert.equal(await accepted.json(), quote);
      const replay = await accept(users[0].token, 1);
      assert.equal(replay.status, 200);
      assert.equal(await replay.json(), quote);
      assert.equal(query(`select count(*) from public.service_quotes where id='${quote}' and accepted_by='${users[0].id}';`).trim(), '1');
      query(`insert into public.worker_access_grants (user_id) values ('${users[1].id}'); insert into nestscout_private.worker_dispatch_eligibility (user_id,basis,active) values ('${users[1].id}','local_fixture',true); insert into public.service_invitations (id,request_id,quote_id,worker_id,expires_at) values ('${invitation}','${requestId}','${quote}','${users[1].id}',clock_timestamp()+interval '1 hour');`);
      const rpc = (token, name, payload) => call(`/rest/v1/rpc/${name}`, token, { method: 'POST', body: JSON.stringify(payload) });
      const offers = await rpc(users[1].token, 'worker_offers', {});
      assert.equal(offers.status, 200);
      const visibleOffers = await offers.json();
      assert.equal(visibleOffers.length, 1);
      assert.equal(visibleOffers[0].invitation_id, invitation);
      assert.equal(visibleOffers[0].scope, 'Synthetic local terms');
      assert.equal(visibleOffers[0].basis, 'local_fixture');
      const wrongWorker = await rpc(users[0].token, 'accept_service_invitation', { p_invitation_id: invitation, p_quote_id: quote, p_quote_version: 1 });
      assert.notEqual(wrongWorker.status, 200);
      const assignment = await rpc(users[1].token, 'accept_service_invitation', { p_invitation_id: invitation, p_quote_id: quote, p_quote_version: 1 });
      assert.equal(assignment.status, 200);
      const job = await assignment.json();
      assert.match(job, /^[a-f0-9-]{36}$/);
      const travel = await rpc(users[1].token, 'advance_service_job', { p_job_id: job, p_version: 1, p_next: 'en_route' });
      assert.equal(travel.status, 200);
      const delay = await rpc(users[1].token, 'report_service_job', { p_job_id: job, p_version: 2, p_key: randomUUID(), p_kind: 'delay', p_details: 'Synthetic delay' });
      assert.equal(delay.status, 200);
      query(`update public.worker_access_grants set status='revoked', revoked_at=clock_timestamp() where user_id='${users[1].id}';`);
      const revoked = await rpc(users[1].token, 'advance_service_job', { p_job_id: job, p_version: 3, p_next: 'arrived' });
      assert.notEqual(revoked.status, 200);
      assert.equal(query(`select stage from public.service_jobs where id='${job}';`).trim(), 'en_route');
      query(`update public.worker_access_grants set status='active', revoked_at=null where user_id='${users[1].id}';`);
      assert.equal((await rpc(users[1].token, 'advance_service_job', { p_job_id: job, p_version: 3, p_next: 'arrived' })).status, 200);
      const reports = await call(`/rest/v1/service_job_reports?job_id=eq.${job}&select=kind`, users[0].token);
      assert.equal((await reports.json()).length, 1);
      assert.equal((await rpc(users[1].token, 'advance_service_job', { p_job_id: job, p_version: 4, p_next: 'working' })).status, 200);
      const scopeKey = randomUUID();
      const scope = await rpc(users[1].token, 'propose_service_scope', { p_job_id: job, p_version: 5, p_key: scopeKey, p_scope: 'Revised fixture', p_amount: 150, p_rationale: 'Synthetic reason' });
      assert.equal(scope.status, 200);
      const proposal = await scope.json();
      assert.match(proposal, /^[a-f0-9-]{36}$/);
      const premature = await rpc(users[1].token, 'submit_service_work', { p_job_id: job, p_version: 6, p_key: randomUUID(), p_evidence: 'Synthetic evidence' });
      assert.notEqual(premature.status, 200);
      const approval = await rpc(users[0].token, 'decide_service_scope', { p_proposal_id: proposal, p_job_version: 6, p_sequence: 1, p_decision: 'approved' });
      assert.equal(approval.status, 200);
      const activeTerms = await rpc(users[1].token, 'worker_jobs', {});
      assert.equal((await activeTerms.json())[0].scope, 'Revised fixture');
      const submission = await rpc(users[1].token, 'submit_service_work', { p_job_id: job, p_version: 7, p_key: randomUUID(), p_evidence: 'Synthetic evidence' });
      assert.equal(submission.status, 200);
      const submittedId = await submission.json();
      assert.match(submittedId, /^[a-f0-9-]{36}$/);
      const decision = await rpc(users[0].token, 'decide_service_submission', { p_submission_id: submittedId, p_version: 8, p_decision: 'accepted', p_reason: null });
      assert.equal(decision.status, 200);
      const aftercare = await rpc(users[0].token, 'open_service_aftercare', { p_job_id: job, p_key: randomUUID(), p_reason: 'Synthetic support case' });
      assert.equal(aftercare.status, 200);
      const fakePayment = await rpc(users[0].token, 'mark_paid', { p_job_id: job });
      assert.notEqual(fakePayment.status, 200);
      const privateCase = await call(`/rest/v1/service_cases?job_id=eq.${job}&select=id`, users[1].token);
      assert.deepEqual(await privateCase.json(), []);
      for (const token of [users[0].token, users[1].token]) {
        for (const column of ['decision_reason', 'decided_by', 'submission_key', '*']) {
          const denied = await call(`/rest/v1/service_submissions?job_id=eq.${job}&select=${encodeURIComponent(column)}`, token);
          assert.equal(denied.status, 403);
        }
        const visible = await call(`/rest/v1/service_submissions?job_id=eq.${job}&select=id,decision,correction_note`, token);
        assert.equal(visible.status, 200);
        assert.equal((await visible.json()).length, 1);
      }
      for (const token of [users[0].token, users[1].token]) {
        for (const [table, column] of [['service_job_events', 'actor_id'], ['service_jobs', 'worker_id'], ['service_scope_changes', 'proposed_by'], ['service_scope_changes', 'decided_by'], ['service_job_reports', 'actor_id'], ['service_submissions', 'submitted_by']]) {
          const denied = await call(`/rest/v1/${table}?select=${column}`, token);
          assert.equal(denied.status, 403);
        }
        const events = await call(`/rest/v1/service_job_events?job_id=eq.${job}&select=event,version`, token);
        assert.equal(events.status, 200);
        assert.ok((await events.json()).length >= 4);
        const jobs = await call(`/rest/v1/service_jobs?id=eq.${job}&select=id,request_id,stage,version`, token);
        assert.equal(jobs.status, 200);
        assert.equal((await jobs.json()).length, 1);
      }
      const quoteRows = await call(`/rest/v1/service_quotes?id=eq.${quote}&select=id,basis`, users[0].token);
      assert.equal(quoteRows.status, 200);
      assert.deepEqual((await quoteRows.json()).map(row => row.basis), ['local_fixture']);
      const context = await rpc(users[0].token, 'kael_read_context', { p_kind: 'customer_request', p_resource_id: requestId });
      assert.equal(context.status, 200);
      assert.equal((await context.json()).state, 'request_received');
      const forbiddenContext = await rpc(users[1].token, 'kael_read_context', { p_kind: 'customer_request', p_resource_id: requestId });
      assert.equal((await forbiddenContext.json()).status, 'unavailable');
      const workerContext = await rpc(users[1].token, 'kael_read_context', { p_kind: 'worker_job', p_resource_id: job });
      assert.equal((await workerContext.json()).state, 'completed');
      const forgedConsent = await rpc(users[1].token, 'kael_read_context', { p_kind: 'worker_job', p_resource_id: job, approved: true });
      assert.notEqual(forgedConsent.status, 200);
      assert.equal(query(`select stage from public.service_jobs where id='${job}';`).trim(), 'completed');
    } finally {
      if (requestId) query(`delete from public.service_cases where job_id in (select id from public.service_jobs where request_id='${requestId}'); delete from public.service_submissions where job_id in (select id from public.service_jobs where request_id='${requestId}'); delete from public.service_scope_changes where job_id in (select id from public.service_jobs where request_id='${requestId}'); delete from public.service_job_reports where job_id in (select id from public.service_jobs where request_id='${requestId}'); delete from public.service_job_events where job_id in (select id from public.service_jobs where request_id='${requestId}'); delete from public.service_jobs where request_id='${requestId}'; delete from public.service_invitations where id='${invitation}'; delete from public.service_quotes where id='${quote}'; delete from public.notifications where request_id in (select id from public.service_requests where id='${requestId}'); delete from public.service_requests where id='${requestId}';`);
      for (const account of users) {
        const id = typeof account === 'string' ? account : account.id;
        query(`delete from nestscout_private.kael_tool_audit where actor_id='${id}'; delete from nestscout_private.worker_dispatch_eligibility where user_id='${id}'; delete from public.worker_access_grants where user_id='${id}';`);
        const removed = await fetch(`${origin}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: admin });
        assert.equal(removed.status, 200, 'Local test account cleanup failed');
      }
    }
  });
});

test('two workers accepting the same request produce exactly one assignment', async () => {
  await withLocalLock(async () => {
    const runtime = localRuntime();
    const stack = runtime.verify();
    const ids = execFileSync('docker', ['ps', '--filter', `label=com.supabase.stack=${stack.id}`, '--filter', 'label=com.supabase.service=database', '--format', '{{.ID}}'], { encoding: 'utf8' }).trim().split(/\s+/);
    assert.equal(ids.length, 1);
    assert.match(ids[0], /^[a-f0-9]{12,64}$/);
    const args = ['exec', '-i', ids[0], 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
    const query = sql => execFileSync('docker', args, { input: sql, encoding: 'utf8' });
    const run = sql => new Promise((resolve, reject) => {
      const child = spawn('docker', args);
      let output = '', errors = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { errors += chunk; });
      child.on('error', reject);
      child.on('close', code => resolve({ code, output, errors }));
      child.stdin.end(sql);
    });
    const [customer, workerA, workerB, request, key, quote, inviteA, inviteB, inviteExpired] = Array.from({ length: 9 }, () => randomUUID());
    let created = false;
    try {
      query(`insert into auth.users (id, aud, role) values ('${customer}', 'authenticated', 'authenticated'), ('${workerA}', 'authenticated', 'authenticated'), ('${workerB}', 'authenticated', 'authenticated');`);
      created = true;
      query(`insert into public.worker_access_grants (user_id) values ('${workerA}'), ('${workerB}'); insert into nestscout_private.worker_dispatch_eligibility (user_id,basis,active) values ('${workerA}','local_fixture',true), ('${workerB}','local_fixture',true); insert into public.service_requests (id,owner_id,submission_key,description) values ('${request}','${customer}','${key}','Assignment fixture'); insert into public.service_quotes (id,request_id,version,scope,amount_minor,currency,expires_at,accepted_at,accepted_by) values ('${quote}','${request}',1,'Synthetic terms',100,'VND',clock_timestamp()+interval '1 hour',clock_timestamp(),'${customer}'); insert into public.service_invitations (id,request_id,quote_id,worker_id,expires_at) values ('${inviteA}','${request}','${quote}','${workerA}',clock_timestamp()+interval '1 hour'), ('${inviteB}','${request}','${quote}','${workerB}',clock_timestamp()+interval '1 hour');`);
      const command = (worker, invite, barrier) => `begin; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${worker}","role":"authenticated"}', true); select public.accept_service_invitation('${invite}','${quote}',1); ${barrier === null ? '' : holdBarrier(barrier)} commit;`;
      query(`insert into public.service_invitations (id,request_id,quote_id,worker_id,expires_at) values ('${inviteExpired}','${request}','${quote}','${workerA}',clock_timestamp()+interval '2 seconds');`);
      const expiryBarrier = barrierKey();
      const holder = run(`begin; select id from public.service_requests where id='${request}' for update; ${holdBarrier(expiryBarrier)} commit;`);
      await waitForBarrier(query, expiryBarrier);
      const expiryStarted = Date.now();
      const expired = run(command(workerA, inviteExpired, null)).then(result => ({ ...result, elapsed: Date.now() - expiryStarted }));
      const [held, late] = await Promise.all([holder, expired]);
      assert.equal(held.code, 0);
      assert.notEqual(late.code, 0);
      assert.match(late.errors, /invitation unavailable/);
      assert.ok(late.elapsed >= 1500, 'The acceptance must wait for the request lock');
      assert.equal(query(`select count(*) from public.service_jobs where request_id='${request}';`).trim(), '0');
      const assignmentBarrier = barrierKey();
      const first = run(command(workerA, inviteA, assignmentBarrier));
      await waitForBarrier(query, assignmentBarrier);
      const started = Date.now();
      const second = run(command(workerB, inviteB, null)).then(result => ({ ...result, elapsed: Date.now() - started }));
      const [winner, loser] = await Promise.all([first, second]);
      assert.equal(winner.code, 0);
      assert.notEqual(loser.code, 0);
      assert.match(loser.errors, /already assigned/);
      assert.ok(loser.elapsed >= 1500, 'The second worker must wait for the first transaction');
      assert.equal(query(`select count(*) from public.service_jobs where request_id='${request}' and worker_id='${workerA}';`).trim(), '1');
      assert.equal(query(`select count(*) from public.service_jobs where request_id='${request}';`).trim(), '1');
      const job = query(`select id from public.service_jobs where request_id='${request}';`).trim();
      assert.match(job, /^[a-f0-9-]{36}$/);
      const revokeBarrier = barrierKey();
      const revocation = run(`begin; update public.worker_access_grants set status='revoked', revoked_at=clock_timestamp() where user_id='${workerA}'; ${holdBarrier(revokeBarrier)} commit;`);
      await waitForBarrier(query, revokeBarrier);
      const revokeStarted = Date.now();
      const staleAction = run(`begin; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${workerA}","role":"authenticated"}', true); select public.advance_service_job('${job}',1,'en_route'); commit;`)
        .then(result => ({ ...result, elapsed: Date.now() - revokeStarted }));
      const [revoked, refused] = await Promise.all([revocation, staleAction]);
      assert.equal(revoked.code, 0);
      assert.notEqual(refused.code, 0);
      assert.match(refused.errors, /worker unavailable/);
      assert.ok(refused.elapsed >= 1500, 'The Worker action must wait for the revocation transaction');
      assert.equal(query(`select stage from public.service_jobs where id='${job}';`).trim(), 'assigned');
    } finally {
      if (created) query(`delete from public.service_job_events where job_id in (select id from public.service_jobs where request_id='${request}'); delete from public.service_jobs where request_id='${request}'; delete from public.service_invitations where id in ('${inviteA}','${inviteB}','${inviteExpired}'); delete from public.service_quotes where id='${quote}'; delete from public.notifications where request_id in (select id from public.service_requests where id='${request}'); delete from public.service_requests where id='${request}'; delete from nestscout_private.worker_dispatch_eligibility where user_id in ('${workerA}','${workerB}'); delete from public.worker_access_grants where user_id in ('${workerA}','${workerB}'); delete from auth.users where id in ('${customer}','${workerA}','${workerB}');`);
    }
  });
});

test('acceptance, scope consent and safety races serialize at the job', async () => {
  await withLocalLock(async () => {
    const runtime = localRuntime();
    const stack = runtime.verify();
    const ids = execFileSync('docker', ['ps', '--filter', `label=com.supabase.stack=${stack.id}`, '--filter', 'label=com.supabase.service=database', '--format', '{{.ID}}'], { encoding: 'utf8' }).trim().split(/\s+/);
    assert.equal(ids.length, 1);
    assert.match(ids[0], /^[a-f0-9]{12,64}$/);
    const args = ['exec', '-i', ids[0], 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
    const query = sql => execFileSync('docker', args, { input: sql, encoding: 'utf8' });
    const run = sql => new Promise((resolve, reject) => {
      const child = spawn('docker', args);
      let errors = '';
      child.stderr.on('data', chunk => { errors += chunk; });
      child.stdout.resume();
      child.on('error', reject);
      child.on('close', code => resolve({ code, errors }));
      child.stdin.end(sql);
    });
    const [customer, worker, requestA, requestB, keyA, keyB, quoteA, quoteB, inviteA, inviteB, jobA, jobB, submission, workKey] = Array.from({ length: 14 }, () => randomUUID());
    let created = false;
    try {
      query(`insert into auth.users (id,aud,role) values ('${customer}','authenticated','authenticated'),('${worker}','authenticated','authenticated');`);
      created = true;
      query(`insert into public.worker_access_grants (user_id) values ('${worker}'); insert into nestscout_private.worker_dispatch_eligibility (user_id,basis,active) values ('${worker}','local_fixture',true); insert into public.service_requests (id,owner_id,submission_key,description) values ('${requestA}','${customer}','${keyA}','Fixture A'),('${requestB}','${customer}','${keyB}','Fixture B'); insert into public.service_quotes (id,request_id,version,scope,amount_minor,currency,expires_at,accepted_at,accepted_by) values ('${quoteA}','${requestA}',1,'Fixture A',100,'VND',clock_timestamp()+interval '1 hour',clock_timestamp(),'${customer}'),('${quoteB}','${requestB}',1,'Fixture B',100,'VND',clock_timestamp()+interval '1 hour',clock_timestamp(),'${customer}'); insert into public.service_invitations (id,request_id,quote_id,worker_id,expires_at,state) values ('${inviteA}','${requestA}','${quoteA}','${worker}',clock_timestamp()+interval '1 hour','accepted'),('${inviteB}','${requestB}','${quoteB}','${worker}',clock_timestamp()+interval '1 hour','accepted'); insert into public.service_jobs (id,request_id,quote_id,invitation_id,worker_id,stage,version) values ('${jobA}','${requestA}','${quoteA}','${inviteA}','${worker}','submitted',2),('${jobB}','${requestB}','${quoteB}','${inviteB}','${worker}','working',1); insert into public.service_submissions (id,job_id,submitted_by,submission_key,submitted_from_version,evidence) values ('${submission}','${jobA}','${worker}','${workKey}',1,'Fixture evidence');`);
      const auth = actor => `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${actor}","role":"authenticated"}', true);`;
      const race = async (firstSql, secondSql) => {
        const barrier = barrierKey();
        const first = run(`begin; ${firstSql} ${holdBarrier(barrier)} commit;`);
        await waitForBarrier(query, barrier);
        const started = Date.now();
        const second = run(`begin; ${secondSql} commit;`).then(result => ({ ...result, elapsed: Date.now() - started }));
        const [winner, loser] = await Promise.all([first, second]);
        assert.equal(winner.code, 0);
        assert.notEqual(loser.code, 0);
        assert.match(loser.errors, /stale job/);
        assert.ok(loser.elapsed >= 1500, 'The second operation must wait for the first transaction');
      };
      await race(`${auth(customer)} select public.decide_service_submission('${submission}',2,'accepted',null);`, `${auth(customer)} select public.decide_service_submission('${submission}',2,'disputed','Fixture dispute');`);
      assert.equal(query(`select decision from public.service_submissions where id='${submission}';`).trim(), 'accepted');
      assert.equal(query(`select count(*) from public.service_cases where job_id='${jobA}';`).trim(), '0');
      const scopeKey = randomUUID();
      const proposed = await run(`begin; ${auth(worker)} select public.propose_service_scope('${jobB}',1,'${scopeKey}','Revised fixture',150,'Fixture reason'); commit;`);
      assert.equal(proposed.code, 0);
      const proposal = query(`select id from public.service_scope_changes where job_id='${jobB}';`).trim();
      assert.match(proposal, /^[a-f0-9-]{36}$/);
      await race(`${auth(customer)} select public.decide_service_scope('${proposal}',2,1,'approved');`, `${auth(customer)} select public.decide_service_scope('${proposal}',2,1,'rejected');`);
      assert.equal(query(`select decision from public.service_scope_changes where id='${proposal}';`).trim(), 'approved');
      assert.equal(query(`select scope from public.service_quotes where id='${quoteB}';`).trim(), 'Fixture B');
      await race(`${auth(worker)} select public.pause_service_job('${jobB}',3,'safety_concern');`, `${auth(worker)} select public.submit_service_work('${jobB}',3,'${randomUUID()}','Fixture evidence');`);
      assert.equal(query(`select stage from public.service_jobs where id='${jobB}';`).trim(), 'paused');
      assert.equal(query(`select count(*) from public.service_submissions where job_id='${jobB}';`).trim(), '0');
      assert.equal(query(`select category from public.service_job_pauses where job_id='${jobB}' and resumed_at is null;`).trim(), 'safety_concern');
    } finally {
      if (created) query(`delete from public.service_cases where job_id in ('${jobA}','${jobB}'); delete from public.service_job_pauses where job_id in ('${jobA}','${jobB}'); delete from public.service_submissions where job_id in ('${jobA}','${jobB}'); delete from public.service_scope_changes where job_id in ('${jobA}','${jobB}'); delete from public.service_job_events where job_id in ('${jobA}','${jobB}'); delete from public.service_jobs where id in ('${jobA}','${jobB}'); delete from public.service_invitations where id in ('${inviteA}','${inviteB}'); delete from public.service_quotes where id in ('${quoteA}','${quoteB}'); delete from public.notifications where request_id in (select id from public.service_requests where id in ('${requestA}','${requestB}')); delete from public.service_requests where id in ('${requestA}','${requestB}'); delete from nestscout_private.worker_dispatch_eligibility where user_id='${worker}'; delete from public.worker_access_grants where user_id='${worker}'; delete from auth.users where id in ('${customer}','${worker}');`);
    }
  });
});

test('a correction request reaches only the assigned Worker through real Auth and REST', { timeout: 240000 }, async () => {
  await withLocalLock(async () => {
    const runtime = localRuntime();
    const stack = runtime.verify();
    const status = runtime.status();
    const serviceKey = status.env.SERVICE_ROLE_KEY;
    const publicKey = status.env.ANON_KEY;
    assert.ok(serviceKey && publicKey);
    const origin = stack.endpoints['rest.http'].url.replace(/\/$/, '');
    const ids = execFileSync('docker', ['ps', '--filter', `label=com.supabase.stack=${stack.id}`, '--filter', 'label=com.supabase.service=database', '--format', '{{.ID}}'], { encoding: 'utf8' }).trim().split(/\s+/);
    assert.equal(ids.length, 1);
    assert.match(ids[0], /^[a-f0-9]{12,64}$/);
    const query = sql => execFileSync('docker', ['exec', '-i', ids[0], 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input: sql, encoding: 'utf8' });
    const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
    const call = (path, token, options = {}) => fetch(`${origin}${path}`, {
      ...options,
      headers: { apikey: publicKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const accounts = [];
    const [request, quote, invitation, job, submission, workKey, requestKey] = Array.from({ length: 7 }, () => randomUUID());
    let fixtures = false;
    try {
      for (let index = 0; index < 3; index++) {
        const email = `${randomUUID()}@example.invalid`;
        const password = randomUUID();
        const created = await fetch(`${origin}/auth/v1/admin/users`, {
          method: 'POST', headers: admin, body: JSON.stringify({ email, password, email_confirm: true }),
        });
        assert.equal(created.status, 200, 'Local test account creation failed');
        const account = await created.json();
        assert.match(account.id, /^[a-f0-9-]{36}$/);
        accounts.push(account.id);
        const login = await fetch(`${origin}/auth/v1/token?grant_type=password`, {
          method: 'POST', headers: { apikey: publicKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
        });
        assert.equal(login.status, 200, 'Local test login failed');
        const session = await login.json();
        assert.ok(typeof session.access_token === 'string');
        accounts[index] = { id: account.id, token: session.access_token };
      }
      const [customer, worker, foreign] = accounts;
      query(`begin; insert into public.worker_access_grants (user_id) values ('${worker.id}'), ('${foreign.id}'); insert into nestscout_private.worker_dispatch_eligibility (user_id,basis,active) values ('${worker.id}','local_fixture',true), ('${foreign.id}','local_fixture',true); insert into public.service_requests (id,owner_id,submission_key,description) values ('${request}','${customer.id}','${requestKey}','Correction fixture'); insert into public.service_quotes (id,request_id,version,scope,amount_minor,currency,expires_at,accepted_at,accepted_by) values ('${quote}','${request}',1,'Correction fixture',100,'VND',clock_timestamp()+interval '1 hour',clock_timestamp(),'${customer.id}'); insert into public.service_invitations (id,request_id,quote_id,worker_id,expires_at,state) values ('${invitation}','${request}','${quote}','${worker.id}',clock_timestamp()+interval '1 hour','accepted'); insert into public.service_jobs (id,request_id,quote_id,invitation_id,worker_id,stage,version) values ('${job}','${request}','${quote}','${invitation}','${worker.id}','submitted',2); insert into public.service_submissions (id,job_id,submitted_by,submission_key,submitted_from_version,evidence) values ('${submission}','${job}','${worker.id}','${workKey}',1,'Fixture evidence'); commit;`);
      fixtures = true;
      const read = token => call(`/rest/v1/service_submissions?select=id,job_id,decision,correction_note,created_at&job_id=eq.${job}`, token);
      const corrections = token => call('/rest/v1/rpc/worker_corrections', token, { method: 'POST', body: '{}' });
      const states = async response => (await response.json()).map(row => [row.decision, row.correction_note]);
      const waiting = await read(worker.token);
      assert.equal(waiting.status, 200);
      assert.deepEqual(await states(waiting), [['pending', null]]);
      const none = await corrections(worker.token);
      assert.equal(none.status, 200);
      assert.deepEqual(await none.json(), []);
      const decision = await call('/rest/v1/rpc/decide_service_submission', customer.token, {
        method: 'POST', body: JSON.stringify({ p_submission_id: submission, p_version: 2, p_decision: 'revision_requested', p_reason: 'Synthetic correction' }),
      });
      assert.equal(decision.status, 200);
      const assigned = await read(worker.token);
      assert.equal(assigned.status, 200);
      assert.deepEqual(await states(assigned), [['revision_requested', 'Synthetic correction']]);
      const projected = await corrections(worker.token);
      assert.equal(projected.status, 200);
      assert.deepEqual(await projected.json(), [{ job_id: job, submitted_from_version: 1, note: 'Synthetic correction' }]);
      const asCustomer = await corrections(customer.token);
      assert.equal(asCustomer.status, 200);
      assert.deepEqual(await asCustomer.json(), []);
      const asForeign = await corrections(foreign.token);
      assert.equal(asForeign.status, 200);
      assert.deepEqual(await asForeign.json(), []);
      assert.equal((await corrections(publicKey)).status, 401);
      assert.ok((await call('/rest/v1/rpc/worker_corrections?select=decision_reason', worker.token, { method: 'POST', body: '{}' })).status >= 400);
      const owner = await read(customer.token);
      assert.equal(owner.status, 200);
      assert.deepEqual(await states(owner), [['revision_requested', 'Synthetic correction']]);
      const stranger = await read(foreign.token);
      assert.equal(stranger.status, 200);
      assert.deepEqual(await stranger.json(), []);
      for (const column of ['decision_reason', 'decided_by', 'submitted_by']) {
        const denied = await call(`/rest/v1/service_submissions?select=${column}&job_id=eq.${job}`, worker.token);
        assert.equal(denied.status, 403);
        assert.equal((await call(`/rest/v1/service_submissions?select=id&${column}=not.is.null`, worker.token)).status, 403);
      }
      assert.equal((await call('/rest/v1/service_submissions?select=id&order=decision_reason', worker.token)).status, 403);
      assert.equal((await read(publicKey)).status, 401);
      query(`update public.worker_access_grants set status='revoked', revoked_at=clock_timestamp() where user_id='${worker.id}';`);
      const revoked = await read(worker.token);
      assert.equal(revoked.status, 200);
      assert.deepEqual(await revoked.json(), []);
      const revokedProjection = await corrections(worker.token);
      assert.equal(revokedProjection.status, 200);
      assert.deepEqual(await revokedProjection.json(), []);
    } finally {
      if (fixtures) query(`delete from public.service_cases where job_id='${job}'; delete from public.service_submissions where job_id='${job}'; delete from public.service_job_events where job_id='${job}'; delete from public.service_jobs where id='${job}'; delete from public.service_invitations where id='${invitation}'; delete from public.service_quotes where id='${quote}'; delete from public.notifications where request_id in (select id from public.service_requests where id='${request}'); delete from public.service_requests where id='${request}';`);
      for (const account of accounts) {
        const id = typeof account === 'string' ? account : account.id;
        query(`delete from nestscout_private.worker_dispatch_eligibility where user_id='${id}'; delete from public.worker_access_grants where user_id='${id}';`);
        const removed = await fetch(`${origin}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: admin });
        assert.equal(removed.status, 200, 'Local test account cleanup failed');
      }
    }
  });
});

test('the correction projection stays complete beyond the API row limit', { timeout: 300000 }, async () => {
  await withLocalLock(async () => {
    const runtime = localRuntime();
    const stack = runtime.verify();
    const status = runtime.status();
    const serviceKey = status.env.SERVICE_ROLE_KEY;
    const publicKey = status.env.ANON_KEY;
    assert.ok(serviceKey && publicKey);
    const origin = stack.endpoints['rest.http'].url.replace(/\/$/, '');
    const ids = execFileSync('docker', ['ps', '--filter', `label=com.supabase.stack=${stack.id}`, '--filter', 'label=com.supabase.service=database', '--format', '{{.ID}}'], { encoding: 'utf8' }).trim().split(/\s+/);
    assert.equal(ids.length, 1);
    assert.match(ids[0], /^[a-f0-9]{12,64}$/);
    const query = sql => execFileSync('docker', ['exec', '-i', ids[0], 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input: sql, encoding: 'utf8' });
    const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
    const call = (path, token, options = {}) => fetch(`${origin}${path}`, {
      ...options,
      headers: { apikey: publicKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const accounts = [];
    const tag = `Scale fixture ${randomUUID()}`;
    const limit = 1000;
    let fixtures = false;
    try {
      for (let index = 0; index < 2; index++) {
        const email = `${randomUUID()}@example.invalid`;
        const password = randomUUID();
        const created = await fetch(`${origin}/auth/v1/admin/users`, {
          method: 'POST', headers: admin, body: JSON.stringify({ email, password, email_confirm: true }),
        });
        assert.equal(created.status, 200, 'Local test account creation failed');
        const account = await created.json();
        accounts.push(account.id);
        const login = await fetch(`${origin}/auth/v1/token?grant_type=password`, {
          method: 'POST', headers: { apikey: publicKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
        });
        assert.equal(login.status, 200, 'Local test login failed');
        accounts[index] = { id: account.id, token: (await login.json()).access_token };
      }
      const [customer, worker] = accounts;
      const jobCount = limit + 10;
      const history = limit + 200;
      query(`begin;
        insert into public.worker_access_grants (user_id) values ('${worker.id}');
        insert into nestscout_private.worker_dispatch_eligibility (user_id,basis,active) values ('${worker.id}','local_fixture',true);
        create temporary table scale_jobs on commit drop as
          select n, gen_random_uuid() as request_id, gen_random_uuid() as quote_id, gen_random_uuid() as invitation_id, gen_random_uuid() as job_id
          from generate_series(1, ${jobCount}) n;
        insert into public.service_requests (id,owner_id,submission_key,description)
          select request_id,'${customer.id}',gen_random_uuid(),'${tag}' from scale_jobs;
        insert into public.service_quotes (id,request_id,version,scope,amount_minor,currency,expires_at,accepted_at,accepted_by)
          select quote_id,request_id,1,'${tag}',100,'VND',clock_timestamp()+interval '1 hour',clock_timestamp(),'${customer.id}' from scale_jobs;
        insert into public.service_invitations (id,request_id,quote_id,worker_id,expires_at,state)
          select invitation_id,request_id,quote_id,'${worker.id}',clock_timestamp()+interval '1 hour','accepted' from scale_jobs;
        insert into public.service_jobs (id,request_id,quote_id,invitation_id,worker_id,stage,version)
          select job_id,request_id,quote_id,invitation_id,'${worker.id}','working',1 from scale_jobs;
        insert into public.service_submissions (job_id,submitted_by,submission_key,submitted_from_version,evidence,decision,decided_by,decided_at,decided_from_version,decision_reason,correction_note)
          select (select job_id from scale_jobs where n = 1),'${worker.id}',gen_random_uuid(),v,'Evidence',
            case when v % 2 = 1 then 'revision_requested' else 'accepted' end,'${customer.id}',clock_timestamp(),v + 1,
            case when v % 2 = 1 then 'Private ' || v else null end,
            case when v % 2 = 1 then 'Older note ' || v else null end
          from generate_series(1, ${history - 1}) v;
        insert into public.service_submissions (job_id,submitted_by,submission_key,submitted_from_version,evidence,decision,decided_by,decided_at,decided_from_version,decision_reason,correction_note)
          select job_id,'${worker.id}',gen_random_uuid(),${history + 1},'Evidence','revision_requested','${customer.id}',clock_timestamp(),${history + 2},'Private newest','Newest correction'
          from scale_jobs where n = 1;
        commit;`);
      fixtures = true;
      const target = query(`select id from public.service_jobs j where j.request_id in (select id from public.service_requests where description='${tag}') and exists (select 1 from public.service_submissions s where s.job_id=j.id);`).trim();
      assert.match(target, /^[a-f0-9-]{36}$/);
      const plain = await call(`/rest/v1/service_submissions?select=id,job_id,decision,correction_note,created_at&job_id=eq.${target}`, worker.token);
      assert.equal(plain.status, 200);
      const plainRows = await plain.json();
      assert.equal(plainRows.length, limit, 'A plain table read is silently capped by the API row limit');
      assert.ok(plainRows.length < history);
      const listed = await call('/rest/v1/rpc/worker_jobs', worker.token, { method: 'POST', body: '{}' });
      assert.equal(listed.status, 200);
      assert.equal((await listed.json()).length, limit, 'The Worker job list is capped by the API row limit');
      const projected = await call('/rest/v1/rpc/worker_corrections', worker.token, { method: 'POST', body: '{}' });
      assert.equal(projected.status, 200);
      const rows = await projected.json();
      assert.deepEqual(rows, [{ job_id: target, submitted_from_version: history + 1, note: 'Newest correction' }]);
    } finally {
      if (fixtures) query(`begin;
        create temporary table scale_cleanup on commit drop as select id from public.service_requests where description='${tag}';
        delete from public.service_submissions where job_id in (select id from public.service_jobs where request_id in (select id from scale_cleanup));
        delete from public.service_job_events where job_id in (select id from public.service_jobs where request_id in (select id from scale_cleanup));
        delete from public.service_jobs where request_id in (select id from scale_cleanup);
        delete from public.service_invitations where request_id in (select id from scale_cleanup);
        delete from public.service_quotes where request_id in (select id from scale_cleanup);
        delete from public.notifications where request_id in (select id from public.service_requests where id in (select id from scale_cleanup)); delete from public.service_requests where id in (select id from scale_cleanup);
        commit;`);
      for (const account of accounts) {
        const id = typeof account === 'string' ? account : account.id;
        query(`delete from nestscout_private.worker_dispatch_eligibility where user_id='${id}'; delete from public.worker_access_grants where user_id='${id}';`);
        const removed = await fetch(`${origin}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: admin });
        assert.equal(removed.status, 200, 'Local test account cleanup failed');
      }
    }
  });
});

test('a classified pause is resumed only with both parties through real Auth and REST', { timeout: 300000 }, async () => {
  await withLocalLock(async () => {
    const runtime = localRuntime();
    const stack = runtime.verify();
    const status = runtime.status();
    const serviceKey = status.env.SERVICE_ROLE_KEY;
    const publicKey = status.env.ANON_KEY;
    assert.ok(serviceKey && publicKey);
    const origin = stack.endpoints['rest.http'].url.replace(/\/$/, '');
    const ids = execFileSync('docker', ['ps', '--filter', `label=com.supabase.stack=${stack.id}`, '--filter', 'label=com.supabase.service=database', '--format', '{{.ID}}'], { encoding: 'utf8' }).trim().split(/\s+/);
    assert.equal(ids.length, 1);
    assert.match(ids[0], /^[a-f0-9]{12,64}$/);
    const query = sql => execFileSync('docker', ['exec', '-i', ids[0], 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input: sql, encoding: 'utf8' });
    const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
    const call = (path, token, options = {}) => fetch(`${origin}${path}`, {
      ...options,
      headers: { apikey: publicKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const command = (name, token, body) => call(`/rest/v1/rpc/${name}`, token, { method: 'POST', body: JSON.stringify(body) });
    const accounts = [];
    const [request, quote, invitation, job, requestKey, request2, quote2, invitation2, job2, requestKey2] = Array.from({ length: 10 }, () => randomUUID());
    let fixtures = false;
    try {
      for (let index = 0; index < 4; index++) {
        const email = `${randomUUID()}@example.invalid`;
        const password = randomUUID();
        const created = await fetch(`${origin}/auth/v1/admin/users`, {
          method: 'POST', headers: admin, body: JSON.stringify({ email, password, email_confirm: true }),
        });
        assert.equal(created.status, 200, 'Local test account creation failed');
        const account = await created.json();
        accounts.push(account.id);
        const login = await fetch(`${origin}/auth/v1/token?grant_type=password`, {
          method: 'POST', headers: { apikey: publicKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
        });
        assert.equal(login.status, 200, 'Local test login failed');
        accounts[index] = { id: account.id, token: (await login.json()).access_token };
      }
      const [customer, worker, foreignWorker, otherCustomer] = accounts;
      query(`begin; insert into public.worker_access_grants (user_id) values ('${worker.id}'), ('${foreignWorker.id}'); insert into nestscout_private.worker_dispatch_eligibility (user_id,basis,active) values ('${worker.id}','local_fixture',true), ('${foreignWorker.id}','local_fixture',true); insert into public.service_requests (id,owner_id,submission_key,description) values ('${request}','${customer.id}','${requestKey}','Pause fixture'); insert into public.service_quotes (id,request_id,version,scope,amount_minor,currency,expires_at,accepted_at,accepted_by) values ('${quote}','${request}',1,'Pause fixture',100,'VND',clock_timestamp()+interval '1 hour',clock_timestamp(),'${customer.id}'); insert into public.service_invitations (id,request_id,quote_id,worker_id,expires_at,state) values ('${invitation}','${request}','${quote}','${worker.id}',clock_timestamp()+interval '1 hour','accepted'); insert into public.service_jobs (id,request_id,quote_id,invitation_id,worker_id,stage,version) values ('${job}','${request}','${quote}','${invitation}','${worker.id}','working',1); insert into public.service_requests (id,owner_id,submission_key,description) values ('${request2}','${worker.id}','${requestKey2}','Dual-role fixture'); insert into public.service_quotes (id,request_id,version,scope,amount_minor,currency,expires_at,accepted_at,accepted_by) values ('${quote2}','${request2}',1,'Dual-role fixture',100,'VND',clock_timestamp()+interval '1 hour',clock_timestamp(),'${worker.id}'); insert into public.service_invitations (id,request_id,quote_id,worker_id,expires_at,state) values ('${invitation2}','${request2}','${quote2}','${foreignWorker.id}',clock_timestamp()+interval '1 hour','accepted'); insert into public.service_jobs (id,request_id,quote_id,invitation_id,worker_id,stage,version) values ('${job2}','${request2}','${quote2}','${invitation2}','${foreignWorker.id}','working',1); commit;`);
      fixtures = true;
      const stage = () => query(`select stage || ':' || version from public.service_jobs where id='${job}';`).trim();
      const failure = async response => {
        const body = await response.json();
        return [response.status, body.code, body.message];
      };

      assert.equal((await command('pause_service_job', publicKey, { p_job_id: job, p_version: 1, p_category: 'ordinary_interruption' })).status, 401);
      assert.deepEqual(await failure(await command('pause_service_job', customer.token, { p_job_id: job, p_version: 1, p_category: 'ordinary_interruption' })).then(value => value.slice(1)), ['42501', 'worker unavailable']);
      assert.equal((await command('pause_service_job', foreignWorker.token, { p_job_id: job, p_version: 1, p_category: 'ordinary_interruption' })).status, 403);
      assert.equal((await command('pause_service_job', worker.token, { p_job_id: job, p_version: 1, p_category: 'holiday' })).status, 400);
      assert.equal(stage(), 'working:1');

      const paused = await command('pause_service_job', worker.token, { p_job_id: job, p_version: 1, p_category: 'ordinary_interruption' });
      assert.equal(paused.status, 200);
      assert.equal(await paused.json(), 2);
      assert.equal(stage(), 'paused:2');
      const replay = await command('pause_service_job', worker.token, { p_job_id: job, p_version: 1, p_category: 'ordinary_interruption' });
      assert.equal(await replay.json(), 2);

      const otherPause = await command('pause_service_job', foreignWorker.token, { p_job_id: job2, p_version: 1, p_category: 'ordinary_interruption' });
      assert.equal(otherPause.status, 200);
      assert.equal(await otherPause.json(), 2);

      for (const [name, person] of [['customer_pauses', customer], ['worker_pauses', worker]]) {
        const seen = await command(name, person.token, {});
        assert.equal(seen.status, 200);
        const rows = await seen.json();
        assert.equal(rows.length, 1);
        assert.deepEqual({ ...rows[0], created_at: undefined }, { job_id: job, category: 'ordinary_interruption', prior_stage: 'working', paused_from_version: 1, resume_requested: false, created_at: undefined });
      }
      const pausedJobs = async (name, person) => {
        const response = await command(name, person.token, {});
        assert.equal(response.status, 200);
        return (await response.json()).map(row => row.job_id);
      };
      assert.deepEqual(await pausedJobs('worker_pauses', worker), [job], 'A dual-role account sees only its Worker pauses in Worker mode');
      assert.deepEqual(await pausedJobs('customer_pauses', worker), [job2], 'A dual-role account sees only its owned-job pauses in Customer mode');
      assert.deepEqual(await pausedJobs('worker_pauses', customer), []);
      assert.deepEqual(await pausedJobs('worker_pauses', foreignWorker), [job2]);
      assert.deepEqual(await pausedJobs('customer_pauses', foreignWorker), []);
      assert.deepEqual(await pausedJobs('worker_pauses', otherCustomer), []);
      assert.deepEqual(await pausedJobs('customer_pauses', otherCustomer), []);
      assert.equal((await command('worker_pauses', publicKey, {})).status, 401);
      assert.equal((await command('customer_pauses', publicKey, {})).status, 401);

      for (const person of [customer, worker]) {
        for (const column of ['paused_by', 'resume_requested_by', 'resumed_by']) {
          assert.equal((await call(`/rest/v1/service_job_pauses?select=${column}`, person.token)).status, 403);
          assert.equal((await call(`/rest/v1/service_job_pauses?select=id&${column}=not.is.null`, person.token)).status, 403);
        }
        assert.equal((await call('/rest/v1/service_job_pauses?select=*', person.token)).status, 403);
        assert.equal((await call('/rest/v1/service_job_pauses?select=id,category,prior_stage', person.token)).status, 200);
        const write = await call('/rest/v1/service_job_pauses', person.token, { method: 'POST', body: JSON.stringify({ job_id: job, category: 'ordinary_interruption', prior_stage: 'working', paused_by: person.id, paused_from_version: 1 }) });
        assert.equal(write.status, 403);
        assert.equal((await call(`/rest/v1/service_job_pauses?job_id=eq.${job}`, person.token, { method: 'PATCH', body: JSON.stringify({ category: 'safety_concern' }) })).status, 403);
        assert.equal((await call(`/rest/v1/service_job_pauses?job_id=eq.${job}`, person.token, { method: 'DELETE' })).status, 403);
      }
      for (const table of ['service_jobs', 'service_submissions', 'service_job_events', 'service_scope_changes', 'service_job_reports']) {
        for (const person of [customer, worker]) {
          assert.equal((await call(`/rest/v1/${table}?select=*`, person.token)).status, 403, `${table} must refuse an unrestricted column list`);
        }
      }

      assert.deepEqual((await failure(await command('consent_service_resume', customer.token, { p_job_id: job, p_version: 2 }))), [400, '22023', 'invalid transition']);
      assert.equal((await command('consent_service_resume', worker.token, { p_job_id: job, p_version: 2 })).status, 403);
      assert.equal((await command('request_service_resume', customer.token, { p_job_id: job, p_version: 2 })).status, 403);
      assert.equal((await command('request_service_resume', foreignWorker.token, { p_job_id: job, p_version: 2 })).status, 403);
      const stale = await failure(await command('request_service_resume', worker.token, { p_job_id: job, p_version: 1 }));
      assert.deepEqual([stale[1], stale[2]], ['40001', 'stale job']);
      const requested = await command('request_service_resume', worker.token, { p_job_id: job, p_version: 2 });
      assert.equal(requested.status, 200);
      assert.equal(await requested.json(), 3);
      assert.equal(stage(), 'paused:3');
      const waiting = await (await command('customer_pauses', customer.token, {})).json();
      assert.equal(waiting[0].resume_requested, true);

      assert.equal((await command('consent_service_resume', otherCustomer.token, { p_job_id: job, p_version: 3 })).status, 403);
      const earlier = await failure(await command('consent_service_resume', customer.token, { p_job_id: job, p_version: 2 }));
      assert.deepEqual([earlier[1], earlier[2]], ['40001', 'stale job']);
      assert.equal(stage(), 'paused:3');

      const agreed = await command('consent_service_resume', customer.token, { p_job_id: job, p_version: 3 });
      assert.equal(agreed.status, 200);
      assert.equal(await agreed.json(), 4);
      assert.equal(stage(), 'working:4');
      assert.equal(await (await command('consent_service_resume', customer.token, { p_job_id: job, p_version: 3 })).json(), 4);
      assert.equal(query(`select count(*) from public.service_job_events where job_id='${job}' and event in ('paused','resume_requested','resumed');`).trim(), '3');
      assert.deepEqual(await (await command('customer_pauses', customer.token, {})).json(), []);

      const safety = await command('pause_service_job', worker.token, { p_job_id: job, p_version: 4, p_category: 'safety_concern' });
      assert.equal(await safety.json(), 5);
      assert.deepEqual(await failure(await command('request_service_resume', worker.token, { p_job_id: job, p_version: 5 })), [400, '22023', 'invalid transition']);
      assert.deepEqual(await failure(await command('consent_service_resume', customer.token, { p_job_id: job, p_version: 5 })), [400, '22023', 'invalid transition']);
      assert.equal(stage(), 'paused:5');
      assert.equal(query(`select count(*) from public.service_job_pauses where job_id='${job}' and resumed_at is null and category='safety_concern';`).trim(), '1');
    } finally {
      if (fixtures) query(`delete from public.service_job_pauses where job_id in ('${job}','${job2}'); delete from public.service_job_events where job_id in ('${job}','${job2}'); delete from public.service_jobs where id in ('${job}','${job2}'); delete from public.service_invitations where id in ('${invitation}','${invitation2}'); delete from public.service_quotes where id in ('${quote}','${quote2}'); delete from public.notifications where request_id in (select id from public.service_requests where id in ('${request}','${request2}')); delete from public.service_requests where id in ('${request}','${request2}');`);
      for (const account of accounts) {
        const id = typeof account === 'string' ? account : account.id;
        query(`delete from nestscout_private.worker_dispatch_eligibility where user_id='${id}'; delete from public.worker_access_grants where user_id='${id}';`);
        const removed = await fetch(`${origin}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: admin });
        assert.equal(removed.status, 200, 'Local test account cleanup failed');
      }
    }
  });
});

test('resume consent, safety escalation and duplicate consent serialize at the job', { timeout: 300000 }, async () => {
  await withLocalLock(async () => {
    const runtime = localRuntime();
    const stack = runtime.verify();
    const ids = execFileSync('docker', ['ps', '--filter', `label=com.supabase.stack=${stack.id}`, '--filter', 'label=com.supabase.service=database', '--format', '{{.ID}}'], { encoding: 'utf8' }).trim().split(/\s+/);
    assert.equal(ids.length, 1);
    assert.match(ids[0], /^[a-f0-9]{12,64}$/);
    const args = ['exec', '-i', ids[0], 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
    const query = sql => execFileSync('docker', args, { input: sql, encoding: 'utf8' });
    const run = sql => new Promise((resolve, reject) => {
      const child = spawn('docker', args);
      let errors = '';
      child.stderr.on('data', chunk => { errors += chunk; });
      child.stdout.resume();
      child.on('error', reject);
      child.on('close', code => resolve({ code, errors }));
      child.stdin.end(sql);
    });
    const [customer, worker, ...rest] = Array.from({ length: 14 }, () => randomUUID());
    const jobs = [0, 1, 2].map(index => ({ request: rest[index * 4], quote: rest[index * 4 + 1], invitation: rest[index * 4 + 2], job: rest[index * 4 + 3] }));
    const keys = Array.from({ length: 3 }, () => randomUUID());
    let created = false;
    try {
      query(`insert into auth.users (id,aud,role) values ('${customer}','authenticated','authenticated'),('${worker}','authenticated','authenticated');`);
      created = true;
      query(`insert into public.worker_access_grants (user_id) values ('${worker}'); insert into nestscout_private.worker_dispatch_eligibility (user_id,basis,active) values ('${worker}','local_fixture',true);`);
      jobs.forEach((item, index) => {
        query(`insert into public.service_requests (id,owner_id,submission_key,description) values ('${item.request}','${customer}','${keys[index]}','Pause race ${index}'); insert into public.service_quotes (id,request_id,version,scope,amount_minor,currency,expires_at,accepted_at,accepted_by) values ('${item.quote}','${item.request}',1,'Pause race',100,'VND',clock_timestamp()+interval '1 hour',clock_timestamp(),'${customer}'); insert into public.service_invitations (id,request_id,quote_id,worker_id,expires_at,state) values ('${item.invitation}','${item.request}','${item.quote}','${worker}',clock_timestamp()+interval '1 hour','accepted'); insert into public.service_jobs (id,request_id,quote_id,invitation_id,worker_id,stage,version) values ('${item.job}','${item.request}','${item.quote}','${item.invitation}','${worker}','paused',3); insert into public.service_job_pauses (job_id,category,prior_stage,paused_by,paused_from_version,resume_requested_by,resume_requested_from_version,resume_requested_at) values ('${item.job}','ordinary_interruption','working','${worker}',1,'${worker}',2,clock_timestamp());`);
      });
      const auth = actor => `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${actor}","role":"authenticated"}', true);`;
      const race = async (firstSql, secondSql) => {
        const barrier = barrierKey();
        const first = run(`begin; ${firstSql} ${holdBarrier(barrier)} commit;`);
        await waitForBarrier(query, barrier);
        const started = Date.now();
        const second = run(`begin; ${secondSql} commit;`).then(result => ({ ...result, elapsed: Date.now() - started }));
        const [winner, loser] = await Promise.all([first, second]);
        return { winner, loser };
      };

      const consentFirst = await race(`${auth(customer)} select public.consent_service_resume('${jobs[0].job}',3);`, `${auth(worker)} select public.pause_service_job('${jobs[0].job}',3,'safety_concern');`);
      assert.equal(consentFirst.winner.code, 0);
      assert.notEqual(consentFirst.loser.code, 0);
      assert.match(consentFirst.loser.errors, /stale job/);
      assert.ok(consentFirst.loser.elapsed >= 1500, 'The escalation must wait for the consent transaction');
      assert.equal(query(`select stage || ':' || version from public.service_jobs where id='${jobs[0].job}';`).trim(), 'working:4');
      assert.equal(query(`select count(*) from public.service_job_pauses where job_id='${jobs[0].job}' and category='safety_concern';`).trim(), '0');

      const escalationFirst = await race(`${auth(worker)} select public.pause_service_job('${jobs[1].job}',3,'safety_concern');`, `${auth(customer)} select public.consent_service_resume('${jobs[1].job}',3);`);
      assert.equal(escalationFirst.winner.code, 0);
      assert.notEqual(escalationFirst.loser.code, 0);
      assert.match(escalationFirst.loser.errors, /stale job/);
      assert.ok(escalationFirst.loser.elapsed >= 1500, 'The consent must wait for the escalation transaction');
      assert.equal(query(`select stage || ':' || version from public.service_jobs where id='${jobs[1].job}';`).trim(), 'paused:4');
      assert.equal(query(`select count(*) from public.service_job_pauses where job_id='${jobs[1].job}' and category='safety_concern' and resumed_at is null;`).trim(), '1');

      const duplicate = await race(`${auth(customer)} select public.consent_service_resume('${jobs[2].job}',3);`, `${auth(customer)} select public.consent_service_resume('${jobs[2].job}',3);`);
      assert.equal(duplicate.winner.code, 0);
      assert.equal(duplicate.loser.code, 0);
      assert.ok(duplicate.loser.elapsed >= 1500, 'The duplicate consent must wait for the first transaction');
      assert.equal(query(`select stage || ':' || version from public.service_jobs where id='${jobs[2].job}';`).trim(), 'working:4');
      assert.equal(query(`select count(*) from public.service_job_events where job_id='${jobs[2].job}' and event='resumed';`).trim(), '1');
    } finally {
      if (created) {
        const jobIds = jobs.map(item => `'${item.job}'`).join(',');
        query(`delete from public.service_job_pauses where job_id in (${jobIds}); delete from public.service_job_events where job_id in (${jobIds}); delete from public.service_jobs where id in (${jobIds}); delete from public.service_invitations where id in (${jobs.map(item => `'${item.invitation}'`).join(',')}); delete from public.service_quotes where id in (${jobs.map(item => `'${item.quote}'`).join(',')}); delete from public.notifications where request_id in (select id from public.service_requests where id in (${jobs.map(item => `'${item.request}'`).join(',')})); delete from public.service_requests where id in (${jobs.map(item => `'${item.request}'`).join(',')}); delete from nestscout_private.worker_dispatch_eligibility where user_id='${worker}'; delete from public.worker_access_grants where user_id='${worker}'; delete from auth.users where id in ('${customer}','${worker}');`);
      }
    }
  });
});

function knowledgeFixture(id, overrides = {}) {
  return { ...knowledgeSources.find(item => item.source_id === 'product.privacy'), source_id: id, title: 'Isolated synthetic integration fixture', content: 'Chỉ là fixture kiểm thử; không phải chính sách hay dữ liệu nghiệp vụ.', ...overrides };
}

test('real Auth JWT and PostgREST enforce source ownership, publication and write denial', { timeout: 120000 }, async () => {
  await withLocalLock(async () => {
    const runtime = localRuntime();
    const verified = runtime.verify();
    const status = runtime.status();
    assert.equal(status.identity.id, verified.id);
    const database = localKnowledgeDatabase();
    const origin = verified.endpoints['rest.http'].url.replace(/\/$/, '');
    const accounts = [];
    const sourceId = `fixture.rest-${randomUUID()}`;
    const pricedSourceId = `cleaning.price-boundary-${randomUUID()}`;
    const rpc = (token, name, body) => fetch(`${origin}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: status.env.ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
    try {
      for (let index = 0; index < 2; index++) {
        const email = `${randomUUID()}@example.invalid`;
        const password = randomUUID();
        const created = await fetch(`${origin}/auth/v1/admin/users`, {
          method: 'POST', headers: { apikey: status.env.SERVICE_ROLE_KEY, authorization: `Bearer ${status.env.SERVICE_ROLE_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({ email, password, email_confirm: true }), signal: AbortSignal.timeout(10000),
        });
        assert.equal(created.status, 200);
        const account = await created.json();
        accounts.push({ id: account.id, token: null });
        const login = await fetch(`${origin}/auth/v1/token?grant_type=password`, {
          method: 'POST', headers: { apikey: status.env.ANON_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(10000),
        });
        assert.equal(login.status, 200);
        accounts[index].token = (await login.json()).access_token;
      }
      const source = knowledgeFixture(sourceId, { visibility: 'owner', owner_id: accounts[0].id });
      const originalPricedSource = knowledgeSources.find(item => item.source_id === 'cleaning.desk-surface');
      const pricedSource = { ...originalPricedSource, source_id: pricedSourceId, case_data: { ...originalPricedSource.case_data, case_id: pricedSourceId } };
      database.query(`begin; ${knowledgeSeedSql(await knowledgeSnapshot([source, pricedSource]))} commit;`);
      const sourcePath = `${origin}/rest/v1/kael_knowledge_sources?source_id=eq.${pricedSourceId}`;
      const userHeaders = { apikey: status.env.ANON_KEY, authorization: `Bearer ${accounts[0].token}` };
      for (const select of ['source', 'source->case_data->price_prior', '*']) {
        const denied = await fetch(`${sourcePath}&select=${encodeURIComponent(select)}`, { headers: userHeaders, signal: AbortSignal.timeout(10000) });
        assert.equal(denied.status, 403, `${select}: ordinary authenticated clients cannot read numeric priors`);
        await denied.body?.cancel();
      }
      const publicRead = await fetch(`${sourcePath}&select=source_id,public_source`, { headers: userHeaders, signal: AbortSignal.timeout(10000) });
      assert.equal(publicRead.status, 200);
      const publicRows = await publicRead.json();
      assert.equal(publicRows[0].public_source.case_data.case_id, pricedSourceId);
      assert.equal(publicRows[0].public_source.case_data.price_prior, null);
      assert.ok(!JSON.stringify(publicRows).includes('min_vnd'));
      const pricedLookup = await rpc(accounts[0].token, 'kael_knowledge_search', { p_query: '', p_limit: 1, p_source_id: pricedSourceId });
      assert.equal(pricedLookup.status, 200);
      const pricedResult = await pricedLookup.json();
      assert.equal(pricedResult.items[0].case_data.case_id, pricedSourceId);
      assert.equal(pricedResult.items[0].case_data.price_prior, null);
      assert.ok(!JSON.stringify(pricedResult).includes('min_vnd'));
      const forgedPricingFlag = await rpc(accounts[0].token, 'kael_knowledge_search', { p_query: '', p_limit: 1, p_source_id: pricedSourceId, p_include_prices: true });
      assert.notEqual(forgedPricingFlag.status, 200, 'clients cannot enable experimental pricing through RPC arguments');
      await forgedPricingFlag.body?.cancel();
      const query = { p_query: '', p_limit: 1, p_source_id: sourceId };
      const owner = await rpc(accounts[0].token, 'kael_knowledge_search', query);
      assert.equal(owner.status, 200);
      assert.equal((await owner.json()).items[0].source_id, sourceId);
      const other = await rpc(accounts[1].token, 'kael_knowledge_search', query);
      assert.equal(other.status, 200);
      assert.deepEqual((await other.json()).items, []);
      const anonymous = await rpc(status.env.ANON_KEY, 'kael_knowledge_search', query);
      assert.notEqual(anonymous.status, 200);
      await anonymous.body?.cancel();
      const write = await fetch(`${origin}/rest/v1/kael_knowledge_sources?source_id=eq.${sourceId}`, {
        method: 'PATCH', headers: { apikey: status.env.ANON_KEY, authorization: `Bearer ${accounts[0].token}`, 'content-type': 'application/json' }, body: JSON.stringify({ publication: 'published' }), signal: AbortSignal.timeout(10000),
      });
      assert.equal(write.status, 403);
      await write.body?.cancel();
      const withdrawn = { ...source, revision: 2, supersedes_revision: 1, publication: 'withdrawn' };
      database.query(`begin; ${knowledgeSeedSql(await knowledgeSnapshot([withdrawn]))} commit;`);
      const after = await rpc(accounts[0].token, 'kael_knowledge_search', query);
      assert.equal(after.status, 200);
      assert.deepEqual((await after.json()).items, []);
      const forgedServiceToken = await rpc(status.env.SERVICE_ROLE_KEY, 'kael_knowledge_search', query);
      assert.notEqual(forgedServiceToken.status, 200, 'server token is not a user-query bypass');
      await forgedServiceToken.body?.cancel();
    } finally {
      database.query(`delete from public.kael_knowledge_sources where source_id in (${sqlLiteral(sourceId)}, ${sqlLiteral(pricedSourceId)});`);
      for (const account of accounts) {
        assert.match(account.id, /^[a-f0-9-]{36}$/);
        database.query(`delete from auth.users where id = ${sqlLiteral(account.id)}::uuid;`);
      }
    }
  });
});

test('provenance revisions bootstrap fresh SQL sources and improve paraphrases without exposing unapproved policies', { timeout: 120000 }, async () => {
  await withLocalLock(async () => {
    const database = localKnowledgeDatabase();
    const id = `fixture.provenance-${randomUUID()}`;
    const actor = randomUUID();
    const revisions = (await knowledgeSeedSnapshot()).filter(source => source.source_id === 'product.provenance').map(source => ({ ...source, source_id: id }));
    const seed = knowledgeSeedSql(revisions);
    const queries = ['Dữ liệu mô phỏng có tương đương chứng từ giao dịch không?', 'Nguồn agent tạo có phải hồ sơ giao dịch thật không?', 'Thông tin từ mã nguồn đã được phê duyệt kinh doanh chưa?', 'Biểu phí giao dịch mã ZR4821'];
    const output = database.query(`begin;
insert into auth.users (id, aud, role) values (${sqlLiteral(actor)}, 'authenticated', 'authenticated');
${seed}
${seed}
${knowledgeSeedSql(revisions.slice(0, -1))}
select jsonb_build_object('versions', (select jsonb_agg(jsonb_build_object('revision', revision, 'current', is_current) order by revision) from public.kael_knowledge_sources where source_id = ${sqlLiteral(id)}));
set local role authenticated;
select set_config('request.jwt.claims', ${sqlLiteral(JSON.stringify({ sub: actor, role: 'authenticated', is_anonymous: false }))}, true) is not null;
select jsonb_build_object('queries', (select jsonb_agg(public.kael_knowledge_search(value, 5, null)) from jsonb_array_elements_text(${sqlLiteral(JSON.stringify(queries))}::jsonb)));
rollback;`);
    const measured = output.trim().split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
    assert.deepEqual(measured[0].versions, [{ revision: 1, current: false }, { revision: 2, current: false }, { revision: 3, current: true }]);
    for (const result of measured[1].queries.slice(0, -1)) {
      assert.equal(result.status, 'matched');
      const item = result.items.find(item => item.source_id === id);
      assert.ok(item);
      assert.equal(item.source_revision, 3);
      assert.equal(item.provenance, 'repository_contract');
      assert.equal(item.corpus_version, 'kael-vi-2026-11-05-v3');
      assert.equal(item.citation_ref, `kael:${id}@3#${item.content_hash}`);
      assert.ok(result.items.every(item => !item.source_id.startsWith('policy.')));
    }
    assert.equal(measured[1].queries.at(-1).status, 'no_reliable_match');
    assert.deepEqual(measured[1].queries.at(-1).items, []);
  });
});

test('concurrent ingestion serializes identical revisions and never resurrects a withdrawn version', { timeout: 120000 }, async () => {
  await withLocalLock(async () => {
    const database = localKnowledgeDatabase();
    const id = `fixture.race-${randomUUID()}`;
    const source = knowledgeFixture(id);
    const snapshot = await knowledgeSnapshot([source]);
    const seed = knowledgeSeedSql(snapshot);
    const barrier = Number.parseInt(randomUUID().slice(0, 7), 16);
    let first;
    let second;
    try {
      first = database.concurrentTransaction(`${seed} select pg_advisory_xact_lock(161908, ${barrier});`);
      const deadline = Date.now() + 15000;
      let acquired = false;
      while (Date.now() < deadline) {
        acquired = database.query(`select pg_try_advisory_lock(161908, ${barrier});`).trim() === 'f';
        if (acquired) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.ok(acquired, 'first writer reached barrier after holding source lock');
      second = database.concurrentTransaction(seed);
      assert.ok(Number(database.query(`select count(*) from pg_stat_activity where wait_event = 'advisory' and query like ${sqlLiteral(`%${id}%`)};`).trim()) >= 1, 'competing ingestion actually waits on the first source transaction');
      first.commit();
      await first.done;
      second.commit();
      await second.done;
      assert.equal(database.query(`select count(*) from public.kael_knowledge_sources where source_id = ${sqlLiteral(id)};`).trim(), '1');
      const withdrawn = await knowledgeSnapshot([{ ...source, revision: 2, supersedes_revision: 1, publication: 'withdrawn' }]);
      database.query(`begin; ${knowledgeSeedSql(withdrawn)} commit;`);
      database.query(`begin; ${seed} commit;`);
      assert.equal(database.query(`select publication || ':' || revision from public.kael_knowledge_sources where source_id = ${sqlLiteral(id)} and is_current;`).trim(), 'withdrawn:2');
    } finally {
      first?.rollback();
      second?.rollback();
      await Promise.allSettled([first?.done, second?.done].filter(Boolean));
      database.query(`delete from public.kael_knowledge_sources where source_id = ${sqlLiteral(id)};`);
    }
  });
});

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const end = result => result.events.at(-1);
const approvalOf = result => result.events.find(event => event.type === 'approval_required')?.approval;
const conversationOf = result => result.events[0].conversation_id;
const outcomes = result => result.events.filter(event => event.type === 'tool_completed').map(event => `${event.tool}:${event.outcome}`);

function draftSteps({ missing = false, submit = true } = {}) {
  return [
    { tools: [call('task_create', { title: 'Synthetic local service request', kind: 'service_request', status: 'running', note: '' })] },
    request => ({ tools: [call('service_request_draft', {
      task_id: lastToolResults(request)[0].task.id, description: 'Synthetic local repair',
      location: missing ? '' : 'Synthetic local location', preferred_time: 'Synthetic local time', missing: missing ? ['location'] : [],
    })] }),
    ...(submit ? [request => ({ tools: [call('service_request_submit', { task_id: lastToolResults(request)[0].task.id })] })] : []),
    { text: [missing ? 'Please provide a location.' : 'Prepared, not submitted.'] },
  ];
}

test('owned local Kael gateway uses authentic Auth sessions and real PostgreSQL; AI is scripted only in tests', { timeout: 300000 }, async t => {
  await withLocalLock(async () => {
    const runtime = localRuntime();
    const stack = runtime.verify();
    const status = runtime.status();
    const origin = stack.endpoints['rest.http'].url;
    const publicKey = status.env.PUBLISHABLE_KEY;
    const serviceKey = status.env.SERVICE_ROLE_KEY;
    assert.ok(publicKey?.startsWith('sb_publishable_'));
    assert.ok(serviceKey?.startsWith('eyJ'));
    const containers = execFileSync('docker', ['ps', '--filter', `label=com.supabase.stack=${stack.id}`, '--filter', 'label=com.supabase.service=database', '--format', '{{.ID}}'], { encoding: 'utf8' }).trim().split(/\s+/);
    assert.equal(containers.length, 1);
    assert.match(containers[0], /^[a-f0-9]{12,64}$/);
    const query = sql => execFileSync('docker', ['exec', '-i', containers[0], 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const env = { SUPABASE_URL: origin, SUPABASE_ANON_KEY: publicKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey };
    const accounts = [];
    const traces = {};
    const initialUsers = query('select count(*) from auth.users;');
    const request = (route, token, body, admin = false) => fetch(`${origin}${route}`, {
      method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(30000),
      headers: { apikey: admin ? serviceKey : publicKey, ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const rpc = async (user, name, body = {}) => {
      const response = await request(`/rest/v1/rpc/${name}`, user.token, body);
      assert.equal(response.status, 200, `RPC ${name} must succeed`);
      return response.json();
    };
    const newUser = async ({ consent = true } = {}) => {
      const email = `${randomUUID()}@example.invalid`;
      const password = randomUUID();
      const created = await request('/auth/v1/admin/users', serviceKey, { email, password, email_confirm: true }, true);
      assert.equal(created.status, 200, 'Supported local admin provisioning must succeed without SMS');
      const account = await created.json();
      assert.match(account.id, uuid);
      const user = { id: account.id, token: null };
      accounts.push(user);
      if (consent) query(`insert into public.consent_events (user_id, purpose, granted, policy_version) values ('${account.id}', 'ai_sharing', true, '2026-11-09');`);
      const login = await request('/auth/v1/token?grant_type=password', null, { email, password });
      assert.equal(login.status, 200, 'Supported local password session must succeed');
      const session = await login.json();
      user.token = session.access_token;
      const claims = JSON.parse(Buffer.from(user.token.split('.')[1], 'base64url').toString());
      assert.equal(claims.sub, user.id);
      assert.equal(claims.role, 'authenticated');
      assert.ok(claims.exp > Date.now() / 1000);
      const verified = await request('/auth/v1/user', user.token);
      assert.equal(verified.status, 200, 'Real Auth verifies its own signed JWT');
      assert.equal((await verified.json()).id, user.id);
      return user;
    };
    const send = async (handle, user, action = { type: 'message', text: 'Synthetic local message' }, conversation = null, mode = 'client', requestId = randomUUID()) => {
      const body = { request_id: requestId, conversation_id: conversation, mode, action };
      const response = await handle(new Request(`${origin}/functions/v1/kael`, {
        method: 'POST', headers: { ...(user ? { authorization: `Bearer ${user.token}` } : {}), apikey: publicKey, 'content-type': 'application/json' }, body: JSON.stringify(body),
      }));
      if (!response.headers.get('content-type')?.startsWith('application/x-ndjson')) return { status: response.status, error: await response.json(), events: [] };
      const raw = await response.text();
      const events = raw.trim().split('\n').map(line => parseKaelEvent(line));
      const sequence = createKaelSequence();
      assert.ok(events.length >= 2);
      for (const event of events) {
        assert.ok(event, 'Real gateway events must satisfy the recovered mobile parser');
        assert.equal(sequence(event), 'accept');
      }
      assert.ok(['run_completed', 'run_failed'].includes(events.at(-1).type));
      assert.ok(events.every(event => event.run_id === events[0].run_id));
      assert.deepEqual(events.map(event => event.seq), events.map((_, index) => index + 1));
      return { status: response.status, events, raw, requestId };
    };
    const gateway = (steps, { effects = false, fetcher = fetch } = {}) => {
      const provider = scriptedProvider('anthropic', steps);
      return { provider, handle: createKaelHandler({ env: { ...env, ...(effects ? { KAEL_ENABLED_EFFECTS: 'service_request_submit' } : {}) }, providers: () => [provider], fetcher, log: () => {} }) };
    };
    const decision = (type, approval) => ({ type, approval_id: approval.id, fingerprint: approval.fingerprint });
    const countEffects = user => Number(query(`select count(*) from public.service_requests where owner_id='${user.id}';`));
    try {
      await t.test('real Edge Function rejects guests and invalid JWTs and honestly persists provider unavailability', async () => {
        const user = await newUser();
        const edge = req => fetch(req);
        assert.equal((await send(edge, null)).status, 401);
        assert.equal((await send(edge, { token: 'invalid-token-aaaaaaaaaaaaaaaaaaaa' })).status, 401);
        const result = await send(edge, user);
        assert.equal(result.status, 200);
        assert.equal(end(result).type, 'run_failed');
        assert.equal(end(result).code, 'provider_unavailable');
        assert.equal(query(`select status from public.kael_runs where id='${result.events[0].run_id}';`), 'failed');
        traces.edgeUnavailable = result.events;
        const readiness = await fetch(`${origin}/functions/v1/kael`, { headers: {
          apikey: publicKey, authorization: `Bearer ${user.token}`, 'x-kael-readiness': '1',
        } });
        assert.equal(readiness.status, 503);
        const report = await readiness.json();
        assert.equal(report.database, 'verified');
        assert.equal(report.deepseek, 'credential_missing');
        assert.equal(report.anthropic, 'credential_missing');
        assert.equal(report.web_search, 'requires PERPLEXITY_API_KEY and KAEL_WEB_SEARCH=enabled');
        assert.equal(report.effects, 'none');
        assert.equal(report.readiness_scope, 'configuration_only');
        assert.equal(report.provider_probe, 'not_run');
        assert.ok(!JSON.stringify(report).includes(serviceKey));
      });
      await t.test('a real local Edge worker streams a provider fixture and preserves exact Markdown in history', async () => {
        const owner = await newUser();
        const other = await newUser();
        const slug = `kael-fixture-${randomUUID().slice(0, 8)}`;
        const directory = path.join(root, 'supabase', 'functions', slug);
        const entry = path.join(directory, 'index.ts');
        const reply = '    const dấu = 1 < 2;\n\n**An toàn**  \n';
        const providerFrames = [
          { model: 'deepseek-flash', choices: [{ delta: { content: reply }, finish_reason: null }] },
          { model: 'deepseek-flash', choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 7, completion_tokens: 6 } },
        ].map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n';
        const fixture = [
          "import { createKaelHandler } from '../../../services/kael-core/src/gateway.ts';",
          "const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';",
          "const api = new URL(supabaseUrl);",
          "if (api.protocol !== 'http:' || !['127.0.0.1', 'localhost', 'host.supabase.internal', 'host.docker.internal'].includes(api.hostname)) throw new Error('Local fixture only');",
          "const env = { SUPABASE_URL: supabaseUrl, SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY'), SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), DEEPSEEK_API_KEY: 'fixture-no-provider-secret' };",
          'Deno.serve(createKaelHandler({ env, fetcher: (url, init) => {',
          "  if (new URL(url).origin === api.origin) return fetch(url, init);",
          "  if (url !== 'https://api.deepseek.com/chat/completions' || new Headers(init.headers).get('authorization') !== 'Bearer fixture-no-provider-secret') throw new Error('Fixture denied outbound request');",
          `  return Promise.resolve(new Response(${JSON.stringify(providerFrames)}, { headers: { 'content-type': 'text/event-stream' } }));`,
          '} }));',
          '',
        ].join('\n');
        mkdirSync(directory);
        try {
          writeFileSync(entry, fixture, { flag: 'wx' });
          const handle = req => fetch(new Request(`${origin}/functions/v1/${slug}`, req));
          const result = await send(handle, owner);
          assert.equal(result.status, 200);
          assert.equal(end(result).type, 'run_completed');
          assert.equal(end(result).text, reply);
          const snapshot = parseKaelConversationSnapshot(await rpc(owner, 'kael_conversation_state', { p_mode: 'client' }));
          assert.equal(snapshot.messages.at(-1).text, reply);
          const otherSnapshot = parseKaelConversationSnapshot(await rpc(other, 'kael_conversation_state', { p_mode: 'client' }));
          assert.deepEqual(otherSnapshot.messages, []);
          assert.equal(countEffects(owner), 0);
        } finally {
          rmSync(entry, { force: true });
          rmdirSync(directory);
        }
      });
      await t.test('an account without AI-sharing consent is refused before any provider call', async () => {
        const user = await newUser({ consent: false });
        const g = gateway([{ text: ['Không được gọi.'] }]);
        const refused = await send(g.handle, user);
        assert.equal(refused.status, 403);
        assert.equal(refused.error.error.code, 'consent_required');
        assert.equal(g.provider.requests.length, 0);
        assert.equal(query(`select count(*) from public.kael_runs where owner_id='${user.id}';`), '0');
      });
      await t.test('real JWT roles, RLS and server-only RPC permissions enforce account boundaries', async () => {
        const customer = await newUser();
        const worker = await newUser();
        assert.deepEqual(await rpc(customer, 'kael_actor_capabilities'), { customer: true, worker: false });
        query(`insert into public.worker_access_grants(user_id) values ('${worker.id}');`);
        assert.deepEqual(await rpc(worker, 'kael_actor_capabilities'), { customer: true, worker: false });
        query(`insert into nestscout_private.worker_dispatch_eligibility(user_id,basis,active) values ('${worker.id}','local_fixture',true);`);
        assert.deepEqual(await rpc(worker, 'kael_actor_capabilities'), { customer: true, worker: true });
        const g = gateway([{ text: ['Synthetic ', 'reply.'] }]);
        const first = await send(g.handle, customer);
        assert.equal(end(first).type, 'run_completed');
        const conversation = conversationOf(first);
        const otherRows = await request(`/rest/v1/kael_messages?select=id&conversation_id=eq.${conversation}`, worker.token);
        assert.equal(otherRows.status, 200);
        assert.deepEqual(await otherRows.json(), []);
        assert.equal((await send(g.handle, worker, undefined, conversation)).status, 400);
        const forged = await request('/rest/v1/rpc/kael_start_run', customer.token, { p_actor: customer.id, p_request_id: randomUUID(), p_conversation_id: null, p_mode: 'client', p_user_text: 'Forged' });
        assert.ok([401, 403].includes(forged.status));
        const snapshot = parseKaelConversationSnapshot(await rpc(customer, 'kael_conversation_state', { p_mode: 'client' }));
        assert.ok(snapshot);
        assert.equal(snapshot.conversationId, conversation);
        assert.equal(snapshot.messages.at(-1).text, 'Synthetic reply.');
        assert.equal(snapshot.tasks.length, 0);
        traces.greeting = first.events;
        traces.restored = snapshot;
      });
      await t.test('authenticated users can use the configured DeepSeek primary and Anthropic fallback', async () => {
        const owner = await newUser();
        const other = await newUser();
        const primary = scriptedProvider('deepseek', [
          { error: 'overloaded' },
          { text: ['DeepSeek primary reply.'] },
        ]);
        const fallback = scriptedProvider('anthropic', [{ text: ['Anthropic fallback reply.'] }]);
        const handler = createKaelHandler({
          env: { ...env, DEEPSEEK_API_KEY: 'fixture-deepseek', ANTHROPIC_API_KEY: 'fixture-anthropic',
            KAEL_ANTHROPIC_MODEL: 'claude-sonnet-4-5', KAEL_MODEL_ROUTE: 'deepseek,anthropic' },
          providers: () => [primary, fallback],
          fetcher: async (url, init) => {
            return fetch(url, init);
          },
          log: () => {},
        });
        const fallbackTurn = await send(handler, owner);
        const primaryTurn = await send(handler, other);
        assert.equal(end(fallbackTurn).type, 'run_completed');
        assert.equal(end(fallbackTurn).text, 'Anthropic fallback reply.');
        assert.equal(end(primaryTurn).type, 'run_completed');
        assert.equal(end(primaryTurn).text, 'DeepSeek primary reply.');
        assert.equal(primary.requests.length, 2);
        assert.equal(fallback.requests.length, 1);
        assert.equal(query("select to_regclass('nestscout_private.kael_provider_budgets') is null;"), 't');
      });

      await t.test('opted-in web search passes fixture sources through Kael with real Auth and PostgreSQL', async () => {
        const owner = await newUser();
        const credential = 'fixture-no-provider-secret';
        const source = { title: 'Fixture source', url: 'https://example.invalid/fixture', snippet: 'Fixture search result.' };
        const prompt = 'Find a public source.';
        let searchCalls = 0;
        const fetcher = async (url, init) => {
          if (new URL(url).origin === origin) return fetch(url, init);
          assert.equal(url, 'https://api.perplexity.ai/search');
          assert.equal(init.method, 'POST');
          assert.ok(new Headers(init.headers).get('authorization') === `Bearer ${credential}`, 'Fixture credential did not stay on the search adapter');
          assert.deepEqual(JSON.parse(init.body), { query: prompt, max_results: 5, max_tokens_per_page: 512 });
          searchCalls++;
          return Response.json({ results: [source] });
        };
        const run = (optIn, steps) => {
          const provider = scriptedProvider('anthropic', steps);
          return send(createKaelHandler({
            env: { ...env, PERPLEXITY_API_KEY: credential, KAEL_WEB_SEARCH: optIn },
            providers: () => [provider], fetcher, log: () => {},
          }), owner);
        };
        const disabled = await run('disabled', [request => {
          assert.ok(!request.tools.some(tool => tool.name === 'web_search'));
          return { text: ['Search is disabled.'] };
        }]);
        assert.equal(end(disabled).type, 'run_completed');
        assert.equal(searchCalls, 0);
        const enabled = await run('enabled', [
          request => {
            assert.ok(request.tools.some(tool => tool.name === 'web_search'));
            return { tools: [call('web_search', { query: prompt })] };
          },
          request => {
            const [result] = lastToolResults(request);
            assert.equal(result.outcome, 'succeeded');
            assert.deepEqual(result.results, [{ ...source, date: null, lastUpdated: null }]);
            return { text: [`[Fixture source](${source.url})`] };
          },
        ]);
        assert.equal(end(enabled).type, 'run_completed');
        assert.equal(searchCalls, 1);
        assert.ok(!enabled.raw.includes(credential));
        const snapshot = parseKaelConversationSnapshot(await rpc(owner, 'kael_conversation_state', { p_mode: 'client' }));
        assert.equal(snapshot.conversationId, conversationOf(enabled));
        assert.equal(snapshot.messages.at(-1).text, `[Fixture source](${source.url})`);
        assert.equal(countEffects(owner), 0);
        assert.equal(query(`select count(*) from nestscout_private.kael_approvals where owner_id='${owner.id}';`), '0');
      });
      await t.test('memory is explicit, isolated by account and mode, and independent of business state', async () => {
        const owner = await newUser();
        const other = await newUser();
        const attempts = [];
        const logs = [];
        const fixture = 'fixture-provider-credential';
        const englishReply = '**Check the saved decision**';
        const vietnameseReply = '**Phản hồi thử nghiệm**';
        const englishPrompts = new Set(['Tóm tắt quyết định của tôi.', 'Xin chào.', 'không phải ngắn gọn, là chi tiết', 'How do I maintain a tap?']);
        const newHandler = () => createKaelHandler({
          env: { ...env, DEEPSEEK_API_KEY: fixture },
          log: event => logs.push(event),
          fetcher: async (url, init) => {
            if (url.startsWith(origin + '/')) return fetch(url, init);
            assert.equal(url, 'https://api.deepseek.com/chat/completions');
            assert.equal(init.headers.authorization, `Bearer ${fixture}`);
            const request = JSON.parse(init.body);
            attempts.push(request);
            const content = englishPrompts.has(request.messages.at(-1).content) ? englishReply : vietnameseReply;
            const delta = { model: 'deepseek-flash', choices: [{ delta: { content }, finish_reason: null }] };
            const terminal = { model: 'deepseek-flash', choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 21, completion_tokens: 5 } };
            return new Response(`data: ${JSON.stringify(delta)}\n\ndata: ${JSON.stringify(terminal)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
          },
        });
        const manage = (user, action, preference, value, mode = 'client', previous) => rpc(user, 'kael_manage_memory', {
          p_mode: mode, p_action: action, p_preference: preference, p_value: value, p_previous: previous,
        });
        const preferences = user => request('/rest/v1/kael_memory_preferences?select=mode,preference,value,source', user.token).then(response => response.json());
        const message = text => ({ type: 'message', text });
        const sendMessage = (user, text, id, mode) => send(newHandler(), user, message(text), id, mode);
        const oldText = 'Quyết định: dùng kệ màu xanh.';
        const first = await sendMessage(owner, oldText);
        const conversation = conversationOf(first);
        const run = first.events[0].run_id;
        assert.equal(end(first).text, vietnameseReply);
        assert.equal(query(`select status || ':' || input_tokens || ':' || output_tokens from public.kael_runs where id='${run}';`), 'completed:21:5');
        assert.equal(await manage(owner, 'save', 'detail', 'brief'), false, 'memory is off by default');
        assert.equal(await manage(owner, 'enable'), true);
        assert.equal(await manage(owner, 'save', 'detail', 'brief'), true);
        assert.equal(await manage(owner, 'save', 'format', 'steps'), true);
        assert.equal(await manage(owner, 'save', 'language', 'en'), true);
        const rejected = await request('/rest/v1/rpc/kael_manage_memory', owner.token, { p_mode: 'client', p_action: 'save', p_preference: 'detail', p_value: 'sensitive free text' });
        assert.ok(rejected.status >= 400);
        const guest = await request('/rest/v1/rpc/kael_manage_memory', null, { p_mode: 'client', p_action: 'enable' });
        assert.ok([401, 403].includes(guest.status));
        const worker = await request('/rest/v1/rpc/kael_manage_memory', owner.token, { p_mode: 'worker', p_action: 'enable' });
        assert.ok([401, 403].includes(worker.status));
        const forged = await request(`/rest/v1/kael_memory_preferences?select=value&owner_id=eq.${owner.id}`, other.token);
        assert.deepEqual(await forged.json(), []);
        assert.deepEqual(await preferences(other), []);
        query(`insert into public.kael_messages(conversation_id,owner_id,run_id,seq,role,content)
          select '${conversation}','${owner.id}','${run}',i,'user',
          case when i=3 then 'OTP 123456' when i=4 then 'Đính chính: màu xanh lá.' else 'Trao đổi số ' || i end
          from generate_series(3,24) i;`);
        const summarized = await sendMessage(owner, 'Tóm tắt quyết định của tôi.', conversation);
        assert.equal(end(summarized).text, englishReply);
        let sent = attempts.at(-1).messages;
        assert.equal(sent.at(-1).content, 'Tóm tắt quyết định của tôi.');
        assert.ok(sent.length <= 18);
        assert.ok(!sent.slice(1).some(item => item.content === oldText), 'the original decision left the transcript window');
        assert.ok(!sent[0].content.includes(oldText), 'quotes never enter the system message');
        assert.ok(sent[1].content.includes(oldText));
        assert.ok(sent[1].content.includes('Đính chính: màu xanh lá.'));
        assert.ok(!sent[1].content.includes('123456'));
        const forgedSummary = await rpc(other, 'kael_context_summary', { p_conversation_id: conversation, p_mode: 'client', p_before_seq: 20 });
        assert.deepEqual(forgedSummary.items, []);
        const recalled = await sendMessage(owner, 'Xin chào.');
        assert.notEqual(conversationOf(recalled), conversation);
        assert.equal(end(recalled).text, englishReply);
        sent = attempts.at(-1).messages;
        assert.match(sent[0].content, /Reply language: English/);
        assert.doesNotMatch(sent[1].content, /"language"/);
        assert.match(sent[1].content, /"detail","value":"brief"/);
        assert.doesNotMatch(sent[1].content, /"format","value":"steps"|màu xanh/);
        await sendMessage(owner, 'không phải ngắn gọn, là chi tiết', conversationOf(recalled));
        assert.deepEqual((await preferences(owner)).find(item => item.preference === 'detail'), { mode: 'client', preference: 'detail', value: 'detailed', source: 'explicit_chat' });
        assert.equal(await manage(owner, 'correct', 'detail', 'brief', 'client', 'brief'), false, 'stale compare-and-set cannot overwrite a correction');
        const corrected = await sendMessage(owner, 'không phải tiếng Anh, là tiếng Việt', conversationOf(recalled));
        assert.equal(end(corrected).text, vietnameseReply);
        assert.match(attempts.at(-1).messages[0].content, /Reply language: Vietnamese/);
        assert.equal(await manage(owner, 'correct', 'language', 'en', 'client', 'en'), false);
        assert.equal(await manage(owner, 'remove', 'language'), true);
        await sendMessage(owner, 'How do I maintain a tap?');
        assert.match(attempts.at(-1).messages[0].content, /Otherwise match that message’s language/);
        await sendMessage(other, 'Hướng dẫn bảo trì.');
        assert.ok(!attempts.at(-1).messages.some(item => /"detail"|"format"/.test(item.content)));
        query(`insert into public.worker_access_grants(user_id) values ('${owner.id}'); insert into nestscout_private.worker_dispatch_eligibility(user_id,basis,active) values ('${owner.id}','local_fixture',true);`);
        await sendMessage(owner, 'Hướng dẫn bảo trì.', null, 'worker');
        assert.ok(!attempts.at(-1).messages.some(item => /"detail"|"format"/.test(item.content)));
        assert.equal(await manage(owner, 'enable', undefined, undefined, 'worker'), true);
        assert.equal(await manage(owner, 'save', 'detail', 'brief', 'worker'), true);
        const races = await Promise.all([1, 2].map(() => manage(owner, 'correct', 'detail', 'detailed', 'worker', 'brief')));
        assert.deepEqual(races.sort(), [false, true]);
        assert.equal(await manage(owner, 'remove', 'detail'), true);
        assert.equal(await manage(owner, 'disable'), true);
        assert.equal(await manage(owner, 'enable'), true);
        await sendMessage(owner, 'Hướng dẫn bảo trì.');
        assert.deepEqual((await preferences(owner)).filter(item => item.mode === 'client'), []);
        assert.ok(!attempts.at(-1).messages.some(item => /"detail"|"format"/.test(item.content)));
        assert.ok(!JSON.stringify(logs).includes(fixture));
        assert.equal(countEffects(owner), 0);
      });
      await t.test('duplicate request IDs replay the same persisted run without another model call', async () => {
        const user = await newUser();
        const g = gateway([{ text: ['Single persisted reply.'] }]);
        const requestId = randomUUID();
        const first = await send(g.handle, user, undefined, null, 'client', requestId);
        const repeated = await send(g.handle, user, undefined, conversationOf(first), 'client', requestId);
        assert.equal(repeated.events[0].replayed, true);
        assert.equal(repeated.events[0].run_id, first.events[0].run_id);
        assert.equal(end(repeated).text, end(first).text);
        assert.equal(g.provider.requests.length, 1);
        assert.equal(query(`select count(*) from public.kael_runs where owner_id='${user.id}';`), '1');
      });
      await t.test('missing input, legal transitions, tool denials and Worker eligibility use real persistence', async () => {
        const user = await newUser();
        const g = gateway(draftSteps({ missing: true, submit: false }));
        const draft = await send(g.handle, user);
        assert.equal(end(draft).type, 'run_completed');
        assert.equal(draft.events.filter(event => event.type === 'task_updated').at(-1).task.status, 'waiting_for_input');
        assert.equal(approvalOf(draft), undefined);
        assert.equal(countEffects(user), 0);
        const task = draft.events.find(event => event.type === 'task_updated').task;
        const denied = gateway([{ tools: [call('task_update', { task_id: task.id, status: 'completed', note: '' }), call('worker_jobs', {})] }, { text: ['Denied operations did not prevent a reply.'] }]);
        const refused = await send(denied.handle, user, undefined, conversationOf(draft));
        assert.deepEqual(outcomes(refused), ['task_update:denied', 'worker_jobs:denied']);
        const workerGateway = gateway([{ tools: [call('worker_jobs', {})] }, { text: ['No worker data.'] }]);
        const notEligible = await send(workerGateway.handle, user, undefined, null, 'worker');
        assert.deepEqual(outcomes(notEligible), ['worker_jobs:denied']);
        query(`insert into public.worker_access_grants(user_id) values ('${user.id}'); insert into nestscout_private.worker_dispatch_eligibility(user_id,basis,active) values ('${user.id}','local_fixture',true);`);
        const allowed = gateway([{ tools: [call('worker_jobs', {}), call('worker_job_status', { job_id: randomUUID() })] }, { text: ['Only accessible work is shown.'] }]);
        const result = await send(allowed.handle, user, undefined, null, 'worker');
        assert.deepEqual(outcomes(result), ['worker_jobs:succeeded', 'worker_job_status:unavailable']);
        traces.missingInput = draft.events;
      });
      await t.test('explicit approval binds the fingerprint, ordinary text cannot approve, rejection creates no effect', async () => {
        const user = await newUser();
        const g = gateway([...draftSteps(), { text: ['Use the explicit confirmation control.'] }], { effects: true });
        const draft = await send(g.handle, user);
        const approval = approvalOf(draft);
        assert.ok(approval);
        const conversation = conversationOf(draft);
        assert.equal(countEffects(user), 0);
        await send(g.handle, user, { type: 'message', text: 'ok đồng ý làm đi' }, conversation);
        assert.equal(countEffects(user), 0);
        const mismatch = await send(g.handle, user, { ...decision('approve', approval), fingerprint: 'f'.repeat(64) }, conversation);
        assert.equal(end(mismatch).code, 'approval_invalid');
        const rejected = await send(g.handle, user, decision('reject', approval), conversation);
        assert.equal(end(rejected).type, 'run_completed');
        assert.equal(countEffects(user), 0);
        const stale = await send(g.handle, user, decision('approve', approval), conversation);
        assert.equal(end(stale).code, 'approval_invalid');
        traces.approval = draft.events;
        traces.rejected = rejected.events;
      });
      await t.test('expired and changed-draft confirmations cannot execute; disabled effects remain refused', async () => {
        const user = await newUser();
        const g = gateway([...draftSteps(), ...draftSteps()], { effects: true });
        const first = await send(g.handle, user);
        const a = approvalOf(first);
        query(`update nestscout_private.kael_approvals set expires_at=clock_timestamp()-interval '1 second' where id='${a.id}';`);
        assert.equal(end(await send(g.handle, user, decision('approve', a), conversationOf(first))).code, 'approval_invalid');
        const second = await send(g.handle, user);
        const b = approvalOf(second);
        const off = gateway([]);
        assert.equal(end(await send(off.handle, user, decision('approve', b), conversationOf(second))).code, 'approval_invalid');
        query(`update public.kael_tasks set version=version+1 where id='${b.task_id}';`);
        assert.equal(end(await send(g.handle, user, decision('approve', b), conversationOf(second))).code, 'approval_invalid');
        assert.equal(countEffects(user), 0);
      });
      await t.test('approved synthetic submission is verified in SQL and duplicate confirmation cannot duplicate its business effect', async () => {
        const user = await newUser();
        const g = gateway(draftSteps(), { effects: true });
        const draft = await send(g.handle, user);
        const approval = approvalOf(draft);
        const result = await send(g.handle, user, decision('approve', approval), conversationOf(draft));
        assert.ok(outcomes(result).includes('service_request_submit:succeeded'));
        assert.equal(countEffects(user), 1);
        assert.equal(query(`select count(*) from public.service_requests where owner_id='${user.id}' and submission_key='${approval.id}';`), '1');
        assert.equal(query(`select status from public.kael_tasks where id='${approval.task_id}';`), 'completed');
        const duplicate = await send(g.handle, user, decision('approve', approval), conversationOf(draft));
        assert.equal(countEffects(user), 1);
        assert.ok(!outcomes(duplicate).includes('service_request_submit:succeeded'));
        traces.submitted = result.events;
      });
      await t.test('lost submission response reconciles the original key and blocks account-wide new submissions', async () => {
        const user = await newUser();
        let loseResponse = true;
        const fetcher = async (url, init) => {
          const response = await fetch(url, init);
          if (loseResponse && new URL(url).pathname === '/rest/v1/rpc/submit_service_request') {
            loseResponse = false;
            assert.equal(response.status, 200);
            await response.arrayBuffer();
            throw new Error('Synthetic loss after the real local transaction committed');
          }
          return response;
        };
        const g = gateway([...draftSteps(), ...draftSteps()], { effects: true, fetcher });
        const draft = await send(g.handle, user);
        const approval = approvalOf(draft);
        const uncertain = await send(g.handle, user, decision('approve', approval), conversationOf(draft));
        assert.ok(outcomes(uncertain).includes('service_request_submit:uncertain'));
        assert.equal(approvalOf(uncertain).kind, 'reconcile');
        assert.equal(countEffects(user), 1);
        const blocked = await send(g.handle, user);
        assert.equal(approvalOf(blocked), undefined);
        assert.ok(outcomes(blocked).includes('service_request_submit:failed'));
        const state = parseKaelConversationSnapshot(await rpc(user, 'kael_conversation_state', { p_mode: 'client' }));
        assert.ok(state.approvals.some(item => item.id === approval.id && item.kind === 'reconcile'));
        const reconciled = await send(g.handle, user, decision('reconcile', approval));
        assert.ok(outcomes(reconciled).includes('service_request_submit:succeeded'));
        assert.equal(countEffects(user), 1);
        assert.equal(query(`select count(*) from public.service_requests where owner_id='${user.id}' and submission_key='${approval.id}';`), '1');
        traces.uncertain = uncertain.events;
        traces.reconciled = reconciled.events;
      });
      await t.test('session actions are owner and mode scoped over real Auth and REST, and a reopened confirmation still decides once', async () => {
        const owner = await newUser();
        const other = await newUser();
        const g = gateway(draftSteps(), { effects: true });
        const draft = await send(g.handle, owner);
        const approval = approvalOf(draft);
        const conversation = conversationOf(draft);
        assert.ok(approval);
        const listed = await rpc(owner, 'kael_list_conversations', { p_mode: 'client', p_search: null, p_archived: false, p_limit: 30, p_before: null });
        assert.deepEqual(listed.map(row => row.id), [conversation]);
        assert.deepEqual(await rpc(other, 'kael_list_conversations', { p_mode: 'client', p_search: null, p_archived: false, p_limit: 30, p_before: null }), []);
        assert.deepEqual(await rpc(owner, 'kael_list_conversations', { p_mode: 'worker', p_search: null, p_archived: false, p_limit: 30, p_before: null }), []);
        const denied = [
          ['kael_open_conversation', { p_conversation_id: conversation, p_mode: 'client' }],
          ['kael_rename_conversation', { p_conversation_id: conversation, p_title: 'Chiếm quyền' }],
          ['kael_set_conversation_pinned', { p_conversation_id: conversation, p_pinned: true }],
          ['kael_set_conversation_archived', { p_conversation_id: conversation, p_archived: true }],
          ['kael_delete_conversation', { p_conversation_id: conversation }],
        ];
        for (const [name, body] of denied) {
          const crossAccount = await request(`/rest/v1/rpc/${name}`, other.token, body);
          assert.ok(crossAccount.status >= 400, `${name} must refuse another account`);
          const anonymous = await request(`/rest/v1/rpc/${name}`, null, body);
          assert.ok([401, 403].includes(anonymous.status), `${name} must refuse a caller without a session`);
        }
        const crossMode = await request('/rest/v1/rpc/kael_open_conversation', owner.token, { p_conversation_id: conversation, p_mode: 'worker' });
        assert.ok(crossMode.status >= 400);
        assert.equal(query(`select coalesce(title,'') || '|' || (pinned_at is not null) || '|' || (archived_at is not null) || '|' || (deleted_at is not null) from public.kael_conversations where id='${conversation}';`), '|false|false|false');
        await rpc(owner, 'kael_rename_conversation', { p_conversation_id: conversation, p_title: 'Việc cần xác nhận' });
        await rpc(owner, 'kael_set_conversation_pinned', { p_conversation_id: conversation, p_pinned: true });
        await rpc(owner, 'kael_set_conversation_archived', { p_conversation_id: conversation, p_archived: true });
        await rpc(owner, 'kael_set_conversation_archived', { p_conversation_id: conversation, p_archived: false });
        const reopened = parseKaelConversationSnapshot(await rpc(owner, 'kael_open_conversation', { p_conversation_id: conversation, p_mode: 'client' }));
        assert.ok(reopened);
        assert.equal(reopened.conversationId, conversation);
        assert.deepEqual(reopened.approvals.map(item => item.id), [approval.id]);
        assert.equal(countEffects(owner), 0);
        const decided = await send(g.handle, owner, decision('approve', approval), conversation);
        assert.ok(outcomes(decided).includes('service_request_submit:succeeded'));
        assert.equal(countEffects(owner), 1);
        const afterDecision = parseKaelConversationSnapshot(await rpc(owner, 'kael_open_conversation', { p_conversation_id: conversation, p_mode: 'client' }));
        assert.equal(afterDecision.approvals.length, 0);
        const replay = await send(g.handle, owner, decision('approve', approval), conversation);
        assert.ok(!outcomes(replay).includes('service_request_submit:succeeded'));
        assert.equal(countEffects(owner), 1);
        const removed = await rpc(owner, 'kael_delete_conversation', { p_conversation_id: conversation });
        assert.equal(removed.deleted, true);
        assert.deepEqual(await rpc(owner, 'kael_list_conversations', { p_mode: 'client', p_search: null, p_archived: false, p_limit: 30, p_before: null }), []);
        const afterDelete = await request('/rest/v1/rpc/kael_open_conversation', owner.token, { p_conversation_id: conversation, p_mode: 'client' });
        assert.ok(afterDelete.status >= 400);
        assert.equal(query(`select count(*) from public.kael_messages where conversation_id='${conversation}';`), '0');
        assert.equal(countEffects(owner), 1);
      });
      await t.test('active task context is session scoped while an unreconciled account check stays visible from every session', async () => {
        const owner = await newUser();
        const other = await newUser();
        const first = await send(gateway(draftSteps(), { effects: true }).handle, owner);
        const second = await send(gateway(draftSteps(), { effects: true }).handle, owner);
        const sessionOne = conversationOf(first);
        const sessionTwo = conversationOf(second);
        assert.notEqual(sessionOne, sessionTwo);
        const tasksOf = async (user, conversation, mode = 'client') => rpc(user, 'kael_context_tasks', { p_conversation_id: conversation, p_mode: mode });
        const one = await tasksOf(owner, sessionOne);
        const two = await tasksOf(owner, sessionTwo);
        assert.equal(one.length, 1);
        assert.equal(two.length, 1);
        assert.notEqual(one[0].id, two[0].id);
        assert.deepEqual(await tasksOf(owner, sessionOne, 'worker'), []);
        assert.deepEqual(await tasksOf(other, sessionOne), []);
        const snapshotOne = parseKaelConversationSnapshot(await rpc(owner, 'kael_open_conversation', { p_conversation_id: sessionOne, p_mode: 'client' }));
        const snapshotTwo = parseKaelConversationSnapshot(await rpc(owner, 'kael_open_conversation', { p_conversation_id: sessionTwo, p_mode: 'client' }));
        assert.deepEqual(snapshotOne.tasks.map(task => task.id), [one[0].id]);
        assert.deepEqual(snapshotTwo.tasks.map(task => task.id), [two[0].id]);
        assert.deepEqual(snapshotOne.approvals.map(item => item.id), [approvalOf(first).id]);
        assert.deepEqual(snapshotTwo.approvals.map(item => item.id), [approvalOf(second).id]);
      });
      await t.test('a manually submitted request is idempotent and visible on Requests after a reload only to its owner', async () => {
        const owner = await newUser();
        const other = await newUser();
        const key = randomUUID();
        const submit = () => rpc(owner, 'submit_service_request', { p_submission_key: key, p_description: 'Vệ sinh sofa vải ba chỗ', p_location: 'Quận 2, TP.HCM' });
        const first = await submit();
        assert.match(first, uuid);
        assert.equal(await submit(), first);
        const reload = token => request('/rest/v1/service_requests?select=id,description,location,created_at,preferred_visit_at&order=created_at.desc', token);
        const mine = await reload(owner.token);
        assert.equal(mine.status, 200);
        assert.deepEqual((await mine.json()).map(row => [row.id, row.description, row.location]), [[first, 'Vệ sinh sofa vải ba chỗ', 'Quận 2, TP.HCM']]);
        const theirs = await reload(other.token);
        assert.equal(theirs.status, 200);
        assert.deepEqual(await theirs.json(), []);
        assert.equal(countEffects(owner), 1);
        const duplicateKey = await request('/rest/v1/rpc/submit_service_request', other.token, { p_submission_key: key, p_description: 'Vệ sinh sofa vải ba chỗ', p_location: 'Quận 2, TP.HCM' });
        assert.equal(duplicateKey.status, 200);
        assert.notEqual(await duplicateKey.json(), first);
        assert.equal(countEffects(other), 1);
        assert.equal(countEffects(owner), 1);
      });
      await t.test('busy and per-account rate limits return actual HTTP refusals without invoking a provider', async () => {
        const user = await newUser();
        let release;
        const waiting = new Promise(resolve => { release = resolve; });
        const g = gateway([async () => { await waiting; return { text: ['Finished.'] }; }]);
        const started = await g.handle(new Request(`${origin}/functions/v1/kael`, { method: 'POST', headers: { authorization: `Bearer ${user.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ request_id: randomUUID(), conversation_id: null, mode: 'client', action: { type: 'message', text: 'Wait' } }) }));
        const reader = started.body.getReader();
        const first = parseKaelEvent(new TextDecoder().decode((await reader.read()).value).trim());
        try {
          assert.equal((await send(g.handle, user, undefined, first.conversation_id)).status, 409);
        } finally { release(); }
        while (!(await reader.read()).done) {}
        for (let index = 0; index < 11; index++) {
          g.provider.requests.length = 0;
          const limited = gateway([{ text: ['Rate fixture.'] }]);
          assert.equal((await send(limited.handle, user)).status, 200);
        }
        const limited = gateway([{ text: ['Must not run.'] }]);
        assert.equal((await send(limited.handle, user)).status, 429);
        assert.equal(limited.provider.requests.length, 0);
      });
      await t.test('consumer interruption aborts and persists an incomplete run instead of business success', async () => {
        const user = await newUser();
        let enter;
        const entered = new Promise(resolve => { enter = resolve; });
        const provider = {
          id: 'anthropic', model: 'test-interrupted',
          async complete(input, onText) {
            onText('Partial local reply');
            enter();
            await new Promise((resolve, reject) => {
              if (input.signal.aborted) reject(input.signal.reason);
              else input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true });
            });
          },
        };
        const handle = createKaelHandler({ env, providers: () => [provider], log: () => {} });
        const response = await handle(new Request(`${origin}/functions/v1/kael`, { method: 'POST', headers: { authorization: `Bearer ${user.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ request_id: randomUUID(), conversation_id: null, mode: 'client', action: { type: 'message', text: 'Interrupt' } }) }));
        const reader = response.body.getReader();
        await entered;
        await reader.cancel();
        const deadline = Date.now() + 5000;
        let run;
        do {
          run = query(`select status from public.kael_runs where owner_id='${user.id}';`);
          if (run !== 'running') break;
          await new Promise(resolve => setTimeout(resolve, 50));
        } while (Date.now() < deadline);
        assert.equal(run, 'interrupted');
        assert.equal(query(`select status from public.kael_messages where owner_id='${user.id}' and role='assistant';`), 'incomplete');
        assert.equal(countEffects(user), 0);
      });
      assert.equal(runtime.verify().id, stack.id);
      mkdirSync(path.join(root, '.cache'), { recursive: true });
      writeFileSync(path.join(root, '.cache/kael-local-events.json'), JSON.stringify(traces, null, 2) + '\n');
    } finally {
      assert.equal(runtime.verify().id, stack.id);
      for (const user of accounts) {
        if (user.token) {
          const logout = await request('/auth/v1/logout?scope=global', user.token, {});
          assert.ok([200, 204].includes(logout.status));
        }
        query(`begin;
          delete from nestscout_private.kael_approvals where owner_id='${user.id}';
          delete from nestscout_private.kael_tool_executions where owner_id='${user.id}';
          delete from public.kael_task_events where owner_id='${user.id}';
          delete from public.kael_tasks where owner_id='${user.id}';
          delete from public.kael_messages where owner_id='${user.id}';
          delete from public.kael_runs where owner_id='${user.id}';
          delete from public.kael_conversations where owner_id='${user.id}';
          delete from nestscout_private.kael_tool_audit where actor_id='${user.id}';
          delete from public.notifications where request_id in (select id from public.service_requests where owner_id='${user.id}');
          delete from public.service_requests where owner_id='${user.id}';
          delete from nestscout_private.worker_dispatch_eligibility where user_id='${user.id}';
          delete from public.consent_events where user_id='${user.id}';
          commit;`);
        const removed = await fetch(`${origin}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } });
        assert.equal(removed.status, 200, 'Remove only this test-created identity');
      }
      assert.equal(query('select count(*) from auth.users;'), initialUsers);
    }
  });
});

test('Kael coordinates the authorized Customer–Worker lifecycle through confirmed effects on real Auth and PostgreSQL', { timeout: 300000 }, async () => {
  await withLocalLock(async () => {
    const runtime = localRuntime();
    const stack = runtime.verify();
    const status = runtime.status();
    const origin = stack.endpoints['rest.http'].url.replace(/\/$/, '');
    const publicKey = status.env.PUBLISHABLE_KEY;
    const serviceKey = status.env.SERVICE_ROLE_KEY;
    assert.ok(publicKey?.startsWith('sb_publishable_'));
    assert.ok(serviceKey?.startsWith('eyJ'));
    const containers = execFileSync('docker', ['ps', '--filter', `label=com.supabase.stack=${stack.id}`, '--filter', 'label=com.supabase.service=database', '--format', '{{.ID}}'], { encoding: 'utf8' }).trim().split(/\s+/);
    assert.equal(containers.length, 1);
    assert.match(containers[0], /^[a-f0-9]{12,64}$/);
    const query = sql => execFileSync('docker', ['exec', '-i', containers[0], 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const initialUsers = query('select count(*) from auth.users;');
    const effects = 'service_request_submit,service_quote_decision,work_submission_decision,worker_offer_decision,worker_job_advance';
    const env = { SUPABASE_URL: `${origin}/`, SUPABASE_ANON_KEY: publicKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey, KAEL_ENABLED_EFFECTS: effects };
    const accounts = [];
    const request = (route, token, body, admin = false) => fetch(`${origin}${route}`, {
      method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(30000),
      headers: { apikey: admin ? serviceKey : publicKey, ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const rpc = (user, name, body = {}) => request(`/rest/v1/rpc/${name}`, user.token, body);
    const newUser = async label => {
      const email = `${randomUUID()}@example.invalid`;
      const password = randomUUID();
      const created = await request('/auth/v1/admin/users', serviceKey, { email, password, email_confirm: true }, true);
      assert.equal(created.status, 200, `${label} provisioning`);
      const account = await created.json();
      const user = { id: account.id, token: null, label };
      accounts.push(user);
      const login = await request('/auth/v1/token?grant_type=password', null, { email, password });
      assert.equal(login.status, 200, `${label} password session`);
      user.token = (await login.json()).access_token;
      return user;
    };
    const send = async (provider, user, action, conversation, mode) => {
      while (Number(query(`select count(*) from public.kael_runs where owner_id='${user.id}' and started_at > clock_timestamp() - interval '1 minute';`)) >= 12) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      const handle = createKaelHandler({ env, providers: () => (provider ? [provider] : []), log: () => {} });
      const response = await handle(new Request(`${origin}/functions/v1/kael`, {
        method: 'POST', headers: { authorization: `Bearer ${user.token}`, apikey: publicKey, 'content-type': 'application/json' },
        body: JSON.stringify({ request_id: randomUUID(), conversation_id: conversation, mode, action }),
      }));
      assert.equal(response.status, 200, `${user.label} turn is accepted`);
      const events = (await response.text()).trim().split('\n').map(line => parseKaelEvent(line));
      const sequence = createKaelSequence();
      for (const event of events) {
        assert.ok(event, 'every gateway event satisfies the mobile parser');
        assert.equal(sequence(event), 'accept');
      }
      return { events, conversation: events[0].conversation_id, end: events.at(-1) };
    };
    const say = (user, mode, steps, conversation = null) => send(scriptedProvider('anthropic', steps), user, { type: 'message', text: 'Synthetic lifecycle message' }, conversation, mode);
    const approve = (user, mode, approval, conversation, type = 'approve') => send(null, user, { type, approval_id: approval.id, fingerprint: approval.fingerprint }, conversation, mode);
    const approvalOf = result => result.events.find(event => event.type === 'approval_required')?.approval;
    const text = result => result.events.filter(event => event.type === 'message_delta').map(event => event.text).join('');
    const one = sql => query(sql);
    const workflowTask = (title, next) => [
      { tools: [call('task_create', { title, kind: 'workflow_action', status: 'running', note: '' })] },
      request => { const [created] = lastToolResults(request); return { tools: [next(created.task.id)] }; },
      { text: ['Mời bạn xác nhận trong ứng dụng.'] },
    ];
    let requestId = null;
    try {
      const customer = await newUser('Customer A');
      const customerB = await newUser('Customer B');
      const workerA = await newUser('Worker A');
      const workerB = await newUser('Worker B');
      const operator = await newUser('Fixture operator');
      query(`insert into public.consent_events (user_id, purpose, granted, policy_version) values
          ('${customer.id}', 'ai_sharing', true, '2026-11-09'), ('${customerB.id}', 'ai_sharing', true, '2026-11-09'), ('${workerA.id}', 'ai_sharing', true, '2026-11-09'), ('${workerB.id}', 'ai_sharing', true, '2026-11-09');
        insert into nestscout_private.fixture_operators (user_id, basis) values ('${operator.id}', 'local_fixture');
        insert into public.worker_access_grants (user_id) values ('${workerA.id}'), ('${workerB.id}');
        insert into nestscout_private.worker_dispatch_eligibility (user_id, basis, active) values ('${workerA.id}', 'local_fixture', true), ('${workerB.id}', 'local_fixture', true);
        insert into public.worker_public_profiles (worker_id, display_name, trade, area, experience_years, about, skills, service_ids, accepting_jobs) values
          ('${workerA.id}', 'Thợ thử A', 'Điện lạnh', 'Quận 1', 5, 'Sửa máy lạnh', array['Máy lạnh'], array['aircon'], true),
          ('${workerB.id}', 'Thợ thử B', 'Điện lạnh', 'Quận 3', 3, 'Sửa máy lạnh', array['Máy lạnh'], array['aircon'], true);
        insert into public.worker_documents (worker_id, kind, title, path) values
          ('${workerA.id}', 'identity', 'CCCD', '${workerA.id}/identity.jpg'), ('${workerB.id}', 'identity', 'CCCD', '${workerB.id}/identity.jpg');`);

      let intakeTask;
      const intake = await say(customer, 'client', [
        { tools: [call('ask_user_choice', { question: 'Bạn muốn thợ đến khi nào?', options: ['Chiều mai', 'Sáng ngày kia'], allow_date: true })] },
        { text: ['Bạn chọn thời gian giúp Kael nhé.'] },
      ]);
      assert.equal(intake.end.type, 'run_completed');
      const question = intake.events.find(event => event.type === 'question')?.question;
      assert.deepEqual([question.prompt, question.options, question.date], ['Bạn muốn thợ đến khi nào?', ['Chiều mai', 'Sáng ngày kia'], true]);
      const drafted = await say(customer, 'client', [
        { tools: [call('task_create', { title: 'Sửa máy lạnh phòng ngủ', kind: 'service_request', status: 'running', note: '' })] },
        request => {
          intakeTask = lastToolResults(request)[0].task.id;
          return { tools: [call('service_request_draft', { task_id: intakeTask, description: 'Máy lạnh phòng ngủ không mát', location: '12 Lê Lợi, Quận 1', preferred_time: 'Chiều mai', missing: [] })] };
        },
        () => ({ tools: [call('service_request_submit', { task_id: intakeTask })] }),
        { text: ['Bạn kiểm tra rồi xác nhận gửi nhé.'] },
      ], intake.conversation);
      const submitApproval = approvalOf(drafted);
      assert.equal(submitApproval.tool, 'service_request_submit');
      assert.equal(one(`select count(*) from public.service_requests where owner_id='${customer.id}';`), '0', 'a draft and a proposed submission write no request');
      const chatOk = await say(customer, 'client', [{ text: ['Đồng ý rồi đó.'] }], intake.conversation);
      assert.equal(chatOk.end.type, 'run_completed');
      assert.equal(one(`select count(*) from public.service_requests where owner_id='${customer.id}';`), '0', 'typing agreement in chat never confirms');
      const forged = await approve(customer, 'client', { ...submitApproval, fingerprint: 'f'.repeat(64) }, intake.conversation);
      assert.equal(forged.end.type, 'run_failed');
      assert.equal(forged.end.code, 'approval_invalid');
      const submitted = await approve(customer, 'client', submitApproval, intake.conversation);
      assert.equal(submitted.end.type, 'run_completed');
      assert.match(text(submitted), /chưa có thợ, báo giá hay lịch hẹn nào được xác nhận/);
      requestId = one(`select id from public.service_requests where owner_id='${customer.id}' and submission_key='${submitApproval.id}';`);
      assert.match(requestId, uuid);
      const replayed = await approve(customer, 'client', submitApproval, intake.conversation);
      assert.match(text(replayed), /đã được gửi trước đó/);
      assert.equal(one(`select count(*) from public.service_requests where owner_id='${customer.id}';`), '1', 'replaying a consumed approval creates nothing');

      const issue = async (key, scope, amount) => {
        const response = await rpc(operator, 'issue_fixture_quote', { p_request_id: requestId, p_key: key, p_scope: scope, p_amount_minor: amount, p_valid_minutes: 60 });
        assert.equal(response.status, 200, 'the fixture operator issues a quote');
        return response.json();
      };
      assert.equal((await rpc(customer, 'issue_fixture_quote', { p_request_id: requestId, p_key: randomUUID(), p_scope: 'Tự báo giá', p_amount_minor: 1, p_valid_minutes: 60 })).status, 403, 'a customer cannot price their own request');
      const quoteV1 = await issue(randomUUID(), 'Kiểm tra máy lạnh', 300000);
      const quoteV2 = await issue(randomUUID(), 'Kiểm tra và vệ sinh máy lạnh', 450000);
      const queue = await rpc(operator, 'fixture_dispatch_queue', {});
      assert.equal(queue.status, 200, 'the dispatch queue is readable through the REST read-only transaction');
      assert.ok((await queue.json()).some(row => row.request_id === requestId && row.latest_quote_version === 2), 'the queue shows the latest quote of the request');
      assert.equal((await rpc(operator, 'fixture_dispatch_candidates', {})).status, 200, 'the dispatch candidates are readable through REST');
      assert.equal((await rpc(customer, 'fixture_dispatch_queue', {})).status, 403, 'a customer cannot read the dispatch queue');
      assert.deepEqual(await (await request(`/rest/v1/service_quotes?select=id&request_id=eq.${requestId}`, customerB.token)).json(), [], 'Customer B never sees Customer A quotes');

      let stale;
      const staleAttempt = await say(customer, 'client', [
        { tools: [call('task_create', { title: 'Chấp nhận báo giá cũ', kind: 'workflow_action', status: 'running', note: '' })] },
        request => ({ tools: [call('service_quote_decision', { task_id: lastToolResults(request)[0].task.id, quote_id: quoteV1, quote_version: 1, decision: 'accepted' })] }),
        request => { stale = lastToolResults(request)[0]; return { text: ['Báo giá đó đã cũ.'] }; },
      ]);
      assert.equal(staleAttempt.end.type, 'run_completed');
      assert.equal(stale.error, 'quote_not_current');
      assert.equal(approvalOf(staleAttempt), undefined, 'a superseded quote never reaches the confirmation control');

      let current;
      const quoteTurn = await say(customer, 'client', [
        { tools: [call('customer_requests', { limit: 5 })] },
        request => {
          current = lastToolResults(request)[0].requests.find(row => row.request_id === requestId).quote;
          return { tools: [call('task_create', { title: 'Chấp nhận báo giá', kind: 'workflow_action', status: 'running', note: '' })] };
        },
        request => ({ tools: [call('service_quote_decision', { task_id: lastToolResults(request)[0].task.id, quote_id: current.quote_id, quote_version: current.version, decision: 'accepted' })] }),
        { text: ['Mời bạn xác nhận báo giá.'] },
      ]);
      assert.deepEqual([current.quote_id, current.version, current.basis], [quoteV2, 2, 'local_fixture']);
      const quoteApproval = approvalOf(quoteTurn);
      assert.equal(quoteApproval.details['Giá'], '450.000 ₫');
      assert.equal(quoteApproval.details['Cơ sở báo giá'], 'Dữ liệu thử nghiệm, không phải giao dịch thật');
      assert.equal(one(`select count(*) from public.service_quotes where request_id='${requestId}' and accepted_at is not null;`), '0', 'a proposed acceptance changes nothing');
      const otherConversation = (await say(customerB, 'client', [{ text: ['Xin chào.'] }])).conversation;
      assert.equal((await approve(customerB, 'client', quoteApproval, otherConversation)).end.code, 'approval_invalid', 'another account cannot use the approval');
      const accepted = await approve(customer, 'client', quoteApproval, quoteTurn.conversation);
      assert.match(text(accepted), /chưa có thợ nhận việc, chưa có lịch hẹn và chưa có thanh toán/);
      assert.equal(one(`select accepted_by from public.service_quotes where id='${quoteV2}';`), customer.id);

      const invite = async worker => {
        const response = await rpc(operator, 'invite_fixture_worker', { p_request_id: requestId, p_worker_id: worker.id, p_valid_minutes: 30 });
        assert.equal(response.status, 200, `${worker.label} is invited`);
        return response.json();
      };
      const invitationA = await invite(workerA);
      const invitationB = await invite(workerB);
      let offer;
      const offerTurn = await say(workerA, 'worker', [
        { tools: [call('worker_jobs', {})] },
        request => { offer = lastToolResults(request)[0].offers.find(row => row.invitation_id === invitationA); return { tools: [call('task_create', { title: 'Nhận việc', kind: 'workflow_action', status: 'running', note: '' })] }; },
        request => ({ tools: [call('worker_offer_decision', { task_id: lastToolResults(request)[0].task.id, invitation_id: offer.invitation_id, quote_id: offer.quote_id, quote_version: offer.quote_version, decision: 'accept' })] }),
        { text: ['Bạn xác nhận nhận việc nhé.'] },
      ]);
      assert.ok(offer.preferred_visit_at === null, 'no preferred visit time was recorded for this request');
      const offerApproval = approvalOf(offerTurn);
      let offerB;
      const raceTurn = await say(workerB, 'worker', [
        { tools: [call('worker_jobs', {})] },
        request => { offerB = lastToolResults(request)[0].offers.find(row => row.invitation_id === invitationB); return { tools: [call('task_create', { title: 'Nhận việc', kind: 'workflow_action', status: 'running', note: '' })] }; },
        request => ({ tools: [call('worker_offer_decision', { task_id: lastToolResults(request)[0].task.id, invitation_id: offerB.invitation_id, quote_id: offerB.quote_id, quote_version: offerB.quote_version, decision: 'accept' })] }),
        { text: ['Bạn xác nhận nhận việc nhé.'] },
      ]);
      const raceApproval = approvalOf(raceTurn);
      assert.equal(raceApproval.tool, 'worker_offer_decision', 'Worker B also holds an open offer before the assignment');
      const assigned = await approve(workerA, 'worker', offerApproval, offerTurn.conversation);
      assert.match(text(assigned), /công việc đã được giao cho bạn/);
      const jobId = one(`select id from public.service_jobs where request_id='${requestId}' and worker_id='${workerA.id}';`);
      assert.match(jobId, uuid);
      const lateB = await rpc(workerB, 'accept_service_invitation', { p_invitation_id: invitationB, p_quote_id: quoteV2, p_quote_version: 2 });
      assert.equal(lateB.status, 500, 'PostgREST reports SQLSTATE 40001 with HTTP 500');
      assert.deepEqual(await lateB.json(), { code: '40001', details: null, hint: null, message: 'already assigned' }, 'Worker B loses the race for an assigned request');
      const lostRace = await approve(workerB, 'worker', raceApproval, raceTurn.conversation);
      assert.equal(lostRace.end.type, 'run_failed');
      assert.match(text(lostRace), /đã có thợ khác nhận trước/, 'Kael reports the lost race as a definitive refusal, not an uncertain result');
      assert.equal(one(`select count(*) from public.service_jobs where worker_id='${workerB.id}';`), '0');
      assert.equal(one(`select outcome from nestscout_private.kael_approvals where id='${raceApproval.id}';`), 'failed');
      let bJobs;
      await say(workerB, 'worker', [{ tools: [call('worker_jobs', {})] }, request => { bJobs = lastToolResults(request)[0]; return { text: ['Không còn lời mời.'] }; }]);
      assert.deepEqual([bJobs.offers, bJobs.jobs], [[], []], 'Worker B sees neither the offer nor Worker A job');
      assert.notEqual((await rpc(workerB, 'advance_service_job', { p_job_id: jobId, p_version: 1, p_next: 'en_route' })).status, 200, 'Worker B cannot touch Worker A job');

      const travelTurn = await say(workerA, 'worker', workflowTask('Báo đang đi', task => call('worker_job_advance', { task_id: task, job_id: jobId, version: 1, next: 'en_route' })));
      const travel = await approve(workerA, 'worker', approvalOf(travelTurn), travelTurn.conversation);
      assert.match(text(travel), /đang trên đường tới/);
      assert.equal(one(`select stage || ':' || version from public.service_jobs where id='${jobId}';`), 'en_route:2');
      assert.equal((await rpc(workerA, 'advance_service_job', { p_job_id: jobId, p_version: 2, p_next: 'arrived' })).status, 200);
      assert.equal((await rpc(workerA, 'advance_service_job', { p_job_id: jobId, p_version: 3, p_next: 'working' })).status, 200);
      assert.equal((await rpc(workerA, 'submit_service_work', { p_job_id: jobId, p_version: 4, p_key: randomUUID(), p_evidence: 'Đã vệ sinh dàn lạnh và kiểm tra gas' })).status, 200);
      assert.equal(one(`select stage from public.service_jobs where id='${jobId}';`), 'submitted');

      const decide = async (decision, reason) => {
        let pending;
        const turn = await say(customer, 'client', [
          { tools: [call('customer_requests', { limit: 5 })] },
          request => { pending = lastToolResults(request)[0].requests.find(row => row.request_id === requestId); return { tools: [call('task_create', { title: 'Nghiệm thu', kind: 'workflow_action', status: 'running', note: '' })] }; },
          request => ({ tools: [call('work_submission_decision', { task_id: lastToolResults(request)[0].task.id, submission_id: pending.pending_submission.submission_id, job_version: pending.job.version, decision, reason })] }),
          { text: ['Mời bạn xác nhận.'] },
        ]);
        return { approval: approvalOf(turn), conversation: turn.conversation, pending };
      };
      const correction = await decide('revision_requested', 'Phòng vẫn chưa mát');
      assert.equal(correction.approval.details['Lý do'], 'Phòng vẫn chưa mát');
      assert.match(text(await approve(customer, 'client', correction.approval, correction.conversation)), /Công việc chưa được nghiệm thu/);
      assert.equal(one(`select decision from public.service_submissions where id='${correction.pending.pending_submission.submission_id}';`), 'revision_requested');
      const reworkVersion = Number(one(`select version from public.service_jobs where id='${jobId}';`));
      assert.equal(one(`select stage from public.service_jobs where id='${jobId}';`), 'working', 'a correction reopens the work');
      assert.equal((await rpc(workerA, 'submit_service_work', { p_job_id: jobId, p_version: reworkVersion, p_key: randomUUID(), p_evidence: 'Đã nạp gas, phòng mát' })).status, 200);
      const acceptance = await decide('accepted', '');
      const completed = await approve(customer, 'client', acceptance.approval, acceptance.conversation);
      assert.match(text(completed), /Việc thanh toán chưa được xác nhận trong ứng dụng/);
      assert.equal(one(`select stage from public.service_jobs where id='${jobId}';`), 'completed');
      assert.equal(one(`select decision || ':' || decided_by from public.service_submissions where id='${acceptance.pending.pending_submission.submission_id}';`), `accepted:${customer.id}`);
      const earnings = await (await rpc(workerA, 'worker_earnings')).json();
      assert.equal(earnings.length, 1, 'the accepted job is recorded as earned work');
      assert.equal(one(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','nestscout_private') and c.relname ~* '(ledger|settlement|payout_request)';`), '0', 'acceptance creates no settlement or payout record');
      assert.equal(one(`select count(*) from nestscout_private.kael_approvals a where a.owner_id in ('${customer.id}','${workerA.id}') and a.status='consumed' and a.outcome='succeeded';`), '6', 'six confirmed effects were verified');
    } finally {
      assert.equal(runtime.verify().id, stack.id);
      const ids = accounts.map(user => `'${user.id}'`).join(',') || 'null';
      query(`begin;
        delete from nestscout_private.kael_approvals where owner_id in (${ids});
        delete from nestscout_private.kael_tool_executions where owner_id in (${ids});
        delete from nestscout_private.kael_tool_audit where actor_id in (${ids});
        delete from public.kael_task_events where owner_id in (${ids});
        delete from public.kael_tasks where owner_id in (${ids});
        delete from public.kael_messages where owner_id in (${ids});
        delete from public.kael_runs where owner_id in (${ids});
        delete from public.kael_conversations where owner_id in (${ids});
        delete from public.notifications where recipient_id in (${ids}) or request_id in (select id from public.service_requests where owner_id in (${ids}));
        delete from public.service_cases where job_id in (select j.id from public.service_jobs j join public.service_requests r on r.id = j.request_id where r.owner_id in (${ids}));
        delete from public.service_submissions where job_id in (select j.id from public.service_jobs j join public.service_requests r on r.id = j.request_id where r.owner_id in (${ids}));
        delete from public.service_job_events where job_id in (select j.id from public.service_jobs j join public.service_requests r on r.id = j.request_id where r.owner_id in (${ids}));
        delete from public.service_jobs where request_id in (select id from public.service_requests where owner_id in (${ids}));
        delete from public.service_invitations where request_id in (select id from public.service_requests where owner_id in (${ids}));
        delete from public.service_quotes where request_id in (select id from public.service_requests where owner_id in (${ids}));
        delete from public.service_requests where owner_id in (${ids});
        delete from public.worker_documents where worker_id in (${ids});
        delete from public.worker_public_profiles where worker_id in (${ids});
        delete from nestscout_private.worker_dispatch_eligibility where user_id in (${ids});
        delete from public.worker_access_grants where user_id in (${ids});
        delete from nestscout_private.fixture_operators where user_id in (${ids});
        delete from public.consent_events where user_id in (${ids});
        commit;`);
      for (const user of accounts) {
        const removed = await fetch(`${origin}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } });
        assert.equal(removed.status, 200, 'remove only this test-created identity');
      }
      assert.equal(query('select count(*) from auth.users;'), initialUsers);
    }
  });
});
