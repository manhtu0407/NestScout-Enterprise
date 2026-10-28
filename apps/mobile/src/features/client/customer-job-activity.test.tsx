import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { WorkflowError } from '@/features/shared';
import { deviceStorage } from '@/lib/device-storage';

import { decideScope, decideSubmission, openAftercare, type CustomerJob, type Submission } from './customer-activity-repository';
import { CustomerJobActivity } from './customer-job-activity';

jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000123' }));
jest.mock('@/lib/device-storage', () => ({ deviceStorage: {
  getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(),
} }));
jest.mock('./customer-activity-repository', () => ({ decideScope: jest.fn(), decideSubmission: jest.fn(), openAftercare: jest.fn() }));

const submitted: CustomerJob = { id: 'job', request_id: 'request', stage: 'submitted', version: 2 };
const evidence: Submission = { id: 'submission', job_id: 'job', evidence: 'Fixed tap', decision: 'pending' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(deviceStorage.getItem).mockResolvedValue(null);
  jest.mocked(deviceStorage.setItem).mockResolvedValue();
  jest.mocked(deviceStorage.removeItem).mockResolvedValue();
});

test('Customer accepts the displayed submission and current job version', async () => {
  jest.mocked(decideSubmission).mockResolvedValue();
  await render(<CustomerJobActivity userId="customer-a" job={submitted} submissions={[evidence]} cases={[]} onRefresh={() => undefined} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Accept submitted work' }));
  await screen.findByText('Decision recorded. Payment is not configured.');
  expect(decideSubmission).toHaveBeenCalledWith('customer-a', 'submission', 2, 'accepted', null, expect.anything());
});

test('a dispute requires a reason and sends the current submission', async () => {
  jest.mocked(decideSubmission).mockResolvedValue();
  await render(<CustomerJobActivity userId="customer-a" job={submitted} submissions={[evidence]} cases={[]} onRefresh={() => undefined} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Open dispute' }));
  await screen.findByText('Explain the correction or dispute.');
  expect(decideSubmission).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Correction or support details'), 'Still leaking');
  await fireEvent.press(screen.getByRole('button', { name: 'Open dispute' }));
  await waitFor(() => expect(decideSubmission).toHaveBeenCalledWith('customer-a', 'submission', 2, 'disputed', 'Still leaking', expect.anything()));
});

test('uncertain aftercare retries the same operation key', async () => {
  jest.mocked(openAftercare).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce();
  await render(<CustomerJobActivity userId="customer-a" job={{ ...submitted, stage: 'completed' }} submissions={[]} cases={[]} onRefresh={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Open support case' })).toBeEnabled());
  await fireEvent.changeText(screen.getByLabelText('Correction or support details'), 'Follow-up');
  await fireEvent.press(screen.getByRole('button', { name: 'Open support case' }));
  await screen.findByText('The result was not confirmed. Refresh before trying again.');
  await fireEvent.press(screen.getByRole('button', { name: 'Retry support case' }));
  await screen.findByText('Support case opened. Warranty coverage has not been determined.');
  expect(openAftercare).toHaveBeenNthCalledWith(1, 'customer-a', 'job', '00000000-0000-4000-8000-000000000123', 'Follow-up', expect.anything());
  expect(openAftercare).toHaveBeenNthCalledWith(2, 'customer-a', 'job', '00000000-0000-4000-8000-000000000123', 'Follow-up', expect.anything());
});

test('Customer sees both fixture scopes and approves the exact version', async () => {
  jest.mocked(decideScope).mockResolvedValue();
  const change = { id: 'change', job_id: 'job', sequence: 3, old_scope: 'Old', old_amount_minor: 100,
    new_scope: 'New', new_amount_minor: 150, currency: 'VND' as const, rationale: 'Fixture', decision: 'pending' as const };
  await render(<CustomerJobActivity userId="customer-a" job={{ ...submitted, stage: 'working', version: 7 }} submissions={[]} cases={[]} changes={[change]} onRefresh={() => undefined} />);
  expect(screen.getByText(/difference 50 VND/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Approve fixture scope' }));
  await screen.findByText('Fixture scope decision recorded. No payment is configured.');
  expect(decideScope).toHaveBeenCalledWith('customer-a', 'change', 7, 3, 'approved', expect.anything());
});

test('a proposal left pending by a safety pause can still be decided', async () => {
  jest.mocked(decideScope).mockResolvedValue();
  const change = { id: 'change', job_id: 'job', sequence: 1, old_scope: 'Old', old_amount_minor: 100,
    new_scope: 'New', new_amount_minor: 150, currency: 'VND' as const, rationale: 'Fixture', decision: 'pending' as const };
  await render(<CustomerJobActivity userId="customer-a" job={{ ...submitted, stage: 'paused', version: 8 }} submissions={[]} cases={[]} changes={[change]} onRefresh={() => undefined} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Reject fixture scope' }));
  await waitFor(() => expect(decideScope).toHaveBeenCalledWith('customer-a', 'change', 8, 1, 'rejected', expect.anything()));
});

test('a stale decision is reported as changed rather than as an unknown result', async () => {
  jest.mocked(decideSubmission).mockRejectedValue(new WorkflowError('stale'));
  await render(<CustomerJobActivity userId="customer-a" job={submitted} submissions={[evidence]} cases={[]} onRefresh={() => undefined} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Accept submitted work' }));
  await screen.findByText(/changed after it was loaded/);
});

test('an unreadable support-case draft can be re-read without losing the saved retry key', async () => {
  const saved = JSON.stringify({ key: '00000000-0000-4000-8000-000000000456', reason: 'Follow-up' });
  jest.mocked(deviceStorage.getItem).mockRejectedValueOnce(new Error('locked')).mockResolvedValue(saved);
  await render(<CustomerJobActivity userId="customer-a" job={{ ...submitted, stage: 'completed' }} submissions={[]} cases={[]} onRefresh={() => undefined} />);
  await screen.findByText('Could not read the pending support case on this device.');
  expect(screen.getByRole('button', { name: 'Open support case' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Retry reading saved draft' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry support case' })).toBeEnabled());
  expect(screen.getByLabelText('Correction or support details').props.value).toBe('Follow-up');
  expect(deviceStorage.removeItem).not.toHaveBeenCalled();
});

test('a corrupt support-case draft is removed only after an explicit discard', async () => {
  jest.mocked(deviceStorage.getItem).mockResolvedValue('{not json');
  await render(<CustomerJobActivity userId="customer-a" job={{ ...submitted, stage: 'completed' }} submissions={[]} cases={[]} onRefresh={() => undefined} />);
  await screen.findByText('Could not read the pending support case on this device.');
  expect(deviceStorage.removeItem).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Discard saved draft' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Open support case' })).toBeEnabled());
  expect(deviceStorage.removeItem).toHaveBeenCalledTimes(1);
});

test('a definitive refusal releases the support-case key and keeps the typed details', async () => {
  jest.mocked(openAftercare).mockRejectedValueOnce(new WorkflowError('rejected'));
  await render(<CustomerJobActivity userId="customer-a" job={{ ...submitted, stage: 'completed' }} submissions={[]} cases={[]} onRefresh={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Open support case' })).toBeEnabled());
  await fireEvent.changeText(screen.getByLabelText('Correction or support details'), 'Follow-up');
  await fireEvent.press(screen.getByRole('button', { name: 'Open support case' }));
  await screen.findByText(/no longer available/);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Open support case' })).toBeEnabled());
  expect(deviceStorage.removeItem).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Correction or support details').props.value).toBe('Follow-up');
});

test('an uncertain aftercare failure keeps the saved retry key', async () => {
  jest.mocked(openAftercare).mockRejectedValueOnce(new Error('offline'));
  await render(<CustomerJobActivity userId="customer-a" job={{ ...submitted, stage: 'completed' }} submissions={[]} cases={[]} onRefresh={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Open support case' })).toBeEnabled());
  await fireEvent.changeText(screen.getByLabelText('Correction or support details'), 'Follow-up');
  await fireEvent.press(screen.getByRole('button', { name: 'Open support case' }));
  await screen.findByText('The result was not confirmed. Refresh before trying again.');
  expect(deviceStorage.removeItem).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Retry support case' })).toBeTruthy();
});

test('re-reading an unreadable draft does not abort a decision that is in flight', async () => {
  let given: AbortSignal | undefined;
  let finish: () => void = () => undefined;
  jest.mocked(decideSubmission).mockImplementation((...args) => {
    given = args[5];
    return new Promise<void>((resolve) => { finish = resolve; });
  });
  jest.mocked(deviceStorage.getItem).mockRejectedValueOnce(new Error('locked')).mockResolvedValue(null);
  const onRefresh = jest.fn();
  await render(<CustomerJobActivity userId="customer-a" job={submitted} submissions={[evidence]} cases={[]} onRefresh={onRefresh} />);
  await screen.findByText('Could not read the pending support case on this device.');
  await fireEvent.press(screen.getByRole('button', { name: 'Accept submitted work' }));
  await waitFor(() => expect(decideSubmission).toHaveBeenCalledTimes(1));
  await fireEvent.press(screen.getByRole('button', { name: 'Retry reading saved draft' }));
  await waitFor(() => expect(deviceStorage.getItem).toHaveBeenCalledTimes(2));
  expect(given?.aborted).toBe(false);
  expect(screen.getByRole('button', { name: 'Accept submitted work' })).toBeDisabled();
  await act(async () => finish());
  await screen.findByText('Decision recorded. Payment is not configured.');
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

const completed: CustomerJob = { ...submitted, stage: 'completed' };
const savedCase = JSON.stringify({ key: '00000000-0000-4000-8000-000000000456', reason: 'Follow-up on the first job' });
const switches = [
  ['job', 'customer-a', { ...completed, id: 'other-job' }],
  ['account', 'customer-b', completed],
] as const;

test.each(switches)('a draft read that settles after the %s changed is discarded', async (_label, userId, job) => {
  let settle: (raw: string | null) => void = () => undefined;
  jest.mocked(deviceStorage.getItem).mockImplementationOnce(() => new Promise<string | null>((resolve) => { settle = resolve; })).mockResolvedValue(null);
  const view = await render(<CustomerJobActivity userId="customer-a" job={completed} submissions={[]} cases={[]} onRefresh={() => undefined} />);
  await view.rerender(<CustomerJobActivity userId={userId} job={job} submissions={[]} cases={[]} onRefresh={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Open support case' })).toBeEnabled());
  await act(async () => settle(savedCase));
  expect(screen.getByRole('button', { name: 'Open support case' })).toBeEnabled();
  expect(screen.getByLabelText('Correction or support details').props.value).toBe('');
});

test.each(switches)('the draft of the previous %s does not carry over', async (_label, userId, job) => {
  jest.mocked(deviceStorage.getItem).mockImplementation(async (key: string) => (key === 'nestscout.aftercare.customer-a.job' ? savedCase : null));
  const view = await render(<CustomerJobActivity userId="customer-a" job={completed} submissions={[]} cases={[]} onRefresh={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry support case' })).toBeEnabled());
  expect(screen.getByLabelText('Correction or support details').props.value).toBe('Follow-up on the first job');
  await view.rerender(<CustomerJobActivity userId={userId} job={job} submissions={[]} cases={[]} onRefresh={() => undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Open support case' })).toBeEnabled());
  expect(screen.getByLabelText('Correction or support details').props.value).toBe('');
});
