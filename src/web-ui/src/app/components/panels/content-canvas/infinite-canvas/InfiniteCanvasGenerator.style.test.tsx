/**
 * §7.5 (owner 2026-08-28): once a style is chosen, the input box's style entry
 * SHOWS it.
 *
 * Two states, both of which must be finished:
 *
 * - the preset has a sample picture → a small square picture plus the name;
 * - it has none (156 of the 317 ship none, and never will) → the deterministic
 *   colour block plus the name, in the same square and the same radius.
 *
 * A thumbnail that fails to load falls back to the block as well, because the
 * browser's broken-image glyph is not a design. Behaviour only — the shape and
 * radius are the stylesheet's business, not this file's.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import { InfiniteCanvasGenerator } from './InfiniteCanvasGenerator';
import { infiniteCanvasSwatchLabel } from './infiniteCanvasStyleSwatch';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BASE_TARGET = {
  nodeId: 'n-image',
  mediaKind: 'image' as const,
  prompt: '',
  modelLabel: 'test-model',
  pending: false,
};

describe('InfiniteCanvasGenerator style entry (§7.5)', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function render(target: Partial<typeof BASE_TARGET> & Record<string, unknown> = {}) {
    await act(async () => {
      root.render(
        <InfiniteCanvasGenerator
          target={{ ...BASE_TARGET, ...target }}
          references={[]}
          resolvePreviewUrl={async () => undefined}
          onSubmit={() => undefined}
          onOpenStyle={() => undefined}
        />,
      );
    });
  }

  const entry = () => (
    container.querySelector('[data-canvas-generator-action="style"]') as HTMLButtonElement
  );
  const thumbnail = () => container.querySelector('[data-canvas-generator-style-thumbnail="true"]');
  const swatch = () => container.querySelector('[data-canvas-generator-style-swatch="true"]');

  it('shows the picture and the name once a style with a thumbnail is chosen', async () => {
    await render({
      stylePresetId: 'cinematic-noir',
      stylePresetName: 'Film noir',
      styleThumbnailRef: 'style-presets/cinematic/noir.webp',
    });

    expect(entry().getAttribute('data-has-style')).toBe('true');
    // Relative in the catalogue, root-absolute in the browser: these live
    // under public/, and any other form 404s from a nested route.
    expect(thumbnail()?.getAttribute('src')).toBe('/style-presets/cinematic/noir.webp');
    expect(swatch()).toBeNull();
    expect(entry().textContent).toContain('Film noir');
  });

  it('shows the deterministic colour block for a style that has no picture', async () => {
    await render({ stylePresetId: 'midjourney-vaporwave', stylePresetName: 'Vaporwave' });

    expect(thumbnail()).toBeNull();
    const block = swatch();
    expect(block).not.toBeNull();
    expect(block!.textContent).toBe(infiniteCanvasSwatchLabel('Vaporwave'));
    expect(entry().textContent).toContain('Vaporwave');
  });

  it('falls back to the colour block when the picture cannot be loaded', async () => {
    await render({
      stylePresetId: 'cinematic-noir',
      stylePresetName: 'Film noir',
      styleThumbnailRef: 'style-presets/cinematic/missing.webp',
    });

    act(() => {
      Simulate.error(thumbnail()!);
    });

    expect(thumbnail()).toBeNull();
    expect(swatch()).not.toBeNull();
  });

  it('stays the plain entry while no style is chosen', async () => {
    await render();

    expect(entry().getAttribute('data-has-style')).toBeNull();
    expect(thumbnail()).toBeNull();
    expect(swatch()).toBeNull();
  });
});
