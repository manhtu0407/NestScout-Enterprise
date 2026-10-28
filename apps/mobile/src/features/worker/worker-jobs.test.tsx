import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { WorkflowError } from '@/features/shared';
import { deviceStorage } from '@/lib/device-storage';

import { acceptOffer, advanceJob, declineOffer, pauseJob, readWorkerSnapshot, requestResume, submitWork } from './worker-repository';
import { WorkerJobs } from './worker-jobs';

jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000123' }));
jest.mock('@/lib/device-storage', () => ({ deviceStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('./worker-repository', () => ({
  acceptOffer: jest.fn(),
  declineOffer: jest.fn(),
  advanceJob: jest.fn(),
  pauseJob: jest.fn(),
  requestResume: jest.fn(),
  readWorkerSnapshot: jest.fn(),
  submitWork: jest.fn(),
  proposeScope: jest.fn(),
  reportJob: jest.fn(),
}));

const offer = { invitation_id: 'invite', quote_id: 'quote', quote_version: 2, scope: 'Replace part', amount_minor: 100, currency: 'VND' as const, expires_at: '2027-01-01', basis: 'local_fixture' };
const job = { job_id: 'job', stage: 'working' as const, version: 4, scope: 'Replace part', amount_minor: 100, currency: 'VND' as const };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(deviceStorage.getItem).mockResolvedValue(null);
  jest.mocked(deviceStorage.setItem).mockResolvedValue();
  jest.mocked(deviceStorage.removeItem).mockResolvedValue();
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [], jobs: [], changes: [], reports: [], corrections: [], pauses: [] });
});

test('the Worker sees terms and accepts the exact displayed offer', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [offer], jobs: [], changes: [], reports: [], corrections: [], pauses: [] });
  jest.mocked(acceptOffer).mockResolvedValue();
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText(/Offer: Replace part/);
  await fireEvent.press(screen.getByRole('button', { name: 'Accept displayed offer' }));
  await waitFor(() => expect(acceptOffer).toHaveBeenCalledWith('worker-a', offer, expect.anything()));
});

test('the Worker can decline the displayed terms without creating an assignment', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [offer], jobs: [], changes: [], reports: [], corrections: [], pauses: [] });
  jest.mocked(declineOffer).mockResolvedValue();
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText(/Offer: Replace part/);
  await fireEvent.press(screen.getByRole('button', { name: 'Decline displayed offer' }));
  await waitFor(() => expect(declineOffer).toHaveBeenCalledWith('worker-a', offer, expect.anything()));
  expect(acceptOffer).not.toHaveBeenCalled();
});

test('an uncertain pause is not shown as a confirmed change', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [], jobs: [job], changes: [], reports: [], corrections: [], pauses: [] });
  jest.mocked(pauseJob).mockRejectedValue(new Error('offline'));
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText(/stage: working/);
  await fireEvent.press(screen.getByRole('button', { name: 'Stop work (safety concern)' }));
  await screen.findByText('The action was not confirmed. Refresh the current state before retrying.');
  expect(screen.queryByText(/Work is stopped|Work is paused/)).toBeNull();
  expect(pauseJob).toHaveBeenCalledWith('worker-a', job, 'safety_concern', expect.anything());
});

test('late offers for a previous account are discarded', async () => {
  let finish: (value: { offers: typeof offer[]; jobs: []; changes: []; reports: []; corrections: []; pauses: [] }) => void = () => undefined;
  jest.mocked(readWorkerSnapshot).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const first = await render(<WorkerJobs userId="worker-a" />);
  await first.unmount();
  await render(<WorkerJobs userId="worker-b" />);
  await act(async () => finish({ offers: [offer], jobs: [], changes: [], reports: [], corrections: [], pauses: [] }));
  expect(screen.queryByText(/Offer: Replace part/)).toBeNull();
});

test('a job awaiting Customer review offers no pause that would strand it', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [], jobs: [{ ...job, stage: 'submitted' }], changes: [], reports: [], corrections: [], pauses: [] });
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText(/stage: submitted/);
  expect(screen.queryByRole('button', { name: 'Pause work (ordinary interruption)' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Stop work (safety concern)' })).toBeNull();
  expect(screen.getByText(/Work is submitted\. The Customer review, or a manual dispute process outside this app, is pending/)).toBeTruthy();
});

test('a stale version and a wrong-role refusal are explained differently from a lost connection', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [], jobs: [job], changes: [], reports: [], corrections: [], pauses: [] });
  jest.mocked(pauseJob).mockRejectedValueOnce(new WorkflowError('stale')).mockRejectedValueOnce(new WorkflowError('forbidden'));
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText(/stage: working/);
  await fireEvent.press(screen.getByRole('button', { name: 'Stop work (safety concern)' }));
  await screen.findByText(/changed after it was loaded/);
  await fireEvent.press(screen.getByRole('button', { name: 'Stop work (safety concern)' }));
  await screen.findByText('This action is not available for your account or this item.');
});

test('a fixture offer is labelled as a test offer', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [offer], jobs: [], changes: [], reports: [], corrections: [], pauses: [] });
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText('Test offer — not a real price or commitment.');
  expect(screen.getByRole('button', { name: 'Accept displayed offer' })).toBeEnabled();
});

test('the Worker sees the Customer correction request on the job it belongs to', async () => {
  const other = { ...job, job_id: 'other-job' };
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [], jobs: [job, other], changes: [], reports: [], corrections: [{ job_id: 'job', note: 'Reseal the joint' }], pauses: [] });
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText('Customer requested a correction: Reseal the joint');
  expect(screen.getAllByText(/Customer requested a correction/)).toHaveLength(1);
  expect(screen.getAllByText(/stage: working/)).toHaveLength(2);
});

test('a correction request for a job that is not listed is not displayed', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [], jobs: [job], changes: [], reports: [], corrections: [{ job_id: 'unlisted', note: 'Someone else' }], pauses: [] });
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText(/stage: working/);
  expect(screen.queryByText(/Customer requested a correction/)).toBeNull();
});

test('no correction request is shown when the Customer has not asked for one', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [], jobs: [job], changes: [], reports: [], corrections: [], pauses: [] });
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText(/stage: working/);
  expect(screen.queryByText(/Customer requested a correction/)).toBeNull();
});

test('an offer with an unrecognized source cannot be accepted but can be declined', async () => {
  const unknown = { ...offer, basis: 'matching_engine' };
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [unknown], jobs: [], changes: [], reports: [], corrections: [], pauses: [] });
  jest.mocked(declineOffer).mockResolvedValue();
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText('This offer has an unrecognized source and cannot be accepted here.');
  expect(screen.getByRole('button', { name: 'Accept displayed offer' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Accept displayed offer' }));
  expect(acceptOffer).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Decline displayed offer' }));
  await waitFor(() => expect(declineOffer).toHaveBeenCalledWith('worker-a', unknown, expect.anything()));
});

const unverified = 'Worker activity could not be verified. Actions are disabled until a refresh succeeds.';
const stale = 'Showing the last verified state, which may be out of date.';
const verifiedSnapshot = { offers: [offer], jobs: [job], changes: [], reports: [], corrections: [{ job_id: 'job', note: 'Reseal the joint' }], pauses: [] };

test('a first read that cannot be verified shows an actionable error and no actions', async () => {
  jest.mocked(readWorkerSnapshot).mockRejectedValue(new Error('Submissions unavailable'));
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText(unverified);
  expect(screen.queryByText(stale)).toBeNull();
  expect(screen.queryByText(/Customer requested a correction/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Accept displayed offer' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Refresh Worker activity' })).toBeEnabled();
});

test('a failed refresh keeps the last verified state read-only and labelled as stale', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValueOnce(verifiedSnapshot).mockRejectedValue(new Error('Submissions unavailable'));
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText('Customer requested a correction: Reseal the joint');
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh Worker activity' }));
  await screen.findByText(unverified);
  expect(screen.getByText(stale)).toBeTruthy();
  expect(screen.getByText('Customer requested a correction: Reseal the joint')).toBeTruthy();
  expect(screen.getByText(/stage: working/)).toBeTruthy();
  for (const name of ['Accept displayed offer', 'Decline displayed offer', 'Pause work (ordinary interruption)', 'Stop work (safety concern)', 'Submit work']) {
    expect(screen.getByRole('button', { name })).toBeDisabled();
  }
  await fireEvent.press(screen.getByRole('button', { name: 'Stop work (safety concern)' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Accept displayed offer' }));
  expect(pauseJob).not.toHaveBeenCalled();
  expect(acceptOffer).not.toHaveBeenCalled();
});

test('a successful refresh after a failure removes the notice and restores the actions', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValueOnce(verifiedSnapshot).mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({ ...verifiedSnapshot, corrections: [], pauses: [] });
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText(/stage: working/);
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh Worker activity' }));
  await screen.findByText(unverified);
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh Worker activity' }));
  await waitFor(() => expect(screen.queryByText(unverified)).toBeNull());
  expect(screen.queryByText(stale)).toBeNull();
  expect(screen.queryByText(/Customer requested a correction/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Stop work (safety concern)' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Accept displayed offer' })).toBeEnabled();
});

test.each([
  ['an access refusal', new WorkflowError('forbidden')],
  ['an unclassified server failure', new WorkflowError('unknown')],
  ['a lost connection', new Error('Network request failed')],
  ['a malformed response', new Error('Invalid submissions')],
  ['a changed projection', new Error('Worker activity changed during refresh')],
])('%s is never shown as an empty correction list', async (_name, failure) => {
  jest.mocked(readWorkerSnapshot).mockResolvedValueOnce(verifiedSnapshot).mockRejectedValue(failure);
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText('Customer requested a correction: Reseal the joint');
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh Worker activity' }));
  await screen.findByText(unverified);
  expect(screen.getByText('Customer requested a correction: Reseal the joint')).toBeTruthy();
});

test('a read that fails while a submission is in flight does not abort the submission', async () => {
  let given: AbortSignal | undefined;
  jest.mocked(submitWork).mockImplementation((_user, _job, _version, _key, _evidence, signal) => new Promise<void>((_resolve, reject) => {
    given = signal;
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  jest.mocked(readWorkerSnapshot).mockResolvedValueOnce({ ...verifiedSnapshot, offers: [] }).mockRejectedValue(new Error('Submissions unavailable'));
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText(/stage: working/);
  await fireEvent.changeText(screen.getByLabelText('Work evidence'), 'Fixture evidence');
  await fireEvent.press(screen.getByRole('button', { name: 'Submit work' }));
  await waitFor(() => expect(submitWork).toHaveBeenCalled());
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh Worker activity' }));
  await screen.findByText(unverified);
  expect(given?.aborted).toBe(false);
  expect(screen.getByLabelText('Work evidence')).toBeTruthy();
});

test('a read superseded by a newer refresh cannot mark the activity verified', async () => {
  let finish: (value: typeof verifiedSnapshot) => void = () => undefined;
  jest.mocked(readWorkerSnapshot)
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockRejectedValue(new Error('Submissions unavailable'));
  await render(<WorkerJobs userId="worker-a" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh Worker activity' }));
  await screen.findByText(unverified);
  await act(async () => finish(verifiedSnapshot));
  expect(screen.getByText(unverified)).toBeTruthy();
  expect(screen.queryByText(/Offer: Replace part/)).toBeNull();
});

const paused = { ...job, stage: 'paused' as const, version: 6 };
const ordinaryPause = { job_id: 'job', category: 'ordinary_interruption' as const, prior_stage: 'working' as const, paused_from_version: 4, resume_requested: false };

test('an ordinary pause is requested with its category', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [], jobs: [job], changes: [], reports: [], corrections: [], pauses: [] });
  jest.mocked(pauseJob).mockResolvedValue();
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText(/stage: working/);
  await fireEvent.press(screen.getByRole('button', { name: 'Pause work (ordinary interruption)' }));
  await waitFor(() => expect(pauseJob).toHaveBeenCalledWith('worker-a', job, 'ordinary_interruption', expect.anything()));
  expect(advanceJob).not.toHaveBeenCalled();
});

test('a paused job offers a resume request and the safety stop', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [], jobs: [paused], changes: [], reports: [], corrections: [], pauses: [ordinaryPause] });
  jest.mocked(requestResume).mockResolvedValue();
  jest.mocked(pauseJob).mockResolvedValue();
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText(/Work is paused for an ordinary interruption/);
  await fireEvent.press(screen.getByRole('button', { name: 'Request to resume work' }));
  await waitFor(() => expect(requestResume).toHaveBeenCalledWith('worker-a', paused, expect.anything()));
  await fireEvent.press(screen.getByRole('button', { name: 'Stop work (safety concern)' }));
  await waitFor(() => expect(pauseJob).toHaveBeenCalledWith('worker-a', paused, 'safety_concern', expect.anything()));
});

test('a resume request that is waiting for the Customer cannot be repeated', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [], jobs: [paused], changes: [], reports: [], corrections: [], pauses: [{ ...ordinaryPause, resume_requested: true }] });
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText('Resume requested. Waiting for the Customer to agree to the current scope.');
  expect(screen.queryByRole('button', { name: 'Request to resume work' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Stop work (safety concern)' })).toBeEnabled();
});

test('a safety stop offers no way to resume and says that support is needed', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [], jobs: [paused], changes: [], reports: [], corrections: [], pauses: [{ ...ordinaryPause, category: 'safety_concern' as const }] });
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText(/Work is stopped for a safety concern\. No safety clearance process is configured/);
  expect(screen.queryByRole('button', { name: 'Request to resume work' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Stop work (safety concern)' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Pause work (ordinary interruption)' })).toBeNull();
});

test('a paused job whose pause cannot be identified offers no resume', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [], jobs: [paused], changes: [], reports: [], corrections: [], pauses: [] });
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText('The pause state of this job could not be verified. Refresh before acting.');
  expect(screen.queryByRole('button', { name: 'Request to resume work' })).toBeNull();
});

test('an unverified refresh disables the resume request and the escalation', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValueOnce({ offers: [], jobs: [paused], changes: [], reports: [], corrections: [], pauses: [ordinaryPause] }).mockRejectedValue(new Error('offline'));
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText(/Work is paused for an ordinary interruption/);
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh Worker activity' }));
  await screen.findByText(unverified);
  expect(screen.getByRole('button', { name: 'Request to resume work' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Stop work (safety concern)' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Request to resume work' }));
  expect(requestResume).not.toHaveBeenCalled();
});
