import { missingEsmsSettings, readEsmsConfig, sendEsmsOtp, type EsmsEnvironment, type EsmsOutcome } from './esms.ts';
import { maskPhone, toLocalVietnamPhone } from './phone.ts';
import { verifyWebhook } from './webhook.ts';

export type HookDependencies = {
  env: EsmsEnvironment;
  fetcher?: typeof fetch;
  now?: () => number;
  log?: (event: Record<string, string>) => void;
};

const otpPattern = /^\d{6}$/;
const maxBodyChars = 4096;

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function failure(status: number, message: string): Response {
  return respond(status, { error: { http_code: status, message } });
}

function parsePayload(rawBody: string): { phone: string; otp: string } | null {
  try {
    const payload = JSON.parse(rawBody) as { user?: { phone?: unknown }; sms?: { otp?: unknown } };
    const phone = payload.user?.phone;
    const otp = payload.sms?.otp;
    return typeof phone === 'string' && typeof otp === 'string' ? { phone, otp } : null;
  } catch {
    return null;
  }
}

function outcomeEvent(outcome: EsmsOutcome): Record<string, string> {
  return outcome.status === 'rejected' ? { outcome: 'rejected', code: outcome.code } : { outcome: outcome.status };
}

export function createSendSmsHook({ env, fetcher = fetch, now = Date.now, log = console.error }: HookDependencies) {
  return async function handle(request: Request): Promise<Response> {
    if (request.method !== 'POST') return failure(405, 'Method not allowed.');

    const secret = env.SEND_SMS_HOOK_SECRET?.trim();
    const config = readEsmsConfig(env);
    if (!secret || !config) {
      log({ event: 'sms_hook_misconfigured', missing: missingEsmsSettings(env).join(',') });
      return failure(503, 'SMS delivery is not configured.');
    }

    const rawBody = await request.text();
    if (rawBody.length > maxBodyChars) return failure(413, 'Payload too large.');

    const authentic = await verifyWebhook(
      secret,
      {
        id: request.headers.get('webhook-id'),
        timestamp: request.headers.get('webhook-timestamp'),
        signature: request.headers.get('webhook-signature'),
      },
      rawBody,
      Math.floor(now() / 1000),
    );
    if (!authentic) return failure(401, 'Invalid webhook signature.');

    const payload = parsePayload(rawBody);
    const localPhone = payload ? toLocalVietnamPhone(payload.phone) : null;
    if (!payload || !localPhone || !otpPattern.test(payload.otp)) return failure(400, 'Unsupported SMS request.');

    const outcome = await sendEsmsOtp(config, localPhone, payload.otp, fetcher);
    log({ event: 'sms_hook_result', phone: maskPhone(localPhone), sandbox: config.sandbox ? '1' : '0', ...outcomeEvent(outcome) });

    if (outcome.status === 'accepted' || outcome.status === 'duplicate') return respond(200, {});
    return failure(500, 'The SMS provider could not accept the message.');
  };
}
