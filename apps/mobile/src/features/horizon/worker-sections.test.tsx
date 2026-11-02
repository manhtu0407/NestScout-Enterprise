import { fireEvent, render, screen } from '@testing-library/react-native';

import type { WorkerData, WorkerDataController } from './use-worker-data';
import { useWorkerData } from './use-worker-data';
import { WorkerSection, isWorkerSection } from './worker-sections';

const mockAccess = jest.fn();
jest.mock('@/features/access', () => ({ ...jest.requireActual('@/features/access'), useAccess: () => mockAccess() }));
jest.mock('./use-worker-data', () => ({ useWorkerData: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000123' }));

const empty: WorkerData = { snapshot: { offers: [], jobs: [], changes: [], reports: [], corrections: [], pauses: [] }, cards: [] };

function controller(overrides: Partial<WorkerDataController> = {}): WorkerDataController {
  return { data: empty, status: 'ready', loaded: true, refresh: jest.fn(), perform: jest.fn(), ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess.mockReturnValue({ identity: 'verified', userId: 'worker-1', phase: 'worker' });
});

test('only the five job entries are worker data sections', () => {
  for (const id of ['worker-offers', 'worker-assigned', 'worker-active', 'worker-review', 'worker-history']) expect(isWorkerSection(id)).toBe(true);
  for (const id of ['worker-kael', 'worker-earnings', 'worker-profile', 'requests', undefined]) expect(isWorkerSection(id)).toBe(false);
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
  jest.mocked(useWorkerData).mockReturnValue(controller({ data: { snapshot: { ...empty.snapshot, offers: [offer] }, cards: [card] } }));
  await render(<WorkerSection id="worker-offers" onBack={() => undefined} />);
  expect(screen.getByText('Sửa vòi nước')).toBeTruthy();
  expect(screen.getByText('Địa chỉ hiện sau khi nhận việc')).toBeTruthy();
  expect(screen.queryByText(/Dữ liệu mẫu/)).toBeNull();
});

test('declining forwards the invitation id to the data controller', async () => {
  const perform = jest.fn().mockResolvedValue('Đã từ chối lời mời này.');
  const offer = { invitation_id: 'invite-1', quote_id: 'q', quote_version: 1, scope: 'Sửa vòi', amount_minor: 450000, currency: 'VND' as const, expires_at: new Date(Date.now() + 3_600_000).toISOString(), basis: 'local_fixture' };
  jest.mocked(useWorkerData).mockReturnValue(controller({ data: { snapshot: { ...empty.snapshot, offers: [offer] }, cards: [] }, perform }));
  await render(<WorkerSection id="worker-offers" onBack={() => undefined} />);
  await fireEvent.press(screen.getByLabelText('Từ chối Sửa vòi'));
  expect(perform).toHaveBeenCalledWith('invite-1', { type: 'decline' });
});
