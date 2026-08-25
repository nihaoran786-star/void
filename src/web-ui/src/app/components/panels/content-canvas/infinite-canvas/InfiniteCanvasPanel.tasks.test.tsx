/**
 * P4 W8 behavior closure: the task queue panel.
 *
 * Behavior only. What is pinned here: the queue is invisible with nothing
 * running, it lists what the document says is running or broken, retry reuses
 * the existing retry lane, "take me there" moves the viewport, and the two
 * honesty assertions about "stop waiting" — the card becomes a retryable
 * `cancelled` failure rather than disappearing, and a result that arrives
 * afterwards STILL lands in that card, because the money was already spent.
 *
 * The last test pins the design decision that keeps this slice out of the
 * collapsed-tool event-name trap: the queue component subscribes to nothing.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';

const flow = vi.hoisted(() => ({ props: null as any, setCenter: null as any }));

vi.mock('@xyflow/react', async () => {
  const React = (await import('react')).default;
  return {
    ReactFlow: (props: any) => {
      flow.props = props;
      // Reactflow hands the instance to onInit once it has mounted.
      const { onInit } = props;
      React.useEffect(() => {
        onInit?.({ setCenter: flow.setCenter });
      }, [onInit]);
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
  getInfiniteCanvasMediaRevealer: () => {
    throw new Error('Tests must inject a reveal port.');
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
import { InfiniteCanvasTaskQueuePanel } from './InfiniteCanvasTaskQueuePanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACE = { workspaceId: 'workspace-tasks', workspacePath: 'C:/workspace-t' };
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

describe('InfiniteCanvasPanel P4 W8 task queue', () => {
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
    flow.setCenter = vi.fn();
  });

  afterEach(() => {
    act(() => root.unmount());
    service.dispose();
    vi.unstubAllGlobals();
  });

  function seed(nodes: readonly InfiniteCanvasNode[]) {
    const document: InfiniteCanvasDocument = {
      documentId: DOCUMENT_ID,
      schemaVersion: '1',
      workspaceId: WORKSPACE.workspaceId,
      revision: 1,
      nodes: [...nodes],
      edges: [],
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

  function persisted(): InfiniteCanvasDocument {
    return JSON.parse(memory.files.get(documentPath())!) as InfiniteCanvasDocument;
  }

  async function click(selector: string): Promise<void> {
    const button = container.querySelector<HTMLButtonElement>(selector);
    if (!button) throw new Error(`no element for ${selector}`);
    await act(async () => {
      Simulate.click(button);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  async function expandQueue(): Promise<void> {
    await click('[data-canvas-tasks="collapsed"]');
  }

  /** Starts a real generation on a blank card so the queue has a live row. */
  async function startGeneration(nodeId: string): Promise<void> {
    const button = Array.from(
      container.querySelectorAll<HTMLButtonElement>(`[data-node-id="${nodeId}"] button`),
    ).find(candidate => candidate.textContent === 'infiniteCanvas.generation.generate');
    if (!button) throw new Error(`no generate button on ${nodeId}`);
    await act(async () => {
      Simulate.click(button);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  const CARD_A: InfiniteCanvasNode = {
    nodeId: 'card-a',
    kind: 'image',
    position: { x: 200, y: 400 },
    prompt: 'a fox',
  };
  const CARD_B: InfiniteCanvasNode = {
    nodeId: 'card-b',
    kind: 'image',
    position: { x: 800, y: 400 },
    prompt: 'a badger',
  };

  it('renders nothing at all when no card is generating', async () => {
    seed([{ ...CARD_A, mediaRef: { workspacePath: 'C:/w', relativePath: 'a.png' } }]);
    await renderPanel();

    expect(container.querySelector('[data-canvas-tasks]')).toBeNull();
  });

  it('counts the running and failed rows and lists them once expanded', async () => {
    seed([CARD_A, CARD_B]);
    await renderPanel();
    await startGeneration('card-a');

    const pill = container.querySelector<HTMLElement>('[data-canvas-tasks="collapsed"]');
    expect(pill?.getAttribute('data-canvas-tasks-pending')).toBe('1');
    expect(pill?.getAttribute('data-canvas-tasks-failed')).toBe('0');

    await expandQueue();
    const rows = container.querySelectorAll('[data-canvas-task-node]');
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute('data-canvas-task-node')).toBe('card-a');
    expect(rows[0].getAttribute('data-canvas-task-status')).toBe('pending');
  });

  it('stops the card waiting without pretending the job was cancelled', async () => {
    seed([CARD_A]);
    await renderPanel();
    await startGeneration('card-a');
    await expandQueue();

    await click('[data-canvas-task-action="stop-waiting"]');
    await service.flushPendingWrites();

    const node = persisted().nodes[0];
    expect(node.generation).toMatchObject({ status: 'failed', errorKind: 'cancelled' });
    // The card is still here and still retryable — nothing was removed.
    expect(node.mediaRef).toBeUndefined();
    const row = container.querySelector('[data-canvas-task-node="card-a"]');
    expect(row?.getAttribute('data-canvas-task-status')).toBe('failed');
    expect(row?.getAttribute('data-canvas-task-error')).toBe('cancelled');
  });

  it('still lands a result that arrives after "stop waiting"', async () => {
    seed([CARD_A]);
    await renderPanel();
    await startGeneration('card-a');
    const operationId = invocations[0].operationId;
    await expandQueue();
    await click('[data-canvas-task-action="stop-waiting"]');

    // The provider comes back anyway; the credits were spent, so the picture
    // must not be thrown away.
    await act(async () => {
      eventBus.emit({
        eventType: 'Completed',
        // The gateway name, not the original tool name: a collapsed tool is
        // invoked through CallDeferredTool and the bridge matches on the
        // receipt shape, never on this string.
        toolName: 'CallDeferredTool',
        result: {
          status: 'completed',
          kind: 'image',
          batch: { batch_id: 'batch-late' },
          infiniteCanvas: {
            workspaceId: WORKSPACE.workspaceId,
            documentId: DOCUMENT_ID,
            nodeId: 'card-a',
            resultMode: 'self',
            toolId: 'generate',
            operationId,
            outputMediaRelativePath: 'media/generated/batch-late/late.png',
          },
        },
      });
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    await service.flushPendingWrites();

    const node = persisted().nodes.find(entry => entry.nodeId === 'card-a')!;
    expect(node.mediaRef).toEqual({
      workspacePath: WORKSPACE.workspacePath,
      relativePath: 'media/generated/batch-late/late.png',
    });
    expect(node.generation).toBeUndefined();
  });

  it('retries a failed row through the existing retry lane', async () => {
    seed([CARD_A]);
    await renderPanel();
    await startGeneration('card-a');
    const firstOperationId = invocations[0].operationId;
    await expandQueue();
    await click('[data-canvas-task-action="stop-waiting"]');

    await click('[data-canvas-task-action="retry"]');
    await service.flushPendingWrites();

    expect(invocations).toHaveLength(2);
    expect(invocations[1].operationId).not.toBe(firstOperationId);
    expect(invocations[1]).toMatchObject({ kind: 'generate', resultMode: 'self', nodeId: 'card-a' });
    expect(persisted().nodes[0].generation).toMatchObject({ status: 'pending' });
  });

  it('retries every failed row one at a time', async () => {
    seed([CARD_A, CARD_B]);
    await renderPanel();
    await startGeneration('card-a');
    await startGeneration('card-b');
    await expandQueue();

    const stops = container.querySelectorAll<HTMLButtonElement>(
      '[data-canvas-task-action="stop-waiting"]',
    );
    expect(stops).toHaveLength(2);
    await act(async () => {
      Simulate.click(stops[0]);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await click('[data-canvas-task-action="stop-waiting"]');
    expect(invocations).toHaveLength(2);

    await click('[data-canvas-tasks-action="retry-all"]');
    await service.flushPendingWrites();

    expect(invocations).toHaveLength(4);
    expect(persisted().nodes.every(node => node.generation?.status === 'pending')).toBe(true);
  });

  it('takes the viewport to the card behind a row', async () => {
    seed([CARD_A]);
    await renderPanel();
    await startGeneration('card-a');
    await expandQueue();

    await click('[data-canvas-task-action="locate"]');

    expect(flow.setCenter).toHaveBeenCalledTimes(1);
    expect(flow.setCenter).toHaveBeenCalledWith(200, 400, expect.objectContaining({ zoom: 1 }));
  });

  it('subscribes to nothing: the queue is a projection, never an event listener', () => {
    const addEventListener = vi.spyOn(dom.window, 'addEventListener');
    const queueRoot = createRoot(container);

    act(() => {
      queueRoot.render(
        <InfiniteCanvasTaskQueuePanel
          tasks={[{
            nodeId: 'card-a',
            operationId: 'op-1',
            toolId: 'generate',
            status: 'pending',
            mediaKind: 'image',
            promptLine: 'a fox',
          }]}
          onRetry={() => undefined}
          onRetryAllFailed={() => undefined}
          onStopWaiting={() => undefined}
          onLocate={() => undefined}
        />,
      );
    });

    expect(container.querySelector('[data-canvas-tasks="collapsed"]')).not.toBeNull();
    // React registers its own delegated DOM listeners on the root; what must
    // not appear is any agent / tool channel. That is the whole point: this
    // panel projects the document and never listens for tool events, so the
    // `CallDeferredTool` naming trap cannot reach it.
    const registered = addEventListener.mock.calls.map(call => String(call[0]));
    expect(registered.filter(name => /agent|tool/i.test(name))).toEqual([]);
    act(() => queueRoot.unmount());
  });
});
