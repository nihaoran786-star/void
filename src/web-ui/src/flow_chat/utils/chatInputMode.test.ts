import { describe, expect, it } from 'vitest';

import {
  resolveEffectiveChatInputMode,
  resolveWorkspaceChatInputMode,
} from './chatInputMode';

describe('resolveEffectiveChatInputMode', () => {
  it('keeps the persisted Media room authoritative after a draft becomes a session', () => {
    expect(
      resolveEffectiveChatInputMode({
        isNewSessionDraft: false,
        isAssistantWorkspace: false,
        draftMode: 'Media',
        reducerMode: 'agentic',
        sessionMode: 'Media',
      }),
    ).toBe('Media');
  });

  it('keeps the selected draft mode authoritative before the session exists', () => {
    expect(
      resolveEffectiveChatInputMode({
        isNewSessionDraft: true,
        isAssistantWorkspace: false,
        draftMode: 'Media',
        reducerMode: 'agentic',
        sessionMode: undefined,
      }),
    ).toBe('Media');
  });

  it('falls back to the reducer only when no real session mode exists', () => {
    expect(
      resolveEffectiveChatInputMode({
        isNewSessionDraft: false,
        isAssistantWorkspace: false,
        draftMode: 'Media',
        reducerMode: 'Plan',
        sessionMode: undefined,
      }),
    ).toBe('Plan');
  });

  it('keeps assistant workspaces in Claw even when a project mode is persisted', () => {
    expect(
      resolveEffectiveChatInputMode({
        isNewSessionDraft: false,
        isAssistantWorkspace: true,
        draftMode: 'agentic',
        reducerMode: 'agentic',
        sessionMode: 'agentic',
      }),
    ).toBe('Claw');
  });
});

describe('resolveWorkspaceChatInputMode', () => {
  it('forces Claw inside assistant workspaces', () => {
    expect(
      resolveWorkspaceChatInputMode({
        currentMode: 'agentic',
        isAssistantWorkspace: true,
        sessionMode: 'agentic',
      })
    ).toBe('Claw');
  });

  it('keeps non-Claw project modes unchanged', () => {
    expect(
      resolveWorkspaceChatInputMode({
        currentMode: 'Plan',
        isAssistantWorkspace: false,
        sessionMode: 'Plan',
      })
    ).toBeNull();
  });

  it('syncs when switching between project sessions with different modes', () => {
    expect(
      resolveWorkspaceChatInputMode({
        currentMode: 'Plan',
        isAssistantWorkspace: false,
        sessionMode: 'agentic',
      })
    ).toBe('agentic');
  });

  it('restores a project session mode after a transient assistant workspace state', () => {
    expect(
      resolveWorkspaceChatInputMode({
        currentMode: 'Claw',
        isAssistantWorkspace: false,
        sessionMode: 'agentic',
      })
    ).toBe('agentic');
  });

  it('restores Cowork when a project Cowork session inherited the Claw UI mode', () => {
    expect(
      resolveWorkspaceChatInputMode({
        currentMode: 'Claw',
        isAssistantWorkspace: false,
        sessionMode: 'Cowork',
      })
    ).toBe('Cowork');
  });

  it('falls back to agentic if a project session has no mode yet', () => {
    expect(
      resolveWorkspaceChatInputMode({
        currentMode: 'Claw',
        isAssistantWorkspace: false,
        sessionMode: undefined,
      })
    ).toBe('agentic');
  });
});
