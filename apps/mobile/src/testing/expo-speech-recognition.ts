const listeners = new Map<string, Set<(event: unknown) => void>>();

export const ExpoSpeechRecognitionModule = {
  isRecognitionAvailable: jest.fn(() => false),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false })),
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
  addListener: jest.fn((name: string, listener: (event: unknown) => void) => {
    const set = listeners.get(name) ?? new Set();
    set.add(listener);
    listeners.set(name, set);
    return { remove: () => { set.delete(listener); } };
  }),
};

export function emitSpeechEvent(name: string, event: unknown) {
  for (const listener of [...(listeners.get(name) ?? [])]) listener(event);
}

export function clearSpeechListeners() {
  listeners.clear();
}
