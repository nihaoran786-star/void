import { beforeEach, describe, expect, it } from 'vitest';

import type { PanelContent } from '../types';
import { useProjectCanvasStore } from './canvasStore';

const createContent = (title: string): PanelContent => ({
  type: 'workspace-media-gallery',
  title,
  data: { workspacePath: `C:/${title}` },
});

describe('canvasStore reopenClosedTab', () => {
  beforeEach(() => {
    useProjectCanvasStore.getState().reset();
  });

  it('restores a tab into the visible primary group after its split was auto-merged', () => {
    const store = useProjectCanvasStore.getState();
    store.addTab(createContent('primary'), 'active', 'primary');
    store.setSplitMode('horizontal');
    store.addTab(createContent('secondary'), 'active', 'secondary');

    const secondaryTabId = useProjectCanvasStore.getState().secondaryGroup.tabs[0].id;
    store.closeTab(secondaryTabId, 'secondary');

    expect(useProjectCanvasStore.getState().layout.splitMode).toBe('none');

    store.reopenClosedTab();

    const restored = useProjectCanvasStore.getState();
    expect(restored.activeGroupId).toBe('primary');
    expect(restored.primaryGroup.tabs.map(tab => tab.id)).toContain(secondaryTabId);
    expect(restored.secondaryGroup.tabs).toHaveLength(0);
    expect(restored.closedTabs).toHaveLength(0);
  });

  it('maps a closed tertiary tab to the visible secondary group in a two-pane layout', () => {
    const store = useProjectCanvasStore.getState();
    store.addTab(createContent('primary'), 'active', 'primary');
    store.setSplitMode('grid');
    store.addTab(createContent('secondary'), 'active', 'secondary');
    store.addTab(createContent('tertiary'), 'active', 'tertiary');

    const tertiaryTabId = useProjectCanvasStore.getState().tertiaryGroup.tabs[0].id;
    store.closeTab(tertiaryTabId, 'tertiary');

    expect(useProjectCanvasStore.getState().layout.splitMode).toBe('horizontal');

    store.reopenClosedTab();

    const restored = useProjectCanvasStore.getState();
    expect(restored.activeGroupId).toBe('secondary');
    expect(restored.secondaryGroup.tabs.map(tab => tab.id)).toContain(tertiaryTabId);
    expect(restored.tertiaryGroup.tabs).toHaveLength(0);
  });
});

describe('canvasStore tertiary group operations', () => {
  beforeEach(() => {
    useProjectCanvasStore.getState().reset();
  });

  it('moves a tertiary tab into the requested secondary group', () => {
    const store = useProjectCanvasStore.getState();
    store.addTab(createContent('primary'), 'active', 'primary');
    store.setSplitMode('grid');
    store.addTab(createContent('tertiary'), 'active', 'tertiary');

    const tertiaryTabId = useProjectCanvasStore.getState().tertiaryGroup.tabs[0].id;
    store.moveTabToGroup(tertiaryTabId, 'tertiary', 'secondary', 0);

    const moved = useProjectCanvasStore.getState();
    expect(moved.secondaryGroup.tabs.map(tab => tab.id)).toContain(tertiaryTabId);
    expect(moved.tertiaryGroup.tabs).toHaveLength(0);
    expect(moved.activeGroupId).toBe('secondary');
  });

  it('enables grid when a tab moves into the tertiary group', () => {
    const store = useProjectCanvasStore.getState();
    store.addTab(createContent('primary'), 'active', 'primary');
    store.setSplitMode('horizontal');
    store.addTab(createContent('secondary'), 'active', 'secondary');

    const secondaryTabId = useProjectCanvasStore.getState().secondaryGroup.tabs[0].id;
    store.moveTabToGroup(secondaryTabId, 'secondary', 'tertiary', 0);

    const moved = useProjectCanvasStore.getState();
    expect(moved.layout.splitMode).toBe('grid');
    expect(moved.tertiaryGroup.tabs.map(tab => tab.id)).toContain(secondaryTabId);
    expect(moved.activeGroupId).toBe('tertiary');
  });
});
