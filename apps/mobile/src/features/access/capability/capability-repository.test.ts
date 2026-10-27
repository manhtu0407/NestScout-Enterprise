import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseCapabilityRepository } from './capability-repository';

type Response = { data: unknown; error: { code?: string; message?: string } | null; status: number };

function clientReturning(response: Response | (() => never)) {
  const from = jest.fn(() => ({
    select: jest.fn(() => ({
      maybeSingle: async () => (typeof response === 'function' ? response() : response),
    })),
  }));
  return { client: { from } as unknown as SupabaseClient, from };
}

describe('capability repository', () => {
  test('reads only the grant table under the caller session', async () => {
    const { client, from } = clientReturning({ data: { status: 'active' }, error: null, status: 200 });
    expect(await createSupabaseCapabilityRepository(client).fetchCapabilities()).toEqual({ kind: 'resolved', worker: 'active' });
    expect(from).toHaveBeenCalledWith('worker_access_grants');
  });

  test('a revoked row is reported as revoked, and no row means none', async () => {
    const revoked = clientReturning({ data: { status: 'revoked' }, error: null, status: 200 });
    expect(await createSupabaseCapabilityRepository(revoked.client).fetchCapabilities()).toEqual({ kind: 'resolved', worker: 'revoked' });
    const none = clientReturning({ data: null, error: null, status: 200 });
    expect(await createSupabaseCapabilityRepository(none.client).fetchCapabilities()).toEqual({ kind: 'resolved', worker: 'none' });
  });

  test.each([
    ['an unknown status', { data: { status: 'pending' }, error: null, status: 200 }],
    ['a malformed row', { data: { granted: true }, error: null, status: 200 }],
    ['a database error', { data: null, error: { code: '42501', message: 'denied' }, status: 403 }],
    ['a server error', { data: null, error: { code: 'PGRST000', message: 'down' }, status: 503 }],
  ])('%s is an error and never an active grant', async (_name, response) => {
    const { client } = clientReturning(response);
    expect(await createSupabaseCapabilityRepository(client).fetchCapabilities()).toEqual({ kind: 'error' });
  });

  test('an expired or rejected token is reported as an invalid session', async () => {
    const byStatus = clientReturning({ data: null, error: { message: 'JWT expired' }, status: 401 });
    expect(await createSupabaseCapabilityRepository(byStatus.client).fetchCapabilities()).toEqual({ kind: 'session_invalid' });
    const byCode = clientReturning({ data: null, error: { code: 'PGRST301' }, status: 400 });
    expect(await createSupabaseCapabilityRepository(byCode.client).fetchCapabilities()).toEqual({ kind: 'session_invalid' });
  });

  test('a thrown network failure is an error', async () => {
    const { client } = clientReturning(() => {
      throw new TypeError('Network request failed');
    });
    expect(await createSupabaseCapabilityRepository(client).fetchCapabilities()).toEqual({ kind: 'error' });
  });
});
