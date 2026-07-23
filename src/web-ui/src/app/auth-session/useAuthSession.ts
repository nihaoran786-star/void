import { useSyncExternalStore } from 'react';
import type { AuthSessionController } from './authSessionTypes';

export function useAuthSession(controller: AuthSessionController) {
  return useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
}
