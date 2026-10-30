import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { KaelStatusAvatar } from './kael-status-avatar';

type FakePlayer = { play: jest.Mock; currentTime: number; pause: jest.Mock; loop: boolean; muted: boolean };
const players: FakePlayer[] = [];

jest.mock('expo-video', () => {
  const { useState } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useVideoPlayer: (_source: number, setup?: (player: FakePlayer) => void) => {
      const [player] = useState(() => {
        const created: FakePlayer = { play: jest.fn(), currentTime: 1, pause: jest.fn(), loop: false, muted: false };
        setup?.(created);
        players.push(created);
        return created;
      });
      return player;
    },
    VideoView: () => <View />,
  };
});

beforeEach(() => {
  players.length = 0;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

type Slot = 'idle' | 'researching' | 'working' | 'completed';
const slotKeys: readonly Slot[] = ['idle', 'researching', 'working', 'completed'];

function latest(): Record<Slot, FakePlayer> {
  const [idle, researching, working, completed] = players.slice(-4) as [FakePlayer, FakePlayer, FakePlayer, FakePlayer];
  return { idle, researching, working, completed };
}

test('idle plays only the looping greeting video from the start', async () => {
  await render(<KaelStatusAvatar phase={null} />);
  expect(screen.getByLabelText('Kael đang sẵn sàng')).toBeTruthy();
  const current = latest();
  expect(current.idle.play).toHaveBeenCalled();
  expect(current.idle.currentTime).toBe(0);
  expect(current.idle.loop).toBe(true);
  for (const key of ['researching', 'working', 'completed'] as const) {
    expect(current[key].play).not.toHaveBeenCalled();
  }
});

test.each([
  ['researching', 'Kael đang nghiên cứu'],
  ['working', 'Kael đang chuẩn bị câu trả lời'],
  ['completed', 'Kael đã trả lời xong'],
] as const)('%s plays only its own video from the start', async (phase, label) => {
  await render(<KaelStatusAvatar phase={phase} />);
  expect(screen.getByLabelText(label)).toBeTruthy();
  const current = latest();
  for (const key of slotKeys) {
    if (key === phase) {
      expect(current[key].play).toHaveBeenCalled();
      expect(current[key].currentTime).toBe(0);
    } else {
      expect(current[key].play).not.toHaveBeenCalled();
      expect(current[key].pause).toHaveBeenCalled();
    }
  }
});

test('every state loops continuously and only stops when another state takes over', async () => {
  await render(<KaelStatusAvatar phase="completed" />);
  const current = latest();
  for (const key of slotKeys) {
    expect(current[key].loop).toBe(true);
  }
});

test('the avatar follows an externally controlled phase back to idle without a timer', async () => {
  const view = await render(<KaelStatusAvatar phase="researching" />);
  const before = latest();
  await view.rerender(<KaelStatusAvatar phase="working" />);
  expect(before.working.play).toHaveBeenCalled();
  expect(before.researching.pause).toHaveBeenCalled();
  await view.rerender(<KaelStatusAvatar phase="completed" />);
  expect(before.completed.play).toHaveBeenCalled();
  before.idle.play.mockClear();
  await view.rerender(<KaelStatusAvatar phase={null} />);
  expect(screen.getByLabelText('Kael đang sẵn sàng')).toBeTruthy();
  expect(before.idle.play).toHaveBeenCalled();
  expect(before.completed.pause).toHaveBeenCalled();
});

test('reduce motion shows the poster and never plays video', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  await render(<KaelStatusAvatar phase="working" />);
  await act(async () => { await Promise.resolve(); });
  const current = latest();
  for (const key of slotKeys) {
    expect(current[key].play).not.toHaveBeenCalled();
  }
  expect(current.working.pause).toHaveBeenCalled();
});

test('reduce motion keeps the greeting poster instead of the video at idle', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  await render(<KaelStatusAvatar phase={null} />);
  await act(async () => { await Promise.resolve(); });
  expect(latest().idle.play).not.toHaveBeenCalled();
});
