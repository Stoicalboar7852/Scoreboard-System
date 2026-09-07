/** Small deterministic PRNG (mulberry32) so draws are reproducible for a given seed. */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** Returns a shuffled copy (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** Picks one element; throws on empty input. */
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  let state = Math.floor(seed) >>> 0 || 0x9e3779b9;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number): number => {
    if (!Number.isInteger(n) || n <= 0)
      throw new Error(`int(n) requires a positive integer, got ${n}`);
    return Math.floor(next() * n);
  };
  return {
    next,
    int,
    shuffle<T>(items: readonly T[]): T[] {
      const copy = items.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const tmp = copy[i] as T;
        copy[i] = copy[j] as T;
        copy[j] = tmp;
      }
      return copy;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('pick() on empty list');
      return items[int(items.length)] as T;
    },
  };
}

/** Derives a numeric seed from any string (FNV-1a), for human-friendly seed inputs. */
export function seedFromString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
