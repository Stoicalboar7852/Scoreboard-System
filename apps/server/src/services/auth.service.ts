import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { type PrismaClient } from '@prisma/client';
import { AuthError, NotFoundError, ValidationError } from '../errors.js';
import { type Now } from '../lib/time.js';

export interface AdminIdentity {
  userId: string;
  email: string;
  name: string;
  sessionId: string;
}

export interface DeviceIdentity {
  deviceId: string;
  deviceName: string;
  courtId: string | null;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export class AuthService {
  constructor(
    private readonly db: PrismaClient,
    private readonly now: Now,
    private readonly sessionTtlMs: number,
  ) {}

  /** Creates an admin session and returns its id (stored in the cookie). */
  async login(
    email: string,
    password: string,
    meta: { userAgent?: string; ip?: string },
  ): Promise<{ sessionId: string; admin: AdminIdentity }> {
    const user = await this.db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !(await verifyPassword(user.passwordHash, password))) {
      throw new AuthError('Invalid email or password');
    }
    const session = await this.db.adminSession.create({
      data: {
        userId: user.id,
        expiresAt: new Date(this.now() + this.sessionTtlMs),
        userAgent: meta.userAgent?.slice(0, 200) ?? null,
        ip: meta.ip?.slice(0, 64) ?? null,
      },
    });
    return {
      sessionId: session.id,
      admin: { userId: user.id, email: user.email, name: user.name, sessionId: session.id },
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.db.adminSession.deleteMany({ where: { id: sessionId } });
  }

  async resolveSession(sessionId: string): Promise<AdminIdentity | null> {
    const session = await this.db.adminSession.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (!session) return null;
    if (session.expiresAt.getTime() <= this.now()) {
      await this.db.adminSession.delete({ where: { id: sessionId } }).catch(() => undefined);
      return null;
    }
    return {
      userId: session.userId,
      email: session.user.email,
      name: session.user.name,
      sessionId: session.id,
    };
  }

  /** Changes the password and signs out every other session of this user. */
  async changePassword(
    userId: string,
    keepSessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);
    if (!(await verifyPassword(user.passwordHash, currentPassword)))
      throw new AuthError('Current password is incorrect');
    await this.db.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await this.db.adminSession.deleteMany({ where: { userId, NOT: { id: keepSessionId } } });
  }

  /** Exchanges the venue PIN for a device token. Returns the raw token exactly once. */
  async exchangePin(pin: string, deviceName: string): Promise<{ token: string; deviceId: string }> {
    const settings = await this.db.settings.findUnique({ where: { id: 'singleton' } });
    if (!settings?.controllerPinHash)
      throw new ValidationError('No controller PIN is configured. Set one in Settings.');
    if (!(await verifyPassword(settings.controllerPinHash, pin)))
      throw new AuthError('Incorrect PIN');
    const token = randomBytes(32).toString('base64url');
    const device = await this.db.deviceToken.create({
      data: { tokenHash: hashToken(token), name: deviceName, lastSeenAt: new Date(this.now()) },
    });
    return { token, deviceId: device.id };
  }

  async resolveDevice(token: string): Promise<DeviceIdentity | null> {
    const device = await this.db.deviceToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!device || device.revokedAt) return null;
    return { deviceId: device.id, deviceName: device.name, courtId: device.courtId };
  }

  async touchDevice(deviceId: string, courtId: string | null): Promise<void> {
    await this.db.deviceToken.updateMany({
      where: { id: deviceId },
      data: { lastSeenAt: new Date(this.now()), ...(courtId ? { courtId } : {}) },
    });
  }

  async revokeDevice(deviceId: string): Promise<void> {
    await this.db.deviceToken.update({
      where: { id: deviceId },
      data: { revokedAt: new Date(this.now()) },
    });
  }

  async purgeExpiredSessions(): Promise<number> {
    const result = await this.db.adminSession.deleteMany({
      where: { expiresAt: { lt: new Date(this.now()) } },
    });
    return result.count;
  }

  /**
   * Ensures the admin from the environment exists, so a fresh database is usable without the demo
   * seed (idempotent, runs on every boot).
   *
   * An existing account is left alone: the admin can change their own password in
   * Settings, and re-applying ADMIN_PASSWORD on every restart would silently undo that (D-057).
   * Pass `resetPassword` (ADMIN_PASSWORD_RESET=true) to force the stored password back to the
   * configured one — the documented recovery path for a forgotten password.
   */
  async ensureAdmin(
    email: string,
    password: string,
    options: { resetPassword?: boolean; name?: string } = {},
  ): Promise<'created' | 'reset' | 'unchanged'> {
    const { resetPassword = false, name = 'Admin' } = options;
    const normalised = email.toLowerCase();
    const existing = await this.db.user.findUnique({ where: { email: normalised } });
    if (!existing) {
      await this.db.user.create({
        data: { email: normalised, name, passwordHash: await hashPassword(password) },
      });
      return 'created';
    }
    if (!resetPassword) return 'unchanged';
    if (await verifyPassword(existing.passwordHash, password)) return 'unchanged';
    await this.db.user.update({
      where: { id: existing.id },
      data: { passwordHash: await hashPassword(password) },
    });
    return 'reset';
  }
}
