/**
 * P4 W6 behavior closure: multi-selection, batch move, and the one deletion
 * gate.
 *
 * Behavior only — no copy assertions. What is pinned here: the reactflow
 * selection model is configured the way the plan requires, a multi-card drag
 * lands in ONE mutation, plain cards delete without a dialog, media or
 * in-flight cards raise exactly one confirmation with honest counts, cancelling
 * changes nothing at all, and a confirmed batch delete is a single undo step.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';

import { generateFromCanvasGenerator } from './infiniteCanvasGeneratorDriver.testkit';
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
} from '@/shared/services/infinite-canvas';
import { InfiniteCanvasPanel } from './InfiniteCanvasPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACE = { workspaceId: 'workspace-selection', workspacePath: 'C:/workspace-s' };
const DOCUMENT_ID = defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId);
const MEDIA_REF = { workspacePath: WORKSPACE.workspacePath, relativePath: 'media/output/a.png' };

function documentPath(): string {
  return infiniteCanvasDocumentFilePath(WORKSPACE.workspacePath, DOCUMENT_ID);
}

function createFakeEventBus() {
  const handlers = new Set<(event: unknown) => void>();
  return {
    on: (_eventName: 'agent:tool-run-event', handler: (event: unknown) => void) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    emit: (event: unknown) => {
      for (const handler of handlers) handler(event);
    },
  };
}

describe('InfiniteCanvasPanel P4 W6 selection and deletion', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let memory: InMemoryInfiniteCanvasPersistence;
  let service: InfiniteCanvasDocumentService;
  let saves: number;

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
    saves = 0;
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
          mediaEventBus={createFakeEventBus()}
          generationRuntime={{
            gateway: { invoke: async () => ({ operationId: 'x', status: 'succeeded' as const }) },
            hasTargetSession: () => true,
          } as never}
        />,
      );
    });
  }

  function persisted(): InfiniteCanvasDocument {
    return JSON.parse(memory.files.get(documentPath())!) as InfiniteCanvasDocument;
  }

  function nodeIds(): string[] {
    return flow.props.nodes.map((node: any) => node.id);
  }

  /** The card as the panel currently projects it. */
  function persistedOrProjected(nodeId: string): any {
    return flow.props.nodes.find((node: any) => node.id === nodeId)?.data;
  }

  function confirmDialog(): HTMLElement | null {
    return container.querySelector<HTMLElement>('[data-canvas-confirm="delete"]');
  }

  function confirmAction(action: 'confirm' | 'cancel'): HTMLButtonElement {
    const button = container.querySelector<HTMLButtonElement>(
      `[data-canvas-confirm-action="${action}"]`,
    );
    if (!button) throw new Error(`no ${action} button`);
    return button;
  }

  async function click(button: HTMLButtonElement): Promise<void> {
    await act(async () => {
      Simulate.click(button);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  /** Selects cards the way reactflow reports it. */
  async function select(ids: readonly string[]): Promise<void> {
    await act(async () => {
      flow.props.onSelectionChange({ nodes: ids.map(id => ({ id })), edges: [] });
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  async function pressKey(key: string): Promise<void> {
    await act(async () => {
      dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
      }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  /**
   * Counts document mutations from this point on. Writes are coalesced by the
   * service, so "one mutate" is the honest unit for a batch operation.
   */
  function countMutations(): void {
    const original = service.mutateDefaultDocument.bind(service);
    vi.spyOn(service, 'mutateDefaultDocument').mockImplementation(async (...args) => {
      saves += 1;
      return original(...args);
    });
  }

  const BLANK_A: InfiniteCanvasNode = { nodeId: 'a', kind: 'image', position: { x: 0, y: 0 } };
  const BLANK_B: InfiniteCanvasNode = { nodeId: 'b', kind: 'image', position: { x: 0, y: 100 } };
  const BLANK_C: InfiniteCanvasNode = { nodeId: 'c', kind: 'image', position: { x: 0, y: 200 } };

  it('configures the reactflow selection model the plan asks for', async () => {
    seed([]);
    await renderPanel();

    expect(flow.props.selectionOnDrag).toBe(false);
    expect(flow.props.selectionKeyCode).toBe('Shift');
    expect(flow.props.multiSelectionKeyCode).toEqual(['Meta', 'Control', 'Shift']);
    // Deletion is ours: reactflow must never remove a card by itself, or the
    // confirmation could be skipped.
    expect(flow.props.deleteKeyCode).toBeNull();
    expect(flow.props.elevateNodesOnSelect).toBe(true);
    expect(typeof flow.props.onSelectionChange).toBe('function');
  });

  it('lands a multi-card drag in one mutation and one undo step', async () => {
    seed([BLANK_A, BLANK_B, BLANK_C]);
    await renderPanel();
    await service.flushPendingWrites();
    countMutations();

    await act(async () => {
      flow.props.onNodesChange([
        { id: 'a', type: 'position', dragging: false, position: { x: 10, y: 10 } },
        { id: 'b', type: 'position', dragging: false, position: { x: 20, y: 20 } },
        { id: 'c', type: 'position', dragging: false, position: { x: 30, y: 30 } },
      ]);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await service.flushPendingWrites();

    expect(saves).toBe(1);
    expect(persisted().nodes.map(node => node.position)).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ]);

    // One drag, one undo.
    const undo = container.querySelector<HTMLButtonElement>('[data-toolbar-action="undo"]')!;
    await click(undo);
    await service.flushPendingWrites();
    expect(persisted().nodes.map(node => node.position)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 0, y: 200 },
    ]);
    expect(undo.disabled).toBe(true);
  });

  it('deletes plain cards on the Delete key without asking', async () => {
    seed([BLANK_A, BLANK_B]);
    await renderPanel();

    await select(['a', 'b']);
    await pressKey('Delete');

    expect(confirmDialog()).toBeNull();
    expect(nodeIds()).toEqual([]);
    await service.flushPendingWrites();
    expect(persisted().nodes).toEqual([]);
  });

  it('raises one confirmation with honest counts for a mixed batch', async () => {
    seed([
      BLANK_A,
      { ...BLANK_B, mediaRef: MEDIA_REF },
      { ...BLANK_C, prompt: 'a fox' },
    ]);
    await renderPanel();

    // Card c is put in flight for real: a pending state seeded into the file
    // would have been reconciled to a timeout failure at load.
    await generateFromCanvasGenerator(container, flow, 'c');
    expect(persistedOrProjected('c')?.generation?.status).toBe('pending');

    await select(['a', 'b', 'c']);
    await pressKey('Delete');

    const dialog = confirmDialog();
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('data-delete-count')).toBe('3');
    expect(dialog?.getAttribute('data-delete-media-count')).toBe('1');
    expect(dialog?.getAttribute('data-delete-pending-count')).toBe('1');
    // Exactly one dialog for the batch, never one per card.
    expect(container.querySelectorAll('[data-canvas-confirm="delete"]')).toHaveLength(1);
    // Nothing has gone yet.
    expect(nodeIds()).toEqual(['a', 'b', 'c']);
  });

  it('changes nothing at all when the confirmation is cancelled', async () => {
    seed([{ ...BLANK_A, mediaRef: MEDIA_REF }]);
    await renderPanel();
    await service.flushPendingWrites();
    const before = persisted();
    countMutations();

    await select(['a']);
    await pressKey('Delete');
    await click(confirmAction('cancel'));
    await service.flushPendingWrites();

    expect(confirmDialog()).toBeNull();
    expect(nodeIds()).toEqual(['a']);
    expect(saves).toBe(0);
    expect(persisted()).toEqual(before);
  });

  it('deletes the whole confirmed batch in one mutation and cascades the edges', async () => {
    seed(
      [{ ...BLANK_A, mediaRef: MEDIA_REF }, BLANK_B, BLANK_C],
      [
        { edgeId: 'edge-ab', sourceNodeId: 'a', targetNodeId: 'b' },
        { edgeId: 'edge-bc', sourceNodeId: 'b', targetNodeId: 'c' },
      ],
    );
    await renderPanel();
    await service.flushPendingWrites();
    countMutations();

    await select(['a', 'b']);
    await pressKey('Delete');
    await click(confirmAction('confirm'));
    await service.flushPendingWrites();

    expect(saves).toBe(1);
    const document = persisted();
    expect(document.nodes.map(node => node.nodeId)).toEqual(['c']);
    expect(document.edges).toEqual([]);
  });

  it('undoes a confirmed batch delete as a single step, media reference intact', async () => {
    seed([{ ...BLANK_A, mediaRef: MEDIA_REF, prompt: 'a fox' }, BLANK_B]);
    await renderPanel();

    await select(['a', 'b']);
    await pressKey('Delete');
    await click(confirmAction('confirm'));
    expect(nodeIds()).toEqual([]);

    await click(container.querySelector<HTMLButtonElement>('[data-toolbar-action="undo"]')!);
    await service.flushPendingWrites();
    const restored = persisted().nodes;
    expect(restored.map(node => node.nodeId).sort()).toEqual(['a', 'b']);
    expect(restored.find(node => node.nodeId === 'a')?.mediaRef).toEqual(MEDIA_REF);
    expect(restored.find(node => node.nodeId === 'a')?.prompt).toBe('a fox');
  });

  it('routes reactflow remove changes through the same gate', async () => {
    seed([{ ...BLANK_A, mediaRef: MEDIA_REF }]);
    await renderPanel();

    await act(async () => {
      flow.props.onNodesChange([{ id: 'a', type: 'remove' }]);
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // The card is still on screen: the removal waits for the confirmation.
    expect(confirmDialog()).not.toBeNull();
    expect(nodeIds()).toEqual(['a']);

    await click(confirmAction('confirm'));
    expect(nodeIds()).toEqual([]);
  });

  it('ignores the Delete key with nothing selected', async () => {
    seed([{ ...BLANK_A, mediaRef: MEDIA_REF }]);
    await renderPanel();

    await pressKey('Delete');

    expect(confirmDialog()).toBeNull();
    expect(nodeIds()).toEqual(['a']);
  });

  it('leaves the Delete key alone while a prompt box is focused', async () => {
    seed([BLANK_A]);
    await renderPanel();
    await select(['a']);

    const textarea = container.querySelector('textarea');
    if (!textarea) throw new Error('no prompt editor');
    await act(async () => {
      textarea.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: 'Delete',
        bubbles: true,
        cancelable: true,
      }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(nodeIds()).toEqual(['a']);
  });
});
