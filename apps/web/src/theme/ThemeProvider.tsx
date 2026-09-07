import { useEffect, type ReactNode } from 'react';
import { cssVariableName, resolveTheme, type ThemeTokenKey } from '@scoreboard/shared';
import { usePublicSettings } from '../lib/publicSettings.js';

/** Applies the venue's accent overrides to :root so every surface shares one palette. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const settings = usePublicSettings();
  const theme = settings.data?.theme;
  useEffect(() => {
    const resolved = resolveTheme(theme ?? {});
    const root = document.documentElement;
    for (const key of Object.keys(resolved) as ThemeTokenKey[]) {
      root.style.setProperty(cssVariableName(key), resolved[key]);
    }
    if (settings.data?.venueName) document.title = `${settings.data.venueName} · Scoreboard`;
  }, [theme, settings.data?.venueName]);
  return <>{children}</>;
}
