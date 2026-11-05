import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localRuntime, requireLocal, safeDiagnostic, withLocalLock } from './supabase-local.mjs';
import { localKnowledgeDatabase, sqlLiteral } from './kael-knowledge.mjs';
import { root } from './tool-path.mjs';

export const pilotDirectory = path.join(os.homedir(), '.codex', 'private', 'kael-behavior-8085');
const sessionFile = path.join(pilotDirectory, 'session.json');
const providerFile = path.join(pilotDirectory, 'providers.env');
const edgeFile = path.join(pilotDirectory, 'edge.env');

export function parsePilotAuthorization(value, now = new Date()) {
  requireLocal(value?.purpose === 'kael_developer_8085' && value.model === 'deepseek-flash'
    && value.provider === 'deepseek' && value.owner_approved === true, 'Explicit Flash-only owner authorization is required.');
  requireLocal(Number.isSafeInteger(value.cap_micro_usd) && value.cap_micro_usd > 0 && value.cap_micro_usd <= 1000000,
    'The authorized cap must be at most USD 1.');
  requireLocal(Number.isSafeInteger(value.max_calls) && value.max_calls > 0 && value.max_calls <= 20, 'Invalid request cap.');
  const checked = Date.parse(value.rates_checked_at);
  const expires = Date.parse(value.expires_at);
  requireLocal(Number.isFinite(checked) && checked <= now.getTime() && now.getTime() - checked < 86400000
    && expires > now.getTime() && expires - now.getTime() <= 3600000, 'Fresh rates and an expiry within one hour are required.');
  requireLocal(value.rate_source === 'https://api-docs.deepseek.com/quick_start/pricing/'
    && [value.input_rate, value.cached_rate, value.output_rate].every(n => typeof n === 'number' && n > 0 && n <= 100)
    && value.cached_rate <= value.input_rate, 'An explicit verified conservative rate card is required.');
  return value;
}

function protectDirectory() {
  mkdirSync(pilotDirectory, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    const account = execFileSync('whoami', [], { encoding: 'utf8' }).trim();
    execFileSync('icacls', [pilotDirectory, '/inheritance:r', '/grant:r', `${account}:(OI)(CI)F`], { stdio: 'ignore', windowsHide: true });
  }
}

function session(runtime) {
  const value = JSON.parse(readFileSync(sessionFile, 'utf8'));
  requireLocal(value.stack_id === runtime.verify().id && value.root === root && value.branch === runtime.branch, 'The saved session belongs to another checkout or branch.');
  return value;
}

async function prepare(runtime, authorizationFile) {
  protectDirectory();
  const verified = runtime.verify();
  requireLocal(!existsSync(sessionFile), 'A session already exists. Reuse it; do not reset its budget.');
  const status = runtime.status();
  const origin = status.endpoints['rest.http'].url;
  const auth = authorizationFile ? parsePilotAuthorization(JSON.parse(readFileSync(authorizationFile, 'utf8'))) : null;
  const accounts = [];
  const database = localKnowledgeDatabase();
  for (const role of ['client', 'worker']) {
    const email = `kael-8085-${role}-${randomUUID().slice(0, 8)}@example.invalid`;
    const password = randomUUID();
    const response = await fetch(`${origin}/auth/v1/admin/users`, {
      method: 'POST', redirect: 'error',
      headers: { 'content-type': 'application/json', apikey: status.env.SERVICE_ROLE_KEY, authorization: `Bearer ${status.env.SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    requireLocal(response.ok, 'Disposable local account creation failed.');
    const user = await response.json();
    requireLocal(typeof user.id === 'string', 'The local Auth response was invalid.');
    accounts.push({ role, id: user.id, email, password });
    if (role === 'worker') database.query(`insert into public.worker_access_grants (user_id) values (${sqlLiteral(user.id)});
      insert into nestscout_private.worker_dispatch_eligibility (user_id,basis,active) values (${sqlLiteral(user.id)},'local_fixture',true);`);
  }
  const value = { id: randomUUID(), stack_id: verified.id, root, branch: runtime.branch, origin, accounts, authorization: auth };
  if (auth) database.query(`insert into nestscout_private.kael_pilot_budgets
    (id,actors,expires_at,cap_micro_usd,max_calls,input_rate,cached_rate,output_rate,rate_source,rates_checked_at,source_sha,stack_id)
    values (${sqlLiteral(value.id)},array[${accounts.map(a => sqlLiteral(a.id)).join(',')}]::uuid[],${sqlLiteral(auth.expires_at)},
      ${auth.cap_micro_usd},${auth.max_calls},${auth.input_rate},${auth.cached_rate},${auth.output_rate},${sqlLiteral(auth.rate_source)},
      ${sqlLiteral(auth.rates_checked_at)},${sqlLiteral(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim())},${sqlLiteral(verified.id)});`);
  writeFileSync(sessionFile, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ status: 'LOCAL_AUTH_READY', origin, accounts: accounts.length, credentials_file: sessionFile,
    budget: 'DISABLED', live_provider_status: 'LIVE_PROVIDER_NOT_RUN' }));
}

function providerKey() {
  if (!existsSync(providerFile)) return '';
  const text = readFileSync(providerFile, 'utf8');
  requireLocal(/^DEEPSEEK_API_KEY=[^\r\n]*\r?\n?$/.test(text), 'Only DEEPSEEK_API_KEY is accepted in the private provider file.');
  return text.slice(text.indexOf('=') + 1).trim();
}

export async function developerPilotCommand(args) {
  const [action, authorizationFile] = args;
  requireLocal(['prepare', 'edge', 'preview', 'close'].includes(action) && args.length <= (action === 'prepare' ? 2 : 1), 'Use prepare [authorization.json], edge, preview or close.');
  const runtime = localRuntime();
  runtime.verify();
  if (action === 'prepare') return withLocalLock(() => prepare(runtime, authorizationFile));
  const value = session(runtime);
  const database = localKnowledgeDatabase();
  if (action === 'close') {
    database.query(`update nestscout_private.kael_pilot_budgets set enabled=false where id=${sqlLiteral(value.id)};`);
    for (const file of [edgeFile, providerFile]) if (existsSync(file)) unlinkSync(file);
    console.log('Paid budget disabled; task-owned local provider files deleted. Stop the Edge worker to remove its in-memory key.');
    return;
  }
  if (action === 'edge') {
    protectDirectory();
    const key = providerKey();
    requireLocal(!key || value.authorization, 'A provider key alone cannot authorize paid calls.');
    if (key) parsePilotAuthorization(value.authorization);
    database.query(`update nestscout_private.kael_pilot_budgets set enabled=${key ? 'true' : 'false'} where id=${sqlLiteral(value.id)};`);
    writeFileSync(edgeFile, `KAEL_DEVELOPER_PILOT=local_8085\nKAEL_DEVELOPER_PILOT_ID=${value.id}\nKAEL_DEEPSEEK_MODEL=deepseek-flash\nDEEPSEEK_API_KEY=${key}\n`, { mode: 0o600 });
    try { runtime.cli(['functions', 'serve', 'kael', '--env-file', edgeFile]); }
    finally { if (existsSync(edgeFile)) unlinkSync(edgeFile); }
    return;
  }
  const status = runtime.status();
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(EXPO_PUBLIC_|KAEL_|DEEPSEEK_|ANTHROPIC_|PERPLEXITY_|SUPABASE_)|(?:KEY|TOKEN|SECRET|PASSWORD)$/i.test(name)));
  execFileSync(process.execPath, [path.join(root, 'node_modules/expo/bin/cli'), 'start', '--web', '--port', '8085', '--localhost'], {
    cwd: path.join(root, 'apps/mobile'), windowsHide: true, stdio: 'inherit',
    env: { ...environment, EXPO_NO_DOTENV: '1', EXPO_PUBLIC_NESTSCOUT_TARGET: 'local', EXPO_PUBLIC_SUPABASE_URL: value.origin,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.env.PUBLISHABLE_KEY, EXPO_PUBLIC_KAEL_DEVELOPER_PILOT: '1' },
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await developerPilotCommand(process.argv.slice(2)); }
  catch (error) { console.error(`BLOCKED: ${safeDiagnostic(error)}`); process.exitCode = 1; }
}
