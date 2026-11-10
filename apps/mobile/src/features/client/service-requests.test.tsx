import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { acceptQuote, readCustomerActivity, readQuotes, readRequests, rejectQuote, submitRequest, uploadRequestPhoto } from '@/features/shared';
import { loadPendingRequest } from '@/features/shared/pending-request-store';
import { ServiceRequests } from './service-requests';

jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000123' }));
const mockPick = jest.fn();
const mockStore = new Map<string, string>();
jest.mock('@/lib/device-storage', () => ({
  deviceStorage: {
    getItem: async (key: string) => mockStore.get(key) ?? null,
    setItem: async (key: string, value: string) => { mockStore.set(key, value); },
    removeItem: async (key: string) => { mockStore.delete(key); },
  },
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: (...args: unknown[]) => mockPick(...args) }));
jest.mock('@/features/shared/customer-media-repository', () => ({
  ...jest.requireActual('@/features/shared/customer-media-repository'),
  uploadRequestPhoto: jest.fn(),
}));
jest.mock('@/features/shared/service-request-repository', () => ({
  readRequests: jest.fn(),
  readQuotes: jest.fn(),
  submitRequest: jest.fn(),
  acceptQuote: jest.fn(),
  rejectQuote: jest.fn(),
}));
jest.mock('@/features/shared/pending-request-store', () => ({
  maxLocationLength: 200,
  loadPendingRequest: jest.fn(),
  savePendingRequest: jest.fn().mockResolvedValue(undefined),
  clearPendingRequest: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/features/shared/customer-activity-repository', () => ({ readCustomerActivity: jest.fn() }));

const read = jest.mocked(readRequests);
const submit = jest.mocked(submitRequest);

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  read.mockResolvedValue([]);
  jest.mocked(readQuotes).mockResolvedValue([]);
  jest.mocked(loadPendingRequest).mockResolvedValue(null);
  jest.mocked(readCustomerActivity).mockResolvedValue({ jobs: [], submissions: [], cases: [], changes: [], reports: [], pauses: [] });
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
  expect(submit).toHaveBeenNthCalledWith(1, 'customer-a', '00000000-0000-4000-8000-000000000123', 'Need repair', expect.anything(), '');
  expect(submit).toHaveBeenNthCalledWith(2, 'customer-a', '00000000-0000-4000-8000-000000000123', 'Need repair', expect.anything(), '');
});

test('a late response after unmount cannot display another account’s requests', async () => {
  let finish: (value: { id: string; description: string; location: string; created_at: string }[]) => void = () => undefined;
  read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const first = await render(<ServiceRequests userId="customer-a" />);
  await first.unmount();
  await render(<ServiceRequests userId="customer-b" />);
  await act(async () => finish([{ id: 'a', description: 'Private A', location: '', created_at: '2026-01-01' }]));
  await waitFor(() => expect(read).toHaveBeenCalledWith('customer-b', expect.anything()));
  expect(screen.queryByText('Private A')).toBeNull();
});

test('a pending request is restored with the same key after restart', async () => {
  const item = { key: '00000000-0000-4000-8000-000000000456', description: 'Pending repair', location: '' };
  jest.mocked(loadPendingRequest).mockResolvedValue(item);
  submit.mockResolvedValue('request-id');
  await render(<ServiceRequests userId="customer-a" />);
  await screen.findByRole('button', { name: 'Retry request' });
  await fireEvent.press(screen.getByRole('button', { name: 'Retry request' }));
  await screen.findByText('Request received. Refresh for its current status.');
  expect(submit).toHaveBeenCalledWith('customer-a', item.key, item.description, expect.anything(), '');
});

test('unreadable pending storage blocks new submissions', async () => {
  jest.mocked(loadPendingRequest).mockRejectedValue(new Error('unavailable'));
  await render(<ServiceRequests userId="customer-a" />);
  await screen.findByText('Could not read the pending request on this device.');
  expect(screen.getByRole('button', { name: 'Submit request' })).toBeDisabled();
  expect(submit).not.toHaveBeenCalled();
});

test('refreshing requests does not cancel restoration of a pending draft', async () => {
  let finish: (item: { key: string; description: string; location: string }) => void = () => undefined;
  jest.mocked(loadPendingRequest).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render(<ServiceRequests userId="customer-a" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh requests' }));
  await act(async () => finish({ key: '00000000-0000-4000-8000-000000000456', description: 'Restored request', location: '' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry request' })).toBeEnabled());
  expect(screen.getByLabelText('Service request').props.value).toBe('Restored request');
});

test('acceptance uses the displayed quote version without claiming payment or booking', async () => {
  read.mockResolvedValue([{ id: 'request-a', description: 'Repair', location: '', created_at: '2026-01-01' }]);
  jest.mocked(readQuotes).mockResolvedValue([{ id: 'quote-a', request_id: 'request-a', version: 2, scope: 'Replace part', amount_minor: 1000, currency: 'VND', expires_at: '2027-01-01T00:00:00Z', basis: 'local_fixture', accepted_at: null, rejected_at: null }]);
  jest.mocked(acceptQuote).mockResolvedValue('quote-a');
  await render(<ServiceRequests userId="customer-a" />);
  await screen.findByText(/Quote 2: Replace part/);
  await fireEvent.press(screen.getByRole('button', { name: 'Accept quote 2' }));
  await screen.findByText('The displayed quote was accepted. Payment is not configured; check assignment separately.');
  expect(acceptQuote).toHaveBeenCalledWith('customer-a', 'quote-a', 2, expect.anything());
});

test('Customer can reject the displayed quote without accepting it', async () => {
  read.mockResolvedValue([{ id: 'request-a', description: 'Repair', location: '', created_at: '2026-01-01' }]);
  jest.mocked(readQuotes).mockResolvedValue([{ id: 'quote-a', request_id: 'request-a', version: 2, scope: 'Replace part', amount_minor: 1000, currency: 'VND', expires_at: '2027-01-01T00:00:00Z', basis: 'local_fixture', accepted_at: null, rejected_at: null }]);
  jest.mocked(rejectQuote).mockResolvedValue('quote-a');
  await render(<ServiceRequests userId="customer-a" />);
  await screen.findByText(/Quote 2: Replace part/);
  await fireEvent.press(screen.getByRole('button', { name: 'Reject quote 2' }));
  await screen.findByText('The displayed quote was rejected.');
  expect(rejectQuote).toHaveBeenCalledWith('customer-a', 'quote-a', 2, expect.anything());
  expect(acceptQuote).not.toHaveBeenCalled();
});

test('unreadable pending storage can be re-read and restores the saved key', async () => {
  const item = { key: '00000000-0000-4000-8000-000000000456', description: 'Pending repair', location: '' };
  jest.mocked(loadPendingRequest).mockRejectedValueOnce(new Error('locked')).mockResolvedValue(item);
  await render(<ServiceRequests userId="customer-a" />);
  await screen.findByText('Could not read the pending request on this device.');
  await fireEvent.press(screen.getByRole('button', { name: 'Retry reading saved draft' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry request' })).toBeEnabled());
  expect(screen.getByLabelText('Service request').props.value).toBe('Pending repair');
  expect(submit).not.toHaveBeenCalled();
});

test('a fixture quote is labelled as a test quote and can still be decided', async () => {
  read.mockResolvedValue([{ id: 'request-a', description: 'Repair', location: '', created_at: '2026-01-01' }]);
  jest.mocked(readQuotes).mockResolvedValue([{ id: 'quote-a', request_id: 'request-a', version: 2, scope: 'Replace part', amount_minor: 1000, currency: 'VND', expires_at: '2027-01-01T00:00:00Z', basis: 'local_fixture', accepted_at: null, rejected_at: null }]);
  await render(<ServiceRequests userId="customer-a" />);
  await screen.findByText('Test quote — not a real price or commitment.');
  expect(screen.getByRole('button', { name: 'Accept quote 2' })).toBeEnabled();
});

test('a quote with an unrecognized source cannot be accepted but can be rejected', async () => {
  read.mockResolvedValue([{ id: 'request-a', description: 'Repair', location: '', created_at: '2026-01-01' }]);
  jest.mocked(readQuotes).mockResolvedValue([{ id: 'quote-a', request_id: 'request-a', version: 2, scope: 'Replace part', amount_minor: 1000, currency: 'VND', expires_at: '2027-01-01T00:00:00Z', basis: 'pricing_engine', accepted_at: null, rejected_at: null }]);
  await render(<ServiceRequests userId="customer-a" />);
  await screen.findByText('This quote has an unrecognized source and cannot be accepted here.');
  expect(screen.queryByText('Test quote — not a real price or commitment.')).toBeNull();
  expect(screen.getByRole('button', { name: 'Accept quote 2' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Reject quote 2' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Accept quote 2' }));
  expect(acceptQuote).not.toHaveBeenCalled();
});

test('a location entered with the request is submitted with it', async () => {
  submit.mockResolvedValue('request-id');
  await render(<ServiceRequests userId="customer-a" />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit request' })).toBeEnabled());
  await fireEvent.changeText(screen.getByLabelText('Service request'), 'Need repair');
  await fireEvent.changeText(screen.getByLabelText('Service location'), '  12 Nguyen Hue  ');
  await fireEvent.press(screen.getByRole('button', { name: 'Submit request' }));
  await screen.findByText('Request received. Refresh for its current status.');
  expect(submit).toHaveBeenCalledWith('customer-a', '00000000-0000-4000-8000-000000000123', 'Need repair', expect.anything(), '12 Nguyen Hue');
});

async function startRequestWithPhotos(assets: { uri: string; mimeType: string }[]) {
  submit.mockResolvedValue('request-id');
  mockPick.mockResolvedValue({ canceled: false, assets });
  await render(<ServiceRequests userId="customer-a" />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit request' })).toBeEnabled());
  await fireEvent.changeText(screen.getByLabelText('Service request'), 'Need repair');
  await fireEvent.press(screen.getByRole('button', { name: 'Add photos' }));
}

test('chosen photos are uploaded to the request that was created', async () => {
  jest.mocked(uploadRequestPhoto).mockResolvedValue(undefined);
  await startRequestWithPhotos([{ uri: 'file:///a.jpg', mimeType: 'image/jpeg' }, { uri: 'file:///b.png', mimeType: 'image/png' }]);
  expect(screen.getByRole('button', { name: 'Add photos (2/6)' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Submit request' }));
  await screen.findByText('Request received. Refresh for its current status.');
  expect(uploadRequestPhoto).toHaveBeenCalledTimes(2);
  expect(uploadRequestPhoto).toHaveBeenCalledWith('customer-a', 'request-id', { name: '00000000-0000-4000-8000-000000000123.jpg', uri: 'file:///a.jpg', mimeType: 'image/jpeg' }, expect.anything());
  expect(mockStore.size).toBe(0);
});

test('a photo that fails to upload stays queued and can be retried', async () => {
  jest.mocked(uploadRequestPhoto).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
  await startRequestWithPhotos([{ uri: 'file:///a.jpg', mimeType: 'image/jpeg' }, { uri: 'file:///b.png', mimeType: 'image/png' }]);
  await fireEvent.press(screen.getByRole('button', { name: 'Submit request' }));
  await screen.findByText('Request received. 1 photo(s) are waiting to upload. Retry from this screen.');
  expect(JSON.parse(mockStore.get('nestscout.pending-photos.customer-a') ?? '[]')).toHaveLength(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Retry photo uploads (1)' }));
  await screen.findByText('Waiting photos were uploaded.');
  expect(screen.queryByRole('button', { name: /Retry photo uploads/ })).toBeNull();
  expect(mockStore.size).toBe(0);
});

test('photos left from an earlier session are uploaded when the screen opens', async () => {
  mockStore.set('nestscout.pending-photos.customer-a', JSON.stringify([{ requestId: 'old-request', name: '00000000-0000-4000-8000-000000000777.jpg', uri: 'file:///old.jpg', mimeType: 'image/jpeg', attempts: 1 }]));
  jest.mocked(uploadRequestPhoto).mockResolvedValue(undefined);
  await render(<ServiceRequests userId="customer-a" />);
  await screen.findByText('Waiting photos were uploaded.');
  expect(uploadRequestPhoto).toHaveBeenCalledWith('customer-a', 'old-request', { name: '00000000-0000-4000-8000-000000000777.jpg', uri: 'file:///old.jpg', mimeType: 'image/jpeg' }, expect.anything());
  expect(mockStore.size).toBe(0);
});

test('an unreadable photo queue is offered for discard', async () => {
  mockStore.set('nestscout.pending-photos.customer-a', 'not json');
  await render(<ServiceRequests userId="customer-a" />);
  await screen.findByText('Could not read the pending photos on this device.');
  expect(uploadRequestPhoto).not.toHaveBeenCalled();
});

test('photos of an unsupported type are not attached', async () => {
  await startRequestWithPhotos([{ uri: 'file:///a.gif', mimeType: 'image/gif' }]);
  expect(await screen.findByText('Only JPEG, PNG and WebP photos can be attached.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add photos' })).toBeTruthy();
});

test('cleared photos are not uploaded', async () => {
  await startRequestWithPhotos([{ uri: 'file:///a.jpg', mimeType: 'image/jpeg' }]);
  await fireEvent.press(screen.getByRole('button', { name: 'Clear photos' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Submit request' }));
  await screen.findByText('Request received. Refresh for its current status.');
  expect(uploadRequestPhoto).not.toHaveBeenCalled();
});
