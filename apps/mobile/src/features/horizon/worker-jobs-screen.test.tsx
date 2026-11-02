import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { WorkflowError } from '@/features/shared';

import { SampleWorkerJobsScreen } from './sample-worker-jobs-screen';
import { sampleWorkerBadges, sampleWorkerJobs, workerBadgesFor, workerJobStageForSidebarId, workerJobStages, type WorkerPerform } from './worker-jobs';
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
  expect(sampleWorkerBadges['worker-offers']).toBe(sampleWorkerJobs.filter(job => job.stage === 'offer').length);
  expect(sampleWorkerBadges['worker-assigned']).toBe(sampleWorkerJobs.filter(job => job.stage === 'assigned').length);
  expect(sampleWorkerBadges['worker-review']).toBe(1);
});

test('the tabs show the number of sample jobs per stage and open on the requested one', async () => {
  await render(<SampleWorkerJobsScreen initialStage="assigned" onBack={jest.fn()} />);
  for (const info of workerJobStages) {
    const count = sampleWorkerJobs.filter(job => job.stage === info.stage).length;
    expect(screen.getByLabelText(`${info.label}, ${count}`)).toBeTruthy();
  }
  expect(screen.getByLabelText('Đã nhận, 2').props.accessibilityState.selected).toBe(true);
  expect(screen.getByText('Bước 2/3 · Đang đến')).toBeTruthy();
});

test('a stage without jobs says so instead of showing an empty list', async () => {
  await render(<WorkerJobsScreen initialStage="offer" jobs={[]} perform={jest.fn()} onBack={jest.fn()} />);
  expect(screen.getByText('Chưa có lời mời nhận việc')).toBeTruthy();
});

test('an invitation shows the price the customer already accepted and offers no way to quote', async () => {
  await render(<SampleWorkerJobsScreen initialStage="offer" onBack={jest.fn()} />);
  expect(screen.getAllByText('Giá khách đã chấp nhận')).toHaveLength(5);
  expect(screen.queryByLabelText(/báo giá/i)).toBeNull();
  expect(screen.queryByPlaceholderText(/giá/i)).toBeNull();
});

test('accepting an invitation moves it to the assigned stage at its first step', async () => {
  await render(<SampleWorkerJobsScreen initialStage="offer" onBack={jest.fn()} />);
  await fireEvent(screen.getByLabelText(`Nhận việc ${offerJob}`), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  await waitFor(() => expect(screen.getByText('Đã nhận việc. Xem trong mục Đã nhận.')).toBeTruthy());
  expect(screen.getByLabelText('Việc mới, 4')).toBeTruthy();
  expect(screen.getByLabelText('Đã nhận, 3')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Đã nhận, 3'));
  expect(screen.getByLabelText(`Đang đến, ${offerJob}`)).toBeTruthy();
});

test('declining an invitation removes it from the list', async () => {
  await render(<SampleWorkerJobsScreen initialStage="offer" onBack={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText(`Từ chối ${offerJob}`));
  await waitFor(() => expect(screen.getByText('Đã từ chối lời mời này.')).toBeTruthy());
  expect(screen.queryByText(offerJob)).toBeNull();
  expect(screen.getByLabelText('Việc mới, 4')).toBeTruthy();
});

test('an assigned job goes through the journey and then starts work', async () => {
  await render(<SampleWorkerJobsScreen initialStage="assigned" onBack={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText(`Đã đến nơi, ${assignedJob}`));
  await waitFor(() => expect(screen.getByText('Đã cập nhật: Đã đến nơi.')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText(`Bắt đầu làm, ${assignedJob}`));
  await waitFor(() => expect(screen.getByLabelText('Đã nhận, 1')).toBeTruthy());
  expect(screen.getByLabelText('Đang làm, 3')).toBeTruthy();
});

test('reporting a delay asks for details and is recorded once without promising a fee or schedule change', async () => {
  await render(<SampleWorkerJobsScreen initialStage="assigned" onBack={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText(`Báo chậm ${assignedJob}`));
  await fireEvent.press(screen.getByLabelText('Gửi: Báo chậm'));
  expect(screen.getByText('Hãy ghi rõ nội dung cần báo.')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Nội dung báo'), 'Kẹt xe, đến trễ khoảng 15 phút');
  await fireEvent.press(screen.getByLabelText('Gửi: Báo chậm'));
  await waitFor(() => expect(screen.getByText('Đã ghi nhận báo chậm. Không có khoản phí hay thay đổi lịch tự động.')).toBeTruthy());
  expect(screen.getByLabelText(`Báo chậm ${assignedJob}`).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByText('Đã báo chậm')).toBeTruthy();
});

test('pausing needs the customer to agree before work continues', async () => {
  await render(<SampleWorkerJobsScreen initialStage="active" onBack={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText(`Tạm dừng ${activeJob}`));
  await fireEvent.press(screen.getByLabelText(`Tạm dừng thông thường ${activeJob}`));
  await waitFor(() => expect(screen.getByLabelText(`Xin làm tiếp ${activeJob}`)).toBeTruthy());
  await fireEvent.press(screen.getByLabelText(`Xin làm tiếp ${activeJob}`));
  await waitFor(() => expect(screen.getByText('Đã gửi yêu cầu làm tiếp. Chờ khách đồng ý.')).toBeTruthy());
  expect(screen.getByLabelText(`Chờ khách đồng ý ${activeJob}`).props.accessibilityState.disabled).toBe(true);
});

test('a safety pause is final and offers no way to resume', async () => {
  await render(<SampleWorkerJobsScreen initialStage="active" onBack={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText(`Tạm dừng ${activeJob}`));
  await fireEvent.press(screen.getByLabelText(`Tạm dừng vì an toàn ${activeJob}`));
  await waitFor(() => expect(screen.getByLabelText(`Không thể làm tiếp ${activeJob}`)).toBeTruthy());
  expect(screen.queryByLabelText(`Xin làm tiếp ${activeJob}`)).toBeNull();
});

test('a paused job cannot be submitted until work resumes', async () => {
  await render(<SampleWorkerJobsScreen initialStage="active" onBack={jest.fn()} />);
  expect(screen.getByText('Việc đang tạm dừng. Cần khách đồng ý thì mới làm tiếp.')).toBeTruthy();
  expect(screen.queryByLabelText(`Nộp kết quả ${pausedJob}`)).toBeNull();
  expect(screen.getByLabelText(`Xin làm tiếp ${pausedJob}`)).toBeTruthy();
});

test('submitting the work needs a description and then waits for the customer', async () => {
  await render(<SampleWorkerJobsScreen initialStage="active" onBack={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText(`Nộp kết quả ${activeJob}`));
  await fireEvent.press(screen.getByLabelText('Gửi: Mô tả công việc đã làm'));
  expect(screen.getByText('Hãy mô tả công việc đã làm, tối đa 4000 ký tự.')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Kết quả công việc'), 'Đã thay ổ khoá mới và thử chìa 3 lần');
  await fireEvent.press(screen.getByLabelText('Gửi: Mô tả công việc đã làm'));
  await waitFor(() => expect(screen.getByLabelText('Đang làm, 1')).toBeTruthy());
  expect(screen.getByLabelText('Chờ duyệt, 3')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Chờ duyệt, 3'));
  expect(screen.getByText(activeJob)).toBeTruthy();
});

test('a correction request shows the customer note and can be resubmitted', async () => {
  await render(<SampleWorkerJobsScreen initialStage="review" onBack={jest.fn()} />);
  expect(screen.getByText(/Khách nhờ chụp thêm ảnh dàn lạnh/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText(`Nộp lại ${correctionJob}`));
  await fireEvent.changeText(screen.getByLabelText('Kết quả công việc'), 'Đã chụp thêm ảnh dàn lạnh');
  await fireEvent.press(screen.getByLabelText('Gửi: Mô tả công việc đã làm'));
  await waitFor(() => expect(screen.getByText('Đã nộp kết quả. Chờ khách duyệt.')).toBeTruthy());
  expect(screen.queryByText(/Khách nhờ chụp thêm ảnh dàn lạnh/)).toBeNull();
  expect(screen.queryByLabelText(`Nộp lại ${correctionJob}`)).toBeNull();
});

test('a scope proposal needs every field and tells the customer to decide', async () => {
  const perform = jest.fn<ReturnType<WorkerPerform>, Parameters<WorkerPerform>>().mockResolvedValue('Đã gửi đề xuất đổi phạm vi. Chờ khách quyết định.');
  const active = sampleWorkerJobs.filter(job => job.id === 'job-a1');
  await render(<WorkerJobsScreen initialStage="active" jobs={active} perform={perform} onBack={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText(`Đề xuất đổi phạm vi ${activeJob}`));
  await fireEvent.changeText(screen.getByLabelText('Phạm vi mới'), 'Thay cả ổ khoá và tay nắm');
  await fireEvent.changeText(screen.getByLabelText('Tổng tiền mới (VND)'), '12abc');
  await fireEvent.changeText(screen.getByLabelText('Lý do thay đổi'), 'Tay nắm cũng hỏng');
  await fireEvent.press(screen.getByLabelText('Gửi: Đề xuất đổi phạm vi hoặc giá'));
  expect(perform).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Tổng tiền mới (VND)'), '850000');
  await fireEvent.press(screen.getByLabelText('Gửi: Đề xuất đổi phạm vi hoặc giá'));
  await waitFor(() => expect(perform).toHaveBeenCalledTimes(1));
  expect(perform.mock.calls[0]?.[1]).toMatchObject({ type: 'propose', scope: 'Thay cả ổ khoá và tay nắm', amount: 850000, rationale: 'Tay nắm cũng hỏng' });
  await waitFor(() => expect(screen.getByText('Đã gửi đề xuất đổi phạm vi. Chờ khách quyết định.')).toBeTruthy());
});

test('a failed submission keeps the form open and retries with the same key', async () => {
  const perform = jest.fn<ReturnType<WorkerPerform>, Parameters<WorkerPerform>>()
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce('Đã nộp kết quả. Chờ khách duyệt.');
  const active = sampleWorkerJobs.filter(job => job.id === 'job-a1');
  await render(<WorkerJobsScreen initialStage="active" jobs={active} perform={perform} onBack={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText(`Nộp kết quả ${activeJob}`));
  await fireEvent.changeText(screen.getByLabelText('Kết quả công việc'), 'Đã thay ổ khoá mới');
  await fireEvent.press(screen.getByLabelText('Gửi: Mô tả công việc đã làm'));
  await waitFor(() => expect(screen.getByText('Chưa xác định được kết quả. Hãy mở lại mục này để xem trạng thái hiện tại.')).toBeTruthy());
  expect(screen.getByLabelText('Kết quả công việc').props.value).toBe('Đã thay ổ khoá mới');
  await fireEvent.press(screen.getByLabelText('Gửi: Mô tả công việc đã làm'));
  await waitFor(() => expect(perform).toHaveBeenCalledTimes(2));
  const first = perform.mock.calls[0]?.[1];
  const second = perform.mock.calls[1]?.[1];
  expect(first).toMatchObject({ type: 'submit' });
  expect(second).toEqual(first);
});

test('a refused command shows a definitive message without closing the screen', async () => {
  const perform = jest.fn<ReturnType<WorkerPerform>, Parameters<WorkerPerform>>().mockRejectedValue(new WorkflowError('stale'));
  const offers = sampleWorkerJobs.filter(job => job.id === 'job-o1');
  await render(<WorkerJobsScreen initialStage="offer" jobs={offers} perform={perform} onBack={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText(`Từ chối ${offerJob}`));
  await waitFor(() => expect(screen.getByText('Mục này đã thay đổi sau khi tải. Đã tải lại, hãy xem lại rồi thử lại.')).toBeTruthy());
  expect(screen.getByText(offerJob)).toBeTruthy();
});

test('live data carries no sample footnote', async () => {
  await render(<WorkerJobsScreen initialStage="done" jobs={[]} perform={jest.fn()} onBack={jest.fn()} />);
  expect(screen.queryByText(/Dữ liệu mẫu/)).toBeNull();
});

test('sample data says it is sample', async () => {
  await render(<SampleWorkerJobsScreen initialStage="done" onBack={jest.fn()} />);
  expect(screen.getByText(/Dữ liệu mẫu/)).toBeTruthy();
});

test('badges count offers, assigned jobs and corrections only', () => {
  expect(workerBadgesFor([])).toEqual({ 'worker-offers': 0, 'worker-assigned': 0, 'worker-review': 0 });
});

test('finished work states that no real payment exists yet', async () => {
  await render(<SampleWorkerJobsScreen initialStage="done" onBack={jest.fn()} />);
  expect(screen.getAllByText('Thanh toán chưa được kết nối nên chưa có khoản thu thật.')).toHaveLength(3);
});

test('back and ask-Kael actions are forwarded to the host screen', async () => {
  const onBack = jest.fn();
  const onAskKael = jest.fn();
  await render(<SampleWorkerJobsScreen initialStage="review" onBack={onBack} onAskKael={onAskKael} />);
  await fireEvent.press(screen.getByLabelText('Quay về'));
  expect(onBack).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByLabelText(`Hỏi Kael về ${correctionJob}`));
  expect(onAskKael).toHaveBeenCalledTimes(1);
});
