// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { NumberInput } from './NumberInput';

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe('NumberInput', () => {
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

  it('uses the field label as the input accessible name', async () => {
    await act(async () => {
      root.render(<NumberInput value={30} onChange={vi.fn()} label="Execution timeout" />);
    });

    expect(container.querySelector('input')?.getAttribute('aria-label')).toBe(
      'Execution timeout',
    );
    expect(container.querySelector('label')?.htmlFor).toBe(
      container.querySelector('input')?.id,
    );
  });

  it('allows a compact row to provide an accessible name without a visible label', async () => {
    await act(async () => {
      root.render(
        <NumberInput
          value={30}
          onChange={vi.fn()}
          inputAriaLabel="Confirmation timeout"
        />,
      );
    });

    expect(container.querySelector('input')?.getAttribute('aria-label')).toBe(
      'Confirmation timeout',
    );
  });
});
