import { render, screen } from '@testing-library/react-native';

import RootLayout from '@/app/_layout';

jest.mock('@/features/access', () => {
  const { Text: NativeText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    AccessProvider: ({ children }: { children: React.ReactNode }) => children,
    AccessStack: () => <NativeText>Application stack</NativeText>,
    getDefaultAccessServices: () => ({}),
  };
});
jest.mock('@/showcase/foundation-showcase', () => {
  const { Text: NativeText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { FoundationShowcase: () => <NativeText>Showcase root</NativeText> };
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

const originalDev = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');
const originalShowcase = process.env.EXPO_PUBLIC_DESIGN_SHOWCASE;

afterEach(() => {
  if (originalDev) Object.defineProperty(globalThis, '__DEV__', originalDev);
  if (originalShowcase === undefined) delete process.env.EXPO_PUBLIC_DESIGN_SHOWCASE;
  else process.env.EXPO_PUBLIC_DESIGN_SHOWCASE = originalShowcase;
});

test.each([
  [true, '1', 'Showcase root'],
  [true, undefined, 'Application stack'],
  [true, '0', 'Application stack'],
  [false, '1', 'Application stack'],
] as const)('selects the appropriate root for development %s and showcase flag %s', async (dev, flag, expected) => {
  Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: dev });
  if (flag === undefined) delete process.env.EXPO_PUBLIC_DESIGN_SHOWCASE;
  else process.env.EXPO_PUBLIC_DESIGN_SHOWCASE = flag;
  await render(<RootLayout />);
  expect(screen.getByText(expected)).toBeTruthy();
});
