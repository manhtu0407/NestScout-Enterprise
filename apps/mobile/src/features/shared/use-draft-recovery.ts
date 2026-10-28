import { useState } from 'react';

export function useDraftRecovery() {
  const [attempt, setAttempt] = useState(0);
  const [unreadable, setUnreadable] = useState(false);
  return {
    attempt,
    unreadable,
    setUnreadable,
    retry: () => {
      setUnreadable(false);
      setAttempt((count) => count + 1);
    },
  };
}
