import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { TextInput } from 'react-native';

import { takeOnboardingReplay } from '@/features/onboarding';

import { SectionRoute } from './horizon-sections';

const mockAccess = { identity: 'verified', userId: 'customer-a', phase: 'client' };

jest.mock('@/features/access', () => ({ ...jest.requireActual('@/features/access'), useAccess: () => mockAccess }));

jest.mock('./use-customer-data', () => ({
  useCustomerData: () => ({
    data: { requests: [], quotes: [], pinnedIds: new Set(), notifications: [], profile: null, avatar: null, settings: null, activity: { jobs: [], submissions: [], cases: [], changes: [], reports: [], pauses: [] } },
    status: 'ready', loaded: true, refresh: jest.fn(),
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

function Home() {
  return <TextInput accessibilityLabel="Draft" />;
}

const replayLabel = 'Xem lại hướng dẫn làm quen, Giới thiệu nhanh cách dùng NestScout và Kael';

function mount() {
  return renderRouter({ index: Home, section: SectionRoute }, { initialUrl: '/' });
}

beforeEach(() => {
  takeOnboardingReplay();
  mockAccess.identity = 'verified';
  mockAccess.userId = 'customer-a';
});

test('replaying the tour from Help goes back to home and leaves a replay request for it', async () => {
  await mount();
  await act(() => router.push({ pathname: '/section', params: { id: 'help' } }));
  await fireEvent.press(screen.getByLabelText(replayLabel));
  expect(screen).toHavePathname('/');
  expect(takeOnboardingReplay()).toBe(true);
  expect(takeOnboardingReplay()).toBe(false);
});

test('a guest is not offered the replay', async () => {
  mockAccess.identity = 'unverified';
  mockAccess.userId = '';
  await mount();
  await act(() => router.push({ pathname: '/section', params: { id: 'help' } }));
  expect(screen.getByText('Trợ giúp')).toBeTruthy();
  expect(screen.queryByLabelText(replayLabel)).toBeNull();
  expect(takeOnboardingReplay()).toBe(false);
});
