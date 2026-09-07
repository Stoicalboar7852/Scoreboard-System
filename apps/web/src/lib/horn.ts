/**
 * End-of-phase horn synthesised with Web Audio (no asset to cache, works offline).
 * Browsers require a user gesture before audio can play; kiosks can allow autoplay by policy
 * (see docs/KIOSK-SETUP.md). Failures are swallowed: a silent horn must never break a display.
 */
let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  return context;
}

/** Warms up the audio context from a user gesture so later horns are allowed. */
export async function unlockAudio(): Promise<boolean> {
  const ctx = audio();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    return ctx.state === 'running';
  } catch {
    return false;
  }
}

export function playHorn(durationMs = 1200): void {
  const ctx = audio();
  if (!ctx || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.6, now + 0.03);
    gain.gain.setValueAtTime(0.6, now + durationMs / 1000 - 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    gain.connect(ctx.destination);
    for (const [freq, type] of [
      [220, 'sawtooth'],
      [330, 'square'],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + durationMs / 1000);
    }
  } catch {
    // ignore: audio is optional
  }
}
