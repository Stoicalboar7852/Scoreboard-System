import { useEffect, useState } from 'react';

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
}

/** Keeps the screen on while the component is mounted (re-acquires when the tab returns). */
export function useWakeLock(enabled = true): { active: boolean; supported: boolean } {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!enabled || !supported) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const lock = (await (
          navigator as unknown as {
            wakeLock: { request: (t: 'screen') => Promise<WakeLockSentinelLike> };
          }
        ).wakeLock.request('screen')) as WakeLockSentinelLike;
        if (cancelled) {
          await lock.release();
          return;
        }
        sentinel = lock;
        setActive(true);
        lock.addEventListener('release', () => setActive(false));
      } catch {
        setActive(false);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release();
    };
  }, [enabled, supported]);

  return { active, supported };
}
