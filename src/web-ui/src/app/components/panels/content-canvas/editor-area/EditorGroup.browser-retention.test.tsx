// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CanvasTab,
  EditorGroupState,
  PanelContentType,
} from '../types';

const panelLifecycle = vi.hoisted(() => ({
  mounts: new Map<string, number>(),
  unmounts: new Map<string, number>(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../tab-bar', () => ({
  TabBar: () => null,
}));

vi.mock('./DropZone', () => ({
  DropZone: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../stores', () => ({
  usePanelViewCanvasStore: {
    getState: () => ({ addTab: vi.fn() }),
  },
}));

vi.mock('../../../../stores/sceneStore', () => ({
  useSceneStore: {
    getState: () => ({ openScene: vi.fn() }),
  },
}));

vi.mock('../../base/FlexiblePanel', async () => {
  const ReactModule = await import('react');
  const FakeFlexiblePanel = (
    { content, isActive }: { content: CanvasTab['content']; isActive: boolean },
  ) => {
    const tabId = content.data.testTabId as string;

    ReactModule.useEffect(() => {
      panelLifecycle.mounts.set(tabId, (panelLifecycle.mounts.get(tabId) ?? 0) + 1);
      return () => {
        panelLifecycle.unmounts.set(tabId, (panelLifecycle.unmounts.get(tabId) ?? 0) + 1);
      };
    }, [tabId]);

    return (
      <div
        data-testid={`panel-${tabId}`}
        data-active={String(isActive)}
        data-content-type={content.type}
      >
        {content.title}
      </div>
    );
  };

  return {
    default: FakeFlexiblePanel,
  };
});

import { EditorGroup } from './EditorGroup';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const createTab = (
  id: string,
  type: PanelContentType,
  lastAccessedAt: number,
  isHidden = false,
): CanvasTab => ({
  id,
  title: id,
  content: { type, title: id, data: { testTabId: id } },
  state: 'active',
  isDirty: false,
  isHidden,
  createdAt: lastAccessedAt,
  lastAccessedAt,
});

describe('EditorGroup browser retention', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    panelLifecycle.mounts.clear();
    panelLifecycle.unmounts.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderGroup = async (group: EditorGroupState, isSceneActive = true) => {
    await act(async () => {
      root.render(
        <EditorGroup
          groupId="primary"
          group={group}
          isActive
          isSceneActive={isSceneActive}
          draggingTabId={null}
          draggingFromGroupId={null}
          splitMode="none"
          onTabClick={vi.fn()}
          onTabDoubleClick={vi.fn()}
          onTabClose={vi.fn()}
          onTabPin={vi.fn()}
          onDragStart={vi.fn()}
          onDragEnd={vi.fn()}
          onReorderTab={vi.fn()}
          onDrop={vi.fn()}
          onGroupFocus={vi.fn()}
          onContentChange={vi.fn()}
          onDirtyStateChange={vi.fn()}
        />,
      );
    });
  };

  it('keeps open browser instances mounted while ordinary tabs obey the five-item cache', async () => {
    const ordinaryTabs = Array.from({ length: 7 }, (_, index) =>
      createTab(`ordinary-${index + 1}`, 'text-viewer', index + 1),
    );
    const browserActive = createTab('browser-active', 'browser', 0);
    const browserBackground = createTab('browser-background', 'browser', 0);
    const hiddenBrowser = createTab('browser-hidden', 'browser', 100, true);
    let tabs = [
      ...ordinaryTabs,
      browserActive,
      browserBackground,
      hiddenBrowser,
    ];

    await renderGroup({ tabs, activeTabId: browserActive.id });

    const activeBrowserNode = container.querySelector('[data-testid="panel-browser-active"]');
    const backgroundBrowserNode = container.querySelector('[data-testid="panel-browser-background"]');
    expect(activeBrowserNode?.getAttribute('data-active')).toBe('true');
    expect(backgroundBrowserNode?.getAttribute('data-active')).toBe('false');
    expect(container.querySelector('[data-testid="panel-browser-hidden"]')).toBeNull();

    await renderGroup({ tabs, activeTabId: browserActive.id }, false);
    expect(container.querySelector('[data-testid="panel-browser-active"]')).toBe(activeBrowserNode);
    expect(activeBrowserNode?.getAttribute('data-active')).toBe('false');

    for (let index = 0; index < ordinaryTabs.length; index += 1) {
      const activeTabId = `ordinary-${index + 1}`;
      tabs = tabs.map(tab => tab.id === activeTabId
        ? { ...tab, lastAccessedAt: 100 + index }
        : tab);
      await renderGroup({ tabs, activeTabId });
    }

    expect(container.querySelector('[data-testid="panel-browser-active"]')).toBe(activeBrowserNode);
    expect(container.querySelector('[data-testid="panel-browser-background"]')).toBe(backgroundBrowserNode);
    expect(activeBrowserNode?.getAttribute('data-active')).toBe('false');
    expect(panelLifecycle.mounts.get('browser-active')).toBe(1);
    expect(panelLifecycle.mounts.get('browser-background')).toBe(1);
    expect(panelLifecycle.unmounts.get('browser-active')).toBeUndefined();
    expect(panelLifecycle.unmounts.get('browser-background')).toBeUndefined();
    expect(container.querySelectorAll('[data-content-type="text-viewer"]')).toHaveLength(5);
    expect(container.querySelector('[data-testid="panel-ordinary-1"]')).toBeNull();
    expect(container.querySelector('[data-testid="panel-ordinary-2"]')).toBeNull();
    expect(panelLifecycle.unmounts.get('ordinary-1')).toBe(1);
    expect(panelLifecycle.unmounts.get('ordinary-2')).toBe(1);

    tabs = [
      { ...browserBackground, content: { ...browserBackground.content, title: 'Updated browser' } },
      ...tabs.filter(tab => tab.id !== browserBackground.id).reverse(),
    ];
    await renderGroup({ tabs, activeTabId: 'ordinary-7' });

    expect(container.querySelector('[data-testid="panel-browser-active"]')).toBe(activeBrowserNode);
    expect(container.querySelector('[data-testid="panel-browser-background"]')).toBe(backgroundBrowserNode);
    expect(panelLifecycle.mounts.get('browser-active')).toBe(1);
    expect(panelLifecycle.mounts.get('browser-background')).toBe(1);

    tabs = tabs.filter(tab => tab.id !== browserActive.id);
    await renderGroup({ tabs, activeTabId: 'ordinary-7' });

    expect(container.querySelector('[data-testid="panel-browser-active"]')).toBeNull();
    expect(panelLifecycle.unmounts.get('browser-active')).toBe(1);
    expect(container.querySelector('[data-testid="panel-browser-background"]')).toBe(backgroundBrowserNode);
  });
});
