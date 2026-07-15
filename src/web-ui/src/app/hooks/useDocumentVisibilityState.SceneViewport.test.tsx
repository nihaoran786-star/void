// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sceneManagerMock = vi.hoisted(() => ({
  openTabs: [{ id: 'session' }],
  activeTabId: 'session',
}));

vi.mock('./useSceneManager', () => ({
  useSceneManager: () => sceneManagerMock,
}));
vi.mock('./useDialogCompletionNotify', () => ({
  useDialogCompletionNotify: () => undefined,
}));
vi.mock('@/infrastructure/i18n/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('@/flow_chat/components/modern/ProcessingIndicator', () => ({
  ProcessingIndicator: () => null,
}));
vi.mock('../scenes/assistant/AssistantScene', () => ({ default: () => null }));
vi.mock('../scenes/session/SessionScene', () => ({
  default: ({ isActive }: { isActive?: boolean }) => (
    <div data-testid="session-scene" data-active={String(isActive)} />
  ),
}));
vi.mock('../scenes/file-viewer/FileViewerScene', () => ({
  default: ({ isActive }: { isActive?: boolean }) => (
    <div data-testid="file-viewer-scene" data-active={String(isActive)} />
  ),
}));
vi.mock('../scenes/panel-view/PanelViewScene', () => ({
  default: ({ isActive }: { isActive?: boolean }) => (
    <div data-testid="panel-view-scene" data-active={String(isActive)} />
  ),
}));

import SceneViewport from '../scenes/SceneViewport';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('SceneViewport presentation activity', () => {
  let container: HTMLDivElement;
  let root: Root;
  let visibilityState: DocumentVisibilityState;

  beforeEach(() => {
    sceneManagerMock.openTabs = [{ id: 'session' }];
    sceneManagerMock.activeTabId = 'session';
    visibilityState = 'hidden';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('keeps tab layout active while document-hidden presentation work is paused', () => {
    act(() => root.render(<SceneViewport workspacePath="C:/work" />));

    const sceneContainer = container.querySelector('.void-scene-viewport__scene');
    expect(sceneContainer?.classList.contains('void-scene-viewport__scene--active')).toBe(true);
    expect(sceneContainer?.getAttribute('aria-hidden')).toBe('false');
    expect(container.querySelector('[data-testid="session-scene"]')?.getAttribute('data-active')).toBe('false');

    visibilityState = 'visible';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(container.querySelector('[data-testid="session-scene"]')?.getAttribute('data-active')).toBe('true');
  });

  it('passes presentation activity to file-viewer and panel-view canvases', async () => {
    visibilityState = 'visible';
    sceneManagerMock.openTabs = [{ id: 'file-viewer' }, { id: 'panel-view' }];
    sceneManagerMock.activeTabId = 'file-viewer';

    await act(async () => {
      root.render(<SceneViewport workspacePath="C:/work" />);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="file-viewer-scene"]')?.getAttribute('data-active')).toBe('true');
    expect(container.querySelector('[data-testid="panel-view-scene"]')?.getAttribute('data-active')).toBe('false');
  });
});
