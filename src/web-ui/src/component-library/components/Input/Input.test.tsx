// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Input } from './Input';

describe('Input', () => {
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

  it('associates its visible label with the input', async () => {
    await act(async () => {
      root.render(<Input label="Log file path" />);
    });

    const label = container.querySelector('label');
    const input = container.querySelector('input');
    expect(label?.htmlFor).toBeTruthy();
    expect(label?.htmlFor).toBe(input?.id);
  });
});
