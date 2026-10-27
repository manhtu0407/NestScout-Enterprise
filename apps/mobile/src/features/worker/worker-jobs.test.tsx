import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { WorkflowError } from '@/features/shared';

import { acceptOffer, advanceJob, declineOffer, readWorkerSnapshot } from './worker-repository';
import { WorkerJobs } from './worker-jobs';

jest.mock('./worker-repository', () => ({
  acceptOffer: jest.fn(),
  declineOffer: jest.fn(),
  advanceJob: jest.fn(),
  readWorkerSnapshot: jest.fn(),
  proposeScope: jest.fn(),
  reportJob: jest.fn(),
}));

const offer = { invitation_id: 'invite', quote_id: 'quote', quote_version: 2, scope: 'Replace part', amount_minor: 100, currency: 'VND' as const, expires_at: '2027-01-01' };
const job = { job_id: 'job', stage: 'working' as const, version: 4, scope: 'Replace part', amount_minor: 100, currency: 'VND' as const };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [], jobs: [], changes: [], reports: [] });
});

test('the Worker sees terms and accepts the exact displayed offer', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [offer], jobs: [], changes: [], reports: [] });
  jest.mocked(acceptOffer).mockResolvedValue();
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText(/Offer: Replace part/);
  await fireEvent.press(screen.getByRole('button', { name: 'Accept displayed offer' }));
  await waitFor(() => expect(acceptOffer).toHaveBeenCalledWith('worker-a', offer, expect.anything()));
});

test('the Worker can decline the displayed terms without creating an assignment', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [offer], jobs: [], changes: [], reports: [] });
  jest.mocked(declineOffer).mockResolvedValue();
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText(/Offer: Replace part/);
  await fireEvent.press(screen.getByRole('button', { name: 'Decline displayed offer' }));
  await waitFor(() => expect(declineOffer).toHaveBeenCalledWith('worker-a', offer, expect.anything()));
  expect(acceptOffer).not.toHaveBeenCalled();
});

test('an uncertain pause is not shown as a confirmed change', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [], jobs: [job], changes: [], reports: [] });
  jest.mocked(advanceJob).mockRejectedValue(new Error('offline'));
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText(/stage: working/);
  await fireEvent.press(screen.getByRole('button', { name: 'Pause for safety' }));
  await screen.findByText('The action was not confirmed. Refresh the current state before retrying.');
  expect(screen.queryByText(/Work is paused/)).toBeNull();
  expect(advanceJob).toHaveBeenCalledWith('worker-a', job, 'paused', expect.anything());
});

test('late offers for a previous account are discarded', async () => {
  let finish: (value: { offers: typeof offer[]; jobs: []; changes: []; reports: [] }) => void = () => undefined;
  jest.mocked(readWorkerSnapshot).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const first = await render(<WorkerJobs userId="worker-a" />);
  await first.unmount();
  await render(<WorkerJobs userId="worker-b" />);
  await act(async () => finish({ offers: [offer], jobs: [], changes: [], reports: [] }));
  expect(screen.queryByText(/Offer: Replace part/)).toBeNull();
});

test('a job awaiting Customer review offers no pause that would strand it', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [], jobs: [{ ...job, stage: 'submitted' }], changes: [], reports: [] });
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText(/stage: submitted/);
  expect(screen.queryByRole('button', { name: 'Pause for safety' })).toBeNull();
  expect(screen.getByText('Waiting for the Customer to review the submitted work.')).toBeTruthy();
});

test('a stale version and a wrong-role refusal are explained differently from a lost connection', async () => {
  jest.mocked(readWorkerSnapshot).mockResolvedValue({ offers: [], jobs: [job], changes: [], reports: [] });
  jest.mocked(advanceJob).mockRejectedValueOnce(new WorkflowError('stale')).mockRejectedValueOnce(new WorkflowError('forbidden'));
  await render(<WorkerJobs userId="worker-a" />);
  await screen.findByText(/stage: working/);
  await fireEvent.press(screen.getByRole('button', { name: 'Pause for safety' }));
  await screen.findByText(/changed after it was loaded/);
  await fireEvent.press(screen.getByRole('button', { name: 'Pause for safety' }));
  await screen.findByText('This action is not available for your account or this item.');
});
