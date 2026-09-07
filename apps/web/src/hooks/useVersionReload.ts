import { useEffect } from 'react';
import { useLiveStore } from '../store/liveStore.js';

/**
 * Scoreboards reload automatically when a new build is announced; controllers and admin
 * pages only show a prompt (see <UpdatePrompt>). Reload is delayed a little and skipped
 * while the tab is hidden so a kiosk never reloads mid-frame.
 */
export function useVersionReload(mode: 'auto' | 'prompt'): void {
  const updateAvailable = useLiveStore((s) => s.updateAvailable);
  useEffect(() => {
    if (mode !== 'auto' || !updateAvailable) return;
    const timer = setTimeout(() => {
      window.location.reload();
    }, 3000);
    return () => clearTimeout(timer);
  }, [mode, updateAvailable]);
}
