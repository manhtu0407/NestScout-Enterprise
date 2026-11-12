import { authenticatedRequest } from '@/lib/authenticated-rest';

import {
  markNotificationsRead, readAccountPhone, readCustomerProfile, readCustomerSettings, readJobWorkerCards, readNotifications, readPinnedRequestIds, readSavedWorkers,
  reviewJobWorker, saveCustomerProfile, saveCustomerSettings, saveWorker, setRequestPinned, submitSupportRequest, unsaveWorker,
} from './customer-data-repository';
import { WorkflowError } from './workflow-error';

jest.mock('@/lib/authenticated-rest', () => ({ authenticatedRequest: jest.fn() }));

const signal = new AbortController().signal;
const respond = (body: unknown, ok = true, status = 200) => jest.mocked(authenticatedRequest).mockResolvedValue({ ok, status, json: async () => body } as Response);

const notification = { id: 'n1', kind: 'quote_received', request_id: 'r1', title: 'Báo giá mới', body: 'Nội dung', created_at: '2026-11-02T10:00:00Z', read_at: null };

const savedWorker = {
  profile_id: 'p1', display_name: 'Thợ Minh', trade: 'Thợ nước', area: 'Quận 7', experience_years: 8, skills: ['Sửa vòi'], service_areas: ['Quận 7'],
  saved_at: '2026-11-01T10:00:00Z', review_count: 2, rating_average: 4.5, completed_jobs: 0,
  strengths: [{ label: 'Đúng giờ', count: 2 }], reviews: [{ id: 'v1', author: 'Chị A.', service: 'Sửa vòi', text: 'Tốt', created_at: '2026-10-30T10:00:00Z' }], basis: 'local_fixture',
};

beforeEach(() => jest.clearAllMocks());

test('pinned request ids are read from the owner pins', async () => {
  respond([{ request_id: 'r1' }, { request_id: 'r2' }]);
  await expect(readPinnedRequestIds('u1', signal)).resolves.toEqual(['r1', 'r2']);
  expect(authenticatedRequest).toHaveBeenCalledWith('u1', 'request_pins?select=request_id', { signal });
});

test('a malformed pin response is rejected', async () => {
  respond([{ request_id: 1 }]);
  await expect(readPinnedRequestIds('u1', signal)).rejects.toThrow('Invalid pin response');
  respond({}, true);
  await expect(readPinnedRequestIds('u1', signal)).rejects.toThrow('Could not read pins');
  respond([], false, 500);
  await expect(readPinnedRequestIds('u1', signal)).rejects.toThrow('Could not read pins');
});

test('pinning sends the request and expects the same state back', async () => {
  respond(true);
  await setRequestPinned('u1', 'r1', true, signal);
  expect(authenticatedRequest).toHaveBeenCalledWith('u1', 'rpc/set_request_pinned', { method: 'POST', signal, body: JSON.stringify({ p_request_id: 'r1', p_pinned: true }) });
  respond(false);
  await expect(setRequestPinned('u1', 'r1', true, signal)).rejects.toThrow('Invalid pin response');
});

test('a refused pin surfaces a workflow error', async () => {
  respond({ code: '42501', message: 'request unavailable' }, false, 403);
  await expect(setRequestPinned('u1', 'r1', true, signal)).rejects.toBeInstanceOf(WorkflowError);
});

test('notifications are validated and ordered newest first', async () => {
  respond([notification]);
  await expect(readNotifications('u1', signal)).resolves.toEqual([notification]);
  expect(jest.mocked(authenticatedRequest).mock.calls[0]?.[1]).toContain('order=created_at.desc');
  respond([{ ...notification, kind: 'unknown_kind' }]);
  await expect(readNotifications('u1', signal)).rejects.toThrow('Invalid notification response');
  respond([{ ...notification, kind: 'job_offered' }]);
  await expect(readNotifications('u1', signal)).rejects.toThrow('Invalid notification response');
  respond([{ ...notification, read_at: 5 }]);
  await expect(readNotifications('u1', signal)).rejects.toThrow('Invalid notification response');
});

test('each audience asks only for its own notification kinds', async () => {
  respond([{ ...notification, kind: 'job_offered' }]);
  await expect(readNotifications('u1', signal, 'worker')).resolves.toHaveLength(1);
  expect(jest.mocked(authenticatedRequest).mock.calls[0]?.[1]).toContain('kind=in.(job_offered,');
  expect(jest.mocked(authenticatedRequest).mock.calls[0]?.[1]).not.toContain('quote_received');
  respond([notification]);
  await readNotifications('u1', signal);
  expect(jest.mocked(authenticatedRequest).mock.calls[1]?.[1]).toContain('kind=in.(quote_received,');
  expect(jest.mocked(authenticatedRequest).mock.calls[1]?.[1]).not.toContain('job_offered');
});

test('the customer reads and asks for the exhausted dispatch notification', async () => {
  respond([{ ...notification, kind: 'dispatch_exhausted' }]);
  await expect(readNotifications('u1', signal)).resolves.toHaveLength(1);
  expect(jest.mocked(authenticatedRequest).mock.calls[0]?.[1]).toContain('dispatch_exhausted');
  respond([{ ...notification, kind: 'dispatch_exhausted' }]);
  await expect(readNotifications('u1', signal, 'worker')).rejects.toThrow('Invalid notification response');
  expect(jest.mocked(authenticatedRequest).mock.calls[1]?.[1]).not.toContain('dispatch_exhausted');
});

test('marking nothing read makes no request', async () => {
  await markNotificationsRead('u1', [], signal);
  expect(authenticatedRequest).not.toHaveBeenCalled();
});

test('marking notifications read posts the ids', async () => {
  respond(2);
  await markNotificationsRead('u1', ['n1', 'n2'], signal);
  expect(authenticatedRequest).toHaveBeenCalledWith('u1', 'rpc/mark_notifications_read', { method: 'POST', signal, body: JSON.stringify({ p_ids: ['n1', 'n2'] }) });
  respond('2');
  await expect(markNotificationsRead('u1', ['n1'], signal)).rejects.toThrow('Invalid read response');
});

test('a missing profile reads as null and a present one is returned', async () => {
  respond([]);
  await expect(readCustomerProfile('u1', signal)).resolves.toBeNull();
  const stored = { display_name: 'Minh', email: '', address: '', avatar_path: 'u1/avatar', updated_at: '2026-11-02T10:00:00Z' };
  respond([stored]);
  await expect(readCustomerProfile('u1', signal)).resolves.toEqual(stored);
  respond([stored, { ...stored, display_name: 'B' }]);
  await expect(readCustomerProfile('u1', signal)).rejects.toThrow('Invalid profile response');
  respond([{ ...stored, display_name: 1 }]);
  await expect(readCustomerProfile('u1', signal)).rejects.toThrow('Invalid profile response');
  respond([{ display_name: 'Minh', email: '', address: '' }]);
  await expect(readCustomerProfile('u1', signal)).rejects.toThrow('Invalid profile response');
});

test('saving a profile expects the owner id back', async () => {
  respond('u1');
  await saveCustomerProfile('u1', { display_name: 'Minh', email: 'a@b.co', address: 'HCM' }, signal);
  expect(authenticatedRequest).toHaveBeenCalledWith('u1', 'rpc/save_customer_profile', { method: 'POST', signal, body: JSON.stringify({ p_display_name: 'Minh', p_email: 'a@b.co', p_address: 'HCM' }) });
  respond('someone-else');
  await expect(saveCustomerProfile('u1', { display_name: 'Minh', email: '', address: '' }, signal)).rejects.toThrow('Invalid profile response');
});

test('a support request returns its id and reports invalid input', async () => {
  respond('s1');
  await expect(submitSupportRequest('u1', 'key', 'Chủ đề', 'Nội dung', signal)).resolves.toBe('s1');
  respond({ code: '22023', message: 'invalid request' }, false, 400);
  await expect(submitSupportRequest('u1', 'key', ' ', 'Nội dung', signal)).rejects.toMatchObject({ failure: 'invalid' });
});

test('saved workers are read through the owner function and validated', async () => {
  respond([savedWorker]);
  await expect(readSavedWorkers('u1', signal)).resolves.toEqual([savedWorker]);
  expect(authenticatedRequest).toHaveBeenCalledWith('u1', 'rpc/saved_workers', { method: 'POST', signal, body: '{}' });
  respond([{ ...savedWorker, strengths: [{ label: 'Đúng giờ', count: '2' }] }]);
  await expect(readSavedWorkers('u1', signal)).rejects.toThrow('Invalid saved worker response');
  respond([{ ...savedWorker, skills: [1] }]);
  await expect(readSavedWorkers('u1', signal)).rejects.toThrow('Invalid saved worker response');
  respond({});
  await expect(readSavedWorkers('u1', signal)).rejects.toThrow('Invalid saved worker response');
});

test('saving and unsaving a worker expect the profile id back', async () => {
  respond('p1');
  await saveWorker('u1', 'p1', signal);
  expect(authenticatedRequest).toHaveBeenCalledWith('u1', 'rpc/save_worker', { method: 'POST', signal, body: JSON.stringify({ p_profile_id: 'p1' }) });
  await unsaveWorker('u1', 'p1', signal);
  expect(authenticatedRequest).toHaveBeenLastCalledWith('u1', 'rpc/unsave_worker', { method: 'POST', signal, body: JSON.stringify({ p_profile_id: 'p1' }) });
  respond('other');
  await expect(saveWorker('u1', 'p1', signal)).rejects.toThrow('Invalid saved worker response');
  await expect(unsaveWorker('u1', 'p1', signal)).rejects.toThrow('Invalid saved worker response');
});

test('saving an unavailable worker surfaces a workflow error', async () => {
  respond({ code: '42501', message: 'worker unavailable' }, false, 403);
  await expect(saveWorker('u1', 'p1', signal)).rejects.toBeInstanceOf(WorkflowError);
});

const settings = { push: true, quotes: false, messages: true, promotions: false, reduce_motion: true };

test('missing settings read as null and stored settings are returned', async () => {
  respond([]);
  await expect(readCustomerSettings('u1', signal)).resolves.toBeNull();
  respond([settings]);
  await expect(readCustomerSettings('u1', signal)).resolves.toEqual(settings);
  expect(authenticatedRequest).toHaveBeenLastCalledWith('u1', 'customer_settings?select=push,quotes,messages,promotions,reduce_motion', { signal });
});

test('a settings row with a non-boolean value is rejected', async () => {
  respond([{ ...settings, push: 'yes' }]);
  await expect(readCustomerSettings('u1', signal)).rejects.toThrow('Invalid settings response');
});

test('saving settings sends every preference and expects the owner id back', async () => {
  respond('u1');
  await expect(saveCustomerSettings('u1', settings, signal)).resolves.toBeUndefined();
  expect(authenticatedRequest).toHaveBeenCalledWith('u1', 'rpc/save_customer_settings', {
    method: 'POST', signal, body: JSON.stringify({ p_push: true, p_quotes: false, p_messages: true, p_promotions: false, p_reduce_motion: true }),
  });
  respond('someone-else');
  await expect(saveCustomerSettings('u1', settings, signal)).rejects.toThrow('Invalid settings response');
});

test('the account phone is read as text and anything else is rejected', async () => {
  respond('84901234567');
  await expect(readAccountPhone('u1', signal)).resolves.toBe('84901234567');
  respond(null);
  await expect(readAccountPhone('u1', signal)).rejects.toThrow('Invalid phone response');
});

const card = { job_id: 'j1', request_id: 'r1', profile_id: 'p1', display_name: 'Thợ Minh', saved: false, review_rating: null, listed: true };

test('job worker cards are validated', async () => {
  respond([card, { ...card, job_id: 'j2', review_rating: 4 }]);
  await expect(readJobWorkerCards('u1', signal)).resolves.toHaveLength(2);
  respond([{ ...card, listed: undefined }]);
  await expect(readJobWorkerCards('u1', signal)).rejects.toThrow('Invalid job worker response');
  respond([{ ...card, review_rating: 9 }]);
  await expect(readJobWorkerCards('u1', signal)).rejects.toThrow('Invalid job worker response');
  respond([{ ...card, saved: 'no' }]);
  await expect(readJobWorkerCards('u1', signal)).rejects.toThrow('Invalid job worker response');
});

test('a review sends the rating, text and tags and returns its id', async () => {
  respond('review-1');
  await expect(reviewJobWorker('u1', 'j1', { rating: 5, body: 'Tốt', tags: ['Đúng giờ'] }, signal)).resolves.toBe('review-1');
  expect(authenticatedRequest).toHaveBeenCalledWith('u1', 'rpc/review_job_worker', {
    method: 'POST', signal, body: JSON.stringify({ p_job_id: 'j1', p_rating: 5, p_body: 'Tốt', p_tags: ['Đúng giờ'] }),
  });
});

test('reviewing a job that is not finished surfaces a workflow error', async () => {
  respond({ code: '22023', message: 'job not completed' }, false, 400);
  await expect(reviewJobWorker('u1', 'j1', { rating: 5, body: '', tags: [] }, signal)).rejects.toBeInstanceOf(WorkflowError);
});
