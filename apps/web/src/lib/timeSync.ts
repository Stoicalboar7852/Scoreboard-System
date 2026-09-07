/** Keeps the median clock offset of the last five ping/pong samples (§6.6). */
export interface TimeSample {
  clientSentMs: number;
  serverNowMs: number;
  clientReceivedMs: number;
}

export const RTT_WARNING_MS = 2000;

export class TimeSync {
  private readonly offsets: number[] = [];
  private lastRtt: number | null = null;

  constructor(private readonly maxSamples = 5) {}

  addSample(sample: TimeSample): void {
    const rtt = Math.max(0, sample.clientReceivedMs - sample.clientSentMs);
    const offset = sample.serverNowMs - (sample.clientSentMs + rtt / 2);
    this.lastRtt = rtt;
    this.offsets.push(offset);
    if (this.offsets.length > this.maxSamples) this.offsets.shift();
  }

  /** Median offset in ms to add to Date.now() to get server time; 0 before any sample. */
  get offsetMs(): number {
    if (this.offsets.length === 0) return 0;
    const sorted = [...this.offsets].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
      ? (sorted[mid] as number)
      : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  }

  get rttMs(): number | null {
    return this.lastRtt;
  }

  get rttWarning(): boolean {
    return this.lastRtt !== null && this.lastRtt > RTT_WARNING_MS;
  }

  get sampleCount(): number {
    return this.offsets.length;
  }

  reset(): void {
    this.offsets.length = 0;
    this.lastRtt = null;
  }
}
