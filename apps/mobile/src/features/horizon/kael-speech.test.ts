import { act, renderHook } from '@testing-library/react-native';

import { useKaelSpeech } from './kael-speech';

type Spoken = { text: string; lang: string; onend: (() => void) | null; onerror: (() => void) | null };

function installSpeech() {
  const spoken: Spoken[] = [];
  const synthesis = { speak: jest.fn((utterance: Spoken) => { spoken.push(utterance); }), cancel: jest.fn() };
  function Utterance(this: Spoken, text: string) {
    this.text = text;
    this.lang = '';
    this.onend = null;
    this.onerror = null;
  }
  Object.assign(globalThis, { speechSynthesis: synthesis, SpeechSynthesisUtterance: Utterance });
  return { spoken, synthesis };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'speechSynthesis');
  Reflect.deleteProperty(globalThis, 'SpeechSynthesisUtterance');
});

test('without runtime speech support read-aloud is unavailable', async () => {
  const { result } = await renderHook(() => useKaelSpeech());
  expect(result.current.available).toBe(false);
});

test('a reply is read in Vietnamese and toggling stops it', async () => {
  const { spoken, synthesis } = installSpeech();
  const { result } = await renderHook(() => useKaelSpeech());
  expect(result.current.available).toBe(true);
  await act(async () => result.current.toggle('m1', 'Xin chào'));
  expect(spoken[0]).toMatchObject({ text: 'Xin chào', lang: 'vi-VN' });
  expect(result.current.speakingId).toBe('m1');
  await act(async () => result.current.toggle('m1', 'Xin chào'));
  expect(result.current.speakingId).toBeNull();
  expect(synthesis.cancel).toHaveBeenCalled();
});

test('a speech error is reported instead of silently stopping', async () => {
  const { spoken } = installSpeech();
  const { result } = await renderHook(() => useKaelSpeech());
  await act(async () => result.current.toggle('m2', 'Lỗi'));
  await act(async () => spoken[0]?.onerror?.());
  expect(result.current.speakingId).toBeNull();
  expect(result.current.failed).toBe(true);
});
