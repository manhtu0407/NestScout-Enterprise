import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { WorkflowError, readOperatorCases, resolveOperatorCase, reviewOperatorCase, type OperatorCase } from '@/features/shared';

import { OperatorEscalationsScreen, OperatorEscalationsSection } from './operator-escalations-screen';

jest.mock('@/features/access', () => ({ ...jest.requireActual('@/features/access'), useAccess: () => ({ identity: 'verified', userId: 'operator-1', phase: 'client' }) }));
jest.mock('expo-crypto', () => {
  let issued = 0;
  return { randomUUID: jest.fn(() => `00000000-0000-4000-8000-${String(++issued).padStart(12, '0')}`) };
});
jest.mock('@/features/shared', () => ({
  ...jest.requireActual('@/features/shared'),
  readOperatorCases: jest.fn(),
  reviewOperatorCase: jest.fn(),
  resolveOperatorCase: jest.fn(),
}));

const activate = { nativeEvent: { actionName: 'activate' } };
const now = new Date('2026-11-13T10:00:00.000Z');

function openCase(overrides: Partial<OperatorCase> = {}): OperatorCase {
  return {
    escalationId: 'e1', requestId: 'r1', jobId: 'j1', status: 'open', note: null, createdAt: '2026-11-13T09:00:00.000Z', reviewedAt: null,
    description: 'Chập điện phòng khách', location: 'Quận 7', workerName: 'Thợ một', jobStage: 'arrived', ...overrides,
  };
}

const reviewing = openCase({ status: 'reviewing', reviewedAt: '2026-11-13T09:30:00.000Z' });

function screenFor(cases: readonly OperatorCase[], handlers: Partial<{ onReview: jest.Mock; onResolve: jest.Mock; onRefresh: jest.Mock }> = {}, state: { loaded?: boolean; failure?: string | null } = {}) {
  return <OperatorEscalationsScreen
    cases={cases} loaded={state.loaded ?? true} failure={state.failure ?? null} now={now} onBack={() => undefined}
    onRefresh={handlers.onRefresh ?? jest.fn()} onReview={handlers.onReview ?? jest.fn().mockResolvedValue(undefined)} onResolve={handlers.onResolve ?? jest.fn().mockResolvedValue(undefined)}
  />;
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('an empty queue says nothing is waiting', async () => {
  await render(screenFor([]));
  expect(screen.getByText('Không có sự cố nào đang chờ')).toBeTruthy();
});

test('a queue that has not loaded yet says it is loading', async () => {
  await render(screenFor([], {}, { loaded: false }));
  expect(screen.getByText('Đang tải')).toBeTruthy();
});

test('a failed queue read explains the failure and offers a reload', async () => {
  const onRefresh = jest.fn();
  await render(screenFor([], { onRefresh }, { failure: 'Thao tác này không khả dụng cho tài khoản hoặc mục này.' }));
  expect(screen.getByText('Không mở được hàng đợi')).toBeTruthy();
  expect(screen.getByText('Thao tác này không khả dụng cho tài khoản hoặc mục này.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Tải lại'));
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

test('an open case shows the report, the worker and the place, and only offers to take it into review', async () => {
  const onReview = jest.fn().mockResolvedValue(undefined);
  await render(screenFor([openCase({ note: 'Thợ đến nhưng đứng ngoài cổng' })], { onReview }));
  expect(screen.getByText('Chập điện phòng khách')).toBeTruthy();
  expect(screen.getByText('Chờ xem xét')).toBeTruthy();
  expect(screen.getByText(/Thợ đến nhưng đứng ngoài cổng/)).toBeTruthy();
  expect(screen.getByText('Thợ một')).toBeTruthy();
  expect(screen.getByText('Đã đến nơi')).toBeTruthy();
  expect(screen.getByText('Quận 7')).toBeTruthy();
  expect(screen.queryByLabelText('Cho thợ tiếp tục Chập điện phòng khách')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Nhận xem xét sự cố Chập điện phòng khách'));
  await waitFor(() => expect(onReview).toHaveBeenCalledWith(expect.objectContaining({ escalationId: 'e1' })));
});

test('a case in review resolves with the note the operator wrote', async () => {
  const onResolve = jest.fn().mockResolvedValue(undefined);
  await render(screenFor([reviewing], { onResolve }));
  expect(screen.getByText('Đang xem xét')).toBeTruthy();
  expect(screen.queryByLabelText('Nhận xem xét sự cố Chập điện phòng khách')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Ghi chú gửi khách và thợ cho Chập điện phòng khách'), 'Thợ sẽ bắt đầu ngay');
  await fireEvent.press(screen.getByLabelText('Cho thợ tiếp tục Chập điện phòng khách'));
  await waitFor(() => expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({ escalationId: 'e1' }), 'proceed', 'Thợ sẽ bắt đầu ngay'));
});

test('closing a case without action resolves it as dismissed', async () => {
  const onResolve = jest.fn().mockResolvedValue(undefined);
  await render(screenFor([reviewing], { onResolve }));
  await fireEvent.press(screen.getByLabelText('Đóng sự cố Chập điện phòng khách'));
  await waitFor(() => expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({ escalationId: 'e1' }), 'dismiss', ''));
});

test('replacing the worker needs a deliberate slide and can be backed out of', async () => {
  const onResolve = jest.fn().mockResolvedValue(undefined);
  await render(screenFor([reviewing], { onResolve }));
  await fireEvent.press(screen.getByLabelText('Đổi thợ khác Chập điện phòng khách'));
  expect(onResolve).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('Chưa đổi thợ'));
  expect(screen.getByLabelText('Đổi thợ khác Chập điện phòng khách')).toBeTruthy();
  expect(onResolve).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('Đổi thợ khác Chập điện phòng khách'));
  await fireEvent(screen.getByLabelText('Xác nhận đổi thợ cho Chập điện phòng khách'), 'accessibilityAction', activate);
  await waitFor(() => expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({ escalationId: 'e1' }), 'replace_worker', ''));
});

test('a refused action shows a plain message and leaves the case actionable', async () => {
  const onResolve = jest.fn().mockRejectedValue(new WorkflowError('rejected'));
  await render(screenFor([reviewing], { onResolve }));
  await fireEvent.press(screen.getByLabelText('Cho thợ tiếp tục Chập điện phòng khách'));
  expect(await screen.findByText('Bước này không còn khả dụng. Đã tải lại trạng thái mới nhất.')).toBeTruthy();
  expect(screen.getByLabelText('Cho thợ tiếp tục Chập điện phòng khách')).toBeTruthy();
});

test('the section loads the queue for the signed in operator and reuses one key for a retried decision', async () => {
  jest.mocked(readOperatorCases).mockResolvedValue([reviewing]);
  jest.mocked(resolveOperatorCase).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined);
  await render(<OperatorEscalationsSection onBack={() => undefined} />);
  expect(await screen.findByText('Chập điện phòng khách')).toBeTruthy();
  expect(readOperatorCases).toHaveBeenCalledWith('operator-1', expect.any(AbortSignal));
  await fireEvent.press(screen.getByLabelText('Cho thợ tiếp tục Chập điện phòng khách'));
  expect(await screen.findByText(/Chưa xác định được kết quả/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Cho thợ tiếp tục Chập điện phòng khách'));
  await waitFor(() => expect(resolveOperatorCase).toHaveBeenCalledTimes(2));
  const keys = jest.mocked(resolveOperatorCase).mock.calls.map(call => call[4]);
  expect(keys[0]).toMatch(/^00000000-0000-4000-8000-\d{12}$/);
  expect(keys[0]).toBe(keys[1]);
  expect(jest.mocked(resolveOperatorCase).mock.calls[0]?.slice(0, 4)).toEqual(['operator-1', 'e1', 'proceed', '']);
});

test('the section takes a case into review and reloads the queue', async () => {
  jest.mocked(readOperatorCases).mockResolvedValueOnce([openCase()]).mockResolvedValueOnce([reviewing]);
  jest.mocked(reviewOperatorCase).mockResolvedValue(undefined);
  await render(<OperatorEscalationsSection onBack={() => undefined} />);
  await fireEvent.press(await screen.findByLabelText('Nhận xem xét sự cố Chập điện phòng khách'));
  await waitFor(() => expect(reviewOperatorCase).toHaveBeenCalledWith('operator-1', 'e1', expect.stringMatching(/^00000000-0000-4000-8000-\d{12}$/), expect.any(AbortSignal)));
  expect(await screen.findByText('Đang xem xét')).toBeTruthy();
  expect(readOperatorCases).toHaveBeenCalledTimes(2);
});

test('an account that is not an operator sees the refusal and no cases', async () => {
  jest.mocked(readOperatorCases).mockRejectedValue(new WorkflowError('forbidden'));
  await render(<OperatorEscalationsSection onBack={() => undefined} />);
  expect(await screen.findByText('Không mở được hàng đợi')).toBeTruthy();
  expect(screen.getByText('Thao tác này không khả dụng cho tài khoản hoặc mục này.')).toBeTruthy();
  expect(screen.queryByText('Chập điện phòng khách')).toBeNull();
});
