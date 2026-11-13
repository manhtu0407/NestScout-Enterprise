import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  readAccountPhone, readCustomerActivity, readCustomerProfile, readCustomerSettings, readDispatchSummaries, readJobWorkerCards, readNotifications, readPinnedRequestIds,
  readQuotes, readRequestPhotos, readRequests, readSavedWorkers, type DispatchSummary,
} from '@/features/shared';

import { useCustomerData } from './use-customer-data';

jest.mock('@/features/shared', () => ({
  ...jest.requireActual('@/features/shared'),
  readRequests: jest.fn(),
  readQuotes: jest.fn(),
  readCustomerActivity: jest.fn(),
  readPinnedRequestIds: jest.fn(),
  readNotifications: jest.fn(),
  readCustomerProfile: jest.fn(),
  readSavedWorkers: jest.fn(),
  readCustomerSettings: jest.fn(),
  readAccountPhone: jest.fn(),
  readJobWorkerCards: jest.fn(),
  readRequestPhotos: jest.fn(),
  readDispatchSummaries: jest.fn(),
}));

const start = new Date('2026-11-13T10:00:00.000Z');

function summary(overrides: Partial<DispatchSummary> = {}): DispatchSummary {
  return {
    requestId: 'r1', state: 'recovering', openInvites: 0, earliestExpiry: null, rounds: 1, canRetry: false, canCancel: true, canReclassify: false,
    nextRetryAt: null, retriesLeft: 2, lastOutcome: null, canReassign: false, reassignAt: null, jobStage: null, canEscalate: false, escalateAt: null,
    escalatedAt: null, escalationStatus: null, escalationResolution: null, ...overrides,
  } as DispatchSummary;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(start);
  jest.mocked(readRequests).mockResolvedValue([{ id: 'r1' }] as never);
  jest.mocked(readQuotes).mockResolvedValue([] as never);
  jest.mocked(readCustomerActivity).mockResolvedValue({ jobs: [], submissions: [], cases: [], changes: [], reports: [], pauses: [] } as never);
  jest.mocked(readPinnedRequestIds).mockResolvedValue([] as never);
  jest.mocked(readNotifications).mockResolvedValue([] as never);
  jest.mocked(readCustomerProfile).mockResolvedValue(null as never);
  jest.mocked(readSavedWorkers).mockResolvedValue([] as never);
  jest.mocked(readCustomerSettings).mockResolvedValue(null as never);
  jest.mocked(readAccountPhone).mockResolvedValue('' as never);
  jest.mocked(readJobWorkerCards).mockResolvedValue([] as never);
  jest.mocked(readRequestPhotos).mockResolvedValue(new Map() as never);
});

afterEach(() => {
  jest.useRealTimers();
});

test('the dispatch summary is read again once a retry deadline passes so the control can open', async () => {
  jest.mocked(readDispatchSummaries)
    .mockResolvedValueOnce([summary({ nextRetryAt: '2026-11-13T10:05:00.000Z' })])
    .mockResolvedValue([summary({ canRetry: true })]);
  const { result } = await renderHook(() => useCustomerData('customer-1'));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.data.dispatch.get('r1')?.canRetry).toBe(false);
  expect(readDispatchSummaries).toHaveBeenCalledTimes(1);
  await act(async () => { await jest.advanceTimersByTimeAsync(4 * 60 * 1000); });
  expect(readDispatchSummaries).toHaveBeenCalledTimes(1);
  await act(async () => { await jest.advanceTimersByTimeAsync(61 * 1000); });
  await waitFor(() => expect(result.current.data.dispatch.get('r1')?.canRetry).toBe(true));
  expect(readDispatchSummaries).toHaveBeenCalledTimes(2);
});

test('a deadline already in the past schedules no refresh', async () => {
  jest.mocked(readDispatchSummaries).mockResolvedValue([summary({ nextRetryAt: '2026-11-13T09:00:00.000Z' })]);
  const { result } = await renderHook(() => useCustomerData('customer-1'));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  await act(async () => { await jest.advanceTimersByTimeAsync(10 * 60 * 1000); });
  expect(readDispatchSummaries).toHaveBeenCalledTimes(1);
});
