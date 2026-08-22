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
      .filter(node => !changes.some(change => change.type === 'remove' && change.id === node.id))
      .map(node => {
        const positionChange = changes.find(change => (
          change.type === 'position' && change.id === node.id && change.position
        ));
        return positionChange ? { ...node, position: positionChange.position } : node;
      }),
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

vi.mock('./infiniteCanvasDocumentGateway', () => ({
  getInfiniteCanvasDocumentService: () => {
    throw new Error('Tests must inject a document service.');
  },
}));

import {
  createInMemoryInfiniteCanvasPersistence,
  defaultInfiniteCanvasDocumentId,
  infiniteCanvasDocumentFilePath,
  InfiniteCanvasDocumentService,
  type InfiniteCanvasDocument,
  type InMemoryInfiniteCanvasPersistence,
} from '@/shared/services/infinite-canvas';
import { InfiniteCanvasPanel } from './InfiniteCanvasPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACE = { workspaceId: 'workspace-a', workspacePath: 'C:/workspace-a' };

function documentPath(workspacePath: string, workspaceId: string): string {
  return infiniteCanvasDocumentFilePath(
    workspacePath,
    defaultInfiniteCanvasDocumentId(workspaceId),
  );
}

function seedDocument(
  memory: InMemoryInfiniteCanvasPersistence,
  overrides: Partial<InfiniteCanvasDocument> = {},
): InfiniteCanvasDocument {
  const document: InfiniteCanvasDocument = {
    documentId: defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId),
    schemaVersion: '1',
    workspaceId: WORKSPACE.workspaceId,
    revision: 1,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
  memory.files.set(
    documentPath(WORKSPACE.workspacePath, WORKSPACE.workspaceId),
    JSON.stringify(document),
  );
  return document;
}

function readDocument(
  memory: InMemoryInfiniteCanvasPersistence,
  workspacePath = WORKSPACE.workspacePath,
  workspaceId = WORKSPACE.workspaceId,
): InfiniteCanvasDocument {
  const raw = memory.files.get(documentPath(workspacePath, workspaceId));
  expect(raw).toBeDefined();
  return JSON.parse(raw!) as InfiniteCanvasDocument;
}

describe('InfiniteCanvasPanel', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let memory: InMemoryInfiniteCanvasPersistence;
  let service: InfiniteCanvasDocumentService;

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
          {...props}
        />,
      );
    });
  }

  it('creates and persists a default document on first open', async () => {
    await renderPanel();

    expect(container.querySelector('[data-canvas-surface-state="ready"]')).not.toBeNull();
    expect(flow.props.nodes).toEqual([]);
    expect(readDocument(memory)).toMatchObject({
      workspaceId: WORKSPACE.workspaceId,
      nodes: [],
      edges: [],
    });
  });

  it('adds a text node through the DocumentService command path', async () => {
    await renderPanel();

    const addText = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent === 'infiniteCanvas.toolbar.addText');
    expect(addText).toBeDefined();

    await act(async () => {
      addText!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(flow.props.nodes).toHaveLength(1);
    await service.flushPendingWrites();
    const persisted = readDocument(memory);
    expect(persisted.nodes).toHaveLength(1);
    expect(persisted.nodes[0]).toMatchObject({ kind: 'text', text: '' });
  });

  it('commits text edits from the node editor into the document', async () => {
    seedDocument(memory, {
      nodes: [{ nodeId: 'n-1', kind: 'text', position: { x: 0, y: 0 }, text: '' }],
    });
    await renderPanel();

    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();
    await act(async () => {
      Simulate.change(textarea!, { target: { value: 'storyboard beat' } } as never);
    });
    await act(async () => {
      Simulate.blur(textarea!);
    });

    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0]).toMatchObject({ text: 'storyboard beat' });
  });

  it('records a dragged connection as a document edge exactly once', async () => {
    seedDocument(memory, {
      nodes: [
        { nodeId: 'a', kind: 'text', position: { x: 0, y: 0 }, text: '' },
        { nodeId: 'b', kind: 'text', position: { x: 100, y: 0 }, text: '' },
      ],
    });
    await renderPanel();

    await act(async () => {
      flow.props.onConnect({ source: 'a', target: 'b' });
    });
    await act(async () => {
      flow.props.onConnect({ source: 'a', target: 'b' });
    });

    expect(flow.props.edges).toHaveLength(1);
    await service.flushPendingWrites();
    expect(readDocument(memory).edges).toEqual([
      expect.objectContaining({ sourceNodeId: 'a', targetNodeId: 'b' }),
    ]);
  });

  it('persists node positions when dragging ends, not while dragging', async () => {
    seedDocument(memory, {
      nodes: [{ nodeId: 'a', kind: 'text', position: { x: 0, y: 0 }, text: '' }],
    });
    await renderPanel();

    await act(async () => {
      flow.props.onNodesChange([
        { type: 'position', id: 'a', position: { x: 10, y: 10 }, dragging: true },
      ]);
    });
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0].position).toEqual({ x: 0, y: 0 });

    await act(async () => {
      flow.props.onNodesChange([
        { type: 'position', id: 'a', position: { x: 40, y: 60 }, dragging: false },
      ]);
    });
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0].position).toEqual({ x: 40, y: 60 });
  });

  it('removes deleted nodes and persists the removal', async () => {
    seedDocument(memory, {
      nodes: [
        { nodeId: 'a', kind: 'text', position: { x: 0, y: 0 }, text: '' },
        { nodeId: 'b', kind: 'text', position: { x: 10, y: 0 }, text: '' },
      ],
      edges: [{ edgeId: 'e-ab', sourceNodeId: 'a', targetNodeId: 'b' }],
    });
    await renderPanel();

    await act(async () => {
      flow.props.onNodesChange([{ type: 'remove', id: 'a' }]);
    });

    expect(flow.props.nodes).toHaveLength(1);
    await service.flushPendingWrites();
    const persisted = readDocument(memory);
    expect(persisted.nodes.map(node => node.nodeId)).toEqual(['b']);
    expect(persisted.edges).toEqual([]);
  });

  it('persists the viewport after panning or zooming ends', async () => {
    await renderPanel();

    await act(async () => {
      flow.props.onMoveEnd(undefined, { x: 12, y: -30, zoom: 0.5 });
    });

    await service.flushPendingWrites();
    expect(readDocument(memory).viewport).toEqual({ x: 12, y: -30, zoom: 0.5 });
  });

  it('keeps canvas content across unmount and remount (collapse does not clear)', async () => {
    await renderPanel();
    const addText = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent === 'infiniteCanvas.toolbar.addText');
    await act(async () => {
      addText!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    await act(async () => root.unmount());
    // Unmount flushes coalesced writes through the service.
    await service.flushPendingWrites();

    root = createRoot(container);
    flow.props = null;
    await renderPanel();
    expect(flow.props.nodes).toHaveLength(1);
  });

  it('shows a typed error state for a corrupted document instead of overwriting it', async () => {
    memory.files.set(
      documentPath(WORKSPACE.workspacePath, WORKSPACE.workspaceId),
      '{not json',
    );
    await renderPanel();

    const error = container.querySelector('[data-canvas-surface-state="error"]');
    expect(error).not.toBeNull();
    expect(error!.getAttribute('data-error-kind')).toBe('corrupted');
    // The corrupted file is left untouched for inspection, never overwritten.
    expect(memory.files.get(
      documentPath(WORKSPACE.workspacePath, WORKSPACE.workspaceId),
    )).toBe('{not json');
  });
});
