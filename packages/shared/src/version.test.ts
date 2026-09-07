import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, isCompatibleProtocol } from './version.js';

describe('protocol version', () => {
  it('accepts the current version only', () => {
    expect(isCompatibleProtocol(PROTOCOL_VERSION)).toBe(true);
    expect(isCompatibleProtocol(PROTOCOL_VERSION + 1)).toBe(false);
    expect(isCompatibleProtocol(1.5)).toBe(false);
  });
});
