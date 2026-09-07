import { useQuery } from '@tanstack/react-query';
import type { ThemeTokens } from '@scoreboard/shared';
import { api } from './api.js';

export interface PublicSettings {
  venueName: string;
  timezone: string;
  nextGameWindowMinutes: number;
  soundEnabled: boolean;
  theme: ThemeTokens;
  appVersion: string;
}

export function usePublicSettings() {
  return useQuery({
    queryKey: ['public', 'settings'],
    queryFn: () => api<PublicSettings>('/api/public/settings'),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
