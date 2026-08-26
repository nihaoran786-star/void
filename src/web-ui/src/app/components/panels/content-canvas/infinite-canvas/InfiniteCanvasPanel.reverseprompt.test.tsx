/**
 * P5 W7 panel closure: reverse-prompt.
 *
 * The three expensive invariants:
 *
 * - it never dispatches a generation, no matter what comes back;
 * - it never silently overwrites a prompt the owner already wrote;
 * - every typed failure lands as a named line on screen, and in particular
 *   "no vision model configured" says so rather than failing quietly.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';

const flow = vi.hoisted(() => ({ props: null as any }));

vi.mock('@xyflow/react', async () => {
  const React = (await import('react')).default;
  return {
    ReactFlow: (props: any) => {
      flow.props = props;
      return React.createElement(
        'div',
        { 'data-testid': 'react-flow' },
        props.nodes.map((node: any) => {
          const NodeComponent = props.nodeTypes[node.type];
          return React.createElement(
            'div',
            { key: node.id, 'data-node-id': node.id },
            React.createElement(NodeComponent, { id: node.id, data: node.data, selected: false }),
          );
        }),
        props.children,
      );
    },
    Background: () => null,
    Controls: () => null,
    Handle: () => null,
    Position: { Left: 'left', Right: 'right' },
    applyNodeChanges: (changes: any[], nodes: any[]) => nodes
      .filter(node => !changes.some(change => change.type === 'remove' && change.id === node.id)),
    applyEdgeChanges: (changes: any[], edges: any[]) => edges
      .filter(edge => !changes.some(change => change.type === 'remove' && change.id === edge.id)),
  };
});

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/shared/services/workspace-media/WorkspaceMediaPreviewResolver', () => ({
  resolveWorkspaceMediaPreviewUrl: vi.fn(async () => undefined),
}));

vi.mock('@/shared/services/workspace-media/WorkspaceMediaLibrary', () => ({
  workspaceMediaLibraryService: {
    checkAvailability: async () => ({ status: 'unknown' }),
    scanLibrary: async () => ({ status: 'empty', scannedAt: 0 }),
  },
}));

vi.mock('./infiniteCanvasDocumentGateway', () => ({
  getInfiniteCanvasDocumentService: () => {
    throw new Error('Tests must inject a document service.');
  },
  getInfiniteCanvasMediaJobReader: () => ({ readTextFile: async () => null }),
  // The P5 ports are deliberately absent, so no test can reach a real Tauri
  // command by accident: an unresolvable port simply does not exist.
}));

vi.mock('./infiniteCanvasGenerationRuntime', () => ({
  createInfiniteCanvasGenerationRuntime: () => {
    throw new Error('Tests must inject a generation runtime.');
  },
}));

import { StylePresetCatalog } from '@/shared/services/style-preset';
import {
  createInMemoryInfiniteCanvasPersistence,
  defaultInfiniteCanvasDocumentId,
  infiniteCanvasDocumentFilePath,
  InfiniteCanvasDocumentService,
  type InfiniteCanvasDocument,
  type InMemoryInfiniteCanvasPersistence,
} from '@/shared/services/infinite-canvas';
import { InfiniteCanvasPanel } from './InfiniteCanvasPanel';

/**
 * Restated here rather than imported: the gateway module is mocked in this
 * file, and a copy that must be kept in step is exactly the point — if the
 * Rust status set grows, this list is where the omission shows up.
 */
const FAILURE_STATUSES = [
  'unsupported_model',
  'provider_not_configured',
  'invalid_image',
  'path_denied',
  'backend',
] as const;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACE = { workspaceId: 'workspace-a', workspacePath: 'C:/workspace-a' };
const TEST_CATALOG = new StylePresetCatalog([], []);
const PNG_DATA_URL = 'data:image/png;base64,QUJD';
const REVERSED = 'a tabby cat asleep on a wooden bench, soft afternoon light';

const IMAGE_NODE = {
  nodeId: 'n-image',
  kind: 'image' as const,
  position: { x: 0, y: 0 },
  size: { width: 240, height: 240 },
  mediaRef: {
    workspacePath: WORKSPACE.workspacePath,
    relativePath: 'media/generated/b1/image-001.png',
  },
};

function documentPath(): string {
  return infiniteCanvasDocumentFilePath(
    WORKSPACE.workspacePath,
    defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId),
  );
}

function seedDocument(
  memory: InMemoryInfiniteCanvasPersistence,
  overrides: Partial<InfiniteCanvasDocument> = {},
): void {
  memory.files.set(documentPath(), JSON.stringify({
    documentId: defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId),
    schemaVersion: '1',
    workspaceId: WORKSPACE.workspaceId,
    revision: 1,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  }));
}

function readDocument(memory: InMemoryInfiniteCanvasPersistence): InfiniteCanvasDocument {
  const raw = memory.files.get(documentPath());
  expect(raw).toBeDefined();
  return JSON.parse(raw!) as InfiniteCanvasDocument;
}

describe('InfiniteCanvasPanel P5 reverse-prompt', () => {
  const stubRuntime = {
    gateway: {
      invoke: vi.fn(async (invocation: { operationId: string }) => ({
        operationId: invocation.operationId,
        status: 'succeeded' as const,
      })),
    },
    hasTargetSession: () => true,
  };

  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let memory: InMemoryInfiniteCanvasPersistence;
  let service: InfiniteCanvasDocumentService;
  let analyzeCanvasImage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
    vi.stubGlobal('Blob', dom.window.Blob);

    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
    memory = createInMemoryInfiniteCanvasPersistence();
    service = new InfiniteCanvasDocumentService(memory.port, { debounceMs: 1 });
    analyzeCanvasImage = vi.fn(async () => ({ status: 'completed', prompt: REVERSED }));
    flow.props = null;
    stubRuntime.gateway.invoke.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    service.dispose();
    vi.unstubAllGlobals();
  });

  async function renderPanel(
    props: Partial<React.ComponentProps<typeof InfiniteCanvasPanel>> = {},
  ) {
    await act(async () => {
      root.render(
        <InfiniteCanvasPanel
          workspaceId={WORKSPACE.workspaceId}
          workspacePath={WORKSPACE.workspacePath}
          isActive
          service={service}
          resolvePreviewUrl={async () => PNG_DATA_URL}
          catalog={TEST_CATALOG}
          generationRuntime={stubRuntime}
          analyzeCanvasImage={analyzeCanvasImage as never}
          {...props}
        />,
      );
    });
  }

  const button = () => (
    container.querySelector('[data-node-action="reverse-prompt"]') as HTMLButtonElement | null
  );

  async function press() {
    await act(async () => {
      button()!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    await act(async () => { await Promise.resolve(); });
    await service.flushPendingWrites();
  }

  it('offers reverse-prompt only on a card that carries a picture', async () => {
    seedDocument(memory, {
      nodes: [IMAGE_NODE, { nodeId: 'n-blank', kind: 'image', position: { x: 400, y: 0 } }],
    });
    await renderPanel();

    const cards = Array.from(container.querySelectorAll('[data-node-id]'));
    const withMedia = cards.find(card => card.getAttribute('data-node-id') === 'n-image')!;
    const blank = cards.find(card => card.getAttribute('data-node-id') === 'n-blank')!;
    expect(withMedia.querySelector('[data-node-action="reverse-prompt"]')).not.toBeNull();
    expect(blank.querySelector('[data-node-action="reverse-prompt"]')).toBeNull();
  });

  it('reads the card picture by workspace-relative path and fills an empty prompt box', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await press();

    expect(analyzeCanvasImage).toHaveBeenCalledTimes(1);
    expect(analyzeCanvasImage).toHaveBeenCalledWith({
      workspacePath: WORKSPACE.workspacePath,
      relativePath: 'media/generated/b1/image-001.png',
      detail: 'detailed',
    });
    expect(readDocument(memory).nodes[0].prompt).toBe(REVERSED);
    // The card's own picture is untouched by a read-only call.
    expect(readDocument(memory).nodes[0].mediaRef).toEqual(IMAGE_NODE.mediaRef);
  });

  it('never dispatches a generation of its own', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await press();

    expect(stubRuntime.gateway.invoke).not.toHaveBeenCalled();
    expect(readDocument(memory).nodes[0].generation).toBeUndefined();
  });

  it('asks before touching a prompt the owner already wrote, and can replace it', async () => {
    seedDocument(memory, { nodes: [{ ...IMAGE_NODE, prompt: 'my own words' }] });
    await renderPanel();
    await press();

    // Nothing committed yet: the choice is still open.
    expect(readDocument(memory).nodes[0].prompt).toBe('my own words');
    const preview = container.querySelector('[data-canvas-reverse-prompt="preview"]');
    expect(preview?.textContent).toBe(REVERSED);

    await act(async () => {
      Simulate.click(
        container.querySelector('[data-canvas-reverse-prompt-action="replace"]')!,
      );
    });
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0].prompt).toBe(REVERSED);
  });

  it('appends underneath when that is what the owner picks', async () => {
    seedDocument(memory, { nodes: [{ ...IMAGE_NODE, prompt: 'my own words' }] });
    await renderPanel();
    await press();

    await act(async () => {
      Simulate.click(
        container.querySelector('[data-canvas-reverse-prompt-action="append"]')!,
      );
    });
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0].prompt).toBe(`my own words\n\n${REVERSED}`);
  });

  it('leaves the prompt alone when the choice is dismissed', async () => {
    seedDocument(memory, { nodes: [{ ...IMAGE_NODE, prompt: 'my own words' }] });
    await renderPanel();
    await press();

    await act(async () => {
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }));
    });
    await service.flushPendingWrites();
    expect(container.querySelector('[data-canvas-reverse-prompt="preview"]')).toBeNull();
    expect(readDocument(memory).nodes[0].prompt).toBe('my own words');
  });

  it('renders a named failure for every typed status and changes nothing', async () => {
    for (const status of FAILURE_STATUSES) {
      analyzeCanvasImage.mockResolvedValueOnce({ status, message: 'nope' } as never);
      seedDocument(memory, { nodes: [IMAGE_NODE] });
      await renderPanel();
      await press();

      const notice = container.querySelector('[data-canvas-notice], .infinite-canvas-panel__tool-notice');
      expect(notice, `no notice for ${status}`).not.toBeNull();
      expect(notice!.textContent).toContain(`infiniteCanvas.reversePrompt.failed.${status}`);
      expect(readDocument(memory).nodes[0].prompt).toBeUndefined();
      expect(stubRuntime.gateway.invoke).not.toHaveBeenCalled();

      await act(async () => root.unmount());
      root = createRoot(container);
    }
  });

  it('treats a completed call with an empty prompt as an unusable image', async () => {
    analyzeCanvasImage.mockResolvedValueOnce({ status: 'completed', prompt: '   ' } as never);
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await press();

    const notice = container.querySelector('.infinite-canvas-panel__tool-notice');
    expect(notice!.textContent).toContain('infiniteCanvas.reversePrompt.failed.invalid_image');
    expect(readDocument(memory).nodes[0].prompt).toBeUndefined();
  });

  it('reports a typed failure instead of doing nothing when the port is unavailable', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    // No injected port, and the mocked gateway module does not export one.
    await renderPanel({ analyzeCanvasImage: undefined });
    await press();

    const notice = container.querySelector('.infinite-canvas-panel__tool-notice');
    expect(notice!.textContent).toContain('infiniteCanvas.reversePrompt.failed.backend');
  });

  it('does not fire a second call while one is in flight', async () => {
    let release: (value: unknown) => void = () => undefined;
    analyzeCanvasImage.mockImplementationOnce(
      () => new Promise(resolve => { release = resolve; }) as never,
    );
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();

    await act(async () => {
      button()!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    expect(button()!.getAttribute('data-pending')).toBe('true');
    expect(button()!.disabled).toBe(true);

    await act(async () => {
      button()!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    expect(analyzeCanvasImage).toHaveBeenCalledTimes(1);

    await act(async () => {
      release({ status: 'completed', prompt: REVERSED });
      await Promise.resolve();
    });
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0].prompt).toBe(REVERSED);
    expect(button()!.getAttribute('data-pending')).toBeNull();
  });
});
