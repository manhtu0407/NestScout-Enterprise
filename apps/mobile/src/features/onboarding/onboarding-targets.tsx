import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode, type RefCallback } from 'react';
import type { HostInstance } from 'react-native';

import type { OnboardingTargetId } from './onboarding-steps';

export type TargetRect = Readonly<{ x: number; y: number; width: number; height: number }>;

export type OnboardingTargets = Readonly<{
  version: number;
  has: (id: OnboardingTargetId) => boolean;
  available: () => ReadonlySet<OnboardingTargetId>;
  measure: (id: OnboardingTargetId) => Promise<TargetRect | null>;
  register: (id: OnboardingTargetId, node: HostInstance) => void;
  unregister: (id: OnboardingTargetId, node: HostInstance) => void;
}>;

const TargetsContext = createContext<OnboardingTargets | null>(null);

export function OnboardingTargetsProvider({ children }: { children: ReactNode }) {
  const nodes = useRef(new Map<OnboardingTargetId, HostInstance>());
  const [version, setVersion] = useState(0);

  const register = useCallback((id: OnboardingTargetId, node: HostInstance) => {
    if (nodes.current.get(id) === node) return;
    nodes.current.set(id, node);
    setVersion(value => value + 1);
  }, []);

  const unregister = useCallback((id: OnboardingTargetId, node: HostInstance) => {
    if (nodes.current.get(id) !== node) return;
    nodes.current.delete(id);
    setVersion(value => value + 1);
  }, []);

  const value = useMemo<OnboardingTargets>(() => ({
    version,
    has: id => nodes.current.has(id),
    available: () => new Set(nodes.current.keys()),
    measure: id => new Promise(resolve => {
      const node = nodes.current.get(id);
      if (node === undefined) {
        resolve(null);
        return;
      }
      node.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
    }),
    register,
    unregister,
  }), [version, register, unregister]);

  return <TargetsContext.Provider value={value}>{children}</TargetsContext.Provider>;
}

export function useOnboardingTargets(): OnboardingTargets | null {
  return useContext(TargetsContext);
}

export function useOnboardingTarget(id: OnboardingTargetId): { ref?: RefCallback<HostInstance>; collapsable: false } {
  const targets = useContext(TargetsContext);
  const register = targets?.register;
  const unregister = targets?.unregister;
  const current = useRef<HostInstance | null>(null);
  const ref = useCallback<RefCallback<HostInstance>>(node => {
    if (node === null) {
      if (current.current !== null) unregister?.(id, current.current);
      current.current = null;
      return;
    }
    current.current = node;
    register?.(id, node);
  }, [id, register, unregister]);
  return register === undefined ? { collapsable: false } : { ref, collapsable: false };
}
