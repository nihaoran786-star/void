// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ moduleLoadCount: 0 }));

vi.mock('./NewProjectDialog', () => {
  mocks.moduleLoadCount += 1;
  return {
    NewProjectDialog: ({ isOpen }: { isOpen: boolean }) => (
      isOpen ? <div data-testid="new-project-dialog-content" /> : null
    ),
  };
});

import { NewProjectDialog } from './index';

describe('LazyNewProjectDialog', () => {
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

  it('loads the project form only after the dialog opens', async () => {
    const props = {
      onClose: vi.fn(),
      onConfirm: vi.fn(),
    };

    await act(async () => {
      root.render(<NewProjectDialog {...props} isOpen={false} />);
    });

    expect(mocks.moduleLoadCount).toBe(0);
    expect(container.innerHTML).toBe('');

    act(() => {
      root.render(<NewProjectDialog {...props} isOpen />);
    });
    await act(async () => {
      await vi.dynamicImportSettled();
    });

    expect(mocks.moduleLoadCount).toBe(1);
    expect(
      container.querySelector('[data-testid="new-project-dialog-content"]'),
    ).not.toBeNull();
  });
});
