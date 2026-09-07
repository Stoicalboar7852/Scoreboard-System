import { readJson, writeJson } from './storage.js';

export interface QueuedAction<T> {
  actionId: string;
  payload: T;
  queuedAtMs: number;
}

/**
 * Ordered queue of intents waiting for the server. Survives reloads via localStorage and is
 * replayed in order on reconnect; the server's actionId cache makes retries safe.
 */
export class OfflineQueue<T> {
  private items: QueuedAction<T>[];
  private draining = false;

  constructor(
    private readonly storageKey: string,
    private readonly maxAgeMs = 6 * 60 * 60_000,
  ) {
    this.items = readJson<QueuedAction<T>[]>(storageKey, []);
  }

  get pending(): readonly QueuedAction<T>[] {
    return this.items;
  }

  get size(): number {
    return this.items.length;
  }

  enqueue(actionId: string, payload: T, nowMs = Date.now()): void {
    this.items.push({ actionId, payload, queuedAtMs: nowMs });
    this.persist();
  }

  clear(): void {
    this.items = [];
    this.persist();
  }

  /**
   * Sends queued actions one at a time. `send` resolves true when the server acknowledged
   * (ok or a definitive rejection) and false when the attempt should be retried later.
   */
  async drain(
    send: (item: QueuedAction<T>) => Promise<boolean>,
    nowMs = Date.now(),
  ): Promise<{ sent: number; remaining: number }> {
    if (this.draining) return { sent: 0, remaining: this.items.length };
    this.draining = true;
    let sent = 0;
    try {
      this.items = this.items.filter((i) => nowMs - i.queuedAtMs <= this.maxAgeMs);
      while (this.items.length > 0) {
        const item = this.items[0] as QueuedAction<T>;
        const done = await send(item);
        if (!done) break;
        this.items.shift();
        sent += 1;
        this.persist();
      }
    } finally {
      this.draining = false;
      this.persist();
    }
    return { sent, remaining: this.items.length };
  }

  private persist(): void {
    writeJson(this.storageKey, this.items);
  }
}
