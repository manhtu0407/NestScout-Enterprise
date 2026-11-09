import { checkConfirmation, checkEmail, checkPassword, minPasswordLength, normalizeEmail } from './email-credentials';

describe('email credential checks', () => {
  test('normalizes case and surrounding whitespace', () => {
    expect(normalizeEmail('  Ten@Gmail.COM ')).toBe('ten@gmail.com');
  });

  test('accepts ordinary addresses and rejects empty or malformed ones', () => {
    expect(checkEmail('ten@gmail.com')).toBeNull();
    expect(checkEmail('  ')).toBe('email_empty');
    expect(checkEmail('ten@gmail')).toBe('email_invalid');
    expect(checkEmail('ten gmail@x.com')).toBe('email_invalid');
    expect(checkEmail(`${'a'.repeat(250)}@x.com`)).toBe('email_invalid');
  });

  test('requires the minimum password length without trimming it', () => {
    expect(checkPassword('')).toBe('password_empty');
    expect(checkPassword('a'.repeat(minPasswordLength - 1))).toBe('password_too_short');
    expect(checkPassword(' '.repeat(minPasswordLength))).toBeNull();
  });

  test('requires the confirmation to match exactly', () => {
    expect(checkConfirmation('hunter2hunter2', '')).toBe('confirm_empty');
    expect(checkConfirmation('hunter2hunter2', 'Hunter2hunter2')).toBe('confirm_mismatch');
    expect(checkConfirmation('hunter2hunter2', 'hunter2hunter2')).toBeNull();
  });
});
