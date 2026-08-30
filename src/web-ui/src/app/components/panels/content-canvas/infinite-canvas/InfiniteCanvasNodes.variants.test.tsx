/**
 * §7.6 card face: the count badge and the four-up gallery.
 *
 * What is asserted here is behaviour, never a style rule: a card with one
 * picture looks exactly as it did before §7.6, a card with several offers the
 * badge, the badge toggles a 2×2 grid, more than four pictures page, and
 * picking a tile reports the ABSOLUTE index — the paging bug that would
 * otherwise silently set the wrong picture.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';

vi.mock('@/infrastructure/i18n', async () => (
  await import('./infiniteCanvasPanel.testkit')
).mockI18n());

// The card renders reactflow handles; outside a provider they throw, and the
// gallery has nothing to do with them.
vi.mock('@xyflow/react', async () => (
  await import('./infiniteCanvasPanel.testkit')
).mockReactFlowPrimitives());

import { InfiniteCanvasImageNode, type InfiniteCanvasImageNodeData } from './InfiniteCanvasNodes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WS = 'C:/ws';

function ref(index: number) {
  return { workspacePath: WS, relativePath: `media/generated/image-00${index}.png` };
}

describe('InfiniteCanvasImageNode — one card, several pictures (§7.6)', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let onSelectVariant: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dom = new JSDOM(
      '<!doctype html><html><body><div id="root"></div></body></html>',
      { pretendToBeVisual: true },
    );
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
    onSelectVariant = vi.fn();
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function renderCard(count: number, activeVariantIndex = 0, withHandler = true) {
    const variants = Array.from({ length: count }, (_unused, index) => ref(index + 1));
    const data: InfiniteCanvasImageNodeData = {
      mediaRef: variants[activeVariantIndex],
      mediaVariants: variants,
      activeVariantIndex,
      resolvePreviewUrl: async () => undefined,
      onCommitPrompt: () => undefined,
      onGenerate: () => undefined,
      onRetryGeneration: () => undefined,
      onRemoveFailedGeneration: () => undefined,
      onOpenStylePicker: () => undefined,
      onRunImageTool: () => undefined,
      ...(withHandler ? { onSelectVariant } : {}),
    };
    act(() => {
      root.render(<InfiniteCanvasImageNode id="card-1" data={data} />);
    });
  }

  const badge = () => container.querySelector('[data-node-action="variants"]') as HTMLElement | null;
  const gallery = () => container.querySelector('[data-canvas-variant-gallery]');
  const tiles = () => Array.from(
    container.querySelectorAll('[data-canvas-variant-index]'),
  ) as HTMLElement[];
  const pager = (direction: 'previous' | 'next') => container.querySelector(
    `[data-canvas-variant-page="${direction}"]`,
  ) as HTMLButtonElement | null;

  it('shows no badge at all on a card with a single picture', () => {
    renderCard(1);
    expect(badge()).toBeNull();
    expect(gallery()).toBeNull();
  });

  it('shows the count on a card with several pictures', () => {
    renderCard(4);
    expect(badge()?.textContent).toBe('4');
    expect(badge()?.getAttribute('aria-expanded')).toBe('false');
    // Collapsed by default: the picture is still the card.
    expect(gallery()).toBeNull();
  });

  it('opens and closes the gallery from the badge', () => {
    renderCard(3);
    act(() => Simulate.click(badge()!));
    expect(gallery()).toBeTruthy();
    expect(badge()?.getAttribute('aria-expanded')).toBe('true');
    act(() => Simulate.click(badge()!));
    expect(gallery()).toBeNull();
  });

  it('lays four pictures out at once and marks the current one', () => {
    renderCard(4, 2);
    act(() => Simulate.click(badge()!));
    expect(tiles()).toHaveLength(4);
    const current = tiles().filter(tile => tile.getAttribute('data-current') === 'true');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute('data-canvas-variant-index')).toBe('2');
    // Exactly four fit, so there is nothing to page through.
    expect(pager('next')).toBeNull();
  });

  it('pages once there are more than four pictures', () => {
    renderCard(6);
    act(() => Simulate.click(badge()!));
    expect(tiles().map(tile => tile.getAttribute('data-canvas-variant-index')))
      .toEqual(['0', '1', '2', '3']);
    expect(pager('previous')?.disabled).toBe(true);

    act(() => Simulate.click(pager('next')!));
    expect(tiles().map(tile => tile.getAttribute('data-canvas-variant-index')))
      .toEqual(['4', '5']);
    expect(pager('next')?.disabled).toBe(true);
    expect(pager('previous')?.disabled).toBe(false);

    act(() => Simulate.click(pager('previous')!));
    expect(tiles().map(tile => tile.getAttribute('data-canvas-variant-index')))
      .toEqual(['0', '1', '2', '3']);
  });

  it('opens on the page that holds the current picture', () => {
    renderCard(9, 7);
    act(() => Simulate.click(badge()!));
    expect(tiles().map(tile => tile.getAttribute('data-canvas-variant-index')))
      .toEqual(['4', '5', '6', '7']);
  });

  it('reports the absolute index of the picked picture, page and all', () => {
    renderCard(6);
    act(() => Simulate.click(badge()!));
    act(() => Simulate.click(pager('next')!));

    act(() => Simulate.click(tiles()[1]));

    expect(onSelectVariant).toHaveBeenCalledTimes(1);
    expect(onSelectVariant).toHaveBeenCalledWith('card-1', 5);
  });

  it('offers nothing when the panel wired no handler', () => {
    renderCard(4, 0, false);
    expect(badge()).toBeNull();
  });
});
