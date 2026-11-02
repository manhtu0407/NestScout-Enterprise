import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { WorkflowError } from '@/features/shared';

import { sampleWorkerProfileView, workerProfileTabForSidebarId, type WorkerProfileView } from './worker-profile';
import { WorkerProfileScreen } from './worker-profile-screen';

const profile: WorkerProfileView = { ...sampleWorkerProfileView };

async function setup(overrides: { tab?: 'profile' | 'areas' | 'reviews'; profile?: WorkerProfileView | null; perform?: jest.Mock } = {}) {
  const perform = overrides.perform ?? jest.fn().mockResolvedValue('Đã lưu.');
  const onBack = jest.fn();
  const view = await render(
    <WorkerProfileScreen initialTab={overrides.tab ?? 'profile'} profile={overrides.profile === undefined ? profile : overrides.profile} fallbackName="Tên mặc định" perform={perform} onBack={onBack} />,
  );
  return { perform, onBack, view };
}

test('the three profile entries in the worker sidebar open their own tab', () => {
  expect(workerProfileTabForSidebarId('worker-profile')).toBe('profile');
  expect(workerProfileTabForSidebarId('worker-areas')).toBe('areas');
  expect(workerProfileTabForSidebarId('worker-reviews')).toBe('reviews');
  expect(workerProfileTabForSidebarId('worker-earnings')).toBeNull();
});

test('a saved profile shows the name, its visibility and certificate statuses', async () => {
  await setup();
  expect(screen.getByText('Minh Anh')).toBeTruthy();
  expect(screen.getByText('Chưa công khai')).toBeTruthy();
  expect(screen.getByText('Đang chờ xác minh')).toBeTruthy();
  expect(screen.getByText('Chưa được chấp nhận')).toBeTruthy();
  expect(screen.getByText('Chứng chỉ · 2/10')).toBeTruthy();
  expect(screen.queryByText(/Dữ liệu mẫu/)).toBeNull();
});

test('a worker without a profile starts with the creation form prefilled with the account name', async () => {
  const { perform } = await setup({ profile: null });
  expect(screen.getByDisplayValue('Tên mặc định')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Lưu hồ sơ nghề'));
  expect(screen.getByText('Nhập tên hiển thị, nghề và khu vực chính.')).toBeTruthy();
  expect(perform).not.toHaveBeenCalled();
});

test('creating a profile validates the fields and sends the trimmed draft', async () => {
  const { perform } = await setup({ profile: null });
  await fireEvent.changeText(screen.getByLabelText('Nghề chính'), ' Thợ điện ');
  await fireEvent.changeText(screen.getByLabelText('Khu vực chính'), 'Quận 3');
  await fireEvent.changeText(screen.getByLabelText('Số năm kinh nghiệm'), 'abc');
  await fireEvent.press(screen.getByLabelText('Lưu hồ sơ nghề'));
  expect(screen.getByText('Số năm kinh nghiệm là số từ 0 đến 80.')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Số năm kinh nghiệm'), '4');
  await fireEvent.changeText(screen.getByLabelText('Kỹ năng (cách nhau bằng dấu phẩy)'), 'Thay vòi, Lắp đèn, Thay vòi');
  await fireEvent.press(screen.getByLabelText('Lưu hồ sơ nghề'));
  await waitFor(() => expect(perform).toHaveBeenCalledWith({
    type: 'save',
    draft: { name: 'Tên mặc định', trade: 'Thợ điện', area: 'Quận 3', experienceYears: 4, about: '', skills: ['Thay vòi', 'Lắp đèn'] },
  }));
});

test('editing an existing profile can be cancelled without saving', async () => {
  const { perform } = await setup();
  await fireEvent.press(screen.getByLabelText('Chỉnh sửa hồ sơ nghề'));
  await fireEvent.changeText(screen.getByLabelText('Nghề chính'), 'Thợ khác');
  await fireEvent.press(screen.getByLabelText('Hủy chỉnh sửa hồ sơ'));
  expect(screen.getByText('Thợ điện nước · 6 năm kinh nghiệm')).toBeTruthy();
  expect(perform).not.toHaveBeenCalled();
});

test('a refused save keeps the form open and explains why', async () => {
  const perform = jest.fn().mockRejectedValue(new WorkflowError('invalid'));
  await setup({ profile: null, perform });
  await fireEvent.changeText(screen.getByLabelText('Nghề chính'), 'Thợ điện');
  await fireEvent.changeText(screen.getByLabelText('Khu vực chính'), 'Quận 3');
  await fireEvent.changeText(screen.getByLabelText('Số năm kinh nghiệm'), '4');
  await fireEvent.press(screen.getByLabelText('Lưu hồ sơ nghề'));
  await waitFor(() => expect(screen.getByText('Một số thông tin chưa được chấp nhận. Hãy kiểm tra và thử lại.')).toBeTruthy());
  expect(screen.getByLabelText('Lưu hồ sơ nghề')).toBeTruthy();
});

test('certificates are added by title and removed by id', async () => {
  const { perform } = await setup();
  await fireEvent.press(screen.getByLabelText('Thêm chứng chỉ'));
  expect(screen.getByText('Nhập tên chứng chỉ, tối đa 80 ký tự.')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Tên chứng chỉ'), '  Chứng chỉ mới ');
  await fireEvent.press(screen.getByLabelText('Thêm chứng chỉ'));
  await waitFor(() => expect(perform).toHaveBeenCalledWith({ type: 'addCertificate', title: 'Chứng chỉ mới' }));
  await fireEvent.press(screen.getByLabelText('Xóa chứng chỉ Chứng chỉ an toàn điện'));
  await waitFor(() => expect(perform).toHaveBeenCalledWith({ type: 'removeCertificate', id: 'c1' }));
});

test('a full certificate list offers no more input', async () => {
  const certificates = Array.from({ length: 10 }, (_, index) => ({ id: `c${index}`, title: `Chứng chỉ ${index}`, status: 'pending' as const, statusLabel: 'Đang chờ xác minh' }));
  await setup({ profile: { ...profile, certificates } });
  expect(screen.queryByLabelText('Thêm chứng chỉ')).toBeNull();
});

test('the areas tab shows the saved coverage and saves a new radius', async () => {
  const { perform } = await setup({ tab: 'areas' });
  expect(screen.getByText('Bán kính 5 km')).toBeTruthy();
  expect(screen.getByText('Dịch vụ nhận · 3/5')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Bán kính 10 km'));
  await waitFor(() => expect(perform).toHaveBeenCalledWith({ type: 'coverage', radiusKm: 10, serviceIds: ['electric', 'water', 'aircon'] }));
  expect(screen.getByText('Bán kính 10 km')).toBeTruthy();
});

test('switching a service saves the new list and a refusal restores the saved state', async () => {
  const perform = jest.fn().mockRejectedValue(new WorkflowError('rejected'));
  await setup({ tab: 'areas', perform });
  await fireEvent.press(screen.getByLabelText('Nhận việc Vệ sinh sofa'));
  await waitFor(() => expect(perform).toHaveBeenCalledWith({ type: 'coverage', radiusKm: 5, serviceIds: ['electric', 'water', 'aircon', 'sofa'] }));
  await waitFor(() => expect(screen.getByText('Dịch vụ nhận · 3/5')).toBeTruthy());
  expect(screen.getByText('Bước này không còn khả dụng. Đã tải lại trạng thái mới nhất.')).toBeTruthy();
});

test('areas and reviews ask a worker without a profile to create one first', async () => {
  await setup({ tab: 'areas', profile: null });
  expect(screen.getByText('Chưa có hồ sơ nghề')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Tạo hồ sơ nghề'));
  expect(screen.getByLabelText('Lưu hồ sơ nghề')).toBeTruthy();
});

test('the reviews tab shows the rating only with enough reviews and lists them', async () => {
  await setup({ tab: 'reviews' });
  expect(screen.getByText('4,8')).toBeTruthy();
  expect(screen.getByText('Đúng giờ')).toBeTruthy();
  expect(screen.getByText('Làm nhanh, dọn sạch sau khi xong.')).toBeTruthy();
});

test('too few reviews hide the rating and the strengths', async () => {
  await setup({ tab: 'reviews', profile: { ...profile, reviewCount: 1, reviews: profile.reviews.slice(0, 1) } });
  expect(screen.getByText('Chưa đủ')).toBeTruthy();
  expect(screen.getByText(/ít nhất 3 đánh giá/)).toBeTruthy();
  expect(screen.getByText(/Chị Ngọc/)).toBeTruthy();
});

test('a profile with no reviews says so', async () => {
  await setup({ tab: 'reviews', profile: { ...profile, reviewCount: 0, strengths: [], reviews: [] } });
  expect(screen.getByText('Chưa có nhận xét nào.')).toBeTruthy();
});

test('tabs switch and back is forwarded', async () => {
  const { onBack } = await setup();
  await fireEvent.press(screen.getByLabelText('Đánh giá'));
  expect(screen.getByText('Nhận xét gần đây')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Quay về'));
  expect(onBack).toHaveBeenCalledTimes(1);
});
