export interface ComposerEventRoute {
  composerSessionId: string | null;
  targetSessionId?: string;
  isPrimary: boolean;
}

/**
 * Legacy, untargeted producers retain their historical primary-composer behavior.
 * Child-session producers must carry a session id, preventing two mounted inputs
 * from both consuming the same global event.
 */
export function shouldRouteComposerEvent(route: ComposerEventRoute): boolean {
  const targetSessionId = route.targetSessionId?.trim();
  if (targetSessionId) {
    return route.composerSessionId === targetSessionId;
  }
  return route.isPrimary;
}
