import { useCallback, useEffect } from 'react';
import type { Ack, ClientEventName, ClientEventPayload } from '@scoreboard/shared';
import { useToast } from '../../components/Toaster.js';
import { liveSocket } from '../../lib/socket.js';
import { newActionId } from '../../lib/version.js';
import { useLiveStore } from '../../store/liveStore.js';

type ActionEvent = Exclude<
  ClientEventName,
  'time:ping' | 'court:join' | 'court:leave' | 'session:join' | 'admin:join'
>;

/** Joins the admin room (re-joining on reconnect) and exposes a toast-reporting command emitter. */
export function useAdminLive() {
  const { toast } = useToast();
  useEffect(() => {
    const socket = liveSocket();
    socket.connect();
    const join = () => void socket.emit('admin:join', {});
    if (socket.connected) join();
    return socket.onReconnect(join);
  }, []);

  const send = useCallback(
    async <E extends ActionEvent>(
      event: E,
      payload: Omit<ClientEventPayload<E>, 'actionId'>,
    ): Promise<Ack> => {
      const ack = await liveSocket().emit(event, {
        actionId: newActionId(),
        ...payload,
      } as ClientEventPayload<E>);
      if (!ack.ok) toast(ack.error.message, 'error');
      return ack;
    },
    [toast],
  );

  const session = useLiveStore((s) => s.session);
  const clocks = useLiveStore((s) => s.clocks);
  const courts = useLiveStore((s) => s.courts);
  const warnings = useLiveStore((s) => s.warnings);
  return { send, session, clocks, courts, warnings };
}
