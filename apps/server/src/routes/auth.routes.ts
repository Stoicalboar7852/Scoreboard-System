import { type FastifyInstance } from 'fastify';
import {
  changePasswordInputSchema,
  controllerPinInputSchema,
  loginInputSchema,
} from '@scoreboard/shared';
import { parse } from '../lib/validate.js';
import { SESSION_COOKIE } from '../plugins/auth.js';
import { AUTH_RATE_LIMIT } from '../plugins/security.js';
import { type Services, actorOf } from '../services/index.js';

export function registerAuthRoutes(app: FastifyInstance, s: Services): void {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: s.config.isProduction,
    signed: true,
    maxAge: Math.round(s.config.SESSION_TTL_HOURS * 3600),
  };

  app.post(
    '/api/auth/login',
    { config: { rateLimit: AUTH_RATE_LIMIT } },
    async (request, reply) => {
      const input = parse(loginInputSchema, request.body, 'login');
      const { sessionId, admin } = await s.auth.login(input.email, input.password, {
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      });
      void reply.setCookie(SESSION_COOKIE, sessionId, cookieOptions);
      await s.audit.record({ actor: admin.email, action: 'auth.login', requestId: request.id });
      return { user: { id: admin.userId, email: admin.email, name: admin.name } };
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    if (request.admin) {
      await s.auth.logout(request.admin.sessionId);
      await s.audit.record({
        actor: request.admin.email,
        action: 'auth.logout',
        requestId: request.id,
      });
    }
    void reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (request) => {
    if (request.admin) {
      return {
        kind: 'admin',
        user: { id: request.admin.userId, email: request.admin.email, name: request.admin.name },
      };
    }
    if (request.device) return { kind: 'controller', device: request.device };
    return { kind: 'anonymous' };
  });

  app.post('/api/auth/password', { preHandler: [app.requireAdmin] }, async (request) => {
    const input = parse(changePasswordInputSchema, request.body, 'password change');
    const admin = request.admin!;
    await s.auth.changePassword(
      admin.userId,
      admin.sessionId,
      input.currentPassword,
      input.newPassword,
    );
    await s.audit.record({
      actor: actorOf(request),
      action: 'auth.passwordChanged',
      requestId: request.id,
    });
    return { ok: true };
  });

  app.post('/api/auth/controller', { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request) => {
    const input = parse(controllerPinInputSchema, request.body, 'controller PIN');
    const { token, deviceId } = await s.auth.exchangePin(input.pin, input.deviceName);
    await s.audit.record({
      actor: `device:${input.deviceName}`,
      deviceId,
      action: 'auth.deviceRegistered',
      requestId: request.id,
    });
    return { token, deviceId };
  });

  app.get('/api/auth/devices', { preHandler: [app.requireAdmin] }, async () => {
    const devices = await s.db.deviceToken.findMany({
      orderBy: { createdAt: 'desc' },
      include: { court: true },
    });
    return devices.map((d) => ({
      id: d.id,
      name: d.name,
      courtId: d.courtId,
      courtName: d.court?.name ?? null,
      lastSeenAtMs: d.lastSeenAt?.getTime() ?? null,
      revokedAtMs: d.revokedAt?.getTime() ?? null,
      createdAtMs: d.createdAt.getTime(),
    }));
  });

  app.delete('/api/auth/devices/:id', { preHandler: [app.requireAdmin] }, async (request) => {
    const id = (request.params as { id: string }).id;
    await s.auth.revokeDevice(id);
    await s.audit.record({
      actor: actorOf(request),
      action: 'auth.deviceRevoked',
      payload: { id },
      requestId: request.id,
    });
    return { ok: true };
  });
}
