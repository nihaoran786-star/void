// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appManagerMock = vi.hoisted(() => ({
  state: {
    layout: {
      leftPanelCollapsed: true,
      rightPanelCollapsed: false,
      chatCollapsed: false,
    },
  },
  addEventListener: vi.fn(() => vi.fn()),
  getState: vi.fn(),
  updateLayout: vi.fn(),
}));

appManagerMock.getState.mockImplementation(() => appManagerMock.state);

vi.mock('../services/AppManager', () => ({
  appManager: appManagerMock,
}));

import { useApp } from './useApp';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('useApp layout actions', () => {
  let container: HTMLDivElement;
  let root: Root;
  let actions: ReturnType<typeof useApp> | undefined;

  function Probe() {
    actions = useApp();
    return null;
  }

  beforeEach(() => {
    appManagerMock.updateLayout.mockClear();
    appManagerMock.addEventListener.mockClear();
    appManagerMock.getState.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Probe />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('switches the hidden navigation destination without expanding a collapsed rail', () => {
    act(() => actions?.switchLeftPanelTab('profile'));

    expect(appManagerMock.updateLayout).toHaveBeenCalledWith({
      leftPanelActiveTab: 'profile',
    });
  });

  it('keeps the explicit panel toggle as the only action that changes collapsed state', () => {
    act(() => actions?.toggleLeftPanel());

    expect(appManagerMock.updateLayout).toHaveBeenCalledWith({
      leftPanelCollapsed: false,
    });
  });
});
