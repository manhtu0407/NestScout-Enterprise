import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { acceptQuote, readQuotes, readRequests, rejectQuote, submitRequest } from './service-request-repository';
import { loadPendingRequest } from './pending-request-store';
import { readCustomerActivity } from './customer-activity-repository';
import { ServiceRequests } from './service-requests';

jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000123' }));
jest.mock('./service-request-repository', () => ({
  readRequests: jest.fn(),
  readQuotes: jest.fn(),
  submitRequest: jest.fn(),
  acceptQuote: jest.fn(),
  rejectQuote: jest.fn(),
}));
jest.mock('./pending-request-store', () => ({
  loadPendingRequest: jest.fn(),
  savePendingRequest: jest.fn().mockResolvedValue(undefined),
  clearPendingRequest: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./customer-activity-repository', () => ({ readCustomerActivity: jest.fn() }));

const read = jest.mocked(readRequests);
const submit = jest.mocked(submitRequest);

beforeEach(() => {
  jest.clearAllMocks();
  read.mockResolvedValue([]);
  jest.mocked(readQuotes).mockResolvedValue([]);
  jest.mocked(loadPendingRequest).mockResolvedValue(null);
  jest.mocked(readCustomerActivity).mockResolvedValue({ jobs: [], submissions: [], cases: [], changes: [], reports: [] });
});

test('an uncertain submission retains its key and retries the same description', async () => {
  submit.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('request-id');
  await render(<ServiceRequests userId="customer-a" />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit request' })).toBeEnabled());
  await fireEvent.changeText(screen.getByLabelText('Service request'), 'Need repair');
  await fireEvent.press(screen.getByRole('button', { name: 'Submit request' }));
  await screen.findByText('The outcome is unknown. Retry the same request to check safely.');
  expect(screen.getByLabelText('Service request').props.editable).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Retry request' }));
  await screen.findByText('Request received. Refresh for its current status.');
  expect(submit).toHaveBeenCalledTimes(2);
  expect(submit).toHaveBeenNthCalledWith(1, 'customer-a', '00000000-0000-4000-8000-000000000123', 'Need repair', expect.anything());
  expect(submit).toHaveBeenNthCalledWith(2, 'customer-a', '00000000-0000-4000-8000-000000000123', 'Need repair', expect.anything());
});

test('a late response after unmount cannot display another account’s requests', async () => {
  let finish: (value: { id: string; description: string; created_at: string }[]) => void = () => undefined;
  read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const first = await render(<ServiceRequests userId="customer-a" />);
  await first.unmount();
  await render(<ServiceRequests userId="customer-b" />);
  await act(async () => finish([{ id: 'a', description: 'Private A', created_at: '2026-01-01' }]));
  await waitFor(() => expect(read).toHaveBeenCalledWith('customer-b', expect.anything()));
  expect(screen.queryByText('Private A')).toBeNull();
});

test('a pending request is restored with the same key after restart', async () => {
  const item = { key: '00000000-0000-4000-8000-000000000456', description: 'Pending repair' };
  jest.mocked(loadPendingRequest).mockResolvedValue(item);
  submit.mockResolvedValue('request-id');
  await render(<ServiceRequests userId="customer-a" />);
  await screen.findByRole('button', { name: 'Retry request' });
  await fireEvent.press(screen.getByRole('button', { name: 'Retry request' }));
  await screen.findByText('Request received. Refresh for its current status.');
  expect(submit).toHaveBeenCalledWith('customer-a', item.key, item.description, expect.anything());
});

test('unreadable pending storage blocks new submissions', async () => {
  jest.mocked(loadPendingRequest).mockRejectedValue(new Error('unavailable'));
  await render(<ServiceRequests userId="customer-a" />);
  await screen.findByText('Could not read the pending request on this device.');
  expect(screen.getByRole('button', { name: 'Submit request' })).toBeDisabled();
  expect(submit).not.toHaveBeenCalled();
});

test('refreshing requests does not cancel restoration of a pending draft', async () => {
  let finish: (item: { key: string; description: string }) => void = () => undefined;
  jest.mocked(loadPendingRequest).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render(<ServiceRequests userId="customer-a" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh requests' }));
  await act(async () => finish({ key: '00000000-0000-4000-8000-000000000456', description: 'Restored request' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry request' })).toBeEnabled());
  expect(screen.getByLabelText('Service request').props.value).toBe('Restored request');
});

test('acceptance uses the displayed quote version without claiming payment or booking', async () => {
  read.mockResolvedValue([{ id: 'request-a', description: 'Repair', created_at: '2026-01-01' }]);
  jest.mocked(readQuotes).mockResolvedValue([{ id: 'quote-a', request_id: 'request-a', version: 2, scope: 'Replace part', amount_minor: 1000, currency: 'VND', expires_at: '2027-01-01T00:00:00Z', accepted_at: null, rejected_at: null }]);
  jest.mocked(acceptQuote).mockResolvedValue('quote-a');
  await render(<ServiceRequests userId="customer-a" />);
  await screen.findByText(/Quote 2: Replace part/);
  await fireEvent.press(screen.getByRole('button', { name: 'Accept quote 2' }));
  await screen.findByText('The displayed quote was accepted. Payment is not configured; check assignment separately.');
  expect(acceptQuote).toHaveBeenCalledWith('customer-a', 'quote-a', 2, expect.anything());
});

test('Customer can reject the displayed quote without accepting it', async () => {
  read.mockResolvedValue([{ id: 'request-a', description: 'Repair', created_at: '2026-01-01' }]);
  jest.mocked(readQuotes).mockResolvedValue([{ id: 'quote-a', request_id: 'request-a', version: 2, scope: 'Replace part', amount_minor: 1000, currency: 'VND', expires_at: '2027-01-01T00:00:00Z', accepted_at: null, rejected_at: null }]);
  jest.mocked(rejectQuote).mockResolvedValue('quote-a');
  await render(<ServiceRequests userId="customer-a" />);
  await screen.findByText(/Quote 2: Replace part/);
  await fireEvent.press(screen.getByRole('button', { name: 'Reject quote 2' }));
  await screen.findByText('The displayed quote was rejected.');
  expect(rejectQuote).toHaveBeenCalledWith('customer-a', 'quote-a', 2, expect.anything());
  expect(acceptQuote).not.toHaveBeenCalled();
});
