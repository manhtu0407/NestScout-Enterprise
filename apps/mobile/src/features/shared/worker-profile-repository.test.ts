import { authenticatedRequest } from '@/lib/authenticated-rest';

import {
  addWorkerCertificate, readWorkerProfile, removeWorkerCertificate, saveWorkerCoverage, saveWorkerProfile, setWorkerAccepting,
} from './worker-profile-repository';
import { WorkflowError } from './workflow-error';

jest.mock('@/lib/authenticated-rest', () => ({ authenticatedRequest: jest.fn() }));

const signal = new AbortController().signal;
const respond = (body: unknown, ok = true, status = 200) => jest.mocked(authenticatedRequest).mockResolvedValue({ ok, status, json: async () => body } as Response);

const profile = {
  profile_id: 'p1', display_name: 'Minh Anh', trade: 'Thợ điện nước', area: 'Quận 7', experience_years: 6, skills: ['Thay vòi'], about: 'Nhận sửa điện nước.',
  radius_km: 5, accepting_jobs: true, service_ids: ['water'], listed: false, certificates: [{ id: 'c1', title: 'An toàn điện', status: 'pending' }],
  review_count: 1, rating_average: 5, completed_jobs: 2, strengths: [{ label: 'Đúng giờ', count: 1 }],
  reviews: [{ id: 'v1', author: 'Tú', service: 'Sửa vòi', text: 'Tốt', created_at: '2026-11-01T10:00:00Z' }],
  documents: [], missing_items: [],
};

beforeEach(() => jest.clearAllMocks());

test('the worker profile is read from the owner projection', async () => {
  respond([profile]);
  await expect(readWorkerProfile('u1', signal)).resolves.toEqual(profile);
  expect(authenticatedRequest).toHaveBeenCalledWith('u1', 'rpc/my_worker_profile', { method: 'POST', signal, body: '{}' });
});

test('a worker without a profile reads null', async () => {
  respond([]);
  await expect(readWorkerProfile('u1', signal)).resolves.toBeNull();
});

test.each([
  [[{ ...profile, certificates: [{ id: 'c1', title: 'x', status: 'approved' }] }]],
  [[{ ...profile, radius_km: '5' }]],
  [[{ ...profile, accepting_jobs: 'yes' }]],
  [[{ ...profile, strengths: [{ label: 'x' }] }]],
  [[profile, profile]],
  [{}],
])('a malformed profile response is rejected', async body => {
  respond(body);
  await expect(readWorkerProfile('u1', signal)).rejects.toThrow('Invalid worker profile response');
});

test('a refused read maps to a workflow failure', async () => {
  respond({ code: '42501', message: 'worker unavailable' }, false, 403);
  await expect(readWorkerProfile('u1', signal)).rejects.toMatchObject({ failure: 'forbidden' });
  respond({}, false, 500);
  await expect(readWorkerProfile('u1', signal)).rejects.toBeInstanceOf(WorkflowError);
});

test('saving the profile sends every field', async () => {
  respond('p1');
  await expect(saveWorkerProfile('u1', { display_name: 'Minh Anh', trade: 'Thợ điện nước', area: 'Quận 7', experience_years: 6, about: 'Giới thiệu', skills: ['Thay vòi'] }, signal)).resolves.toBe('p1');
  expect(authenticatedRequest).toHaveBeenCalledWith('u1', 'rpc/save_worker_profile', {
    method: 'POST', signal,
    body: JSON.stringify({ p_display_name: 'Minh Anh', p_trade: 'Thợ điện nước', p_area: 'Quận 7', p_experience_years: 6, p_about: 'Giới thiệu', p_skills: ['Thay vòi'] }),
  });
  respond(1);
  await expect(saveWorkerProfile('u1', { display_name: 'a', trade: 'b', area: 'c', experience_years: 0, about: '', skills: [] }, signal)).rejects.toThrow('Invalid worker profile response');
});

test('saving coverage sends the radius and services', async () => {
  respond('p1');
  await expect(saveWorkerCoverage('u1', 10, ['water', 'electric'], signal)).resolves.toBeUndefined();
  expect(authenticatedRequest).toHaveBeenCalledWith('u1', 'rpc/save_worker_coverage', { method: 'POST', signal, body: JSON.stringify({ p_radius_km: 10, p_service_ids: ['water', 'electric'] }) });
  respond(null);
  await expect(saveWorkerCoverage('u1', 5, [], signal)).rejects.toThrow('Invalid worker coverage response');
});

test('availability must echo the requested state', async () => {
  respond(false);
  await expect(setWorkerAccepting('u1', false, signal)).resolves.toBeUndefined();
  respond(true);
  await expect(setWorkerAccepting('u1', false, signal)).rejects.toThrow('Invalid worker availability response');
});

test('certificates are added by title and removed by id', async () => {
  respond('c1');
  await expect(addWorkerCertificate('u1', 'An toàn điện', signal)).resolves.toBe('c1');
  await expect(removeWorkerCertificate('u1', 'c1', signal)).resolves.toBeUndefined();
  await expect(removeWorkerCertificate('u1', 'c2', signal)).rejects.toThrow('Invalid certificate response');
  respond(1);
  await expect(addWorkerCertificate('u1', 'x', signal)).rejects.toThrow('Invalid certificate response');
});
