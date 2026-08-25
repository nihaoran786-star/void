/**
 * P4 W5 behavior closure: undo / redo on the canvas panel.
 *
 * Behavior only — no style or copy assertions. What is pinned here: the user's
 * own edits go on the stack and come back off it, the deliberately
 * non-undoable lanes (produced media landing, generation dispatch, viewport)
 * never do, an entry whose cards moved on is refused with a typed notice
 * instead of corrupting the document, and the shortcut never steals Ctrl+Z
 * from a prompt box.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';

import {
  clickCanvasCreateMenuItem,
  generateFromCanvasGenerator,
  selectCanvasCards,
} from './infiniteCanvasGeneratorDriver.testkit';
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
            React.createElement(NodeComponent, {
              id: node.id,
              data: node.data,
              selected: false,
            }),
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
  getInfiniteCanvasMediaSaver: () => {
    throw new Error('Tests must inject a save port.');
  },
}));

vi.mock('./infiniteCanvasGenerationRuntime', () => ({
  createInfiniteCanvasGenerationRuntime: () => {
    throw new Error('Tests must inject a generation runtime.');
  },
}));

import {
  createInMemoryInfiniteCanvasPersistence,
  defaultInfiniteCanvasDocumentId,
  infiniteCanvasDocumentFilePath,
  InfiniteCanvasDocumentService,
  type InfiniteCanvasDocument,
  type InfiniteCanvasNode,
  type InMemoryInfiniteCanvasPersistence,
  type SessionImageGenerationInvocation,
} from '@/shared/services/infinite-canvas';
import { InfiniteCanvasPanel } from './InfiniteCanvasPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACE = { workspaceId: 'workspace-history', workspacePath: 'C:/workspace-h' };
const DOCUMENT_ID = defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId);

function documentPath(): string {
  return infiniteCanvasDocumentFilePath(WORKSPACE.workspacePath, DOCUMENT_ID);
}

interface FakeEventBus {
  emit: (event: unknown) => void;
  on: (eventName: 'agent:tool-run-event', handler: (event: unknown) => void) => () => void;
}

function createFakeEventBus(): FakeEventBus {
  const handlers = new Set<(event: unknown) => void>();
  return {
    on: (_eventName, handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    emit: event => {
      for (const handler of handlers) handler(event);
    },
  };
}

describe('InfiniteCanvasPanel P4 W5 undo and redo', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let memory: InMemoryInfiniteCanvasPersistence;
  let service: InfiniteCanvasDocumentService;
  let eventBus: FakeEventBus;
  let invocations: SessionImageGenerationInvocation[];

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('KeyboardEvent', dom.window.KeyboardEvent);
    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
    memory = createInMemoryInfiniteCanvasPersistence();
    service = new InfiniteCanvasDocumentService(memory.port, { debounceMs: 1 });
    eventBus = createFakeEventBus();
    invocations = [];
    flow.props = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    service.dispose();
    vi.unstubAllGlobals();
  });

  function seed(nodes: readonly InfiniteCanvasNode[], edges: InfiniteCanvasDocument['edges'] = []) {
    const document: InfiniteCanvasDocument = {
      documentId: DOCUMENT_ID,
      schemaVersion: '1',
      workspaceId: WORKSPACE.workspaceId,
      revision: 1,
      nodes: [...nodes],
      edges,
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: new Date(0).toISOString(),
    };
    memory.files.set(documentPath(), JSON.stringify(document));
  }

  async function renderPanel(): Promise<void> {
    await act(async () => {
      root.render(
        <InfiniteCanvasPanel
          workspaceId={WORKSPACE.workspaceId}
          workspacePath={WORKSPACE.workspacePath}
          isActive
          service={service}
          resolvePreviewUrl={async () => undefined}
          mediaEventBus={eventBus}
          generationRuntime={{
            gateway: {
              invoke: async (invocation: SessionImageGenerationInvocation) => {
                invocations.push(invocation);
                return { operationId: invocation.operationId, status: 'succeeded' as const };
              },
            },
            hasTargetSession: () => true,
          } as never}
        />,
      );
    });
  }

  function toolbarButton(action: 'undo' | 'redo'): HTMLButtonElement {
    const button = container.querySelector<HTMLButtonElement>(
      `[data-toolbar-action="${action}"]`,
    );
    if (!button) throw new Error(`no ${action} button`);
    return button;
  }

  async function click(button: HTMLButtonElement): Promise<void> {
    await act(async () => {
      Simulate.click(button);
    });
  }

  async function clickToolbar(label: string): Promise<void> {
    // §8: the create entries live in the floating rail's `+` menu now.
    await clickCanvasCreateMenuItem(container, label);
  }

  function nodeIds(): string[] {
    return flow.props.nodes.map((node: any) => node.id);
  }

  function persisted(): InfiniteCanvasDocument {
    return JSON.parse(memory.files.get(documentPath())!) as InfiniteCanvasDocument;
  }

  async function pressKey(
    init: { key: string; ctrlKey?: boolean; shiftKey?: boolean },
    target?: Element,
  ): Promise<void> {
    await act(async () => {
      const event = new dom.window.KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        ...init,
      });
      (target ?? dom.window.document.body).dispatchEvent(event);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  /** Drives one drag-end through reactflow's change channel. */
  async function dragTo(nodeId: string, position: { x: number; y: number }): Promise<void> {
    await act(async () => {
      flow.props.onNodesChange([
        { id: nodeId, type: 'position', dragging: false, position },
      ]);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  const CARD_A: InfiniteCanvasNode = {
    nodeId: 'card-a',
    kind: 'image',
    position: { x: 0, y: 0 },
    prompt: 'a fox',
  };

  it('starts with both entries disabled and enables undo after the first edit', async () => {
    seed([]);
    await renderPanel();

    expect(toolbarButton('undo').disabled).toBe(true);
    expect(toolbarButton('redo').disabled).toBe(true);

    await clickToolbar('infiniteCanvas.toolbar.addGenerationCard');

    expect(toolbarButton('undo').disabled).toBe(false);
    expect(toolbarButton('redo').disabled).toBe(true);
  });

  it('undoes an added card and redoes it back', async () => {
    seed([]);
    await renderPanel();
    await clickToolbar('infiniteCanvas.toolbar.addGenerationCard');
    expect(nodeIds()).toHaveLength(1);
    const addedId = nodeIds()[0];

    await click(toolbarButton('undo'));
    expect(nodeIds()).toEqual([]);
    await service.flushPendingWrites();
    expect(persisted().nodes).toEqual([]);

    await click(toolbarButton('redo'));
    expect(nodeIds()).toEqual([addedId]);
    expect(toolbarButton('redo').disabled).toBe(true);
  });

  it('puts a dragged card back where it was', async () => {
    seed([CARD_A]);
    await renderPanel();

    await dragTo('card-a', { x: 640, y: 320 });
    await service.flushPendingWrites();
    expect(persisted().nodes[0].position).toEqual({ x: 640, y: 320 });

    await click(toolbarButton('undo'));
    await service.flushPendingWrites();
    expect(persisted().nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it('brings a deleted card with an image back whole', async () => {
    const mediaRef = {
      workspacePath: WORKSPACE.workspacePath,
      relativePath: 'media/input/kept.png',
    };
    seed([{ ...CARD_A, mediaRef }]);
    await renderPanel();

    await act(async () => {
      flow.props.onNodesChange([{ id: 'card-a', type: 'remove' }]);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    // P4 W6: a card with an image goes through the deletion confirmation
    // before it is removed; the undo entry is recorded on the confirmed
    // delete, exactly as it was on the direct one.
    const confirm = container.querySelector<HTMLButtonElement>(
      '[data-canvas-confirm-action="confirm"]',
    );
    if (!confirm) throw new Error('no delete confirmation');
    await click(confirm);
    expect(nodeIds()).toEqual([]);

    await click(toolbarButton('undo'));
    await service.flushPendingWrites();
    const restored = persisted().nodes[0];
    expect(restored.nodeId).toBe('card-a');
    expect(restored.mediaRef).toEqual(mediaRef);
    expect(restored.prompt).toBe('a fox');
  });

  it('undoes a prompt edit', async () => {
    seed([CARD_A]);
    await renderPanel();

    // §6: the prompt box is the bottom generator's, and it edits the card
    // that is selected. Blur still persists the draft, so it is still one
    // undoable edit.
    await selectCanvasCards(flow, ['card-a']);
    const textarea = container.querySelector('[data-canvas-generator-field="prompt"]');
    if (!textarea) throw new Error('no prompt editor');
    await act(async () => {
      (textarea as HTMLTextAreaElement).value = 'a badger';
      Simulate.change(textarea);
    });
    await act(async () => {
      Simulate.blur(textarea);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await service.flushPendingWrites();
    expect(persisted().nodes[0].prompt).toBe('a badger');

    await click(toolbarButton('undo'));
    await service.flushPendingWrites();
    expect(persisted().nodes[0].prompt).toBe('a fox');
  });

  // —— The deliberately non-undoable lanes ————————————————————————————————

  it('does not record produced media landing on a card', async () => {
    seed([CARD_A]);
    await renderPanel();

    await clickToolbar('infiniteCanvas.toolbar.addText');
    await click(toolbarButton('undo'));
    expect(toolbarButton('undo').disabled).toBe(true);

    await generateFromCanvasGenerator(container, flow, 'card-a');
    // Dispatch itself is not an edit either.
    expect(toolbarButton('undo').disabled).toBe(true);

    await act(async () => {
      eventBus.emit({
        eventType: 'Completed',
        toolName: 'GenerateImage',
        result: {
          status: 'completed',
          kind: 'image',
          batch: { batch_id: 'batch-1' },
          infiniteCanvas: {
            workspaceId: WORKSPACE.workspaceId,
            documentId: DOCUMENT_ID,
            nodeId: 'card-a',
            resultMode: 'self',
            toolId: 'generate',
            operationId: invocations[0].operationId,
            outputMediaRelativePath: 'media/generated/batch-1/image-001.png',
          },
        },
      });
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await service.flushPendingWrites();
    expect(persisted().nodes[0].mediaRef?.relativePath)
      .toBe('media/generated/batch-1/image-001.png');
    // The paid-for image is not something Ctrl+Z may take away.
    expect(toolbarButton('undo').disabled).toBe(true);
  });

  it('does not record a viewport change', async () => {
    seed([CARD_A]);
    await renderPanel();

    await act(async () => {
      flow.props.onMoveEnd(null, { x: -400, y: -200, zoom: 1.5 });
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await service.flushPendingWrites();
    expect(persisted().viewport).toEqual({ x: -400, y: -200, zoom: 1.5 });
    expect(toolbarButton('undo').disabled).toBe(true);
  });

  // —— Coexistence with the other writers ————————————————————————————————

  it('refuses a stale entry with a typed notice and drops the whole branch', async () => {
    seed([CARD_A]);
    await renderPanel();

    await clickToolbar('infiniteCanvas.toolbar.addText');
    await dragTo('card-a', { x: 300, y: 0 });
    expect(toolbarButton('undo').disabled).toBe(false);

    // While the drag sits on the stack, a generation result fills that card.
    await generateFromCanvasGenerator(container, flow, 'card-a');
    await act(async () => {
      eventBus.emit({
        eventType: 'Completed',
        toolName: 'GenerateImage',
        result: {
          status: 'completed',
          kind: 'image',
          batch: { batch_id: 'batch-1' },
          infiniteCanvas: {
            workspaceId: WORKSPACE.workspaceId,
            documentId: DOCUMENT_ID,
            nodeId: 'card-a',
            resultMode: 'self',
            toolId: 'generate',
            operationId: invocations[0].operationId,
            outputMediaRelativePath: 'media/generated/batch-1/image-001.png',
          },
        },
      });
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await click(toolbarButton('undo'));

    expect(container.querySelector('.infinite-canvas-panel__tool-notice')?.textContent)
      .toContain('infiniteCanvas.history.staleDiscarded');
    await service.flushPendingWrites();
    const document = persisted();
    // Nothing was rolled back: the image stayed, the card stayed where it was.
    expect(document.nodes[0].mediaRef?.relativePath)
      .toBe('media/generated/batch-1/image-001.png');
    expect(document.nodes[0].position).toEqual({ x: 300, y: 0 });
    // The whole branch is gone, including the older "add text card" entry.
    expect(toolbarButton('undo').disabled).toBe(true);
    expect(document.nodes).toHaveLength(2);
  });

  it('leaves cards that landed after the edit untouched when undoing', async () => {
    seed([CARD_A]);
    await renderPanel();

    await dragTo('card-a', { x: 120, y: 0 });

    // A second card appears from another writer while the entry waits.
    await service.mutateDefaultDocument(
      { ...WORKSPACE, backend: 'local' as const },
      current => ({
        nodes: [
          ...current.nodes,
          { nodeId: 'agent-card', kind: 'image' as const, position: { x: 900, y: 0 } },
        ],
        edges: current.edges,
        viewport: current.viewport,
      }),
    );

    await click(toolbarButton('undo'));
    await service.flushPendingWrites();
    const document = persisted();
    expect(document.nodes.map(node => node.nodeId)).toEqual(['card-a', 'agent-card']);
    expect(document.nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  // —— Shortcuts ————————————————————————————————————————————————————————

  it('undoes and redoes from the keyboard', async () => {
    seed([]);
    await renderPanel();
    await clickToolbar('infiniteCanvas.toolbar.addGenerationCard');
    expect(nodeIds()).toHaveLength(1);

    await pressKey({ key: 'z' });
    expect(nodeIds()).toEqual([]);

    await pressKey({ key: 'z', shiftKey: true });
    expect(nodeIds()).toHaveLength(1);

    await pressKey({ key: 'z' });
    expect(nodeIds()).toEqual([]);
    await pressKey({ key: 'y' });
    expect(nodeIds()).toHaveLength(1);
  });

  it('leaves Ctrl+Z alone inside a prompt box', async () => {
    seed([CARD_A]);
    await renderPanel();
    await dragTo('card-a', { x: 300, y: 0 });

    // §6: the prompt box only exists while its card is selected.
    await selectCanvasCards(flow, ['card-a']);
    const textarea = container.querySelector('[data-canvas-generator-field="prompt"]');
    if (!textarea) throw new Error('no prompt editor');
    await pressKey({ key: 'z' }, textarea);

    await service.flushPendingWrites();
    expect(persisted().nodes[0].position).toEqual({ x: 300, y: 0 });
    expect(toolbarButton('undo').disabled).toBe(false);
  });

  // P4 review C2: holding Ctrl+Z fires key repeats faster than React
  // re-renders. Both handlers used to read the same top entry out of the same
  // render closure, replay it twice, and the second replay — rebased on a
  // document that had already moved — was judged stale and threw the WHOLE
  // undo stack away, with a scary notice on top.
  it('walks the stack when two undos arrive inside one render', async () => {
    seed([]);
    await renderPanel();
    await clickToolbar('infiniteCanvas.toolbar.addText');
    await clickToolbar('infiniteCanvas.toolbar.addText');
    expect(nodeIds()).toHaveLength(2);

    // Two keydowns with no await between them: one render closure, both.
    await act(async () => {
      for (let press = 0; press < 2; press += 1) {
        dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          key: 'z',
        }));
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await service.flushPendingWrites();

    expect(nodeIds()).toEqual([]);
    expect(persisted().nodes).toEqual([]);
    // The stack was walked, not discarded: both steps are redoable and no
    // "that step can no longer be undone" notice was raised.
    expect(toolbarButton('undo').disabled).toBe(true);
    expect(toolbarButton('redo').disabled).toBe(false);
    expect(container.querySelector('.infinite-canvas-panel__tool-notice')).toBeNull();

    await click(toolbarButton('redo'));
    await click(toolbarButton('redo'));
    expect(nodeIds()).toHaveLength(2);
  });

  // P4 review C5 (plan §265): the undo stack and the clipboard remember nodes
  // by id. Carrying them into another workspace could re-insert workspace A's
  // card — mediaRef and all — into workspace B's document.
  it('drops the undo stack when the panel switches workspace', async () => {
    seed([CARD_A]);
    const other = { workspaceId: 'workspace-other', workspacePath: 'C:/workspace-o' };
    memory.files.set(
      infiniteCanvasDocumentFilePath(
        other.workspacePath,
        defaultInfiniteCanvasDocumentId(other.workspaceId),
      ),
      JSON.stringify({
        documentId: defaultInfiniteCanvasDocumentId(other.workspaceId),
        schemaVersion: '1',
        workspaceId: other.workspaceId,
        revision: 1,
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        updatedAt: new Date(0).toISOString(),
      }),
    );
    await renderPanel();
    await dragTo('card-a', { x: 300, y: 0 });
    expect(toolbarButton('undo').disabled).toBe(false);

    await act(async () => {
      root.render(
        <InfiniteCanvasPanel
          workspaceId={other.workspaceId}
          workspacePath={other.workspacePath}
          isActive
          service={service}
          resolvePreviewUrl={async () => undefined}
          mediaEventBus={eventBus}
          generationRuntime={{
            gateway: { invoke: async () => ({ operationId: 'x', status: 'succeeded' as const }) },
            hasTargetSession: () => true,
          } as never}
        />,
      );
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(nodeIds()).toEqual([]);
    expect(toolbarButton('undo').disabled).toBe(true);
    expect(toolbarButton('redo').disabled).toBe(true);
  });

  // P4 review P4: undoing the deletion of a still-generating card used to
  // bring the spinner back forever — its completion event was discarded while
  // the card did not exist, and no second one is coming.
  /** Runs the real dispatch lane so `card-a` is genuinely mid-generation. */
  async function startGeneration(): Promise<void> {
    await generateFromCanvasGenerator(container, flow, 'card-a');
  }

  /** Deletes `card-a` through the one gate, confirming the pending warning. */
  async function deleteCardAWithConfirmation(): Promise<void> {
    await act(async () => {
      flow.props.onNodesChange([{ id: 'card-a', type: 'remove' }]);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    const confirm = container.querySelector<HTMLButtonElement>(
      '[data-canvas-confirm-action="confirm"]',
    );
    if (!confirm) throw new Error('no delete confirmation');
    await click(confirm);
    expect(nodeIds()).toEqual([]);
  }

  it('settles a resurrected pending card instead of spinning forever', async () => {
    seed([CARD_A]);
    await renderPanel();
    await startGeneration();
    await deleteCardAWithConfirmation();

    await click(toolbarButton('undo'));
    await service.flushPendingWrites();

    const restored = persisted().nodes[0];
    expect(restored.nodeId).toBe('card-a');
    // Back as a typed, retryable failure — never as a spinner nobody will end.
    expect(restored.generation).toMatchObject({ status: 'failed', errorKind: 'timeout' });
  });

  it('leaves a resurrected card that still knows its media job to reconciliation', async () => {
    seed([CARD_A]);
    await renderPanel();
    await startGeneration();
    // The provider reported its batch id before the card was deleted.
    await act(async () => {
      eventBus.emit({
        // A still-polling result is how the batch id reaches the card.
        eventType: 'Completed',
        toolName: 'CallDeferredTool',
        result: {
          status: 'polling',
          kind: 'image',
          batch: { batch_id: 'batch-live' },
          infiniteCanvas: {
            workspaceId: WORKSPACE.workspaceId,
            documentId: DOCUMENT_ID,
            nodeId: 'card-a',
            resultMode: 'self',
            toolId: 'generate',
            operationId: invocations[0].operationId,
          },
        },
      });
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    await service.flushPendingWrites();
    expect(persisted().nodes[0].generation).toMatchObject({ batchId: 'batch-live' });

    await deleteCardAWithConfirmation();
    await click(toolbarButton('undo'));
    await service.flushPendingWrites();

    // This one IS answerable against the batch manifest, so it stays pending
    // for the reconciliation pass rather than being failed on a guess.
    expect(persisted().nodes[0].generation).toMatchObject({
      status: 'pending',
      batchId: 'batch-live',
    });
  });
});
