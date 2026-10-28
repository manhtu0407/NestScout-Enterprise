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
      if (created) query(`delete from public.service_requests where owner_id='${user}' and submission_key='${key}'; delete from auth.users where id='${user}';`);
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
      if (created) query(`delete from public.service_quotes where id='${quote}'; delete from public.service_requests where id='${request}'; delete from auth.users where id='${user}';`);
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
      if (requestId) query(`delete from public.service_cases where job_id in (select id from public.service_jobs where request_id='${requestId}'); delete from public.service_submissions where job_id in (select id from public.service_jobs where request_id='${requestId}'); delete from public.service_scope_changes where job_id in (select id from public.service_jobs where request_id='${requestId}'); delete from public.service_job_reports where job_id in (select id from public.service_jobs where request_id='${requestId}'); delete from public.service_job_events where job_id in (select id from public.service_jobs where request_id='${requestId}'); delete from public.service_jobs where request_id='${requestId}'; delete from public.service_invitations where id='${invitation}'; delete from public.service_quotes where id='${quote}'; delete from public.service_requests where id='${requestId}';`);
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
      if (created) query(`delete from public.service_job_events where job_id in (select id from public.service_jobs where request_id='${request}'); delete from public.service_jobs where request_id='${request}'; delete from public.service_invitations where id in ('${inviteA}','${inviteB}','${inviteExpired}'); delete from public.service_quotes where id='${quote}'; delete from public.service_requests where id='${request}'; delete from nestscout_private.worker_dispatch_eligibility where user_id in ('${workerA}','${workerB}'); delete from public.worker_access_grants where user_id in ('${workerA}','${workerB}'); delete from auth.users where id in ('${customer}','${workerA}','${workerB}');`);
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
      if (created) query(`delete from public.service_cases where job_id in ('${jobA}','${jobB}'); delete from public.service_job_pauses where job_id in ('${jobA}','${jobB}'); delete from public.service_submissions where job_id in ('${jobA}','${jobB}'); delete from public.service_scope_changes where job_id in ('${jobA}','${jobB}'); delete from public.service_job_events where job_id in ('${jobA}','${jobB}'); delete from public.service_jobs where id in ('${jobA}','${jobB}'); delete from public.service_invitations where id in ('${inviteA}','${inviteB}'); delete from public.service_quotes where id in ('${quoteA}','${quoteB}'); delete from public.service_requests where id in ('${requestA}','${requestB}'); delete from nestscout_private.worker_dispatch_eligibility where user_id='${worker}'; delete from public.worker_access_grants where user_id='${worker}'; delete from auth.users where id in ('${customer}','${worker}');`);
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
      if (fixtures) query(`delete from public.service_cases where job_id='${job}'; delete from public.service_submissions where job_id='${job}'; delete from public.service_job_events where job_id='${job}'; delete from public.service_jobs where id='${job}'; delete from public.service_invitations where id='${invitation}'; delete from public.service_quotes where id='${quote}'; delete from public.service_requests where id='${request}';`);
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
        delete from public.service_requests where id in (select id from scale_cleanup);
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
    const [request, quote, invitation, job, requestKey] = Array.from({ length: 5 }, () => randomUUID());
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
      query(`begin; insert into public.worker_access_grants (user_id) values ('${worker.id}'), ('${foreignWorker.id}'); insert into nestscout_private.worker_dispatch_eligibility (user_id,basis,active) values ('${worker.id}','local_fixture',true), ('${foreignWorker.id}','local_fixture',true); insert into public.service_requests (id,owner_id,submission_key,description) values ('${request}','${customer.id}','${requestKey}','Pause fixture'); insert into public.service_quotes (id,request_id,version,scope,amount_minor,currency,expires_at,accepted_at,accepted_by) values ('${quote}','${request}',1,'Pause fixture',100,'VND',clock_timestamp()+interval '1 hour',clock_timestamp(),'${customer.id}'); insert into public.service_invitations (id,request_id,quote_id,worker_id,expires_at,state) values ('${invitation}','${request}','${quote}','${worker.id}',clock_timestamp()+interval '1 hour','accepted'); insert into public.service_jobs (id,request_id,quote_id,invitation_id,worker_id,stage,version) values ('${job}','${request}','${quote}','${invitation}','${worker.id}','working',1); commit;`);
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

      for (const person of [customer, worker]) {
        const seen = await command('open_job_pauses', person.token, {});
        assert.equal(seen.status, 200);
        const rows = await seen.json();
        assert.equal(rows.length, 1);
        assert.deepEqual({ ...rows[0], created_at: undefined }, { job_id: job, category: 'ordinary_interruption', prior_stage: 'working', paused_from_version: 1, resume_requested: false, created_at: undefined });
      }
      for (const stranger of [foreignWorker, otherCustomer]) {
        const none = await command('open_job_pauses', stranger.token, {});
        assert.equal(none.status, 200);
        assert.deepEqual(await none.json(), []);
      }
      assert.equal((await command('open_job_pauses', publicKey, {})).status, 401);

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
      const waiting = await (await command('open_job_pauses', customer.token, {})).json();
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
      assert.deepEqual(await (await command('open_job_pauses', customer.token, {})).json(), []);

      const safety = await command('pause_service_job', worker.token, { p_job_id: job, p_version: 4, p_category: 'safety_concern' });
      assert.equal(await safety.json(), 5);
      assert.deepEqual(await failure(await command('request_service_resume', worker.token, { p_job_id: job, p_version: 5 })), [400, '22023', 'invalid transition']);
      assert.deepEqual(await failure(await command('consent_service_resume', customer.token, { p_job_id: job, p_version: 5 })), [400, '22023', 'invalid transition']);
      assert.equal(stage(), 'paused:5');
      assert.equal(query(`select count(*) from public.service_job_pauses where job_id='${job}' and resumed_at is null and category='safety_concern';`).trim(), '1');
    } finally {
      if (fixtures) query(`delete from public.service_job_pauses where job_id='${job}'; delete from public.service_job_events where job_id='${job}'; delete from public.service_jobs where id='${job}'; delete from public.service_invitations where id='${invitation}'; delete from public.service_quotes where id='${quote}'; delete from public.service_requests where id='${request}';`);
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
        query(`delete from public.service_job_pauses where job_id in (${jobIds}); delete from public.service_job_events where job_id in (${jobIds}); delete from public.service_jobs where id in (${jobIds}); delete from public.service_invitations where id in (${jobs.map(item => `'${item.invitation}'`).join(',')}); delete from public.service_quotes where id in (${jobs.map(item => `'${item.quote}'`).join(',')}); delete from public.service_requests where id in (${jobs.map(item => `'${item.request}'`).join(',')}); delete from nestscout_private.worker_dispatch_eligibility where user_id='${worker}'; delete from public.worker_access_grants where user_id='${worker}'; delete from auth.users where id in ('${customer}','${worker}');`);
      }
    }
  });
});
