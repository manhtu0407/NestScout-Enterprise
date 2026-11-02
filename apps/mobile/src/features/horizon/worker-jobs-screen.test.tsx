import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { sampleWorkerJobs, workerJobStageForSidebarId, workerJobStages, workerSidebarBadges } from './worker-jobs';
import { WorkerJobsScreen } from './worker-jobs-screen';

const offerJob = 'Sửa vòi nước bồn rửa';
const assignedJob = 'Sửa ống thoát nước nhà tắm';
const activeJob = 'Thay ổ khoá cửa chính';
const pausedJob = 'Sơn lại tường phòng ngủ';
const correctionJob = 'Máy lạnh không mát';

test('every worker sidebar entry in the work group opens its own stage', () => {
  expect(workerJobStageForSidebarId('worker-offers')).toBe('offer');
  expect(workerJobStageForSidebarId('worker-assigned')).toBe('assigned');
  expect(workerJobStageForSidebarId('worker-active')).toBe('active');
  expect(workerJobStageForSidebarId('worker-review')).toBe('review');
  expect(workerJobStageForSidebarId('worker-history')).toBe('done');
  expect(workerJobStageForSidebarId('worker-quotes')).toBeNull();
  expect(workerJobStageForSidebarId('worker-earnings')).toBeNull();
});

test('sidebar badges follow the sample jobs that need the worker to act', () => {
  expect(workerSidebarBadges['worker-offers']).toBe(sampleWorkerJobs.filter(job => job.stage === 'offer').length);
  expect(workerSidebarBadges['worker-assigned']).toBe(sampleWorkerJobs.filter(job => job.stage === 'assigned').length);
  expect(workerSidebarBadges['worker-review']).toBe(1);
});

test('the tabs show the number of sample jobs per stage and open on the requested one', async () => {
  await render(<WorkerJobsScreen initialStage="assigned" jobs={sampleWorkerJobs} onBack={jest.fn()} />);
  for (const info of workerJobStages) {
    const count = sampleWorkerJobs.filter(job => job.stage === info.stage).length;
    expect(screen.getByLabelText(`${info.label}, ${count}`)).toBeTruthy();
  }
  expect(screen.getByLabelText('Đã nhận, 2').props.accessibilityState.selected).toBe(true);
  expect(screen.getByText('Bước 2/3 · Đang đến')).toBeTruthy();
});

test('a stage without jobs says so instead of showing an empty list', async () => {
  await render(<WorkerJobsScreen initialStage="offer" jobs={[]} onBack={jest.fn()} />);
  expect(screen.getByText('Chưa có lời mời nhận việc')).toBeTruthy();
});

test('an invitation shows the price the customer already accepted and offers no way to quote', async () => {
  await render(<WorkerJobsScreen initialStage="offer" jobs={sampleWorkerJobs} onBack={jest.fn()} />);
  expect(screen.getAllByText('Giá khách đã chấp nhận')).toHaveLength(5);
  expect(screen.queryByLabelText(/báo giá/i)).toBeNull();
  expect(screen.queryByPlaceholderText(/giá/i)).toBeNull();
});

test('accepting an invitation moves it to the assigned stage at its first step', async () => {
  await render(<WorkerJobsScreen initialStage="offer" jobs={sampleWorkerJobs} onBack={jest.fn()} />);
  await fireEvent(screen.getByLabelText(`Nhận việc ${offerJob}`), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  await waitFor(() => expect(screen.getByText('Đã nhận việc. Xem trong mục Đã nhận.')).toBeTruthy());
  expect(screen.getByLabelText('Việc mới, 4')).toBeTruthy();
  expect(screen.getByLabelText('Đã nhận, 3')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Đã nhận, 3'));
  expect(screen.getByLabelText(`Đang đến, ${offerJob}`)).toBeTruthy();
});

test('declining an invitation removes it from the list', async () => {
  await render(<WorkerJobsScreen initialStage="offer" jobs={sampleWorkerJobs} onBack={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText(`Từ chối ${offerJob}`));
  expect(screen.queryByText(offerJob)).toBeNull();
  expect(screen.getByLabelText('Việc mới, 4')).toBeTruthy();
  expect(screen.getByText('Đã từ chối lời mời này.')).toBeTruthy();
});

test('an assigned job goes through the journey and then starts work', async () => {
  await render(<WorkerJobsScreen initialStage="assigned" jobs={sampleWorkerJobs} onBack={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText(`Đã đến nơi, ${assignedJob}`));
  expect(screen.getByText('Đã cập nhật: Đã đến nơi.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText(`Bắt đầu làm, ${assignedJob}`));
  expect(screen.getByLabelText('Đã nhận, 1')).toBeTruthy();
  expect(screen.getByLabelText('Đang làm, 3')).toBeTruthy();
});

test('reporting a delay is recorded once and promises no fee or schedule change', async () => {
  await render(<WorkerJobsScreen initialStage="assigned" jobs={sampleWorkerJobs} onBack={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText(`Báo chậm ${assignedJob}`));
  expect(screen.getByText('Đã ghi nhận báo chậm. Không có khoản phí hay thay đổi lịch tự động.')).toBeTruthy();
  expect(screen.getByLabelText(`Báo chậm ${assignedJob}`).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByText('Đã báo chậm')).toBeTruthy();
});

test('pausing needs the customer to agree before work continues', async () => {
  await render(<WorkerJobsScreen initialStage="active" jobs={sampleWorkerJobs} onBack={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText(`Tạm dừng ${activeJob}`));
  expect(screen.getByLabelText(`Xin làm tiếp ${activeJob}`)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText(`Xin làm tiếp ${activeJob}`));
  expect(screen.getByText('Đã gửi yêu cầu làm tiếp. Chờ khách đồng ý.')).toBeTruthy();
  expect(screen.getByLabelText(`Chờ khách đồng ý làm tiếp ${activeJob}`).props.accessibilityState.disabled).toBe(true);
});

test('a paused job cannot be submitted until work resumes', async () => {
  await render(<WorkerJobsScreen initialStage="active" jobs={sampleWorkerJobs} onBack={jest.fn()} />);
  expect(screen.getByText('Việc đang tạm dừng. Cần khách đồng ý thì mới làm tiếp.')).toBeTruthy();
  expect(screen.queryByLabelText(`Nộp kết quả ${pausedJob}`)).toBeNull();
  expect(screen.getByLabelText(`Xin làm tiếp ${pausedJob}`)).toBeTruthy();
});

test('submitting the work moves it to review and waits for the customer', async () => {
  await render(<WorkerJobsScreen initialStage="active" jobs={sampleWorkerJobs} onBack={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText(`Nộp kết quả ${activeJob}`));
  expect(screen.getByLabelText('Đang làm, 1')).toBeTruthy();
  expect(screen.getByLabelText('Chờ duyệt, 3')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Chờ duyệt, 3'));
  expect(screen.getByText(activeJob)).toBeTruthy();
});

test('a correction request shows the customer note and can be resubmitted', async () => {
  await render(<WorkerJobsScreen initialStage="review" jobs={sampleWorkerJobs} onBack={jest.fn()} />);
  expect(screen.getByText(/Khách nhờ chụp thêm ảnh dàn lạnh/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText(`Nộp lại ${correctionJob}`));
  expect(screen.getByText('Đã nộp lại kết quả. Chờ khách duyệt.')).toBeTruthy();
  expect(screen.queryByText(/Khách nhờ chụp thêm ảnh dàn lạnh/)).toBeNull();
  expect(screen.queryByLabelText(`Nộp lại ${correctionJob}`)).toBeNull();
});

test('finished work states that no real payment exists yet', async () => {
  await render(<WorkerJobsScreen initialStage="done" jobs={sampleWorkerJobs} onBack={jest.fn()} />);
  expect(screen.getAllByText('Thanh toán chưa được kết nối nên chưa có khoản thu thật.')).toHaveLength(3);
});

test('back and ask-Kael actions are forwarded to the host screen', async () => {
  const onBack = jest.fn();
  const onAskKael = jest.fn();
  await render(<WorkerJobsScreen initialStage="review" jobs={sampleWorkerJobs} onBack={onBack} onAskKael={onAskKael} />);
  await fireEvent.press(screen.getByLabelText('Quay về'));
  expect(onBack).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByLabelText(`Hỏi Kael về ${correctionJob}`));
  expect(onAskKael).toHaveBeenCalledTimes(1);
});
