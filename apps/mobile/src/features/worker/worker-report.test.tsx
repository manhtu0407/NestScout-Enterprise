import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { WorkflowError } from '@/features/shared';
import { deviceStorage } from '@/lib/device-storage';

import { reportJob, type Job } from './worker-repository';
import { WorkerReport } from './worker-report';

jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000123' }));
jest.mock('@/lib/device-storage', () => ({ deviceStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('./worker-repository', () => ({ reportJob: jest.fn() }));

const job: Job = { job_id: 'job', stage: 'en_route', version: 2, scope: 'Fixture', amount_minor: 100, currency: 'VND' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(deviceStorage.getItem).mockResolvedValue(null);
  jest.mocked(deviceStorage.setItem).mockResolvedValue();
  jest.mocked(deviceStorage.removeItem).mockResolvedValue();
});

test('a delay report retries the same key and never claims an automatic fee', async () => {
  jest.mocked(reportJob).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce();
  await render(<WorkerReport userId="worker-a" job={job} onRefresh={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Report delay' })).toBeEnabled());
  await fireEvent.changeText(screen.getByLabelText('Report details'), 'Traffic');
  await fireEvent.press(screen.getByRole('button', { name: 'Report delay' }));
  await screen.findByText('Report was not confirmed. Retry the same details or refresh the job.');
  await fireEvent.press(screen.getByRole('button', { name: 'Retry report' }));
  await screen.findByText('Report recorded. No automatic fee, cancellation or rescheduling was applied.');
  expect(reportJob).toHaveBeenNthCalledWith(1, 'worker-a', 'job', 2, '00000000-0000-4000-8000-000000000123', 'delay', 'Traffic', expect.anything());
  expect(reportJob).toHaveBeenNthCalledWith(2, 'worker-a', 'job', 2, '00000000-0000-4000-8000-000000000123', 'delay', 'Traffic', expect.anything());
});

test('an unreadable report draft can be re-read without losing the saved retry key', async () => {
  const saved = JSON.stringify({ key: '00000000-0000-4000-8000-000000000456', version: 2, kind: 'delay', details: 'Traffic' });
  jest.mocked(deviceStorage.getItem).mockRejectedValueOnce(new Error('locked')).mockResolvedValue(saved);
  await render(<WorkerReport userId="worker-a" job={job} onRefresh={() => undefined} />);
  await screen.findByText('Could not read the pending report on this device.');
  expect(screen.getByRole('button', { name: 'Report delay' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Retry reading saved draft' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry report' })).toBeEnabled());
  expect(screen.getByLabelText('Report details').props.value).toBe('Traffic');
  expect(deviceStorage.removeItem).not.toHaveBeenCalled();
});

test('a corrupt report draft is removed only after an explicit discard', async () => {
  jest.mocked(deviceStorage.getItem).mockResolvedValue('{not json');
  await render(<WorkerReport userId="worker-a" job={job} onRefresh={() => undefined} />);
  await screen.findByText('Could not read the pending report on this device.');
  expect(deviceStorage.removeItem).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Discard saved draft' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Report delay' })).toBeEnabled());
  expect(deviceStorage.removeItem).toHaveBeenCalledTimes(1);
});

test('a definitive refusal releases the report key and keeps the typed details', async () => {
  jest.mocked(reportJob).mockRejectedValueOnce(new WorkflowError('rejected'));
  await render(<WorkerReport userId="worker-a" job={job} onRefresh={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Report delay' })).toBeEnabled());
  await fireEvent.changeText(screen.getByLabelText('Report details'), 'Traffic');
  await fireEvent.press(screen.getByRole('button', { name: 'Report delay' }));
  await screen.findByText(/no longer available/);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Report delay' })).toBeEnabled());
  expect(deviceStorage.removeItem).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Report details').props.value).toBe('Traffic');
});
