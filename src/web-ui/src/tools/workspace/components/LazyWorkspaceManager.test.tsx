// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ moduleLoadCount: 0 }));

vi.mock('./WorkspaceManager', () => {
  mocks.moduleLoadCount += 1;
  return {
    default: ({ isVisible }: { isVisible: boolean }) => (
      isVisible ? <div data-testid="workspace-manager-content" /> : null
    ),
  };
});

import WorkspaceManager from './LazyWorkspaceManager';

describe('LazyWorkspaceManager', () => {
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

  it('loads the workspace dialog only when it becomes visible', async () => {
    await act(async () => {
      root.render(<WorkspaceManager isVisible={false} onClose={vi.fn()} />);
    });

    expect(mocks.moduleLoadCount).toBe(0);
    expect(container.innerHTML).toBe('');

    act(() => {
      root.render(<WorkspaceManager isVisible onClose={vi.fn()} />);
    });
    await act(async () => {
      await vi.dynamicImportSettled();
    });

    expect(mocks.moduleLoadCount).toBe(1);
    expect(container.querySelector('[data-testid="workspace-manager-content"]')).not.toBeNull();
  });
});
