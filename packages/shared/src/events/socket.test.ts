import { describe, expect, it } from 'vitest';
import {
  ADMIN_EVENTS,
  CLIENT_EVENTS,
  CONTROLLER_EVENTS,
  SERVER_EVENTS,
  ackSchema,
  clockRoom,
  controllerScoreSchema,
  courtRoom,
  sessionRoom,
} from './socket.js';

const COURT = '11111111-1111-4111-8111-111111111111';

describe('socket event registry', () => {
  it('classifies every event as public, controller or admin', () => {
    for (const name of Object.keys(CLIENT_EVENTS) as Array<keyof typeof CLIENT_EVENTS>) {
      const isAdmin = ADMIN_EVENTS.has(name);
      const isController = CONTROLLER_EVENTS.has(name);
      expect(isAdmin && isController).toBe(false);
    }
    expect(Object.keys(SERVER_EVENTS).length).toBeGreaterThan(0);
  });

  it('validates a score intent', () => {
    expect(
      controllerScoreSchema.safeParse({
        actionId: 'a1b2c3d4e5',
        courtId: COURT,
        team: 'HOME',
        delta: 1,
      }).success,
    ).toBe(true);
    expect(
      controllerScoreSchema.safeParse({
        actionId: 'a1b2c3d4e5',
        courtId: COURT,
        team: 'HOME',
        delta: 2,
      }).success,
    ).toBe(false);
    expect(
      controllerScoreSchema.safeParse({ courtId: COURT, team: 'HOME', delta: 1 }).success,
    ).toBe(false);
  });

  it('validates acks', () => {
    expect(ackSchema.safeParse({ ok: true }).success).toBe(true);
    expect(ackSchema.safeParse({ ok: false, error: { code: 'X', message: 'y' } }).success).toBe(
      true,
    );
    expect(ackSchema.safeParse({ ok: false }).success).toBe(false);
  });

  it('names rooms consistently', () => {
    expect(courtRoom('c')).toBe('court:c');
    expect(clockRoom('k')).toBe('clock:k');
    expect(sessionRoom('s')).toBe('session:s');
  });
});
