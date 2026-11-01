export type SignInRole = 'client' | 'worker';
export type SignInStep = 'phone' | 'code';
export type CompanionState = 'idle' | 'typing' | 'busy' | 'success';

export const signInRoles: readonly SignInRole[] = ['client', 'worker'];

export function parseSignInRole(value: string | string[] | undefined): SignInRole {
  return value === 'worker' ? 'worker' : 'client';
}
