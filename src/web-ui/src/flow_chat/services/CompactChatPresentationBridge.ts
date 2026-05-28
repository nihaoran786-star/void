import { isTauriRuntime } from '@/infrastructure/runtime';
import { createLogger } from '@/shared/utils/logger';
import { flowChatStore } from '../store/FlowChatStore';
import type { DialogTurn, Session } from '../types/flow-chat';

const log = createLogger('CompactChatPresentationBridge');
const COMPACT_CHAT_MAX_PRESENTATION_TURNS = 12;
const PRESENTATION_UPDATED_EVENT = 'compact-chat://presentation-updated';
const REQUEST_PRESENTATION_EVENT = 'compact-chat://request-presentation';
const SEND_MESSAGE_EVENT = 'compact-chat://send-message';
const CANCEL_TASK_EVENT = 'compact-chat://cancel-task';
const CLOSE_REQUEST_EVENT = 'compact-chat://close-request';

export type CompactChatUnavailableReason =
  | 'no-active-session'
  | 'workspace-unavailable';

export interface CompactChatSessionMirror {
  sessionId: string;
  title: string;
  status: Session['status'];
  dialogTurns: DialogTurn[];
}

export type CompactChatPresentation =
  | { status: 'ready'; activeSession: CompactChatSessionMirror; sequence?: number; emittedAt?: number }
  | { status: 'unavailable'; reason: CompactChatUnavailableReason; sequence?: number; emittedAt?: number };

let presentationSequence = 0;

type CompactChatPresentationSourceSubscribe = (handler: () => void) => () => void;

async function emitCompactChatEvent(eventName: string, payload: unknown): Promise<void> {
  const { emit } = await import('@tauri-apps/api/event');
  await emit(eventName, payload);
}

export function subscribeCompactChatPresentationSources(
  handler: () => void,
  sources: CompactChatPresentationSourceSubscribe[],
): () => void {
  const unsubscribers = sources.map(subscribe => subscribe(handler));
  return () => {
    unsubscribers.forEach(unsubscribe => {
      unsubscribe();
    });
  };
}

export function subscribeCompactChatPresentationSource(handler: () => void): () => void {
  const unsubscribeLegacy = flowChatStore.subscribe(handler);
  let disposed = false;
  let unsubscribeModern: (() => void) | null = null;

  void import('../store/modernFlowChatStore')
    .then(({ useModernFlowChatStore }) => {
      if (disposed) {
        return;
      }
      unsubscribeModern = useModernFlowChatStore.subscribe(handler);
      handler();
    })
    .catch(error => {
      log.warn('Failed to subscribe compact chat modern session source', error);
    });

  return () => {
    disposed = true;
    unsubscribeLegacy();
    unsubscribeModern?.();
  };
}

export function buildCompactChatPresentationFromSession(activeSession: Session | null | undefined): CompactChatPresentation {
  if (!activeSession) {
    return { status: 'unavailable', reason: 'no-active-session' };
  }

  return {
    status: 'ready',
    activeSession: {
      sessionId: activeSession.sessionId,
      title: activeSession.title || activeSession.sessionId,
      status: activeSession.status,
      dialogTurns: activeSession.dialogTurns.slice(-COMPACT_CHAT_MAX_PRESENTATION_TURNS),
    },
  };
}

async function getModernActiveSessionFallback(): Promise<Session | null> {
  try {
    const { useModernFlowChatStore } = await import('../store/modernFlowChatStore');
    return useModernFlowChatStore.getState().activeSession;
  } catch (error) {
    log.warn('Failed to read compact chat modern session fallback', error);
    return null;
  }
}

export async function buildCompactChatPresentationAsync(): Promise<CompactChatPresentation> {
  const state = flowChatStore.getState();
  const activeSession = state.activeSessionId
    ? state.sessions.get(state.activeSessionId)
    : undefined;

  return buildCompactChatPresentationFromSession(activeSession ?? await getModernActiveSessionFallback());
}

export function buildCompactChatPresentation(): CompactChatPresentation {
  const state = flowChatStore.getState();
  const activeSession = state.activeSessionId
    ? state.sessions.get(state.activeSessionId)
    : undefined;

  return buildCompactChatPresentationFromSession(activeSession);
}

export async function emitCompactChatPresentation(): Promise<void> {
  if (!isTauriRuntime()) return;

  try {
    const presentation = await buildCompactChatPresentationAsync();
    const sequencedPresentation = {
      ...presentation,
      sequence: presentationSequence += 1,
      emittedAt: Date.now(),
    };
    await emitCompactChatEvent(PRESENTATION_UPDATED_EVENT, sequencedPresentation);
  } catch (error) {
    log.warn('Failed to emit compact chat presentation update', error);
  }
}

export async function requestCompactChatPresentation(): Promise<void> {
  if (!isTauriRuntime()) return;

  try {
    await emitCompactChatEvent(REQUEST_PRESENTATION_EVENT, {});
  } catch (error) {
    log.warn('Failed to request compact chat presentation update', error);
  }
}

export async function listenCompactChatPresentationRequests(
  handler: () => void | Promise<void>,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => undefined;
  }

  try {
    const { listen } = await import('@tauri-apps/api/event');
    return await listen(REQUEST_PRESENTATION_EVENT, () => {
      void handler();
    });
  } catch (error) {
    log.warn('Failed to listen for compact chat presentation requests', error);
    return () => undefined;
  }
}

export async function listenCompactChatPresentation(
  handler: (presentation: CompactChatPresentation) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    handler({ status: 'unavailable', reason: 'workspace-unavailable' });
    return () => undefined;
  }

  try {
    const { listen } = await import('@tauri-apps/api/event');
    return await listen<CompactChatPresentation>(PRESENTATION_UPDATED_EVENT, event => {
      handler(event.payload);
    });
  } catch (error) {
    log.warn('Failed to listen for compact chat presentation updates', error);
    handler({ status: 'unavailable', reason: 'workspace-unavailable' });
    return () => undefined;
  }
}

export async function sendCompactChatMessage(message: string, sessionId: string): Promise<void> {
  if (!isTauriRuntime()) return;

  const trimmed = message.trim();
  if (!trimmed || !sessionId) return;

  try {
    await emitCompactChatEvent(SEND_MESSAGE_EVENT, {
      message: trimmed,
      sessionId,
    });
  } catch (error) {
    log.warn('Failed to emit compact chat message send request', { sessionId, error });
  }
}

export async function requestCompactChatCancelTask(sessionId: string): Promise<void> {
  if (!isTauriRuntime()) return;

  const trimmedSessionId = sessionId.trim();
  if (!trimmedSessionId) return;

  try {
    await emitCompactChatEvent(CANCEL_TASK_EVENT, {
      sessionId: trimmedSessionId,
    });
  } catch (error) {
    log.warn('Failed to emit compact chat cancel request', { sessionId: trimmedSessionId, error });
  }
}

export async function requestCompactChatClose(): Promise<void> {
  if (!isTauriRuntime()) return;

  try {
    await emitCompactChatEvent(CLOSE_REQUEST_EVENT, {});
  } catch (error) {
    log.warn('Failed to emit compact chat close request', error);
  }
}

export async function listenCompactChatMessageRequests(
  handler: (payload: { message: string; sessionId: string }) => void | Promise<void>,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => undefined;
  }

  try {
    const { listen } = await import('@tauri-apps/api/event');
    return await listen<{ message?: string; sessionId?: string }>(SEND_MESSAGE_EVENT, event => {
      const message = event.payload?.message?.trim();
      const sessionId = event.payload?.sessionId?.trim();
      if (!message || !sessionId) return;
      void handler({ message, sessionId });
    });
  } catch (error) {
    log.warn('Failed to listen for compact chat message requests', error);
    return () => undefined;
  }
}

export async function listenCompactChatCancelTaskRequests(
  handler: (payload: { sessionId: string }) => void | Promise<void>,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => undefined;
  }

  try {
    const { listen } = await import('@tauri-apps/api/event');
    return await listen<{ sessionId?: string }>(CANCEL_TASK_EVENT, event => {
      const sessionId = event.payload?.sessionId?.trim();
      if (!sessionId) return;
      void handler({ sessionId });
    });
  } catch (error) {
    log.warn('Failed to listen for compact chat cancel requests', error);
    return () => undefined;
  }
}

export async function listenCompactChatCloseRequests(
  handler: () => void | Promise<void>,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => undefined;
  }

  try {
    const { listen } = await import('@tauri-apps/api/event');
    return await listen(CLOSE_REQUEST_EVENT, () => {
      void handler();
    });
  } catch (error) {
    log.warn('Failed to listen for compact chat close requests', error);
    return () => undefined;
  }
}
