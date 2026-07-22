import React, { useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readWorkspacePresentation, type WorkspacePresentation } from '@/app/presentation/workspacePresentation';
import { EditorGroup } from './EditorGroup';
import { SplitHandle } from './SplitHandle';
import {
  selectShortDramaTeamTabCloseAction,
  selectShortDramaTeamLayoutRecovery,
  selectShortDramaTeamPanelPresentation,
} from './shortDramaTeamPanelPresentation';
import { useCanvasStore } from '../stores';
import type { 
  EditorGroupId, 
  TabDragPayload, 
  DropPosition,
  PanelContent,
} from '../types';
import './EditorArea.scss';

const ShortDramaTeamPanelControls = React.lazy(
  () => import('./ShortDramaTeamPanelControlsContainer'),
);

export interface EditorAreaProps {
  workspacePath?: string;
  isSceneActive?: boolean;
  onOpenMissionControl?: () => void;
  onInteraction?: (itemId: string, userInput: string) => Promise<void>;
  onTabCloseWithDirtyCheck?: (tabId: string, groupId: EditorGroupId) => Promise<boolean>;
  onTabCloseAllWithDirtyCheck?: (groupId: EditorGroupId) => Promise<boolean>;
  disablePopOut?: boolean;
  onOpenWorkspaceMedia?: () => void;
  onOpenShortDramaCenter?: () => void;
}

export const EditorArea: React.FC<EditorAreaProps> = ({
  workspacePath,
  isSceneActive = true,
  onOpenMissionControl,
  onInteraction,
  onTabCloseWithDirtyCheck,
  onTabCloseAllWithDirtyCheck,
  disablePopOut = false,
  onOpenWorkspaceMedia,
  onOpenShortDramaCenter,
}) => {
  const { t } = useTranslation('components');
  const containerRef = useRef<HTMLDivElement>(null);
  const topRowRef = useRef<HTMLDivElement>(null);
  const [workspacePresentation, setWorkspacePresentation] =
    useState<WorkspacePresentation>(readWorkspacePresentation);
  // The team-panel styles are gated on the .void-ui--minimal ancestor class
  // applied by the layout. Align the JS gate with that same DOM truth so a
  // stale or divergent module read can never hide the team controls while
  // the panel itself stays styled (or vice versa).
  React.useLayoutEffect(() => {
    const minimal = containerRef.current?.closest('.void-ui--minimal') != null;
    setWorkspacePresentation(minimal ? 'minimal' : 'classic');
  }, []);
  const [
    expandedShortDramaPrimarySurfaceKey,
    setExpandedShortDramaPrimarySurfaceKey,
  ] = useState<string | null>(null);

  const {
    primaryGroup,
    secondaryGroup,
    tertiaryGroup,
    activeGroupId,
    layout,
    draggingTabId,
    draggingFromGroupId,
    switchToTab,
    closeTab,
    closeAllTabs,
    promoteTab,
    togglePinTab,
    startDrag,
    endDrag,
    reorderTab,
    handleDrop,
    moveTabToGroup,
    setSplitRatio,
    setSplitRatio2,
    setActiveGroup,
    updateTabContent,
    setTabDirty,
    setTabFileDeletedFromDisk,
  } = useCanvasStore();

  const handleTabClick = useCallback((groupId: EditorGroupId) => (tabId: string) => {
    switchToTab(tabId, groupId);
  }, [switchToTab]);

  const handleTabDoubleClick = useCallback((groupId: EditorGroupId) => (tabId: string) => {
    promoteTab(tabId, groupId);
  }, [promoteTab]);

  const handleCloseAllTabs = useCallback((groupId: EditorGroupId) => async () => {
    if (onTabCloseAllWithDirtyCheck) {
      await onTabCloseAllWithDirtyCheck(groupId);
      return;
    }
    closeAllTabs(groupId);
  }, [closeAllTabs, onTabCloseAllWithDirtyCheck]);

  const handleTabPin = useCallback((groupId: EditorGroupId) => (tabId: string) => {
    togglePinTab(tabId, groupId);
  }, [togglePinTab]);

  const handleDragStart = useCallback((payload: TabDragPayload) => {
    startDrag(payload.tabId, payload.sourceGroupId);
  }, [startDrag]);

  const handleDragEnd = useCallback(() => {
    endDrag();
  }, [endDrag]);

  const handleReorderTab = useCallback((groupId: EditorGroupId) => (tabId: string, newIndex: number) => {
    reorderTab(tabId, groupId, newIndex);
  }, [reorderTab]);

  const handleDropOnGroup = useCallback((groupId: EditorGroupId) => (position: DropPosition) => {
    if (draggingTabId && draggingFromGroupId) {
      handleDrop(draggingTabId, draggingFromGroupId, groupId, position);
      endDrag();
    }
  }, [draggingTabId, draggingFromGroupId, handleDrop, endDrag]);

  const handleGroupFocus = useCallback((groupId: EditorGroupId) => () => {
    setActiveGroup(groupId);
  }, [setActiveGroup]);

  const handleContentChange = useCallback((groupId: EditorGroupId) => (tabId: string, content: PanelContent) => {
    updateTabContent(tabId, groupId, content);
  }, [updateTabContent]);

  const handleDirtyStateChange = useCallback((groupId: EditorGroupId) => (tabId: string, isDirty: boolean) => {
    setTabDirty(tabId, groupId, isDirty);
  }, [setTabDirty]);

  const handleTabFileDeletedFromDiskChange = useCallback(
    (groupId: EditorGroupId) => (tabId: string, missing: boolean) => {
      setTabFileDeletedFromDisk(tabId, groupId, missing);
    },
    [setTabFileDeletedFromDisk]
  );

  const shortDramaTeamPresentation = React.useMemo(
    () => selectShortDramaTeamPanelPresentation({
      presentation: workspacePresentation,
      splitMode: layout.splitMode,
      primaryGroup,
      secondaryGroup,
      expandedPrimarySurfaceKey: expandedShortDramaPrimarySurfaceKey,
    }),
    [
      expandedShortDramaPrimarySurfaceKey,
      layout.splitMode,
      primaryGroup,
      secondaryGroup,
      workspacePresentation,
    ],
  );
  const shortDramaTeamLayoutRecovery = React.useMemo(
    () => selectShortDramaTeamLayoutRecovery({
      presentation: workspacePresentation,
      splitMode: layout.splitMode,
      primaryGroup,
      secondaryGroup,
    }),
    [
      layout.splitMode,
      primaryGroup,
      secondaryGroup,
      workspacePresentation,
    ],
  );
  React.useLayoutEffect(() => {
    if (shortDramaTeamLayoutRecovery.status !== 'recoverable') {
      return;
    }

    const activePrimaryTabWasMisplaced = shortDramaTeamLayoutRecovery.misplacedTabs
      .some(tab => tab.tabId === primaryGroup.activeTabId);
    shortDramaTeamLayoutRecovery.misplacedTabs.forEach((tab, index) => {
      moveTabToGroup(tab.tabId, tab.fromGroupId, 'secondary', index);
    });
    if (activePrimaryTabWasMisplaced) {
      switchToTab(
        shortDramaTeamLayoutRecovery.primarySurfaceTabId,
        'primary',
      );
    }
  }, [
    moveTabToGroup,
    primaryGroup.activeTabId,
    shortDramaTeamLayoutRecovery,
    switchToTab,
  ]);
  const shortDramaTeamIdentity = shortDramaTeamPresentation.status === 'ready'
    ? shortDramaTeamPresentation.teamIdentity
    : null;
  React.useLayoutEffect(() => {
    setExpandedShortDramaPrimarySurfaceKey(null);
  }, [shortDramaTeamIdentity]);

  const handleShortDramaTeamToggle = useCallback(() => {
    if (
      shortDramaTeamPresentation.status !== 'ready'
      || shortDramaTeamPresentation.tabs.length === 0
    ) {
      return;
    }
    setExpandedShortDramaPrimarySurfaceKey(current => (
      current === shortDramaTeamPresentation.primarySurfaceKey
        ? null
        : shortDramaTeamPresentation.primarySurfaceKey
    ));
  }, [shortDramaTeamPresentation]);

  const handleShortDramaTeamCollapse = useCallback(() => {
    setExpandedShortDramaPrimarySurfaceKey(null);
  }, []);

  const handleTabClose = useCallback((groupId: EditorGroupId) => async (tabId: string) => {
    if (selectShortDramaTeamTabCloseAction({
      groupId,
      tabId,
      presentation: shortDramaTeamPresentation,
    }) === 'collapse-team') {
      handleShortDramaTeamCollapse();
      return;
    }
    if (onTabCloseWithDirtyCheck) {
      await onTabCloseWithDirtyCheck(tabId, groupId);
      return;
    }
    closeTab(tabId, groupId);
  }, [
    closeTab,
    handleShortDramaTeamCollapse,
    onTabCloseWithDirtyCheck,
    shortDramaTeamPresentation,
  ]);

  const handleShortDramaTeamAgentSelect = useCallback((tabId: string) => {
    if (shortDramaTeamPresentation.status !== 'ready') {
      return;
    }
    switchToTab(tabId, 'secondary');
    setActiveGroup('secondary');
    setExpandedShortDramaPrimarySurfaceKey(
      shortDramaTeamPresentation.primarySurfaceKey,
    );
  }, [
    setActiveGroup,
    shortDramaTeamPresentation,
    switchToTab,
  ]);

  const renderEditorGroup = (
    groupId: EditorGroupId,
    group: typeof primaryGroup,
    groupSceneActive = isSceneActive,
  ) => {
    const closesShortDramaTeam = (
      groupId === 'secondary'
      && shortDramaTeamPresentation.status === 'ready'
    );

    return (
      <EditorGroup
      groupId={groupId}
      group={group}
      isActive={activeGroupId === groupId}
      isSceneActive={groupSceneActive}
      draggingTabId={draggingTabId}
      draggingFromGroupId={draggingFromGroupId}
      splitMode={layout.splitMode}
      workspacePath={workspacePath}
      onTabClick={handleTabClick(groupId)}
      onTabDoubleClick={handleTabDoubleClick(groupId)}
      onTabClose={handleTabClose(groupId)}
      onTabPin={handleTabPin(groupId)}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onReorderTab={handleReorderTab(groupId)}
      onDrop={handleDropOnGroup(groupId)}
      onGroupFocus={handleGroupFocus(groupId)}
      onContentChange={handleContentChange(groupId)}
      onDirtyStateChange={handleDirtyStateChange(groupId)}
      onTabFileDeletedFromDiskChange={handleTabFileDeletedFromDiskChange(groupId)}
      onOpenMissionControl={groupId === 'primary' ? onOpenMissionControl : undefined}
      onCloseAllTabs={
        closesShortDramaTeam
          ? handleShortDramaTeamCollapse
          : handleCloseAllTabs(groupId)
      }
      closeAllTabsLabel={
        closesShortDramaTeam
          ? t('canvas.collapseShortDramaTeam')
          : undefined
      }
      groupActionKind={closesShortDramaTeam ? 'collapse-panel' : 'close-all'}
      onInteraction={onInteraction}
      disablePopOut={disablePopOut}
      onOpenWorkspaceMedia={groupId === 'primary' ? onOpenWorkspaceMedia : undefined}
      onOpenShortDramaCenter={groupId === 'primary' ? onOpenShortDramaCenter : undefined}
    />
    );
  };

  const { splitMode, splitRatio, splitRatio2 } = layout;

  if (splitMode === 'none') {
    return (
      <div ref={containerRef} className="canvas-editor-area">
        <div className="canvas-editor-area__primary">
          {renderEditorGroup('primary', primaryGroup)}
        </div>
      </div>
    );
  }

  if (splitMode === 'horizontal') {
    const shortDramaTeamMode = shortDramaTeamPresentation.mode;
    const isSecondarySceneActive = isSceneActive && (
      shortDramaTeamPresentation.status !== 'ready' || shortDramaTeamMode !== 'rail'
    );

    return (
      <div
        ref={containerRef}
        className={[
          'canvas-editor-area is-split is-horizontal',
          shortDramaTeamPresentation.status === 'ready' ? 'is-short-drama-team' : '',
          `is-short-drama-team-${shortDramaTeamMode}`,
        ].filter(Boolean).join(' ')}
        data-short-drama-team-mode={shortDramaTeamMode}
      >
        <div className="canvas-editor-area__primary" style={{ width: `${splitRatio * 100}%` }}>
          {renderEditorGroup('primary', primaryGroup)}
        </div>
        <SplitHandle
          direction="horizontal"
          ratio={splitRatio}
          onRatioChange={setSplitRatio}
          containerRef={containerRef}
        />
        <div className="canvas-editor-area__secondary" style={{ width: `${(1 - splitRatio) * 100}%` }}>
          {renderEditorGroup('secondary', secondaryGroup, isSecondarySceneActive)}
          {shortDramaTeamPresentation.status === 'ready' && (
            <React.Suspense fallback={null}>
              <ShortDramaTeamPanelControls
                mode={shortDramaTeamPresentation.mode}
                tabs={shortDramaTeamPresentation.tabs}
                activeTabId={shortDramaTeamPresentation.activeTabId}
                onToggle={handleShortDramaTeamToggle}
                onSelectTab={handleShortDramaTeamAgentSelect}
              />
            </React.Suspense>
          )}
        </div>
      </div>
    );
  }

  if (splitMode === 'vertical') {
    return (
      <div ref={containerRef} className="canvas-editor-area is-split is-vertical">
        <div className="canvas-editor-area__primary" style={{ height: `${splitRatio * 100}%` }}>
          {renderEditorGroup('primary', primaryGroup)}
        </div>
        <SplitHandle
          direction="vertical"
          ratio={splitRatio}
          onRatioChange={setSplitRatio}
          containerRef={containerRef}
        />
        <div className="canvas-editor-area__secondary" style={{ height: `${(1 - splitRatio) * 100}%` }}>
          {renderEditorGroup('secondary', secondaryGroup)}
        </div>
      </div>
    );
  }

  if (splitMode === 'grid') {
    return (
      <div ref={containerRef} className="canvas-editor-area is-grid">
        <div ref={topRowRef} className="canvas-editor-area__top-row" style={{ flex: `0 0 calc(${splitRatio * 100}% - 2px)` }}>
          <div className="canvas-editor-area__primary" style={{ flex: `0 0 calc(${splitRatio2 * 100}% - 2px)` }}>
            {renderEditorGroup('primary', primaryGroup)}
          </div>
          <SplitHandle
            direction="horizontal"
            ratio={splitRatio2}
            onRatioChange={setSplitRatio2}
            containerRef={topRowRef}
          />
          <div className="canvas-editor-area__secondary" style={{ flex: 1, minWidth: 0 }}>
            {renderEditorGroup('secondary', secondaryGroup)}
          </div>
        </div>
        <SplitHandle
          direction="vertical"
          ratio={splitRatio}
          onRatioChange={setSplitRatio}
          containerRef={containerRef}
        />
        <div className="canvas-editor-area__tertiary" style={{ flex: 1, minHeight: 0 }}>
          {renderEditorGroup('tertiary', tertiaryGroup)}
        </div>
      </div>
    );
  }

  return null;
};

EditorArea.displayName = 'EditorArea';

export default EditorArea;
