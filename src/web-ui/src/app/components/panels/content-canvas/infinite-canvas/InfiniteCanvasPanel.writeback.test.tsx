/**
 * S8: the way home, from the board's side.
 *
 * Behaviour only. What is pinned here: the entry exists only on a card that
 * belongs to an asset, one press hands the card's CURRENT picture to the
 * write-back service and nothing else, a second press while the first is in
 * flight is dropped, every refusal is said out loud, and a card whose asset was
 * deleted keeps its entry but cannot press it.
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
const success = vi.fn();
vi.mock('@/shared/notification-system/services/NotificationService', () => ({
  notificationService: {
    warning: (...args: unknown[]) => warning(...args),
    success: (...args: unknown[]) => success(...args),
  },
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

vi.mock('@/shared/services/canvas-short-drama/shortDramaCanvasProjectReader', () => ({
  readShortDramaProjectForCanvas: async () => undefined,
}));

// The real write-back would read and write a manifest; the panel reaches it
// only through this injected seam, and the seam is what these tests observe.
vi.mock('@/shared/services/canvas-short-drama/shortDramaCanvasWriteBack', () => ({
  sendCanvasPictureBackToShortDrama: async () => {
    throw new Error('Tests must inject the write-back service.');
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
import type {
  ShortDramaArtifact,
  ShortDramaProject,
} from '@/shared/services/short-drama/ShortDramaTypes';
import type {
  ShortDramaCanvasWriteBackRequest,
  ShortDramaCanvasWriteBackResult,
} from '@/shared/services/canvas-short-drama/shortDramaCanvasWriteBack';
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

const belongingCard: InfiniteCanvasNode = {
  nodeId: 'node-owned',
  kind: 'image',
  position: { x: 0, y: 0 },
  mediaRef: { workspacePath: WORKSPACE.workspacePath, relativePath: RELATIVE_PATH },
  domainRef: { ...DOMAIN_REF },
};

const plainCard: InfiniteCanvasNode = {
  nodeId: 'node-plain',
  kind: 'image',
  position: { x: 400, y: 0 },
  mediaRef: { workspacePath: WORKSPACE.workspacePath, relativePath: 'media/generated/b/other-1.png' },
};

describe('InfiniteCanvasPanel K3 send back to short drama', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let memory: InMemoryInfiniteCanvasPersistence;
  let service: InfiniteCanvasDocumentService;
  let requests: ShortDramaCanvasWriteBackRequest[];

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
    requests = [];
    warning.mockReset();
    success.mockReset();
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
    readShortDramaProject?: () => Promise<ShortDramaProject | undefined>;
    send?: (
      request: ShortDramaCanvasWriteBackRequest,
    ) => Promise<ShortDramaCanvasWriteBackResult>;
  } = {}): Promise<void> {
    const read = options.readShortDramaProject ?? (async () => project());
    const send = options.send ?? (async () => ({
      status: 'sent' as const,
      artifactId: 'artifact-1',
      mediaItemId: 'batch-1-1',
      alreadyRecorded: false,
    }));
    await act(async () => {
      root.render(
        <InfiniteCanvasPanel
          workspaceId={WORKSPACE.workspaceId}
          workspacePath={WORKSPACE.workspacePath}
          isActive
          service={service}
          readShortDramaProject={read}
          sendPictureBackToShortDrama={request => {
            requests.push(request);
            return send(request);
          }}
          resolvePreviewUrl={async () => 'data:image/png;base64,AAAA'}
          mediaEventBus={createFakeEventBus()}
          generationRuntime={{
            gateway: { invoke: async () => ({ operationId: 'x', status: 'succeeded' as const }) },
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

  function sendButtons(): HTMLButtonElement[] {
    return Array.from(container.querySelectorAll<HTMLButtonElement>(
      'button[data-node-action="send-to-short-drama"]',
    ));
  }

  async function press(button: HTMLButtonElement): Promise<void> {
    await act(async () => {
      button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }

  it('offers the way home only on a card that belongs to an asset', async () => {
    seed([belongingCard, plainCard]);
    await renderPanel();
    await settle();

    expect(sendButtons()).toHaveLength(1);
    expect(sendButtons()[0].closest('[data-node-id]')?.getAttribute('data-node-id'))
      .toBe('node-owned');
  });

  it('hands over the card the user pressed and the picture it holds now', async () => {
    seed([belongingCard]);
    await renderPanel();
    await settle();
    await press(sendButtons()[0]);

    expect(requests).toEqual([{
      domainRef: { ...DOMAIN_REF },
      mediaRef: { workspacePath: WORKSPACE.workspacePath, relativePath: RELATIVE_PATH },
      canvasNodeId: 'node-owned',
      workspacePath: WORKSPACE.workspacePath,
      backend: 'local',
    }]);
    expect(success).toHaveBeenCalledTimes(1);
    expect(warning).not.toHaveBeenCalled();
  });

  it('leaves the canvas document untouched — this writes short drama, not the board', async () => {
    seed([belongingCard]);
    await renderPanel();
    await settle();
    const before = memory.files.get(documentPath());
    await press(sendButtons()[0]);

    expect(memory.files.get(documentPath())).toBe(before);
  });

  it('drops a second press while the first is still in flight', async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>(resolve => { release = resolve; });
    seed([belongingCard]);
    await renderPanel({
      send: async () => {
        await pending;
        return {
          status: 'sent' as const,
          artifactId: 'artifact-1',
          mediaItemId: 'batch-1-1',
          alreadyRecorded: false,
        };
      },
    });
    await settle();

    const button = sendButtons()[0];
    await act(async () => {
      button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 5));
    });
    expect(requests).toHaveLength(1);
    expect(sendButtons()[0].disabled).toBe(true);

    await act(async () => {
      release?.();
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    expect(sendButtons()[0].disabled).toBe(false);
  });

  it.each([
    ['remote-workspace', 'infiniteCanvas.writeBack.refused.remoteWorkspace'],
    ['foreign-workspace', 'infiniteCanvas.writeBack.refused.foreignWorkspace'],
    ['project-unreadable', 'infiniteCanvas.writeBack.refused.projectUnreadable'],
    ['asset-missing', 'infiniteCanvas.writeBack.refused.assetMissing'],
    ['unusable-picture', 'infiniteCanvas.writeBack.refused.unusablePicture'],
    ['save-failed', 'infiniteCanvas.writeBack.refused.saveFailed'],
  ] as const)('says out loud when the send is refused: %s', async (reason, key) => {
    seed([belongingCard]);
    await renderPanel({ send: async () => ({ status: 'refused' as const, reason }) });
    await settle();
    await press(sendButtons()[0]);

    expect(warning).toHaveBeenCalledWith(key, expect.anything());
    expect(success).not.toHaveBeenCalled();
  });

  it('says so rather than hanging when the service itself throws', async () => {
    seed([belongingCard]);
    await renderPanel({ send: async () => { throw new Error('boom'); } });
    await settle();
    await press(sendButtons()[0]);

    expect(warning).toHaveBeenCalledWith(
      'infiniteCanvas.writeBack.refused.saveFailed',
      expect.anything(),
    );
    expect(sendButtons()[0].disabled).toBe(false);
  });

  it('marks the badge as waiting for review once the picture is home', async () => {
    seed([belongingCard]);
    let status: ShortDramaArtifact['status'] = 'ready';
    await renderPanel({
      readShortDramaProject: async () => project([artifact({ status })]),
      send: async () => {
        status = 'reviewing';
        return {
          status: 'sent' as const,
          artifactId: 'artifact-1',
          mediaItemId: 'batch-1-1',
          alreadyRecorded: false,
        };
      },
    });
    await settle();
    const badge = () => container.querySelector<HTMLElement>(
      '[data-testid="infinite-canvas-domain-badge"]',
    );
    expect(badge()?.getAttribute('data-domain-reviewing')).toBeNull();

    await press(sendButtons()[0]);
    await settle();

    expect(badge()?.getAttribute('data-domain-reviewing')).toBe('true');
  });

  it('keeps the entry but disables it when the asset was deleted', async () => {
    seed([belongingCard]);
    await renderPanel({ readShortDramaProject: async () => project([]) });
    await settle();

    const button = sendButtons()[0];
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('data-domain-dangling')).toBe('true');
    // The picture is still the user's: the card and its reference stay.
    const persisted = JSON.parse(memory.files.get(documentPath())!) as InfiniteCanvasDocument;
    expect(persisted.nodes[0].domainRef).toEqual({ ...DOMAIN_REF });
  });
});
