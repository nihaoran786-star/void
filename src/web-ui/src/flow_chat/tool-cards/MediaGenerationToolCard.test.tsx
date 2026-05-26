import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { MediaGenerationToolCard } from './MediaGenerationToolCard';
import type { FlowToolItem, ToolCardConfig } from '../types/flow-chat';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const config: ToolCardConfig = {
  toolName: 'GenerateImage',
  displayName: 'Generate Image',
  icon: 'image',
  requiresConfirmation: false,
  resultDisplayType: 'detailed',
};

function createToolItem(): FlowToolItem {
  return {
    id: 'tool-1',
    type: 'tool',
    timestamp: Date.now(),
    toolName: 'GenerateImage',
    status: 'completed',
    toolCall: {
      id: 'call-1',
      input: { prompt: 'make an image' },
    },
    toolResult: {
      success: true,
      result: {
        status: 'completed',
        kind: 'image',
        batch: {
          batch_id: 'batch-1',
          kind: 'image',
          status: 'completed',
          total_count: 1,
          completed_count: 1,
          failed_count: 0,
          pending_count: 0,
          assets: [
            {
              kind: 'image',
              url: 'https://cdn.example.com/generated-1.png',
              item_index: 1,
              task_id: 'task-1',
            },
          ],
        },
      },
    },
  };
}

describe('MediaGenerationToolCard', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let dispatchEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    dispatchEvent = vi.fn();
    dom.window.dispatchEvent = dispatchEvent;
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });

    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens generated assets in the app browser panel', () => {
    vi.useFakeTimers();
    act(() => {
      root.render(<MediaGenerationToolCard toolItem={createToolItem()} config={config} />);
    });

    const asset = container.querySelector('.media-generation-card__asset') as HTMLElement;
    expect(asset).toBeTruthy();

    act(() => {
      asset.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'expand-right-panel',
    }));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'agent-create-tab',
      detail: expect.objectContaining({
        type: 'browser',
        data: { url: 'https://cdn.example.com/generated-1.png' },
      }),
    }));
  });

  it('dispatches a media reference event from the reference action', () => {
    act(() => {
      root.render(<MediaGenerationToolCard toolItem={createToolItem()} config={config} />);
    });

    const referenceButton = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('引用')) as HTMLButtonElement | undefined;
    expect(referenceButton).toBeTruthy();

    act(() => {
      referenceButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'void-media-reference-selected',
      detail: expect.objectContaining({
        context: expect.objectContaining({
          imagePath: 'https://cdn.example.com/generated-1.png',
          source: 'url',
        }),
      }),
    }));
  });
});
