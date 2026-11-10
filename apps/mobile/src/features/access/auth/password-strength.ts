import { getRandomBytes } from 'expo-crypto';

import { minPasswordLength } from './email-credentials';

export type PasswordRuleId = 'length' | 'case' | 'number' | 'symbol';

export type PasswordRule = { id: PasswordRuleId; label: string; test: (password: string) => boolean };

export const passwordRules: readonly PasswordRule[] = [
  { id: 'length', label: `Ít nhất ${minPasswordLength} ký tự`, test: password => password.length >= minPasswordLength },
  { id: 'case', label: 'Có chữ hoa và chữ thường', test: password => /\p{Ll}/u.test(password) && /\p{Lu}/u.test(password) },
  { id: 'number', label: 'Có ít nhất một chữ số', test: password => /\d/.test(password) },
  { id: 'symbol', label: 'Có ít nhất một ký tự đặc biệt', test: password => /[^\p{L}\p{N}\s]/u.test(password) },
];

export type PasswordLevel = 0 | 1 | 2 | 3 | 4;

export const passwordLevelLabels: readonly string[] = ['Chưa nhập', 'Yếu', 'Trung bình', 'Khá', 'Mạnh'];

export const tooShortLabel = 'Quá ngắn';

export const minAcceptedLevel: PasswordLevel = 3;

export type PasswordStrengthResult = { level: PasswordLevel; label: string; met: readonly PasswordRuleId[]; tooShort: boolean };

export function scorePassword(password: string): PasswordStrengthResult {
  const met = passwordRules.filter(rule => rule.test(password)).map(rule => rule.id);
  if (password.length === 0) return { level: 0, label: passwordLevelLabels[0] ?? '', met, tooShort: false };
  if (!met.includes('length')) return { level: 1, label: tooShortLabel, met, tooShort: true };
  const level = Math.min(4, Math.max(1, met.length)) as PasswordLevel;
  return { level, label: passwordLevelLabels[level] ?? '', met, tooShort: false };
}

const lower = 'abcdefghijkmnopqrstuvwxyz';
const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const digits = '23456789';
const symbols = '!@#$%^&*-_=+?';
const suggestedLength = 14;

function pick(alphabet: string, byte: number): string {
  return alphabet.charAt(byte % alphabet.length);
}

export function suggestPassword(): string {
  const bytes = getRandomBytes(suggestedLength * 2);
  const required = [pick(lower, bytes[0] ?? 0), pick(upper, bytes[1] ?? 0), pick(digits, bytes[2] ?? 0), pick(symbols, bytes[3] ?? 0)];
  const all = lower + upper + digits + symbols;
  const rest = Array.from({ length: suggestedLength - required.length }, (_, index) => pick(all, bytes[4 + index] ?? 0));
  const chars = [...required, ...rest];
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = (bytes[suggestedLength + index] ?? 0) % (index + 1);
    const held = chars[index] ?? '';
    chars[index] = chars[swap] ?? '';
    chars[swap] = held;
  }
  return chars.join('');
}
