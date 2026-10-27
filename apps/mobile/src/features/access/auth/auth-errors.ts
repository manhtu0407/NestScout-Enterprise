import { isAuthRetryableFetchError } from '@supabase/supabase-js';

import type { AuthFailure } from './auth-gateway';

type ErrorLike = { code?: string; status?: number; name?: string };

export function classifyAuthError(error: ErrorLike): AuthFailure {
  if (isAuthRetryableFetchError(error as never) || error.name === 'AuthRetryableFetchError') return 'network';
  switch (error.code) {
    case 'otp_expired':
      return 'expired_code';
    case 'over_sms_send_rate_limit':
    case 'over_request_rate_limit':
      return 'rate_limited';
    case 'signup_disabled':
      return 'signup_disabled';
    case 'otp_disabled':
    case 'phone_provider_disabled':
    case 'sms_send_failed':
      return 'provider_unavailable';
    case 'validation_failed':
      return 'invalid_code';
    default:
      break;
  }
  if (error.status === 429) return 'rate_limited';
  if (error.status === 400 || error.status === 401 || error.status === 403) return 'invalid_code';
  return 'unknown';
}
