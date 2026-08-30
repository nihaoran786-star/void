/**
 * P4 W3 behavior closure: the generation parameter and model popovers.
 *
 * Behavior only — no style or copy assertions. What is pinned here: every
 * value the media kind knows is OFFERED, with the ones the chosen model cannot
 * produce greyed out rather than hidden (§7.3-D reverses the earlier "hide
 * them"); switching the model clamps whatever the new one cannot do; the
 * choice is written onto the card and survives a remount; and the dispatched
 * request carries it (while a card with no parameters dispatches the pre-P4
 * request field for field).
 *
 * §7.3-A split the two surfaces: the model lives in its own popover, opened
 * from the generator's model name, so `chooseModel` drives that one and then
 * re-opens the parameters.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';

import {
  generateFromCanvasGenerator,
  openCanvasGeneratorPopover,
} from './infiniteCanvasGeneratorDriver.testkit';

// Captured so a test can mirror a card selection into the panel: the bottom
// generator acts on the selected card (visual language §6).
vi.mock('@xyflow/react', async () => (
  await import('./infiniteCanvasPanel.testkit')
).mockReactFlow());

vi.mock('@/infrastructure/i18n', async () => (
  await import('./infiniteCanvasPanel.testkit')
).mockI18n());

vi.mock('@/shared/services/workspace-media/WorkspaceMediaPreviewResolver', async () => (
  await import('./infiniteCanvasPanel.testkit')
).mockPreviewResolver());

vi.mock('@/shared/services/workspace-media/WorkspaceMediaLibrary', async () => (
  await import('./infiniteCanvasPanel.testkit')
).mockMediaLibrary());

vi.mock('./infiniteCanvasDocumentGateway', async () => (
  await import('./infiniteCanvasPanel.testkit')
).mockDocumentGateway({ omitPorts: ['revealer'] }));

vi.mock('./infiniteCanvasGenerationRuntime', async () => (
  await import('./infiniteCanvasPanel.testkit')
).mockGenerationRuntime());

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
import { canvasFlow } from './infiniteCanvasPanel.testkit';

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

  /**
   * §7.3-A: the model list is its own popover, opened from the generator's
   * model name. Picking closes nothing, so the parameters are re-opened after
   * (which closes the model list — the two are mutually exclusive).
   */
  async function chooseModel(nodeId: string, modelId: string): Promise<void> {
    await openCanvasGeneratorPopover(container, canvasFlow, nodeId, 'model');
    await choose('model', modelId);
  }

  async function reopenParams(nodeId: string): Promise<void> {
    await openParams(nodeId);
  }

  // §7: parameter values are small pill buttons now, not native selects.
  function field(name: string): HTMLElement {
    const element = container.querySelector<HTMLElement>(`[data-params-field="${name}"]`);
    if (!element) throw new Error(`params field not found: ${name}`);
    return element;
  }

  function optionsOf(name: string): string[] {
    return Array.from(field(name).querySelectorAll('[data-params-option]'))
      .map(option => option.getAttribute('data-params-option') ?? '');
  }

  function valueOf(name: string): string {
    return field(name).getAttribute('data-params-value') ?? '';
  }

  function isLocked(name: string): boolean {
    return field(name).getAttribute('data-params-locked') === 'true';
  }

  /** §7.3-D: shown, greyed, unclickable — not missing. */
  function unavailableOf(name: string): string[] {
    return Array.from(field(name).querySelectorAll('[data-params-unavailable="true"]'))
      .map(option => option.getAttribute('data-params-option') ?? '');
  }

  async function choose(name: string, value: string): Promise<void> {
    const option = field(name).querySelector<HTMLButtonElement>(
      `[data-params-option="${value}"]`,
    );
    if (!option) throw new Error(`params option not found: ${name}=${value}`);
    await act(async () => {
      Simulate.click(option);
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
    await generateFromCanvasGenerator(container, canvasFlow, nodeId);
  }

  it('shows every value and greys the ones the chosen model cannot produce', async () => {
    seed([BLANK_IMAGE_CARD]);
    await renderPanel();
    await openParams('card-image');

    // 7.3-D: the union of what image models can do, in one spelling, with
    // gpt-image-2's gaps greyed rather than missing.
    expect(optionsOf('resolution')).toEqual(['', '0.5K', '1K', '2K', '4K']);
    expect(unavailableOf('resolution')).toEqual(['0.5K']);
    expect(optionsOf('aspectRatio')).toContain('9:21');
    expect(optionsOf('aspectRatio')).toContain('1:4');
    expect(unavailableOf('aspectRatio')).toContain('1:4');
    // `auto` leads the ratio row, right after "let the provider decide".
    expect(optionsOf('aspectRatio').slice(0, 2)).toEqual(['', 'auto']);

    await choose('resolution', '2K');
    await choose('aspectRatio', '9:21');
    // The cell carries the shared spelling; the card stores the model's own.
    expect(nodeOf('card-image')?.generationParams)
      .toEqual({ size: '9:21', resolution: '2k' });

    // Switching to gemini pro: 9:21 is gone from its ratio list, while `2k`
    // survives as that model's own `2K` spelling (P4 review C7).
    await chooseModel('card-image', 'gemini-3-pro-image-preview');
    expect(nodeOf('card-image')?.generationParams)
      .toEqual({ model: 'gemini-3-pro-image-preview', resolution: '2K' });

    await reopenParams('card-image');
    expect(optionsOf('resolution')).toEqual(['', '0.5K', '1K', '2K', '4K']);
    expect(unavailableOf('resolution')).toEqual(['0.5K']);
    expect(unavailableOf('aspectRatio')).toContain('9:21');
  });

  // P4 review C7: whatever a model switch really cannot keep is named out loud
  // instead of the control quietly snapping back to "provider default".
  it('says which settings a model switch had to drop', async () => {
    seed([BLANK_IMAGE_CARD]);
    await renderPanel();
    await chooseModel('card-image', 'gemini-3.1-flash-image-preview');
    await reopenParams('card-image');
    await choose('aspectRatio', '1:4');
    await choose('resolution', '0.5K');
    expect(container.querySelector('[data-params-dropped]')).toBeNull();

    await chooseModel('card-image', 'gpt-image-2');

    const notice = container.querySelector('[data-params-dropped]');
    expect(notice?.getAttribute('data-params-dropped')).toBe('1:4,0.5K');
    // Nothing survived, so the card carries no parameter set at all.
    expect(nodeOf('card-image')?.generationParams).toBeUndefined();
  });

  it('keeps the card parameters across a remount and sends them on dispatch', async () => {
    seed([BLANK_IMAGE_CARD]);
    await renderPanel();
    await chooseModel('card-image', 'gemini-3.1-flash-image-preview');
    await reopenParams('card-image');
    await choose('aspectRatio', '1:4');
    await choose('resolution', '0.5K');

    // Remount against the same persisted document: the choice is on the card.
    await act(async () => root.unmount());
    root = createRoot(container);
    await renderPanel();
    await openParams('card-image');
    expect(valueOf('aspectRatio')).toBe('1:4');
    expect(valueOf('resolution')).toBe('0.5K');
    await openCanvasGeneratorPopover(container, canvasFlow, 'card-image', 'model');
    expect(valueOf('model')).toBe('gemini-3.1-flash-image-preview');

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

    // Every duration any video model offers; the ones Omni-Flash-Ext cannot
    // do are greyed, not dropped from the row.
    expect(optionsOf('duration'))
      .toEqual(['', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15']);
    expect(unavailableOf('duration'))
      .toEqual(['3', '5', '7', '9', '11', '12', '13', '14', '15']);
    expect(optionsOf('aspectRatio'))
      .toEqual(['', 'adaptive', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9']);
    expect(unavailableOf('aspectRatio'))
      .toEqual(['adaptive', '1:1', '4:3', '3:4', '21:9']);
    expect(optionsOf('resolution')).toEqual(['', '480P', '720P', '1080P', '4K']);
    expect(unavailableOf('resolution')).toEqual(['480P']);

    await choose('duration', '8');
    await choose('aspectRatio', '9:16');
    expect(nodeOf('card-video')?.generationParams)
      .toEqual({ aspectRatio: '9:16', duration: 8 });

    await generate('card-video');
    expect(invocations[0].generationParams).toEqual({ aspectRatio: '9:16', duration: 8 });
  });

  // 7.3-D reversal: a model with no resolution choice keeps the row, greyed,
  // with the reason underneath. Hiding it read as "this app cannot do that".
  it('greys the whole resolution row for a model that exposes no choice', async () => {
    seed([BLANK_VIDEO_CARD]);
    await renderPanel();
    await chooseModel('card-video', 'kling-v3-omni');
    await reopenParams('card-video');

    expect(container.querySelector('[data-params-field="resolution"]')).not.toBeNull();
    expect(isLocked('resolution')).toBe(true);
    expect(unavailableOf('resolution')).toEqual(['480P', '720P', '1080P', '4K']);
    expect(container.querySelector('[data-params-hint="resolution"]')?.textContent)
      .toBe('infiniteCanvas.params.resolutionLocked');
    expect(unavailableOf('aspectRatio')).toEqual(['adaptive', '4:3', '3:4', '21:9']);
  });

  // —— P4 W4: the batch-size selector ——————————————————————————————————————

  it('locks the batch selector to 1 on a model that cannot batch, and says why', async () => {
    seed([BLANK_IMAGE_CARD]);
    await renderPanel();
    await openParams('card-image');

    // gpt-image-2 has n_max = 1 in the Rust capability table: the larger cells
    // stay on screen, greyed, so the limit is visible.
    expect(optionsOf('count')).toEqual(['1', '2', '3', '4']);
    expect(unavailableOf('count')).toEqual(['2', '3', '4']);
    expect(container.querySelector('[data-params-hint="count"]')?.textContent)
      .toBe('infiniteCanvas.params.countLocked');
  });

  it('offers up to four images on a batching model and dispatches the choice', async () => {
    seed([BLANK_IMAGE_CARD]);
    await renderPanel();
    await openParams('card-image');

    await chooseModel('card-image', 'gemini-3-pro-image-preview');
    await reopenParams('card-image');
    expect(optionsOf('count')).toEqual(['1', '2', '3', '4']);
    expect(unavailableOf('count')).toEqual([]);
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
    await chooseModel('card-image', 'gemini-3-pro-image-preview');
    await reopenParams('card-image');
    await choose('count', '4');

    await chooseModel('card-image', 'gpt-image-2');

    // Nothing worth persisting is left, so the field goes away entirely.
    expect(nodeOf('card-image')).not.toHaveProperty('generationParams');
    await reopenParams('card-image');
    expect(valueOf('count')).toBe('1');
  });

  it('never offers a batch selector on a video card', async () => {
    seed([BLANK_VIDEO_CARD]);
    await renderPanel();
    await openParams('card-video');

    expect(container.querySelector('[data-params-field="count"]')).toBeNull();
  });

  it('toggles the parameter popover from the card pill', async () => {
    seed([BLANK_IMAGE_CARD]);
    await renderPanel();

    await openParams('card-image');
    expect(container.querySelector('.infinite-canvas-picker--params')).not.toBeNull();
    await openParams('card-image');
    expect(container.querySelector('.infinite-canvas-picker--params')).toBeNull();
  });
});
