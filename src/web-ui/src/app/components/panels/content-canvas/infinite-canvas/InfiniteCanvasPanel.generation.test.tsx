/**
 * K2 W6 behavior closure: the three dispatch entries (blank-card generate,
 * regenerate, five tools), ordered 垫图 references, media-bridge backflow,
 * and the failed-retry loop. Behavior only — no style/text assertions.
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

function mediaRefOf(name: string) {
  return { workspacePath: WORKSPACE.workspacePath, relativePath: `media/input/${name}` };
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

describe('InfiniteCanvasPanel K2 generation loop', () => {
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

  function clickButton(matcher: (button: HTMLButtonElement) => boolean): Promise<void> {
    const button = Array.from(container.querySelectorAll('button')).find(matcher);
    expect(button).toBeDefined();
    return act(async () => {
      button!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
  }

  function flowNode(nodeId: string): any {
    return flow.props.nodes.find((node: any) => node.id === nodeId);
  }

  it('registers a self pending state and dispatches when a blank card generates', async () => {
    seedDocument(memory, {
      nodes: [imageNode('card-blank', { prompt: 'a lighthouse at dusk' })],
    });
    await renderPanel();

    await clickButton(button => (
      button.className.includes('infinite-canvas-node__generate-button')
    ));

    expect(recording.invocations).toHaveLength(1);
    const invocation = recording.invocations[0];
    expect(invocation).toMatchObject({
      kind: 'generate',
      resultMode: 'self',
      nodeId: 'card-blank',
      prompt: 'a lighthouse at dusk',
      references: [],
    });

    // The pending state was registered before dispatch, under the same
    // operationId the gateway received.
    await service.flushPendingWrites();
    const persisted = readDocument(memory).nodes[0];
    expect(persisted.generation).toMatchObject({
      operationId: invocation.operationId,
      toolId: 'generate',
      resultMode: 'self',
      status: 'pending',
    });
    expect(persisted.mediaRef).toBeUndefined();
    expect(flowNode('card-blank').data.generation.status).toBe('pending');
  });

  it('dispatches connected references in edge-creation order with ordered badges', async () => {
    seedDocument(memory, {
      nodes: [
        imageNode('ref-a', { mediaRef: mediaRefOf('a.png') }),
        imageNode('ref-b', { mediaRef: mediaRefOf('b.png') }),
        imageNode('card-target', { prompt: 'use @图一 composition, @图二 palette' }),
      ],
      edges: [
        { edgeId: 'e-1', sourceNodeId: 'ref-b', targetNodeId: 'card-target' },
        { edgeId: 'e-2', sourceNodeId: 'ref-a', targetNodeId: 'card-target' },
      ],
    });
    await renderPanel();

    // The target card shows its 垫图 order badges, in edge-creation order.
    expect(flowNode('card-target').data.referenceLabels).toEqual(['图一', '图二']);

    const generateButtons = Array.from(
      container.querySelectorAll('.infinite-canvas-node__generate-button'),
    );
    const targetButton = container
      .querySelector('[data-node-id="card-target"] .infinite-canvas-node__generate-button');
    expect(generateButtons.length).toBeGreaterThan(0);
    expect(targetButton).not.toBeNull();
    await act(async () => {
      targetButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(recording.invocations).toHaveLength(1);
    expect(recording.invocations[0].references.map(reference => ({
      order: reference.order,
      nodeId: reference.nodeId,
    }))).toEqual([
      { order: 1, nodeId: 'ref-b' },
      { order: 2, nodeId: 'ref-a' },
    ]);
  });

  it('blocks dispatch with a typed notice while a reference card has no image', async () => {
    seedDocument(memory, {
      nodes: [
        imageNode('ref-pending'),
        imageNode('card-target', { prompt: 'a prompt' }),
      ],
      edges: [
        { edgeId: 'e-1', sourceNodeId: 'ref-pending', targetNodeId: 'card-target' },
      ],
    });
    await renderPanel();

    const targetButton = container
      .querySelector('[data-node-id="card-target"] .infinite-canvas-node__generate-button');
    await act(async () => {
      targetButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    // No task, no pending placeholder — only the explicit notice.
    expect(recording.invocations).toHaveLength(0);
    expect(container.querySelector('.infinite-canvas-panel__tool-notice')).not.toBeNull();
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes.every(node => node.generation === undefined)).toBe(true);
  });

  it('derives a pending placeholder card from a confirmed tool instruction', async () => {
    const sourceMediaRef = mediaRefOf('hero.png');
    seedDocument(memory, {
      nodes: [imageNode('card-src', { mediaRef: sourceMediaRef })],
    });
    await renderPanel();

    await clickButton(button => button.getAttribute('data-tool-id') === 'expand');
    const input = container.querySelector('.infinite-canvas-dialog textarea');
    expect(input).not.toBeNull();
    await act(async () => {
      Simulate.change(input!, {
        target: { value: 'Expand the canvas towards the left and fill it with sky.' },
      } as never);
    });
    await clickButton(button => (
      button.className.includes('infinite-canvas-dialog__confirm')
    ));

    expect(recording.invocations).toHaveLength(1);
    const invocation = recording.invocations[0];
    expect(invocation).toMatchObject({
      kind: 'expand',
      resultMode: 'derived',
      sourceNodeId: 'card-src',
      editTargetMediaRef: sourceMediaRef,
    });

    await service.flushPendingWrites();
    const persisted = readDocument(memory);
    expect(persisted.nodes).toHaveLength(2);
    const derived = persisted.nodes.find(node => node.nodeId !== 'card-src')!;
    expect(derived.nodeId).toBe(invocation.nodeId);
    expect(derived).toMatchObject({
      kind: 'image',
      derivedFrom: {
        sourceNodeId: 'card-src',
        toolId: 'expand',
        operationId: invocation.operationId,
      },
      generation: { status: 'pending', resultMode: 'derived', toolId: 'expand' },
      prompt: 'Expand the canvas towards the left and fill it with sky.',
    });
    expect(derived.mediaRef).toBeUndefined();
    // The source card is untouched and connected to the derived card.
    expect(persisted.nodes.find(node => node.nodeId === 'card-src')!.mediaRef)
      .toEqual(sourceMediaRef);
    expect(persisted.edges).toEqual([
      expect.objectContaining({ sourceNodeId: 'card-src', targetNodeId: derived.nodeId }),
    ]);
  });

  it('lands a bridged completion event into the pending card as its real image', async () => {
    seedDocument(memory, {
      nodes: [imageNode('card-blank', { prompt: 'a cat' })],
    });
    await renderPanel();

    // Dispatch first: the pending registration and the bridged completion
    // share the same runtime-generated operationId.
    await clickButton(button => (
      button.className.includes('infinite-canvas-node__generate-button')
    ));
    expect(recording.invocations).toHaveLength(1);
    const operationId = recording.invocations[0].operationId;
    expect(flowNode('card-blank').data.generation.status).toBe('pending');

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
            nodeId: 'card-blank',
            resultMode: 'self',
            toolId: 'generate',
            operationId,
            outputMediaRelativePath: 'media/generated/batch-1/image-001.png',
          },
        },
      });
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(flowNode('card-blank').data.generation).toBeUndefined();
    expect(flowNode('card-blank').data.mediaRef).toEqual({
      workspacePath: WORKSPACE.workspacePath,
      relativePath: 'media/generated/batch-1/image-001.png',
    });
    await service.flushPendingWrites();
    const persisted = readDocument(memory).nodes[0];
    expect(persisted.generation).toBeUndefined();
    expect(persisted.mediaRef).toEqual({
      workspacePath: WORKSPACE.workspacePath,
      relativePath: 'media/generated/batch-1/image-001.png',
    });
  });

  it('rolls a failed dispatch back to a typed failure and retries with a fresh operation', async () => {
    seedDocument(memory, {
      nodes: [imageNode('card-blank', { prompt: 'a fjord' })],
    });
    recording.nextResult = invocation => ({
      operationId: invocation.operationId,
      status: 'failed',
      error: { kind: 'backend', message: 'boom' },
    });
    await renderPanel();

    await clickButton(button => (
      button.className.includes('infinite-canvas-node__generate-button')
    ));

    expect(recording.invocations).toHaveLength(1);
    const firstOperationId = recording.invocations[0].operationId;
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0].generation).toMatchObject({
      status: 'failed',
      errorKind: 'backend',
      operationId: firstOperationId,
    });
    expect(container.querySelector('.infinite-canvas-node__generation-retry')).not.toBeNull();

    // The retry re-arms the same card under a fresh operationId and dispatches.
    recording.nextResult = invocation => ({
      operationId: invocation.operationId,
      status: 'succeeded',
      derivedNodeId: invocation.nodeId,
    });
    await clickButton(button => (
      button.className.includes('infinite-canvas-node__generation-retry')
    ));

    expect(recording.invocations).toHaveLength(2);
    const secondOperationId = recording.invocations[1].operationId;
    expect(secondOperationId).not.toBe(firstOperationId);
    expect(recording.invocations[1]).toMatchObject({
      kind: 'generate',
      resultMode: 'self',
      nodeId: 'card-blank',
      prompt: 'a fjord',
    });
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0].generation).toMatchObject({
      status: 'pending',
      operationId: secondOperationId,
    });
  });

  it('reconciles a residual pending card from a completed batch manifest on load (W7)', async () => {
    seedDocument(memory, {
      nodes: [imageNode('card-blank', {
        prompt: 'a cat',
        generation: {
          operationId: 'op-1',
          toolId: 'generate',
          resultMode: 'self',
          status: 'pending',
          batchId: 'batch-1',
        },
      })],
    });
    const manifest = JSON.stringify({
      status: 'completed',
      kind: 'image',
      batch: {
        batch_id: 'batch-1',
        status: 'completed',
        assets: [{
          item_index: 1,
          kind: 'image',
          local_path: 'C:/workspace-a/media/generated/batch-1/image-001.png',
        }],
      },
    });
    await renderPanel({
      mediaJobReader: {
        readTextFile: async path => (path.endsWith('media-jobs/batch-1.json') ? manifest : null),
      },
    });

    expect(flowNode('card-blank').data.generation).toBeUndefined();
    expect(flowNode('card-blank').data.mediaRef).toEqual({
      workspacePath: WORKSPACE.workspacePath,
      relativePath: 'media/generated/batch-1/image-001.png',
    });
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0].mediaRef).toEqual({
      workspacePath: WORKSPACE.workspacePath,
      relativePath: 'media/generated/batch-1/image-001.png',
    });
  });

  it('turns a residual pending card without a batch into a retryable timeout on load (W7)', async () => {
    seedDocument(memory, {
      nodes: [imageNode('card-blank', {
        prompt: 'a cat',
        generation: {
          operationId: 'op-1',
          toolId: 'generate',
          resultMode: 'self',
          status: 'pending',
        },
      })],
    });
    await renderPanel();

    expect(flowNode('card-blank').data.generation).toMatchObject({
      status: 'failed',
      errorKind: 'timeout',
    });
    // The failed card offers the retry exit — never an endless spinner.
    expect(container.querySelector('.infinite-canvas-node__generation-retry')).not.toBeNull();
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0].generation).toMatchObject({
      status: 'failed',
      errorKind: 'timeout',
    });
  });

  it('never touches the source mediaRef when regenerating a card that has an image', async () => {
    const sourceMediaRef = mediaRefOf('hero.png');
    seedDocument(memory, {
      nodes: [imageNode('card-src', { mediaRef: sourceMediaRef, prompt: 'moodier light' })],
    });
    await renderPanel();

    await clickButton(button => (
      button.className.includes('infinite-canvas-node__generate-button')
    ));

    expect(recording.invocations).toHaveLength(1);
    expect(recording.invocations[0]).toMatchObject({
      kind: 'generate',
      resultMode: 'derived',
      sourceNodeId: 'card-src',
      prompt: 'moodier light',
    });
    expect(recording.invocations[0].editTargetMediaRef).toBeUndefined();

    await service.flushPendingWrites();
    const persisted = readDocument(memory);
    expect(persisted.nodes).toHaveLength(2);
    const source = persisted.nodes.find(node => node.nodeId === 'card-src')!;
    expect(source.mediaRef).toEqual(sourceMediaRef);
    expect(source.generation).toBeUndefined();
    const derived = persisted.nodes.find(node => node.nodeId !== 'card-src')!;
    expect(derived.generation).toMatchObject({ status: 'pending', resultMode: 'derived' });
  });
});
