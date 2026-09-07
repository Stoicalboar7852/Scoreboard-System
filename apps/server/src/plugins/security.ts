import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { type AppConfig } from '../config.js';

/** Cookies, CORS locked to the app origin, security headers and a global rate limit. */
export const securityPlugin = fp(async (app, opts: { config: AppConfig }) => {
  const { config } = opts;
  await app.register(cookie, { secret: config.SESSION_SECRET, hook: 'onRequest' });
  await app.register(cors, {
    origin: (origin, cb) => {
      // Same-origin requests carry no Origin header; allow those and the configured app origin.
      if (
        !origin ||
        origin === config.APP_ORIGIN ||
        (!config.isProduction &&
          /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin))
      ) {
        cb(null, true);
        return;
      }
      cb(new Error('Origin not allowed'), false);
    },
    credentials: true,
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        mediaSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
  });
  await app.register(rateLimit, {
    global: true,
    max: config.isTest ? 1000 : 300,
    timeWindow: '1 minute',
    allowList: (request) => request.url === '/healthz',
    keyGenerator: (request) => request.ip,
  });
});

/** Tighter limits for login / PIN endpoints. */
export const AUTH_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
export const PUBLIC_RATE_LIMIT = { max: 120, timeWindow: '1 minute' } as const;
