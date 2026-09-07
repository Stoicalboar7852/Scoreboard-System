import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { type PrismaClient } from '@prisma/client';
import { type AppConfig } from './config.js';
import { createPrisma } from './db/prisma.js';
import { errorHandler } from './errors.js';
import { systemNow, type Now } from './lib/time.js';
import { authPlugin } from './plugins/auth.js';
import { securityPlugin } from './plugins/security.js';
import { createServices, type Services } from './services/index.js';
import { attachGateway, type AppIo } from './services/live/gateway.js';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerSettingsRoutes } from './routes/settings.routes.js';
import { registerCourtRoutes } from './routes/courts.routes.js';
import { registerFormatRoutes } from './routes/formats.routes.js';
import { registerSeasonRoutes } from './routes/seasons.routes.js';
import { registerCompetitionRoutes } from './routes/competitions.routes.js';
import { registerTeamRoutes } from './routes/teams.routes.js';
import { registerPlayerRoutes } from './routes/players.routes.js';
import { registerClashLinkRoutes } from './routes/clashLinks.routes.js';
import { registerSessionRoutes } from './routes/sessions.routes.js';
import { registerFixtureRoutes } from './routes/fixtures.routes.js';
import { registerAdjustmentRoutes } from './routes/adjustments.routes.js';
import { registerLadderRoutes } from './routes/ladders.routes.js';
import { registerImportRoutes } from './routes/import.routes.js';
import { registerExportRoutes } from './routes/export.routes.js';
import { registerPublicRoutes } from './routes/public.routes.js';
import { registerControllerRoutes } from './routes/controller.routes.js';
import { registerDrawRoutes } from './routes/draw.routes.js';
import { registerFinalsRoutes } from './routes/finals.routes.js';

export interface BuildAppOptions {
  config: AppConfig;
  db?: PrismaClient;
  now?: Now;
  /** Start the live service (scheduler, restart recovery) when the app is ready. Default true. */
  startLive?: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    services: Services;
    io: AppIo;
  }
}

/** Creates the Fastify instance with plugins, services and REST routes. */
export async function buildApp({
  config,
  db,
  now = systemNow,
  startLive = true,
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.isTest ? 'silent' : config.LOG_LEVEL,
      ...(config.isProduction || config.isTest
        ? {}
        : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
    },
    trustProxy: config.TRUST_PROXY,
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 2 * 1024 * 1024,
  });

  const prisma = db ?? createPrisma(config);
  const services = createServices(config, prisma, app.log, now);
  app.decorate('services', services);

  app.setErrorHandler(errorHandler);

  await app.register(securityPlugin, { config });
  await app.register(authPlugin, { auth: services.auth });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

  app.get('/healthz', { config: { rateLimit: false } }, async (_request, reply) => {
    let database: 'ok' | 'error' = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'error';
    }
    const body = {
      status: database === 'ok' ? 'ok' : 'degraded',
      version: config.APP_VERSION,
      database,
      uptimeSeconds: Math.round(process.uptime()),
    };
    return reply.status(database === 'ok' ? 200 : 503).send(body);
  });

  registerAuthRoutes(app, services);
  registerSettingsRoutes(app, services);
  registerCourtRoutes(app, services);
  registerFormatRoutes(app, services);
  registerSeasonRoutes(app, services);
  registerCompetitionRoutes(app, services);
  registerTeamRoutes(app, services);
  registerPlayerRoutes(app, services);
  registerClashLinkRoutes(app, services);
  registerSessionRoutes(app, services);
  registerFixtureRoutes(app, services);
  registerAdjustmentRoutes(app, services);
  registerLadderRoutes(app, services);
  registerImportRoutes(app, services);
  registerExportRoutes(app, services);
  registerPublicRoutes(app, services);
  registerControllerRoutes(app, services);
  registerDrawRoutes(app, services);
  registerFinalsRoutes(app, services);

  // Serve the built SPA whenever the dist folder exists (always in Docker; locally after `pnpm build`).
  const webDist = resolve(process.cwd(), config.WEB_DIST_DIR);
  const serveWeb = existsSync(webDist) && !config.isTest;
  if (serveWeb) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
      // Wildcard mode resolves files on every request. The per-file mode (`wildcard: false`)
      // snapshots the directory at boot, so a `pnpm build` while the server runs would leave the
      // new hashed assets unroutable and the SPA fallback would answer them with index.html.
      wildcard: true,
      setHeaders: (res, path) => {
        if (/\/(sw\.js|index\.html|manifest\.webmanifest)$/.test(path))
          res.setHeader('Cache-Control', 'no-cache');
        else if (/\/assets\//.test(path))
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    });
  }
  app.setNotFoundHandler(async (request, reply) => {
    const isApi =
      request.url.startsWith('/api/') ||
      request.url.startsWith('/socket.io') ||
      request.url === '/healthz';
    // Only extension-less paths are SPA routes; a missing `/assets/x.js` must be a real 404 so the
    // browser reports a failed module load instead of a MIME-type error on an HTML body.
    const pathname = request.url.split('?')[0] ?? '';
    const looksLikeFile = /\.[a-z0-9]+$/i.test(pathname);
    if (serveWeb && !isApi && !looksLikeFile && request.method === 'GET') {
      return reply.type('text/html').header('Cache-Control', 'no-cache').sendFile('index.html');
    }
    return reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` },
    });
  });

  app.decorate('io', attachGateway(app, services));
  if (startLive) {
    app.addHook('onReady', async () => {
      await services.live.start();
    });
  }

  app.addHook('onClose', async () => {
    await services.live.stop();
    if (!db) await prisma.$disconnect();
  });

  return app;
}
