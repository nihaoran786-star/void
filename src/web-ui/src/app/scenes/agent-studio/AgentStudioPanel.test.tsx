import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentStudioPanel } from './AgentStudioPanel';
import type { AgentStudioState } from './agentStudioSession';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/flow_chat/store/FlowChatStore', () => ({
  flowChatStore: {
    subscribe: () => () => undefined,
    getState: () => ({ sessions: new Map() }),
  },
}));

vi.mock('@/app/scenes/agents/components/AgentDebugChatPanel', () => ({
  AgentDebugChatPanel: ({ status }: { status: string }) => (
    <div data-testid="trial-panel" data-status={status} />
  ),
}));

const CONTENT = {
  personaKey: 'user::void::writer',
  displayName: 'Writer',
  description: 'Writes copy',
  prompt: 'You write copy.',
  tools: ['read_file'],
  readonly: true,
  review: false,
  model: 'default',
  allowedParentAgentIds: ['agentic'],
};

function state(overrides: Partial<AgentStudioState> = {}): AgentStudioState {
  return {
    phase: 'editing',
    trial: 'untried',
    draft: {
      draftId: 'draft-1',
      draftRevisionId: 'draft-rev-1',
      draftFingerprint: 'draft-rev-1',
      definitionId: 'def-1',
      scope: { level: 'user' },
      baseRevisionId: 'rev-v3',
      status: 'editing',
      content: CONTENT,
      validationEvidence: [],
      updatedAt: '2026-08-17T00:00:00.000Z',
    },
    canPublish: false,
    ...overrides,
  } as AgentStudioState;
}

describe('AgentStudioPanel', () => {
  let dom: JSDOM;
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><div id="root"></div>');
    globalThis.window = dom.window as unknown as Window & typeof globalThis;
    globalThis.document = dom.window.document;
    container = dom.window.document.getElementById('root') as HTMLElement;
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  function publishButtons(): HTMLButtonElement[] {
    return Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '.void-agent-studio__publish-actions button',
      ),
    );
  }

  it('disables every publish action while the draft is untried', () => {
    act(() => {
      root.render(
        <AgentStudioPanel
          state={state()}
          debugSessionId={null}
          onSave={vi.fn()}
          onStartTrial={vi.fn()}
          onPublish={vi.fn()}
        />,
      );
    });

    expect(publishButtons()).toHaveLength(3);
    expect(publishButtons().every(button => button.disabled)).toBe(true);
  });

  it('enables the publish actions once the draft has been tried', () => {
    act(() => {
      root.render(
        <AgentStudioPanel
          state={state({ trial: 'ready', canPublish: true })}
          debugSessionId="debug-1"
          onSave={vi.fn()}
          onStartTrial={vi.fn()}
          onPublish={vi.fn()}
        />,
      );
    });

    expect(publishButtons().every(button => button.disabled)).toBe(false);
  });

  it('offers exactly the three activation actions', () => {
    const onPublish = vi.fn();
    act(() => {
      root.render(
        <AgentStudioPanel
          state={state({ trial: 'ready', canPublish: true })}
          debugSessionId="debug-1"
          onSave={vi.fn()}
          onStartTrial={vi.fn()}
          onPublish={onPublish}
        />,
      );
    });

    publishButtons().forEach(button => act(() => button.click()));

    expect(onPublish.mock.calls.map(call => call[0].kind))
      .toEqual(['continue', 'fork', 'future-default']);
  });

  it('binds the form to the draft the catalog returned', () => {
    act(() => {
      root.render(
        <AgentStudioPanel
          state={state()}
          debugSessionId={null}
          onSave={vi.fn()}
          onStartTrial={vi.fn()}
          onPublish={vi.fn()}
        />,
      );
    });

    expect((container.querySelector('textarea') as HTMLTextAreaElement).value)
      .toBe('You write copy.');
  });

  it('saves the draft content, never a persona key the user could retarget', () => {
    const onSave = vi.fn();
    act(() => {
      root.render(
        <AgentStudioPanel
          state={state()}
          debugSessionId={null}
          onSave={onSave}
          onStartTrial={vi.fn()}
          onPublish={vi.fn()}
        />,
      );
    });

    const saveButton = container.querySelector(
      '.void-agent-studio__editor button',
    ) as HTMLButtonElement;
    act(() => saveButton.click());

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'You write copy.', personaKey: 'user::void::writer' }),
    );
    expect(container.querySelector('input[name="personaKey"]')).toBeNull();
  });

  it('never offers a tools editor, because widening capability is not a text edit', () => {
    act(() => {
      root.render(
        <AgentStudioPanel
          state={state()}
          debugSessionId={null}
          onSave={vi.fn()}
          onStartTrial={vi.fn()}
          onPublish={vi.fn()}
        />,
      );
    });

    const toolsNode = container.querySelector('.void-agent-studio__tools');
    expect(toolsNode?.tagName).toBe('P');
    expect(container.querySelector('.void-agent-studio__tools input')).toBeNull();
  });

  it('renders a closed studio without any action', () => {
    act(() => {
      root.render(
        <AgentStudioPanel
          state={state({ phase: 'closed', draft: null })}
          debugSessionId={null}
          onSave={vi.fn()}
          onStartTrial={vi.fn()}
          onPublish={vi.fn()}
        />,
      );
    });

    expect(container.querySelector('[data-studio-state="closed"]')).not.toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('stays closed even when a draft is still held, so a closed studio offers nothing', () => {
    // close() clears the phase; a draft left in state must not resurrect the
    // editor, or closing the tab would still expose save and publish.
    act(() => {
      root.render(
        <AgentStudioPanel
          state={state({ phase: 'closed', trial: 'ready', canPublish: false })}
          debugSessionId="debug-1"
          onSave={vi.fn()}
          onStartTrial={vi.fn()}
          onPublish={vi.fn()}
        />,
      );
    });

    expect(container.querySelector('[data-studio-state="closed"]')).not.toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});
