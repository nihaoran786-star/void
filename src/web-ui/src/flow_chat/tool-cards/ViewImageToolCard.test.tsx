import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import type { FlowToolItem, ToolCardConfig } from '../types/flow-chat';
import { ViewImageToolCard } from './ViewImageToolCard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: { name?: string }) => params?.name ? `${key}:${params.name}` : key,
  }),
}));

const config: ToolCardConfig = {
  toolName: 'ViewImage',
  displayName: 'View Image',
  icon: 'IMG',
  requiresConfirmation: false,
  resultDisplayType: 'detailed',
};

function createToolItem(withAttachment = true): FlowToolItem {
  return {
    id: 'view-image-1',
    type: 'tool',
    timestamp: 1,
    toolName: 'ViewImage',
    status: 'completed',
    toolCall: {
      id: 'view-image-1',
      input: { image_path: 'C:/repo/poster.png' },
    },
    toolResult: {
      success: true,
      result: { status: 'success' },
    },
    previewImageAttachments: withAttachment
      ? [{ mimeType: 'image/png', dataBase64: 'aGVsbG8=' }]
      : undefined,
  };
}

describe('ViewImageToolCard', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let dispatchEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
    dispatchEvent = vi.fn();
    dom.window.dispatchEvent = dispatchEvent;
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it('opens a loaded attachment through MediaPreviewService', () => {
    act(() => root.render(<ViewImageToolCard toolItem={createToolItem()} config={config} />));
    const image = container.querySelector('img') as HTMLImageElement;
    const button = container.querySelector('.view-image-tool-card__preview') as HTMLButtonElement;

    expect(image.src).toBe('data:image/png;base64,aGVsbG8=');
    expect(button.disabled).toBe(true);

    act(() => image.dispatchEvent(new dom.window.Event('load', { bubbles: true })));
    expect(button.disabled).toBe(false);

    act(() => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'void-media-preview-open',
      detail: expect.objectContaining({
        kind: 'image',
        url: 'data:image/png;base64,aGVsbG8=',
        title: 'poster.png',
      }),
    }));
  });

  it('renders an explicit fallback when no valid attachment is available', () => {
    act(() => root.render(<ViewImageToolCard toolItem={createToolItem(false)} config={config} />));
    const button = container.querySelector('.view-image-tool-card__preview') as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('toolCards.viewImage.unavailable');
    expect(container.querySelector('img')).toBeNull();
  });

  it('disables preview and reports a load failure', () => {
    act(() => root.render(<ViewImageToolCard toolItem={createToolItem()} config={config} />));
    const image = container.querySelector('img') as HTMLImageElement;

    act(() => image.dispatchEvent(new dom.window.Event('error', { bubbles: true })));
    const button = container.querySelector('.view-image-tool-card__preview') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('toolCards.viewImage.loadFailed');
  });

  it('renders the status as a normal-flow sibling outside the preview button', () => {
    act(() => root.render(<ViewImageToolCard toolItem={createToolItem()} config={config} />));
    const button = container.querySelector('.view-image-tool-card__preview') as HTMLButtonElement;
    const status = container.querySelector('.view-image-tool-card__status') as HTMLSpanElement;

    expect(button.contains(status)).toBe(false);
    expect(button.nextElementSibling).toBe(status);
  });

  it('prioritizes the real tool error over preview availability', () => {
    const item = createToolItem(false);
    item.status = 'error';
    item.toolResult = {
      success: false,
      result: null,
      error: 'Image decoder rejected the source payload',
    };

    act(() => root.render(<ViewImageToolCard toolItem={item} config={config} />));
    const button = container.querySelector('.view-image-tool-card__preview') as HTMLButtonElement;
    const status = container.querySelector('.view-image-tool-card__status') as HTMLSpanElement;

    expect(button.getAttribute('aria-label')).toBe('Image decoder rejected the source payload');
    expect(status.textContent).toBe('Image decoder rejected the source payload');
  });

  it('renders a completed ViewImage domain error returned in the result payload', () => {
    const item = createToolItem(false);
    item.toolResult = {
      success: true,
      result: {
        status: 'path_denied',
        error: '  Path is outside workspace  ',
      },
    };

    act(() => root.render(<ViewImageToolCard toolItem={item} config={config} />));
    const button = container.querySelector('.view-image-tool-card__preview') as HTMLButtonElement;
    const status = container.querySelector('.view-image-tool-card__status') as HTMLSpanElement;

    expect(button.getAttribute('aria-label')).toBe('Path is outside workspace');
    expect(status.textContent).toBe('Path is outside workspace');
  });
});
