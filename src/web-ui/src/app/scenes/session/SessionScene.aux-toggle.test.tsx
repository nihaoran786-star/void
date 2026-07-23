// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  toggleRightPanel: vi.fn(),
  updateRightPanelWidth: vi.fn(),
  layout: {
    rightPanelWidth: 540,
    rightPanelCollapsed: false,
    chatCollapsed: false,
    centerPanelCollapsed: false,
  },
  chatPaneProps: null as null | {
    showCanvasToggle?: boolean;
    isCanvasExpanded?: boolean;
    onCanvasToggle?: () => void;
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/component-library', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/infrastructure/runtime', () => ({
  isTauriRuntime: () => false,
}));

vi.mock('../../hooks/useApp', () => ({
  useApp: () => ({
    state: { layout: mocks.layout },
    toggleRightPanel: mocks.toggleRightPanel,
    updateRightPanelWidth: mocks.updateRightPanelWidth,
  }),
}));

vi.mock('./ChatPane', () => ({
  default: (props: typeof mocks.chatPaneProps) => {
    mocks.chatPaneProps = props;
    return <div data-testid="chat-pane" />;
  },
}));

vi.mock('./AuxPane', async () => {
  const { forwardRef } = await import('react');
  return {
    default: forwardRef<HTMLDivElement>((_props, ref) => (
      <div ref={ref} data-testid="aux-pane" />
    )),
  };
});

import SessionScene from './SessionScene';

describe('SessionScene universal canvas toggle control', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.toggleRightPanel.mockReset();
    mocks.updateRightPanelWidth.mockReset();
    mocks.chatPaneProps = null;
    mocks.layout.rightPanelCollapsed = false;
    mocks.layout.chatCollapsed = false;
    mocks.layout.centerPanelCollapsed = false;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('routes the outer canvas control through the reserved chat header action', async () => {
    await act(async () => {
      root.render(<SessionScene workspacePath="D:\\workspace" />);
    });

    expect(mocks.chatPaneProps?.showCanvasToggle).toBe(true);
    expect(mocks.chatPaneProps?.isCanvasExpanded).toBe(true);

    await act(async () => {
      mocks.chatPaneProps?.onCanvasToggle?.();
    });

    expect(mocks.toggleRightPanel).toHaveBeenCalledTimes(1);
  });

  it('keeps the same header action available after the outer canvas is collapsed', async () => {
    mocks.layout.rightPanelCollapsed = true;

    await act(async () => {
      root.render(<SessionScene />);
    });

    expect(mocks.chatPaneProps?.showCanvasToggle).toBe(true);
    expect(mocks.chatPaneProps?.isCanvasExpanded).toBe(false);

    await act(async () => {
      mocks.chatPaneProps?.onCanvasToggle?.();
    });

    expect(mocks.toggleRightPanel).toHaveBeenCalledTimes(1);
  });

  it('keeps preview-first mode as the sole full-surface owner', async () => {
    mocks.layout.chatCollapsed = true;

    await act(async () => {
      root.render(<SessionScene />);
    });

    expect(mocks.chatPaneProps).toBeNull();
  });
});
