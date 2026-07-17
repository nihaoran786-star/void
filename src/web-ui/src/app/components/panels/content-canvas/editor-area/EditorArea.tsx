import React, { useRef, useCallback, useState } from 'react';
import { EditorGroup } from './EditorGroup';
import { SplitHandle } from './SplitHandle';
import { selectShortDramaTeamPanelPresentation } from './shortDramaTeamPanelPresentation';
import { useCanvasStore } from '../stores';
import type { 
  EditorGroupId, 
  TabDragPayload, 
  DropPosition,
  PanelContent,
} from '../types';
import './EditorArea.scss';

const ShortDramaTeamPanelControls = React.lazy(
  () => import('./ShortDramaTeamPanelControls'),
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
  const containerRef = useRef<HTMLDivElement>(null);
  const topRowRef = useRef<HTMLDivElement>(null);
  const [isShortDramaTeamExpanded, setIsShortDramaTeamExpanded] = useState(false);

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

  const handleTabClose = useCallback((groupId: EditorGroupId) => async (tabId: string) => {
    if (onTabCloseWithDirtyCheck) {
      await onTabCloseWithDirtyCheck(tabId, groupId);
      return;
    }
    closeTab(tabId, groupId);
  }, [closeTab, onTabCloseWithDirtyCheck]);

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

  const shortDramaTeamPresentation = selectShortDramaTeamPanelPresentation({
    splitMode: layout.splitMode,
    primaryGroup,
    secondaryGroup,
    expanded: isShortDramaTeamExpanded,
  });

  const ensureShortDramaTeamOpenRatio = useCallback(() => {
    if (layout.splitRatio < 0.68) {
      setSplitRatio(0.7);
    }
  }, [layout.splitRatio, setSplitRatio]);

  const handleShortDramaTeamToggle = useCallback(() => {
    if (!isShortDramaTeamExpanded) {
      ensureShortDramaTeamOpenRatio();
    }
    setIsShortDramaTeamExpanded(previous => !previous);
  }, [ensureShortDramaTeamOpenRatio, isShortDramaTeamExpanded]);

  const handleShortDramaTeamAgentSelect = useCallback((tabId: string) => {
    switchToTab(tabId, 'secondary');
    setActiveGroup('secondary');
    ensureShortDramaTeamOpenRatio();
    setIsShortDramaTeamExpanded(true);
  }, [ensureShortDramaTeamOpenRatio, setActiveGroup, switchToTab]);

  const renderEditorGroup = (
    groupId: EditorGroupId,
    group: typeof primaryGroup,
    groupSceneActive = isSceneActive,
  ) => (
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
      onCloseAllTabs={handleCloseAllTabs(groupId)}
      onInteraction={onInteraction}
      disablePopOut={disablePopOut}
      onOpenWorkspaceMedia={groupId === 'primary' ? onOpenWorkspaceMedia : undefined}
      onOpenShortDramaCenter={groupId === 'primary' ? onOpenShortDramaCenter : undefined}
    />
  );

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
    const editorAreaStyle = {
      '--short-drama-team-primary-ratio': `${splitRatio * 100}%`,
      '--short-drama-team-secondary-ratio': `${(1 - splitRatio) * 100}%`,
    } as React.CSSProperties;

    return (
      <div
        ref={containerRef}
        className={[
          'canvas-editor-area is-split is-horizontal',
          shortDramaTeamPresentation.status === 'ready' ? 'is-short-drama-team' : '',
          `is-short-drama-team-${shortDramaTeamMode}`,
        ].filter(Boolean).join(' ')}
        data-short-drama-team-mode={shortDramaTeamMode}
        style={editorAreaStyle}
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
