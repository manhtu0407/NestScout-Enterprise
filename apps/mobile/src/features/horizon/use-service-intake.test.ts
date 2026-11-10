import { act, renderHook } from '@testing-library/react-native';

import { WorkflowError } from '@/features/shared';
import { AuthSessionError } from '@/lib/authenticated-rest';

import { serviceCategoryFor, type ServiceCategory } from './service-catalog';
import { clearIntakeDraft, readIntakeDraft, writeIntakeDraft } from './service-intake-drafts';
import { intakeMessages, useServiceIntake, type IntakeDeps } from './use-service-intake';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'unused' }));
jest.mock('@/lib/supabase-client', () => ({ getSupabaseClient: () => ({ auth: {} }) }));
jest.mock('@/lib/config', () => ({ loadConfig: () => ({ supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'k' }), ConfigError: class ConfigError extends Error {} }));

const category = serviceCategoryFor('plumbing') as ServiceCategory;
const requestId = '99999999-9999-4999-8999-999999999999';
const keyOne = '11111111-1111-4111-8111-111111111111';
const keyTwo = '22222222-2222-4222-8222-222222222222';

function depsWith(overrides: Partial<IntakeDeps> = {}, stored: { key: string; description: string; location: string } | null = null) {
  let saved = stored;
  const keys = [keyOne, keyTwo];
  const deps: jest.Mocked<IntakeDeps> = {
    submit: jest.fn(async () => requestId),
    load: jest.fn(async () => saved),
    save: jest.fn(async (_user: string, item) => { saved = item; }),
    clear: jest.fn(async () => { saved = null; }),
    newKey: jest.fn(() => keys.shift() as string),
    ...overrides,
  } as jest.Mocked<IntakeDeps>;
  return deps;
}

const fill = async (result: { current: ReturnType<typeof useServiceIntake> }) => {
  await act(async () => {
    result.current.setAnswer('description', 'Vòi bồn rửa bị rò');
    result.current.setAnswer('location', '12 Nguyễn Huệ, Quận 1');
    result.current.setAnswer('area', 'Bếp');
  });
};

async function mount(deps: IntakeDeps) {
  const hook = await renderHook(() => useServiceIntake('user-a', category, deps));
  await act(async () => { await Promise.resolve(); });
  return hook;
}

beforeEach(() => {
  clearIntakeDraft('user-a', category.id);
});

test('manual intake: fill, review, confirm submits once through the existing submission function', async () => {
  const deps = depsWith();
  const { result } = await mount(deps);
  expect(result.current.storage).toBe('ready');
  await fill(result);
  await act(async () => { result.current.review(); });
  expect(result.current.phase).toBe('review');
  expect(deps.submit).not.toHaveBeenCalled();
  await act(async () => { await result.current.submit(); });
  expect(deps.submit).toHaveBeenCalledTimes(1);
  expect(deps.submit).toHaveBeenCalledWith('user-a', keyOne, 'Sửa nước — Vòi bồn rửa bị rò\nKhu vực: Bếp', expect.any(AbortSignal), '12 Nguyễn Huệ, Quận 1');
  expect(result.current.phase).toBe('submitted');
  expect(result.current.requestId).toBe(requestId);
  expect(deps.clear).toHaveBeenCalledWith('user-a');
});

test('the key is saved before the request leaves the device', async () => {
  const order: string[] = [];
  const deps = depsWith({
    save: jest.fn(async () => { order.push('save'); }),
    submit: jest.fn(async () => { order.push('submit'); return requestId; }),
  });
  const { result } = await mount(deps);
  await fill(result);
  await act(async () => { result.current.review(); });
  await act(async () => { await result.current.submit(); });
  expect(order).toEqual(['save', 'submit']);
});

test('missing essentials block review and name what to fix; nothing is sent', async () => {
  const deps = depsWith();
  const { result } = await mount(deps);
  await act(async () => { result.current.setAnswer('description', 'ab'); result.current.review(); });
  expect(result.current.phase).toBe('form');
  expect(Object.keys(result.current.errors).sort()).toEqual(['description', 'location']);
  expect(result.current.message).toBe(intakeMessages.missing);
  await act(async () => { await result.current.submit(); });
  expect(deps.submit).not.toHaveBeenCalled();
});

test('editing a field clears only its own error', async () => {
  const { result } = await mount(depsWith());
  await act(async () => { result.current.review(); });
  expect(Object.keys(result.current.errors).sort()).toEqual(['description', 'location']);
  await act(async () => { result.current.setAnswer('location', 'Quận 3'); });
  expect(Object.keys(result.current.errors)).toEqual(['description']);
});

test('a double tap sends one request', async () => {
  let release: (id: string) => void = () => undefined;
  const gate = new Promise<string>(resolve => { release = resolve; });
  const deps = depsWith({ submit: jest.fn(() => gate) });
  const { result } = await mount(deps);
  await fill(result);
  await act(async () => { result.current.review(); });
  await act(async () => { void result.current.submit(); void result.current.submit(); });
  expect(result.current.phase).toBe('submitting');
  expect(deps.submit).toHaveBeenCalledTimes(1);
  await act(async () => { release(requestId); await gate; });
  expect(result.current.phase).toBe('submitted');
});

test('network uncertainty keeps the same key and retries with the original payload without a duplicate', async () => {
  const deps = depsWith({ submit: jest.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(requestId) });
  const { result } = await mount(deps);
  await fill(result);
  await act(async () => { result.current.review(); });
  await act(async () => { await result.current.submit(); });
  expect(result.current.phase).toBe('uncertain');
  expect(result.current.message).toBe(intakeMessages.uncertain);
  expect(deps.clear).not.toHaveBeenCalled();
  await act(async () => { result.current.setAnswer('description', 'Nội dung khác hẳn'); });
  expect(result.current.answers.description).toBe('Vòi bồn rửa bị rò');
  await act(async () => { await result.current.submit(); });
  expect(deps.submit).toHaveBeenCalledTimes(2);
  expect(deps.submit.mock.calls[1]?.slice(1, 3)).toEqual(deps.submit.mock.calls[0]?.slice(1, 3));
  expect(deps.newKey).toHaveBeenCalledTimes(1);
  expect(result.current.phase).toBe('submitted');
});

test('after a restart the unconfirmed request is reconciled with its stored key instead of creating a new one', async () => {
  const stored = { key: keyTwo, description: 'Sửa nước — Cũ', location: 'Quận 5' };
  const deps = depsWith({}, stored);
  const { result } = await mount(deps);
  expect(result.current.phase).toBe('uncertain');
  expect(result.current.message).toBe(intakeMessages.pending);
  await act(async () => { await result.current.submit(); });
  expect(deps.submit).toHaveBeenCalledWith('user-a', keyTwo, 'Sửa nước — Cũ', expect.any(AbortSignal), 'Quận 5');
  expect(deps.newKey).not.toHaveBeenCalled();
  expect(result.current.phase).toBe('submitted');
});

test('a definitive server refusal says the request was not created and frees the form', async () => {
  const deps = depsWith({ submit: jest.fn().mockRejectedValue(new WorkflowError('invalid')) });
  const { result } = await mount(deps);
  await fill(result);
  await act(async () => { result.current.review(); });
  await act(async () => { await result.current.submit(); });
  expect(result.current.phase).toBe('review');
  expect(result.current.message).toBe(intakeMessages.rejected);
  expect(deps.clear).toHaveBeenCalled();
  expect(result.current.pending).toBeNull();
});

test('a forbidden account is told so', async () => {
  const deps = depsWith({ submit: jest.fn().mockRejectedValue(new WorkflowError('forbidden')) });
  const { result } = await mount(deps);
  await fill(result);
  await act(async () => { result.current.review(); });
  await act(async () => { await result.current.submit(); });
  expect(result.current.message).toBe(intakeMessages.forbidden);
});

test('a changed session is reported as not sent and keeps the draft for a later reconcile', async () => {
  const deps = depsWith({ submit: jest.fn().mockRejectedValue(new AuthSessionError()) });
  const { result } = await mount(deps);
  await fill(result);
  await act(async () => { result.current.review(); });
  await act(async () => { await result.current.submit(); });
  expect(result.current.message).toBe(intakeMessages.session);
  expect(deps.clear).not.toHaveBeenCalled();
});

test('if the key cannot be saved nothing is sent', async () => {
  const deps = depsWith({ save: jest.fn().mockRejectedValue(new Error('disk')) });
  const { result } = await mount(deps);
  await fill(result);
  await act(async () => { result.current.review(); });
  await act(async () => { await result.current.submit(); });
  expect(deps.submit).not.toHaveBeenCalled();
  expect(result.current.phase).toBe('review');
  expect(result.current.message).toBe(intakeMessages.storageWrite);
});

test('an unreadable saved draft blocks a new request until it is retried or discarded', async () => {
  const deps = depsWith({ load: jest.fn().mockRejectedValueOnce(new Error('corrupt')).mockResolvedValue(null) });
  const { result } = await mount(deps);
  expect(result.current.storage).toBe('unreadable');
  await act(async () => { result.current.setAnswer('description', 'Vòi bồn rửa bị rò'); result.current.review(); });
  expect(result.current.phase).toBe('form');
  await act(async () => { result.current.retryStorage(); await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  expect(result.current.storage).toBe('ready');
});

test('start another request resets the form after a confirmed submission', async () => {
  const { result } = await mount(depsWith());
  await fill(result);
  await act(async () => { result.current.review(); });
  await act(async () => { await result.current.submit(); });
  await act(async () => { result.current.startAnother(); });
  expect(result.current.phase).toBe('form');
  expect(result.current.answers).toEqual({});
  expect(result.current.requestId).toBeNull();
});

test('reconciling a pending request of another category keeps this category draft', async () => {
  const foreign = { key: keyOne, description: 'Sửa điện — Mất điện cục bộ', location: '5 Lê Lợi, Quận 1' };
  const { result } = await mount(depsWith({}, foreign));
  expect(result.current.phase).toBe('uncertain');
  await act(async () => { await result.current.submit(); });
  expect(result.current.phase).toBe('submitted');
  expect(readIntakeDraft('user-a', category.id)).toEqual({});
  await act(async () => { result.current.startAnother(); });
  expect(result.current.phase).toBe('form');
});

test('a draft typed before a foreign pending request resolves survives it and returns to the form', async () => {
  writeIntakeDraft('user-a', category.id, { description: 'Vòi bồn rửa bị rò', location: '12 Nguyễn Huệ, Quận 1', area: 'Bếp' });
  const foreign = { key: keyOne, description: 'Sửa điện — Mất điện cục bộ', location: '5 Lê Lợi, Quận 1' };
  const { result } = await mount(depsWith({}, foreign));
  await act(async () => { await result.current.submit(); });
  expect(result.current.phase).toBe('submitted');
  expect(readIntakeDraft('user-a', category.id).description).toBe('Vòi bồn rửa bị rò');
  await act(async () => { result.current.startAnother(); });
  expect(result.current.answers.description).toBe('Vòi bồn rửa bị rò');
});
