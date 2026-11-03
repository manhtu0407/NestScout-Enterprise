const toleranceSeconds = 300;
const secretPrefix = /^v1,whsec_/;

export type WebhookHeaders = { id: string | null; timestamp: string | null; signature: string | null };

function decodeBase64(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function verifyWebhook(
  secret: string,
  headers: WebhookHeaders,
  rawBody: string,
  nowSeconds: number,
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return false;

  const key = decodeBase64(secret.replace(secretPrefix, ''));
  if (!key || key.length === 0) return false;

  const hmacKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = new Uint8Array(
    await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)),
  );

  return signature.split(' ').some((candidate) => {
    const [version, value] = candidate.split(',');
    const decoded = version === 'v1' && value ? decodeBase64(value) : null;
    return decoded !== null && equalBytes(decoded, expected);
  });
}
