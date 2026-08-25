/**
 * §6 behavior closure: the bottom floating generator.
 *
 * Behavior only — no style assertions. What is pinned here: the card face
 * carries no prompt box and no generate button any more, the generator makes
 * a card when nothing is selected, it acts on the selected card when there is
 * one, and the reference thumbnail queue mirrors that card's incoming
 * reference edges. Everything dispatches through the same gateway lane the
 * on-card button used, with the same invocation shape.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';

import {
  generateFromCanvasGenerator,
  selectCanvasCards,
} from './infiniteCanvasGeneratorDriver.testkit';

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

function seed(
  memory: InMemoryInfiniteCanvasPersistence,
  overrides: Partial<InfiniteCanvasDocument> = {},
): void {
  memory.files.set(documentPath(), JSON.stringify({
    documentId: DOCUMENT_ID,
    schemaVersion: '1',
    workspaceId: WORKSPACE.workspaceId,
    revision: 1,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  } satisfies InfiniteCanvasDocument));
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
  return { nodeId, kind: 'image', position: { x: 0, y: 0 }, ...overrides };
}

interface RecordingGateway {
  invocations: SessionImageGenerationInvocation[];
  gateway: { invoke: (invocation: SessionImageGenerationInvocation) => Promise<ImageToolResult> };
}

function createRecordingGateway(): RecordingGateway {
  const recording: RecordingGateway = {
    invocations: [],
    gateway: {
      invoke: async invocation => {
        recording.invocations.push(invocation);
        return {
          operationId: invocation.operationId,
          status: 'succeeded',
          derivedNodeId: invocation.nodeId,
        };
      },
    },
  };
  return recording;
}

describe('InfiniteCanvasPanel bottom generator', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let memory: InMemoryInfiniteCanvasPersistence;
  let service: InfiniteCanvasDocumentService;
  let recording: RecordingGateway;

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
    flow.props = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    service.dispose();
    vi.unstubAllGlobals();
  });

  async function renderPanel(): Promise<void> {
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
          mediaEventBus={{ on: () => () => undefined } as never}
        />,
      );
    });
  }

  function promptField(): HTMLTextAreaElement {
    const field = container.querySelector<HTMLTextAreaElement>(
      '[data-canvas-generator-field="prompt"]',
    );
    if (!field) throw new Error('no generator prompt field');
    return field;
  }

  async function type(text: string): Promise<void> {
    const field = promptField();
    await act(async () => {
      field.value = text;
      Simulate.change(field);
    });
  }

  it('is the only place a prompt is written: the card face has no input controls', async () => {
    seed(memory, { nodes: [imageNode('card-a', { prompt: 'a fox' })] });
    await renderPanel();

    const card = container.querySelector('[data-node-id="card-a"]');
    expect(card).not.toBeNull();
    expect(card!.querySelector('textarea')).toBeNull();
    expect(card!.querySelector('.infinite-canvas-node__generate-button')).toBeNull();
    expect(container.querySelector('[data-canvas-generator="root"]')).not.toBeNull();
  });

  it('creates a card, writes the prompt on it and dispatches when nothing is selected', async () => {
    seed(memory);
    await renderPanel();
    await selectCanvasCards(flow, []);

    await type('a lighthouse at dusk');
    await generateFromCanvasGenerator(container, flow);

    expect(recording.invocations).toHaveLength(1);
    const invocation = recording.invocations[0];
    expect(invocation).toMatchObject({
      kind: 'generate',
      resultMode: 'self',
      prompt: 'a lighthouse at dusk',
      references: [],
    });

    await service.flushPendingWrites();
    const nodes = readDocument(memory).nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].prompt).toBe('a lighthouse at dusk');
    expect(nodes[0].nodeId).toBe(invocation.nodeId);
    expect(nodes[0].generation).toMatchObject({ status: 'pending', resultMode: 'self' });
  });

  it('acts on the selected card: one that already holds media derives a new card', async () => {
    seed(memory, {
      nodes: [imageNode('card-src', { mediaRef: mediaRefOf('hero.png'), prompt: 'moodier' })],
    });
    await renderPanel();

    await generateFromCanvasGenerator(container, flow, 'card-src');

    expect(recording.invocations).toHaveLength(1);
    expect(recording.invocations[0]).toMatchObject({
      resultMode: 'derived',
      sourceNodeId: 'card-src',
      prompt: 'moodier',
    });
    await service.flushPendingWrites();
    // The source card is untouched; the placeholder is a new card.
    const source = readDocument(memory).nodes.find(node => node.nodeId === 'card-src');
    expect(source?.mediaRef).toEqual(mediaRefOf('hero.png'));
    expect(readDocument(memory).nodes).toHaveLength(2);
  });

  it('mirrors the selected card\'s reference edges into the thumbnail queue', async () => {
    seed(memory, {
      nodes: [
        imageNode('ref-a', { mediaRef: mediaRefOf('a.png') }),
        imageNode('ref-b', { mediaRef: mediaRefOf('b.png') }),
        imageNode('card-target', { prompt: 'blend them' }),
      ],
      edges: [
        { edgeId: 'e-1', sourceNodeId: 'ref-b', targetNodeId: 'card-target' },
        { edgeId: 'e-2', sourceNodeId: 'ref-a', targetNodeId: 'card-target' },
      ],
    });
    await renderPanel();

    // Nothing selected: the queue is empty and the generator will make a card.
    expect(container.querySelectorAll('[data-canvas-generator-reference]')).toHaveLength(0);

    await selectCanvasCards(flow, ['card-target']);
    const thumbs = Array.from(
      container.querySelectorAll('[data-canvas-generator-reference]'),
    ).map(node => node.getAttribute('data-canvas-generator-reference'));
    expect(thumbs).toEqual(['ref-b', 'ref-a']);

    // And the dispatch carries the same references, in the same order.
    await generateFromCanvasGenerator(container, flow, 'card-target');
    expect(recording.invocations[0].references.map(reference => reference.nodeId))
      .toEqual(['ref-b', 'ref-a']);
  });

  it('leaves the generator in "new card" mode for a multi-selection', async () => {
    seed(memory, {
      nodes: [imageNode('card-a', { prompt: 'a' }), imageNode('card-b', { prompt: 'b' })],
    });
    await renderPanel();
    await selectCanvasCards(flow, ['card-a', 'card-b']);

    const generator = container.querySelector('[data-canvas-generator="root"]');
    expect(generator?.getAttribute('data-canvas-generator-target')).toBeNull();
  });
});
