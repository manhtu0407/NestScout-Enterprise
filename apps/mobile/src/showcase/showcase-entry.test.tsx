import { render, screen } from '@testing-library/react-native';

import RootLayout from '@/app/_layout';
import { getDefaultAccessServices } from '@/features/access';
import { developerPilotEnabled } from '@/features/horizon';
import { hostedKaelPreviewEnabled } from '@/lib/config';

jest.mock('@/lib/config', () => ({ hostedKaelPreviewEnabled: jest.fn(() => false) }));

jest.mock('@/features/access', () => {
  const { Text: NativeText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    AccessProvider: ({ children }: { children: React.ReactNode }) => children,
    AccessStack: () => <NativeText>Application stack</NativeText>,
    getDefaultAccessServices: jest.fn(() => ({})),
  };
});
jest.mock('@/features/horizon', () => {
  const { Text: NativeText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { HorizonPreview: () => <NativeText>Horizon preview</NativeText>, HostedKaelPreview: () => <NativeText>Hosted Kael Preview</NativeText>,
    DeveloperPilotPanel: () => <NativeText>Local pilot panel</NativeText>, developerPilotEnabled: jest.fn(() => false) };
});
jest.mock('@/showcase/foundation-showcase', () => {
  const { Text: NativeText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { FoundationShowcase: () => <NativeText>Showcase root</NativeText> };
});
jest.mock('@/showcase/kael-motion-lab', () => {
  const { Text: NativeText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { KaelMotionLab: () => <NativeText>Kael motion lab</NativeText> };
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

const originalDev = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');
const originalShowcase = process.env.EXPO_PUBLIC_DESIGN_SHOWCASE;
const originalHorizon = process.env.EXPO_PUBLIC_HORIZON_PREVIEW;

afterEach(() => {
  jest.clearAllMocks();
  jest.mocked(developerPilotEnabled).mockReturnValue(false);
  jest.mocked(hostedKaelPreviewEnabled).mockReturnValue(false);
  if (originalHorizon === undefined) delete process.env.EXPO_PUBLIC_HORIZON_PREVIEW;
  else process.env.EXPO_PUBLIC_HORIZON_PREVIEW = originalHorizon;
  if (originalDev) Object.defineProperty(globalThis, '__DEV__', originalDev);
  if (originalShowcase === undefined) delete process.env.EXPO_PUBLIC_DESIGN_SHOWCASE;
  else process.env.EXPO_PUBLIC_DESIGN_SHOWCASE = originalShowcase;
});

test('trusted hosted Preview mounts only Kael with real access services', async () => {
  jest.mocked(hostedKaelPreviewEnabled).mockReturnValue(true);
  jest.mocked(developerPilotEnabled).mockReturnValue(true);
  process.env.EXPO_PUBLIC_DESIGN_SHOWCASE = '1';
  await render(<RootLayout />);
  expect(screen.getByText('Hosted Kael Preview')).toBeTruthy();
  expect(screen.queryByText('Application stack')).toBeNull();
  expect(screen.queryByText('Local pilot panel')).toBeNull();
  expect(screen.queryByText('Showcase root')).toBeNull();
  expect(jest.mocked(getDefaultAccessServices)).toHaveBeenCalledTimes(1);
});

test('the enabled local pilot uses the real application stack even when showcase flags are present', async () => {
  jest.mocked(developerPilotEnabled).mockReturnValue(true);
  process.env.EXPO_PUBLIC_DESIGN_SHOWCASE = '1';
  process.env.EXPO_PUBLIC_HORIZON_PREVIEW = '1';
  await render(<RootLayout />);
  expect(screen.getByText('Application stack')).toBeTruthy();
  expect(screen.getByText('Local pilot panel')).toBeTruthy();
  expect(screen.queryByText('Horizon preview')).toBeNull();
  expect(screen.queryByText('Showcase root')).toBeNull();
  expect(jest.mocked(getDefaultAccessServices)).toHaveBeenCalledTimes(1);
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
  expect(jest.mocked(getDefaultAccessServices)).toHaveBeenCalledTimes(expected === 'Showcase root' ? 0 : 1);
});


test.each([
  [true, '1', '1', 'Horizon preview'],
  [true, '1', '0', 'Showcase root'],
  [true, '0', '1', 'Application stack'],
  [false, '1', '1', 'Application stack'],
] as const)('Horizon flag respects development and showcase gates', async (dev, showcase, horizon, expected) => {
  Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: dev });
  process.env.EXPO_PUBLIC_DESIGN_SHOWCASE = showcase;
  process.env.EXPO_PUBLIC_HORIZON_PREVIEW = horizon;
  await render(<RootLayout />);
  expect(screen.getByText(expected)).toBeTruthy();
  expect(jest.mocked(getDefaultAccessServices)).toHaveBeenCalledTimes(expected === 'Application stack' ? 1 : 0);
});

test.each([
  [true, '1', '1', 'Kael motion lab'],
  [true, '1', '0', 'Showcase root'],
  [true, '0', '1', 'Application stack'],
  [false, '1', '1', 'Application stack'],
] as const)('Kael motion lab flag respects development and showcase gates', async (dev, showcase, lab, expected) => {
  Object.defineProperty(globalThis, '__DEV__', { configurable: true, value: dev });
  process.env.EXPO_PUBLIC_DESIGN_SHOWCASE = showcase;
  process.env.EXPO_PUBLIC_KAEL_MOTION_LAB = lab;
  try {
    await render(<RootLayout />);
    expect(screen.getByText(expected)).toBeTruthy();
  } finally {
    delete process.env.EXPO_PUBLIC_KAEL_MOTION_LAB;
  }
});
