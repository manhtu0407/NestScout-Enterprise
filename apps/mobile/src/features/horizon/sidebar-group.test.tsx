import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { CollapsibleGroup } from './sidebar-group';

test('an expanded group shows its rows and a collapsed one hides them', async () => {
  const { rerender } = await render(<CollapsibleGroup title="Công việc" expanded onToggle={jest.fn()}><Text>Việc mới</Text></CollapsibleGroup>);
  expect(screen.getByText('Việc mới')).toBeTruthy();
  await rerender(<CollapsibleGroup title="Công việc" expanded={false} onToggle={jest.fn()}><Text>Việc mới</Text></CollapsibleGroup>);
  expect(screen.getByLabelText('Công việc').props.accessibilityState.expanded).toBe(false);
});

test('a collapsed group announces the number of new items and toggles on press', async () => {
  const onToggle = jest.fn();
  await render(<CollapsibleGroup title="Công việc" expanded={false} onToggle={onToggle} badge={10}><Text>Việc mới</Text></CollapsibleGroup>);
  expect(screen.queryByText('Việc mới')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Công việc, 10 mới'));
  expect(onToggle).toHaveBeenCalledTimes(1);
});

test('an expanded group does not show the badge', async () => {
  await render(<CollapsibleGroup title="Công việc" expanded onToggle={jest.fn()} badge={10}><Text>Việc mới</Text></CollapsibleGroup>);
  expect(screen.getByLabelText('Công việc')).toBeTruthy();
  expect(screen.queryByText('10')).toBeNull();
});
