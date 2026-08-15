import { beforeEach, describe, expect, it } from 'vitest';

import type { PanelContent } from '../types';
import {
  removeAgentCanvasSnapshot,
  resetAgentCanvasWorkspaceSnapshotsForTests,
  switchAgentCanvasWorkspace,
  useAgentCanvasStore,
  useProjectCanvasStore,
} from './canvasStore';

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

describe('agent canvas workspace snapshots', () => {
  beforeEach(() => {
    resetAgentCanvasWorkspaceSnapshotsForTests();
    useAgentCanvasStore.getState().reset();
  });

  it('restores each workspace independently and clears transient interaction state', () => {
    switchAgentCanvasWorkspace(null, 'workspace-a');
    const canvasA = useAgentCanvasStore.getState();
    canvasA.addTab(createContent('a'), 'active', 'primary');
    const tabA = useAgentCanvasStore.getState().primaryGroup.tabs[0];
    canvasA.startDrag(tabA.id, 'primary');
    canvasA.openMissionControl();

    switchAgentCanvasWorkspace('workspace-a', 'workspace-b');
    useAgentCanvasStore.getState().addTab(createContent('b'), 'active', 'primary');
    switchAgentCanvasWorkspace('workspace-b', 'workspace-a');

    const restored = useAgentCanvasStore.getState();
    expect(restored.primaryGroup.tabs.map(tab => tab.title)).toEqual(['a']);
    expect(restored.draggingTabId).toBeNull();
    expect(restored.draggingFromGroupId).toBeNull();
    expect(restored.isMissionControlOpen).toBe(false);
  });

  it('uses workspace ids, so remote workspaces with the same path remain isolated', () => {
    switchAgentCanvasWorkspace(null, 'remote-a');
    useAgentCanvasStore.getState().addTab(createContent('/srv/app:a'), 'active', 'primary');
    switchAgentCanvasWorkspace('remote-a', 'remote-b');
    useAgentCanvasStore.getState().addTab(createContent('/srv/app:b'), 'active', 'primary');

    switchAgentCanvasWorkspace('remote-b', 'remote-a');
    expect(useAgentCanvasStore.getState().primaryGroup.tabs.map(tab => tab.title)).toEqual([
      '/srv/app:a',
    ]);

    switchAgentCanvasWorkspace('remote-a', 'remote-b');
    expect(useAgentCanvasStore.getState().primaryGroup.tabs.map(tab => tab.title)).toEqual([
      '/srv/app:b',
    ]);
  });

  it('does not resurrect the live canvas after its workspace snapshot is removed', () => {
    switchAgentCanvasWorkspace(null, 'workspace-closed');
    useAgentCanvasStore.getState().addTab(createContent('closed'), 'active', 'primary');

    removeAgentCanvasSnapshot('workspace-closed');
    switchAgentCanvasWorkspace('workspace-closed', 'workspace-other');
    switchAgentCanvasWorkspace('workspace-other', 'workspace-closed');

    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(0);
  });

  it('does not persist the no-workspace canvas into a real workspace', () => {
    switchAgentCanvasWorkspace(null, undefined);
    useAgentCanvasStore.getState().addTab(createContent('no-workspace'), 'active', 'primary');

    switchAgentCanvasWorkspace(undefined, 'workspace-real');

    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(0);
  });

  it('keeps the live canvas when the same workspace identity is selected again', () => {
    switchAgentCanvasWorkspace(null, 'workspace-same');
    useAgentCanvasStore.getState().addTab(createContent('live'), 'active', 'primary');

    switchAgentCanvasWorkspace('workspace-same', 'workspace-same');

    expect(useAgentCanvasStore.getState().primaryGroup.tabs.map(tab => tab.title)).toEqual([
      'live',
    ]);
  });
});
