import { type PrismaClient } from '@prisma/client';
import { type FastifyBaseLogger, type FastifyRequest } from 'fastify';
import { type AppConfig } from '../config.js';
import { AuditService } from '../lib/audit.js';
import { systemNow, type Now } from '../lib/time.js';
import { AuthService } from './auth.service.js';
import { ClashService } from './clash.service.js';
import { DrawService } from './draw.service.js';
import { ExportService } from './export.service.js';
import { FacebookService } from './facebook.service.js';
import { FinalsService } from './finals.service.js';
import { FixturesService } from './fixtures.service.js';
import { ImportService } from './import.service.js';
import { LadderService } from './ladder.service.js';
import { LiveService } from './live/live.service.js';
import { SettingsService } from './settings.service.js';

export interface Services {
  config: AppConfig;
  db: PrismaClient;
  now: Now;
  audit: AuditService;
  auth: AuthService;
  settings: SettingsService;
  ladders: LadderService;
  fixtures: FixturesService;
  clashes: ClashService;
  draw: DrawService;
  importer: ImportService;
  exporter: ExportService;
  live: LiveService;
  finals: FinalsService;
  facebook: FacebookService;
}

export interface ServiceDeps {
  /** Outbound HTTP used by integrations; tests inject a fake. */
  fetchImpl?: typeof fetch;
}

export function createServices(
  config: AppConfig,
  db: PrismaClient,
  log: FastifyBaseLogger,
  now: Now = systemNow,
  deps: ServiceDeps = {},
): Services {
  const ladders = new LadderService(db);
  const fixtures = new FixturesService(db, ladders, now);
  const clashes = new ClashService(db);
  const settings = new SettingsService(db, {
    venueName: config.VENUE_NAME,
    timezone: config.VENUE_TIMEZONE,
    controllerPin: config.CONTROLLER_PIN,
  });
  return {
    config,
    db,
    now,
    audit: new AuditService(db, log),
    auth: new AuthService(db, now, config.SESSION_TTL_HOURS * 3_600_000),
    settings,
    ladders,
    fixtures,
    clashes,
    draw: new DrawService(db, clashes, ladders),
    importer: new ImportService(db, ladders, now),
    exporter: new ExportService(db, ladders),
    live: new LiveService({ db, now, log, ladders, fixtures, settings }),
    finals: new FinalsService(db, ladders, clashes, fixtures),
    facebook: new FacebookService(
      {
        enabled: config.FACEBOOK_ENABLED,
        pageId: config.FACEBOOK_PAGE_ID,
        accessToken: config.FACEBOOK_PAGE_ACCESS_TOKEN,
      },
      deps.fetchImpl ?? globalThis.fetch,
    ),
  };
}

/** Who performed a request, for audit entries. */
export function actorOf(request: FastifyRequest): string {
  if (request.admin) return request.admin.email;
  if (request.device) return `device:${request.device.deviceName}`;
  return 'anonymous';
}
