import { Platform, Share } from 'react-native';

import { shareConversation, transcriptOf } from './conversation-share';

const messages = [{ role: 'user' as const, text: 'Vòi nước bị rò' }, { role: 'assistant' as const, text: 'Kael sẽ giúp bạn.' }];

afterEach(() => jest.restoreAllMocks());

test('the transcript labels each speaker, skips blank messages and starts with a heading', () => {
  expect(transcriptOf([...messages, { role: 'user', text: '   ' }])).toBe('Cuộc trò chuyện với Kael\n\nBạn: Vòi nước bị rò\n\nKael: Kael sẽ giúp bạn.');
  expect(transcriptOf([])).toBe('');
});

test('an empty conversation is never shared', async () => {
  const share = jest.spyOn(Share, 'share');
  expect(await shareConversation([])).toBe('empty');
  expect(share).not.toHaveBeenCalled();
});

test('the transcript goes to the system share sheet', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
  expect(await shareConversation(messages)).toBe('shared');
  expect(share).toHaveBeenCalledWith({ message: transcriptOf(messages) });
});

test('on the web a missing share sheet falls back to copying the transcript', async () => {
  jest.spyOn(Share, 'share').mockRejectedValue(new Error('unsupported'));
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText } }, configurable: true });
  const platform = jest.replaceProperty(Platform, 'OS', 'web');
  expect(await shareConversation(messages)).toBe('copied');
  expect(writeText).toHaveBeenCalledWith(transcriptOf(messages));
  platform.restore();
});

test('sharing reports failure when neither the share sheet nor the clipboard works', async () => {
  jest.spyOn(Share, 'share').mockRejectedValue(new Error('unsupported'));
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  expect(await shareConversation(messages)).toBe('failed');
});
