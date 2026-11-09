import { isAuthRetryableFetchError } from '@supabase/supabase-js';

import type { AuthFailure } from './auth-gateway';

type ErrorLike = { code?: string; status?: number; name?: string };

export function classifySocialError(error: ErrorLike): AuthFailure {
  if (isAuthRetryableFetchError(error as never) || error.name === 'AuthRetryableFetchError') return 'network';
  if (error.code === 'over_request_rate_limit' || error.status === 429) return 'rate_limited';
  if (error.code === 'signup_disabled') return 'signup_disabled';
  if (error.code === 'validation_failed' || error.code === 'provider_disabled' || error.code === 'oauth_provider_not_supported' || error.code === 'bad_oauth_callback') return 'provider_unavailable';
  return 'unknown';
}

export function classifyEmailError(error: ErrorLike): AuthFailure {
  if (isAuthRetryableFetchError(error as never) || error.name === 'AuthRetryableFetchError') return 'network';
  switch (error.code) {
    case 'invalid_credentials':
      return 'invalid_credentials';
    case 'email_not_confirmed':
      return 'email_not_confirmed';
    case 'user_already_exists':
    case 'email_exists':
      return 'email_taken';
    case 'weak_password':
      return 'weak_password';
    case 'signup_disabled':
      return 'signup_disabled';
    case 'email_provider_disabled':
    case 'hook_timeout':
    case 'hook_timeout_after_retry':
      return 'provider_unavailable';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'rate_limited';
    default:
      break;
  }
  return error.status === 429 ? 'rate_limited' : 'unknown';
}

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
    case 'hook_timeout':
    case 'hook_timeout_after_retry':
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
