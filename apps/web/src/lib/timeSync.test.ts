import { describe, expect, it } from 'vitest';
import { TimeSync } from './timeSync.js';

describe('TimeSync', () => {
  it('estimates the offset from a round trip', () => {
    const sync = new TimeSync();
    sync.addSample({ clientSentMs: 1000, serverNowMs: 6100, clientReceivedMs: 1200 });
    expect(sync.offsetMs).toBe(5000);
    expect(sync.rttMs).toBe(200);
    expect(sync.rttWarning).toBe(false);
  });
  it('uses the median of the last five samples so one bad sample is ignored', () => {
    const sync = new TimeSync();
    for (const offset of [100, 105, 5000, 98, 102, 101]) {
      sync.addSample({ clientSentMs: 0, serverNowMs: offset, clientReceivedMs: 0 });
    }
    expect(sync.sampleCount).toBe(5);
    expect(sync.offsetMs).toBe(102);
  });
  it('averages the two middle values for an even count', () => {
    const sync = new TimeSync();
    sync.addSample({ clientSentMs: 0, serverNowMs: 10, clientReceivedMs: 0 });
    sync.addSample({ clientSentMs: 0, serverNowMs: 20, clientReceivedMs: 0 });
    expect(sync.offsetMs).toBe(15);
  });
  it('flags slow round trips and resets', () => {
    const sync = new TimeSync();
    sync.addSample({ clientSentMs: 0, serverNowMs: 0, clientReceivedMs: 2500 });
    expect(sync.rttWarning).toBe(true);
    sync.reset();
    expect(sync.offsetMs).toBe(0);
    expect(sync.rttMs).toBeNull();
  });
});
