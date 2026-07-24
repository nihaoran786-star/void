// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { IconButton } from './IconButton';

describe('IconButton', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('uses a string tooltip as the fallback accessible name', async () => {
    await act(async () => {
      root.render(
        <IconButton tooltip="Browse">
          <span aria-hidden>+</span>
        </IconButton>,
      );
    });

    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Browse',
    );
  });

  it('preserves an explicit accessible name', async () => {
    await act(async () => {
      root.render(
        <IconButton tooltip="Browse" aria-label="Choose log file">
          <span aria-hidden>+</span>
        </IconButton>,
      );
    });

    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Choose log file',
    );
  });
});
