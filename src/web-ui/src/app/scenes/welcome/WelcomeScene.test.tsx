// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WelcomeScene from './WelcomeScene';

const mocks = vi.hoisted(() => ({
  openWorkspace: vi.fn(),
  switchWorkspace: vi.fn(),
  removeWorkspaceFromRecent: vi.fn(),
  openScene: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('@/infrastructure/contexts/WorkspaceContext', () => ({
  useWorkspaceContext: () => ({
    hasWorkspace: false,
    currentWorkspace: null,
    recentWorkspaces: [{
      id: 'recent',
      name: 'Recent project',
      rootPath: '/recent',
      lastAccessed: '2026-08-01T00:00:00.000Z',
    }],
    openWorkspace: mocks.openWorkspace,
    switchWorkspace: mocks.switchWorkspace,
    removeWorkspaceFromRecent: mocks.removeWorkspaceFromRecent,
  }),
}));
vi.mock('@/app/stores/sceneStore', () => ({
  useSceneStore: (selector: (state: { openScene: typeof mocks.openScene }) => unknown) =>
    selector({ openScene: mocks.openScene }),
}));
vi.mock('@/shared/notification-system', () => ({
  useNotification: () => ({ error: mocks.notifyError }),
}));
vi.mock('@/component-library', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('WelcomeScene behavior', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    Object.values(mocks).forEach(mock => mock.mockReset());
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps the last-opened time read-only and exposes deletion as a separate button', async () => {
    await act(async () => { root.render(<WelcomeScene />); });
    const time = container.querySelector('time[datetime="2026-08-01T00:00:00.000Z"]');
    const remove = container.querySelector<HTMLButtonElement>('.welcome-scene__recent-remove-btn');

    expect(time).not.toBeNull();
    expect(time?.closest('button')).toBeNull();
    expect(remove?.getAttribute('aria-label')).toBe('welcomeScene.removeFromRecent');
  });

  it('notifies the user when switching or removing a workspace fails', async () => {
    mocks.switchWorkspace.mockRejectedValueOnce(new Error('switch failed'));
    mocks.removeWorkspaceFromRecent.mockRejectedValueOnce(new Error('remove failed'));
    await act(async () => { root.render(<WelcomeScene />); });

    const switchButton = container.querySelector<HTMLButtonElement>('.welcome-scene__recent-item');
    const removeButton = container.querySelector<HTMLButtonElement>('.welcome-scene__recent-remove-btn');
    await act(async () => {
      switchButton?.click();
      await Promise.resolve();
    });
    await act(async () => {
      removeButton?.click();
      await Promise.resolve();
    });

    expect(mocks.notifyError).toHaveBeenCalledWith('welcomeScene.workspaceSwitchFailed');
    expect(mocks.notifyError).toHaveBeenCalledWith('welcomeScene.workspaceRemoveFailed');
    expect(mocks.openScene).not.toHaveBeenCalled();
  });
});
