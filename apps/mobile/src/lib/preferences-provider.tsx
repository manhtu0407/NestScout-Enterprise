import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { deviceStorage } from './device-storage';
import { createPreferencesStore, defaultPreferences, type Preferences, type PreferencesStore } from './preferences';

type PreferencesContextValue = Preferences & { resolvedAppearance: 'light' | 'dark'; update: (patch: Partial<Preferences>) => void };

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const defaultStore = createPreferencesStore(deviceStorage);

type ProviderProps = { store?: PreferencesStore; children: ReactNode };

export function PreferencesProvider({ store = defaultStore, children }: ProviderProps) {
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const touched = useRef(false);
  const latest = useRef(defaultPreferences);
  const system = useColorScheme();

  useEffect(() => {
    let active = true;
    store.load().then(loaded => {
      if (!active || touched.current) return;
      latest.current = loaded;
      setPreferences(loaded);
    });
    return () => { active = false; };
  }, [store]);

  const update = useCallback((patch: Partial<Preferences>) => {
    touched.current = true;
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setPreferences(next);
    store.save(next).catch(() => undefined);
  }, [store]);

  const value = useMemo<PreferencesContextValue>(() => ({
    ...preferences,
    resolvedAppearance: preferences.appearance === 'system' ? (system === 'dark' ? 'dark' : 'light') : preferences.appearance,
    update,
  }), [preferences, system, update]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

const fallback: PreferencesContextValue = { ...defaultPreferences, resolvedAppearance: 'light', update: () => undefined };

export function usePreferences(): PreferencesContextValue {
  return useContext(PreferencesContext) ?? fallback;
}
