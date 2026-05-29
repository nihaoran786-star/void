// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { ContentCanvas } from './ContentCanvas';
import { useAgentCanvasStore } from './stores';
import type { WorkspaceMediaLibraryService } from '@/shared/services/workspace-media';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('./editor-area', () => ({
  EditorArea: () => <div data-testid="editor-area" />,
}));

vi.mock('./empty-state', () => ({
  EmptyState: () => <div data-testid="empty-state" />,
}));

vi.mock('./anchor-zone', () => ({
  AnchorZone: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./mission-control', () => ({
  MissionControl: () => null,
}));

vi.mock('./hooks', () => ({
  useTabLifecycle: () => ({
    handleCloseWithDirtyCheck: vi.fn(),
    handleCloseAllWithDirtyCheck: vi.fn(),
  }),
  useKeyboardShortcuts: vi.fn(),
  usePanelTabCoordinator: () => ({
    collapsePanel: vi.fn(),
  }),
}));

vi.mock('@/flow_chat/services/openBtwSession', () => ({
  openMainSession: vi.fn(),
  selectActiveBtwSessionTab: vi.fn(() => null),
}));

describe('ContentCanvas workspace media opening', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useAgentCanvasStore.getState().reset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useAgentCanvasStore.getState().reset();
  });

  it('auto-opens the workspace media tab once when the primary group is empty and media is available', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'available', firstDetectedAt: 100 })),
      scanLibrary: vi.fn(),
    };

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });

    const tabsAfterFirstRender = useAgentCanvasStore.getState().primaryGroup.tabs;
    expect(tabsAfterFirstRender).toHaveLength(1);
    expect(tabsAfterFirstRender[0].content).toMatchObject({
      type: 'workspace-media-gallery',
      data: { workspacePath: 'C:/work' },
    });

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });

    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(1);
  });

  it('opens the workspace media tab from the global media event without duplicating existing media tab', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'unavailable', checkedAt: 100 })),
      scanLibrary: vi.fn(),
    };

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('void:open-workspace-media'));
    });
    act(() => {
      window.dispatchEvent(new CustomEvent('void:open-workspace-media'));
    });

    const mediaTabs = useAgentCanvasStore
      .getState()
      .primaryGroup
      .tabs
      .filter(tab => tab.content.type === 'workspace-media-gallery');
    expect(mediaTabs).toHaveLength(1);
  });
});
