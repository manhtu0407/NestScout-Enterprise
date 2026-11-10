import { act, renderHook, waitFor } from '@testing-library/react-native';

import { WorkflowError } from '@/features/shared';

import { useServiceIntake, type IntakeDeps } from './use-service-intake';

function deps(overrides: Partial<IntakeDeps> = {}): IntakeDeps {
  return {
    submit: jest.fn().mockResolvedValue('request-1'),
    load: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    newKey: jest.fn().mockReturnValue('00000000-0000-4000-8000-000000000001'),
    ...overrides,
  };
}

async function filled(d: IntakeDeps) {
  const hook = await renderHook(() => useServiceIntake('user-1', 'plumbing', d));
  await waitFor(() => expect(hook.result.current.phase).toBe('edit'));
  await act(async () => {
    hook.result.current.setField('description', 'Vòi bồn rửa bị rò nước');
    hook.result.current.setField('location', '5 Lê Lợi, Quận 1');
  });
  return hook;
}

test('incomplete drafts never reach the server and say what to fix', async () => {
  const d = deps();
  const { result } = await renderHook(() => useServiceIntake('user-1', 'plumbing', d));
  await waitFor(() => expect(result.current.phase).toBe('edit'));
  await act(async () => { result.current.review(); });
  expect(result.current.phase).toBe('edit');
  expect(result.current.errors.description).toBeDefined();
  expect(result.current.message).toMatch(/bổ sung/);
  expect(d.submit).not.toHaveBeenCalled();
});

test('review then explicit confirm saves the key first, submits once, and clears the pending copy', async () => {
  const d = deps();
  const { result } = await filled(d);
  await act(async () => { result.current.review(); });
  expect(result.current.phase).toBe('review');
  expect(d.submit).not.toHaveBeenCalled();
  await act(async () => { await Promise.all([result.current.confirm(), result.current.confirm()]); });
  expect(d.save).toHaveBeenCalledTimes(1);
  expect(d.submit).toHaveBeenCalledTimes(1);
  expect(jest.mocked(d.submit).mock.calls[0]![1]).toBe('00000000-0000-4000-8000-000000000001');
  expect(jest.mocked(d.submit).mock.calls[0]![2]).toContain('Sửa nước: Vòi bồn rửa bị rò nước');
  expect(d.clear).toHaveBeenCalled();
  expect(result.current.phase).toBe('received');
  expect(result.current.requestId).toBe('request-1');
});

test('an unknown outcome keeps the pending request and retries with the same key', async () => {
  const submit = jest.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce('request-1');
  const d = deps({ submit });
  const { result } = await filled(d);
  await act(async () => { result.current.review(); });
  await act(async () => { await result.current.confirm(); });
  expect(result.current.phase).toBe('pending');
  expect(d.clear).not.toHaveBeenCalled();
  await act(async () => { await result.current.retryPending(); });
  expect(submit).toHaveBeenCalledTimes(2);
  expect(submit.mock.calls[1]![1]).toBe(submit.mock.calls[0]![1]);
  expect(submit.mock.calls[1]![2]).toBe(submit.mock.calls[0]![2]);
  expect(d.newKey).toHaveBeenCalledTimes(1);
  expect(result.current.phase).toBe('received');
});

test('a definitive rejection returns to editing and drops the saved copy', async () => {
  const d = deps({ submit: jest.fn().mockRejectedValue(new WorkflowError('invalid')) });
  const { result } = await filled(d);
  await act(async () => { result.current.review(); });
  await act(async () => { await result.current.confirm(); });
  expect(result.current.phase).toBe('edit');
  expect(d.clear).toHaveBeenCalled();
  expect(result.current.message).toMatch(/kiểm tra/);
});

test('a failed local save blocks submission instead of risking a duplicate', async () => {
  const d = deps({ save: jest.fn().mockRejectedValue(new Error('disk')) });
  const { result } = await filled(d);
  await act(async () => { result.current.review(); });
  await act(async () => { await result.current.confirm(); });
  expect(d.submit).not.toHaveBeenCalled();
  expect(result.current.message).toMatch(/chưa được gửi/);
});

test('a saved pending request from an earlier launch is offered for safe retry', async () => {
  const pending = { key: '00000000-0000-4000-8000-000000000009', description: 'Sửa nước: rò', location: 'Quận 1' };
  const d = deps({ load: jest.fn().mockResolvedValue(pending) });
  const { result } = await renderHook(() => useServiceIntake('user-1', 'plumbing', d));
  await waitFor(() => expect(result.current.phase).toBe('pending'));
  await act(async () => { await result.current.retryPending(); });
  expect(jest.mocked(d.submit).mock.calls[0]!.slice(1, 3)).toEqual([pending.key, pending.description]);
  expect(d.save).not.toHaveBeenCalled();
});
