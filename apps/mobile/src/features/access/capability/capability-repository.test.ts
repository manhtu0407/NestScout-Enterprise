import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseCapabilityRepository, type CapabilityResult } from './capability-repository';

type Response = { data: unknown; error: { code?: string; message?: string } | null; status: number };

const userId = 'user-a';

function clientReturning(response: Response | (() => never)) {
  const abortSignal = jest.fn();
  const select = jest.fn();
  const from = jest.fn(() => ({ select }));
  const builder = { abortSignal, maybeSingle: async () => (typeof response === 'function' ? response() : response) };
  select.mockReturnValue(builder);
  abortSignal.mockReturnValue(builder);
  return { client: { from } as unknown as SupabaseClient, from, select, abortSignal };
}

async function fetchWith(response: Response | (() => never)): Promise<CapabilityResult> {
  const { client } = clientReturning(response);
  return createSupabaseCapabilityRepository(client).fetchCapabilities({ userId, signal: new AbortController().signal });
}

const row = (status: unknown, owner: unknown = userId): Response => ({ data: { user_id: owner, status }, error: null, status: 200 });

describe('capability repository', () => {
  test('reads only the grant table under the caller session and forwards the abort signal', async () => {
    const { client, from, select, abortSignal } = clientReturning(row('active'));
    const controller = new AbortController();
    expect(await createSupabaseCapabilityRepository(client).fetchCapabilities({ userId, signal: controller.signal })).toEqual({
      kind: 'resolved',
      worker: 'active',
    });
    expect(from).toHaveBeenCalledWith('worker_access_grants');
    expect(select).toHaveBeenCalledWith('user_id, status');
    expect(abortSignal).toHaveBeenCalledWith(controller.signal);
  });

  test('a revoked row is reported as revoked, and no row means none', async () => {
    expect(await fetchWith(row('revoked'))).toEqual({ kind: 'resolved', worker: 'revoked' });
    expect(await fetchWith({ data: null, error: null, status: 200 })).toEqual({ kind: 'resolved', worker: 'none' });
  });

  test.each([
    ['an unknown status', row('pending'), 'malformed'],
    ['a missing status', { data: { user_id: userId }, error: null, status: 200 }, 'malformed'],
    ['a row that belongs to another account', row('active', 'user-b'), 'malformed'],
    ['a row without an owner', { data: { status: 'active' }, error: null, status: 200 }, 'malformed'],
    ['more than one row', { data: null, error: { code: 'PGRST116' }, status: 406 }, 'malformed'],
    ['permission denied for an authenticated role', { data: null, error: { code: '42501' }, status: 403 }, 'denied'],
    ['a forbidden response without a code', { data: null, error: { message: 'forbidden' }, status: 403 }, 'denied'],
    ['a missing table (42P01)', { data: null, error: { code: '42P01' }, status: 404 }, 'schema'],
    ['a missing table in the schema cache', { data: null, error: { code: 'PGRST205' }, status: 404 }, 'schema'],
    ['a server error', { data: null, error: { code: 'PGRST000', message: 'down' }, status: 503 }, 'unavailable'],
    ['a PostgREST configuration fault', { data: null, error: { code: 'PGRST300' }, status: 500 }, 'unavailable'],
    ['a transport failure reported by the client', { data: null, error: { message: 'fetch failed' }, status: 0 }, 'unavailable'],
  ] as const)('%s never permits Worker', async (_name, response, reason) => {
    expect(await fetchWith(response)).toEqual({ kind: 'error', reason });
  });

  test.each([
    ['an expired token', { data: null, error: { code: 'PGRST301', message: 'JWT expired' }, status: 401 }],
    ['a rejected token claim set', { data: null, error: { code: 'PGRST303' }, status: 401 }],
    ['a request without credentials', { data: null, error: { code: 'PGRST302' }, status: 401 }],
    ['an anonymous caller refused by privileges', { data: null, error: { code: '42501' }, status: 401 }],
    ['a bare 401', { data: null, error: { message: 'unauthorized' }, status: 401 }],
  ])('%s asks for identity re-verification instead of ending the session', async (_name, response) => {
    expect(await fetchWith(response)).toEqual({ kind: 'unauthenticated' });
  });

  test('a thrown network failure is an unavailable lookup', async () => {
    expect(
      await fetchWith(() => {
        throw new TypeError('Network request failed');
      }),
    ).toEqual({ kind: 'error', reason: 'unavailable' });
  });
});
