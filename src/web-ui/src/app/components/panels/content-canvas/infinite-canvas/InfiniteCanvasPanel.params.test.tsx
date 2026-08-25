/**
 * P4 W3 behavior closure: the generation parameter popover.
 *
 * Behavior only — no style or copy assertions. What is pinned here: the
 * popover offers exactly the values the chosen model supports, switching the
 * model clamps whatever the new one cannot do, the choice is written onto the
 * card and survives a remount, and the dispatched request carries it (while a
 * card with no parameters dispatches the pre-P4 request field for field).
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';

import { generateFromCanvasGenerator } from './infiniteCanvasGeneratorDriver.testkit';

// Captured so a test can mirror a card selection into the panel: the bottom
// generator acts on the selected card (visual language §6).
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
            React.createElement(NodeComponent, { id: node.id, data: node.data, selected: false }),
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

import { StylePresetCatalog } from '@/shared/services/style-preset';
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

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACE = { workspaceId: 'workspace-params', workspacePath: 'C:/workspace-p' };
const TEST_CATALOG = new StylePresetCatalog([], []);

const BLANK_IMAGE_CARD: InfiniteCanvasNode = {
  nodeId: 'card-image',
  kind: 'image',
  position: { x: 0, y: 0 },
  prompt: 'a red fox in the snow',
};

const BLANK_VIDEO_CARD: InfiniteCanvasNode = {
  nodeId: 'card-video',
  kind: 'video',
  position: { x: 400, y: 0 },
  prompt: 'slow push in',
};

describe('InfiniteCanvasPanel P4 W3 generation parameters', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let memory: InMemoryInfiniteCanvasPersistence;
  let service: InfiniteCanvasDocumentService;
  let invocations: SessionImageGenerationInvocation[];
  let runtime: { gateway: { invoke: (i: SessionImageGenerationInvocation) => Promise<any> };
    hasTargetSession: () => boolean };

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
    invocations = [];
    runtime = {
      gateway: {
        invoke: async (invocation: SessionImageGenerationInvocation) => {
          invocations.push(invocation);
          return { operationId: invocation.operationId, status: 'succeeded' as const };
        },
      },
      hasTargetSession: () => true,
    };
  });

  afterEach(() => {
    act(() => root.unmount());
    service.dispose();
    vi.unstubAllGlobals();
  });

  function seed(nodes: readonly InfiniteCanvasNode[]): void {
    const document: InfiniteCanvasDocument = {
      documentId: defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId),
      schemaVersion: '1',
      workspaceId: WORKSPACE.workspaceId,
      revision: 1,
      nodes: [...nodes],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: new Date(0).toISOString(),
    };
    memory.files.set(
      infiniteCanvasDocumentFilePath(
        WORKSPACE.workspacePath,
        defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId),
      ),
      JSON.stringify(document),
    );
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
          catalog={TEST_CATALOG}
          generationRuntime={runtime as never}
        />,
      );
    });
  }

  async function openParams(nodeId: string): Promise<void> {
    const trigger = container.querySelector<HTMLButtonElement>(
      `[data-node-id="${nodeId}"] [data-node-action="open-params"]`,
    );
    if (!trigger) throw new Error(`no params entry on ${nodeId}`);
    await act(async () => {
      Simulate.click(trigger);
    });
  }

  function field(name: string): HTMLSelectElement {
    const element = container.querySelector<HTMLSelectElement>(`[data-params-field="${name}"]`);
    if (!element) throw new Error(`params field not found: ${name}`);
    return element;
  }

  function optionsOf(name: string): string[] {
    return Array.from(field(name).options).map(option => option.value);
  }

  async function choose(name: string, value: string): Promise<void> {
    const select = field(name);
    await act(async () => {
      select.value = value;
      Simulate.change(select);
    });
  }

  function nodeOf(nodeId: string): InfiniteCanvasNode | undefined {
    const raw = memory.files.get(infiniteCanvasDocumentFilePath(
      WORKSPACE.workspacePath,
      defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId),
    ));
    const parsed = JSON.parse(raw ?? '{}') as InfiniteCanvasDocument;
    return parsed.nodes?.find(node => node.nodeId === nodeId);
  }

  async function generate(nodeId: string): Promise<void> {
    await generateFromCanvasGenerator(container, flow, nodeId);
  }

  it('offers only the values the chosen model supports, and clamps on a switch', async () => {
    seed([BLANK_IMAGE_CARD]);
    await renderPanel();
    await openParams('card-image');

    // Default model: lower-case resolutions and the gpt-image-2 ratio set.
    expect(optionsOf('resolution')).toEqual(['', '1k', '2k', '4k']);
    expect(optionsOf('aspectRatio')).toContain('9:21');
    expect(optionsOf('aspectRatio')).not.toContain('1:4');

    await choose('resolution', '2k');
    await choose('aspectRatio', '9:21');
    expect(nodeOf('card-image')?.generationParams)
      .toEqual({ size: '9:21', resolution: '2k' });

    // Switching to gemini pro: 9:21 is gone from its ratio list, while `2k`
    // survives as that model's own `2K` spelling (P4 review C7 — letter case
    // is not a reason to lose a setting).
    await choose('model', 'gemini-3-pro-image-preview');
    expect(nodeOf('card-image')?.generationParams)
      .toEqual({ model: 'gemini-3-pro-image-preview', resolution: '2K' });
    expect(optionsOf('resolution')).toEqual(['', '1K', '2K', '4K']);
    expect(optionsOf('aspectRatio')).not.toContain('9:21');
  });

  // P4 review C7: whatever a model switch really cannot keep is named out loud
  // instead of the control quietly snapping back to "provider default".
  it('says which settings a model switch had to drop', async () => {
    seed([BLANK_IMAGE_CARD]);
    await renderPanel();
    await openParams('card-image');
    await choose('model', 'gemini-3.1-flash-image-preview');
    await choose('aspectRatio', '1:4');
    await choose('resolution', '0.5K');
    expect(container.querySelector('[data-params-dropped]')).toBeNull();

    await choose('model', 'gpt-image-2');

    const notice = container.querySelector('[data-params-dropped]');
    expect(notice?.getAttribute('data-params-dropped')).toBe('1:4,0.5K');
    // Nothing survived, so the card carries no parameter set at all.
    expect(nodeOf('card-image')?.generationParams).toBeUndefined();
  });

  it('keeps the card parameters across a remount and sends them on dispatch', async () => {
    seed([BLANK_IMAGE_CARD]);
    await renderPanel();
    await openParams('card-image');
    await choose('model', 'gemini-3.1-flash-image-preview');
    await choose('aspectRatio', '1:4');
    await choose('resolution', '0.5K');

    // Remount against the same persisted document: the choice is on the card.
    await act(async () => root.unmount());
    root = createRoot(container);
    await renderPanel();
    await openParams('card-image');
    expect(field('model').value).toBe('gemini-3.1-flash-image-preview');
    expect(field('aspectRatio').value).toBe('1:4');
    expect(field('resolution').value).toBe('0.5K');

    await generate('card-image');
    expect(invocations).toHaveLength(1);
    expect(invocations[0].generationParams).toEqual({
      model: 'gemini-3.1-flash-image-preview',
      size: '1:4',
      resolution: '0.5K',
    });
  });

  it('sends no parameters at all from a card that never chose any', async () => {
    seed([BLANK_IMAGE_CARD]);
    await renderPanel();

    await generate('card-image');

    expect(invocations).toHaveLength(1);
    expect(invocations[0].generationParams).toBeUndefined();
    expect(nodeOf('card-image')).not.toHaveProperty('generationParams');
  });

  it('offers duration on a video card and no image-only fields', async () => {
    seed([BLANK_VIDEO_CARD]);
    await renderPanel();
    await openParams('card-video');

    expect(optionsOf('duration')).toEqual(['', '4', '6', '8', '10']);
    expect(optionsOf('aspectRatio')).toEqual(['', '16:9', '9:16']);
    expect(optionsOf('resolution')).toEqual(['', '720p', '1080p', '4k']);

    await choose('duration', '8');
    await choose('aspectRatio', '9:16');
    expect(nodeOf('card-video')?.generationParams)
      .toEqual({ aspectRatio: '9:16', duration: 8 });

    await generate('card-video');
    expect(invocations[0].generationParams).toEqual({ aspectRatio: '9:16', duration: 8 });
  });

  it('hides the resolution field for a model that exposes no resolution choice', async () => {
    seed([BLANK_VIDEO_CARD]);
    await renderPanel();
    await openParams('card-video');

    await choose('model', 'kling-v3-omni');

    expect(container.querySelector('[data-params-field="resolution"]')).toBeNull();
    expect(optionsOf('aspectRatio')).toEqual(['', '16:9', '9:16', '1:1']);
  });

  // —— P4 W4: the batch-size selector ——————————————————————————————————————

  it('locks the batch selector to 1 on a model that cannot batch, and says why', async () => {
    seed([BLANK_IMAGE_CARD]);
    await renderPanel();
    await openParams('card-image');

    // gpt-image-2 has n_max = 1 in the Rust capability table.
    expect(optionsOf('count')).toEqual(['1']);
    expect(field('count').disabled).toBe(true);
    expect(container.querySelector('[data-params-hint="count"]')?.textContent)
      .toBe('infiniteCanvas.params.countLocked');
  });

  it('offers up to four images on a batching model and dispatches the choice', async () => {
    seed([BLANK_IMAGE_CARD]);
    await renderPanel();
    await openParams('card-image');

    await choose('model', 'gemini-3-pro-image-preview');
    expect(optionsOf('count')).toEqual(['1', '2', '3', '4']);
    expect(field('count').disabled).toBe(false);
    expect(container.querySelector('[data-params-hint="count"]')?.textContent)
      .toBe('infiniteCanvas.params.countBilling');

    await choose('count', '3');
    expect(nodeOf('card-image')?.generationParams)
      .toEqual({ model: 'gemini-3-pro-image-preview', n: 3 });

    await generate('card-image');
    expect(invocations[0].generationParams)
      .toEqual({ model: 'gemini-3-pro-image-preview', n: 3 });
  });

  it('drops a stored batch size when the card switches to a single-image model', async () => {
    seed([BLANK_IMAGE_CARD]);
    await renderPanel();
    await openParams('card-image');
    await choose('model', 'gemini-3-pro-image-preview');
    await choose('count', '4');

    await choose('model', 'gpt-image-2');

    // Nothing worth persisting is left, so the field goes away entirely.
    expect(nodeOf('card-image')).not.toHaveProperty('generationParams');
    expect(field('count').value).toBe('1');
  });

  it('never offers a batch selector on a video card', async () => {
    seed([BLANK_VIDEO_CARD]);
    await renderPanel();
    await openParams('card-video');

    expect(container.querySelector('[data-params-field="count"]')).toBeNull();
  });

  it('toggles the popover from the card pill and closes it with the close button', async () => {
    seed([BLANK_IMAGE_CARD]);
    await renderPanel();

    await openParams('card-image');
    expect(container.querySelector('.infinite-canvas-picker--params')).not.toBeNull();
    await openParams('card-image');
    expect(container.querySelector('.infinite-canvas-picker--params')).toBeNull();
  });
});
