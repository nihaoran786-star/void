// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowChatPresentationActivityProvider } from './FlowChatPresentationActivity';
import { useFlowChatPresentationChatInputState } from './useFlowChatPresentationChatInputState';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const storeMock = vi.hoisted(() => {
  type State = {
    isActive: boolean;
    isExpanded: boolean;
    inputHeight: number;
  };

  let state: State = { isActive: true, isExpanded: false, inputHeight: 80 };
  const listeners = new Set<(next: State) => void>();
  const store = Object.assign(vi.fn(), {
    getState: vi.fn(() => state),
    subscribe: vi.fn((listener: (next: State) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  });

  return {
    store,
    reset: () => {
      state = { isActive: true, isExpanded: false, inputHeight: 80 };
      listeners.clear();
      store.getState.mockClear();
      store.subscribe.mockClear();
    },
    setState: (next: Partial<State>) => {
      state = { ...state, ...next };
      listeners.forEach((listener) => listener(state));
    },
    listenerCount: () => listeners.size,
  };
});

vi.mock('../../store/chatInputStateStore', () => ({
  useChatInputState: storeMock.store,
}));

function Consumer() {
  const state = useFlowChatPresentationChatInputState();
  return (
    <output data-testid="snapshot">
      {`${state.isActive}:${state.isExpanded}:${state.inputHeight}`}
    </output>
  );
}

function Harness({ isActive }: { isActive: boolean }) {
  return (
    <FlowChatPresentationActivityProvider isActive={isActive}>
      <Consumer />
    </FlowChatPresentationActivityProvider>
  );
}

describe('useFlowChatPresentationChatInputState', () => {
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

  it('subscribes while active, freezes hidden state, and resumes from the latest snapshot', () => {
    act(() => root.render(<Harness isActive />));
    expect(container.querySelector('[data-testid="snapshot"]')?.textContent).toBe('true:false:80');
    expect(storeMock.listenerCount()).toBe(1);

    act(() => storeMock.setState({ isExpanded: true, inputHeight: 180 }));
    expect(container.querySelector('[data-testid="snapshot"]')?.textContent).toBe('true:true:180');

    act(() => root.render(<Harness isActive={false} />));
    expect(storeMock.listenerCount()).toBe(0);

    act(() => storeMock.setState({ isActive: false, isExpanded: false, inputHeight: 240 }));
    expect(container.querySelector('[data-testid="snapshot"]')?.textContent).toBe('true:true:180');

    act(() => root.render(<Harness isActive />));
    expect(storeMock.listenerCount()).toBe(1);
    expect(container.querySelector('[data-testid="snapshot"]')?.textContent).toBe('false:false:240');
  });
});
