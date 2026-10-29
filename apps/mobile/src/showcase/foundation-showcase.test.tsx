import { fireEvent, render, screen } from '@testing-library/react-native';

import { FoundationShowcase } from './foundation-showcase';

jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual<typeof import('react-native')>('react-native').View }));

test('shows inherited roles, palette and interactive action states', async () => {
  await render(<FoundationShowcase />);
  expect(screen.getByRole('header', { name: 'Development component showcase' })).toBeTruthy();
  expect(screen.getByText(/Tiếng Việt có dấu/)).toBeTruthy();
  expect(screen.getByLabelText('background color')).toBeTruthy();
  expect(screen.getByText('Action ready')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Press to change state' }));
  expect(screen.getByText('Action pressed')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Disabled action' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Loading action' }).props.accessibilityState).toMatchObject({ disabled: true, busy: true });
});
