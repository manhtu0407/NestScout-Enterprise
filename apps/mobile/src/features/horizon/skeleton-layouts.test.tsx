import { render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Animated } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Sidebar } from './sidebar';
import { Skeleton, SkeletonBlock } from './skeleton';
import { KaelHomeLoading, RecentSkeleton } from './skeleton-layouts';

afterEach(() => jest.restoreAllMocks());

const initialMetrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } };

function renderSidebar(recentLoading?: boolean) {
  return render(<SafeAreaProvider initialMetrics={initialMetrics}><Sidebar visible onClose={jest.fn()} onNavigate={jest.fn()} mode="client" modePending={false} modeNotice={null} onModeSelect={jest.fn()} onModeCancel={jest.fn()} onDismissModeNotice={jest.fn()} profileName="Nguyễn Minh" recentLoading={recentLoading}/></SafeAreaProvider>);
}

test('a skeleton announces itself as a busy progress indicator with its label', async () => {
  await render(<Skeleton label="Đang tải"><SkeletonBlock width="100%" height={12} radius={6}/></Skeleton>);
  const root = screen.getByLabelText('Đang tải');
  expect(root.props.accessibilityRole).toBe('progressbar');
  expect(root.props['aria-busy']).toBe(true);
});

test('the shimmer loop runs by default and is stopped when Reduce Motion is on', async () => {
  const start = jest.fn();
  const stop = jest.fn();
  jest.spyOn(Animated, 'loop').mockReturnValue({ start, stop, reset: jest.fn() });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  await render(<Skeleton label="Đang tải"><SkeletonBlock width="100%" height={12} radius={6}/></Skeleton>);
  await waitFor(() => expect(stop).toHaveBeenCalled());
  expect(start).toHaveBeenCalledTimes(1);
});

test('the first-open placeholder keeps the busy label and shows no interactive controls', async () => {
  await render(<SafeAreaProvider initialMetrics={initialMetrics}><KaelHomeLoading label="Starting NestScout"/></SafeAreaProvider>);
  expect(screen.getByLabelText('Starting NestScout')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByPlaceholderText('Nhắn Kael...')).toBeNull();
});

test('the recent list placeholder is labelled for assistive technology', async () => {
  await render(<RecentSkeleton label="Đang tải cuộc trò chuyện gần đây"/>);
  expect(screen.getByLabelText('Đang tải cuộc trò chuyện gần đây')).toBeTruthy();
});

test('the sidebar shows the recent placeholder instead of the empty message while loading', async () => {
  await renderSidebar(true);
  expect(screen.getByLabelText('Đang tải cuộc trò chuyện gần đây')).toBeTruthy();
  expect(screen.queryByText(/Chưa có cuộc trò chuyện nào/)).toBeNull();
});

test('the sidebar shows the empty message once loading has finished', async () => {
  await renderSidebar();
  expect(screen.queryByLabelText('Đang tải cuộc trò chuyện gần đây')).toBeNull();
  expect(screen.getByText(/Chưa có cuộc trò chuyện nào/)).toBeTruthy();
});
