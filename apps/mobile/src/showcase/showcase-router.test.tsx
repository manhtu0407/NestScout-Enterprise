import { renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import RootLayout from '@/app/_layout';
import { getDefaultAccessServices } from '@/features/access';

jest.mock('@/features/access', () => {
  const { Text: NativeText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    AccessProvider: ({ children }: { children: React.ReactNode }) => children,
    AccessStack: () => <NativeText>Application stack</NativeText>,
    getDefaultAccessServices: jest.fn(() => ({})),
  };
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

const originalShowcase = process.env.EXPO_PUBLIC_DESIGN_SHOWCASE;

afterEach(() => {
  if (originalShowcase === undefined) delete process.env.EXPO_PUBLIC_DESIGN_SHOWCASE;
  else process.env.EXPO_PUBLIC_DESIGN_SHOWCASE = originalShowcase;
  jest.clearAllMocks();
});

test('a worker deep link renders the development showcase without initializing access', async () => {
  process.env.EXPO_PUBLIC_DESIGN_SHOWCASE = '1';
  await renderRouter({
    _layout: RootLayout,
    index: () => <Text>Guest route</Text>,
    '(worker)/worker-home': () => <Text>Worker route</Text>,
  }, { initialUrl: '/worker-home' });
  expect(screen.getByText('Development component showcase')).toBeTruthy();
  expect(screen.queryByText('Worker route')).toBeNull();
  expect(getDefaultAccessServices).not.toHaveBeenCalled();
});
