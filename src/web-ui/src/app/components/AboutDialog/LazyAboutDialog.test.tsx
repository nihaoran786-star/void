// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ moduleLoadCount: 0 }));

vi.mock('./AboutDialog', () => {
  mocks.moduleLoadCount += 1;
  return {
    AboutDialog: ({ isOpen }: { isOpen: boolean }) => (
      isOpen ? <div data-testid="about-dialog-content" /> : null
    ),
  };
});

import { AboutDialog } from './index';

describe('LazyAboutDialog', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.moduleLoadCount = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('loads the dialog module only after the dialog opens', async () => {
    await act(async () => {
      root.render(<AboutDialog isOpen={false} onClose={vi.fn()} />);
    });

    expect(mocks.moduleLoadCount).toBe(0);
    expect(container.innerHTML).toBe('');

    act(() => {
      root.render(<AboutDialog isOpen onClose={vi.fn()} />);
    });
    await act(async () => {
      await vi.dynamicImportSettled();
    });

    expect(mocks.moduleLoadCount).toBe(1);
    expect(container.querySelector('[data-testid="about-dialog-content"]')).not.toBeNull();
  });
});
