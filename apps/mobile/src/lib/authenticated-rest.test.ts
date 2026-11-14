import { AuthSessionError, authenticatedFunctionRequest, authenticatedStorageRequest, type FunctionFetch } from './authenticated-rest';

const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();

jest.mock('./supabase-client', () => ({ getSupabaseClient: () => ({ auth: { getSession: mockGetSession, refreshSession: mockRefreshSession } }) }));
jest.mock('./config', () => ({
  loadConfig: () => ({ target: 'local', supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'sb_publishable_example' }),
}));

const user = 'user-1';
const sessionOf = (token: string, id = user) => ({ access_token: token, user: { id } });

beforeEach(() => {
  mockGetSession.mockReset();
  mockRefreshSession.mockReset();
});

test('retries the same request once with a refreshed session after a 401', async () => {
  mockGetSession.mockResolvedValue({ data: { session: sessionOf('expired') }, error: null });
  mockRefreshSession.mockResolvedValue({ data: { session: sessionOf('fresh') }, error: null });
  const seen: string[] = [];
  const fetcher: FunctionFetch = async (_url, init) => {
    seen.push(`${init.headers.Authorization}|${init.body}`);
    return new Response(null, { status: seen.length === 1 ? 401 : 200 });
  };
  const response = await authenticatedFunctionRequest(user, 'kael', { request_id: 'r1' }, new AbortController().signal, fetcher);
  expect(response.status).toBe(200);
  expect(seen).toEqual(['Bearer expired|{"request_id":"r1"}', 'Bearer fresh|{"request_id":"r1"}']);
});

test('does not loop: a second 401 is returned to the caller', async () => {
  mockGetSession.mockResolvedValue({ data: { session: sessionOf('expired') }, error: null });
  mockRefreshSession.mockResolvedValue({ data: { session: sessionOf('fresh') }, error: null });
  const fetcher = jest.fn<ReturnType<FunctionFetch>, Parameters<FunctionFetch>>(async () => new Response(null, { status: 401 }));
  const response = await authenticatedFunctionRequest(user, 'kael', {}, new AbortController().signal, fetcher);
  expect(response.status).toBe(401);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(mockRefreshSession).toHaveBeenCalledTimes(1);
});

test('a failed refresh or a different user surfaces as an auth session error', async () => {
  mockGetSession.mockResolvedValue({ data: { session: sessionOf('expired') }, error: null });
  const fetcher: FunctionFetch = async () => new Response(null, { status: 401 });
  mockRefreshSession.mockResolvedValueOnce({ data: { session: null }, error: new Error('refresh_token_not_found') });
  await expect(authenticatedFunctionRequest(user, 'kael', {}, new AbortController().signal, fetcher)).rejects.toBeInstanceOf(AuthSessionError);
  mockRefreshSession.mockResolvedValueOnce({ data: { session: sessionOf('other', 'user-2') }, error: null });
  await expect(authenticatedFunctionRequest(user, 'kael', {}, new AbortController().signal, fetcher)).rejects.toBeInstanceOf(AuthSessionError);
});

test('a non-401 response is returned without refreshing', async () => {
  mockGetSession.mockResolvedValue({ data: { session: sessionOf('ok') }, error: null });
  const fetcher: FunctionFetch = async () => new Response(null, { status: 503 });
  const response = await authenticatedFunctionRequest(user, 'kael', {}, new AbortController().signal, fetcher);
  expect(response.status).toBe(503);
  expect(mockRefreshSession).not.toHaveBeenCalled();
});

test('Storage removal uses the bucket endpoint and names only the requested object', async () => {
  mockGetSession.mockResolvedValue({ data: { session: sessionOf('ok') }, error: null });
  const previousFetch = global.fetch;
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValue(new Response(null, { status: 200 }));
  global.fetch = fetcher;
  try {
    const response = await authenticatedStorageRequest(user, 'worker-payout-qr/user-1/old-qr.jpg', { method: 'DELETE' });
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:54321/storage/v1/object/worker-payout-qr', expect.objectContaining({
      method: 'DELETE',
      body: JSON.stringify({ prefixes: ['user-1/old-qr.jpg'] }),
      headers: expect.objectContaining({ apikey: 'sb_publishable_example', Authorization: 'Bearer ok', 'Content-Type': 'application/json' }),
    }));
  } finally {
    global.fetch = previousFetch;
  }
});
