// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowChatPresentationActivityProvider } from './FlowChatPresentationActivity';
import { usePresentationVirtualItems } from './useFlowChatPresentationStore';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const storeMock = vi.hoisted(() => {
  type StoreState = {
    activeSession: null;
    virtualItems: Array<{ type: 'image-analyzing'; turnId: string }>;
    visibleTurnInfo: null;
  };

  let state: StoreState = {
    activeSession: null,
    virtualItems: [],
    visibleTurnInfo: null,
  };
  const listeners = new Set<(nextState: StoreState) => void>();

  const store = Object.assign(vi.fn(), {
    getState: vi.fn(() => state),
    subscribe: vi.fn((listener: (nextState: StoreState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  });

  return {
    store,
    reset: () => {
      state = {
        activeSession: null,
        virtualItems: [],
        visibleTurnInfo: null,
      };
      listeners.clear();
      store.getState.mockClear();
      store.subscribe.mockClear();
    },
    setTurnIds: (turnIds: string[]) => {
      state = {
        ...state,
        virtualItems: turnIds.map(turnId => ({ type: 'image-analyzing', turnId })),
      };
      listeners.forEach(listener => listener(state));
    },
    listenerCount: () => listeners.size,
  };
});

vi.mock('../../store/modernFlowChatStore', () => ({
  useModernFlowChatStore: storeMock.store,
}));

function OverrideHarness({ isActive }: { isActive: boolean }) {
  const items = usePresentationVirtualItems(isActive);
  return <output data-testid="turn-ids">{items.map(item => item.turnId).join(',')}</output>;
}

function ActivityHarness({ isActive }: { isActive: boolean }) {
  return (
    <FlowChatPresentationActivityProvider isActive={isActive}>
      <StoreConsumer />
    </FlowChatPresentationActivityProvider>
  );
}

function StoreConsumer() {
  const items = usePresentationVirtualItems();
  return <output data-testid="turn-ids">{items.map(item => item.turnId).join(',')}</output>;
}

describe('useFlowChatPresentationStore', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    storeMock.reset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('subscribes while active, freezes while hidden, and resumes from the latest store snapshot', () => {
    storeMock.setTurnIds(['turn-1']);

    act(() => {
      root.render(<ActivityHarness isActive />);
    });

    expect(container.querySelector('[data-testid="turn-ids"]')?.textContent).toBe('turn-1');
    expect(storeMock.listenerCount()).toBe(1);

    act(() => {
      storeMock.setTurnIds(['turn-2']);
    });
    expect(container.querySelector('[data-testid="turn-ids"]')?.textContent).toBe('turn-2');

    act(() => {
      root.render(<ActivityHarness isActive={false} />);
    });
    expect(storeMock.listenerCount()).toBe(0);

    act(() => {
      storeMock.setTurnIds(['turn-3']);
    });
    expect(container.querySelector('[data-testid="turn-ids"]')?.textContent).toBe('turn-2');

    act(() => {
      root.render(<ActivityHarness isActive />);
    });
    expect(storeMock.listenerCount()).toBe(1);
    expect(container.querySelector('[data-testid="turn-ids"]')?.textContent).toBe('turn-3');
  });

  it('supports an explicit inactive override without creating a subscription', () => {
    storeMock.setTurnIds(['turn-1']);

    act(() => {
      root.render(<OverrideHarness isActive={false} />);
    });

    expect(storeMock.listenerCount()).toBe(0);
  });
});
