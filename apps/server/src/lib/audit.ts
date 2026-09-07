import { type PrismaClient } from '@prisma/client';
import { type FastifyBaseLogger } from 'fastify';

export interface AuditEntry {
  actor: string;
  deviceId?: string | null;
  action: string;
  payload?: unknown;
  requestId?: string | null;
}

/** Append-only audit log. Failures to write are logged, never thrown into request flow. */
export class AuditService {
  constructor(
    private readonly db: PrismaClient,
    private readonly log: FastifyBaseLogger,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.db.auditLog.create({
        data: {
          actor: entry.actor,
          deviceId: entry.deviceId ?? null,
          action: entry.action,
          payload: (entry.payload ?? {}) as object,
          requestId: entry.requestId ?? null,
        },
      });
    } catch (err) {
      this.log.error({ err, action: entry.action }, 'failed to write audit log');
    }
  }
}
