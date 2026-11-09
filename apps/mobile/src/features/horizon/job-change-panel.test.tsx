import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { JobChange } from '@/features/shared';

import { JobChangePanel, type JobChangesApi } from './job-change-panel';

const base: JobChange = { id: 'c1', jobId: 'j1', requestedBy: 'me', kind: 'reschedule', proposedFor: '2026-12-01T09:00:00Z', reason: 'Bận', status: 'pending', createdAt: '2026-11-09T10:00:00Z' };
const now = () => new Date(2026, 10, 9, 10, 0);

function apiWith(changes: JobChange[]): jest.Mocked<JobChangesApi> {
  return { read: jest.fn().mockResolvedValue(changes), request: jest.fn().mockResolvedValue('c2'), decide: jest.fn().mockResolvedValue(undefined) };
}

test('offers to file a cancel request and sends it with the reason', async () => {
  const api = apiWith([]);
  await render(<JobChangePanel jobId="j1" userId="me" api={api} now={now} />);
  await fireEvent.press(await screen.findByLabelText('Đề nghị huỷ việc'));
  await fireEvent.changeText(screen.getByLabelText('Lý do'), ' Đổi kế hoạch ');
  await fireEvent.press(screen.getByLabelText('Gửi đề nghị'));
  await waitFor(() => expect(api.request).toHaveBeenCalledWith('j1', 'cancel', null, 'Đổi kế hoạch'));
});

test('refuses a reschedule without a valid future time and does not call the server', async () => {
  const api = apiWith([]);
  await render(<JobChangePanel jobId="j1" userId="me" api={api} now={now} />);
  await fireEvent.press(await screen.findByLabelText('Đề nghị đổi lịch'));
  await fireEvent.changeText(screen.getByLabelText('Thời gian mới'), '01/01/2020 09:00');
  await fireEvent.press(screen.getByLabelText('Gửi đề nghị'));
  expect(await screen.findByText(/ngày\/tháng\/năm giờ:phút/)).toBeTruthy();
  expect(api.request).not.toHaveBeenCalled();
});

test('lets the requester withdraw and the other party agree', async () => {
  const mine = apiWith([base]);
  const first = await render(<JobChangePanel jobId="j1" userId="me" api={mine} now={now} />);
  await fireEvent.press(await screen.findByLabelText('Rút lại đề nghị'));
  await waitFor(() => expect(mine.decide).toHaveBeenCalledWith('c1', 'withdrawn'));
  await waitFor(() => expect(mine.read).toHaveBeenCalledTimes(2));
  await first.unmount();

  const theirs = apiWith([{ ...base, requestedBy: 'other' }]);
  await render(<JobChangePanel jobId="j1" userId="me" api={theirs} now={now} />);
  await fireEvent.press(await screen.findByLabelText('Đồng ý đề nghị'));
  await waitFor(() => expect(theirs.decide).toHaveBeenCalledWith('c1', 'agreed'));
  await waitFor(() => expect(theirs.read).toHaveBeenCalledTimes(2));
});

test('states plainly that an agreed change does not move the job by itself', async () => {
  await render(<JobChangePanel jobId="j1" userId="me" api={apiWith([{ ...base, status: 'agreed' }])} now={now} />);
  await screen.findByText(/Đã được đồng ý/);
  expect(await screen.findByText(/chưa tự đổi lịch, đóng việc hay hoàn tiền/)).toBeTruthy();
});
