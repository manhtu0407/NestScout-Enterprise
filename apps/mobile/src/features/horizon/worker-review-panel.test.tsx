import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { WorkerReviewPanel, type RequestWorker } from './worker-review-panel';

const worker: RequestWorker = { jobId: 'j1', profileId: 'p1', name: 'Thợ Minh', saved: false, rating: null };

type Overrides = Partial<{ worker: RequestWorker; finished: boolean; onToggleSave: jest.Mock; onReview: jest.Mock }>;

async function setup(overrides: Overrides = {}) {
  const props = { worker, finished: true, onToggleSave: jest.fn().mockResolvedValue(undefined), onReview: jest.fn().mockResolvedValue(undefined), ...overrides };
  await render(<WorkerReviewPanel {...props} />);
  return props;
}

test('the worker name and a save action are offered', async () => {
  const props = await setup();
  expect(screen.getByText('Thợ Minh')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Lưu Thợ Minh' }));
  expect(props.onToggleSave).toHaveBeenCalledWith(worker);
});

test('a saved worker offers to unsave', async () => {
  await setup({ worker: { ...worker, saved: true } });
  expect(screen.getByRole('button', { name: 'Bỏ lưu Thợ Minh' })).toBeTruthy();
  expect(screen.getByText('Đã lưu')).toBeTruthy();
});

test('a failed save says so and can be retried', async () => {
  const onToggleSave = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  await setup({ onToggleSave });
  await fireEvent.press(screen.getByRole('button', { name: 'Lưu Thợ Minh' }));
  expect(await screen.findByText('Chưa lưu được thợ. Kiểm tra kết nối rồi thử lại.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Lưu Thợ Minh' }));
  await waitFor(() => expect(screen.queryByText('Chưa lưu được thợ. Kiểm tra kết nối rồi thử lại.')).toBeNull());
});

test('a job that is not finished cannot be reviewed', async () => {
  await setup({ finished: false });
  expect(screen.queryByRole('button', { name: 'Đánh giá Thợ Minh' })).toBeNull();
});

test('a review needs a rating and sends stars, tags and text', async () => {
  const props = await setup();
  await fireEvent.press(screen.getByRole('button', { name: 'Đánh giá Thợ Minh' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Gửi đánh giá' }));
  expect(props.onReview).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('radio', { name: '4 sao' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Đúng giờ' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Gọn gàng' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Gọn gàng' }));
  await fireEvent.changeText(screen.getByLabelText('Nhận xét về thợ'), '  Làm rất tốt  ');
  await fireEvent.press(screen.getByRole('button', { name: 'Gửi đánh giá' }));
  await waitFor(() => expect(props.onReview).toHaveBeenCalledWith(worker, { rating: 4, body: 'Làm rất tốt', tags: ['Đúng giờ'] }));
});

test('a failed review keeps the form and reports the failure', async () => {
  const onReview = jest.fn().mockRejectedValue(new Error('offline'));
  await setup({ onReview });
  await fireEvent.press(screen.getByRole('button', { name: 'Đánh giá Thợ Minh' }));
  await fireEvent.press(screen.getByRole('radio', { name: '5 sao' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Gửi đánh giá' }));
  expect(await screen.findByText('Chưa gửi được đánh giá. Kiểm tra kết nối rồi thử lại.')).toBeTruthy();
  expect(screen.getByLabelText('Nhận xét về thợ')).toBeTruthy();
});

test('a reviewed job shows the rating and no review form', async () => {
  await setup({ worker: { ...worker, rating: 4 } });
  expect(screen.getByLabelText('Bạn đã đánh giá 4 sao')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Đánh giá Thợ Minh' })).toBeNull();
});
