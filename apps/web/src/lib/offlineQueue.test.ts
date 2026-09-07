import { beforeEach, describe, expect, it } from 'vitest';
import { OfflineQueue } from './offlineQueue.js';

describe('OfflineQueue', () => {
  beforeEach(() => localStorage.clear());

  it('persists across instances and replays in order', async () => {
    const q = new OfflineQueue<{ n: number }>('test.queue');
    q.enqueue('a', { n: 1 });
    q.enqueue('b', { n: 2 });
    const reloaded = new OfflineQueue<{ n: number }>('test.queue');
    expect(reloaded.size).toBe(2);
    const sent: string[] = [];
    const result = await reloaded.drain(async (item) => {
      sent.push(item.actionId);
      return true;
    });
    expect(sent).toEqual(['a', 'b']);
    expect(result).toEqual({ sent: 2, remaining: 0 });
    expect(new OfflineQueue('test.queue').size).toBe(0);
  });

  it('stops at the first failed send and keeps the rest', async () => {
    const q = new OfflineQueue<number>('test.queue2');
    q.enqueue('a', 1);
    q.enqueue('b', 2);
    q.enqueue('c', 3);
    let calls = 0;
    const result = await q.drain(async () => {
      calls += 1;
      return calls < 2;
    });
    expect(result).toEqual({ sent: 1, remaining: 2 });
    expect(q.pending.map((i) => i.actionId)).toEqual(['b', 'c']);
  });

  it('drops actions older than the max age', async () => {
    const q = new OfflineQueue<number>('test.queue3', 1000);
    q.enqueue('old', 1, 0);
    q.enqueue('fresh', 2, 5000);
    const sent: string[] = [];
    await q.drain(async (item) => {
      sent.push(item.actionId);
      return true;
    }, 5500);
    expect(sent).toEqual(['fresh']);
  });

  it('does not drain re-entrantly', async () => {
    const q = new OfflineQueue<number>('test.queue4');
    q.enqueue('a', 1);
    let release: (() => void) | null = null;
    const first = q.drain(() => new Promise<boolean>((resolve) => (release = () => resolve(true))));
    const second = await q.drain(async () => true);
    expect(second).toEqual({ sent: 0, remaining: 1 });
    (release as unknown as () => void)();
    expect(await first).toEqual({ sent: 1, remaining: 0 });
  });
});
