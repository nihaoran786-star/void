/**
 * P5 W6: the style picker as a thumbnail grid.
 *
 * What is asserted here is which element a tile renders and what it points at
 * — never a style rule. The two behaviours that matter are that a preset with
 * a thumbnail shows the picture, and that every other case (no thumbnail at
 * all, or a thumbnail that fails to load) lands on the same finished swatch
 * tile rather than an empty frame or a broken-image glyph.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import { StylePresetCatalog, type StylePreset } from '@/shared/services/style-preset';
import { InfiniteCanvasStylePicker } from './InfiniteCanvasStylePicker';
import { infiniteCanvasSwatchHue, infiniteCanvasSwatchLabel } from './infiniteCanvasStyleSwatch';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORIGIN = { project: 'kunpeng', license: 'MIT', sourcePath: 'test' } as const;

function preset(overrides: Partial<StylePreset> & Pick<StylePreset, 'presetId'>): StylePreset {
  return {
    schemaVersion: '1',
    family: 'cinematic',
    name: '示例风格',
    category: 'live-action',
    promptTemplate: 'template',
    origin: ORIGIN,
    ...overrides,
  } as StylePreset;
}

const WITH_THUMBNAIL = preset({
  presetId: 'cinematic:with-thumb',
  name: '胶片怀旧影院',
  thumbnailRef: 'style-presets/cinematic/0123456789abcdef.webp',
});
const WITHOUT_THUMBNAIL = preset({
  presetId: 'midjourney:mecha-ruin',
  family: 'midjourney',
  category: 'mecha',
  name: '机甲废墟',
});

describe('InfiniteCanvasStylePicker thumbnails', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let onPick: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dom = new JSDOM(
      '<!doctype html><html><body><div class="infinite-canvas-panel"><div id="root"></div></div></body></html>',
      { pretendToBeVisual: true },
    );
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
    onPick = vi.fn();
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function renderPicker(presets: readonly StylePreset[], currentPresetId?: string) {
    const catalog = new StylePresetCatalog(presets, []);
    act(() => {
      root.render(
        <InfiniteCanvasStylePicker
          catalog={catalog}
          currentPresetId={currentPresetId}
          onPick={onPick}
          onClose={() => undefined}
        />,
      );
    });
  }

  const tile = (presetId: string) => (
    dom.window.document.querySelector(
      `[data-canvas-style-preset="${presetId}"]`,
    ) as HTMLElement | null
  );

  it('renders an image tile for a preset that has a thumbnail', () => {
    renderPicker([WITH_THUMBNAIL]);
    const image = tile(WITH_THUMBNAIL.presetId)?.querySelector('img');
    expect(image).toBeTruthy();
    // P5 review P17: `thumbnailRef` is stored relative, and these files are
    // served from the root of `public/` — so a relative src resolved against
    // whatever route the panel happened to be on and 404'd. The leading slash
    // is the fix and is pinned here.
    expect(image?.getAttribute('src')).toBe(`/${WITH_THUMBNAIL.thumbnailRef}`);
    // Lazy and async by contract: the grid must not preload 161 files, and the
    // thumbnails must never be routed through the workspace preview resolver.
    expect(image?.getAttribute('loading')).toBe('lazy');
    expect(image?.getAttribute('decoding')).toBe('async');
    expect(image?.getAttribute('src')?.startsWith('/style-presets/')).toBe(true);
    expect(tile(WITH_THUMBNAIL.presetId)?.querySelector('[data-canvas-style-swatch]')).toBeNull();
  });

  it('renders a swatch tile with initials when the preset has no thumbnail', () => {
    // Passed as the current preset so the picker opens on its family.
    renderPicker([WITHOUT_THUMBNAIL], WITHOUT_THUMBNAIL.presetId);
    const swatch = tile(WITHOUT_THUMBNAIL.presetId)?.querySelector(
      '[data-canvas-style-swatch]',
    ) as HTMLElement;
    expect(swatch).toBeTruthy();
    expect(tile(WITHOUT_THUMBNAIL.presetId)?.querySelector('img')).toBeNull();
    expect(swatch.textContent).toBe(infiniteCanvasSwatchLabel(WITHOUT_THUMBNAIL.name));
    expect(swatch.style.getPropertyValue('--swatch-hue')).toBe(
      String(infiniteCanvasSwatchHue(WITHOUT_THUMBNAIL.presetId)),
    );
  });

  it('falls back to the swatch when the thumbnail fails to load', () => {
    renderPicker([WITH_THUMBNAIL]);
    const image = tile(WITH_THUMBNAIL.presetId)?.querySelector('img') as HTMLImageElement;
    act(() => {
      Simulate.error(image);
    });
    expect(tile(WITH_THUMBNAIL.presetId)?.querySelector('img')).toBeNull();
    expect(
      tile(WITH_THUMBNAIL.presetId)?.querySelector('[data-canvas-style-swatch]'),
    ).toBeTruthy();
  });

  it('keeps the same swatch colour for a preset across renders', () => {
    renderPicker([WITHOUT_THUMBNAIL], WITHOUT_THUMBNAIL.presetId);
    const first = (
      tile(WITHOUT_THUMBNAIL.presetId)?.querySelector('[data-canvas-style-swatch]') as HTMLElement
    ).style.getPropertyValue('--swatch-hue');
    act(() => root.unmount());
    root = createRoot(container);
    renderPicker([WITHOUT_THUMBNAIL], WITHOUT_THUMBNAIL.presetId);
    const second = (
      tile(WITHOUT_THUMBNAIL.presetId)?.querySelector('[data-canvas-style-swatch]') as HTMLElement
    ).style.getPropertyValue('--swatch-hue');
    expect(second).toBe(first);
  });

  it('still reports only the preset id when a tile is chosen', () => {
    renderPicker([WITH_THUMBNAIL, WITHOUT_THUMBNAIL]);
    act(() => {
      Simulate.click(tile(WITH_THUMBNAIL.presetId) as HTMLElement);
    });
    expect(onPick).toHaveBeenCalledWith(WITH_THUMBNAIL.presetId);
  });
});

describe('infiniteCanvasStyleSwatch', () => {
  it('derives a hue inside the colour wheel and is stable per id', () => {
    for (const id of ['a', 'cinematic:live-action-x', 'mg-motion:app-premium-3d', '']) {
      const hue = infiniteCanvasSwatchHue(id);
      expect(Number.isInteger(hue)).toBe(true);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
      expect(infiniteCanvasSwatchHue(id)).toBe(hue);
    }
  });

  it('spreads neighbouring preset ids across different hues', () => {
    const hues = new Set(
      Array.from({ length: 40 }, (_, index) => infiniteCanvasSwatchHue(`mg-motion:style-${index}`)),
    );
    // The old accumulator collapsed sequential ids onto a couple of hues.
    expect(hues.size).toBeGreaterThan(30);
  });

  it('takes the first two characters without splitting a surrogate pair', () => {
    expect(infiniteCanvasSwatchLabel('机甲废墟')).toBe('机甲');
    expect(infiniteCanvasSwatchLabel('  留白  ')).toBe('留白');
    expect(infiniteCanvasSwatchLabel('A')).toBe('A');
    expect(infiniteCanvasSwatchLabel('')).toBe('');
    expect(Array.from(infiniteCanvasSwatchLabel('𝒜𝒷𝒸'))).toHaveLength(2);
  });
});
