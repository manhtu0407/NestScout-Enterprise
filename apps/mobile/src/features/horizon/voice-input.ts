import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { Platform } from 'react-native';

export type VoiceFailure = 'permission' | 'unsupported' | 'no-speech' | 'network' | 'interrupted' | 'failed';

export type VoiceHandlers = {
  onTranscript: (text: string) => void;
  onEnd: (transcript: string) => void;
  onFailure: (failure: VoiceFailure) => void;
};

export type VoiceSession = { stop: () => void; abort: () => void };

export const voiceLanguage = 'vi-VN';

const failureByCode: Readonly<Record<string, VoiceFailure>> = {
  'not-allowed': 'permission',
  'service-not-allowed': 'permission',
  'language-not-supported': 'unsupported',
  'bad-grammar': 'unsupported',
  'no-speech': 'no-speech',
  'speech-timeout': 'no-speech',
  network: 'network',
  interrupted: 'interrupted',
};

export function failureForCode(code: string): VoiceFailure | null {
  if (code === 'aborted') return null;
  return failureByCode[code] ?? 'failed';
}

export function voiceInputAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export function joinUtterances(parts: readonly string[]): string {
  return parts.map(part => part.trim()).filter(part => part !== '').join(' ');
}

export async function startVoiceInput(handlers: VoiceHandlers): Promise<VoiceSession | null> {
  if (!voiceInputAvailable()) {
    handlers.onFailure('unsupported');
    return null;
  }
  if (Platform.OS !== 'web') {
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      handlers.onFailure('permission');
      return null;
    }
  }
  const finalized: string[] = [];
  let interim = '';
  const spoken = () => joinUtterances([...finalized, interim]);
  let settled = false;
  const subscriptions = [
    ExpoSpeechRecognitionModule.addListener('result', event => {
      const heard = event.results[0]?.transcript ?? '';
      if (event.isFinal) {
        if (heard.trim() !== '') finalized.push(heard);
        interim = '';
      } else {
        interim = heard;
      }
      handlers.onTranscript(spoken());
    }),
    ExpoSpeechRecognitionModule.addListener('error', event => {
      const failure = failureForCode(event.error);
      if (failure !== null) handlers.onFailure(failure);
    }),
    ExpoSpeechRecognitionModule.addListener('end', () => {
      if (settled) return;
      settled = true;
      for (const subscription of subscriptions) subscription.remove();
      handlers.onEnd(spoken());
    }),
  ];
  try {
    ExpoSpeechRecognitionModule.start({ lang: voiceLanguage, interimResults: true, continuous: true });
  } catch {
    settled = true;
    for (const subscription of subscriptions) subscription.remove();
    handlers.onFailure('failed');
    return null;
  }
  return {
    stop: () => ExpoSpeechRecognitionModule.stop(),
    abort: () => ExpoSpeechRecognitionModule.abort(),
  };
}

export function appendTranscript(current: string, transcript: string): string {
  const spoken = transcript.trim();
  if (spoken === '') return current;
  if (current.trim() === '') return spoken;
  return `${current.replace(/\s+$/, '')} ${spoken}`;
}

export const voiceFailureNotice: Readonly<Record<VoiceFailure, string>> = {
  permission: 'NestScout chưa có quyền dùng micro hoặc nhận dạng giọng nói. Hãy bật quyền trong Cài đặt.',
  unsupported: 'Thiết bị này chưa hỗ trợ nhận dạng giọng nói tiếng Việt.',
  'no-speech': 'Kael chưa nghe thấy giọng nói. Hãy thử nói lại gần micro hơn.',
  network: 'Không kết nối được dịch vụ nhận dạng giọng nói. Hãy kiểm tra mạng rồi thử lại.',
  interrupted: 'Ghi âm bị gián đoạn nên Kael chưa nhận được lời nói.',
  failed: 'Ghi âm gặp lỗi nên Kael chưa nhận được lời nói. Vui lòng thử lại.',
};
