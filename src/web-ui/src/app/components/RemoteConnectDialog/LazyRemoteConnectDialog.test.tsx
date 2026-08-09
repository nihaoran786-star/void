// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ renderCount: 0 }));

vi.mock('./RemoteConnectDialog', () => {
  return {
    RemoteConnectDialog: ({ isOpen }: { isOpen: boolean }) => {
      mocks.renderCount += 1;
      return isOpen ? (
        <div data-testid="remote-connect-dialog-content" />
      ) : null;
    },
  };
});

import { RemoteConnectDialog } from './index';

describe('LazyRemoteConnectDialog', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.renderCount = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('mounts the connection UI only after the dialog opens', async () => {
    const onClose = vi.fn();

    await act(async () => {
      root.render(<RemoteConnectDialog isOpen={false} onClose={onClose} />);
    });

    expect(mocks.renderCount).toBe(0);
    expect(container.innerHTML).toBe('');

    act(() => {
      root.render(<RemoteConnectDialog isOpen onClose={onClose} />);
    });
    expect(mocks.renderCount).toBe(1);
    expect(
      container.querySelector('[data-testid="remote-connect-dialog-content"]'),
    ).not.toBeNull();
  });
});
