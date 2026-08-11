import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceMediaVirtualMasonry } from './WorkspaceMediaVirtualMasonry';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface TestItem {
  id: string;
}

describe('WorkspaceMediaVirtualMasonry', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM(
      '<!doctype html><html><body><div id="root"></div></body></html>',
      { pretendToBeVisual: true },
    );
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 720,
    });
    Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 720,
    });
    dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
      return {
        bottom: 720,
        height: 720,
        left: 0,
        right: 720,
        top: 0,
        width: 720,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      };
    };
    Object.defineProperty(dom.window, 'ResizeObserver', {
      configurable: true,
      value: class {
        disconnect(): void {}
        observe(): void {}
        unobserve(): void {}
      },
    });

    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it('does not re-key the full collection for an unrelated parent render', async () => {
    const items = Array.from(
      { length: 500 },
      (_, index) => ({ id: `item-${index}` }),
    );
    const getItemKey = vi.fn((item: TestItem) => item.id);
    const estimateAspectRatio = vi.fn(() => 1);

    const render = async (label: string) => {
      await act(async () => {
        root.render(
          <WorkspaceMediaVirtualMasonry
            items={items}
            getItemKey={getItemKey}
            estimateAspectRatio={estimateAspectRatio}
            renderItem={item => <span>{label}:{item.id}</span>}
            resetKey="same-scope"
          />,
        );
      });
    };

    await render('first');
    const callsAfterMount = getItemKey.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    await render('second');
    const unrelatedRenderCalls = getItemKey.mock.calls.length - callsAfterMount;

    expect(unrelatedRenderCalls).toBeLessThan(20);
  });

  it('keeps the established Classic virtual geometry', async () => {
    container.className = 'void-app-layout void-ui--classic';
    const items = [{ id: 'item-1' }];

    await act(async () => {
      root.render(
        <WorkspaceMediaVirtualMasonry
          items={items}
          getItemKey={item => item.id}
          estimateAspectRatio={() => 1}
          renderItem={item => <span>{item.id}</span>}
          resetKey="theme-isolation"
        />,
      );
    });

    const masonry = container.querySelector<HTMLElement>(
      '[data-testid="workspace-media-virtual-masonry"]',
    );
    expect(masonry?.getAttribute('data-horizontal-padding')).toBe('14');
    expect(masonry?.getAttribute('data-item-gap')).toBe('10');
  });

  it('projects the tighter Minimal virtual geometry', async () => {
    container.className = 'void-app-layout void-ui--minimal';

    await act(async () => {
      root.render(
        <WorkspaceMediaVirtualMasonry
          items={[{ id: 'item-1' }]}
          getItemKey={item => item.id}
          estimateAspectRatio={() => 1}
          renderItem={item => <span>{item.id}</span>}
          resetKey="minimal-density"
        />,
      );
    });

    const masonry = container.querySelector<HTMLElement>(
      '[data-testid="workspace-media-virtual-masonry"]',
    );
    expect(masonry?.getAttribute('data-horizontal-padding')).toBe('8');
    expect(masonry?.getAttribute('data-item-gap')).toBe('8');
  });
});
