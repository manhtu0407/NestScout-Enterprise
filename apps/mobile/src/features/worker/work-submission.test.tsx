import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { WorkflowError } from '@/features/shared';
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

test('an unreadable draft can be re-read without losing the saved retry key', async () => {
  const saved = JSON.stringify({ key: '00000000-0000-4000-8000-000000000456', version: 4, evidence: 'Saved evidence' });
  jest.mocked(deviceStorage.getItem).mockRejectedValueOnce(new Error('locked')).mockResolvedValue(saved);
  await render(<WorkSubmission userId="worker-a" job={job} onSettled={() => undefined} />);
  await screen.findByText('Could not read the pending work submission on this device.');
  expect(screen.getByRole('button', { name: 'Submit work' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Retry reading saved draft' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry work submission' })).toBeEnabled());
  expect(screen.getByLabelText('Work evidence').props.value).toBe('Saved evidence');
  expect(deviceStorage.removeItem).not.toHaveBeenCalled();
});

test('a corrupt draft is removed only after an explicit discard', async () => {
  jest.mocked(deviceStorage.getItem).mockResolvedValue('{not json');
  await render(<WorkSubmission userId="worker-a" job={job} onSettled={() => undefined} />);
  await screen.findByText('Could not read the pending work submission on this device.');
  expect(deviceStorage.removeItem).not.toHaveBeenCalled();
  jest.mocked(deviceStorage.getItem).mockResolvedValue(null);
  await fireEvent.press(screen.getByRole('button', { name: 'Discard saved draft' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit work' })).toBeEnabled());
  expect(deviceStorage.removeItem).toHaveBeenCalledTimes(1);
});

test('a definitive refusal releases the retry key and keeps the typed evidence', async () => {
  jest.mocked(submitWork).mockRejectedValueOnce(new WorkflowError('stale'));
  await render(<WorkSubmission userId="worker-a" job={job} onSettled={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit work' })).toBeEnabled());
  await fireEvent.changeText(screen.getByLabelText('Work evidence'), 'Repaired tap');
  await fireEvent.press(screen.getByRole('button', { name: 'Submit work' }));
  await screen.findByText(/changed after it was loaded/);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit work' })).toBeEnabled());
  expect(deviceStorage.removeItem).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Work evidence').props.value).toBe('Repaired tap');
});

const savedSubmission = JSON.stringify({ key: '00000000-0000-4000-8000-000000000456', version: 4, evidence: 'First job evidence' });
const switches = [
  ['job', 'worker-a', { ...job, job_id: 'other-job' }],
  ['account', 'worker-b', job],
] as const;

test.each(switches)('a draft read that settles after the %s changed is discarded', async (_label, userId, next) => {
  let settle: (raw: string | null) => void = () => undefined;
  jest.mocked(deviceStorage.getItem).mockImplementationOnce(() => new Promise<string | null>((resolve) => { settle = resolve; })).mockResolvedValue(null);
  const view = await render(<WorkSubmission userId="worker-a" job={job} onSettled={() => undefined} />);
  await view.rerender(<WorkSubmission userId={userId} job={next} onSettled={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit work' })).toBeEnabled());
  await act(async () => settle(savedSubmission));
  expect(screen.getByRole('button', { name: 'Submit work' })).toBeEnabled();
  expect(screen.getByLabelText('Work evidence').props.value).toBe('');
});

test.each(switches)('the draft of the previous %s does not carry over', async (_label, userId, next) => {
  jest.mocked(deviceStorage.getItem).mockImplementation(async (key: string) => (key === 'nestscout.work-submission.worker-a.job' ? savedSubmission : null));
  const view = await render(<WorkSubmission userId="worker-a" job={job} onSettled={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry work submission' })).toBeEnabled());
  expect(screen.getByLabelText('Work evidence').props.value).toBe('First job evidence');
  await view.rerender(<WorkSubmission userId={userId} job={next} onSettled={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit work' })).toBeEnabled());
  expect(screen.getByLabelText('Work evidence').props.value).toBe('');
});

test('a locked form cannot be edited or submitted until it is unlocked', async () => {
  const view = await render(<WorkSubmission userId="worker-a" job={job} onSettled={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit work' })).toBeEnabled());
  await fireEvent.changeText(screen.getByLabelText('Work evidence'), 'Repaired tap');
  await view.rerender(<WorkSubmission userId="worker-a" job={job} locked onSettled={() => undefined} />);
  expect(screen.getByRole('button', { name: 'Submit work' })).toBeDisabled();
  expect(screen.getByLabelText('Work evidence').props.editable).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Submit work' }));
  expect(submitWork).not.toHaveBeenCalled();
  await view.rerender(<WorkSubmission userId="worker-a" job={job} onSettled={() => undefined} />);
  expect(screen.getByRole('button', { name: 'Submit work' })).toBeEnabled();
  expect(screen.getByLabelText('Work evidence').props.value).toBe('Repaired tap');
});
