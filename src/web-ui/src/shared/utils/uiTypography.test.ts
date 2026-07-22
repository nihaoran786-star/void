import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_UI_FONT_FAMILY } from '@/shared/constants/typography';
import { buildCanvasFont, readUiFontFamily } from './uiTypography';

describe('UI typography helpers', () => {
  function installDom(): JSDOM {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    return dom;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the bootstrap family when no DOM is available', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);

    expect(readUiFontFamily()).toBe(DEFAULT_UI_FONT_FAMILY);
  });

  it('reads the canonical family token from the active theme', () => {
    installDom();
    const root = document.documentElement;
    root.style.setProperty('--font-family-sans', '"Theme Sans", sans-serif');

    expect(readUiFontFamily(root)).toBe('"Theme Sans", sans-serif');

    root.style.removeProperty('--font-family-sans');
  });

  it('builds Canvas declarations with the resolved UI family', () => {
    installDom();
    const root = document.documentElement;
    root.style.setProperty('--font-family-sans', '"Canvas UI", sans-serif');

    expect(buildCanvasFont(13, { fontWeight: 500 })).toBe(
      '500 13px "Canvas UI", sans-serif',
    );

    root.style.removeProperty('--font-family-sans');
  });

  it.each([
    ['NaN', Number.NaN, 12],
    ['negative', -10, 6],
    ['minimum boundary', 6, 6],
    ['too small', 1, 6],
    ['maximum boundary', 96, 96],
    ['too large', 500, 96],
  ])('bounds a %s Canvas size', (_case, size, expectedSize) => {
    expect(
      buildCanvasFont(size, {
        fontFamily: '"Safe UI", sans-serif',
        fontWeight: 'url(javascript:invalid)',
      }),
    ).toBe(`400 ${expectedSize}px "Safe UI", sans-serif`);
  });
});
