import { readRequests, submitRequest } from './service-request-repository';

const mockGetSession = jest.fn();
jest.mock('@/lib/supabase-client', () => ({ getSupabaseClient: () => ({ auth: { getSession: mockGetSession } }) }));
jest.mock('@/lib/config', () => ({
  loadConfig: () => ({ supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'public-key' }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'customer-a' }, access_token: 'token-a' } }, error: null });
  global.fetch = jest.fn();
});

test('rejects a changed session before issuing a request', async () => {
  await expect(submitRequest('customer-b', 'key', 'Repair', new AbortController().signal)).rejects.toThrow('Session changed or unavailable');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('a cancelled session lookup never starts a mutation', async () => {
  let finish: (value: unknown) => void = () => undefined;
  mockGetSession.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const controller = new AbortController();
  const result = submitRequest('customer-a', 'key', 'Repair', controller.signal);
  controller.abort();
  finish({ data: { session: { user: { id: 'customer-a' }, access_token: 'token-a' } }, error: null });
  await expect(result).rejects.toThrow('Session changed or unavailable');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('a submission carries the captured account token and immutable key', async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => 'request-id' } as Response);
  await expect(submitRequest('customer-a', 'operation-key', 'Repair', new AbortController().signal)).resolves.toBe('request-id');
  expect(global.fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:54321/rest/v1/rpc/submit_service_request',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token-a' }),
      body: JSON.stringify({ p_submission_key: 'operation-key', p_description: 'Repair' }),
    }),
  );
});

test('rejects malformed projections instead of displaying them', async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => [{ id: 4 }] } as Response);
  await expect(readRequests('customer-a', new AbortController().signal)).rejects.toThrow('Invalid request response');
});
