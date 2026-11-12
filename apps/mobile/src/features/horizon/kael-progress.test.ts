import { pickProgressJob, pickProgressRequest, progressForPhase, progressForRequest, progressForWorkerJob } from './kael-progress';
import type { ServiceRequest } from './requests-screen';
import type { WorkerJob } from './worker-jobs';

const request = (id: string, step: number, stage: ServiceRequest['stage'], status = 'Đang chờ báo giá'): ServiceRequest => ({ id, title: `Yêu cầu ${id}`, icon: 'requests', meta: '', status, stage, step, nextAction: '', description: '', createdLabel: '' });
const job = (id: string, stage: WorkerJob['stage'], stageLabel?: string): WorkerJob => ({ id, stage, title: `Việc ${id}`, icon: 'wrench', area: '', description: '', clientName: '', photoCount: 0, address: '', amountMinor: 0, stageLabel });

test('there is no progress without a phase', () => {
  expect(progressForPhase(null)).toBeNull();
});

test('a phase maps onto the step list and the completed phase notes payment is unconfirmed', () => {
  const quotes = progressForPhase('quotes');
  expect(quotes).toMatchObject({ hint: 'Bước 3 / 8', current: 2, finished: false, spinnerLabel: 'Đang tiến hành' });
  expect(quotes?.steps).toHaveLength(8);
  expect(progressForPhase('completed')).toMatchObject({ hint: 'Bước 8 / 8 · Chưa xác nhận thanh toán', current: 7, finished: true });
});

test('the newest request that is not done is the one that is tracked', () => {
  const requests = [request('new', 1, 'waiting'), request('old', 6, 'done')];
  expect(pickProgressRequest(requests)?.id).toBe('new');
  expect(pickProgressRequest([request('only', 6, 'done')])?.id).toBe('only');
  expect(pickProgressRequest([])).toBeNull();
});

test('a cancelled request is never the one that is tracked', () => {
  const cancelled: ServiceRequest = { ...request('cancelled', 0, 'done', 'Đã hủy yêu cầu'), closed: 'cancelled' };
  expect(pickProgressRequest([cancelled, request('finished', 6, 'done', 'Đã hoàn tất')])?.id).toBe('finished');
  expect(pickProgressRequest([cancelled, request('open', 1, 'waiting')])?.id).toBe('open');
  expect(pickProgressRequest([cancelled])).toBeNull();
});

test('a request becomes a progress with its real status and step', () => {
  const progress = progressForRequest(request('a', 1, 'waiting', 'Có báo giá mới'));
  expect(progress).toMatchObject({ hint: 'Yêu cầu a · Có báo giá mới', current: 1, finished: false });
  expect(progress.steps).toEqual(['Đã gửi', 'Có báo giá', 'Chấp nhận', 'Ghép thợ', 'Thực hiện', 'Nghiệm thu']);
  expect(progressForRequest({ ...request('c', 3, 'waiting', 'Chưa có thợ phù hợp'), dispatch: { canRetry: true, canCancel: true } })).toMatchObject({ finished: false, spinnerLabel: 'Đang chờ bạn xử lý' });
  expect(progressForRequest({ ...request('d', 3, 'waiting', 'Đã mời 2 thợ'), dispatch: { canRetry: false, canCancel: true } })).toMatchObject({ spinnerLabel: 'Đang tiến hành' });
  expect(progressForRequest(request('b', 6, 'done', 'Đã hoàn tất'))).toMatchObject({ current: 6, finished: true, spinnerLabel: 'Yêu cầu đã hoàn tất' });
});

test('a worker tracks the job closest to the work, then reviews, accepted jobs and offers', () => {
  expect(pickProgressJob([job('o', 'offer'), job('s', 'assigned'), job('r', 'review'), job('a', 'active')])?.id).toBe('a');
  expect(pickProgressJob([job('o', 'offer'), job('s', 'assigned')])?.id).toBe('s');
  expect(pickProgressJob([job('d', 'done')])?.id).toBe('d');
  expect(pickProgressJob([])).toBeNull();
});

test('a worker job maps onto the five steps and a finished job completes all of them', () => {
  expect(progressForWorkerJob(job('a', 'active', 'Bắt đầu 10:20'))).toMatchObject({ hint: 'Việc a · Bắt đầu 10:20', current: 2, finished: false });
  expect(progressForWorkerJob(job('s', 'assigned'))).toMatchObject({ hint: 'Việc s · Đã nhận', current: 1 });
  expect(progressForWorkerJob(job('d', 'done'))).toMatchObject({ current: 5, finished: true, spinnerLabel: 'Việc đã hoàn tất' });
});
