import { act, renderHook, waitFor } from '@testing-library/react-native';

import { authenticatedRequest } from '@/lib/authenticated-rest';

import { readKaelAutonomy, saveKaelAutonomy, useKaelAutonomy } from './kael-autonomy';

jest.mock('@/lib/authenticated-rest', () => ({ authenticatedRequest: jest.fn() }));

const request = jest.mocked(authenticatedRequest);
const user = '11111111-1111-4111-8111-111111111111';
const reply = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;
const signal = new AbortController().signal;

beforeEach(() => request.mockReset());

test('the stored mode is read per role and anything unknown is Ask', async () => {
  request.mockResolvedValueOnce(reply([{ mode: 'auto' }])).mockResolvedValueOnce(reply([])).mockResolvedValueOnce(reply([{ mode: 'odd' }]));
  expect(await readKaelAutonomy(user, 'client', signal)).toBe('auto');
  expect(await readKaelAutonomy(user, 'worker', signal)).toBe('ask');
  expect(await readKaelAutonomy(user, 'client', signal)).toBe('ask');
  expect(request.mock.calls[0]?.[1]).toBe('kael_autonomy?select=mode&role=eq.customer');
  expect(request.mock.calls[1]?.[1]).toBe('kael_autonomy?select=mode&role=eq.worker');
});

test('an unreadable mode is reported, not hidden as Ask', async () => {
  request.mockResolvedValueOnce(reply([], false));
  await expect(readKaelAutonomy(user, 'client', signal)).rejects.toThrow('Autonomy is unavailable');
});

test('saving sends the role and mode and rejects a mismatched answer', async () => {
  request.mockResolvedValueOnce(reply('auto')).mockResolvedValueOnce(reply('ask'));
  await saveKaelAutonomy(user, 'worker', 'auto', signal);
  expect(JSON.parse(String(request.mock.calls[0]?.[2]?.body))).toEqual({ p_role: 'worker', p_mode: 'auto' });
  await expect(saveKaelAutonomy(user, 'worker', 'auto', signal)).rejects.toThrow('Autonomy was not saved');
});

test('the hook loads the stored mode, saves a choice and reverts when saving fails', async () => {
  request.mockResolvedValueOnce(reply([{ mode: 'ask' }])).mockResolvedValueOnce(reply('auto')).mockResolvedValueOnce(reply(null, false));
  const { result } = await renderHook(() => useKaelAutonomy(user, 'client'));
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.value).toBe('ask');
  await act(async () => result.current.choose('auto'));
  await waitFor(() => expect(result.current.saving).toBe(false));
  expect(result.current.value).toBe('auto');
  expect(result.current.failed).toBe(false);
  await act(async () => result.current.choose('ask'));
  await waitFor(() => expect(result.current.failed).toBe(true));
  expect(result.current.value).toBe('auto');
});

test('without a signed-in user the hook stays on Ask and makes no request', async () => {
  const { result } = await renderHook(() => useKaelAutonomy(null, 'client'));
  await act(async () => result.current.choose('auto'));
  expect(result.current.value).toBe('ask');
  expect(request).not.toHaveBeenCalled();
});
