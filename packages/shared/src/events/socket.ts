import { z } from 'zod';
import { epochMsSchema, uuidSchema } from '../domain/common.js';
import { clockModeSchema, teamSideSchema } from '../domain/enums.js';
import {
  clockStateSchema,
  courtLiveStateSchema,
  liveSnapshotSchema,
  sessionLiveStateSchema,
} from '../domain/live.js';

/** Every mutating client message carries a client-generated id so retries are idempotent. */
export const actionIdSchema = z.string().min(8).max(64);

const withAction = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ actionId: actionIdSchema, ...shape });

// ---- Client → server payloads ------------------------------------------------------

export const timePingSchema = z.object({ clientSentMs: epochMsSchema });
export const timePongSchema = z.object({ clientSentMs: epochMsSchema, serverNowMs: epochMsSchema });

export const joinCourtSchema = z.object({
  courtId: uuidSchema,
  role: z.enum(['CONTROLLER', 'SCOREBOARD']),
});
export const joinSessionSchema = z.object({ sessionId: uuidSchema });
export const leaveCourtSchema = z.object({ courtId: uuidSchema });

export const controllerScoreSchema = withAction({
  courtId: uuidSchema,
  team: teamSideSchema,
  delta: z.union([z.literal(1), z.literal(-1)]),
});
export const controllerTimeoutSchema = withAction({
  courtId: uuidSchema,
  team: teamSideSchema.nullable().optional(),
});
export const controllerEndTimeoutSchema = withAction({ courtId: uuidSchema });

export const clockIdActionSchema = withAction({ clockId: uuidSchema });
export const clockAdjustSchema = withAction({
  clockId: uuidSchema,
  deltaSeconds: z.number().int().min(-3600).max(3600),
});
export const clockSetModeSchema = withAction({ clockId: uuidSchema, mode: clockModeSchema });
export const clockSetLinkSchema = withAction({
  clockId: uuidSchema,
  linkedClockId: uuidSchema.nullable(),
});

export const courtAssignFixtureSchema = withAction({
  courtId: uuidSchema,
  fixtureId: uuidSchema.nullable(),
});
export const courtQuickGameSchema = withAction({
  courtId: uuidSchema,
  homeName: z.string().trim().min(1).max(80),
  awayName: z.string().trim().min(1).max(80),
  formatId: uuidSchema,
});
export const courtSetScoreSchema = withAction({
  courtId: uuidSchema,
  homeScore: z.number().int().min(0).max(999),
  awayScore: z.number().int().min(0).max(999),
});
export const courtEndGameSchema = withAction({ courtId: uuidSchema });
export const courtReopenGameSchema = withAction({ courtId: uuidSchema });

export const sessionGoLiveSchema = withAction({ sessionId: uuidSchema });
export const sessionEndSchema = withAction({ sessionId: uuidSchema });
export const sessionAdvanceSlotSchema = withAction({ clockId: uuidSchema });
export const sessionSetLinkFlagSchema = withAction({
  sessionId: uuidSchema,
  linkShorterToLonger: z.boolean(),
});

// ---- Acks -----------------------------------------------------------------------------

export const ackErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type AckError = z.infer<typeof ackErrorSchema>;

export const ackSchema = z.union([
  z.object({ ok: z.literal(true), state: z.unknown().optional() }),
  z.object({ ok: z.literal(false), error: ackErrorSchema }),
]);
export type Ack<TState = unknown> = { ok: true; state?: TState } | { ok: false; error: AckError };

// ---- Server → client payloads ---------------------------------------------------------

export const appVersionSchema = z.object({ version: z.string() });
export const warningSchema = z.object({
  code: z.string(),
  message: z.string(),
  courtId: uuidSchema.optional(),
  clockId: uuidSchema.optional(),
});
export type LiveWarning = z.infer<typeof warningSchema>;

/** Names and schemas of every client → server event, shared by both sides. */
export const CLIENT_EVENTS = {
  'time:ping': timePingSchema,
  'court:join': joinCourtSchema,
  'court:leave': leaveCourtSchema,
  'session:join': joinSessionSchema,
  'admin:join': z.object({}),
  'controller:score': controllerScoreSchema,
  'controller:timeout': controllerTimeoutSchema,
  'controller:endTimeout': controllerEndTimeoutSchema,
  'clock:start': clockIdActionSchema,
  'clock:pause': clockIdActionSchema,
  'clock:resume': clockIdActionSchema,
  'clock:adjust': clockAdjustSchema,
  'clock:skipPhase': clockIdActionSchema,
  'clock:reset': clockIdActionSchema,
  'clock:endGame': clockIdActionSchema,
  'clock:setMode': clockSetModeSchema,
  'clock:setLink': clockSetLinkSchema,
  'court:assignFixture': courtAssignFixtureSchema,
  'court:quickGame': courtQuickGameSchema,
  'court:setScore': courtSetScoreSchema,
  'court:endGame': courtEndGameSchema,
  'court:reopenGame': courtReopenGameSchema,
  'session:goLive': sessionGoLiveSchema,
  'session:end': sessionEndSchema,
  'session:advanceSlot': sessionAdvanceSlotSchema,
  'session:setLinkFlag': sessionSetLinkFlagSchema,
} as const;
export type ClientEventName = keyof typeof CLIENT_EVENTS;
export type ClientEventPayload<E extends ClientEventName> = z.infer<(typeof CLIENT_EVENTS)[E]>;

/** Events that require an admin session. */
export const ADMIN_EVENTS: ReadonlySet<ClientEventName> = new Set<ClientEventName>([
  'admin:join',
  'clock:start',
  'clock:pause',
  'clock:resume',
  'clock:adjust',
  'clock:skipPhase',
  'clock:reset',
  'clock:endGame',
  'clock:setMode',
  'clock:setLink',
  'court:assignFixture',
  'court:quickGame',
  'court:setScore',
  'court:endGame',
  'court:reopenGame',
  'session:goLive',
  'session:end',
  'session:advanceSlot',
  'session:setLinkFlag',
]);

/** Events that require a controller device token (and verify courtId). */
export const CONTROLLER_EVENTS: ReadonlySet<ClientEventName> = new Set<ClientEventName>([
  'controller:score',
  'controller:timeout',
  'controller:endTimeout',
]);

export const SERVER_EVENTS = {
  'time:pong': timePongSchema,
  'court:state': courtLiveStateSchema,
  'clock:state': clockStateSchema,
  'session:state': sessionLiveStateSchema,
  'live:snapshot': liveSnapshotSchema,
  'live:warnings': z.array(warningSchema),
  'app:version': appVersionSchema,
} as const;
export type ServerEventName = keyof typeof SERVER_EVENTS;
export type ServerEventPayload<E extends ServerEventName> = z.infer<(typeof SERVER_EVENTS)[E]>;

/** Socket.IO typed event maps. */
export type ServerToClientEvents = {
  [E in ServerEventName]: (payload: ServerEventPayload<E>) => void;
};
export type ClientToServerEvents = {
  [E in ClientEventName]: (payload: ClientEventPayload<E>, ack: (response: Ack) => void) => void;
};

export function courtRoom(courtId: string): string {
  return `court:${courtId}`;
}
export function clockRoom(clockId: string): string {
  return `clock:${clockId}`;
}
export function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`;
}
export const ADMIN_ROOM = 'admin';
