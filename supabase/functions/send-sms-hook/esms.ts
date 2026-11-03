export const esmsEndpoint = 'https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/';
export const otpPlaceholder = '{{otp}}';

export type EsmsConfig = {
  apiKey: string;
  secretKey: string;
  brandname: string;
  template: string;
  smsType: string;
  sandbox: boolean;
  timeoutMs: number;
};

export type EsmsOutcome =
  | { status: 'accepted' }
  | { status: 'duplicate' }
  | { status: 'rejected'; code: string }
  | { status: 'unavailable' };

export type EsmsEnvironment = Record<string, string | undefined>;

export function readEsmsConfig(env: EsmsEnvironment): EsmsConfig | null {
  const apiKey = env.ESMS_API_KEY?.trim();
  const secretKey = env.ESMS_SECRET_KEY?.trim();
  const brandname = env.ESMS_BRANDNAME?.trim();
  const template = env.ESMS_OTP_TEMPLATE;
  if (!apiKey || !secretKey || !brandname || !template || !template.includes(otpPlaceholder)) return null;
  return {
    apiKey,
    secretKey,
    brandname,
    template,
    smsType: env.ESMS_SMS_TYPE?.trim() || '2',
    sandbox: env.ESMS_SANDBOX?.trim() !== '0',
    timeoutMs: 4000,
  };
}

export function missingEsmsSettings(env: EsmsEnvironment): string[] {
  const required = ['ESMS_API_KEY', 'ESMS_SECRET_KEY', 'ESMS_BRANDNAME', 'ESMS_OTP_TEMPLATE', 'SEND_SMS_HOOK_SECRET'];
  const missing = required.filter((name) => !env[name]?.trim());
  if (env.ESMS_OTP_TEMPLATE && !env.ESMS_OTP_TEMPLATE.includes(otpPlaceholder)) missing.push('ESMS_OTP_TEMPLATE_PLACEHOLDER');
  return missing;
}

export async function requestIdFor(localPhone: string, otp: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${localPhone}:${otp}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export async function sendEsmsOtp(
  config: EsmsConfig,
  localPhone: string,
  otp: string,
  fetcher: typeof fetch = fetch,
): Promise<EsmsOutcome> {
  const body = {
    ApiKey: config.apiKey,
    SecretKey: config.secretKey,
    Phone: localPhone,
    Content: config.template.replaceAll(otpPlaceholder, otp),
    Brandname: config.brandname,
    SmsType: config.smsType,
    IsUnicode: '0',
    Sandbox: config.sandbox ? '1' : '0',
    RequestId: await requestIdFor(localPhone, otp),
  };

  let response: Response;
  try {
    response = await fetcher(esmsEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch {
    return { status: 'unavailable' };
  }
  if (!response.ok) return { status: 'unavailable' };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { status: 'unavailable' };
  }
  const code = String((payload as { CodeResult?: unknown } | null)?.CodeResult ?? '');
  if (code === '100') return { status: 'accepted' };
  if (code === '124') return { status: 'duplicate' };
  return { status: 'rejected', code: /^\d{1,4}$/.test(code) ? code : 'unknown' };
}
