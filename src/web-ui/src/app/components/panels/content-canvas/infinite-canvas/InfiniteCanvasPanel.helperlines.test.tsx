/**
 * P4 W9 panel closure: alignment guides and snapping during a drag.
 *
 * Behavior only. What is pinned: a single dragging node is nudged onto its
 * neighbour and the guide appears; a drag outside the threshold is untouched
 * and draws nothing; a multi-node drag neither snaps nor draws; the guide
 * disappears when the drag ends; and the number of persisted writes is
 * unchanged (still exactly one, at drag end).
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

vi.mock('@xyflow/react', async () => (
  await import('./infiniteCanvasPanel.testkit')
).mockReactFlow({
  nodeChanges: 'removals-and-moves',
  cards: 'position-markers',
}));

vi.mock('@/infrastructure/i18n', async () => (
  await import('./infiniteCanvasPanel.testkit')
).mockI18n());

vi.mock('@/shared/services/workspace-media/WorkspaceMediaPreviewResolver', async () => (
  await import('./infiniteCanvasPanel.testkit')
).mockPreviewResolver());

vi.mock('@/shared/services/workspace-media/WorkspaceMediaLibrary', async () => (
  await import('./infiniteCanvasPanel.testkit')
).mockMediaLibrary());

vi.mock('./infiniteCanvasDocumentGateway', async () => (
  await import('./infiniteCanvasPanel.testkit')
).mockDocumentGateway({ omitPorts: ['revealer'] }));

vi.mock('./infiniteCanvasGenerationRuntime', async () => (
  await import('./infiniteCanvasPanel.testkit')
).mockGenerationRuntime());

import { StylePresetCatalog } from '@/shared/services/style-preset';
import {
  createInMemoryInfiniteCanvasPersistence,
  defaultInfiniteCanvasDocumentId,
  infiniteCanvasDocumentFilePath,
  InfiniteCanvasDocumentService,
  type InfiniteCanvasDocument,
  type InfiniteCanvasNode,
  type InMemoryInfiniteCanvasPersistence,
} from '@/shared/services/infinite-canvas';
import { InfiniteCanvasPanel } from './InfiniteCanvasPanel';
import {
  dragNode,
  dragNodes,
  resetCanvasFlow,
} from './infiniteCanvasPanel.testkit';
import { INFINITE_CANVAS_DEFAULT_NODE_SIZE } from './infiniteCanvasHelperLines';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACE = { workspaceId: 'workspace-lines', workspacePath: 'C:/workspace-a' };
const TEST_CATALOG = new StylePresetCatalog([], []);

function textNode(nodeId: string, x: number, y: number): InfiniteCanvasNode {
  return { nodeId, kind: 'text', position: { x, y }, text: nodeId };
}

describe('InfiniteCanvasPanel P4 W9 alignment guides', () => {
  const stubRuntime = {
    gateway: { invoke: vi.fn(async () => ({ operationId: 'op', status: 'succeeded' as const })) },
    hasTargetSession: () => true,
  };

  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let memory: InMemoryInfiniteCanvasPersistence;
  let service: InfiniteCanvasDocumentService;
  let mutateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
    memory = createInMemoryInfiniteCanvasPersistence();
    service = new InfiniteCanvasDocumentService(memory.port, { debounceMs: 1 });
    mutateSpy = vi.spyOn(service, 'mutateDefaultDocument');
    resetCanvasFlow();
  });

  afterEach(() => {
    act(() => root.unmount());
    service.dispose();
    vi.unstubAllGlobals();
  });

  async function renderTwoCards(secondX: number, secondY: number): Promise<void> {
    const document: InfiniteCanvasDocument = {
      documentId: defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId),
      schemaVersion: '1',
      workspaceId: WORKSPACE.workspaceId,
      revision: 1,
      nodes: [textNode('n-anchor', 0, 0), textNode('n-drag', secondX, secondY)],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: new Date(0).toISOString(),
    };
    memory.files.set(
      infiniteCanvasDocumentFilePath(
        WORKSPACE.workspacePath,
        defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId),
      ),
      JSON.stringify(document),
    );
    await act(async () => {
      root.render(
        <InfiniteCanvasPanel
          workspaceId={WORKSPACE.workspaceId}
          workspacePath={WORKSPACE.workspacePath}
          isActive
          service={service}
          resolvePreviewUrl={async () => undefined}
          catalog={TEST_CATALOG}
          generationRuntime={stubRuntime}
        />,
      );
    });
    mutateSpy.mockClear();
  }

  function nodePosition(nodeId: string): { x: number; y: number } {
    const element = container.querySelector(`[data-node-id="${nodeId}"]`);
    return {
      x: Number(element?.getAttribute('data-node-x')),
      y: Number(element?.getAttribute('data-node-y')),
    };
  }

  function guide(axis: 'vertical' | 'horizontal'): HTMLElement | null {
    return container.querySelector(`[data-helper-line="${axis}"]`);
  }

  it('snaps a single dragging node onto its neighbour and draws the guides', async () => {
    await renderTwoCards(600, 600);

    // 3 units off both of the anchor's left/top edges: inside the threshold.
    await dragNode('n-drag', { x: 3, y: 3 }, { dropped: false });

    expect(nodePosition('n-drag')).toEqual({ x: 0, y: 0 });
    expect(guide('vertical')).not.toBeNull();
    expect(guide('horizontal')).not.toBeNull();
    // Snapping is a view-time correction: nothing is written mid-drag.
    expect(mutateSpy).not.toHaveBeenCalled();
  });

  it('leaves a far drag untouched and draws nothing', async () => {
    await renderTwoCards(600, 600);
    const far = INFINITE_CANVAS_DEFAULT_NODE_SIZE.width * 4;

    await dragNode('n-drag', { x: far, y: far }, { dropped: false });

    expect(nodePosition('n-drag')).toEqual({ x: far, y: far });
    expect(guide('vertical')).toBeNull();
    expect(guide('horizontal')).toBeNull();
  });

  it('neither snaps nor draws while several nodes move together', async () => {
    await renderTwoCards(600, 600);

    await dragNodes([
      { id: 'n-drag', position: { x: 3, y: 3 } },
      { id: 'n-anchor', position: { x: 3, y: 400 } },
    ], { dropped: false });

    expect(nodePosition('n-drag')).toEqual({ x: 3, y: 3 });
    expect(guide('vertical')).toBeNull();
    expect(guide('horizontal')).toBeNull();
  });

  it('clears the guides and writes exactly once when the drag ends', async () => {
    await renderTwoCards(600, 600);

    await dragNode('n-drag', { x: 3, y: 3 }, { dropped: false });
    await dragNode('n-drag', { x: 2, y: 2 }, { dropped: false });
    expect(mutateSpy).not.toHaveBeenCalled();

    await dragNode('n-drag', { x: 0, y: 0 });

    expect(guide('vertical')).toBeNull();
    expect(guide('horizontal')).toBeNull();
    expect(mutateSpy).toHaveBeenCalledTimes(1);
  });
});
