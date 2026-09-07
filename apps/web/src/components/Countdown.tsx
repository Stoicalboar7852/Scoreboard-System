import { useEffect, useRef } from 'react';
import { formatClock } from '@scoreboard/shared';
import { useLiveStore } from '../store/liveStore.js';

interface Props {
  /** Absolute server time the countdown reaches zero; null shows `staticMs`. */
  endsAtMs: number | null;
  /** Fixed value to show when not counting (paused / idle). */
  staticMs?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Countdown digits driven by requestAnimationFrame and written straight to the DOM, so a
 * running clock costs no React renders (kiosk-friendly). Only repaints when the text changes.
 */
export function Countdown({ endsAtMs, staticMs = 0, className, style }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const offset = useLiveStore((s) => s.offsetMs);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    let last = '';
    const paint = () => {
      const text =
        endsAtMs === null ? formatClock(staticMs) : formatClock(endsAtMs - (Date.now() + offset));
      if (text !== last) {
        el.textContent = text;
        last = text;
      }
      if (endsAtMs !== null) frame = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(frame);
  }, [endsAtMs, staticMs, offset]);
  return (
    <span
      ref={ref}
      className={className}
      style={{ fontVariantNumeric: 'tabular-nums', ...style }}
      aria-live="off"
    />
  );
}
