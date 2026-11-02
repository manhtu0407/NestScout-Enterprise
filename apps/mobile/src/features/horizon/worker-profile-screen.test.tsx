import { fireEvent, render, screen } from '@testing-library/react-native';

import { workerProfileTabForSidebarId } from './worker-profile';
import { WorkerProfileScreen } from './worker-profile-screen';

test('the three profile entries in the worker sidebar open their own tab', () => {
  expect(workerProfileTabForSidebarId('worker-profile')).toBe('profile');
  expect(workerProfileTabForSidebarId('worker-areas')).toBe('areas');
  expect(workerProfileTabForSidebarId('worker-reviews')).toBe('reviews');
  expect(workerProfileTabForSidebarId('worker-earnings')).toBeNull();
});

test('the profile tab shows the name, an unverified badge and certificate statuses', async () => {
  await render(<WorkerProfileScreen initialTab="profile" name="Minh Anh" onBack={jest.fn()} />);
  expect(screen.getByText('Minh Anh')).toBeTruthy();
  expect(screen.getAllByText('Chưa xác minh')).toHaveLength(2);
  expect(screen.getByText('Đang chờ xác minh')).toBeTruthy();
});

test('the areas tab changes the radius and counts enabled services', async () => {
  await render(<WorkerProfileScreen initialTab="areas" name="Minh Anh" onBack={jest.fn()} />);
  expect(screen.getByText('Bán kính 5 km')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Bán kính 10 km'));
  expect(screen.getByText('Bán kính 10 km')).toBeTruthy();
  expect(screen.getByText('Dịch vụ nhận · 3/5')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Nhận việc Vệ sinh sofa'));
  expect(screen.getByText('Dịch vụ nhận · 4/5')).toBeTruthy();
});

test('the reviews tab shows the rating only with enough reviews and lists them', async () => {
  await render(<WorkerProfileScreen initialTab="reviews" name="Minh Anh" onBack={jest.fn()} />);
  expect(screen.getByText('4,8')).toBeTruthy();
  expect(screen.getByText('Đúng giờ')).toBeTruthy();
  expect(screen.getByText('Làm nhanh, dọn sạch sau khi xong.')).toBeTruthy();
});

test('tabs switch and back is forwarded', async () => {
  const onBack = jest.fn();
  await render(<WorkerProfileScreen initialTab="profile" name="Minh Anh" onBack={onBack} />);
  await fireEvent.press(screen.getByLabelText('Đánh giá'));
  expect(screen.getByText('Nhận xét gần đây')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Quay về'));
  expect(onBack).toHaveBeenCalledTimes(1);
});
