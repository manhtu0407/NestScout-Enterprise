import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localRuntime, requireLocal, safeDiagnostic, withLocalLock } from './supabase-local.mjs';
import { discoverLocalProviders } from './kael-local-providers.mjs';
import { localKnowledgeDatabase, sqlLiteral } from './kael-knowledge.mjs';
import { root } from './tool-path.mjs';

export const pilotDirectory = path.join(os.homedir(), '.codex', 'private', 'kael-behavior-8085');
const sessionFile = path.join(pilotDirectory, 'session.json');
const edgeFile = path.join(pilotDirectory, 'edge.json');
const legacyEdgeFile = path.join(pilotDirectory, 'edge.env');

export function parsePilotAuthorization(value, now = new Date()) {
  requireLocal(value?.purpose === 'kael_developer_8085' && value.model === 'deepseek-flash'
    && value.provider === 'deepseek' && value.owner_approved === true, 'Explicit Flash-only owner authorization is required.');
  requireLocal(Number.isSafeInteger(value.cap_micro_usd) && value.cap_micro_usd > 0 && value.cap_micro_usd <= 1000000,
    'The authorized cap must be at most USD 1.');
  requireLocal(Number.isInteger(value.max_calls) && value.max_calls > 0 && value.max_calls <= 2147483647, 'Invalid request cap.');
  const checked = Date.parse(value.rates_checked_at);
  const expires = Date.parse(value.expires_at);
  requireLocal(Number.isFinite(checked) && checked <= now.getTime() && now.getTime() - checked < 86400000
    && expires > now.getTime() && expires - now.getTime() <= 3600000, 'Fresh rates and an expiry within one hour are required.');
  requireLocal(value.rate_source === 'https://api-docs.deepseek.com/quick_start/pricing/'
    && [value.input_rate, value.cached_rate, value.output_rate].every(n => typeof n === 'number' && n > 0 && n <= 100)
    && value.cached_rate <= value.input_rate, 'An explicit verified conservative rate card is required.');
  return value;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parsePilotRenewal(value, pilotId, now = new Date()) {
  parsePilotAuthorization(value, now);
  requireLocal(uuid.test(value.approval_id ?? '') && value.pilot_id === pilotId, 'Approval must identify this pilot and have a unique approval UUID.');
  const approved = Date.parse(value.approved_at);
  requireLocal(Number.isFinite(approved) && approved <= now.getTime()
    && Date.parse(value.expires_at) <= approved + 3600000, 'Fresh owner approval must specify an approval time and a window of at most one hour.');
  const fields = ['approval_id', 'pilot_id', 'approved_at', 'purpose', 'provider', 'model', 'owner_approved', 'cap_micro_usd',
    'max_calls', 'expires_at', 'rates_checked_at', 'rate_source', 'input_rate', 'cached_rate', 'output_rate'];
  return Object.fromEntries(fields.map(field => [field, value[field]]));
}

function protectDirectory() {
  const directory = pilotDirectory;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  requireLocal(lstatSync(directory).isDirectory(), 'The private configuration directory must be a real directory.');
  if (process.platform === 'win32') {
    const account = execFileSync('whoami', [], { encoding: 'utf8' }).trim();
    execFileSync('icacls', [directory, '/inheritance:r', '/grant:r', `${account}:(OI)(CI)F`], { stdio: 'ignore', windowsHide: true });
  } else {
    const owner = lstatSync(directory);
    requireLocal((owner.mode & 0o077) === 0 && owner.uid === process.getuid(), 'The private configuration directory must be owner-only.');
  }
}

function session(runtime) {
  const value = JSON.parse(readFileSync(sessionFile, 'utf8'));
  const verified = runtime.verify();
  requireLocal(uuid.test(value.id) && value.stack_id === verified.id && value.root === root && value.branch === runtime.branch
    && value.origin === verified.endpoints['rest.http'].url, 'The saved session belongs to another checkout, branch or local gateway.');
  return value;
}

function provisionPilotBudget(database, value, approval, recordApproval = false) {
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const result = database.query(`with provisioned as (
    insert into nestscout_private.kael_pilot_budgets
      (id,actors,authorized_at,expires_at,cap_micro_usd,max_calls,input_rate,cached_rate,output_rate,rate_source,rates_checked_at,source_sha,stack_id)
    values (${sqlLiteral(value.id)},array[${value.accounts.map(a => sqlLiteral(a.id)).join(',')}]::uuid[],
      ${recordApproval ? sqlLiteral(approval.approved_at) : 'clock_timestamp()'},${sqlLiteral(approval.expires_at)},
      ${approval.cap_micro_usd},${approval.max_calls},${approval.input_rate},${approval.cached_rate},${approval.output_rate},
      ${sqlLiteral(approval.rate_source)},${sqlLiteral(approval.rates_checked_at)},${sqlLiteral(sourceSha)},${sqlLiteral(value.stack_id)})
    on conflict (id) do nothing returning id
  )${recordApproval ? `, recorded as (
    insert into nestscout_private.kael_pilot_renewals (approval_id,pilot_id,approval)
      select ${sqlLiteral(approval.approval_id)},id,${sqlLiteral(JSON.stringify(approval))}::jsonb from provisioned
    returning pilot_id
  ) select pilot_id from recorded` : ' select id from provisioned'};`).trim();
  requireLocal(result === value.id, 'BUDGET_ALREADY_EXISTS: use the existing ledger.');
}

export function applyPilotApproval(database, value, rawApproval) {
  const approval = parsePilotRenewal(rawApproval, value.id);
  const result = database.query(`select nestscout_private.kael_pilot_reauthorize(${sqlLiteral(value.id)},
    ${sqlLiteral(value.stack_id)}, ${sqlLiteral(JSON.stringify(approval))}::jsonb);`).trim();
  if (result === 'BUDGET_MISSING') {
    provisionPilotBudget(database, value, approval, true);
    return 'AUTHORIZED_DISABLED';
  }
  requireLocal(result === 'REAUTHORIZED_DISABLED', result);
  return result;
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
  if (auth) provisionPilotBudget(database, value, auth);
  writeFileSync(sessionFile, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ status: 'LOCAL_AUTH_READY', origin, accounts: accounts.length, credentials_file: sessionFile,
    budget: 'DISABLED', live_provider_status: 'LIVE_PROVIDER_NOT_RUN' }));
}

function providerKey() {
  const { status, env } = discoverLocalProviders();
  requireLocal(status === 'source_loaded' || status === 'credential_missing', 'CREDENTIAL_INVALID: check the private provider source.');
  const key = env.DEEPSEEK_API_KEY ?? '';
  requireLocal(!key || /^sk-(?!ant-)[A-Za-z0-9_-]{16,}$/.test(key), 'CREDENTIAL_INVALID: the pilot requires a DeepSeek API key.');
  return key;
}

function credentialFingerprint(key) {
  return key ? createHash('sha256').update(key).digest('hex') : null;
}

function pilotBudget(database, value) {
  const result = database.query(`select json_build_object('enabled', b.enabled, 'halted', b.halted, 'generation', b.authorized_at,
    'expires_at', b.expires_at, 'expired', b.expires_at <= clock_timestamp(),
    'rates_stale', b.rates_checked_at > clock_timestamp() or b.rates_checked_at < clock_timestamp() - interval '24 hours',
    'cap_micro_usd', b.cap_micro_usd, 'max_calls', b.max_calls,
    'calls', c.calls, 'committed_micro_usd', c.committed, 'unresolved', c.unresolved)
    from nestscout_private.kael_pilot_effective_budget b
    cross join lateral (
      select count(*) as calls, coalesce(sum(coalesce(estimated_micro_usd, reserved_micro_usd)), 0) as committed,
        count(*) filter (where status <> 'settled') as unresolved
      from nestscout_private.kael_pilot_calls where pilot_id = b.id
    ) c
    where b.id = ${sqlLiteral(value.id)} and b.stack_id = ${sqlLiteral(value.stack_id)};`).trim();
  return result ? JSON.parse(result) : null;
}

function requireBudget(budget) {
  requireLocal(budget, 'BUDGET_MISSING: apply explicit owner approval with reauthorize.');
  requireLocal(!budget.expired, 'AUTHORIZATION_EXPIRED: apply a fresh explicit owner approval with reauthorize.');
  requireLocal(!budget.rates_stale, 'RATE_CARD_STALE: reverify rates and obtain fresh owner approval.');
  requireLocal(!budget.halted && budget.unresolved === 0, 'RECONCILIATION_REQUIRED: prior accounting is still blocked.');
  requireLocal(budget.calls < budget.max_calls && budget.committed_micro_usd < budget.cap_micro_usd, 'BUDGET_EXHAUSTED: cumulative limit reached.');
}

async function probeEdge(runtime, value, budget) {
  const { env } = runtime.status();
  try {
    const response = await fetch(`${value.origin}/functions/v1/kael`, {
      headers: { apikey: env.PUBLISHABLE_KEY, authorization: `Bearer ${env.ANON_KEY}`, 'x-kael-pilot-probe': '1' },
      signal: AbortSignal.timeout(5000), redirect: 'error',
    });
    if (!response.ok) {
      if (response.status === 503 && (await response.json().catch(() => null))?.status === 'EDGE_INVALID_CONFIG') {
        return { status: 'EDGE_INVALID_CONFIG' };
      }
      if (!response.bodyUsed) await response.body?.cancel();
      return { status: 'EDGE_UNAVAILABLE', http_status: response.status };
    }
    const result = await response.json();
    if (result?.pilot_id !== value.id || result.model !== 'deepseek-flash' || typeof result.credential_loaded !== 'boolean') {
      return { status: 'EDGE_SESSION_MISMATCH' };
    }
    const launch = existsSync(edgeFile) ? JSON.parse(readFileSync(edgeFile, 'utf8')) : null;
    let key;
    try { key = launch?.offline ? '' : providerKey(); }
    catch { return { status: 'EDGE_INVALID_CONFIG' }; }
    if (!launch || !uuid.test(launch.worker) || launch.worker !== result.worker_id || Boolean(key) !== result.credential_loaded
      || (budget?.generation ?? null) !== result.generation
      || launch.fingerprint !== credentialFingerprint(key)) {
      return { status: 'EDGE_STALE', credential_loaded: result.credential_loaded };
    }
    return { status: 'EDGE_READY', credential_loaded: result.credential_loaded, generation: result.generation };
  } catch {
    return { status: 'EDGE_UNAVAILABLE' };
  }
}

export async function developerPilotCommand(args) {
  const [action, option] = args;
  requireLocal(args.length <= 2 && (action === 'prepare' || (action === 'reauthorize' && path.isAbsolute(option ?? ''))
    || (action === 'edge' && (!option || option === '--offline')) || (['preview', 'close', 'status', 'arm'].includes(action) && args.length === 1)),
  'Use prepare [authorization.json], reauthorize ABSOLUTE_APPROVAL_PATH, edge [--offline], status, arm, preview or close.');
  const runtime = localRuntime();
  runtime.verify();
  if (action === 'prepare') return withLocalLock(() => prepare(runtime, option));
  const value = session(runtime);
  const database = localKnowledgeDatabase();
  if (action === 'reauthorize') {
    return withLocalLock(() => console.log(applyPilotApproval(database, value, JSON.parse(readFileSync(option, 'utf8')))));
  }
  if (action === 'status' || action === 'arm') return withLocalLock(async () => {
    const budget = pilotBudget(database, value);
    if (action === 'status') {
      let credentialSource;
      try { credentialSource = providerKey() ? 'PRESENT' : 'CREDENTIAL_MISSING'; }
      catch { credentialSource = 'CREDENTIAL_INVALID'; }
      const edge = await probeEdge(runtime, value, budget);
      console.log(JSON.stringify({ pilot_id: value.id, origin: value.origin, credential_source: credentialSource,
        authorization: !budget ? 'BUDGET_MISSING' : budget.expired ? 'AUTHORIZATION_EXPIRED' : budget.rates_stale ? 'RATE_CARD_STALE' : 'CURRENT',
        spending: budget?.enabled ? 'ENABLED' : 'BUDGET_DISABLED', budget, edge }));
      return;
    }
    requireBudget(budget);
    const edge = await probeEdge(runtime, value, budget);
    requireLocal(edge.status === 'EDGE_READY', edge.status);
    requireLocal(edge.credential_loaded, 'CREDENTIAL_MISSING: the current Edge has no local credential.');
    const armed = database.query(`select nestscout_private.kael_pilot_arm(${sqlLiteral(value.id)},
      ${sqlLiteral(value.stack_id)}, ${sqlLiteral(budget.generation)}::timestamptz);`).trim();
    requireLocal(armed === 'BUDGET_ENABLED', armed);
    console.log(armed);
    return;
  });
  if (action === 'close') return withLocalLock(() => {
    database.query(`update nestscout_private.kael_pilot_budgets set enabled=false where id=${sqlLiteral(value.id)};`);
    console.log('BUDGET_DISABLED');
  });
  if (action === 'edge') {
    protectDirectory();
    const budget = pilotBudget(database, value);
    const offline = option === '--offline';
    const key = offline ? '' : providerKey();
    const worker = randomUUID();
    await withLocalLock(() => {
      requireLocal(!existsSync(legacyEdgeFile) && !existsSync(edgeFile), 'EDGE_ALREADY_STARTED: stop the existing launcher before starting another.');
      writeFileSync(edgeFile, JSON.stringify({ worker, offline, fingerprint: credentialFingerprint(key) }), { flag: 'wx', mode: 0o600 });
    });
    try {
      runtime.serveKael({
        KAEL_DEVELOPER_PILOT: 'local_8085', KAEL_DEVELOPER_PILOT_ID: value.id,
        KAEL_PILOT_GENERATION: budget?.generation ?? '', KAEL_PILOT_WORKER_ID: worker, DEEPSEEK_API_KEY: key,
      }, () => console.log(key ? 'EDGE_STARTING: server credential configured; spending follows the existing budget.' : 'EDGE_STARTING_OFFLINE: provider credential not loaded.'));
    } finally {
      unlinkSync(edgeFile);
    }
    return;
  }
  const edge = await probeEdge(runtime, value, pilotBudget(database, value));
  requireLocal(edge.status === 'EDGE_READY', edge.status);
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
