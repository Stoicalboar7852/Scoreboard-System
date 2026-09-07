import { describe, expect, it } from 'vitest';
import { createRng, seedFromString } from './random.js';

describe('createRng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(new Set(seqA).size).toBeGreaterThan(5);
  });
  it('differs between seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });
  it('produces ints in range and shuffles as a permutation', () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) {
      const v = rng.int(5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
    }
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = rng.shuffle(items);
    expect(shuffled).toHaveLength(8);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it('validates arguments', () => {
    const rng = createRng(1);
    expect(() => rng.int(0)).toThrow();
    expect(() => rng.pick([])).toThrow();
    expect([1, 2, 3]).toContain(rng.pick([1, 2, 3]));
  });
  it('treats seed 0 as a usable seed', () => {
    expect(createRng(0).next()).toBe(createRng(0).next());
  });
  it('hashes strings to seeds', () => {
    expect(seedFromString('season-2026')).toBe(seedFromString('season-2026'));
    expect(seedFromString('a')).not.toBe(seedFromString('b'));
  });
});
