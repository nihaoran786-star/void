import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { Markdown } from './Markdown';
import { openRightPanelPreview } from '@/shared/services/preview/PreviewService';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  openRightPanelPreview: vi.fn(),
}));

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
  i18nService: {
    t: (key: string) => key,
    getT: () => (key: string) => key,
  },
}));

vi.mock('@/infrastructure/theme', () => ({
  useTheme: () => ({
    isLight: false,
  }),
}));

vi.mock('../../../infrastructure/api', () => ({
  globalAPI: {
    getCurrentWorkspacePath: vi.fn(async () => 'C:/workspace-a'),
  },
  systemAPI: {
    openExternal: vi.fn(async () => undefined),
  },
  workspaceAPI: {
    getAbsolutePath: vi.fn(async (_basePath: string, filePath: string) => filePath),
  },
}));

vi.mock('@/shared/context-menu-system', () => ({
  contextMenuController: {
    show: vi.fn(),
  },
}));

vi.mock('../../../shared/notification-system', () => ({
  notificationService: {
    error: vi.fn(),
  },
}));

vi.mock('@/shared/utils/syntaxHighlighterLoader', () => ({
  getLoadedPrismSyntaxHighlighter: () => null,
  loadPrismSyntaxHighlighter: vi.fn(async () => null),
}));

vi.mock('@/shared/services/preview/PreviewService', async () => {
  const actual = await vi.importActual<typeof import('@/shared/services/preview/PreviewService')>(
    '@/shared/services/preview/PreviewService'
  );
  return {
    ...actual,
    openRightPanelPreview: mocks.openRightPanelPreview,
  };
});

describe('Markdown right panel preview links', () => {
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
    mocks.openRightPanelPreview.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  });

  it('shows a right-panel preview action for HTTP links when enabled', async () => {
    await act(async () => {
      root.render(
        <Markdown
          content="[Preview](http://127.0.0.1:5173)"
          showRightPanelPreviewLinks
        />
      );
    });

    const button = container.querySelector<HTMLButtonElement>('[aria-label="Open preview in right panel"]');
    expect(button).not.toBeNull();

    act(() => {
      button?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(openRightPanelPreview).toHaveBeenCalledWith({
      url: 'http://127.0.0.1:5173',
      source: 'manual',
      workspaceKey: 'C:/workspace-a',
      title: 'markdown.openInBuiltInBrowser',
    });
  });

  it('does not show the preview action unless explicitly enabled', async () => {
    await act(async () => {
      root.render(<Markdown content="[Preview](http://127.0.0.1:5173)" />);
    });

    expect(container.querySelector('[aria-label="Open preview in right panel"]')).toBeNull();
  });

  it('shows a right-panel preview action for code blocks containing only an HTTP URL', async () => {
    await act(async () => {
      root.render(
        <Markdown
          content={'```text\nhttp://127.0.0.1:5173\n```'}
          showRightPanelPreviewLinks
        />
      );
    });

    const button = container.querySelector<HTMLButtonElement>('[aria-label="Open preview in right panel"]');
    expect(button).not.toBeNull();

    act(() => {
      button?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(openRightPanelPreview).toHaveBeenCalledWith({
      url: 'http://127.0.0.1:5173',
      source: 'manual',
      workspaceKey: 'C:/workspace-a',
      title: 'markdown.openInBuiltInBrowser',
    });
  });
});
