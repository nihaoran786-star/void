import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { CanvasSurfaceErrorBoundary } from './CanvasSurfaceErrorBoundary';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('CanvasSurfaceErrorBoundary', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it('contains a renderer failure inside the surface instance', () => {
    const BrokenRenderer: React.FC = () => {
      throw new Error('renderer failed');
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    act(() => {
      root.render(
        <CanvasSurfaceErrorBoundary
          instanceKey="surface-1"
          fallback={<div data-testid="surface-error">Unavailable</div>}
        >
          <BrokenRenderer />
        </CanvasSurfaceErrorBoundary>,
      );
    });

    expect(container.querySelector('[data-testid="surface-error"]')).not.toBeNull();
    consoleError.mockRestore();
  });
});
