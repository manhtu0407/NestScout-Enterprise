import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

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
