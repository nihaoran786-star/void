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
});
