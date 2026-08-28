/**
 * K2 W6 behavior closure: the three dispatch entries (blank-card generate,
 * regenerate, five tools), ordered 垫图 references, media-bridge backflow,
 * and the failed-retry loop. Behavior only — no style/text assertions.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';

import { generateFromCanvasGenerator } from './infiniteCanvasGeneratorDriver.testkit';
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

  /**
   * Since the §6 rebuild the card face has no generate button: a dispatch is
   * "select the card, press send in the bottom generator". The generator
   * adopts the selected card's stored prompt, so the dispatched input is
   * exactly what the seeded card carries.
   */
  function generateCard(nodeId: string): Promise<void> {
    return generateFromCanvasGenerator(container, flow, nodeId);
  }

  /**
   * Adversarial review P1: the registration branch reads the document as it is
   * AT COMMIT TIME, not the snapshot taken before the awaits.
   *
   * A card whose first picture landed while the send was in flight was still
   * being registered as a blank-card first shot — a registration the never-
   * overwrite rule refuses — so nothing was pending anywhere and the request
   * was paid for with nowhere to land.
   */
  it('registers against the document as it is when the mutation runs', async () => {
    seedDocument(memory, {
      nodes: [imageNode('card-blank', { prompt: 'a lighthouse at dusk' })],
    });

    let race = false;
    const landed = mediaRefOf('arrived-first.png');
    const raced = new Proxy(service, {
      get(target, property, _receiver) {
        if (property === 'mutateDefaultDocument') {
          return async (ref: never, mutator: never) => {
            if (race) {
              race = false;
              // Somebody else's result lands on the card between the panel
              // reading it and the panel's own mutation running.
              await service.mutateDefaultDocument(ref, current => ({
                nodes: current.nodes.map(node => (
                  node.nodeId === 'card-blank' ? { ...node, mediaRef: landed } : node
                )),
                edges: current.edges,
                viewport: current.viewport,
              }));
            }
            return service.mutateDefaultDocument(ref, mutator);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as InfiniteCanvasDocumentService;

    await renderPanel({ service: raced });
    race = true;
    await generateCard('card-blank');

    // One paid request, and a card that is genuinely waiting for it.
    expect(recording.invocations).toHaveLength(1);
    await service.flushPendingWrites();
    const card = readDocument(memory).nodes.find(node => node.nodeId === 'card-blank')!;
    expect(card.generation).toMatchObject({
      operationId: recording.invocations[0].operationId,
      status: 'pending',
      resultMode: 'self',
      toolId: 'generate',
    });
    // The picture that arrived first is untouched — never-overwrite holds.
    expect(card.mediaRef).toEqual(landed);
  });

  it('registers a self pending state and dispatches when a blank card generates', async () => {
    seedDocument(memory, {
      nodes: [imageNode('card-blank', { prompt: 'a lighthouse at dusk' })],
    });
    await renderPanel();

    await generateCard('card-blank');

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

    await generateCard('card-target');

    expect(recording.invocations).toHaveLength(1);
    expect(recording.invocations[0].references.map(reference => ({
      order: reference.order,
      nodeId: reference.nodeId,
    }))).toEqual([
      { order: 1, nodeId: 'ref-b' },
      { order: 2, nodeId: 'ref-a' },
    ]);
  });

  it('regenerating a derived card carries no reference from its version-tree edge', async () => {
    // card-v2 was derived from card-v1 by a five-tool run: the version edge is
    // marked role:'derived'. Regenerating card-v2 must stay a pure
    // text-to-image dispatch — no inherited 垫图 reference, no badge.
    seedDocument(memory, {
      nodes: [
        imageNode('card-v1', { mediaRef: mediaRefOf('v1.png') }),
        imageNode('card-v2', {
          mediaRef: mediaRefOf('v2.png'),
          prompt: 'same subject, new lighting',
          derivedFrom: { sourceNodeId: 'card-v1', toolId: 'expand', operationId: 'op-v2' },
        }),
      ],
      edges: [
        { edgeId: 'e-version', sourceNodeId: 'card-v1', targetNodeId: 'card-v2', role: 'derived' },
      ],
    });
    await renderPanel();

    expect(flowNode('card-v2').data.referenceLabels).toEqual([]);

    await generateCard('card-v2');

    expect(recording.invocations).toHaveLength(1);
    expect(recording.invocations[0]).toMatchObject({
      kind: 'generate',
      resultMode: 'self',
      nodeId: 'card-v2',
      references: [],
    });

    // §7.6: the regenerate accumulates on card-v2 itself, so it grows neither
    // a card nor an edge — the board keeps exactly the two cards it had.
    await service.flushPendingWrites();
    const persisted = readDocument(memory);
    expect(persisted.nodes).toHaveLength(2);
    expect(persisted.edges.map(edge => edge.edgeId)).toEqual(['e-version']);
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

    await generateCard('card-target');

    // No task, no pending placeholder — only the explicit notice.
    expect(recording.invocations).toHaveLength(0);
    expect(container.querySelector('.infinite-canvas-panel__tool-notice')).not.toBeNull();
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes.every(node => node.generation === undefined)).toBe(true);
  });

  /**
   * §7.4.3: there is one input box on the whole board, so a tool that needs a
   * sentence writes it into THAT box and waits. The lane behind the send is
   * unchanged — this is the same derive-a-new-card dispatch the deleted
   * completion dialog used to reach.
   */
  it('derives a pending placeholder card from a tool instruction sent from the shared input', async () => {
    const sourceMediaRef = mediaRefOf('hero.png');
    seedDocument(memory, {
      nodes: [imageNode('card-src', { mediaRef: sourceMediaRef })],
    });
    await renderPanel();

    await clickButton(button => button.getAttribute('data-tool-id') === 'upscale');
    // No second window: the instruction is sitting in the card's own box.
    expect(container.querySelector('.infinite-canvas-dialog[data-tool-id]')).toBeNull();
    const input = container.querySelector<HTMLTextAreaElement>(
      '[data-canvas-generator-target="card-src"] [data-canvas-generator-field="prompt"]',
    );
    expect(input).not.toBeNull();
    expect(input!.value).toBe('Upscale this image to 【target resolution】 while preserving detail.');

    // Pressing the tool dispatched nothing; the round send button is still the
    // only control on this board that spends money.
    expect(recording.invocations).toHaveLength(0);

    await act(async () => {
      Simulate.change(input!, {
        target: { value: 'Upscale this image to 4K while preserving detail.' },
      } as never);
    });
    await clickButton(button => (
      button.getAttribute('data-canvas-generator-action') === 'send'
    ));

    expect(recording.invocations).toHaveLength(1);
    const invocation = recording.invocations[0];
    expect(invocation).toMatchObject({
      kind: 'upscale',
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
        toolId: 'upscale',
        operationId: invocation.operationId,
      },
      generation: { status: 'pending', resultMode: 'derived', toolId: 'upscale' },
      prompt: 'Upscale this image to 4K while preserving detail.',
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
    await generateCard('card-blank');
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

    await generateCard('card-blank');

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

  /**
   * Adversarial review P2: a failed inpaint / erase / outpaint cannot be
   * re-sent from the card.
   *
   * Those three send a picture the front end BUILT in the editor — the
   * original with the user's red marks burnt in, or on a larger transparent
   * canvas. The retry only knew about the source card's own picture, so it
   * re-ran the request against the bare original: the marks and the frame were
   * gone, the result was guaranteed wrong, and the user paid for it.
   */
  it('refuses to re-send a mask or outpaint result, and says why', async () => {
    const sourceMediaRef = mediaRefOf('hero.png');
    seedDocument(memory, {
      nodes: [
        imageNode('card-src', { mediaRef: sourceMediaRef }),
        imageNode('card-derived', {
          prompt: 'Repaint the selected region as a red door.',
          derivedFrom: { sourceNodeId: 'card-src', toolId: 'inpaint', operationId: 'op-old' },
          generation: {
            operationId: 'op-old',
            toolId: 'inpaint',
            resultMode: 'derived',
            status: 'failed',
            errorKind: 'backend',
          },
        }),
      ],
    });
    await renderPanel();

    await clickButton(button => (
      button.className.includes('infinite-canvas-node__generation-retry')
    ));

    // Nothing was sent and nothing was charged; the board says what to do.
    expect(recording.invocations).toHaveLength(0);
    expect(container.querySelector('.infinite-canvas-panel__tool-notice')).not.toBeNull();
    await service.flushPendingWrites();
    const derived = readDocument(memory).nodes
      .find(node => node.nodeId === 'card-derived')!;
    expect(derived.generation).toMatchObject({ status: 'failed', operationId: 'op-old' });
  });

  it('rolls a throwing dispatch back to a retryable typed failure (no eternal pending)', async () => {
    seedDocument(memory, {
      nodes: [imageNode('card-blank', { prompt: 'a glacier' })],
    });
    recording.nextResult = () => {
      throw new Error('sender exploded');
    };
    await renderPanel();

    await generateCard('card-blank');

    expect(recording.invocations).toHaveLength(1);
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0].generation).toMatchObject({
      status: 'failed',
      errorKind: 'backend',
      operationId: recording.invocations[0].operationId,
    });
    // The failed card offers the retry exit.
    expect(container.querySelector('.infinite-canvas-node__generation-retry')).not.toBeNull();

    recording.nextResult = invocation => ({
      operationId: invocation.operationId,
      status: 'succeeded',
      derivedNodeId: invocation.nodeId,
    });
    await clickButton(button => (
      button.className.includes('infinite-canvas-node__generation-retry')
    ));

    expect(recording.invocations).toHaveLength(2);
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0].generation).toMatchObject({
      status: 'pending',
      operationId: recording.invocations[1].operationId,
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

  // §7.6: a regenerate on a card that already holds a picture no longer grows
  // a sibling card — it registers on the card itself and its result will be
  // appended. The picture already on the card is still never touched.
  it('regenerates onto the card itself, leaving the picture it already has alone', async () => {
    const sourceMediaRef = mediaRefOf('hero.png');
    seedDocument(memory, {
      nodes: [imageNode('card-src', { mediaRef: sourceMediaRef, prompt: 'moodier light' })],
    });
    await renderPanel();

    await generateCard('card-src');

    expect(recording.invocations).toHaveLength(1);
    expect(recording.invocations[0]).toMatchObject({
      kind: 'generate',
      resultMode: 'self',
      nodeId: 'card-src',
      prompt: 'moodier light',
    });
    expect(recording.invocations[0].editTargetMediaRef).toBeUndefined();

    await service.flushPendingWrites();
    const persisted = readDocument(memory);
    expect(persisted.nodes).toHaveLength(1);
    const source = persisted.nodes[0];
    expect(source.mediaRef).toEqual(sourceMediaRef);
    expect(source.mediaVariants).toBeUndefined();
    expect(source.generation).toMatchObject({ status: 'pending', resultMode: 'self' });
  });
});
