// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionModeStore } from '@/app/stores/sessionModeStore';
import { WelcomePanel } from './WelcomePanel';

const mocks = vi.hoisted(() => ({
  switchWorkspace: vi.fn(),
  openWorkspace: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../infrastructure/api', () => ({
  gitAPI: { isGitRepository: vi.fn().mockResolvedValue(false) },
}));
vi.mock('@/app/hooks/useApp', () => ({
  useApp: () => ({ switchLeftPanelTab: vi.fn() }),
}));
vi.mock('@/infrastructure/contexts/WorkspaceContext', () => ({
  useWorkspaceContext: () => ({
    hasWorkspace: true,
    currentWorkspace: { id: 'current', name: 'Current', rootPath: '/current' },
    openedWorkspacesList: [
      { id: 'current', name: 'Current', rootPath: '/current' },
      { id: 'other', name: 'Other', rootPath: '/other' },
    ],
    openWorkspace: mocks.openWorkspace,
    switchWorkspace: mocks.switchWorkspace,
  }),
}));
vi.mock('@/app/scenes/my-agent/useAgentIdentityDocument', () => ({
  useAgentIdentityDocument: () => ({ document: { name: '' } }),
}));
vi.mock('@/shared/notification-system', () => ({
  useNotification: () => ({ error: mocks.notifyError }),
}));
vi.mock('./SessionModeExampleCards', () => ({
  default: () => <div data-testid="examples" />,
}));

describe('WelcomePanel behavior', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.switchWorkspace.mockReset();
    mocks.openWorkspace.mockReset();
    mocks.notifyError.mockReset();
    useSessionModeStore.setState({ mode: 'code', draftStatus: 'draft' });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useSessionModeStore.setState({ mode: 'code', draftStatus: 'idle' });
  });

  it('uses roving focus and arrow keys for the session mode radio group', async () => {
    await act(async () => { root.render(<WelcomePanel />); });
    const radios = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'));

    expect(radios.map(radio => radio.tabIndex)).toEqual([0, -1, -1]);
    radios[0].focus();
    await act(async () => {
      radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    expect(useSessionModeStore.getState().mode).toBe('cowork');
    expect(document.activeElement).toBe(radios[1]);
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
    expect(radios.map(radio => radio.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('focuses the workspace menu on open and restores the trigger on Escape', async () => {
    await act(async () => { root.render(<WelcomePanel sessionMode="code" />); });
    const trigger = container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute('aria-controls')).toBeTruthy();

    await act(async () => { trigger?.click(); });
    const menu = container.querySelector<HTMLElement>('[role="menu"]');
    const menuItems = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(menuItems[0]);
    expect(menu?.querySelectorAll('[role="separator"]')).toHaveLength(2);
    expect(menu?.querySelector('[role="menuitem"][aria-disabled="true"]')?.textContent)
      .toContain('Current');

    await act(async () => {
      menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(document.activeElement).toBe(menuItems.at(-1));

    await act(async () => {
      menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await Promise.resolve();
    });
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on an outside pointer action without stealing focus from the new target', async () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    await act(async () => { root.render(<WelcomePanel sessionMode="code" />); });
    const trigger = container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
    await act(async () => { trigger?.click(); });

    outside.focus();
    await act(async () => {
      outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('shows a notification when workspace switching fails', async () => {
    mocks.switchWorkspace.mockRejectedValueOnce(new Error('unavailable'));
    await act(async () => { root.render(<WelcomePanel sessionMode="code" />); });
    const trigger = container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
    await act(async () => { trigger?.click(); });
    const other = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .find(item => item.textContent?.includes('Other'));

    await act(async () => {
      other?.click();
      await Promise.resolve();
    });
    expect(mocks.notifyError).toHaveBeenCalledWith('welcome.workspaceSwitchFailed');
  });
});
