// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFlowChatSync } from './useFlowChatSync';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const syncMocks = vi.hoisted(() => ({
  stopAutoSync: vi.fn(),
  startAutoSync: vi.fn(),
  unlistenTitle: vi.fn(),
  onSessionTitleGenerated: vi.fn(),
  updateSessionTitle: vi.fn(),
}));

vi.mock('../../services/storeSync', () => ({
  startAutoSync: syncMocks.startAutoSync,
}));

vi.mock('@/infrastructure/api', () => ({
  agentAPI: {
    onSessionTitleGenerated: syncMocks.onSessionTitleGenerated,
  },
}));

vi.mock('../../store/FlowChatStore', () => ({
  flowChatStore: {
    updateSessionTitle: syncMocks.updateSessionTitle,
  },
}));

function Harness({ isActive }: { isActive: boolean }) {
  useFlowChatSync(isActive);
  return null;
}

describe('useFlowChatSync presentation lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    syncMocks.startAutoSync.mockReturnValue(syncMocks.stopAutoSync);
    syncMocks.onSessionTitleGenerated.mockReturnValue(syncMocks.unlistenTitle);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('does not subscribe while inactive and rebuilds both subscriptions on resume', () => {
    act(() => {
      root.render(<Harness isActive={false} />);
    });
    expect(syncMocks.startAutoSync).not.toHaveBeenCalled();
    expect(syncMocks.onSessionTitleGenerated).not.toHaveBeenCalled();

    act(() => {
      root.render(<Harness isActive />);
    });
    expect(syncMocks.startAutoSync).toHaveBeenCalledTimes(1);
    expect(syncMocks.onSessionTitleGenerated).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(<Harness isActive={false} />);
    });
    expect(syncMocks.stopAutoSync).toHaveBeenCalledTimes(1);
    expect(syncMocks.unlistenTitle).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(<Harness isActive />);
    });
    expect(syncMocks.startAutoSync).toHaveBeenCalledTimes(2);
    expect(syncMocks.onSessionTitleGenerated).toHaveBeenCalledTimes(2);
  });

  it('keeps the active title event contract unchanged', () => {
    act(() => {
      root.render(<Harness isActive />);
    });

    const titleListener = syncMocks.onSessionTitleGenerated.mock.calls[0]?.[0];
    act(() => {
      titleListener?.({ sessionId: 'session-1', title: 'Generated title' });
    });

    expect(syncMocks.updateSessionTitle).toHaveBeenCalledWith(
      'session-1',
      'Generated title',
      'generated',
    );
  });
});
