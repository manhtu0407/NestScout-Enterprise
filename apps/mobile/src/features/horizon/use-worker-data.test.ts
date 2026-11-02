import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as shared from '@/features/shared';

import { useWorkerData } from './use-worker-data';

jest.mock('@/features/shared', () => ({
  ...jest.requireActual('@/features/shared'),
  readWorkerSnapshot: jest.fn(),
  readWorkerJobCards: jest.fn(),
  acceptOffer: jest.fn(),
  declineOffer: jest.fn(),
  advanceJob: jest.fn(),
  pauseJob: jest.fn(),
  requestResume: jest.fn(),
  submitWork: jest.fn(),
  proposeScope: jest.fn(),
  reportJob: jest.fn(),
}));

const offer = { invitation_id: 'invite-1', quote_id: 'quote-1', quote_version: 3, scope: 'Sửa vòi', amount_minor: 1, currency: 'VND' as const, expires_at: '2026-11-03T00:00:00Z', basis: 'local_fixture' };
const job = (stage: shared.Job['stage']): shared.Job => ({ job_id: 'job-1', stage, version: 5, scope: 'Việc', amount_minor: 1, currency: 'VND' });

function snapshot(stage: shared.Job['stage'] = 'working') {
  return { offers: [offer], jobs: [job(stage)], changes: [], reports: [], corrections: [], pauses: [] };
}

async function mount(stage: shared.Job['stage'] = 'working', userId: string | null = 'worker-1') {
  jest.mocked(shared.readWorkerSnapshot).mockResolvedValue(snapshot(stage));
  jest.mocked(shared.readWorkerJobCards).mockResolvedValue([]);
  const view = await renderHook(() => useWorkerData(userId));
  if (userId !== null) await waitFor(() => expect(view.result.current.loaded).toBe(true));
  return view;
}

beforeEach(() => jest.clearAllMocks());

test('without a signed-in worker nothing is loaded', async () => {
  const view = await mount('working', null);
  expect(view.result.current.status).toBe('idle');
  expect(shared.readWorkerSnapshot).not.toHaveBeenCalled();
  await expect(view.result.current.perform('job-1', { type: 'resume' })).rejects.toMatchObject({ failure: 'forbidden' });
});

test('a load failure is reported until a refresh succeeds', async () => {
  jest.mocked(shared.readWorkerSnapshot).mockRejectedValueOnce(new Error('offline'));
  jest.mocked(shared.readWorkerJobCards).mockResolvedValue([]);
  const view = await renderHook(() => useWorkerData('worker-1'));
  await waitFor(() => expect(view.result.current.status).toBe('error'));
  jest.mocked(shared.readWorkerSnapshot).mockResolvedValue(snapshot());
  await act(async () => view.result.current.refresh());
  await waitFor(() => expect(view.result.current.status).toBe('ready'));
});

test('accepting passes the invitation terms the worker saw and reloads', async () => {
  jest.mocked(shared.acceptOffer).mockResolvedValue();
  const view = await mount();
  const message = await act(async () => view.result.current.perform('invite-1', { type: 'accept' }));
  expect(message).toBe('Đã nhận việc. Xem trong mục Đã nhận.');
  expect(shared.acceptOffer).toHaveBeenCalledWith('worker-1', offer, expect.any(AbortSignal));
  await waitFor(() => expect(shared.readWorkerSnapshot).toHaveBeenCalledTimes(2));
});

test('declining names the invitation and an unknown invitation is unavailable', async () => {
  jest.mocked(shared.declineOffer).mockResolvedValue();
  const view = await mount();
  await act(async () => view.result.current.perform('invite-1', { type: 'decline' }));
  expect(shared.declineOffer).toHaveBeenCalledWith('worker-1', offer, expect.any(AbortSignal));
  await act(async () => {
    await expect(view.result.current.perform('missing', { type: 'accept' })).rejects.toMatchObject({ failure: 'unavailable' });
  });
});

test.each([
  ['assigned', 'en_route'],
  ['en_route', 'arrived'],
  ['arrived', 'working'],
] as const)('advancing a %s job asks for %s', async (stage, next) => {
  jest.mocked(shared.advanceJob).mockResolvedValue();
  const view = await mount(stage);
  await act(async () => view.result.current.perform('job-1', { type: 'advance' }));
  expect(shared.advanceJob).toHaveBeenCalledWith('worker-1', job(stage), next, expect.any(AbortSignal));
});

test('a job that cannot advance is rejected without calling the server', async () => {
  const view = await mount('working');
  await act(async () => {
    await expect(view.result.current.perform('job-1', { type: 'advance' })).rejects.toMatchObject({ failure: 'rejected' });
  });
  expect(shared.advanceJob).not.toHaveBeenCalled();
});

test('pausing resuming submitting proposing and reporting use the version the worker saw', async () => {
  const view = await mount('working');
  await act(async () => view.result.current.perform('job-1', { type: 'pause', category: 'ordinary_interruption' }));
  expect(shared.pauseJob).toHaveBeenCalledWith('worker-1', job('working'), 'ordinary_interruption', expect.any(AbortSignal));
  await act(async () => view.result.current.perform('job-1', { type: 'resume' }));
  expect(shared.requestResume).toHaveBeenCalledWith('worker-1', job('working'), expect.any(AbortSignal));
  await act(async () => view.result.current.perform('job-1', { type: 'submit', evidence: 'Xong', key: 'k1' }));
  expect(shared.submitWork).toHaveBeenCalledWith('worker-1', 'job-1', 5, 'k1', 'Xong', expect.any(AbortSignal));
  await act(async () => view.result.current.perform('job-1', { type: 'propose', scope: 'S', amount: 9, rationale: 'R', key: 'k2' }));
  expect(shared.proposeScope).toHaveBeenCalledWith('worker-1', 'job-1', 5, 'k2', 'S', 9, 'R', expect.any(AbortSignal));
  await act(async () => view.result.current.perform('job-1', { type: 'report', kind: 'delay', details: 'Kẹt xe', key: 'k3' }));
  expect(shared.reportJob).toHaveBeenCalledWith('worker-1', 'job-1', 5, 'k3', 'delay', 'Kẹt xe', expect.any(AbortSignal));
});

test('a refused command still reloads so the screen shows the current state', async () => {
  jest.mocked(shared.submitWork).mockRejectedValue(new shared.WorkflowError('stale'));
  const view = await mount('working');
  await act(async () => {
    await expect(view.result.current.perform('job-1', { type: 'submit', evidence: 'Xong', key: 'k1' })).rejects.toMatchObject({ failure: 'stale' });
  });
  await waitFor(() => expect(shared.readWorkerSnapshot).toHaveBeenCalledTimes(2));
});
