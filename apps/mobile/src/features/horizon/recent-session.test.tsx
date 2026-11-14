import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { RecentSessionRow, type RecentSession } from './recent-session';

const session: RecentSession = { id: 's1', title: 'Hi', preview: 'Xin chào', timeLabel: '1 phút', phase: null, pinned: false };

function actionsOf() {
  return screen.getByLabelText('Ghim Hi').parent?.parent;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('the pin and options stay visible through a hover that leaves and returns within the release window', async () => {
  await render(<RecentSessionRow session={session} onPress={jest.fn()} onMore={jest.fn()} onTogglePin={jest.fn()}/>);
  const row = actionsOf()?.parent as NonNullable<ReturnType<typeof actionsOf>>;
  expect(actionsOf()?.props.pointerEvents).toBe('none');
  await fireEvent(row, 'hoverIn');
  expect(actionsOf()?.props.pointerEvents).toBe('auto');
  await fireEvent(row, 'hoverOut');
  await act(async () => { jest.advanceTimersByTime(60); });
  expect(actionsOf()?.props.pointerEvents).toBe('auto');
  await fireEvent(row, 'hoverIn');
  await act(async () => { jest.advanceTimersByTime(400); });
  expect(actionsOf()?.props.pointerEvents).toBe('auto');
});

test('the actions hide once the pointer has really left', async () => {
  await render(<RecentSessionRow session={session} onPress={jest.fn()} onMore={jest.fn()} onTogglePin={jest.fn()}/>);
  const row = actionsOf()?.parent as NonNullable<ReturnType<typeof actionsOf>>;
  await fireEvent(row, 'hoverIn');
  await fireEvent(row, 'hoverOut');
  await act(async () => { jest.advanceTimersByTime(400); });
  expect(actionsOf()?.props.pointerEvents).toBe('none');
});

test('the current session always shows its actions', async () => {
  await render(<RecentSessionRow session={session} active onPress={jest.fn()} onMore={jest.fn()} onTogglePin={jest.fn()}/>);
  expect(actionsOf()?.props.pointerEvents).toBe('auto');
});
