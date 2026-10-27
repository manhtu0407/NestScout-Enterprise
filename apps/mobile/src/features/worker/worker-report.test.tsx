import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

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
