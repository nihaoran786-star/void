/**
 * P3 W5 panel-level behavior closure:
 * ① the full video-card loop — create the card, wire an image, generate,
 *   pending placeholder, bridged completion, video lands;
 * ② CanvasOp receipt events (including the CallDeferredTool gateway shape
 *   the production path uses — the C1 regression guard) update the canvas
 *   projection while the panel is mounted;
 * ③ an AI delete aimed at a real media card is refused and the projection
 *   stays unchanged.
 * Behavior only — no style/text assertions.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';

const flow = vi.hoisted(() => ({
  props: null as any,
}));

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
  // Default W7 manifest reader: nothing on disk unless a test injects one.
  getInfiniteCanvasMediaJobReader: () => ({
    readTextFile: async () => null,
  }),
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
  type ImageToolResult,
  type InfiniteCanvasDocument,
  type InfiniteCanvasNode,
  type InMemoryInfiniteCanvasPersistence,
  type SessionImageGenerationInvocation,
} from '@/shared/services/infinite-canvas';
import { InfiniteCanvasPanel } from './InfiniteCanvasPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACE = { workspaceId: 'workspace-a', workspacePath: 'C:/workspace-a' };
const DOCUMENT_ID = defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId);

function documentPath(): string {
  return infiniteCanvasDocumentFilePath(WORKSPACE.workspacePath, DOCUMENT_ID);
}

function seedDocument(
  memory: InMemoryInfiniteCanvasPersistence,
  overrides: Partial<InfiniteCanvasDocument> = {},
): void {
  const document: InfiniteCanvasDocument = {
    documentId: DOCUMENT_ID,
    schemaVersion: '1',
    workspaceId: WORKSPACE.workspaceId,
    revision: 1,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
  memory.files.set(documentPath(), JSON.stringify(document));
}

function readDocument(memory: InMemoryInfiniteCanvasPersistence): InfiniteCanvasDocument {
  const raw = memory.files.get(documentPath());
  expect(raw).toBeDefined();
  return JSON.parse(raw!) as InfiniteCanvasDocument;
}

function imageNode(nodeId: string, overrides: Partial<InfiniteCanvasNode> = {}): InfiniteCanvasNode {
  return {
    nodeId,
    kind: 'image',
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

interface RecordingGateway {
  invocations: SessionImageGenerationInvocation[];
  nextResult: (invocation: SessionImageGenerationInvocation) => ImageToolResult;
  gateway: { invoke: (invocation: SessionImageGenerationInvocation) => Promise<ImageToolResult> };
}

function createRecordingGateway(): RecordingGateway {
  const recording: RecordingGateway = {
    invocations: [],
    nextResult: invocation => ({
      operationId: invocation.operationId,
      status: 'succeeded',
      derivedNodeId: invocation.nodeId,
    }),
    gateway: {
      invoke: async invocation => {
        recording.invocations.push(invocation);
        return recording.nextResult(invocation);
      },
    },
  };
  return recording;
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

/** Accepted CanvasOp receipt in the exact shape the Rust tool returns. */
function canvasOpReceipt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'accepted',
    source: 'infinite_canvas',
    workspaceId: WORKSPACE.workspaceId,
    documentId: DOCUMENT_ID,
    seq: 1,
    batchId: 'batch-1',
    opCount: 1,
    ops: [
      { op: 'add_node', nodeId: 'node-agent-1', kind: 'text', position: { x: 10, y: 20 } },
    ],
    createdNodeIds: ['node-agent-1'],
    createdEdgeIds: [],
    generations: [],
    note: 'Operations accepted and journaled.',
    ...overrides,
  };
}

describe('InfiniteCanvasPanel P3 agent-canvas loop (W5)', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let memory: InMemoryInfiniteCanvasPersistence;
  let service: InfiniteCanvasDocumentService;
  let recording: RecordingGateway;
  let eventBus: FakeEventBus;

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
    memory = createInMemoryInfiniteCanvasPersistence();
    service = new InfiniteCanvasDocumentService(memory.port, { debounceMs: 1 });
    recording = createRecordingGateway();
    eventBus = createFakeEventBus();
    flow.props = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    service.dispose();
    vi.unstubAllGlobals();
  });

  async function renderPanel(props: Partial<React.ComponentProps<typeof InfiniteCanvasPanel>> = {}) {
    await act(async () => {
      root.render(
        <InfiniteCanvasPanel
          workspaceId={WORKSPACE.workspaceId}
          workspacePath={WORKSPACE.workspacePath}
          isActive
          service={service}
          resolvePreviewUrl={async () => undefined}
          generationRuntime={{
            gateway: recording.gateway,
            hasTargetSession: () => true,
          }}
          mediaEventBus={eventBus}
          {...props}
        />,
      );
    });
  }

  function flowNode(nodeId: string): any {
    return flow.props.nodes.find((node: any) => node.id === nodeId);
  }

  async function emitToolRunEvent(event: Record<string, unknown>): Promise<void> {
    await act(async () => {
      eventBus.emit(event);
      // Both bridges settle their document mutation on the microtask queue.
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  it('① runs the full video loop: create card → wire image → generate → pending → bridged event → video lands', async () => {
    seedDocument(memory, {
      nodes: [imageNode('card-src', {
        mediaRef: { workspacePath: WORKSPACE.workspacePath, relativePath: 'media/input/hero.png' },
      })],
    });
    await renderPanel();

    // Create the blank video card from the toolbar.
    const addVideo = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent === 'infiniteCanvas.toolbar.addVideoCard');
    expect(addVideo).toBeDefined();
    await act(async () => {
      addVideo!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    const videoView = flow.props.nodes.find((node: any) => node.id !== 'card-src');
    expect(videoView).toBeDefined();
    const videoNodeId = videoView.id as string;

    // Wire the image card as the video card's reference (垫图).
    await act(async () => {
      flow.props.onConnect({ source: 'card-src', target: videoNodeId });
    });

    // Write the camera-move prompt on the video card.
    const promptInput = container.querySelector(
      `[data-node-id="${videoNodeId}"] .infinite-canvas-node__prompt-input`,
    );
    expect(promptInput).not.toBeNull();
    await act(async () => {
      Simulate.change(promptInput!, { target: { value: 'slow dolly-in on the hero' } } as never);
    });
    await act(async () => {
      Simulate.blur(promptInput!);
    });

    // Generate: registers a self pending VIDEO generation, then dispatches.
    const generate = container.querySelector(
      `[data-node-id="${videoNodeId}"] .infinite-canvas-node__generate-button`,
    );
    expect(generate).not.toBeNull();
    await act(async () => {
      generate!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(recording.invocations).toHaveLength(1);
    const invocation = recording.invocations[0];
    expect(invocation).toMatchObject({
      kind: 'generate',
      mediaKind: 'video',
      resultMode: 'self',
      nodeId: videoNodeId,
      prompt: 'slow dolly-in on the hero',
    });
    expect(invocation.references.map(reference => reference.nodeId)).toEqual(['card-src']);
    expect(flowNode(videoNodeId).data.generation).toMatchObject({
      status: 'pending',
      mediaKind: 'video',
    });

    // The bridged completion lands the produced video into the same card.
    await emitToolRunEvent({
      eventType: 'Completed',
      toolName: 'GenerateVideo',
      result: {
        status: 'completed',
        kind: 'video',
        batch: { batch_id: 'batch-v1' },
        infiniteCanvas: {
          workspaceId: WORKSPACE.workspaceId,
          documentId: DOCUMENT_ID,
          nodeId: videoNodeId,
          resultMode: 'self',
          toolId: 'generate',
          operationId: invocation.operationId,
          mediaKind: 'video',
          outputMediaKind: 'video',
          outputMediaRelativePath: 'media/generated/batch-v1/video-001.mp4',
        },
      },
    });

    expect(flowNode(videoNodeId).data.generation).toBeUndefined();
    expect(flowNode(videoNodeId).data.mediaRef).toEqual({
      workspacePath: WORKSPACE.workspacePath,
      relativePath: 'media/generated/batch-v1/video-001.mp4',
    });
    await service.flushPendingWrites();
    const persisted = readDocument(memory);
    const videoNode = persisted.nodes.find(node => node.nodeId === videoNodeId)!;
    expect(videoNode.kind).toBe('video');
    expect(videoNode.mediaRef?.relativePath).toBe('media/generated/batch-v1/video-001.mp4');
    expect(videoNode.generation).toBeUndefined();
    // The source image card is untouched.
    expect(persisted.nodes.find(node => node.nodeId === 'card-src')!.mediaRef)
      .toEqual({ workspacePath: WORKSPACE.workspacePath, relativePath: 'media/input/hero.png' });
  });

  it('② projects a CanvasOp receipt arriving through the CallDeferredTool gateway (C1 regression guard)', async () => {
    seedDocument(memory);
    await renderPanel();
    expect(flow.props.nodes).toEqual([]);

    // Production shape: CanvasOp is collapsed, so the run event carries the
    // deferred-tool gateway's name — only the receipt identifies the tool.
    await emitToolRunEvent({
      eventType: 'Completed',
      toolName: 'CallDeferredTool',
      params: { tool_name: 'CanvasOp' },
      result: canvasOpReceipt(),
    });

    expect(flowNode('node-agent-1')).toBeDefined();
    await service.flushPendingWrites();
    const persisted = readDocument(memory);
    expect(persisted.nodes.some(node => node.nodeId === 'node-agent-1')).toBe(true);
    expect(persisted.agentOps).toEqual({ appliedSeq: 1 });

    // The direct toolName shape keeps working too.
    await emitToolRunEvent({
      eventType: 'Completed',
      toolName: 'CanvasOp',
      result: canvasOpReceipt({
        seq: 2,
        batchId: 'batch-2',
        ops: [
          { op: 'add_node', nodeId: 'node-agent-2', kind: 'text', position: { x: 40, y: 20 } },
        ],
        createdNodeIds: ['node-agent-2'],
      }),
    });

    expect(flowNode('node-agent-2')).toBeDefined();
    await service.flushPendingWrites();
    expect(readDocument(memory).agentOps).toEqual({ appliedSeq: 2 });
  });

  it('③ refuses an AI delete aimed at a real media card and keeps the projection unchanged', async () => {
    const keptMediaRef = {
      workspacePath: WORKSPACE.workspacePath,
      relativePath: 'media/generated/b0/keep.png',
    };
    seedDocument(memory, {
      nodes: [imageNode('card-media', { mediaRef: keptMediaRef })],
    });
    await renderPanel();
    expect(flowNode('card-media')).toBeDefined();

    // Tampered/replayed receipt claiming a delete Rust would have rejected:
    // the front-end double gate must skip it against the live document.
    await emitToolRunEvent({
      eventType: 'Completed',
      toolName: 'CallDeferredTool',
      result: canvasOpReceipt({
        ops: [{ op: 'delete_node', nodeId: 'card-media' }],
        createdNodeIds: [],
      }),
    });

    // The card survives in the projection with its media intact.
    expect(flowNode('card-media')).toBeDefined();
    expect(flowNode('card-media').data.mediaRef).toEqual(keptMediaRef);
    await service.flushPendingWrites();
    const persisted = readDocument(memory);
    expect(persisted.nodes.find(node => node.nodeId === 'card-media')?.mediaRef)
      .toEqual(keptMediaRef);
    // The batch is consumed (watermark advanced) so a replay cannot retry it.
    expect(persisted.agentOps).toEqual({ appliedSeq: 1 });
  });
});
