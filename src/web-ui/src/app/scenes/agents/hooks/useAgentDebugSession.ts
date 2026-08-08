import { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentDebugDraft } from '@/shared/services/customization/AgentDebugDraft';
import { computeAgentDraftFingerprint } from '@/shared/services/customization/AgentDebugDraft';
import {
  createAgentDebugRuntime,
  defaultAgentDebugRuntimeDeps,
  type AgentDebugSessionHandle,
} from '@/shared/services/customization/AgentDebugRuntimeService';

export type AgentDebugSessionStatus = 'idle' | 'creating' | 'ready' | 'stale' | 'error';

export interface UseAgentDebugSessionOptions {
  draft: AgentDebugDraft;
  isDraftValid: boolean;
  workspacePath?: string;
  runtime?: ReturnType<typeof createAgentDebugRuntime>;
}

type AgentDebugRuntime = ReturnType<typeof createAgentDebugRuntime>;

export const AGENT_DEBUG_REPLACE_DEBOUNCE_MS = 800;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let defaultRuntime: AgentDebugRuntime | undefined;
function resolveDefaultRuntime(): AgentDebugRuntime {
  defaultRuntime ??= createAgentDebugRuntime(defaultAgentDebugRuntimeDeps());
  return defaultRuntime;
}

export function useAgentDebugSession({
  draft,
  isDraftValid,
  workspacePath,
  runtime,
}: UseAgentDebugSessionOptions) {
  const resolvedRuntime = runtime ?? resolveDefaultRuntime();

  const [status, setStatus] = useState<AgentDebugSessionStatus>('idle');
  const [sessionId, setSessionId] = useState<string>();
  const [justReplaced, setJustReplaced] = useState(false);
  const [error, setError] = useState<string | null | undefined>(null);

  const mountedRef = useRef(true);
  const liveHandleRef = useRef<AgentDebugSessionHandle | null>(null);
  const createInFlightRef = useRef<{
    key: string;
    token: object;
    promise: Promise<AgentDebugSessionHandle>;
  }>();
  const replaceInFlightRef = useRef<Promise<void>>();
  const replaceTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingSendRef = useRef<Promise<void>>();

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const validRef = useRef(isDraftValid);
  validRef.current = isDraftValid;
  const workspaceRef = useRef(workspacePath);
  workspaceRef.current = workspacePath;

  const workspace = workspacePath?.trim();
  const fingerprint = isDraftValid ? computeAgentDraftFingerprint(draft) : null;

  const createSession = useCallback(async (
    targetDraft: AgentDebugDraft,
    targetWorkspace: string,
  ): Promise<AgentDebugSessionHandle> => {
    const targetFingerprint = computeAgentDraftFingerprint(targetDraft);
    const dedupeKey = `${targetFingerprint}::${targetWorkspace}`;
    const inFlight = createInFlightRef.current;
    if (inFlight && inFlight.key === dedupeKey) {
      return inFlight.promise;
    }

    const token: object = {};
    const promise = (async () => {
      if (mountedRef.current) {
        setStatus('creating');
        setError(undefined);
      }
      try {
        const handle = await resolvedRuntime.createDebugSession(targetDraft, targetWorkspace);
        // Adopt only when this create still matches the CURRENT target. A create
        // that resolved after the draft (or workspace) moved on is an orphan:
        // never adopt it, dispose it.
        const stillCurrent = mountedRef.current
          && validRef.current
          && Boolean(workspaceRef.current?.trim())
          && handle.draftFingerprint === computeAgentDraftFingerprint(draftRef.current)
          && handle.workspacePath === workspaceRef.current?.trim();
        if (stillCurrent) {
          liveHandleRef.current = handle;
          setSessionId(handle.sessionId);
          setStatus('ready');
        } else {
          void resolvedRuntime.disposeDebugSession(handle).catch(() => {});
        }
        return handle;
      } catch (createError) {
        if (mountedRef.current) {
          setStatus('error');
          setError(toErrorMessage(createError));
        }
        throw createError;
      } finally {
        if (createInFlightRef.current?.token === token) {
          createInFlightRef.current = undefined;
        }
      }
    })();
    createInFlightRef.current = { key: dedupeKey, token, promise };
    return promise;
  }, [resolvedRuntime]);

  const disposeLive = useCallback(async () => {
    const live = liveHandleRef.current;
    liveHandleRef.current = null;
    if (live) {
      await resolvedRuntime.disposeDebugSession(live).catch(() => {});
    }
  }, [resolvedRuntime]);

  const replaceSession = useCallback(async (
    targetDraft: AgentDebugDraft,
    targetWorkspace: string,
  ): Promise<void> => {
    const live = liveHandleRef.current;
    if (
      !live
      || (live.draftFingerprint === computeAgentDraftFingerprint(targetDraft)
        && live.workspacePath === targetWorkspace)
    ) {
      return;
    }
    await disposeLive();
    await createSession(targetDraft, targetWorkspace);
    if (mountedRef.current) {
      setJustReplaced(true);
    }
  }, [createSession, disposeLive]);

  useEffect(() => {
    if (!isDraftValid || !workspace) {
      if (replaceTimerRef.current) {
        clearTimeout(replaceTimerRef.current);
        replaceTimerRef.current = undefined;
      }
      void disposeLive();
      if (mountedRef.current) {
        setStatus('idle');
        setSessionId(undefined);
        setError(undefined);
        setJustReplaced(false);
      }
      return;
    }

    const live = liveHandleRef.current;
    if (!live) {
      void createSession(draftRef.current, workspace).catch(() => {});
      return;
    }
    if (live.draftFingerprint === fingerprint && live.workspacePath === workspace) {
      if (mountedRef.current) {
        setStatus(current => (current === 'stale' ? 'ready' : current));
      }
      return;
    }

    if (mountedRef.current) {
      setStatus('stale');
    }
    replaceTimerRef.current = setTimeout(() => {
      replaceTimerRef.current = undefined;
      const replace = replaceSession(draftRef.current, workspace).catch(() => {});
      replaceInFlightRef.current = replace;
      void replace.then(() => {
        if (replaceInFlightRef.current === replace) {
          replaceInFlightRef.current = undefined;
        }
      });
    }, AGENT_DEBUG_REPLACE_DEBOUNCE_MS);
    return () => {
      if (replaceTimerRef.current) {
        clearTimeout(replaceTimerRef.current);
        replaceTimerRef.current = undefined;
      }
    };
  }, [fingerprint, isDraftValid, workspace, createSession, replaceSession, disposeLive]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (replaceTimerRef.current) {
        clearTimeout(replaceTimerRef.current);
        replaceTimerRef.current = undefined;
      }
      const live = liveHandleRef.current;
      liveHandleRef.current = null;
      if (live) {
        void resolvedRuntime.disposeDebugSession(live).catch(() => {});
      }
    };
  }, [resolvedRuntime]);

  const send = useCallback(async (message: string): Promise<void> => {
    if (mountedRef.current) {
      setJustReplaced(false);
    }
    // Dedupe concurrent sends: share one pending send so a second call never
    // double-creates a session for the same draft.
    if (pendingSendRef.current) {
      return pendingSendRef.current;
    }
    // Synchronously detach the current handle and cancel any pending replace so
    // neither the debounce callback nor replaceSession can dispose the very
    // handle prepareForSend is about to hand to sendMessage.
    const current = liveHandleRef.current;
    liveHandleRef.current = null;
    if (replaceTimerRef.current) {
      clearTimeout(replaceTimerRef.current);
      replaceTimerRef.current = undefined;
    }
    const replace = replaceInFlightRef.current;
    const inFlight = createInFlightRef.current;
    const promise = (async () => {
      if (replace) {
        await replace.catch(() => {});
      }
      if (inFlight) {
        try {
          await inFlight.promise;
        } catch {
          // a failed create is retried through prepareForSend below
        }
      }
      const currentWorkspace = workspaceRef.current?.trim();
      if (!currentWorkspace || !validRef.current) {
        return;
      }
      // If the awaited in-flight create already adopted a handle for the current
      // target, reuse it instead of creating yet another session.
      const targetFingerprint = computeAgentDraftFingerprint(draftRef.current);
      const live = liveHandleRef.current;
      let handle: AgentDebugSessionHandle;
      if (
        live
        && live.draftFingerprint === targetFingerprint
        && live.workspacePath === currentWorkspace
      ) {
        handle = live;
      } else {
        handle = await resolvedRuntime.prepareForSend(
          current,
          draftRef.current,
          currentWorkspace,
        );
      }
      liveHandleRef.current = handle;
      if (mountedRef.current) {
        setSessionId(handle.sessionId);
        setStatus('ready');
        setError(undefined);
      }
      await resolvedRuntime.sendMessage(handle, message);
    })();
    pendingSendRef.current = promise;
    void promise.finally(() => {
      if (pendingSendRef.current === promise) {
        pendingSendRef.current = undefined;
      }
    });
    return promise;
  }, [resolvedRuntime]);

  const retry = useCallback(async (): Promise<void> => {
    const currentWorkspace = workspaceRef.current?.trim();
    if (!currentWorkspace || !validRef.current) {
      if (mountedRef.current) {
        setStatus('idle');
      }
      return;
    }
    await createSession(draftRef.current, currentWorkspace).catch(() => {});
  }, [createSession]);

  const acknowledgeMessageSent = useCallback(() => {
    if (mountedRef.current) {
      setJustReplaced(false);
    }
  }, []);

  return {
    status,
    sessionId,
    justReplaced,
    error,
    send,
    retry,
    acknowledgeMessageSent,
  };
}
