/**
 * S5: a short-drama asset arriving on the board.
 *
 * Behaviour only — no styling assertions. What is pinned here: one press lands
 * exactly one card, the same request never lands twice, a second send of the
 * same asset reveals the card that already exists rather than growing a twin,
 * the card points at the very same file the asset points at (no copy, and no
 * `asset://` preview URL borrowed from the short-drama side), and every
 * refusal is visible rather than silent.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
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
    applyNodeChanges: (_changes: any[], nodes: any[]) => nodes,
    applyEdgeChanges: (_changes: any[], edges: any[]) => edges,
  };
});

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => (
      values ? `${key}:${Object.values(values).join(',')}` : key
    ),
  }),
}));

const warning = vi.fn();
vi.mock('@/shared/notification-system/services/NotificationService', () => ({
  notificationService: { warning: (...args: unknown[]) => warning(...args) },
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

// The reader is mocked so no manifest file is ever touched; the panel reaches
// for the short-drama project only through this one injected seam.
vi.mock('@/shared/services/canvas-short-drama/shortDramaCanvasProjectReader', () => ({
  readShortDramaProjectForCanvas: async () => undefined,
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
import type {
  ShortDramaArtifact,
  ShortDramaProject,
} from '@/shared/services/short-drama/ShortDramaTypes';
import { InfiniteCanvasPanel } from './InfiniteCanvasPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACE = { workspaceId: 'workspace-k3', workspacePath: 'C:/workspace-k3' };
const DOCUMENT_ID = defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId);
const RELATIVE_PATH = 'media/generated/batch-1/lin-xia.png';
const DOMAIN_REF = {
  moduleId: 'short-drama',
  kind: 'character',
  id: 'artifact-1',
  role: 'refine',
} as const;

function documentPath(): string {
  return infiniteCanvasDocumentFilePath(WORKSPACE.workspacePath, DOCUMENT_ID);
}

function artifact(overrides: Partial<ShortDramaArtifact> = {}): ShortDramaArtifact {
  return {
    id: 'artifact-1',
    handle: 'CHAR-001',
    episodeId: 'episode-1',
    stage: 'assets',
    type: 'character',
    title: 'Lin Xia',
    summary: 'The lead.',
    agentRole: 'asset',
    status: 'ready',
    revisionCount: 0,
    attemptCount: 0,
    revisions: [],
    attempts: [],
    mediaReference: {
      mediaItemId: 'media-1',
      kind: 'image',
      relativePath: RELATIVE_PATH,
      // The short-drama side's own preview URLs are `convertFileSrc` output
      // that the canvas webview refuses to load. They must never travel.
      thumbnailUrl: 'asset://localhost/thumb.png',
      previewUrl: 'asset://localhost/preview.png',
    },
    ...overrides,
  } as ShortDramaArtifact;
}

function project(artifacts: ShortDramaArtifact[] = [artifact()]): ShortDramaProject {
  return {
    projectId: 'project-1',
    title: 'Demo',
    episodes: [{ id: 'episode-1', number: 1, title: 'Pilot' }],
    artifacts,
  } as unknown as ShortDramaProject;
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

describe('InfiniteCanvasPanel K3 short-drama import', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let memory: InMemoryInfiniteCanvasPersistence;
  let service: InfiniteCanvasDocumentService;
  let previewed: { workspacePath: string; relativePath: string }[];

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
    previewed = [];
    warning.mockReset();
    flow.props = null;
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

  async function renderPanel(options: {
    pendingDomainImport?: { domainRef: typeof DOMAIN_REF; requestId: string };
    readShortDramaProject?: () => Promise<ShortDramaProject | undefined>;
    onInvoke?: (invocation: Record<string, unknown>) => void;
  } = {}): Promise<void> {
    const read = options.readShortDramaProject ?? (async () => project());
    await act(async () => {
      root.render(
        <InfiniteCanvasPanel
          workspaceId={WORKSPACE.workspaceId}
          workspacePath={WORKSPACE.workspacePath}
          isActive
          service={service}
          pendingDomainImport={options.pendingDomainImport}
          readShortDramaProject={read}
          resolvePreviewUrl={async mediaRef => {
            previewed.push(mediaRef);
            return 'data:image/png;base64,AAAA';
          }}
          mediaEventBus={createFakeEventBus()}
          generationRuntime={{
            gateway: {
              invoke: async (invocation: Record<string, unknown>) => {
                options.onInvoke?.(invocation);
                return { operationId: 'x', status: 'succeeded' as const };
              },
            },
            hasTargetSession: () => true,
          } as never}
        />,
      );
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }

  async function settle(): Promise<void> {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }

  function persisted(): InfiniteCanvasDocument {
    return JSON.parse(memory.files.get(documentPath())!) as InfiniteCanvasDocument;
  }

  function imported(): InfiniteCanvasNode[] {
    return persisted().nodes.filter(node => node.domainRef !== undefined);
  }

  function badges(): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(
      '[data-testid="infinite-canvas-domain-badge"]',
    ));
  }

  it('lands one picture card that remembers where it came from', async () => {
    seed([]);
    await renderPanel({ pendingDomainImport: { domainRef: DOMAIN_REF, requestId: 'req-1' } });
    await settle();

    const cards = imported();
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe('image');
    expect(cards[0].domainRef).toEqual(DOMAIN_REF);
    // Same file, not a copy: the board never writes the media domain.
    expect(cards[0].mediaRef).toEqual({
      workspacePath: WORKSPACE.workspacePath,
      relativePath: RELATIVE_PATH,
    });
    // A root, not a version of anything.
    expect(cards[0].prompt).toBeUndefined();
    expect(cards[0].derivedFrom).toBeUndefined();
    expect(cards[0].generation).toBeUndefined();
  });

  it('draws the picture through the canvas resolver, never the short-drama URL', async () => {
    seed([]);
    await renderPanel({ pendingDomainImport: { domainRef: DOMAIN_REF, requestId: 'req-1' } });
    await settle();

    expect(previewed).toContainEqual({
      workspacePath: WORKSPACE.workspacePath,
      relativePath: RELATIVE_PATH,
    });
    expect(container.innerHTML).not.toContain('asset://');
  });

  it('imports the same request only once, however often it is re-delivered', async () => {
    seed([]);
    const pending = { domainRef: DOMAIN_REF, requestId: 'req-1' };
    await renderPanel({ pendingDomainImport: pending });
    await settle();
    // The 'update' strategy re-delivers the tab's content on every activation.
    await renderPanel({ pendingDomainImport: pending });
    await settle();

    expect(imported()).toHaveLength(1);
  });

  it('reveals the card an asset already has instead of growing a second one', async () => {
    seed([]);
    await renderPanel({ pendingDomainImport: { domainRef: DOMAIN_REF, requestId: 'req-1' } });
    await settle();
    const first = imported()[0].nodeId;

    // A fresh press: new request id, same asset.
    await renderPanel({ pendingDomainImport: { domainRef: DOMAIN_REF, requestId: 'req-2' } });
    await settle();

    const cards = imported();
    expect(cards).toHaveLength(1);
    expect(cards[0].nodeId).toBe(first);
  });

  it('opens the board with nothing new when there is no import to do', async () => {
    seed([]);
    await renderPanel();
    await settle();

    expect(imported()).toHaveLength(0);
    expect(warning).not.toHaveBeenCalled();
  });

  it('says so out loud, and lands nothing, when the asset is gone', async () => {
    seed([]);
    await renderPanel({
      pendingDomainImport: { domainRef: DOMAIN_REF, requestId: 'req-1' },
      readShortDramaProject: async () => project([]),
    });
    await settle();

    expect(imported()).toHaveLength(0);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls[0][0]).toBe('infiniteCanvas.domainImport.assetMissing');
  });

  it('says so out loud, and lands nothing, when the asset is of another type now', async () => {
    seed([]);
    await renderPanel({
      pendingDomainImport: { domainRef: DOMAIN_REF, requestId: 'req-1' },
      readShortDramaProject: async () => project([artifact({ type: 'storyboard' })]),
    });
    await settle();

    expect(imported()).toHaveLength(0);
    expect(warning.mock.calls[0][0]).toBe('infiniteCanvas.domainImport.assetMissing');
  });

  it('says so out loud, and lands nothing, when the picture has no usable path', async () => {
    seed([]);
    await renderPanel({
      pendingDomainImport: { domainRef: DOMAIN_REF, requestId: 'req-1' },
      readShortDramaProject: async () => project([artifact({
        mediaReference: {
          mediaItemId: 'media-1',
          kind: 'image',
          localPath: 'C:/workspace-k3/media/generated/lin-xia.png',
        },
      })]),
    });
    await settle();

    expect(imported()).toHaveLength(0);
    expect(warning.mock.calls[0][0]).toBe('infiniteCanvas.domainImport.unusablePicture');
  });

  it('says so out loud, and lands nothing, when the project cannot be read', async () => {
    seed([]);
    await renderPanel({
      pendingDomainImport: { domainRef: DOMAIN_REF, requestId: 'req-1' },
      readShortDramaProject: async () => undefined,
    });
    await settle();

    expect(imported()).toHaveLength(0);
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it('names the asset on the card once the project has been read', async () => {
    seed([{
      nodeId: 'node-1',
      kind: 'image',
      position: { x: 0, y: 0 },
      mediaRef: { workspacePath: WORKSPACE.workspacePath, relativePath: RELATIVE_PATH },
      domainRef: { ...DOMAIN_REF },
    }]);
    await renderPanel();
    await settle();

    const badge = badges()[0];
    expect(badge?.getAttribute('data-domain-state')).toBe('known');
    expect(badge?.textContent).toContain('CHAR-001');
  });

  it('greys the badge down when the asset is gone, and keeps the card', async () => {
    seed([{
      nodeId: 'node-1',
      kind: 'image',
      position: { x: 0, y: 0 },
      mediaRef: { workspacePath: WORKSPACE.workspacePath, relativePath: RELATIVE_PATH },
      domainRef: { ...DOMAIN_REF },
    }]);
    await renderPanel({ readShortDramaProject: async () => project([]) });
    await settle();

    expect(badges()[0]?.getAttribute('data-domain-state')).toBe('dangling');
    // The user's picture is still theirs.
    expect(persisted().nodes).toHaveLength(1);
    expect(persisted().nodes[0].domainRef).toEqual(DOMAIN_REF);
  });

  it('does not accuse an asset of being gone while the project is still unread', async () => {
    seed([{
      nodeId: 'node-1',
      kind: 'image',
      position: { x: 0, y: 0 },
      mediaRef: { workspacePath: WORKSPACE.workspacePath, relativePath: RELATIVE_PATH },
      domainRef: { ...DOMAIN_REF },
    }]);
    await renderPanel({ readShortDramaProject: async () => undefined });
    await settle();

    expect(badges()[0]?.getAttribute('data-domain-state')).toBe('pending');
  });

  it('leaves an ordinary card unmarked', async () => {
    seed([{
      nodeId: 'node-1',
      kind: 'image',
      position: { x: 0, y: 0 },
      mediaRef: { workspacePath: WORKSPACE.workspacePath, relativePath: RELATIVE_PATH },
    }]);
    await renderPanel();
    await settle();

    expect(badges()).toHaveLength(0);
  });
  /**
   * S11 (K3 §6.2): "whoever owns the data is responsible for generating it".
   *
   * The board's own direct pipeline still draws the picture — no stage agent
   * gained a capability — but a card that owns a short-drama asset ships that
   * asset's coordinates with the request, so the result is filed in the same
   * ledger AssetAI's own generations are.
   */
  describe('generation on a card that owns short-drama data', () => {
    const ownedCard = {
      nodeId: 'node-1',
      kind: 'image' as const,
      position: { x: 0, y: 0 },
      mediaRef: { workspacePath: WORKSPACE.workspacePath, relativePath: RELATIVE_PATH },
      domainRef: { ...DOMAIN_REF },
      prompt: 'warmer light',
    };

    function regenerate(): HTMLButtonElement | null {
      return container.querySelector<HTMLButtonElement>(
        'button[data-node-action="regenerate"]',
      );
    }

    async function pressRegenerate(): Promise<void> {
      const button = regenerate();
      expect(button).not.toBeNull();
      await act(async () => {
        button!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 10));
      });
    }

    it('ships the coordinates of its asset alongside the ordinary request', async () => {
      seed([ownedCard]);
      const invocations: Record<string, unknown>[] = [];
      await renderPanel({ onInvoke: invocation => { invocations.push(invocation); } });
      await settle();
      await pressRegenerate();

      expect(invocations).toHaveLength(1);
      expect(invocations[0].shortDrama).toEqual({
        projectId: 'project-1',
        stage: 'assets',
        artifactId: 'artifact-1',
        artifactHandle: 'CHAR-001',
        outputMediaLabel: 'Generated on the infinite canvas',
      });
      // The card is still the landing place; the second binding is additional.
      expect(invocations[0].resultMode).toBe('self');
      expect(invocations[0].nodeId).toBe('node-1');
    });

    it('sends no coordinates from an ordinary card', async () => {
      seed([{ ...ownedCard, domainRef: undefined }]);
      const invocations: Record<string, unknown>[] = [];
      await renderPanel({ onInvoke: invocation => { invocations.push(invocation); } });
      await settle();
      await pressRegenerate();

      expect(invocations).toHaveLength(1);
      expect('shortDrama' in invocations[0]).toBe(false);
    });

    it('still draws the picture when the asset can no longer be found', async () => {
      // Fail-open, and the only one in K3: the user pressed generate, and an
      // unreadable manifest is no reason to refuse to draw for them. The
      // explicit "send back" button remains, and it fails closed.
      seed([ownedCard]);
      const invocations: Record<string, unknown>[] = [];
      await renderPanel({
        readShortDramaProject: async () => undefined,
        onInvoke: invocation => { invocations.push(invocation); },
      });
      await settle();
      await pressRegenerate();

      expect(invocations).toHaveLength(1);
      expect(invocations[0].shortDrama).toBeUndefined();
    });

    function notice(): string | undefined {
      return container.querySelector<HTMLElement>(
        '.infinite-canvas-panel__tool-notice span',
      )?.textContent ?? undefined;
    }

    /**
     * A5: `attach_short_drama_media_result` reads the first result and files
     * it. Ask for four and the asset would go into review holding a candidate
     * nobody chose, while the other three were still landing on the board.
     *
     * The batch is kept — trying four looks for one character is the work —
     * and the automatic filing is what gives way. The card says so before the
     * press, so nobody pays for four pictures expecting something else.
     */
    it('files a single picture, and says nothing was filed when a batch is asked for', async () => {
      seed([{ ...ownedCard, generationParams: { n: 4 } }]);
      const invocations: Record<string, unknown>[] = [];
      await renderPanel({ onInvoke: invocation => { invocations.push(invocation); } });
      await settle();

      // Before the press: the badge already reads "you will have to send this
      // one back yourself".
      expect(badges()[0]?.getAttribute('data-domain-autofile')).toBe('manual');

      await pressRegenerate();

      expect(invocations).toHaveLength(1);
      expect(invocations[0].shortDrama).toBeUndefined();
      expect(notice()).toBe('infiniteCanvas.domainRef.manualReturn');
    });

    it('keeps the badge plain, and files, on an owned card asking for one picture', async () => {
      seed([{ ...ownedCard, generationParams: { n: 1 } }]);
      const invocations: Record<string, unknown>[] = [];
      await renderPanel({ onInvoke: invocation => { invocations.push(invocation); } });
      await settle();
      await pressRegenerate();

      expect(badges()[0]?.getAttribute('data-domain-autofile')).toBe('auto');
      expect(invocations[0].shortDrama).toBeDefined();
      expect(notice()).toBeUndefined();
    });

    /**
     * C1: this used to be completely invisible. The coordinates failed to
     * resolve, the picture was generated and paid for anyway, and the badge
     * went on reading exactly as it does when the filing WILL happen.
     */
    it('says the picture will stay put when the asset coordinates cannot be read', async () => {
      seed([ownedCard]);
      await renderPanel({ readShortDramaProject: async () => undefined });
      await settle();
      await pressRegenerate();

      expect(notice()).toBe('infiniteCanvas.domainRef.manualReturn');
      // The same weakening A5 uses — one fact, one mark, one sentence.
      expect(badges()[0]?.getAttribute('data-domain-autofile')).toBe('manual');
    });
  });
});
