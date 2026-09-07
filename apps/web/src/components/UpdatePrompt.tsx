import { useEffect } from 'react';
import { useLiveStore } from '../store/liveStore.js';
import { useToast } from './Toaster.js';

/** Controller/admin behaviour for new builds: prompt, never force. */
export function UpdatePrompt() {
  const updateAvailable = useLiveStore((s) => s.updateAvailable);
  const { toast } = useToast();
  useEffect(() => {
    if (!updateAvailable) return;
    toast('A new version is available.', 'info', {
      label: 'Reload',
      onClick: () => window.location.reload(),
    });
  }, [updateAvailable, toast]);
  return null;
}
