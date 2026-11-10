import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { createSendSmsHook } from '../supabase/functions/send-sms-hook/handler.ts';
import { requestIdFor, readEsmsConfig, sendEsmsOtp } from '../supabase/functions/send-sms-hook/esms.ts';
import { maskPhone, toLocalVietnamPhone } from '../supabase/functions/send-sms-hook/phone.ts';
import { verifyWebhook } from '../supabase/functions/send-sms-hook/webhook.ts';

const keyBytes = Buffer.from('test-signing-key-material-0123456789');
const hookSecret = `v1,whsec_${keyBytes.toString('base64')}`;
const nowMs = 1_800_000_000_000;
const nowSeconds = nowMs / 1000;
const otp = '482915';
const environment = {
  SEND_SMS_HOOK_SECRET: hookSecret,
  ESMS_API_KEY: 'api-key-value',
  ESMS_SECRET_KEY: 'secret-key-value',
  ESMS_BRANDNAME: 'BrandValue',
  ESMS_OTP_TEMPLATE: 'Ma xac thuc cua ban la {{otp}}',
};

function sign(body, { id = 'msg_1', timestamp = nowSeconds } = {}) {
  const signature = createHmac('sha256', keyBytes).update(`${id}.${timestamp}.${body}`).digest('base64');
  return { 'webhook-id': id, 'webhook-timestamp': String(timestamp), 'webhook-signature': `v1,${signature}` };
}

function hookRequest(phone = '+84912345678', code = otp, headersFor = sign) {
  const body = JSON.stringify({ user: { phone }, sms: { otp: code } });
  return new Request('https://hook.invalid/send-sms-hook', { method: 'POST', body, headers: headersFor(body) });
}

function providerReturning(payload, init = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return new Response(JSON.stringify(payload), { status: 200, ...init });
  };
  return { fetcher, calls };
}

function hookWith(fetcher, overrides = {}) {
  const logs = [];
  const handle = createSendSmsHook({ env: { ...environment, ...overrides }, fetcher, now: () => nowMs, log: (event) => logs.push(event) });
  return { handle, logs };
}

test('Vietnamese mobile numbers normalise to the local eSMS form and others are refused', () => {
  for (const raw of ['+84912345678', '84912345678', '0912345678']) assert.equal(toLocalVietnamPhone(raw), '0912345678', raw);
  for (const raw of ['+14155550123', '+8421234567', '091234567', '09123456789', '', 'abc']) assert.equal(toLocalVietnamPhone(raw), null, raw);
  assert.equal(maskPhone('0912345678'), '***678');
});

test('webhook verification accepts a valid signature and rejects tampering, replay and malformed input', async () => {
  const body = '{"a":1}';
  const headers = sign(body);
  const parts = { id: headers['webhook-id'], timestamp: headers['webhook-timestamp'], signature: headers['webhook-signature'] };
  assert.equal(await verifyWebhook(hookSecret, parts, body, nowSeconds), true);
  assert.equal(await verifyWebhook(hookSecret, parts, '{"a":2}', nowSeconds), false);
  assert.equal(await verifyWebhook(hookSecret, parts, body, nowSeconds + 301), false);
  assert.equal(await verifyWebhook(hookSecret, parts, body, nowSeconds - 301), false);
  assert.equal(await verifyWebhook(hookSecret, { ...parts, signature: 'v1,AAAA' }, body, nowSeconds), false);
  assert.equal(await verifyWebhook(hookSecret, { ...parts, signature: 'v2,' + parts.signature.slice(3) }, body, nowSeconds), false);
  assert.equal(await verifyWebhook(hookSecret, { ...parts, id: null }, body, nowSeconds), false);
  assert.equal(await verifyWebhook(hookSecret, { ...parts, timestamp: 'abc' }, body, nowSeconds), false);
  assert.equal(await verifyWebhook('v1,whsec_' + Buffer.from('other-key').toString('base64'), parts, body, nowSeconds), false);
  assert.equal(await verifyWebhook('v1,whsec_!!!', parts, body, nowSeconds), false);
  assert.equal(await verifyWebhook(hookSecret, { ...parts, signature: `v1,AAAA ${parts.signature}` }, body, nowSeconds), true);
});

test('an authentic request is sent to eSMS in sandbox mode by default and acknowledged', async () => {
  const provider = providerReturning({ CodeResult: '100' });
  const { handle, logs } = hookWith(provider.fetcher);
  const response = await handle(hookRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {});
  assert.equal(provider.calls.length, 1);
  const [{ url, body }] = provider.calls;
  assert.equal(url, 'https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/');
  assert.equal(body.Phone, '0912345678');
  assert.equal(body.Content, `Ma xac thuc cua ban la ${otp}`);
  assert.equal(body.Sandbox, '1');
  assert.equal(body.SmsType, '2');
  assert.equal(body.IsUnicode, '0');
  assert.equal(body.RequestId, await requestIdFor('0912345678', otp));
  assert.ok(body.RequestId.length <= 50);
  const logged = JSON.stringify(logs);
  for (const secret of [otp, '0912345678', '84912345678', 'api-key-value', 'secret-key-value', hookSecret]) assert.ok(!logged.includes(secret), secret);
});

test('live delivery is only requested when sandbox is explicitly disabled', async () => {
  const provider = providerReturning({ CodeResult: '100' });
  const { handle } = hookWith(provider.fetcher, { ESMS_SANDBOX: '0' });
  assert.equal((await handle(hookRequest())).status, 200);
  assert.equal(provider.calls[0].body.Sandbox, '0');
});

test('unsigned, forged, stale and non-POST requests never reach eSMS', async () => {
  const provider = providerReturning({ CodeResult: '100' });
  const { handle } = hookWith(provider.fetcher);
  const body = JSON.stringify({ user: { phone: '+84912345678' }, sms: { otp } });
  const attempts = [
    new Request('https://hook.invalid/', { method: 'POST', body }),
    new Request('https://hook.invalid/', { method: 'POST', body, headers: { ...sign(body), 'webhook-signature': 'v1,AAAA' } }),
    new Request('https://hook.invalid/', { method: 'POST', body, headers: sign(body, { timestamp: nowSeconds - 3600 }) }),
    new Request('https://hook.invalid/', { method: 'POST', body: JSON.stringify({ user: { phone: '+84912345678' }, sms: { otp: '000000' } }), headers: sign(body) }),
  ];
  for (const attempt of attempts) assert.equal((await handle(attempt)).status, 401);
  assert.equal((await handle(new Request('https://hook.invalid/', { method: 'GET' }))).status, 405);
  assert.equal(provider.calls.length, 0);
});

test('signed but unsupported payloads are rejected before eSMS', async () => {
  const provider = providerReturning({ CodeResult: '100' });
  const { handle } = hookWith(provider.fetcher);
  assert.equal((await handle(hookRequest('+14155550123'))).status, 400);
  assert.equal((await handle(hookRequest('+84912345678', '12'))).status, 400);
  assert.equal((await handle(hookRequest('+84912345678', '12345a'))).status, 400);
  const garbage = 'not json';
  assert.equal((await handle(new Request('https://hook.invalid/', { method: 'POST', body: garbage, headers: sign(garbage) }))).status, 400);
  assert.equal(provider.calls.length, 0);
});

test('provider rejection codes, transport errors, timeouts and bad bodies fail safely with a generic error', async () => {
  for (const code of ['101', '104', '146', '99', 'x']) {
    const provider = providerReturning({ CodeResult: code });
    const { handle, logs } = hookWith(provider.fetcher);
    const response = await handle(hookRequest());
    assert.equal(response.status, 500, code);
    const text = await response.text();
    assert.ok(!text.includes('secret-key-value') && !text.includes('api-key-value') && !text.includes(code));
    assert.equal(logs[0].outcome, 'rejected');
  }
  const failing = [
    async () => { throw new TypeError('network'); },
    async () => { throw new DOMException('timeout', 'TimeoutError'); },
    async () => new Response('upstream down', { status: 502 }),
    async () => new Response('<html>', { status: 200 }),
  ];
  for (const fetcher of failing) {
    const { handle, logs } = hookWith(fetcher);
    assert.equal((await handle(hookRequest())).status, 500);
    assert.equal(logs[0].outcome, 'unavailable');
  }
});

test('eSMS duplicate RequestId 124 is treated as an already accepted message', async () => {
  const provider = providerReturning({ CodeResult: '124' });
  const { handle, logs } = hookWith(provider.fetcher);
  assert.equal((await handle(hookRequest())).status, 200);
  assert.equal(logs[0].outcome, 'duplicate');
});

test('missing credentials or a template without the OTP placeholder fail closed and name only the settings', async () => {
  for (const overrides of [{ ESMS_SECRET_KEY: '' }, { ESMS_BRANDNAME: undefined }, { ESMS_API_KEY: ' ' }, { SEND_SMS_HOOK_SECRET: '' }, { ESMS_OTP_TEMPLATE: 'no placeholder' }]) {
    const provider = providerReturning({ CodeResult: '100' });
    const { handle, logs } = hookWith(provider.fetcher, overrides);
    const response = await handle(hookRequest());
    assert.equal(response.status, 503);
    assert.equal(provider.calls.length, 0);
    assert.match(logs[0].missing, /^[A-Z_,]+$/);
  }
});

test('an eSMS request is bounded by a timeout and carries a deterministic idempotency key', async () => {
  const config = readEsmsConfig(environment);
  assert.ok(config.timeoutMs > 0 && config.timeoutMs < 5000);
  let signal;
  const outcome = await sendEsmsOtp(config, '0912345678', otp, async (_url, options) => {
    signal = options.signal;
    return new Response(JSON.stringify({ CodeResult: '100' }));
  });
  assert.equal(outcome.status, 'accepted');
  assert.ok(signal instanceof AbortSignal);
  assert.equal(await requestIdFor('0912345678', otp), await requestIdFor('0912345678', otp));
  assert.notEqual(await requestIdFor('0912345678', otp), await requestIdFor('0912345678', '000000'));
});
