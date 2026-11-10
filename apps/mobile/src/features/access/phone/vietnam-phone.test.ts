import { maskPhone, normalizeVietnamPhone } from './vietnam-phone';

describe('normalizeVietnamPhone', () => {
  test.each([
    ['0912345678'],
    ['84912345678'],
    ['+84912345678'],
    ['0084912345678'],
    ['091 234 5678'],
    ['(+84) 912-345-678'],
    ['  +84.912.345.678 '],
  ])('%s normalizes to the single +84 form', (input) => {
    expect(normalizeVietnamPhone(input)).toEqual({ ok: true, e164: '+84912345678' });
  });

  test.each([
    ['0372345678', '+84372345678'],
    ['0562345678', '+84562345678'],
    ['0792345678', '+84792345678'],
    ['0862345678', '+84862345678'],
  ])('%s keeps its digits', (input, expected) => {
    expect(normalizeVietnamPhone(input)).toEqual({ ok: true, e164: expected });
  });

  test.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['0912abc678', 'invalid_characters'],
    ['0912345678 ext 5', 'invalid_characters'],
    ['091+2345678', 'invalid_characters'],
    ['+14155552671', 'unsupported_country'],
    ['0014155552671', 'unsupported_country'],
    ['912345678', 'invalid_number'],
    ['09123456', 'invalid_number'],
    ['091234567890', 'invalid_number'],
    ['+840912345678', 'invalid_number'],
    ['02838223456', 'invalid_number'],
    ['0112345678', 'invalid_number'],
  ])('%s is rejected', (input, reason) => {
    expect(normalizeVietnamPhone(input)).toEqual({ ok: false, reason });
  });
});

describe('maskPhone', () => {
  test('reveals only the final three digits', () => {
    const masked = maskPhone('+84912345678');
    expect(masked).toBe('+84 ••• ••• 678');
    expect(masked).not.toContain('912345');
  });
});
