import { useEffect, useRef, useState } from 'react';
import { useLiveStore } from '../store/liveStore.js';

/**
 * Server time that re-renders at most `intervalMs` (default 250 ms). For the big countdown
 * digits use <Countdown>, which writes the DOM directly from requestAnimationFrame.
 */
export function useServerNow(intervalMs = 250): number {
  const offset = useLiveStore((s) => s.offsetMs);
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const tick = () => setNow(Date.now() + offset);
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [offset, intervalMs]);
  return now;
}

/** A ref to server time that never causes renders; read it inside rAF callbacks. */
export function useServerNowRef(): { current: () => number } {
  const offset = useLiveStore((s) => s.offsetMs);
  const ref = useRef(() => Date.now() + offset);
  ref.current = () => Date.now() + offset;
  return ref;
}
