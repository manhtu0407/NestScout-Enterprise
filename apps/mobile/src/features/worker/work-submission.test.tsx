import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { deviceStorage } from '@/lib/device-storage';

import { submitWork, type Job } from './worker-repository';
import { WorkSubmission } from './work-submission';

jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000123' }));
jest.mock('@/lib/device-storage', () => ({ deviceStorage: {
  getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(),
} }));
jest.mock('./worker-repository', () => ({ submitWork: jest.fn() }));

const job: Job = { job_id: 'job', version: 4, stage: 'working', scope: 'Fixture', amount_minor: 100, currency: 'VND' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(deviceStorage.getItem).mockResolvedValue(null);
  jest.mocked(deviceStorage.setItem).mockResolvedValue();
  jest.mocked(deviceStorage.removeItem).mockResolvedValue();
});

test('uncertain work submission retries the same evidence, version and key', async () => {
  jest.mocked(submitWork).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce();
  await render(<WorkSubmission userId="worker-a" job={job} onSettled={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit work' })).toBeEnabled());
  await fireEvent.changeText(screen.getByLabelText('Work evidence'), 'Repaired tap');
  await fireEvent.press(screen.getByRole('button', { name: 'Submit work' }));
  await screen.findByText('Submission was not confirmed. Retry the same evidence or refresh the job.');
  await fireEvent.press(screen.getByRole('button', { name: 'Retry work submission' }));
  await screen.findByText('Work submission recorded. Refresh for the current Customer decision. Payment is not configured.');
  expect(submitWork).toHaveBeenNthCalledWith(1, 'worker-a', 'job', 4, '00000000-0000-4000-8000-000000000123', 'Repaired tap', expect.anything());
  expect(submitWork).toHaveBeenNthCalledWith(2, 'worker-a', 'job', 4, '00000000-0000-4000-8000-000000000123', 'Repaired tap', expect.anything());
});

test('failed secure storage prevents work submission', async () => {
  jest.mocked(deviceStorage.getItem).mockRejectedValue(new Error('unavailable'));
  await render(<WorkSubmission userId="worker-a" job={job} onSettled={() => undefined} />);
  await screen.findByText('Could not read the pending work submission on this device.');
  expect(screen.getByRole('button', { name: 'Submit work' })).toBeDisabled();
  expect(submitWork).not.toHaveBeenCalled();
});
