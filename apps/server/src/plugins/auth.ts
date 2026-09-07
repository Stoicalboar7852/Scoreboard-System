import fp from 'fastify-plugin';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { AuthError } from '../errors.js';
import {
  type AdminIdentity,
  type AuthService,
  type DeviceIdentity,
} from '../services/auth.service.js';

export const SESSION_COOKIE = 'sb_session';

declare module 'fastify' {
  interface FastifyRequest {
    admin: AdminIdentity | null;
    device: DeviceIdentity | null;
  }
  interface FastifyInstance {
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireController: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdminOrController: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export function readBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? (match[1] as string) : null;
}

/** Populates request.admin / request.device from the cookie or bearer token on every request. */
export const authPlugin = fp(async (app, opts: { auth: AuthService }) => {
  app.decorateRequest('admin', null);
  app.decorateRequest('device', null);

  app.addHook('onRequest', async (request) => {
    request.admin = null;
    request.device = null;
    const raw = request.cookies[SESSION_COOKIE];
    if (raw) {
      const unsigned = request.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) {
        request.admin = await opts.auth.resolveSession(unsigned.value);
      }
    }
    const bearer = readBearer(request.headers.authorization);
    if (bearer) request.device = await opts.auth.resolveDevice(bearer);
  });

  app.decorate('requireAdmin', async (request: FastifyRequest) => {
    if (!request.admin) throw new AuthError('Admin login required');
  });
  app.decorate('requireController', async (request: FastifyRequest) => {
    if (!request.device) throw new AuthError('Controller device token required');
  });
  app.decorate('requireAdminOrController', async (request: FastifyRequest) => {
    if (!request.admin && !request.device) throw new AuthError('Login or device token required');
  });
});
