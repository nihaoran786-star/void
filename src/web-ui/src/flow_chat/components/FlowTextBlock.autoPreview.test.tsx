import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { FlowTextBlock } from './FlowTextBlock';
import { FlowChatContext } from './modern/FlowChatContext';
import { autoPreviewOrchestrator } from '@/shared/services/preview/AutoPreviewService';
import type { FlowTextItem } from '../types/flow-chat';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  maybeOpen: vi.fn(),
}));

vi.mock('@/component-library', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

vi.mock('../hooks/useTypewriter', () => ({
  useTypewriter: (content: string) => content,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('@/shared/services/preview/AutoPreviewService', async () => {
  const actual = await vi.importActual<typeof import('@/shared/services/preview/AutoPreviewService')>(
    '@/shared/services/preview/AutoPreviewService'
  );
  return {
    ...actual,
    autoPreviewOrchestrator: {
      maybeOpen: mocks.maybeOpen,
    },
  };
});

function buildTextItem(overrides: Partial<FlowTextItem>): FlowTextItem {
  return {
    id: 'text-a',
    type: 'text',
    timestamp: 1,
    status: 'streaming',
    content: 'Preview: http://127.0.0.1:5173',
    isStreaming: true,
    isMarkdown: true,
    ...overrides,
  };
}

describe('FlowTextBlock auto preview', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent);

    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
    mocks.maybeOpen.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  });

  it('auto previews a URL when a new streaming assistant text completes', () => {
    const renderBlock = (textItem: FlowTextItem) => (
      <FlowChatContext.Provider
        value={{
          sessionId: 'session-a',
          activeSessionOverride: { workspacePath: 'C:/workspace-a' } as any,
        }}
      >
        <FlowTextBlock textItem={textItem} />
      </FlowChatContext.Provider>
    );

    act(() => {
      root.render(renderBlock(buildTextItem({ status: 'streaming', isStreaming: true })));
    });
    expect(autoPreviewOrchestrator.maybeOpen).not.toHaveBeenCalled();

    act(() => {
      root.render(renderBlock(buildTextItem({ status: 'completed', isStreaming: false })));
    });

    expect(autoPreviewOrchestrator.maybeOpen).toHaveBeenCalledWith({
      kind: 'url',
      url: 'http://127.0.0.1:5173',
      source: 'assistant-message',
      sessionId: 'session-a',
      turnId: 'text-a',
      workspaceKey: 'C:/workspace-a',
      confidence: 'high',
    });
  });

  it('does not auto preview an already-completed text block on first render', () => {
    act(() => {
      root.render(
        <FlowChatContext.Provider value={{ sessionId: 'session-a' }}>
          <FlowTextBlock textItem={buildTextItem({ status: 'completed', isStreaming: false })} />
        </FlowChatContext.Provider>
      );
    });

    expect(autoPreviewOrchestrator.maybeOpen).not.toHaveBeenCalled();
  });
});
