import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as shared from '@/features/shared';

import { useWorkerData } from './use-worker-data';

jest.mock('@/features/shared', () => ({
  ...jest.requireActual('@/features/shared'),
  readWorkerSnapshot: jest.fn(),
  readWorkerJobCards: jest.fn(),
  readWorkerProfile: jest.fn(),
  readWorkerEarnings: jest.fn(),
  readWorkerPayout: jest.fn(),
  readNotifications: jest.fn(),
  markNotificationsRead: jest.fn(),
  saveWorkerProfile: jest.fn(),
  saveWorkerCoverage: jest.fn(),
  setWorkerAccepting: jest.fn(),
  addWorkerCertificate: jest.fn(),
  removeWorkerCertificate: jest.fn(),
  acceptOffer: jest.fn(),
  declineOffer: jest.fn(),
  advanceJob: jest.fn(),
  pauseJob: jest.fn(),
  requestResume: jest.fn(),
  submitWork: jest.fn(),
  proposeScope: jest.fn(),
  reportJob: jest.fn(),
  releaseJob: jest.fn(),
}));

const offer = { invitation_id: 'invite-1', quote_id: 'quote-1', quote_version: 3, scope: 'Sửa vòi', amount_minor: 1, currency: 'VND' as const, expires_at: '2026-11-03T00:00:00Z', basis: 'local_fixture' };
const job = (stage: shared.Job['stage']): shared.Job => ({ job_id: 'job-1', stage, version: 5, scope: 'Việc', amount_minor: 1, currency: 'VND' });

function snapshot(stage: shared.Job['stage'] = 'working') {
  return { offers: [offer], jobs: [job(stage)], changes: [], reports: [], corrections: [], pauses: [] };
}

async function mount(stage: shared.Job['stage'] = 'working', userId: string | null = 'worker-1', earnings: shared.WorkerEarningRecord[] = []) {
  jest.mocked(shared.readWorkerSnapshot).mockResolvedValue(snapshot(stage));
  jest.mocked(shared.readWorkerJobCards).mockResolvedValue([]);
  jest.mocked(shared.readWorkerProfile).mockResolvedValue(null);
  jest.mocked(shared.readWorkerEarnings).mockResolvedValue(earnings);
  jest.mocked(shared.readWorkerPayout).mockResolvedValue(null);
  jest.mocked(shared.readNotifications).mockResolvedValue([]);
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
  jest.mocked(shared.readWorkerProfile).mockResolvedValue(null);
  jest.mocked(shared.readWorkerEarnings).mockResolvedValue([]);
  jest.mocked(shared.readNotifications).mockResolvedValue([]);
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

test('the profile is loaded with the jobs and a worker without one reads null', async () => {
  const view = await mount();
  expect(view.result.current.data.profile).toBeNull();
  expect(shared.readWorkerProfile).toHaveBeenCalledWith('worker-1', expect.any(AbortSignal));
});

test('profile commands call the matching repository function and reload', async () => {
  jest.mocked(shared.saveWorkerProfile).mockResolvedValue('p1');
  jest.mocked(shared.saveWorkerCoverage).mockResolvedValue();
  jest.mocked(shared.setWorkerAccepting).mockResolvedValue();
  jest.mocked(shared.addWorkerCertificate).mockResolvedValue('c1');
  jest.mocked(shared.removeWorkerCertificate).mockResolvedValue();
  const view = await mount();
  const draft = { name: 'Minh Anh', trade: 'Thợ điện', area: 'Quận 7', experienceYears: 6, about: 'Giới thiệu', skills: ['Thay vòi'] };
  expect(await act(async () => view.result.current.performProfile({ type: 'save', draft }))).toBe('Đã lưu hồ sơ nghề.');
  expect(shared.saveWorkerProfile).toHaveBeenCalledWith('worker-1', { display_name: 'Minh Anh', trade: 'Thợ điện', area: 'Quận 7', experience_years: 6, about: 'Giới thiệu', skills: ['Thay vòi'] }, expect.any(AbortSignal));
  await act(async () => view.result.current.performProfile({ type: 'coverage', radiusKm: 10, serviceIds: ['water'] }));
  expect(shared.saveWorkerCoverage).toHaveBeenCalledWith('worker-1', 10, ['water'], expect.any(AbortSignal));
  expect(await act(async () => view.result.current.performProfile({ type: 'accepting', accepting: false }))).toBe('Đã tắt nhận việc.');
  expect(shared.setWorkerAccepting).toHaveBeenCalledWith('worker-1', false, expect.any(AbortSignal));
  await act(async () => view.result.current.performProfile({ type: 'addCertificate', title: 'An toàn điện' }));
  expect(shared.addWorkerCertificate).toHaveBeenCalledWith('worker-1', 'An toàn điện', expect.any(AbortSignal));
  await act(async () => view.result.current.performProfile({ type: 'removeCertificate', id: 'c1' }));
  expect(shared.removeWorkerCertificate).toHaveBeenCalledWith('worker-1', 'c1', expect.any(AbortSignal));
  await waitFor(() => expect(shared.readWorkerProfile).toHaveBeenCalledTimes(6));
});

test('a refused profile command still reloads and without a worker nothing is sent', async () => {
  jest.mocked(shared.saveWorkerCoverage).mockRejectedValue(new shared.WorkflowError('invalid'));
  const view = await mount();
  await act(async () => {
    await expect(view.result.current.performProfile({ type: 'coverage', radiusKm: 5, serviceIds: [] })).rejects.toMatchObject({ failure: 'invalid' });
  });
  await waitFor(() => expect(shared.readWorkerProfile).toHaveBeenCalledTimes(2));
  const idle = await mount('working', null);
  await expect(idle.result.current.performProfile({ type: 'accepting', accepting: true })).rejects.toMatchObject({ failure: 'forbidden' });
});

test('earnings are loaded with the jobs', async () => {
  const row = { job_id: 'j1', title: 'Sửa vòi', amount_minor: 450000, currency: 'VND', accepted_at: '2026-11-03T01:00:00Z', completed_on: '2026-11-03' };
  const view = await mount('working', 'worker-1', [row]);
  expect(view.result.current.data.earnings).toEqual([row]);
  expect(shared.readWorkerEarnings).toHaveBeenCalledWith('worker-1', expect.any(AbortSignal));
});

test('worker notifications load for the worker audience and reading one is optimistic', async () => {
  const notice = { id: 'n1', kind: 'job_offered' as const, request_id: 'r1', title: 'Có việc mới', body: 'b', created_at: '2026-11-03T01:00:00Z', read_at: null };
  const view = await mount();
  jest.mocked(shared.readNotifications).mockResolvedValue([notice]);
  jest.mocked(shared.markNotificationsRead).mockResolvedValue(undefined);
  await act(async () => view.result.current.refresh());
  await waitFor(() => expect(view.result.current.data.notifications).toHaveLength(1));
  expect(shared.readNotifications).toHaveBeenCalledWith('worker-1', expect.any(AbortSignal), 'worker');
  await act(async () => view.result.current.markRead(['n1']));
  expect(view.result.current.data.notifications[0]?.read_at).not.toBeNull();
  expect(shared.markNotificationsRead).toHaveBeenCalledWith('worker-1', ['n1'], expect.any(AbortSignal));
});

test('a refused read marker reloads and reports the failure, and nothing is sent without a worker', async () => {
  jest.mocked(shared.markNotificationsRead).mockRejectedValue(new Error('offline'));
  const view = await mount();
  await act(async () => {
    await expect(view.result.current.markRead(['n1'])).rejects.toThrow('offline');
  });
  const idle = await mount('working', null);
  await expect(idle.result.current.markRead(['n1'])).rejects.toMatchObject({ failure: 'forbidden' });
});

test('releasing a job sends the version the worker saw and confirms to the worker', async () => {
  const view = await mount('assigned');
  let message: string | void = undefined;
  await act(async () => { message = await view.result.current.perform('job-1', { type: 'release', reason: 'unavailable', key: 'k4' }); });
  expect(shared.releaseJob).toHaveBeenCalledWith('worker-1', job('assigned'), 'unavailable', 'k4', expect.any(AbortSignal));
  expect(message).toMatch(/Đã rút khỏi việc này/);
});
