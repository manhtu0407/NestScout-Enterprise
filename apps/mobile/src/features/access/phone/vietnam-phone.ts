import { parsePhoneNumberFromString } from 'libphonenumber-js/mobile';

export type PhoneRejection = 'empty' | 'invalid_characters' | 'unsupported_country' | 'invalid_number';
export type PhoneResult = { ok: true; e164: string } | { ok: false; reason: PhoneRejection };

const compact = /^\+?\d+$/;

export function normalizeVietnamPhone(input: string): PhoneResult {
  const text = input.trim();
  if (!text) return { ok: false, reason: 'empty' };
  const stripped = text.replace(/[\s().-]/g, '');
  if (!compact.test(stripped)) return { ok: false, reason: 'invalid_characters' };
  const digits = stripped.replace(/\D/g, '');
  let candidate: string;
  if (stripped.startsWith('+')) {
    if (!digits.startsWith('84')) return { ok: false, reason: 'unsupported_country' };
    candidate = `+${digits}`;
  } else if (digits.startsWith('0084')) {
    candidate = `+${digits.slice(2)}`;
  } else if (digits.startsWith('00')) {
    return { ok: false, reason: 'unsupported_country' };
  } else if (digits.startsWith('84')) {
    candidate = `+${digits}`;
  } else if (digits.startsWith('0')) {
    candidate = `+84${digits.slice(1)}`;
  } else {
    return { ok: false, reason: 'invalid_number' };
  }
  const parsed = candidate.startsWith('+840') ? undefined : parsePhoneNumberFromString(candidate);
  if (!parsed || parsed.countryCallingCode !== '84' || !parsed.isValid() || parsed.getType() !== 'MOBILE') {
    return { ok: false, reason: 'invalid_number' };
  }
  return { ok: true, e164: parsed.number };
}

export function maskPhone(e164: string): string {
  return `+84 ••• ••• ${e164.slice(-3)}`;
}
