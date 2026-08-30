/**
 * P5 W2/W4 panel closure: crop and the mask (red-mark) lane.
 *
 * The invariants under test are the expensive ones:
 *
 * - the SOURCE card is never modified by either feature, field for field;
 * - a crop lands its file before the document is touched, and the derived card
 *   is finished the moment it appears;
 * - the mask lane writes the composite BEFORE it submits, submits exactly one
 *   scratch path, and submits nothing at all if the write failed;
 * - the scratch path is nowhere near the four media-library scan roots.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';

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

// Deliberately NOT exporting the P5 ports. Two things ride on that: an
// injected port is never resolved through the module (so no test can reach a
// real Tauri command by accident), and a panel test written before a port
// existed keeps working instead of crashing on the missing export.
vi.mock('./infiniteCanvasDocumentGateway', async () => (
  await import('./infiniteCanvasPanel.testkit')
).mockDocumentGateway({ omitPorts: ['saver', 'revealer'] }));

vi.mock('./infiniteCanvasGenerationRuntime', async () => (
  await import('./infiniteCanvasPanel.testkit')
).mockGenerationRuntime());

import { StylePresetCatalog } from '@/shared/services/style-preset';
import {
  createInMemoryInfiniteCanvasPersistence,
  defaultInfiniteCanvasDocumentId,
  hasUnfilledInstructionPlaceholder,
  infiniteCanvasDocumentFilePath,
  InfiniteCanvasDocumentService,
  type InfiniteCanvasDocument,
  type InMemoryInfiniteCanvasPersistence,
} from '@/shared/services/infinite-canvas';
import {
  CANVAS_CROP_PREFIX,
  CANVAS_SCRATCH_PREFIX,
} from './infiniteCanvasImageRaster';
import { InfiniteCanvasPanel } from './InfiniteCanvasPanel';
import {
  clearSelection,
  dragNode,
  resetCanvasFlow,
  selectNodes,
} from './infiniteCanvasPanel.testkit';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACE = { workspaceId: 'workspace-a', workspacePath: 'C:/workspace-a' };
const TEST_CATALOG = new StylePresetCatalog([], []);
const PNG_DATA_URL = 'data:image/png;base64,QUJD';

const IMAGE_NODE = {
  nodeId: 'n-image',
  kind: 'image' as const,
  position: { x: 0, y: 0 },
  size: { width: 240, height: 240 },
  prompt: 'a cat on a bench',
  mediaRef: {
    workspacePath: WORKSPACE.workspacePath,
    relativePath: 'media/generated/b1/image-001.png',
  },
};

function documentPath(): string {
  return infiniteCanvasDocumentFilePath(
    WORKSPACE.workspacePath,
    defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId),
  );
}

function seedDocument(
  memory: InMemoryInfiniteCanvasPersistence,
  overrides: Partial<InfiniteCanvasDocument> = {},
): void {
  memory.files.set(documentPath(), JSON.stringify({
    documentId: defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId),
    schemaVersion: '1',
    workspaceId: WORKSPACE.workspaceId,
    revision: 1,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  }));
}

function readDocument(memory: InMemoryInfiniteCanvasPersistence): InfiniteCanvasDocument {
  const raw = memory.files.get(documentPath());
  expect(raw).toBeDefined();
  return JSON.parse(raw!) as InfiniteCanvasDocument;
}

function installCanvasStub(dom: JSDOM): void {
  dom.window.HTMLCanvasElement.prototype.getContext = (() => ({
    canvas: null,
    lineCap: 'butt',
    lineJoin: 'miter',
    lineWidth: 1,
    fillStyle: '',
    strokeStyle: '',
    globalCompositeOperation: 'source-over',
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    stroke: () => undefined,
    fillRect: () => undefined,
    strokeRect: () => undefined,
    clearRect: () => undefined,
    drawImage: () => undefined,
    putImageData: () => undefined,
    getImageData: () => (
      { data: new Uint8ClampedArray(4), width: 1, height: 1 } as unknown as ImageData
    ),
  })) as never;
  dom.window.HTMLCanvasElement.prototype.toDataURL = (() => (
    'data:image/png;base64,UEFZTE9BRA=='
  )) as never;
}

describe('InfiniteCanvasPanel P5 crop and mask', () => {
  const stubRuntime = {
    gateway: {
      invoke: vi.fn(async (invocation: { operationId: string }) => ({
        operationId: invocation.operationId,
        status: 'succeeded' as const,
      })),
    },
    hasTargetSession: () => true,
  };

  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let memory: InMemoryInfiniteCanvasPersistence;
  let service: InfiniteCanvasDocumentService;
  let writeCanvasImage: ReturnType<typeof vi.fn>;
  let pruneCanvasScratch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
    vi.stubGlobal('Blob', dom.window.Blob);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => (
      { width: 1000, height: 500, close: () => undefined } as unknown as ImageBitmap
    )));
    installCanvasStub(dom);

    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
    memory = createInMemoryInfiniteCanvasPersistence();
    service = new InfiniteCanvasDocumentService(memory.port, { debounceMs: 1 });
    writeCanvasImage = vi.fn(async (request: { relativePath: string }) => ({
      status: 'written' as const,
      relativePath: request.relativePath,
      bytesWritten: 128,
    }));
    pruneCanvasScratch = vi.fn(async () => undefined);
    resetCanvasFlow();
    stubRuntime.gateway.invoke.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    service.dispose();
    vi.unstubAllGlobals();
  });

  async function renderPanel(
    props: Partial<React.ComponentProps<typeof InfiniteCanvasPanel>> = {},
  ) {
    await act(async () => {
      root.render(
        <InfiniteCanvasPanel
          workspaceId={WORKSPACE.workspaceId}
          workspacePath={WORKSPACE.workspacePath}
          isActive
          service={service}
          resolvePreviewUrl={async () => PNG_DATA_URL}
          catalog={TEST_CATALOG}
          generationRuntime={stubRuntime}
          writeCanvasImage={writeCanvasImage}
          pruneCanvasScratch={pruneCanvasScratch}
          {...props}
        />,
      );
    });
  }

  /** Opens an editor and lets the preview resolve and the bitmap decode. */
  async function openEditor(selector: string) {
    await act(async () => {
      container.querySelector(selector)!
        .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
  }

  it('sweeps the scratch directory once when the board opens', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();

    expect(pruneCanvasScratch).toHaveBeenCalledTimes(1);
    expect(pruneCanvasScratch).toHaveBeenCalledWith({
      workspacePath: WORKSPACE.workspacePath,
    });
  });

  it('offers crop only on a card that carries a picture', async () => {
    seedDocument(memory, {
      nodes: [IMAGE_NODE, { nodeId: 'n-blank', kind: 'image', position: { x: 400, y: 0 } }],
    });
    await renderPanel();

    const cards = Array.from(container.querySelectorAll('[data-node-id]'));
    const withMedia = cards.find(card => card.getAttribute('data-node-id') === 'n-image')!;
    const blank = cards.find(card => card.getAttribute('data-node-id') === 'n-blank')!;
    expect(withMedia.querySelector('[data-node-action="crop"]')).not.toBeNull();
    expect(blank.querySelector('[data-node-action="crop"]')).toBeNull();
  });

  it('crops into a finished derived card without touching the source', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await openEditor('[data-node-action="crop"]');

    expect(container.querySelector('[data-canvas-editor="crop"]')).not.toBeNull();
    await act(async () => {
      Simulate.click(container.querySelector('[data-canvas-frame-action="confirm"]')!);
    });
    await act(async () => { await Promise.resolve(); });

    // 1. The bytes land first, in the allowlisted crop directory.
    expect(writeCanvasImage).toHaveBeenCalledTimes(1);
    const write = writeCanvasImage.mock.calls[0][0];
    expect(write.workspacePath).toBe(WORKSPACE.workspacePath);
    expect(write.relativePath.startsWith(CANVAS_CROP_PREFIX)).toBe(true);
    expect(write.relativePath.endsWith('.png')).toBe(true);
    expect(write.base64Png).toBe('UEFZTE9BRA==');
    expect(write.base64Png.startsWith('data:')).toBe(false);

    // 2. Nothing was submitted anywhere: crop is a local operation.
    expect(stubRuntime.gateway.invoke).not.toHaveBeenCalled();

    await service.flushPendingWrites();
    const persisted = readDocument(memory);
    const source = persisted.nodes.find(node => node.nodeId === 'n-image')!;
    const derived = persisted.nodes.find(node => node.nodeId !== 'n-image')!;

    // 3. The source card is untouched, field for field.
    expect(source).toEqual(IMAGE_NODE);
    // 4. The derived card is finished on arrival — never a pending crop card.
    expect(derived.mediaRef).toEqual({
      workspacePath: WORKSPACE.workspacePath,
      relativePath: write.relativePath,
    });
    expect(derived.derivedFrom).toMatchObject({ sourceNodeId: 'n-image', toolId: 'crop' });
    expect(derived).not.toHaveProperty('generation');
    expect(persisted.edges).toHaveLength(1);
    expect(persisted.edges[0]).toMatchObject({
      sourceNodeId: 'n-image',
      targetNodeId: derived.nodeId,
    });
  });

  it('changes nothing at all when the crop file cannot be written', async () => {
    writeCanvasImage.mockResolvedValue({ status: 'path_denied', message: 'nope' });
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await openEditor('[data-node-action="crop"]');
    await act(async () => {
      Simulate.click(container.querySelector('[data-canvas-frame-action="confirm"]')!);
    });
    await act(async () => { await Promise.resolve(); });

    await service.flushPendingWrites();
    // No half-made card pointing at a file that does not exist.
    expect(readDocument(memory).nodes).toHaveLength(1);
    const notice = container.querySelector('.infinite-canvas-panel__tool-notice');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toContain('infiniteCanvas.crop.writeDenied');
  });

  /**
   * P5 review P11: every non-`written` status used to collapse into one
   * "saving failed, retry" line. `invalid_input` is what the command reports
   * for a payload it will not take — in practice a picture too large — and
   * telling someone to retry something that can never work is worse than
   * saying nothing.
   */
  it('names "too large" separately from a backend write failure', async () => {
    for (const [status, key] of [
      ['invalid_input', 'infiniteCanvas.crop.writeTooLarge'],
      ['backend', 'infiniteCanvas.crop.writeFailed'],
    ] as const) {
      writeCanvasImage.mockResolvedValue({ status, message: 'nope' });
      seedDocument(memory, { nodes: [IMAGE_NODE] });
      await renderPanel();
      await openEditor('[data-node-action="crop"]');
      await act(async () => {
        Simulate.click(container.querySelector('[data-canvas-frame-action="confirm"]')!);
      });
      await act(async () => { await Promise.resolve(); });

      const notice = container.querySelector('.infinite-canvas-panel__tool-notice');
      expect(notice!.textContent, `wrong copy for ${status}`).toContain(key);
      expect(readDocument(memory).nodes).toHaveLength(1);

      await act(async () => root.unmount());
      root = createRoot(container);
    }
  });

  it('names "too large" separately on the mask lane too, and spends nothing', async () => {
    writeCanvasImage.mockResolvedValue({ status: 'invalid_input', message: 'too big' });
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await runMaskFlow();

    const notice = container.querySelector('.infinite-canvas-panel__tool-notice');
    expect(notice!.textContent).toContain('infiniteCanvas.mask.writeTooLarge');
    expect(stubRuntime.gateway.invoke).not.toHaveBeenCalled();
  });

  /**
   * P5 review P12: the bytes are on disk before the document is touched. If
   * the source card vanished in between, `beginDerivedOperationContent` grows
   * nothing and the crop became a file with no card — silently.
   */
  it('says so instead of leaving an orphan file when the source card is gone', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await openEditor('[data-node-action="crop"]');

    // The source card disappears while the editor is open (a delete, an agent
    // op, another window) — the editor is holding its own copy of the picture.
    await act(async () => {
      await service.mutateDefaultDocument(
        { workspaceId: WORKSPACE.workspaceId, workspacePath: WORKSPACE.workspacePath },
        current => ({ ...current, nodes: [], edges: [] }),
      );
    });

    await act(async () => {
      Simulate.click(container.querySelector('[data-canvas-frame-action="confirm"]')!);
    });
    await act(async () => { await Promise.resolve(); });
    await service.flushPendingWrites();

    // The file was written — that is the whole reason this needs saying.
    expect(writeCanvasImage).toHaveBeenCalledTimes(1);
    expect(readDocument(memory).nodes).toHaveLength(0);
    const notice = container.querySelector('.infinite-canvas-panel__tool-notice');
    expect(notice!.textContent).toContain('infiniteCanvas.crop.cardMissing');
  });

  it('opens the mask editor for inpaint instead of a dialog', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await openEditor('[data-tool-id="inpaint"]');

    expect(container.querySelector('[data-canvas-editor="mask"]')).not.toBeNull();
    expect(container.querySelector('.infinite-canvas-dialog[data-tool-id]')).toBeNull();
  });

  /**
   * §7.4.3 (owner 2026-08-28: "所有的输入框都是共用的"). The completion dialog
   * is gone from the product, not merely bypassed: the remaining two tools
   * write their instruction into the card's OWN input box and stop there.
   */
  it('writes the remaining tools straight into the shared input, with no dialog anywhere', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await openEditor('[data-tool-id="upscale"]');

    expect(container.querySelector('[data-canvas-editor="mask"]')).toBeNull();
    expect(container.querySelector('[data-canvas-editor="expand"]')).toBeNull();
    // No completion layer, under any selector it ever rendered with.
    expect(container.querySelector('.infinite-canvas-dialog[data-tool-id]')).toBeNull();
    expect(container.querySelector('.infinite-canvas-dialog__confirm')).toBeNull();

    // Exactly one place to type on the whole board, and the instruction is in
    // it, placeholder intact so it can be edited where it stands.
    const fields = container.querySelectorAll('[data-canvas-generator-field="prompt"]');
    expect(fields).toHaveLength(1);
    expect((fields[0] as HTMLTextAreaElement).value).toContain('【target resolution】');

    // The send button is parked while a 【】 is outstanding — and it says why,
    // on the input's own short grey line rather than in a window.
    const send = container.querySelector(
      '[data-canvas-generator-action="send"]',
    ) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(container.querySelector('[data-canvas-generator-note="true"]')
      ?.getAttribute('data-blocked-reason')).toBe('placeholder');
  });

  /**
   * Adversarial review C3: pressing a tool must not eat the user's prompt.
   *
   * The template used to be committed straight into the card's `prompt` and
   * saved, so the sentence the user had written was gone for good — walking
   * away did not bring it back, and the card was left carrying a 【】 template
   * as its prompt.
   */
  it('never saves a prefilled tool instruction onto the card', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await openEditor('[data-node-id="n-image"] [data-tool-id="upscale"]');

    const field = () => container.querySelector<HTMLTextAreaElement>(
      '[data-canvas-generator-field="prompt"]',
    );
    expect(field()!.value).toContain('【target resolution】');

    // The document still holds what the user wrote, not the template.
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0].prompt).toBe('a cat on a bench');

    // Editing the instruction, then walking away without sending, is a
    // cancel: the card's own prompt comes straight back into the box.
    await act(async () => {
      Simulate.change(field()!, { target: { value: 'Upscale this image to 4K.' } } as never);
    });
    await clearSelection();
    await selectNodes(['n-image']);
    expect(field()!.value).toBe('a cat on a bench');

    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0].prompt).toBe('a cat on a bench');

    // And the next plain send spends money on the user's prompt, never on the
    // abandoned template.
    await act(async () => {
      Simulate.click(container.querySelector('[data-canvas-generator-action="send"]')!);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(stubRuntime.gateway.invoke).toHaveBeenCalledTimes(1);
    const invocation = stubRuntime.gateway.invoke.mock.calls[0][0] as any;
    expect(invocation.kind).toBe('generate');
    expect(invocation.prompt).toContain('a cat on a bench');
    expect(invocation.prompt).not.toContain('【');
  });

  /**
   * C3, second half: an untouched template can never be dispatched at all —
   * the round button stays parked while a 【】 is outstanding, so there is no
   * way to pay for the template itself.
   */
  it('refuses to send an untouched tool template', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await openEditor('[data-node-id="n-image"] [data-tool-id="matting"]');

    const send = container.querySelector<HTMLButtonElement>(
      '[data-canvas-generator-action="send"]',
    )!;
    expect(send.disabled).toBe(true);
    await act(async () => {
      Simulate.click(send);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(stubRuntime.gateway.invoke).not.toHaveBeenCalled();
  });

  /**
   * §7.4.3: the pending instruction belongs to the card it was written into.
   * Look at another card and the intent goes with the box it lived in — the
   * next round send must be an ordinary generation, not an inherited tool.
   */
  it('drops a pending tool instruction when the selection moves on', async () => {
    const other = { ...IMAGE_NODE, nodeId: 'n-other', prompt: 'a dog', mediaRef: undefined };
    seedDocument(memory, { nodes: [IMAGE_NODE, other] });
    await renderPanel();
    await openEditor('[data-node-id="n-image"] [data-tool-id="upscale"]');

    await selectNodes(['n-other']);
    await act(async () => {
      Simulate.click(container.querySelector('[data-canvas-generator-action="send"]')!);
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // One dispatch, and it is that card's own generation — not an upscale of
    // the picture the user walked away from.
    expect(stubRuntime.gateway.invoke).toHaveBeenCalledTimes(1);
    const invocation = stubRuntime.gateway.invoke.mock.calls[0][0] as any;
    expect(invocation.kind).toBe('generate');
    expect(invocation.nodeId).toBe('n-other');
  });

  /**
   * P6: the "more" drawer's outpainting entry is still there, and it now opens
   * the third board-filling editor rather than a sentence about a direction.
   */
  it('opens the expand editor from the "more" drawer', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await openEditor('[data-node-action="more"]');
    await openEditor('[data-tool-id="expand"]');

    expect(container.querySelector('[data-canvas-editor="expand"]')).not.toBeNull();
    expect(container.querySelector('.infinite-canvas-dialog[data-tool-id]')).toBeNull();
    // Nothing is dispatched by opening it, and the source card is untouched.
    expect(readDocument(memory).nodes).toHaveLength(1);
  });

  /**
   * Adversarial review C4: Escape closes ONE thing.
   *
   * Every mounted surface used to see the same Escape, so a parameter popover
   * opened inside the outpainting editor took the editor down with it — and a
   * frame that had been dragged for a minute vanished with no warning and no
   * way back.
   */
  it('closes only the top surface on Escape inside the expand editor', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await openEditor('[data-node-action="more"]');
    await openEditor('[data-tool-id="expand"]');
    expect(container.querySelector('[data-canvas-editor="expand"]')).not.toBeNull();

    // The editor's own shared input opens the ordinary canvas popovers.
    await openEditor('[data-canvas-generator-action="params"]');
    expect(container.querySelector('[data-canvas-popover="params"]')).not.toBeNull();

    const pressEscape = async () => {
      await act(async () => {
        dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }));
        await new Promise(resolve => setTimeout(resolve, 0));
      });
    };

    await pressEscape();
    expect(container.querySelector('[data-canvas-popover="params"]')).toBeNull();
    // The editor — and the frame the user dragged — is still standing.
    expect(container.querySelector('[data-canvas-editor="expand"]')).not.toBeNull();

    await pressEscape();
    expect(container.querySelector('[data-canvas-editor="expand"]')).toBeNull();
  });

  /**
   * P6: the outpainting flow, end to end through the panel.
   *
   * Same shape as `runMaskFlow` on purpose — that is the point of the lane:
   * open the editor, change the picture that will travel, press the SHARED
   * generator's round send button.
   */
  async function runExpandFlow(dx = 200, dy = 0) {
    await openEditor('[data-node-action="more"]');
    await openEditor('[data-tool-id="expand"]');
    const grip = container.querySelector('[data-canvas-frame-handle="e"]')!;
    act(() => {
      Simulate.mouseDown(grip, { clientX: 0, clientY: 0 } as never);
    });
    act(() => {
      // getBoundingClientRect is all zeros under JSDOM, so client pixels map
      // 1:1 onto natural ones.
      Simulate.mouseMove(
        container.querySelector('[data-canvas-frame-stage="true"]')!,
        { clientX: dx, clientY: dy } as never,
      );
    });
    await act(async () => {
      Simulate.click(container.querySelector('[data-canvas-generator-action="send"]')!);
    });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
  }

  /**
   * §7.4.4 (owner 2026-08-28: "然后下面再打字"): the outpainting editor mounts
   * the shared generator WHOLE — writing area included — so the user can
   * describe the room being added. The bottom row — model, parameters, count,
   * round send — is untouched, and the send button is the confirm.
   */
  it('mounts the shared generator with its prompt area and a parked send', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await openEditor('[data-node-action="more"]');
    await openEditor('[data-tool-id="expand"]');

    const generator = container.querySelector('[data-canvas-generator="root"]')!;
    expect(generator.getAttribute('data-canvas-generator-surface')).toBe('editor');
    expect(generator.getAttribute('data-canvas-generator-prompt')).toBe('open');
    const field = generator.querySelector<HTMLTextAreaElement>(
      '[data-canvas-generator-field="prompt"]',
    );
    expect(field).not.toBeNull();
    // It opens empty: this sentence is about what to ADD, not the sentence
    // that made the picture in the first place.
    expect(field!.value).toBe('');
    // The bottom row is the board's own, unchanged.
    expect(generator.querySelector('[data-canvas-generator-action="model"]')).not.toBeNull();
    expect(generator.querySelector('[data-canvas-generator-action="params"]')).not.toBeNull();
    expect(generator.querySelector('[data-canvas-generator-action="count"]')).not.toBeNull();

    // Nothing has been dragged yet, so there is nothing to expand into and the
    // send button says so rather than sending an unchanged picture.
    const send = generator
      .querySelector('[data-canvas-generator-action="send"]') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(container.querySelector('[data-canvas-generator-note="true"]')
      ?.getAttribute('data-blocked-reason')).toBe('frame');
  });

  /**
   * Adversarial review P7: two presses in one tick were two paid submissions.
   *
   * Each confirm read its request out of React state and cleared it, but a
   * second call before the next render still saw the old value — so a double
   * click wrote the composite twice and billed the user twice for one frame.
   */
  it('bills one outpainting for a double press of the send button', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await openEditor('[data-node-action="more"]');
    await openEditor('[data-tool-id="expand"]');
    act(() => {
      Simulate.mouseDown(
        container.querySelector('[data-canvas-frame-handle="e"]')!,
        { clientX: 0, clientY: 0 } as never,
      );
    });
    act(() => {
      Simulate.mouseMove(
        container.querySelector('[data-canvas-frame-stage="true"]')!,
        { clientX: 200, clientY: 0 } as never,
      );
    });

    const send = container.querySelector('[data-canvas-generator-action="send"]')!;
    await act(async () => {
      // Both presses land before React can re-render the editor away.
      Simulate.click(send);
      Simulate.click(send);
    });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(writeCanvasImage).toHaveBeenCalledTimes(1);
    expect(stubRuntime.gateway.invoke).toHaveBeenCalledTimes(1);
  });

  it('writes the outpainting composite to scratch and submits it once', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await runExpandFlow();

    // 1. The bytes land first, in the scratch directory — outside every
    //    media-library scan root — and under this lane's own file name.
    expect(writeCanvasImage).toHaveBeenCalledTimes(1);
    const write = writeCanvasImage.mock.calls[0][0];
    expect(write.relativePath.startsWith(CANVAS_SCRATCH_PREFIX)).toBe(true);
    expect(write.relativePath.endsWith('-expand.png')).toBe(true);
    expect(write.base64Png).toBe('UEFZTE9BRA==');
    expect(write.base64Png.startsWith('data:')).toBe(false);

    // 2. Exactly one submission, through the same gateway every other lane
    //    uses, with the composite as the edit target and no other references.
    expect(stubRuntime.gateway.invoke).toHaveBeenCalledTimes(1);
    const invocation = stubRuntime.gateway.invoke.mock.calls[0][0] as any;
    expect(invocation).toMatchObject({
      kind: 'expand',
      resultMode: 'derived',
      sourceNodeId: 'n-image',
      references: [],
      editTargetMediaRef: {
        workspacePath: WORKSPACE.workspacePath,
        relativePath: write.relativePath,
      },
    });
    // The instruction is the existing template with its placeholders filled
    // from the frame, behind the directive explaining the transparent margin.
    expect(invocation.prompt).toContain('infiniteCanvas.expand.directive');
    expect(invocation.prompt).toContain('the right');
    expect(hasUnfilledInstructionPlaceholder(invocation.prompt)).toBe(false);

    await service.flushPendingWrites();
    const persisted = readDocument(memory);
    // 3. The source card is untouched, field for field — mediaRef included.
    expect(persisted.nodes.find(node => node.nodeId === 'n-image')).toEqual(IMAGE_NODE);
    // 4. A new derived card, pending, pointing back at the source.
    const derived = persisted.nodes.find(node => node.nodeId !== 'n-image')!;
    expect(derived.derivedFrom).toMatchObject({ sourceNodeId: 'n-image', toolId: 'expand' });
    expect(derived.mediaRef).toBeUndefined();
    expect(derived.generation).toMatchObject({ status: 'pending', toolId: 'expand' });
  });

  /**
   * §7.4.4: what the user types underneath describes the new room, and it
   * travels through the SAME assembler and the SAME gateway call — an extra
   * sentence, not an extra lane. Leaving it empty is still a valid send, which
   * every other test in this block already exercises.
   */
  it('carries the sentence written under the frame into the same submission', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await openEditor('[data-node-action="more"]');
    await openEditor('[data-tool-id="expand"]');

    const grip = container.querySelector('[data-canvas-frame-handle="e"]')!;
    act(() => {
      Simulate.mouseDown(grip, { clientX: 0, clientY: 0 } as never);
    });
    act(() => {
      Simulate.mouseMove(
        container.querySelector('[data-canvas-frame-stage="true"]')!,
        { clientX: 200, clientY: 0 } as never,
      );
    });
    act(() => {
      Simulate.change(
        container.querySelector('[data-canvas-generator-field="prompt"]')!,
        { target: { value: 'a long empty pier going out to sea' } } as never,
      );
    });
    await act(async () => {
      Simulate.click(container.querySelector('[data-canvas-generator-action="send"]')!);
    });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(stubRuntime.gateway.invoke).toHaveBeenCalledTimes(1);
    const invocation = stubRuntime.gateway.invoke.mock.calls[0][0] as any;
    expect(invocation.kind).toBe('expand');
    expect(invocation.prompt).toContain('a long empty pier going out to sea');
    // Still the one directive-then-template shape, with nothing left unfilled.
    expect(invocation.prompt).toContain('infiniteCanvas.expand.directive');
    expect(invocation.prompt).toContain('the right');
    expect(hasUnfilledInstructionPlaceholder(invocation.prompt)).toBe(false);
  });

  it('submits nothing when the outpainting composite cannot be written', async () => {
    writeCanvasImage.mockResolvedValue({ status: 'invalid_input', message: 'too big' });
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await runExpandFlow();

    // A failed write must never reach a paid submission (the money rule).
    expect(writeCanvasImage).toHaveBeenCalledTimes(1);
    expect(stubRuntime.gateway.invoke).not.toHaveBeenCalled();
    // The 32 MB ceiling arrives as a typed `invalid_input`, and it says so in
    // words rather than blaming the backend.
    expect(container.querySelector('.infinite-canvas-panel__tool-notice')!.textContent)
      .toContain('infiniteCanvas.expand.writeTooLarge');

    await service.flushPendingWrites();
    const persisted = readDocument(memory);
    expect(persisted.nodes).toHaveLength(1);
    expect(persisted.nodes[0]).toEqual(IMAGE_NODE);
  });

  async function runMaskFlow() {
    await openEditor('[data-tool-id="inpaint"]');
    const layer = container.querySelector('[data-mask-surface="layer"]')!;
    act(() => {
      Simulate.mouseDown(layer, { clientX: 10, clientY: 10 } as never);
      Simulate.mouseMove(layer, { clientX: 50, clientY: 50 } as never);
      Simulate.mouseUp(layer, { clientX: 50, clientY: 50 } as never);
    });
    // Owner feedback 2026-08-27: the sentence is written in the SHARED board
    // generator mounted in the editor, and its round send button is the
    // confirm — this editor has no input box and no confirm of its own.
    act(() => {
      Simulate.change(
        container.querySelector('[data-canvas-generator-field="prompt"]')!,
        { target: { value: 'put a red hat here' } } as never,
      );
    });
    await act(async () => {
      Simulate.click(container.querySelector('[data-canvas-generator-action="send"]')!);
    });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
  }

  it('writes the composite to scratch and submits it as the only reference', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await runMaskFlow();

    const write = writeCanvasImage.mock.calls[0][0];
    // The scratch directory is outside every media-library scan root. Pinned
    // literally so nobody can quietly move it under media/.
    expect(write.relativePath.startsWith(CANVAS_SCRATCH_PREFIX)).toBe(true);
    expect(write.relativePath.startsWith('.void/infinite-canvas/scratch/')).toBe(true);
    expect(write.relativePath.startsWith('media/')).toBe(false);
    expect(write.relativePath.startsWith('.void/media/')).toBe(false);
    expect(write.base64Png).toBe('UEFZTE9BRA==');

    expect(stubRuntime.gateway.invoke).toHaveBeenCalledTimes(1);
    const invocation = stubRuntime.gateway.invoke.mock.calls[0][0] as any;
    expect(invocation.kind).toBe('inpaint');
    expect(invocation.resultMode).toBe('derived');
    expect(invocation.sourceNodeId).toBe('n-image');
    // The composite REPLACES the source picture as the edit target, and the
    // connected reference cards are deliberately dropped: exactly one path.
    expect(invocation.editTargetMediaRef).toEqual({
      workspacePath: WORKSPACE.workspacePath,
      relativePath: write.relativePath,
    });
    expect(invocation.references).toEqual([]);
    // The prompt is the mask directive plus the user's sentence.
    expect(invocation.prompt).toContain('infiniteCanvas.mask.directive.inpaint');
    expect(invocation.prompt).toContain('put a red hat here');
  });

  it('leaves the source card untouched and derives a pending card', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await runMaskFlow();

    await service.flushPendingWrites();
    const persisted = readDocument(memory);
    expect(persisted.nodes.find(node => node.nodeId === 'n-image')).toEqual(IMAGE_NODE);
    const derived = persisted.nodes.find(node => node.nodeId !== 'n-image')!;
    expect(derived.generation).toMatchObject({
      toolId: 'inpaint',
      resultMode: 'derived',
      status: 'pending',
    });
    expect(derived.mediaRef).toBeUndefined();
  });

  it('never submits a generation when the composite could not be written', async () => {
    writeCanvasImage.mockResolvedValue({ status: 'backend', message: 'disk full' });
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await runMaskFlow();

    // Money rule: a failed write must not reach a paid submission, and no
    // card may be left behind either.
    expect(stubRuntime.gateway.invoke).not.toHaveBeenCalled();
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes).toHaveLength(1);
    expect(container.querySelector('.infinite-canvas-panel__tool-notice')).not.toBeNull();
  });

  it('suspends the board undo shortcut while an editor is open', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    // One undoable board edit, so a leaked Ctrl+Z would have something to eat.
    await dragNode('n-image', { x: 90, y: 90 });
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0].position).toEqual({ x: 90, y: 90 });

    await openEditor('[data-tool-id="inpaint"]');
    await act(async () => {
      dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
      }));
    });
    await service.flushPendingWrites();

    // The card did NOT move back: Ctrl+Z belongs to the editor's stroke stack.
    expect(readDocument(memory).nodes[0].position).toEqual({ x: 90, y: 90 });
  });
});
