import { ExpoSpeechRecognitionModule, clearSpeechListeners, emitSpeechEvent } from '@/testing/expo-speech-recognition';

import { appendTranscript, failureForCode, startVoiceInput, voiceInputAvailable, voiceLanguage } from './voice-input';

const module = jest.mocked(ExpoSpeechRecognitionModule);

function handlers() {
  return { onTranscript: jest.fn(), onEnd: jest.fn(), onFailure: jest.fn() };
}

beforeEach(() => {
  clearSpeechListeners();
  module.isRecognitionAvailable.mockReturnValue(true);
  module.requestPermissionsAsync.mockResolvedValue({ granted: true });
  module.start.mockReset();
});

test('reports unavailable recognition without asking for permission', async () => {
  module.isRecognitionAvailable.mockReturnValue(false);
  const target = handlers();
  expect(voiceInputAvailable()).toBe(false);
  expect(await startVoiceInput(target)).toBeNull();
  expect(target.onFailure).toHaveBeenCalledWith('unsupported');
  expect(module.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(module.start).not.toHaveBeenCalled();
});

test('treats a throwing availability probe as unavailable', () => {
  module.isRecognitionAvailable.mockImplementation(() => { throw new Error('native'); });
  expect(voiceInputAvailable()).toBe(false);
});

test('stops at a denied permission and never starts listening', async () => {
  module.requestPermissionsAsync.mockResolvedValue({ granted: false });
  const target = handlers();
  expect(await startVoiceInput(target)).toBeNull();
  expect(target.onFailure).toHaveBeenCalledWith('permission');
  expect(module.start).not.toHaveBeenCalled();
});

test('listens in Vietnamese with interim results and returns the latest transcript on end', async () => {
  const target = handlers();
  const session = await startVoiceInput(target);
  expect(session).not.toBeNull();
  expect(module.start).toHaveBeenCalledWith(expect.objectContaining({ lang: voiceLanguage, interimResults: true }));
  emitSpeechEvent('result', { isFinal: false, results: [{ transcript: 'nhà mình' }] });
  emitSpeechEvent('result', { isFinal: true, results: [{ transcript: 'nhà mình bị rò nước' }] });
  emitSpeechEvent('end', null);
  expect(target.onTranscript).toHaveBeenLastCalledWith('nhà mình bị rò nước');
  expect(target.onEnd).toHaveBeenCalledWith('nhà mình bị rò nước');
});

test('end is delivered once and stops listening for later events', async () => {
  const target = handlers();
  await startVoiceInput(target);
  emitSpeechEvent('end', null);
  emitSpeechEvent('end', null);
  emitSpeechEvent('result', { isFinal: true, results: [{ transcript: 'muộn' }] });
  expect(target.onEnd).toHaveBeenCalledTimes(1);
  expect(target.onTranscript).not.toHaveBeenCalled();
});

test('forwards stop and abort to the recogniser', async () => {
  const session = await startVoiceInput(handlers());
  session?.stop();
  session?.abort();
  expect(module.stop).toHaveBeenCalledTimes(1);
  expect(module.abort).toHaveBeenCalledTimes(1);
});

test('a start that throws is reported and leaves no listeners behind', async () => {
  module.start.mockImplementation(() => { throw new Error('busy'); });
  const target = handlers();
  expect(await startVoiceInput(target)).toBeNull();
  expect(target.onFailure).toHaveBeenCalledWith('failed');
  emitSpeechEvent('end', null);
  expect(target.onEnd).not.toHaveBeenCalled();
});

test('maps recogniser error codes and ignores the user’s own abort', async () => {
  const target = handlers();
  await startVoiceInput(target);
  emitSpeechEvent('error', { error: 'aborted', message: '' });
  expect(target.onFailure).not.toHaveBeenCalled();
  emitSpeechEvent('error', { error: 'no-speech', message: '' });
  expect(target.onFailure).toHaveBeenCalledWith('no-speech');
  expect(failureForCode('not-allowed')).toBe('permission');
  expect(failureForCode('service-not-allowed')).toBe('permission');
  expect(failureForCode('language-not-supported')).toBe('unsupported');
  expect(failureForCode('speech-timeout')).toBe('no-speech');
  expect(failureForCode('network')).toBe('network');
  expect(failureForCode('interrupted')).toBe('interrupted');
  expect(failureForCode('audio-capture')).toBe('failed');
});

describe('appendTranscript', () => {
  it.each([
    ['', 'xin chào', 'xin chào'],
    ['   ', 'xin chào', 'xin chào'],
    ['Kael ơi,', 'mình cần thợ', 'Kael ơi, mình cần thợ'],
    ['Kael ơi,  \n', ' mình cần thợ ', 'Kael ơi, mình cần thợ'],
    ['giữ nguyên', '   ', 'giữ nguyên'],
  ])('joins %j and %j into %j', (current, spoken, expected) => {
    expect(appendTranscript(current, spoken)).toBe(expected);
  });
});
