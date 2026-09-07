import { type Ack } from '@scoreboard/shared';

/** Remembers acks for recently processed actionIds so retries after reconnect are idempotent. */
export class ActionCache {
  private readonly entries = new Map<string, { ack: Ack; atMs: number }>();

  constructor(
    private readonly now: () => number,
    private readonly ttlMs = 5 * 60_000,
    private readonly maxEntries = 5000,
  ) {}

  get(actionId: string): Ack | null {
    this.sweep();
    return this.entries.get(actionId)?.ack ?? null;
  }

  set(actionId: string, ack: Ack): void {
    this.entries.set(actionId, { ack, atMs: this.now() });
    if (this.entries.size > this.maxEntries) this.sweep(true);
  }

  private sweep(force = false): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [id, entry] of this.entries) {
      if (entry.atMs < cutoff) this.entries.delete(id);
    }
    if (force && this.entries.size > this.maxEntries) {
      const excess = this.entries.size - this.maxEntries;
      let i = 0;
      for (const id of this.entries.keys()) {
        if (i++ >= excess) break;
        this.entries.delete(id);
      }
    }
  }
}
