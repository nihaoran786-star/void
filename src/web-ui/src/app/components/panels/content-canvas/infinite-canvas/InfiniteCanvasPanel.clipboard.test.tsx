/**
 * P4 W7 behavior closure: copy / paste / duplicate, the three-state right-click
 * menu, and the multi-selection toolbar.
 *
 * Behavior only — no copy assertions. What is pinned here: pasting a card that
 * holds an image produces a second card pointing at the SAME file (reference,
 * not copy), duplicate leaves the clipboard alone, the menu shows the items the
 * card's shape allows, and every menu item runs the same handler as its
 * keyboard shortcut.
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
} from '@/shared/services/infinite-canvas';
import { InfiniteCanvasPanel } from './InfiniteCanvasPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACE = { workspaceId: 'workspace-clipboard', workspacePath: 'C:/workspace-c' };
const DOCUMENT_ID = defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId);
const MEDIA_REF = { workspacePath: WORKSPACE.workspacePath, relativePath: 'media/output/fox.png' };

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

describe('InfiniteCanvasPanel P4 W7 clipboard, context menu, selection toolbar', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let memory: InMemoryInfiniteCanvasPersistence;
  let service: InfiniteCanvasDocumentService;
  let saved: string[];
  let revealed: string[];

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
    saved = [];
    revealed = [];
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
          saveMediaAs={async filePath => {
            saved.push(filePath);
          }}
          revealMediaIn={async filePath => {
            revealed.push(filePath);
          }}
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

  function projected(): any[] {
    return flow.props.nodes;
  }

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
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  function fakeMouse() {
    return { clientX: 400, clientY: 300, preventDefault: () => undefined };
  }

  async function openNodeMenu(nodeId: string): Promise<void> {
    await act(async () => {
      flow.props.onNodeContextMenu(fakeMouse(), { id: nodeId });
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  async function openPaneMenu(): Promise<void> {
    await act(async () => {
      flow.props.onPaneContextMenu(fakeMouse());
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  function menu(): HTMLElement | null {
    return container.querySelector<HTMLElement>('[data-canvas-menu]');
  }

  function menuActions(): string[] {
    return Array.from(container.querySelectorAll<HTMLElement>('[data-canvas-menu-action]'))
      .map(element => element.getAttribute('data-canvas-menu-action')!);
  }

  async function clickMenu(action: string): Promise<void> {
    const button = container.querySelector<HTMLButtonElement>(
      `[data-canvas-menu-action="${action}"]`,
    );
    if (!button) throw new Error(`no menu item ${action}`);
    await act(async () => {
      Simulate.click(button);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  async function clickSelectionToolbar(action: string): Promise<void> {
    const button = container.querySelector<HTMLButtonElement>(
      `[data-canvas-selection-action="${action}"]`,
    );
    if (!button) throw new Error(`no selection action ${action}`);
    await act(async () => {
      Simulate.click(button);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  const IMAGE_CARD: InfiniteCanvasNode = {
    nodeId: 'card-a',
    kind: 'image',
    position: { x: 100, y: 100 },
    prompt: 'a fox',
    stylePresetId: 'cinematic-01',
    generationParams: { model: 'gemini', size: '16:9' },
    mediaRef: MEDIA_REF,
  };
  const BLANK_CARD: InfiniteCanvasNode = {
    nodeId: 'card-b',
    kind: 'image',
    position: { x: 100, y: 400 },
  };

  // —— Reference semantics ————————————————————————————————————————————————

  it('pastes a card with an image as a reference to the same file', async () => {
    seed([IMAGE_CARD]);
    await renderPanel();

    await select(['card-a']);
    await pressKey('c');
    await pressKey('v');
    await service.flushPendingWrites();

    const nodes = persisted().nodes;
    expect(nodes).toHaveLength(2);
    const pasted = nodes[1];
    expect(pasted.nodeId).not.toBe('card-a');
    // Field for field the same reference: one file, two cards.
    expect(pasted.mediaRef).toEqual(MEDIA_REF);
    expect(pasted.prompt).toBe('a fox');
    expect(pasted.stylePresetId).toBe('cinematic-01');
    expect(pasted.generationParams).toEqual({ model: 'gemini', size: '16:9' });
    expect(pasted.generation).toBeUndefined();
    expect(pasted.derivedFrom).toBeUndefined();
    // The original is untouched.
    expect(nodes[0]).toMatchObject({ nodeId: 'card-a', mediaRef: MEDIA_REF });
  });

  it('copies an edge only when both ends were selected', async () => {
    seed(
      [IMAGE_CARD, BLANK_CARD, { ...BLANK_CARD, nodeId: 'card-c', position: { x: 600, y: 400 } }],
      [
        { edgeId: 'edge-ab', sourceNodeId: 'card-a', targetNodeId: 'card-b' },
        { edgeId: 'edge-cb', sourceNodeId: 'card-c', targetNodeId: 'card-b' },
      ],
    );
    await renderPanel();

    await select(['card-a', 'card-b']);
    await pressKey('c');
    await pressKey('v');
    await service.flushPendingWrites();

    const document = persisted();
    expect(document.nodes).toHaveLength(5);
    // The two originals plus exactly one pasted edge.
    expect(document.edges).toHaveLength(3);
    const pastedEdge = document.edges[2];
    const pastedIds = document.nodes.slice(3).map(node => node.nodeId);
    expect(pastedIds).toContain(pastedEdge.sourceNodeId);
    expect(pastedIds).toContain(pastedEdge.targetNodeId);
  });

  it('cascades repeated pastes instead of stacking them on one spot', async () => {
    seed([IMAGE_CARD]);
    await renderPanel();

    await select(['card-a']);
    await pressKey('c');
    await pressKey('v');
    await pressKey('v');
    await service.flushPendingWrites();

    const positions = persisted().nodes.map(node => node.position);
    expect(positions).toEqual([
      { x: 100, y: 100 },
      { x: 132, y: 132 },
      { x: 164, y: 164 },
    ]);
  });

  it('duplicates without touching the clipboard', async () => {
    seed([IMAGE_CARD, BLANK_CARD]);
    await renderPanel();

    await select(['card-a']);
    await pressKey('c');
    await select(['card-b']);
    await pressKey('d');
    await service.flushPendingWrites();
    expect(persisted().nodes).toHaveLength(3);
    // The duplicate is of card-b …
    expect(persisted().nodes[2].mediaRef).toBeUndefined();

    // … and the clipboard still holds card-a.
    await pressKey('v');
    await service.flushPendingWrites();
    expect(persisted().nodes[3].mediaRef).toEqual(MEDIA_REF);
  });

  it('makes a paste one undo step', async () => {
    seed([IMAGE_CARD]);
    await renderPanel();

    await select(['card-a']);
    await pressKey('c');
    await pressKey('v');
    expect(projected()).toHaveLength(2);

    await act(async () => {
      Simulate.click(container.querySelector<HTMLButtonElement>('[data-toolbar-action="undo"]')!);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(projected()).toHaveLength(1);
  });

  it('does nothing on paste with an empty clipboard', async () => {
    seed([IMAGE_CARD]);
    await renderPanel();

    await pressKey('v');
    await service.flushPendingWrites();

    expect(persisted().nodes).toHaveLength(1);
  });

  // —— Right-click menu ————————————————————————————————————————————————————

  it('shows the media entries only on a card that has media', async () => {
    seed([IMAGE_CARD, BLANK_CARD]);
    await renderPanel();

    await openNodeMenu('card-a');
    expect(menu()?.getAttribute('data-canvas-menu')).toBe('node');
    expect(menuActions()).toEqual([
      'view', 'save-as', 'reveal', 'params', 'copy', 'duplicate', 'delete',
    ]);

    await openNodeMenu('card-b');
    expect(menuActions()).toEqual(['params', 'copy', 'duplicate', 'delete']);
  });

  it('offers the create-and-paste items on empty canvas, paste disabled when empty', async () => {
    seed([IMAGE_CARD]);
    await renderPanel();

    await openPaneMenu();
    expect(menu()?.getAttribute('data-canvas-menu')).toBe('pane');
    expect(menuActions()).toEqual([
      'add-text', 'add-image-card', 'add-video-card', 'paste',
    ]);
    expect(
      container.querySelector<HTMLButtonElement>('[data-canvas-menu-action="paste"]')!.disabled,
    ).toBe(true);
  });

  it('switches to the selection menu when the click lands inside a multi-selection', async () => {
    seed([IMAGE_CARD, BLANK_CARD]);
    await renderPanel();

    await select(['card-a', 'card-b']);
    await openNodeMenu('card-a');

    expect(menu()?.getAttribute('data-canvas-menu')).toBe('selection');
    expect(menuActions()).toEqual(['copy', 'duplicate', 'delete']);
  });

  it('creates a card at the right-click position', async () => {
    seed([]);
    await renderPanel();

    await openPaneMenu();
    await clickMenu('add-video-card');
    await service.flushPendingWrites();

    const created = persisted().nodes[0];
    expect(created.kind).toBe('video');
    // The pane click was at (400, 300) with an identity viewport.
    expect(created.position).toEqual({ x: 400, y: 300 });
    expect(menu()).toBeNull();
  });

  it('pastes at the right-click position from the empty-canvas menu', async () => {
    seed([IMAGE_CARD]);
    await renderPanel();

    await select(['card-a']);
    await pressKey('c');
    await openPaneMenu();
    await clickMenu('paste');
    await service.flushPendingWrites();

    expect(persisted().nodes[1].position).toEqual({ x: 400, y: 300 });
  });

  it('runs save-a-copy and show-in-folder through the injected ports', async () => {
    seed([IMAGE_CARD]);
    await renderPanel();

    await openNodeMenu('card-a');
    await clickMenu('save-as');
    await openNodeMenu('card-a');
    await clickMenu('reveal');

    expect(saved).toHaveLength(1);
    expect(saved[0]).toContain('fox.png');
    expect(revealed).toEqual(saved);
  });

  it('routes the menu delete through the same confirmation gate', async () => {
    seed([IMAGE_CARD]);
    await renderPanel();

    await openNodeMenu('card-a');
    await clickMenu('delete');

    expect(container.querySelector('[data-canvas-confirm="delete"]')).not.toBeNull();
    expect(projected()).toHaveLength(1);
  });

  it('copies through the menu, exactly as the shortcut does', async () => {
    seed([IMAGE_CARD]);
    await renderPanel();

    await openNodeMenu('card-a');
    await clickMenu('copy');
    await pressKey('v');
    await service.flushPendingWrites();

    expect(persisted().nodes[1].mediaRef).toEqual(MEDIA_REF);
  });

  // —— Selection toolbar ————————————————————————————————————————————————————

  it('shows the selection toolbar only from two cards up', async () => {
    seed([IMAGE_CARD, BLANK_CARD]);
    await renderPanel();

    expect(container.querySelector('[data-canvas-selection-toolbar]')).toBeNull();
    await select(['card-a']);
    expect(container.querySelector('[data-canvas-selection-toolbar]')).toBeNull();

    await select(['card-a', 'card-b']);
    const toolbar = container.querySelector('[data-canvas-selection-toolbar]');
    expect(toolbar?.getAttribute('data-canvas-selection-toolbar')).toBe('2');
  });

  it('duplicates the whole selection from the toolbar', async () => {
    seed([IMAGE_CARD, BLANK_CARD]);
    await renderPanel();

    await select(['card-a', 'card-b']);
    await clickSelectionToolbar('duplicate');
    await service.flushPendingWrites();

    const nodes = persisted().nodes;
    expect(nodes).toHaveLength(4);
    expect(nodes[2].mediaRef).toEqual(MEDIA_REF);
    expect(nodes[2].position).toEqual({ x: 132, y: 132 });
    expect(nodes[3].position).toEqual({ x: 132, y: 432 });
  });

  it('deletes the selection from the toolbar through the confirmation gate', async () => {
    seed([IMAGE_CARD, BLANK_CARD]);
    await renderPanel();

    await select(['card-a', 'card-b']);
    await clickSelectionToolbar('delete');

    const dialog = container.querySelector('[data-canvas-confirm="delete"]');
    expect(dialog?.getAttribute('data-delete-count')).toBe('2');
    expect(dialog?.getAttribute('data-delete-media-count')).toBe('1');
  });
});
