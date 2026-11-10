import { normalizeVietnamPhone } from '../phone/vietnam-phone';
import { formatNational, isCompleteNational, toDialable, toNationalDigits } from './phone-format';

describe('national phone input', () => {
  test.each([
    ['912345678', '912345678'],
    ['0912 345 678', '0912345678'],
    ['+84 912 345 678', '912345678'],
    ['84912345678', '912345678'],
    ['(091) 234-5678', '0912345678'],
    ['abc', ''],
    ['09123456789999', '0912345678'],
  ])('reduces %s to %s', (input, expected) => {
    expect(toNationalDigits(input)).toBe(expected);
  });

  test.each([
    ['', ''],
    ['91', '91'],
    ['912345', '912 345'],
    ['912345678', '912 345 678'],
    ['0912345678', '0912 345 678'],
  ])('groups %s as %s', (digits, expected) => {
    expect(formatNational(digits)).toBe(expected);
  });

  test('completeness follows the leading zero convention', () => {
    expect(isCompleteNational('91234567')).toBe(false);
    expect(isCompleteNational('912345678')).toBe(true);
    expect(isCompleteNational('091234567')).toBe(false);
    expect(isCompleteNational('0912345678')).toBe(true);
  });

  test('dialable numbers pass the Vietnamese mobile validator with or without the trunk zero', () => {
    expect(toDialable('912345678')).toBe('+84912345678');
    expect(toDialable('0912345678')).toBe('+84912345678');
    expect(normalizeVietnamPhone(toDialable('912345678'))).toEqual({ ok: true, e164: '+84912345678' });
    expect(normalizeVietnamPhone(toDialable('0912345678'))).toEqual({ ok: true, e164: '+84912345678' });
  });
});
