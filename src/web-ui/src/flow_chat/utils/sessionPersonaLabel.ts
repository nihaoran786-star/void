/**
 * Presentation-only bridge for the frozen conversation identity.
 *
 * Once a session's persona binding is frozen by the first send, the composer
 * no longer shows a capsule; the identity is instead displayed as one quiet
 * text label in the conversation header. The composer already resolves the
 * localized display name from the same catalog data it always read, so it
 * publishes that text here and the header only renders it. No binding data
 * flows through this module — it carries a display string and nothing else.
 */

import { useSyncExternalStore } from 'react';

const labels = new Map<string, string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function publishSessionPersonaLabel(
  sessionId: string,
  label: string | null,
): void {
  const trimmed = label?.trim();
  if (!trimmed) {
    if (labels.delete(sessionId)) emit();
    return;
  }
  if (labels.get(sessionId) === trimmed) return;
  labels.set(sessionId, trimmed);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSessionPersonaLabel(sessionId?: string): string | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (sessionId ? labels.get(sessionId) : undefined),
  );
}
