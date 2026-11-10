import { useCallback, useEffect, useRef, useState } from 'react';

type Utterance = { lang: string; onend: (() => void) | null; onerror: (() => void) | null };
type Synthesis = { speak: (utterance: Utterance) => void; cancel: () => void };
type SpeechHost = { synthesis: Synthesis; create: (text: string) => Utterance | null };

export type KaelSpeech = {
  available: boolean;
  speakingId: string | null;
  failed: boolean;
  toggle: (id: string, text: string) => void;
};

function isSynthesis(value: unknown): value is Synthesis {
  return typeof value === 'object' && value !== null
    && typeof Reflect.get(value, 'speak') === 'function' && typeof Reflect.get(value, 'cancel') === 'function';
}

function isUtterance(value: unknown): value is Utterance {
  return typeof value === 'object' && value !== null && 'lang' in value;
}

function speechHost(): SpeechHost | null {
  const synthesis: unknown = Reflect.get(globalThis, 'speechSynthesis');
  const constructor: unknown = Reflect.get(globalThis, 'SpeechSynthesisUtterance');
  if (!isSynthesis(synthesis) || typeof constructor !== 'function') return null;
  return {
    synthesis,
    create: text => {
      const utterance: unknown = Reflect.construct(constructor, [text]);
      return isUtterance(utterance) ? utterance : null;
    },
  };
}

export function useKaelSpeech(): KaelSpeech {
  const [host] = useState(speechHost);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const activeRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (activeRef.current !== null) host?.synthesis.cancel();
  }, [host]);

  const toggle = useCallback((id: string, text: string) => {
    if (host === null) return;
    host.synthesis.cancel();
    if (activeRef.current === id) {
      activeRef.current = null;
      setSpeakingId(null);
      return;
    }
    const finish = (error: boolean) => {
      if (activeRef.current !== id) return;
      activeRef.current = null;
      setSpeakingId(null);
      setFailed(error);
    };
    const utterance = host.create(text);
    if (utterance === null) {
      setFailed(true);
      return;
    }
    utterance.lang = 'vi-VN';
    utterance.onend = () => finish(false);
    utterance.onerror = () => finish(true);
    activeRef.current = id;
    setFailed(false);
    setSpeakingId(id);
    try {
      host.synthesis.speak(utterance);
    } catch {
      finish(true);
    }
  }, [host]);

  return { available: host !== null, speakingId, failed, toggle };
}
