import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { classifyAuthError } from './auth-errors';

describe('classifyAuthError', () => {
  test.each([
    ['otp_expired', 403, 'expired_code'],
    ['over_sms_send_rate_limit', 429, 'rate_limited'],
    ['over_request_rate_limit', 429, 'rate_limited'],
    ['signup_disabled', 422, 'signup_disabled'],
    ['phone_provider_disabled', 422, 'provider_unavailable'],
    ['sms_send_failed', 500, 'provider_unavailable'],
    ['validation_failed', 400, 'invalid_code'],
    [undefined, 429, 'rate_limited'],
    [undefined, 403, 'invalid_code'],
    [undefined, 500, 'unknown'],
  ] as const)('%s (%s) is %s', (code, status, expected) => {
    expect(classifyAuthError(new AuthApiError('Token has expired or is invalid for +84912345678', status, code))).toBe(expected);
  });

  test('transport failures are network failures', () => {
    expect(classifyAuthError(new AuthRetryableFetchError('failed', 0))).toBe('network');
  });
});
