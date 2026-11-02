import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Skeleton, SkeletonBlock, SkeletonReveal } from './skeleton';

const placeholder = <Skeleton label="Đang tải"><SkeletonBlock width="100%" height={12} radius={6}/></Skeleton>;

test('the placeholder shows while loading and the content stays hidden from assistive technology', async () => {
  await render(<SkeletonReveal loading skeleton={placeholder}><Text>Nội dung</Text></SkeletonReveal>);
  expect(screen.getByLabelText('Đang tải')).toBeTruthy();
  expect(screen.queryByText('Nội dung')).toBeNull();
});

test('finishing the load reveals the content and removes the placeholder', async () => {
  const view = await render(<SkeletonReveal loading skeleton={placeholder}><Text>Nội dung</Text></SkeletonReveal>);
  await view.rerender(<SkeletonReveal loading={false} skeleton={placeholder}><Text>Nội dung</Text></SkeletonReveal>);
  expect(screen.getByText('Nội dung')).toBeTruthy();
  await waitFor(() => expect(screen.queryByLabelText('Đang tải')).toBeNull(), { timeout: 3000 });
});

test('content that is already loaded renders without a placeholder', async () => {
  await render(<SkeletonReveal loading={false} skeleton={placeholder}><Text>Nội dung</Text></SkeletonReveal>);
  expect(screen.getByText('Nội dung')).toBeTruthy();
  expect(screen.queryByLabelText('Đang tải')).toBeNull();
});
