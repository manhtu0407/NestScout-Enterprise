import { act, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { KaelShimmerText, shimmerStops } from './kael-shimmer-text';
import { KaelStreamingText } from './kael-streaming-text';
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

test('Kael replies render Vietnamese Markdown with semantic headings, nesting, tables, code and safe links', async () => {
  const reply = '# Kiểm tra máy lạnh\n\nGiữ **an toàn**.\\*\nDòng hai\n\n1. Quan sát\n   - Ngắt điện\n\n| Mục | Tình trạng |\n| --- | --- |\n| Lọc | Bẩn |\n\n```ts\n  const dấu = 1 < 2;\n```\n\n[Hướng dẫn](https://example.com) [Nguy hiểm](javascript:alert(1)) ![ảnh](https://example.com/img.png) <script>bad()</script>';
  await render(<KaelStreamingText text={reply}/>);
  expect(screen.getByRole('header', { name: 'Kiểm tra máy lạnh' })).toBeTruthy();
  expect(screen.getByText('an toàn').props.style).toEqual(expect.objectContaining({ fontWeight: '700' }));
  expect(screen.getByText('1.')).toBeTruthy();
  expect(screen.getByText('•')).toBeTruthy();
  expect(screen.getByText('Ngắt điện')).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Tình trạng' })).toBeTruthy();
  expect(screen.getByText('Bẩn')).toBeTruthy();
  expect(screen.getByText('const dấu = 1 < 2;').props.children).toBe('  const dấu = 1 < 2;');
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.queryByRole('image')).toBeNull();
  expect(screen.getByText('Hướng dẫn')).toBeTruthy();
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

test('split Markdown, Vietnamese and emoji stream to the same final tree as restored history', async () => {
  jest.useFakeTimers();
  const reply = '# Bảo trì 🧰\n\n**Bước đầu**\n\n- Ngắt điện\n\n```ts\n  const x = 1;\n```';
  const view = await render(<KaelStreamingText text="#" streaming/>);
  for (let i = 2, seed = 17; i <= reply.length; i += 1 + seed % 4) {
    await view.rerender(<KaelStreamingText text={reply.slice(0, i)} streaming/>);
    await act(() => { jest.advanceTimersByTime(90); });
    seed = (seed * 13 + 7) % 97;
  }
  await view.rerender(<KaelStreamingText text={reply}/>);
  const completed = view.toJSON();
  await view.unmount();
  const restored = await render(<KaelStreamingText text={reply}/>);
  expect(restored.toJSON()).toEqual(completed);
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
