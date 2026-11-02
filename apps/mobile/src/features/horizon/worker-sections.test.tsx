import { fireEvent, render, screen } from '@testing-library/react-native';

import type { WorkerData, WorkerDataController } from './use-worker-data';
import { useWorkerData } from './use-worker-data';
import { WorkerSection, isWorkerSection } from './worker-sections';

const mockAccess = jest.fn();
jest.mock('@/features/access', () => ({ ...jest.requireActual('@/features/access'), useAccess: () => mockAccess() }));
jest.mock('./use-worker-data', () => ({ useWorkerData: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000123' }));

const empty: WorkerData = { snapshot: { offers: [], jobs: [], changes: [], reports: [], corrections: [], pauses: [] }, cards: [], profile: null, earnings: [], notifications: [] };

function controller(overrides: Partial<WorkerDataController> = {}): WorkerDataController {
  return { data: empty, status: 'ready', loaded: true, refresh: jest.fn(), perform: jest.fn(), performProfile: jest.fn(), markRead: jest.fn().mockResolvedValue(undefined), ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess.mockReturnValue({ identity: 'verified', userId: 'worker-1', phase: 'worker' });
});

test('the job and profile entries are worker data sections', () => {
  for (const id of ['worker-offers', 'worker-assigned', 'worker-active', 'worker-review', 'worker-history', 'worker-profile', 'worker-areas', 'worker-reviews', 'worker-earnings', 'worker-payout', 'worker-notifications']) expect(isWorkerSection(id)).toBe(true);
  for (const id of ['worker-kael', 'requests', undefined]) expect(isWorkerSection(id)).toBe(false);
});

test('a client or guest session never loads worker data', async () => {
  mockAccess.mockReturnValue({ identity: 'verified', userId: 'client-1', phase: 'client' });
  jest.mocked(useWorkerData).mockReturnValue(controller());
  await render(<WorkerSection id="worker-offers" onBack={() => undefined} />);
  expect(jest.mocked(useWorkerData)).toHaveBeenCalledWith(null);
  expect(screen.getByText('Chỉ dành cho Thợ')).toBeTruthy();
});

test('data that has not loaded shows a loading state', async () => {
  jest.mocked(useWorkerData).mockReturnValue(controller({ loaded: false, status: 'loading' }));
  await render(<WorkerSection id="worker-offers" onBack={() => undefined} />);
  expect(screen.getByText('Đang tải')).toBeTruthy();
});

test('a failed first load offers a reload', async () => {
  const refresh = jest.fn();
  jest.mocked(useWorkerData).mockReturnValue(controller({ loaded: false, status: 'error', refresh }));
  await render(<WorkerSection id="worker-offers" onBack={() => undefined} />);
  expect(screen.getByText('Không tải được dữ liệu')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Tải lại' }));
  expect(refresh).toHaveBeenCalled();
});

test('an invitation from the server opens in its own tab and carries no sample footnote', async () => {
  const offer = { invitation_id: 'invite-1', quote_id: 'q', quote_version: 1, scope: 'Sửa vòi', amount_minor: 450000, currency: 'VND' as const, expires_at: new Date(Date.now() + 3_600_000).toISOString(), basis: 'local_fixture' };
  const card = { kind: 'offer' as const, ref_id: 'invite-1', title: 'Sửa vòi nước', description: 'Sửa vòi nước\nBị rò', photo_count: 1, location: '', customer_label: '', updated_at: null };
  jest.mocked(useWorkerData).mockReturnValue(controller({ data: { snapshot: { ...empty.snapshot, offers: [offer] }, cards: [card], profile: null, earnings: [], notifications: [] } }));
  await render(<WorkerSection id="worker-offers" onBack={() => undefined} />);
  expect(screen.getByText('Sửa vòi nước')).toBeTruthy();
  expect(screen.getByText('Địa chỉ hiện sau khi nhận việc')).toBeTruthy();
  expect(screen.queryByText(/Dữ liệu mẫu/)).toBeNull();
});

test('declining forwards the invitation id to the data controller', async () => {
  const perform = jest.fn().mockResolvedValue('Đã từ chối lời mời này.');
  const offer = { invitation_id: 'invite-1', quote_id: 'q', quote_version: 1, scope: 'Sửa vòi', amount_minor: 450000, currency: 'VND' as const, expires_at: new Date(Date.now() + 3_600_000).toISOString(), basis: 'local_fixture' };
  jest.mocked(useWorkerData).mockReturnValue(controller({ data: { snapshot: { ...empty.snapshot, offers: [offer] }, cards: [], profile: null, earnings: [], notifications: [] }, perform }));
  await render(<WorkerSection id="worker-offers" onBack={() => undefined} />);
  await fireEvent.press(screen.getByLabelText('Từ chối Sửa vòi'));
  expect(perform).toHaveBeenCalledWith('invite-1', { type: 'decline' });
});

test('a profile entry opens the creation form when the worker has no profile', async () => {
  jest.mocked(useWorkerData).mockReturnValue(controller());
  await render(<WorkerSection id="worker-profile" onBack={() => undefined} />);
  expect(screen.getByLabelText('Lưu hồ sơ nghề')).toBeTruthy();
  expect(screen.queryByText(/Dữ liệu mẫu/)).toBeNull();
});

test('a saved profile from the server fills the areas tab and saves through the hook', async () => {
  const performProfile = jest.fn().mockResolvedValue('Đã lưu khu vực và dịch vụ nhận.');
  const record = {
    profile_id: 'p1', display_name: 'Minh Anh', trade: 'Thợ điện nước', area: 'Quận 7', experience_years: 6, skills: ['Thay vòi'], about: 'Giới thiệu', radius_km: 5,
    accepting_jobs: true, service_ids: ['water'], listed: false, certificates: [], review_count: 0, rating_average: 0, completed_jobs: 0, strengths: [], reviews: [],
  };
  jest.mocked(useWorkerData).mockReturnValue(controller({ data: { ...empty, profile: record }, performProfile }));
  await render(<WorkerSection id="worker-areas" onBack={() => undefined} />);
  expect(screen.getByText('Dịch vụ nhận · 1/5')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Bán kính 3 km'));
  expect(performProfile).toHaveBeenCalledWith({ type: 'coverage', radiusKm: 3, serviceIds: ['water'] });
});

test('profile entries show the profile title while loading', async () => {
  jest.mocked(useWorkerData).mockReturnValue(controller({ loaded: false, status: 'loading' }));
  await render(<WorkerSection id="worker-profile" onBack={() => undefined} />);
  expect(screen.getByText('Hồ sơ nghề')).toBeTruthy();
  expect(screen.getByText('Đang tải')).toBeTruthy();
});

test('the earnings entries open from the worker projection and never show sample data', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const earnings = [{ job_id: 'j1', title: 'Sửa vòi', amount_minor: 450000, currency: 'VND', accepted_at: new Date().toISOString(), completed_on: today }];
  jest.mocked(useWorkerData).mockReturnValue(controller({ data: { ...empty, earnings } }));
  await render(<WorkerSection id="worker-earnings" onBack={() => undefined} />);
  expect(screen.getByText('Đã nghiệm thu hôm nay')).toBeTruthy();
  expect(screen.queryByText(/Dữ liệu mẫu/)).toBeNull();
  await fireEvent.press(screen.getByLabelText('Rút tiền'));
  expect(screen.getByText('Chưa mở')).toBeTruthy();
});

test('the earnings entries open from the worker projection and never show sample data', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const earnings = [{ job_id: 'j1', title: 'Sửa vòi', amount_minor: 450000, currency: 'VND', accepted_at: new Date().toISOString(), completed_on: today }];
  jest.mocked(useWorkerData).mockReturnValue(controller({ data: { ...empty, earnings } }));
  await render(<WorkerSection id="worker-earnings" onBack={() => undefined} />);
  expect(screen.getByText('Đã nghiệm thu hôm nay')).toBeTruthy();
  expect(screen.queryByText(/Dữ liệu mẫu/)).toBeNull();
  await fireEvent.press(screen.getByLabelText('Rút tiền'));
  expect(screen.getByText('Chưa mở')).toBeTruthy();
});

test('worker notifications open from the worker data and jump to the matching tab', async () => {
  const notifications = [{ id: 'n1', kind: 'job_offered' as const, request_id: 'r1', title: 'Có việc mới', body: 'Việc “Sửa vòi” đang chờ bạn phản hồi.', created_at: new Date().toISOString(), read_at: null }];
  const markRead = jest.fn().mockResolvedValue(undefined);
  const onNavigate = jest.fn();
  jest.mocked(useWorkerData).mockReturnValue(controller({ data: { ...empty, notifications }, markRead }));
  await render(<WorkerSection id="worker-notifications" onBack={() => undefined} onNavigate={onNavigate} />);
  await fireEvent.press(screen.getByText('Có việc mới'));
  expect(markRead).toHaveBeenCalledWith(['n1']);
  expect(onNavigate).toHaveBeenCalledWith('worker-offers');
});
