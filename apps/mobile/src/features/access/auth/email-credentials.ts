export const minPasswordLength = 8;
const maxEmailLength = 254;
const emailShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailRejection = 'email_empty' | 'email_invalid';
export type PasswordRejection = 'password_empty' | 'password_too_short' | 'password_weak';
export type ConfirmRejection = 'confirm_empty' | 'confirm_mismatch';

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function checkEmail(raw: string): EmailRejection | null {
  const email = normalizeEmail(raw);
  if (email.length === 0) return 'email_empty';
  return email.length <= maxEmailLength && emailShape.test(email) ? null : 'email_invalid';
}

export function checkPassword(password: string): PasswordRejection | null {
  if (password.length === 0) return 'password_empty';
  return password.length >= minPasswordLength ? null : 'password_too_short';
}

export function checkConfirmation(password: string, confirmation: string): ConfirmRejection | null {
  if (confirmation.length === 0) return 'confirm_empty';
  return confirmation === password ? null : 'confirm_mismatch';
}
