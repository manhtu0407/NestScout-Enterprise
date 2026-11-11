import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { ChatComposer } from './chat-composer';
import type { VoiceHandlers, VoiceSession } from './voice-input';
import { voiceFailureNotice } from './voice-input';

const mockStart = jest.fn();

jest.mock('./voice-input', () => ({
  ...jest.requireActual('./voice-input'),
  startVoiceInput: (...args: unknown[]) => mockStart(...args),
}));

type Fake = { handlers: VoiceHandlers; session: VoiceSession & { stop: jest.Mock; abort: jest.Mock } };

let fake: Fake | null = null;

function arm() {
  mockStart.mockImplementation(async (handlers: VoiceHandlers) => {
    const session = { stop: jest.fn(), abort: jest.fn() };
    fake = { handlers, session };
    return session;
  });
}

function Harness({ initial = '', onSubmit = jest.fn() }: { initial?: string; onSubmit?: jest.Mock }) {
  const [value, setValue] = useState(initial);
  return <ChatComposer value={value} onChange={setValue} onSubmit={onSubmit} />;
}

const field = () => screen.getByLabelText('Nhắn Kael');

beforeEach(() => {
  mockStart.mockReset();
  fake = null;
  arm();
});

test('tapping the mic opens the listening capsule', async () => {
  await render(<Harness />);
  expect(screen.queryByLabelText('Đang nghe')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Nói với Kael'));
  expect(screen.getByLabelText('Đang nghe')).toBeTruthy();
  expect(screen.getByLabelText('Hủy ghi âm')).toBeTruthy();
  expect(screen.getByLabelText('Dừng và đưa lời nói vào ô nhập')).toBeTruthy();
  expect(mockStart).toHaveBeenCalledTimes(1);
});

test('stopping puts the transcript in the field and does not send it', async () => {
  const onSubmit = jest.fn();
  await render(<Harness onSubmit={onSubmit} />);
  await fireEvent.press(screen.getByLabelText('Nói với Kael'));
  await fireEvent.press(screen.getByLabelText('Dừng và đưa lời nói vào ô nhập'));
  expect(fake?.session.stop).toHaveBeenCalledTimes(1);
  await act(async () => { fake?.handlers.onEnd('nhà mình bị rò nước'); });
  expect(screen.queryByLabelText('Đang nghe')).toBeNull();
  expect(field().props.value).toBe('nhà mình bị rò nước');
  expect(onSubmit).not.toHaveBeenCalled();
});

test('the transcript is appended after text already typed', async () => {
  await render(<Harness initial="Kael ơi," />);
  await fireEvent.press(screen.getByLabelText('Nói với Kael'));
  await fireEvent.press(screen.getByLabelText('Dừng và đưa lời nói vào ô nhập'));
  await act(async () => { fake?.handlers.onEnd('mình cần thợ điện'); });
  expect(field().props.value).toBe('Kael ơi, mình cần thợ điện');
});

test('cancelling aborts, closes the capsule and discards what was heard', async () => {
  await render(<Harness initial="giữ nguyên" />);
  await fireEvent.press(screen.getByLabelText('Nói với Kael'));
  await fireEvent.press(screen.getByLabelText('Hủy ghi âm'));
  expect(fake?.session.abort).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText('Đang nghe')).toBeNull();
  await act(async () => { fake?.handlers.onEnd('không được dùng'); });
  expect(field().props.value).toBe('giữ nguyên');
});

test.each(Object.keys(voiceFailureNotice) as (keyof typeof voiceFailureNotice)[])('a %s failure closes the capsule and explains why', async failure => {
  await render(<Harness />);
  await fireEvent.press(screen.getByLabelText('Nói với Kael'));
  await act(async () => { fake?.handlers.onFailure(failure); });
  expect(screen.queryByLabelText('Đang nghe')).toBeNull();
  expect(screen.getByText(voiceFailureNotice[failure])).toBeTruthy();
  expect(field().props.value).toBe('');
});

test('when speech input cannot start the capsule closes and the notice stays', async () => {
  mockStart.mockImplementation(async (handlers: VoiceHandlers) => {
    handlers.onFailure('unsupported');
    return null;
  });
  await render(<Harness />);
  await fireEvent.press(screen.getByLabelText('Nói với Kael'));
  expect(screen.queryByLabelText('Đang nghe')).toBeNull();
  expect(screen.getByText(voiceFailureNotice.unsupported)).toBeTruthy();
});

test('a second tap on the mic while listening does not start another session', async () => {
  await render(<Harness />);
  await fireEvent.press(screen.getByLabelText('Nói với Kael'));
  await fireEvent.press(screen.getByLabelText('Nói với Kael'));
  expect(mockStart).toHaveBeenCalledTimes(1);
});
