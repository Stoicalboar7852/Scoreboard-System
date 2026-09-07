import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App.tsx';
import { ToastProvider } from './components/Toaster.tsx';
import { queryClient } from './lib/query.ts';
import { liveSocket } from './lib/socket.ts';
import { useLiveStore } from './store/liveStore.ts';
import { ThemeProvider } from './theme/ThemeProvider.tsx';
import './index.css';

// Service worker: controllers get a prompt via the store; scoreboards reload automatically.
registerSW({
  immediate: true,
  onNeedRefresh() {
    useLiveStore.getState().setUpdateAvailable('service-worker');
  },
});

liveSocket().connect();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');
createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
