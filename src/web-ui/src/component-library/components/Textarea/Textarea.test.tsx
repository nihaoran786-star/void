// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Textarea } from './Textarea';

describe('Textarea', () => {
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

  it('associates its visible label with the textarea', async () => {
    await act(async () => {
      root.render(<Textarea label="Instrumentation template" />);
    });

    const label = container.querySelector('label');
    const textarea = container.querySelector('textarea');
    expect(label?.htmlFor).toBeTruthy();
    expect(label?.htmlFor).toBe(textarea?.id);
  });
});
