import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { HeartToggle } from './motion-heart';
import { PopBadge, RollingNumber } from './motion-count';
import { Presence } from './motion-presence';
import { SavedWorkersScreen } from './saved-workers-screen';
import type { SavedWorker } from './content';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const settle = async () => {
  await act(async () => { jest.advanceTimersByTime(1000); });
};

test('a presence keeps its content mounted until the exit finishes and then reports it', async () => {
  const onExited = jest.fn();
  const view = await render(<Presence visible onExited={onExited}><Text>Đã lưu</Text></Presence>);
  expect(screen.getByText('Đã lưu')).toBeTruthy();
  await view.rerender(<Presence visible={false} onExited={onExited}><Text>Đã lưu</Text></Presence>);
  expect(screen.getByText('Đã lưu')).toBeTruthy();
  expect(onExited).not.toHaveBeenCalled();
  await settle();
  expect(screen.queryByText('Đã lưu')).toBeNull();
  expect(onExited).toHaveBeenCalledTimes(1);
});

test('a presence that starts hidden renders nothing and mounts when it becomes visible', async () => {
  const view = await render(<Presence visible={false}><Text>Thông báo</Text></Presence>);
  expect(screen.queryByText('Thông báo')).toBeNull();
  await view.rerender(<Presence visible><Text>Thông báo</Text></Presence>);
  expect(screen.getByText('Thông báo')).toBeTruthy();
});

test('showing a presence again during its exit cancels the exit', async () => {
  const onExited = jest.fn();
  const view = await render(<Presence visible onExited={onExited}><Text>Thông báo</Text></Presence>);
  await view.rerender(<Presence visible={false} onExited={onExited}><Text>Thông báo</Text></Presence>);
  await view.rerender(<Presence visible onExited={onExited}><Text>Thông báo</Text></Presence>);
  await settle();
  expect(screen.getByText('Thông báo')).toBeTruthy();
  expect(onExited).not.toHaveBeenCalled();
});

test('a badge shows its count, follows changes and leaves when the count returns to zero', async () => {
  const view = await render(<PopBadge count={0}/>);
  expect(screen.queryByText('0')).toBeNull();
  await view.rerender(<PopBadge count={3}/>);
  expect(screen.getByText('3')).toBeTruthy();
  await view.rerender(<PopBadge count={4}/>);
  await settle();
  expect(screen.getByText('4')).toBeTruthy();
  expect(screen.queryByText('3')).toBeNull();
  await view.rerender(<PopBadge count={0}/>);
  await settle();
  expect(screen.queryByText('4')).toBeNull();
});

test('a badge stays hidden while its owner is not visible', async () => {
  await render(<PopBadge count={10} visible={false}/>);
  expect(screen.queryByText('10')).toBeNull();
});

test('a rolling number shows the outgoing value only while it rolls', async () => {
  const view = await render(<RollingNumber value={2}/>);
  await view.rerender(<RollingNumber value={5}/>);
  expect(screen.getByText('5')).toBeTruthy();
  expect(screen.getByText('2')).toBeTruthy();
  await settle();
  expect(screen.queryByText('2')).toBeNull();
  expect(screen.getByText('5')).toBeTruthy();
});

test('the heart reports whether the worker is saved and forwards presses', async () => {
  const onPress = jest.fn();
  const view = await render(<HeartToggle saved accessibilityLabel="Bỏ lưu Thợ An" iconSize={22} onPress={onPress}/>);
  expect(screen.getByLabelText('Bỏ lưu Thợ An').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByLabelText('Bỏ lưu Thợ An'));
  expect(onPress).toHaveBeenCalledTimes(1);
  await view.rerender(<HeartToggle saved={false} accessibilityLabel="Bỏ lưu Thợ An" iconSize={22} onPress={onPress}/>);
  await settle();
  expect(screen.getByLabelText('Bỏ lưu Thợ An').props.accessibilityState.selected).toBe(false);
});

const worker: SavedWorker = {
  id: 'w1', name: 'Thợ An', trade: 'Điện nước', area: 'Quận 1', savedLabel: 'Đã lưu hôm nay', experienceYears: 5, reviewCount: 0, ratingAverage: 0, completedJobs: 0,
  skills: ['Sửa vòi'], strengths: [], serviceAreas: ['Quận 1'], reviews: [],
};

test('unsaving a worker removes the card after its exit', async () => {
  await render(<SavedWorkersScreen items={[worker]} onBack={jest.fn()}/>);
  await fireEvent.press(screen.getByLabelText('Bỏ lưu Thợ An'));
  expect(screen.getByText('Thợ An')).toBeTruthy();
  await settle();
  expect(screen.queryByText('Thợ An')).toBeNull();
  expect(screen.getByText('Chưa lưu thợ nào')).toBeTruthy();
});

test('the worker details open and close from the toggle', async () => {
  await render(<SavedWorkersScreen items={[worker]} onBack={jest.fn()}/>);
  expect(screen.queryByText('Khu vực nhận việc')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Xem chi tiết hồ sơ Thợ An'));
  expect(screen.getByText('Khu vực nhận việc')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Thu gọn hồ sơ Thợ An'));
  await settle();
  expect(screen.queryByText('Khu vực nhận việc')).toBeNull();
});
