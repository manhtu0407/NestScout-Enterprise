import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { TextInput } from 'react-native';

import { RequestsRoute, SectionRoute } from './horizon-sections';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

function Home() {
  return <TextInput accessibilityLabel="Draft" />;
}

function mount() {
  return renderRouter({ index: Home, requests: RequestsRoute, section: SectionRoute }, { initialUrl: '/' });
}

test('a section opens as its own stack entry and the back button returns to home', async () => {
  await mount();
  await act(() => router.push({ pathname: '/section', params: { id: 'settings' } }));
  expect(screen).toHavePathname('/section');
  expect(screen.getByText('Cài đặt')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Quay về' }));
  expect(screen).toHavePathname('/');
});

test('worker sections show their own title instead of the raw id', async () => {
  await mount();
  await act(() => router.push({ pathname: '/section', params: { id: 'worker-nearby' } }));
  expect(screen.getByText('Việc mới')).toBeTruthy();
});

test('the requests route goes back to the home route', async () => {
  await mount();
  await act(() => router.push('/requests'));
  expect(screen).toHavePathname('/requests');
  await act(() => router.back());
  expect(screen).toHavePathname('/');
});
