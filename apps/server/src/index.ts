import { buildApp } from './app.js';
import { loadConfig } from './config.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });
  // Production bootstrap (D-054): settings row and the admin account come from the environment, so
  // a fresh database is usable without running the demo seed.
  await app.services.settings.ensure();
  const admin = await app.services.auth.ensureAdmin(config.ADMIN_EMAIL, config.ADMIN_PASSWORD, {
    resetPassword: config.ADMIN_PASSWORD_RESET,
  });
  app.log.info({ email: config.ADMIN_EMAIL, admin }, 'admin account ensured');

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((err: unknown) => {
  console.error('fatal: server failed to start', err);
  process.exit(1);
});
