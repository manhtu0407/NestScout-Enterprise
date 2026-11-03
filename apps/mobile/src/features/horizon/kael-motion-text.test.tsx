import { render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { KaelShimmerText, shimmerStops } from './kael-shimmer-text';
import { KaelStreamingText, splitWords, streamTiming } from './kael-streaming-text';
import { KaelStepNotes } from './kael-step-notes';
import { KaelThinkingRow, isKaelThinking } from './kael-thinking-row';
import { KaelThinkingStatus } from './kael-thinking-status';

const metrics = horizonLayout.kaelMotion;

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function reduceMotion(value: boolean) {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(value);
}

test('every character of a shimmer line peaks later than the one before it', () => {
  const count = 12;
  const peaks = Array.from({ length: count }, (_, index) => shimmerStops(index, count, metrics.shimmerSpan)[1]);
  expect(peaks).toEqual([...peaks].sort((a, b) => a - b));
  for (let index = 0; index < count; index += 1) {
    const [start, peak, end] = shimmerStops(index, count, metrics.shimmerSpan);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(start).toBeLessThan(peak);
    expect(peak).toBeLessThan(end);
    expect(end).toBeLessThanOrEqual(1);
  }
});

test('a single character still produces a valid shimmer range', () => {
  const [start, peak, end] = shimmerStops(0, 1, metrics.shimmerSpan);
  expect(start).toBeLessThan(peak);
  expect(peak).toBeLessThan(end);
});

test('words split on any whitespace and ignore leading and trailing space', () => {
  expect(splitWords('  Kael  đang\ttìm thợ\n')).toEqual(['Kael', 'đang', 'tìm', 'thợ']);
  expect(splitWords('   ')).toEqual([]);
});

test('streaming keeps the word cadence for short answers and compresses it for long ones', () => {
  expect(streamTiming(1).total).toBe(metrics.streamWordDuration);
  expect(streamTiming(5)).toEqual({ gap: metrics.streamWordGap, total: 4 * metrics.streamWordGap + metrics.streamWordDuration });
  const long = streamTiming(400);
  expect(long.gap).toBeLessThan(metrics.streamWordGap);
  expect(long.total).toBeCloseTo(metrics.streamMaxDuration);
});

test('streamed text exposes the whole answer to assistive technology', async () => {
  reduceMotion(false);
  await render(<KaelStreamingText text="Kael đã tìm được ba thợ gần bạn"/>);
  expect(screen.getByLabelText('Kael đã tìm được ba thợ gần bạn')).toBeTruthy();
});

test('text that should not animate renders as one plain line', async () => {
  await render(<KaelStreamingText text="Kael đã tìm được ba thợ gần bạn" animate={false}/>);
  expect(screen.getByText('Kael đã tìm được ba thợ gần bạn')).toBeTruthy();
});

test('Reduce Motion turns streaming and shimmer into plain text', async () => {
  reduceMotion(true);
  await render(<><KaelStreamingText text="Đã có báo giá"/><KaelShimmerText>Đang tìm thợ phù hợp…</KaelShimmerText></>);
  await waitFor(() => expect(screen.getByText('Đã có báo giá')).toBeTruthy());
  expect(screen.getByText('Đang tìm thợ phù hợp…')).toBeTruthy();
});

test('the thinking status shows the latest label and announces it politely', async () => {
  reduceMotion(true);
  const view = await render(<KaelThinkingStatus label="Kael đang làm rõ nhu cầu"/>);
  expect(screen.getByLabelText('Kael đang làm rõ nhu cầu').props.accessibilityLiveRegion).toBe('polite');
  await view.rerender(<KaelThinkingStatus label="Đang tìm thợ phù hợp…"/>);
  await waitFor(() => expect(screen.getByLabelText('Đang tìm thợ phù hợp…')).toBeTruthy());
  expect(screen.queryByLabelText('Kael đang làm rõ nhu cầu')).toBeNull();
});

test('step notes show every line at once without implying live reasoning', async () => {
  await render(<KaelStepNotes lines={['Đối chiếu yêu cầu', 'Kiểm tra lịch trống']}/>);
  expect(screen.getByText('Đối chiếu yêu cầu')).toBeTruthy();
  expect(screen.getByText('Kiểm tra lịch trống')).toBeTruthy();
});

test('streaming text keeps earlier words and adds only the new ones when the answer grows', async () => {
  reduceMotion(false);
  const view = await render(<KaelStreamingText text="Kael đã tìm được"/>);
  expect(screen.getByLabelText('Kael đã tìm được')).toBeTruthy();
  await view.rerender(<KaelStreamingText text="Kael đã tìm được ba thợ"/>);
  expect(screen.getByLabelText('Kael đã tìm được ba thợ')).toBeTruthy();
  expect(screen.getAllByText('Kael')).toHaveLength(1);
});

test('only the phases where Kael is still working show the thinking row', async () => {
  expect(isKaelThinking(null)).toBe(false);
  expect(isKaelThinking('clarifying')).toBe(true);
  expect(isKaelThinking('matching')).toBe(true);
  expect(isKaelThinking('quotes')).toBe(false);
  expect(isKaelThinking('completed')).toBe(false);
  jest.useFakeTimers();
  await render(<KaelThinkingRow phase="matching"/>);
  expect(screen.getByLabelText('Đang tìm thợ phù hợp…')).toBeTruthy();
});

test('an issue replaces the busy wording so the row never implies progress', async () => {
  jest.useFakeTimers();
  await render(<KaelThinkingRow phase="matching" issue="unavailable"/>);
  expect(screen.getByLabelText('Chưa thể ghép thợ lúc này')).toBeTruthy();
  expect(screen.queryByLabelText('Đang tìm thợ phù hợp…')).toBeNull();
  expect(screen.getByText('Việc ghép thợ tạm thời chưa khả dụng. Chưa có thợ nào được xác nhận.')).toBeTruthy();
  expect(screen.queryByText(/Việc tiếp theo/)).toBeNull();
});
