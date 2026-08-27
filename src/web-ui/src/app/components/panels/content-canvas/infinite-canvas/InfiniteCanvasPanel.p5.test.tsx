/**
 * P5 W2/W4 panel closure: crop and the mask (red-mark) lane.
 *
 * The invariants under test are the expensive ones:
 *
 * - the SOURCE card is never modified by either feature, field for field;
 * - a crop lands its file before the document is touched, and the derived card
 *   is finished the moment it appears;
 * - the mask lane writes the composite BEFORE it submits, submits exactly one
 *   scratch path, and submits nothing at all if the write failed;
 * - the scratch path is nowhere near the four media-library scan roots.
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
  // Deliberately NOT exporting the P5 ports. Two things ride on that: an
  // injected port is never resolved through the module (so no test can reach a
  // real Tauri command by accident), and a panel test written before a port
  // existed keeps working instead of crashing on the missing export.
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
import {
  CANVAS_CROP_PREFIX,
  CANVAS_SCRATCH_PREFIX,
} from './infiniteCanvasImageRaster';
import { InfiniteCanvasPanel } from './InfiniteCanvasPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACE = { workspaceId: 'workspace-a', workspacePath: 'C:/workspace-a' };
const TEST_CATALOG = new StylePresetCatalog([], []);
const PNG_DATA_URL = 'data:image/png;base64,QUJD';

const IMAGE_NODE = {
  nodeId: 'n-image',
  kind: 'image' as const,
  position: { x: 0, y: 0 },
  size: { width: 240, height: 240 },
  prompt: 'a cat on a bench',
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

function installCanvasStub(dom: JSDOM): void {
  dom.window.HTMLCanvasElement.prototype.getContext = (() => ({
    canvas: null,
    lineCap: 'butt',
    lineJoin: 'miter',
    lineWidth: 1,
    fillStyle: '',
    strokeStyle: '',
    globalCompositeOperation: 'source-over',
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    stroke: () => undefined,
    fillRect: () => undefined,
    strokeRect: () => undefined,
    clearRect: () => undefined,
    drawImage: () => undefined,
    putImageData: () => undefined,
    getImageData: () => (
      { data: new Uint8ClampedArray(4), width: 1, height: 1 } as unknown as ImageData
    ),
  })) as never;
  dom.window.HTMLCanvasElement.prototype.toDataURL = (() => (
    'data:image/png;base64,UEFZTE9BRA=='
  )) as never;
}

describe('InfiniteCanvasPanel P5 crop and mask', () => {
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
  let writeCanvasImage: ReturnType<typeof vi.fn>;
  let pruneCanvasScratch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
    vi.stubGlobal('Blob', dom.window.Blob);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => (
      { width: 1000, height: 500, close: () => undefined } as unknown as ImageBitmap
    )));
    installCanvasStub(dom);

    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
    memory = createInMemoryInfiniteCanvasPersistence();
    service = new InfiniteCanvasDocumentService(memory.port, { debounceMs: 1 });
    writeCanvasImage = vi.fn(async (request: { relativePath: string }) => ({
      status: 'written' as const,
      relativePath: request.relativePath,
      bytesWritten: 128,
    }));
    pruneCanvasScratch = vi.fn(async () => undefined);
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
          writeCanvasImage={writeCanvasImage}
          pruneCanvasScratch={pruneCanvasScratch}
          {...props}
        />,
      );
    });
  }

  /** Opens an editor and lets the preview resolve and the bitmap decode. */
  async function openEditor(selector: string) {
    await act(async () => {
      container.querySelector(selector)!
        .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
  }

  it('sweeps the scratch directory once when the board opens', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();

    expect(pruneCanvasScratch).toHaveBeenCalledTimes(1);
    expect(pruneCanvasScratch).toHaveBeenCalledWith({
      workspacePath: WORKSPACE.workspacePath,
    });
  });

  it('offers crop only on a card that carries a picture', async () => {
    seedDocument(memory, {
      nodes: [IMAGE_NODE, { nodeId: 'n-blank', kind: 'image', position: { x: 400, y: 0 } }],
    });
    await renderPanel();

    const cards = Array.from(container.querySelectorAll('[data-node-id]'));
    const withMedia = cards.find(card => card.getAttribute('data-node-id') === 'n-image')!;
    const blank = cards.find(card => card.getAttribute('data-node-id') === 'n-blank')!;
    expect(withMedia.querySelector('[data-node-action="crop"]')).not.toBeNull();
    expect(blank.querySelector('[data-node-action="crop"]')).toBeNull();
  });

  it('crops into a finished derived card without touching the source', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await openEditor('[data-node-action="crop"]');

    expect(container.querySelector('[data-canvas-editor="crop"]')).not.toBeNull();
    await act(async () => {
      Simulate.click(container.querySelector('[data-crop-action="confirm"]')!);
    });
    await act(async () => { await Promise.resolve(); });

    // 1. The bytes land first, in the allowlisted crop directory.
    expect(writeCanvasImage).toHaveBeenCalledTimes(1);
    const write = writeCanvasImage.mock.calls[0][0];
    expect(write.workspacePath).toBe(WORKSPACE.workspacePath);
    expect(write.relativePath.startsWith(CANVAS_CROP_PREFIX)).toBe(true);
    expect(write.relativePath.endsWith('.png')).toBe(true);
    expect(write.base64Png).toBe('UEFZTE9BRA==');
    expect(write.base64Png.startsWith('data:')).toBe(false);

    // 2. Nothing was submitted anywhere: crop is a local operation.
    expect(stubRuntime.gateway.invoke).not.toHaveBeenCalled();

    await service.flushPendingWrites();
    const persisted = readDocument(memory);
    const source = persisted.nodes.find(node => node.nodeId === 'n-image')!;
    const derived = persisted.nodes.find(node => node.nodeId !== 'n-image')!;

    // 3. The source card is untouched, field for field.
    expect(source).toEqual(IMAGE_NODE);
    // 4. The derived card is finished on arrival — never a pending crop card.
    expect(derived.mediaRef).toEqual({
      workspacePath: WORKSPACE.workspacePath,
      relativePath: write.relativePath,
    });
    expect(derived.derivedFrom).toMatchObject({ sourceNodeId: 'n-image', toolId: 'crop' });
    expect(derived).not.toHaveProperty('generation');
    expect(persisted.edges).toHaveLength(1);
    expect(persisted.edges[0]).toMatchObject({
      sourceNodeId: 'n-image',
      targetNodeId: derived.nodeId,
    });
  });

  it('changes nothing at all when the crop file cannot be written', async () => {
    writeCanvasImage.mockResolvedValue({ status: 'path_denied', message: 'nope' });
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await openEditor('[data-node-action="crop"]');
    await act(async () => {
      Simulate.click(container.querySelector('[data-crop-action="confirm"]')!);
    });
    await act(async () => { await Promise.resolve(); });

    await service.flushPendingWrites();
    // No half-made card pointing at a file that does not exist.
    expect(readDocument(memory).nodes).toHaveLength(1);
    const notice = container.querySelector('.infinite-canvas-panel__tool-notice');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toContain('infiniteCanvas.crop.writeDenied');
  });

  /**
   * P5 review P11: every non-`written` status used to collapse into one
   * "saving failed, retry" line. `invalid_input` is what the command reports
   * for a payload it will not take — in practice a picture too large — and
   * telling someone to retry something that can never work is worse than
   * saying nothing.
   */
  it('names "too large" separately from a backend write failure', async () => {
    for (const [status, key] of [
      ['invalid_input', 'infiniteCanvas.crop.writeTooLarge'],
      ['backend', 'infiniteCanvas.crop.writeFailed'],
    ] as const) {
      writeCanvasImage.mockResolvedValue({ status, message: 'nope' });
      seedDocument(memory, { nodes: [IMAGE_NODE] });
      await renderPanel();
      await openEditor('[data-node-action="crop"]');
      await act(async () => {
        Simulate.click(container.querySelector('[data-crop-action="confirm"]')!);
      });
      await act(async () => { await Promise.resolve(); });

      const notice = container.querySelector('.infinite-canvas-panel__tool-notice');
      expect(notice!.textContent, `wrong copy for ${status}`).toContain(key);
      expect(readDocument(memory).nodes).toHaveLength(1);

      await act(async () => root.unmount());
      root = createRoot(container);
    }
  });

  it('names "too large" separately on the mask lane too, and spends nothing', async () => {
    writeCanvasImage.mockResolvedValue({ status: 'invalid_input', message: 'too big' });
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await runMaskFlow();

    const notice = container.querySelector('.infinite-canvas-panel__tool-notice');
    expect(notice!.textContent).toContain('infiniteCanvas.mask.writeTooLarge');
    expect(stubRuntime.gateway.invoke).not.toHaveBeenCalled();
  });

  /**
   * P5 review P12: the bytes are on disk before the document is touched. If
   * the source card vanished in between, `beginDerivedOperationContent` grows
   * nothing and the crop became a file with no card — silently.
   */
  it('says so instead of leaving an orphan file when the source card is gone', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await openEditor('[data-node-action="crop"]');

    // The source card disappears while the editor is open (a delete, an agent
    // op, another window) — the editor is holding its own copy of the picture.
    await act(async () => {
      await service.mutateDefaultDocument(
        { workspaceId: WORKSPACE.workspaceId, workspacePath: WORKSPACE.workspacePath },
        current => ({ ...current, nodes: [], edges: [] }),
      );
    });

    await act(async () => {
      Simulate.click(container.querySelector('[data-crop-action="confirm"]')!);
    });
    await act(async () => { await Promise.resolve(); });
    await service.flushPendingWrites();

    // The file was written — that is the whole reason this needs saying.
    expect(writeCanvasImage).toHaveBeenCalledTimes(1);
    expect(readDocument(memory).nodes).toHaveLength(0);
    const notice = container.querySelector('.infinite-canvas-panel__tool-notice');
    expect(notice!.textContent).toContain('infiniteCanvas.crop.cardMissing');
  });

  it('opens the mask editor for inpaint instead of the instruction dialog', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await openEditor('[data-tool-id="inpaint"]');

    expect(container.querySelector('[data-canvas-editor="mask"]')).not.toBeNull();
    expect(container.querySelector('.infinite-canvas-dialog[data-tool-id]')).toBeNull();
  });

  it('keeps the three non-mask tools on the instruction dialog', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    // §4: expand now sits in the "more (...)" drawer, so the drawer opens first.
    await openEditor('[data-node-action="more"]');
    await openEditor('[data-tool-id="expand"]');

    expect(container.querySelector('[data-canvas-editor="mask"]')).toBeNull();
    expect(container.querySelector('.infinite-canvas-dialog[data-tool-id="expand"]'))
      .not.toBeNull();
  });

  async function runMaskFlow() {
    await openEditor('[data-tool-id="inpaint"]');
    const layer = container.querySelector('[data-mask-surface="layer"]')!;
    act(() => {
      Simulate.mouseDown(layer, { clientX: 10, clientY: 10 } as never);
      Simulate.mouseMove(layer, { clientX: 50, clientY: 50 } as never);
      Simulate.mouseUp(layer, { clientX: 50, clientY: 50 } as never);
    });
    // Owner feedback 2026-08-27: the sentence is written in the SHARED board
    // generator mounted in the editor, and its round send button is the
    // confirm — this editor has no input box and no confirm of its own.
    act(() => {
      Simulate.change(
        container.querySelector('[data-canvas-generator-field="prompt"]')!,
        { target: { value: 'put a red hat here' } } as never,
      );
    });
    await act(async () => {
      Simulate.click(container.querySelector('[data-canvas-generator-action="send"]')!);
    });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
  }

  it('writes the composite to scratch and submits it as the only reference', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await runMaskFlow();

    const write = writeCanvasImage.mock.calls[0][0];
    // The scratch directory is outside every media-library scan root. Pinned
    // literally so nobody can quietly move it under media/.
    expect(write.relativePath.startsWith(CANVAS_SCRATCH_PREFIX)).toBe(true);
    expect(write.relativePath.startsWith('.void/infinite-canvas/scratch/')).toBe(true);
    expect(write.relativePath.startsWith('media/')).toBe(false);
    expect(write.relativePath.startsWith('.void/media/')).toBe(false);
    expect(write.base64Png).toBe('UEFZTE9BRA==');

    expect(stubRuntime.gateway.invoke).toHaveBeenCalledTimes(1);
    const invocation = stubRuntime.gateway.invoke.mock.calls[0][0] as any;
    expect(invocation.kind).toBe('inpaint');
    expect(invocation.resultMode).toBe('derived');
    expect(invocation.sourceNodeId).toBe('n-image');
    // The composite REPLACES the source picture as the edit target, and the
    // connected reference cards are deliberately dropped: exactly one path.
    expect(invocation.editTargetMediaRef).toEqual({
      workspacePath: WORKSPACE.workspacePath,
      relativePath: write.relativePath,
    });
    expect(invocation.references).toEqual([]);
    // The prompt is the mask directive plus the user's sentence.
    expect(invocation.prompt).toContain('infiniteCanvas.mask.directive.inpaint');
    expect(invocation.prompt).toContain('put a red hat here');
  });

  it('leaves the source card untouched and derives a pending card', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await runMaskFlow();

    await service.flushPendingWrites();
    const persisted = readDocument(memory);
    expect(persisted.nodes.find(node => node.nodeId === 'n-image')).toEqual(IMAGE_NODE);
    const derived = persisted.nodes.find(node => node.nodeId !== 'n-image')!;
    expect(derived.generation).toMatchObject({
      toolId: 'inpaint',
      resultMode: 'derived',
      status: 'pending',
    });
    expect(derived.mediaRef).toBeUndefined();
  });

  it('never submits a generation when the composite could not be written', async () => {
    writeCanvasImage.mockResolvedValue({ status: 'backend', message: 'disk full' });
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await runMaskFlow();

    // Money rule: a failed write must not reach a paid submission, and no
    // card may be left behind either.
    expect(stubRuntime.gateway.invoke).not.toHaveBeenCalled();
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes).toHaveLength(1);
    expect(container.querySelector('.infinite-canvas-panel__tool-notice')).not.toBeNull();
  });

  it('suspends the board undo shortcut while an editor is open', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    // One undoable board edit, so a leaked Ctrl+Z would have something to eat.
    await act(async () => {
      flow.props.onNodesChange([
        { type: 'position', id: 'n-image', dragging: false, position: { x: 90, y: 90 } },
      ]);
    });
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0].position).toEqual({ x: 90, y: 90 });

    await openEditor('[data-tool-id="inpaint"]');
    await act(async () => {
      dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
      }));
    });
    await service.flushPendingWrites();

    // The card did NOT move back: Ctrl+Z belongs to the editor's stroke stack.
    expect(readDocument(memory).nodes[0].position).toEqual({ x: 90, y: 90 });
  });
});
