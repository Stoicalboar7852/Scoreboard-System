import Fastify, { type FastifyInstance } from 'fastify';
import { type AppConfig } from './config.js';

export interface BuildAppOptions {
  config: AppConfig;
}

/** Creates the Fastify instance. Phase 0: health check only; later phases add plugins. */
export async function buildApp({ config }: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.isProduction || config.isTest
        ? {}
        : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
    },
    trustProxy: config.TRUST_PROXY,
    genReqId: () => crypto.randomUUID(),
  });

  app.get('/healthz', async () => ({
    status: 'ok',
    version: config.APP_VERSION,
    uptimeSeconds: Math.round(process.uptime()),
  }));

  return app;
}
