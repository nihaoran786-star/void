// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDocumentVisibilityState } from './useDocumentVisibilityState';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('useDocumentVisibilityState', () => {
  let container: HTMLDivElement;
  let root: Root;
  let visibilityState: DocumentVisibilityState;

  beforeEach(() => {
    visibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('tracks document visibility changes and removes its listener on unmount', () => {
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    const Probe = () => (
      <output>{useDocumentVisibilityState() ? 'visible' : 'hidden'}</output>
    );

    act(() => root.render(<Probe />));
    expect(container.textContent).toBe('visible');

    visibilityState = 'hidden';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(container.textContent).toBe('hidden');

    visibilityState = 'visible';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(container.textContent).toBe('visible');

    act(() => root.unmount());
    expect(removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    root = createRoot(container);
  });
});
