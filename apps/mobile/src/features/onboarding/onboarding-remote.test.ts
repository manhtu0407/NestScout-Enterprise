import { createSupabaseOnboardingRemote, OnboardingUnavailableError } from './onboarding-remote';

type SupabaseClient = Parameters<typeof createSupabaseOnboardingRemote>[0];

const at = '2026-11-14T08:00:00.000Z';
const savedUser = (id: string) => ({ id, user_metadata: { onboarding: { v: 1, outcome: 'completed', at } } });
const bareUser = (id: string) => ({ id, user_metadata: {} });

type AuthResult = { data: Record<string, unknown>; error: Error | null };

function fakeClient(overrides: { session?: AuthResult; user?: AuthResult; update?: AuthResult } = {}) {
  const auth = {
    getSession: jest.fn(async () => overrides.session ?? { data: { session: { user: bareUser('user-a') } }, error: null }),
    getUser: jest.fn(async () => overrides.user ?? { data: { user: bareUser('user-a') }, error: null }),
    updateUser: jest.fn(async () => overrides.update ?? { data: { user: bareUser('user-a') }, error: null }),
  };
  return { auth, client: { auth } as unknown as SupabaseClient };
}

type Reply = { ok: boolean; status?: number; body: unknown };

function fakeRequest(replies: Record<string, Reply>) {
  return jest.fn(async (_userId: string, path: string) => {
    const reply = replies[path] ?? { ok: true, body: [] };
    return { ok: reply.ok, status: reply.status ?? 200, json: async () => reply.body } as Response;
  });
}

const conversations = 'kael_conversations?select=id&limit=1';
const requests = 'service_requests?select=id&limit=1';
const signal = new AbortController().signal;

describe('onboarding remote record', () => {
  test('reads the cached mark from the local session', async () => {
    const { client } = fakeClient({ session: { data: { session: { user: savedUser('user-a') } }, error: null } });
    expect(await createSupabaseOnboardingRemote(client, fakeRequest({})).cachedMark('user-a')).toEqual({ outcome: 'completed', at });
  });

  test('reads no cached mark from a session without one', async () => {
    const { client } = fakeClient();
    expect(await createSupabaseOnboardingRemote(client, fakeRequest({})).cachedMark('user-a')).toBeNull();
  });

  test('refuses a cached read for a different signed-in account', async () => {
    const { client } = fakeClient({ session: { data: { session: { user: savedUser('user-b') } }, error: null } });
    await expect(createSupabaseOnboardingRemote(client, fakeRequest({})).cachedMark('user-a')).rejects.toBeInstanceOf(OnboardingUnavailableError);
  });

  test('refuses a cached read without a session', async () => {
    const { client } = fakeClient({ session: { data: { session: null }, error: null } });
    await expect(createSupabaseOnboardingRemote(client, fakeRequest({})).cachedMark('user-a')).rejects.toBeInstanceOf(OnboardingUnavailableError);
  });

  test('reads the fresh mark from the server user', async () => {
    const { client, auth } = fakeClient({ user: { data: { user: savedUser('user-a') }, error: null } });
    expect(await createSupabaseOnboardingRemote(client, fakeRequest({})).freshMark('user-a')).toEqual({ outcome: 'completed', at });
    expect(auth.getUser).toHaveBeenCalledTimes(1);
  });

  test('refuses a fresh read that fails or answers for another account', async () => {
    const failed = fakeClient({ user: { data: {}, error: new Error('network') } });
    await expect(createSupabaseOnboardingRemote(failed.client, fakeRequest({})).freshMark('user-a')).rejects.toBeInstanceOf(OnboardingUnavailableError);
    const other = fakeClient({ user: { data: { user: savedUser('user-b') }, error: null } });
    await expect(createSupabaseOnboardingRemote(other.client, fakeRequest({})).freshMark('user-a')).rejects.toBeInstanceOf(OnboardingUnavailableError);
  });

  test('writes the mark as versioned user metadata', async () => {
    const { client, auth } = fakeClient();
    await createSupabaseOnboardingRemote(client, fakeRequest({})).writeMark('user-a', { outcome: 'skipped', at });
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { onboarding: { v: 1, outcome: 'skipped', at } } });
  });

  test('reports a write that fails or lands on another account', async () => {
    const failed = fakeClient({ update: { data: {}, error: new Error('network') } });
    await expect(createSupabaseOnboardingRemote(failed.client, fakeRequest({})).writeMark('user-a', { outcome: 'skipped', at })).rejects.toBeInstanceOf(OnboardingUnavailableError);
    const other = fakeClient({ update: { data: { user: bareUser('user-b') }, error: null } });
    await expect(createSupabaseOnboardingRemote(other.client, fakeRequest({})).writeMark('user-a', { outcome: 'skipped', at })).rejects.toBeInstanceOf(OnboardingUnavailableError);
  });
});

describe('onboarding remote history', () => {
  test('finds no history for an account with no conversations and no requests', async () => {
    const { client } = fakeClient();
    const request = fakeRequest({});
    expect(await createSupabaseOnboardingRemote(client, request).hasHistory('user-a', signal)).toBe(false);
    expect(request).toHaveBeenCalledWith('user-a', conversations, { method: 'GET', signal });
    expect(request).toHaveBeenCalledWith('user-a', requests, { method: 'GET', signal });
  });

  test('finds history from a conversation alone', async () => {
    const { client } = fakeClient();
    const request = fakeRequest({ [conversations]: { ok: true, body: [{ id: 'c1' }] } });
    expect(await createSupabaseOnboardingRemote(client, request).hasHistory('user-a', signal)).toBe(true);
  });

  test('finds history from a service request alone', async () => {
    const { client } = fakeClient();
    const request = fakeRequest({ [requests]: { ok: true, body: [{ id: 'r1' }] } });
    expect(await createSupabaseOnboardingRemote(client, request).hasHistory('user-a', signal)).toBe(true);
  });

  test('refuses to guess when a lookup answers with an error status', async () => {
    const { client } = fakeClient();
    const request = fakeRequest({ [requests]: { ok: false, status: 503, body: {} } });
    await expect(createSupabaseOnboardingRemote(client, request).hasHistory('user-a', signal)).rejects.toBeInstanceOf(OnboardingUnavailableError);
  });

  test('refuses to guess when a lookup answers with something other than a list', async () => {
    const { client } = fakeClient();
    const request = fakeRequest({ [conversations]: { ok: true, body: { message: 'no' } } });
    await expect(createSupabaseOnboardingRemote(client, request).hasHistory('user-a', signal)).rejects.toBeInstanceOf(OnboardingUnavailableError);
  });
});
