import { useQuery } from '@tanstack/react-query';
import type { Court, GameFormat } from '@scoreboard/shared';
import { api } from './api.js';
import { getDeviceToken } from './deviceAuth.js';

export interface ControllerBootstrap {
  device: { deviceId: string; deviceName: string; courtId: string | null };
  courts: Court[];
  formats: GameFormat[];
  settings: {
    hasControllerPin: boolean;
    venueName: string;
    timezone: string;
    nextGameWindowMinutes: number;
    defaultTimeoutSeconds: number;
    accentOverrides: Record<string, string>;
  };
}

export function useControllerBootstrap(enabled = true) {
  return useQuery({
    queryKey: ['controller', 'bootstrap', getDeviceToken()],
    queryFn: () => api<ControllerBootstrap>('/api/controller/bootstrap'),
    enabled: enabled && getDeviceToken() !== null,
    staleTime: 60_000,
  });
}
