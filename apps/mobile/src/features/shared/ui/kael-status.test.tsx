import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { authenticatedRequest } from '@/lib/authenticated-rest';

import { KaelStatus } from './kael-status';

jest.mock('@/lib/authenticated-rest', () => ({ authenticatedRequest: jest.fn() }));

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

test('only the exact authorized response maps to a deterministic status', async () => {
  jest.mocked(authenticatedRequest).mockResolvedValue({ ok: true, json: async () => ({
    status: 'ok', kind: 'customer_request', resource_id: 'request-a', state: 'request_received',
  }) } as Response);
  await render(<KaelStatus userId="customer-a" resourceId="request-a" kind="customer_request" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Kael: check status' }));
  await screen.findByText('Your request was received. Review its current details above.');
  expect(authenticatedRequest).toHaveBeenCalledWith('customer-a', 'rpc/kael_read_context', expect.objectContaining({
    body: JSON.stringify({ p_kind: 'customer_request', p_resource_id: 'request-a' }),
  }));
});

test('a forged resource or unlisted state is not displayed', async () => {
  jest.mocked(authenticatedRequest).mockResolvedValue({ ok: true, json: async () => ({
    status: 'ok', kind: 'customer_request', resource_id: 'other', state: 'paid',
  }) } as Response);
  await render(<KaelStatus userId="customer-a" resourceId="request-a" kind="customer_request" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Kael: check status' }));
  await screen.findByText('Status assistance is unavailable. Continue using the manual controls.');
  expect(screen.queryByText(/paid/i)).toBeNull();
});

test('a stalled tool times out and leaves manual controls available', async () => {
  jest.useFakeTimers();
  jest.mocked(authenticatedRequest).mockImplementation(() => new Promise(() => undefined));
  await render(<KaelStatus userId="customer-a" resourceId="request-a" kind="customer_request" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Kael: check status' }));
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(screen.getByText('Status assistance is unavailable. Continue using the manual controls.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Kael: check status' })).toBeEnabled();
});
