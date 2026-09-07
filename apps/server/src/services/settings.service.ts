import { type PrismaClient } from '@prisma/client';
import { type Settings, type SettingsUpdate } from '@scoreboard/shared';
import { mapSettings } from '../mappers/index.js';
import { hashPassword } from './auth.service.js';

export class SettingsService {
  constructor(
    private readonly db: PrismaClient,
    private readonly defaults: {
      venueName: string;
      timezone: string;
      controllerPin: string | null;
    },
  ) {}

  /** Creates the singleton row on first use. */
  async ensure(): Promise<void> {
    const existing = await this.db.settings.findUnique({ where: { id: 'singleton' } });
    if (existing) return;
    await this.db.settings.create({
      data: {
        id: 'singleton',
        venueName: this.defaults.venueName,
        timezone: this.defaults.timezone,
        controllerPinHash: this.defaults.controllerPin
          ? await hashPassword(this.defaults.controllerPin)
          : null,
      },
    });
  }

  async get(): Promise<Settings> {
    await this.ensure();
    const row = await this.db.settings.findUniqueOrThrow({ where: { id: 'singleton' } });
    return mapSettings(row);
  }

  async update(input: SettingsUpdate): Promise<Settings> {
    await this.ensure();
    const { controllerPin, ...rest } = input;
    const row = await this.db.settings.update({
      where: { id: 'singleton' },
      data: {
        ...rest,
        ...(controllerPin !== undefined
          ? { controllerPinHash: controllerPin === null ? null : await hashPassword(controllerPin) }
          : {}),
      },
    });
    return mapSettings(row);
  }
}
