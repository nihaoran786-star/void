// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const matchMedia = () => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: matchMedia,
  });
});

vi.mock('@/shared/context-menu-system', () => ({
  useContextMenuStore: (selector: (state: { hideMenu: () => void }) => unknown) => (
    selector({ hideMenu: () => undefined })
  ),
}));

import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  computeAgentDraftFingerprint,
  type AgentDebugDraft,
} from '@/shared/services/customization/AgentDebugDraft';
import type { AgentDebugSessionHandle } from '@/shared/services/customization/AgentDebugRuntimeService';
import {
  AGENT_DEBUG_REPLACE_DEBOUNCE_MS,
  useAgentDebugSession,
} from './useAgentDebugSession';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACE = 'D:/workspace';

const baseDraft: AgentDebugDraft = {
  displayName: '测试智能体',
  description: 'desc',
  prompt: 'You are a helper.',
  tools: ['Read'],
  readonly: true,
  review: false,
};

const changedDraft: AgentDebugDraft = {
  ...baseDraft,
  prompt: 'You are a writer.',
};

function makeRuntime() {
  let counter = 0;
  const createDebugSession = vi.fn(
    async (draft: AgentDebugDraft, workspacePath: string): Promise<AgentDebugSessionHandle> => {
      counter += 1;
      return {
        sessionId: `session-${counter}`,
        subagentId: `custom-debug-${counter}`,
        subagentKey: `user::void::custom-debug-${counter}`,
        draftFingerprint: computeAgentDraftFingerprint(draft),
        workspacePath,
      };
    },
  );
  const prepareForSend = vi.fn(
    async (
      current: AgentDebugSessionHandle | null,
      draft: AgentDebugDraft,
      workspacePath: string,
    ): Promise<AgentDebugSessionHandle> => {
      if (
        current
        && current.draftFingerprint === computeAgentDraftFingerprint(draft)
        && current.workspacePath === workspacePath
      ) {
        return current;
      }
      return createDebugSession(draft, workspacePath);
    },
  );
  const disposeDebugSession = vi.fn(async (): Promise<void> => {});
  const sendMessage = vi.fn(async (): Promise<void> => {});
  const sweepOrphanedDebugSubagents = vi.fn(async (): Promise<number> => 0);
  const runtime = {
    createDebugSession,
    prepareForSend,
    disposeDebugSession,
    sendMessage,
    sweepOrphanedDebugSubagents,
  };
  return { runtime, createDebugSession, prepareForSend, disposeDebugSession, sendMessage };
}

describe('useAgentDebugSession', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: ReturnType<typeof useAgentDebugSession> | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    latest = undefined;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  function Harness({
    draft,
    isDraftValid,
    workspacePath,
    runtime,
  }: {
    draft: AgentDebugDraft;
    isDraftValid: boolean;
    workspacePath?: string;
    runtime: ReturnType<typeof makeRuntime>['runtime'];
  }) {
    const value = useAgentDebugSession({ draft, isDraftValid, workspacePath, runtime });
    useEffect(() => {
      latest = value;
    }, [value]);
    return null;
  }

  async function flush() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('stays idle when the draft is invalid and never creates a session', async () => {
    const { runtime, createDebugSession } = makeRuntime();
    await act(async () => {
      root.render(
        <Harness draft={baseDraft} isDraftValid={false} workspacePath={WORKSPACE} runtime={runtime} />,
      );
    });
    await flush();
    expect(latest?.status).toBe('idle');
    expect(latest?.sessionId).toBeUndefined();
    expect(createDebugSession).not.toHaveBeenCalled();
  });

  it('stays idle when no workspace path is available', async () => {
    const { runtime, createDebugSession } = makeRuntime();
    await act(async () => {
      root.render(<Harness draft={baseDraft} isDraftValid runtime={runtime} />);
    });
    await flush();
    expect(latest?.status).toBe('idle');
    expect(latest?.sessionId).toBeUndefined();
    expect(createDebugSession).not.toHaveBeenCalled();
  });

  it('creates a session eagerly once the draft is valid (creating -> ready)', async () => {
    const { runtime, createDebugSession } = makeRuntime();
    let resolveCreate: (handle: AgentDebugSessionHandle) => void = () => {};
    createDebugSession.mockImplementationOnce(
      () => new Promise<AgentDebugSessionHandle>(resolve => {
        resolveCreate = resolve;
      }),
    );

    await act(async () => {
      root.render(
        <Harness draft={baseDraft} isDraftValid workspacePath={WORKSPACE} runtime={runtime} />,
      );
    });
    expect(latest?.status).toBe('creating');

    await act(async () => {
      resolveCreate({
        sessionId: 'session-1',
        subagentId: 'custom-debug-1',
        subagentKey: 'user::void::custom-debug-1',
        draftFingerprint: computeAgentDraftFingerprint(baseDraft),
        workspacePath: WORKSPACE,
      });
      await Promise.resolve();
    });
    expect(latest?.status).toBe('ready');
    expect(latest?.sessionId).toBe('session-1');
    expect(createDebugSession).toHaveBeenCalledTimes(1);
    expect(createDebugSession).toHaveBeenCalledWith(baseDraft, WORKSPACE);
  });

  it('replaces the session when the draft fingerprint changes (debounced)', async () => {
    const { runtime, createDebugSession, disposeDebugSession } = makeRuntime();
    await act(async () => {
      root.render(
        <Harness draft={baseDraft} isDraftValid workspacePath={WORKSPACE} runtime={runtime} />,
      );
    });
    await flush();
    expect(latest?.status).toBe('ready');
    expect(latest?.sessionId).toBe('session-1');

    await act(async () => {
      root.render(
        <Harness draft={changedDraft} isDraftValid workspacePath={WORKSPACE} runtime={runtime} />,
      );
    });
    expect(latest?.status).toBe('stale');
    expect(disposeDebugSession).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AGENT_DEBUG_REPLACE_DEBOUNCE_MS);
    });
    await flush();

    expect(disposeDebugSession).toHaveBeenCalledTimes(1);
    expect(disposeDebugSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1' }),
    );
    expect(createDebugSession).toHaveBeenCalledTimes(2);
    expect(createDebugSession).toHaveBeenLastCalledWith(changedDraft, WORKSPACE);
    expect(latest?.status).toBe('ready');
    expect(latest?.sessionId).toBe('session-2');
    expect(latest?.justReplaced).toBe(true);
  });

  it('reuses the live session when sending with an unchanged draft', async () => {
    const { runtime, createDebugSession, prepareForSend, sendMessage } = makeRuntime();
    await act(async () => {
      root.render(
        <Harness draft={baseDraft} isDraftValid workspacePath={WORKSPACE} runtime={runtime} />,
      );
    });
    await flush();
    expect(latest?.sessionId).toBe('session-1');

    await act(async () => {
      await latest?.send('hello');
    });

    expect(prepareForSend).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1' }),
      baseDraft,
      WORKSPACE,
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1' }),
      'hello',
    );
    expect(createDebugSession).toHaveBeenCalledTimes(1);
    expect(latest?.sessionId).toBe('session-1');
  });

  it('creates a fresh session when sending after the draft changed', async () => {
    const { runtime, createDebugSession, sendMessage } = makeRuntime();
    await act(async () => {
      root.render(
        <Harness draft={baseDraft} isDraftValid workspacePath={WORKSPACE} runtime={runtime} />,
      );
    });
    await flush();
    expect(latest?.sessionId).toBe('session-1');

    await act(async () => {
      root.render(
        <Harness draft={changedDraft} isDraftValid workspacePath={WORKSPACE} runtime={runtime} />,
      );
    });
    expect(latest?.status).toBe('stale');

    await act(async () => {
      await latest?.send('second');
    });
    await flush();

    expect(createDebugSession).toHaveBeenCalledTimes(2);
    expect(createDebugSession).toHaveBeenLastCalledWith(changedDraft, WORKSPACE);
    expect(sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ sessionId: 'session-2' }),
      'second',
    );
    expect(latest?.status).toBe('ready');
    expect(latest?.sessionId).toBe('session-2');
    expect(latest?.justReplaced).toBe(false);
  });

  it('disposes the live session on unmount', async () => {
    const { runtime, disposeDebugSession } = makeRuntime();
    await act(async () => {
      root.render(
        <Harness draft={baseDraft} isDraftValid workspacePath={WORKSPACE} runtime={runtime} />,
      );
    });
    await flush();
    expect(latest?.sessionId).toBe('session-1');

    act(() => root.unmount());

    expect(disposeDebugSession).toHaveBeenCalledTimes(1);
    expect(disposeDebugSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1' }),
    );
  });

  it('reset disposes the current session and starts a fresh one for the same draft', async () => {
    const { runtime, createDebugSession, disposeDebugSession } = makeRuntime();
    await act(async () => {
      root.render(
        <Harness draft={baseDraft} isDraftValid workspacePath={WORKSPACE} runtime={runtime} />,
      );
    });
    await flush();
    expect(latest?.sessionId).toBe('session-1');

    await act(async () => {
      await latest?.reset();
    });
    await flush();

    expect(disposeDebugSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1' }),
    );
    expect(createDebugSession).toHaveBeenCalledTimes(2);
    expect(latest?.status).toBe('ready');
    expect(latest?.sessionId).toBe('session-2');
    expect(latest?.justReplaced).toBe(false);
  });

  it('reset falls back to idle when the draft is no longer usable', async () => {
    const { runtime, createDebugSession, disposeDebugSession } = makeRuntime();
    await act(async () => {
      root.render(
        <Harness draft={baseDraft} isDraftValid={false} workspacePath={WORKSPACE} runtime={runtime} />,
      );
    });
    await flush();

    await act(async () => {
      await latest?.reset();
    });
    await flush();

    expect(createDebugSession).not.toHaveBeenCalled();
    expect(disposeDebugSession).not.toHaveBeenCalled();
    expect(latest?.status).toBe('idle');
    expect(latest?.sessionId).toBeUndefined();
  });

  it('disposes the live session and returns to idle when the draft becomes invalid', async () => {
    const { runtime, createDebugSession, disposeDebugSession } = makeRuntime();
    await act(async () => {
      root.render(
        <Harness draft={baseDraft} isDraftValid workspacePath={WORKSPACE} runtime={runtime} />,
      );
    });
    await flush();
    expect(latest?.status).toBe('ready');
    expect(latest?.sessionId).toBe('session-1');

    await act(async () => {
      root.render(
        <Harness draft={baseDraft} isDraftValid={false} workspacePath={WORKSPACE} runtime={runtime} />,
      );
    });
    await flush();

    expect(disposeDebugSession).toHaveBeenCalledTimes(1);
    expect(disposeDebugSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1' }),
    );
    expect(latest?.status).toBe('idle');
    expect(latest?.sessionId).toBeUndefined();
    expect(createDebugSession).toHaveBeenCalledTimes(1);
  });

  it('disposes a create that resolved after the draft moved on (no orphan adoption)', async () => {
    const { runtime, createDebugSession, disposeDebugSession } = makeRuntime();
    let resolveCreateA: (handle: AgentDebugSessionHandle) => void = () => {};
    createDebugSession.mockImplementationOnce(
      () => new Promise<AgentDebugSessionHandle>(resolve => {
        resolveCreateA = resolve;
      }),
    );

    await act(async () => {
      root.render(
        <Harness draft={baseDraft} isDraftValid workspacePath={WORKSPACE} runtime={runtime} />,
      );
    });
    expect(latest?.status).toBe('creating');

    await act(async () => {
      root.render(
        <Harness draft={changedDraft} isDraftValid workspacePath={WORKSPACE} runtime={runtime} />,
      );
    });
    await flush();
    expect(latest?.status).toBe('ready');
    expect(latest?.sessionId).toBe('session-1');

    await act(async () => {
      resolveCreateA({
        sessionId: 'stale-session',
        subagentId: 'custom-debug-stale',
        subagentKey: 'user::void::custom-debug-stale',
        draftFingerprint: computeAgentDraftFingerprint(baseDraft),
        workspacePath: WORKSPACE,
      });
      await Promise.resolve();
    });
    await flush();

    expect(disposeDebugSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'stale-session' }),
    );
    expect(latest?.sessionId).toBe('session-1');
  });

  it('reuses a session that resolves while a send is pending (no double create)', async () => {
    const { runtime, createDebugSession, sendMessage } = makeRuntime();
    let resolveCreate: (handle: AgentDebugSessionHandle) => void = () => {};
    createDebugSession.mockImplementationOnce(
      () => new Promise<AgentDebugSessionHandle>(resolve => {
        resolveCreate = resolve;
      }),
    );

    await act(async () => {
      root.render(
        <Harness draft={baseDraft} isDraftValid workspacePath={WORKSPACE} runtime={runtime} />,
      );
    });
    expect(latest?.status).toBe('creating');

    let sendPromise: Promise<void>;
    await act(async () => {
      sendPromise = latest!.send('hello');
    });
    expect(sendMessage).not.toHaveBeenCalled();

    await act(async () => {
      resolveCreate({
        sessionId: 'session-1',
        subagentId: 'custom-debug-1',
        subagentKey: 'user::void::custom-debug-1',
        draftFingerprint: computeAgentDraftFingerprint(baseDraft),
        workspacePath: WORKSPACE,
      });
      await sendPromise;
    });
    await flush();

    expect(createDebugSession).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1' }),
      'hello',
    );
    expect(latest?.status).toBe('ready');
    expect(latest?.sessionId).toBe('session-1');
  });

  it('awaits an in-flight replace before sending on the fresh session', async () => {
    const { runtime, createDebugSession, sendMessage } = makeRuntime();
    await act(async () => {
      root.render(
        <Harness draft={baseDraft} isDraftValid workspacePath={WORKSPACE} runtime={runtime} />,
      );
    });
    await flush();
    expect(latest?.sessionId).toBe('session-1');

    await act(async () => {
      root.render(
        <Harness draft={changedDraft} isDraftValid workspacePath={WORKSPACE} runtime={runtime} />,
      );
    });
    expect(latest?.status).toBe('stale');

    let resolveReplace: (handle: AgentDebugSessionHandle) => void = () => {};
    createDebugSession.mockImplementationOnce(
      () => new Promise<AgentDebugSessionHandle>(resolve => {
        resolveReplace = resolve;
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AGENT_DEBUG_REPLACE_DEBOUNCE_MS);
    });
    expect(latest?.status).toBe('creating');

    let sendPromise: Promise<void>;
    await act(async () => {
      sendPromise = latest!.send('during');
    });
    expect(sendMessage).not.toHaveBeenCalled();

    await act(async () => {
      resolveReplace({
        sessionId: 'session-2',
        subagentId: 'custom-debug-2',
        subagentKey: 'user::void::custom-debug-2',
        draftFingerprint: computeAgentDraftFingerprint(changedDraft),
        workspacePath: WORKSPACE,
      });
      await sendPromise;
    });
    await flush();

    expect(createDebugSession).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-2' }),
      'during',
    );
    expect(latest?.status).toBe('ready');
    expect(latest?.sessionId).toBe('session-2');
    expect(latest?.justReplaced).toBe(true);
  });

  it('disposes a create that resolves after unmount without touching state', async () => {
    const { runtime, createDebugSession, disposeDebugSession } = makeRuntime();
    let resolveCreate: (handle: AgentDebugSessionHandle) => void = () => {};
    createDebugSession.mockImplementationOnce(
      () => new Promise<AgentDebugSessionHandle>(resolve => {
        resolveCreate = resolve;
      }),
    );

    await act(async () => {
      root.render(
        <Harness draft={baseDraft} isDraftValid workspacePath={WORKSPACE} runtime={runtime} />,
      );
    });
    expect(latest?.status).toBe('creating');

    act(() => root.unmount());

    await act(async () => {
      resolveCreate({
        sessionId: 'session-1',
        subagentId: 'custom-debug-1',
        subagentKey: 'user::void::custom-debug-1',
        draftFingerprint: computeAgentDraftFingerprint(baseDraft),
        workspacePath: WORKSPACE,
      });
      await Promise.resolve();
    });

    expect(disposeDebugSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1' }),
    );
  });

  it('captures create errors and recovers via retry', async () => {
    const { runtime, createDebugSession } = makeRuntime();
    let rejectCreate: (error: Error) => void = () => {};
    createDebugSession.mockImplementationOnce(
      () => new Promise<AgentDebugSessionHandle>((_, reject) => {
        rejectCreate = reject;
      }),
    );

    await act(async () => {
      root.render(
        <Harness draft={baseDraft} isDraftValid workspacePath={WORKSPACE} runtime={runtime} />,
      );
    });
    expect(latest?.status).toBe('creating');

    await act(async () => {
      rejectCreate(new Error('create failed'));
      await Promise.resolve();
    });
    expect(latest?.status).toBe('error');
    expect(latest?.error).toBe('create failed');
    expect(latest?.sessionId).toBeUndefined();

    await act(async () => {
      await latest?.retry();
    });
    await flush();
    expect(latest?.status).toBe('ready');
    expect(latest?.sessionId).toBe('session-1');
    expect(latest?.error).toBeUndefined();
  });
});
