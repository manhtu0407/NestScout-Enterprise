import type { PhoneRejection } from '../phone/vietnam-phone';
import type { AuthFailure } from './auth-gateway';

export const phoneMessages: Record<PhoneRejection, string> = {
  empty: 'Enter your Vietnamese mobile number.',
  invalid_characters: 'Use digits only, optionally starting with +.',
  unsupported_country: 'Only Vietnamese (+84) mobile numbers are supported.',
  invalid_number: 'This is not a valid Vietnamese mobile number.',
};

export const authMessages: Record<AuthFailure, string> = {
  invalid_code: 'The code is not correct. Check it and try again.',
  expired_code: 'The code has expired. Request a new one.',
  rate_limited: 'Too many attempts. Wait a moment before trying again.',
  signup_disabled: 'New accounts cannot be created in this environment.',
  provider_unavailable: 'Text message sign-in is not available in this environment.',
  network: 'Could not reach the sign-in service. Check your connection and retry.',
  unknown: 'Sign-in failed. Try again.',
};
