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

/**
 * Transcript height contract.
 *
 * A markdown image has no intrinsic size until its bitmap decodes, so it takes
 * up a sliver of a line at mount and hundreds of pixels a moment later. In the
 * virtualized transcript that is an unsignalled post-mount height change — the
 * class of defect described in
 * `src/web-ui/src/flow_chat/components/modern/FLOWCHAT_SCROLL_STABILITY.md`.
 * The list has to be told, or it discovers the delta and reserves tail space
 * for it instead.
 */
describe('Markdown image height contract', () => {
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
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  });

  it('asks the transcript to re-measure once an image finishes decoding', async () => {
    await act(async () => {
      root.render(<Markdown content="![alt](https://example.test/diagram.png)" />);
    });

    const image = container.querySelector('img');
    expect(image).not.toBeNull();

    let heightChanges = 0;
    dom.window.addEventListener('tool-card-toggle', () => {
      heightChanges += 1;
    });

    act(() => {
      image?.dispatchEvent(new dom.window.Event('load'));
    });
    expect(heightChanges).toBe(1);

    // A broken image also changes the box (alt text replaces the placeholder),
    // so it has to announce itself too.
    act(() => {
      image?.dispatchEvent(new dom.window.Event('error'));
    });
    expect(heightChanges).toBe(2);
  });

  it('stays silent until the image actually resolves', async () => {
    let heightChanges = 0;
    dom.window.addEventListener('tool-card-toggle', () => {
      heightChanges += 1;
    });

    await act(async () => {
      root.render(<Markdown content="![alt](https://example.test/diagram.png)" />);
    });

    // Mounting alone must not announce anything: the transcript already sized
    // the item when it rendered it.
    expect(heightChanges).toBe(0);
  });
});
