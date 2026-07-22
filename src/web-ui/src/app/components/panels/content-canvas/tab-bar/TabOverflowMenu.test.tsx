// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => ({
      'tabs.moreActions': 'More actions',
      'tabs.missionControl': 'Mission Control',
      'tabs.closeAll': 'Close All Tabs',
      'tabs.close': 'Close Tab',
      'tabs.pin': 'Pin Tab',
      'tabs.unpin': 'Unpin Tab',
      'tabs.popOut': 'Pop out as scene',
      'tabs.hiddenTabsCount': `${options?.count ?? 0} hidden tabs`,
    })[key] ?? key,
  }),
}));

vi.mock('@/component-library', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { TabOverflowMenu } from './TabOverflowMenu';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('TabOverflowMenu', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('always opens a named menu before running mission control', async () => {
    const onOpenMissionControl = vi.fn();

    await act(async () => {
      root.render(
        <TabOverflowMenu
          overflowTabs={[]}
          activeTabId={null}
          onTabClick={vi.fn()}
          onTabClose={vi.fn()}
          onReorderTab={vi.fn()}
          onOpenMissionControl={onOpenMissionControl}
        />,
      );
    });

    const trigger = container.querySelector('button') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-label')).toBe('More actions');

    act(() => trigger.click());

    expect(onOpenMissionControl).not.toHaveBeenCalled();
    const menu = document.body.querySelector('[role="menu"]') as HTMLDivElement;
    expect(menu).toBeTruthy();
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    expect(document.activeElement?.getAttribute('role')).toBe('menuitem');

    act(() => {
      (menu.querySelector('[role="menuitem"]') as HTMLButtonElement).click();
    });

    expect(onOpenMissionControl).toHaveBeenCalledOnce();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });

  it('keeps the destructive close-all action inside the more menu', async () => {
    const onCloseAllTabs = vi.fn();

    await act(async () => {
      root.render(
        <TabOverflowMenu
          overflowTabs={[]}
          activeTabId={null}
          onTabClick={vi.fn()}
          onTabClose={vi.fn()}
          onReorderTab={vi.fn()}
          onCloseAllTabs={onCloseAllTabs}
        />,
      );
    });

    act(() => {
      (container.querySelector('button') as HTMLButtonElement).click();
    });
    const closeAll = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ).find(button => button.textContent?.includes('Close All Tabs'));

    expect(closeAll).toBeTruthy();
    await act(async () => {
      closeAll?.click();
    });
    expect(onCloseAllTabs).toHaveBeenCalledOnce();
  });

  it('closes with Escape and restores focus to the trigger', async () => {
    await act(async () => {
      root.render(
        <TabOverflowMenu
          overflowTabs={[]}
          activeTabId={null}
          onTabClick={vi.fn()}
          onTabClose={vi.fn()}
          onReorderTab={vi.fn()}
          onOpenMissionControl={vi.fn()}
        />,
      );
    });

    const trigger = container.querySelector('button') as HTMLButtonElement;
    act(() => trigger.click());
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
    });

    const menu = document.body.querySelector('[role="menu"]') as HTMLDivElement;
    act(() => {
      menu.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }));
    });
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
    });

    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps hidden-tab pin, pop-out, and close actions available in the menu', async () => {
    const onTabPin = vi.fn();
    const onTabPopOut = vi.fn();
    const onTabClose = vi.fn();

    await act(async () => {
      root.render(
        <TabOverflowMenu
          overflowTabs={[{
            id: 'media-tab',
            title: 'Media',
            content: { type: 'workspace-media-gallery', title: 'Media' },
            state: 'active',
            isDirty: false,
            createdAt: 1,
            lastAccessedAt: 1,
          }]}
          activeTabId="media-tab"
          onTabClick={vi.fn()}
          onTabClose={onTabClose}
          onTabPin={onTabPin}
          onTabPopOut={onTabPopOut}
          onReorderTab={vi.fn()}
        />,
      );
    });

    act(() => {
      (container.querySelector('button') as HTMLButtonElement).click();
    });

    const getAction = (label: string) =>
      document.body.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);

    act(() => getAction('Pin Tab')?.click());
    expect(onTabPin).toHaveBeenCalledWith('media-tab');

    act(() => getAction('Pop out as scene')?.click());
    expect(onTabPopOut).toHaveBeenCalledWith('media-tab');
    expect(document.body.querySelector('[role="menu"]')).toBeNull();

    act(() => {
      (container.querySelector('button') as HTMLButtonElement).click();
    });
    await act(async () => {
      getAction('Close Tab')?.click();
    });
    expect(onTabClose).toHaveBeenCalledWith('media-tab');
  });
});
