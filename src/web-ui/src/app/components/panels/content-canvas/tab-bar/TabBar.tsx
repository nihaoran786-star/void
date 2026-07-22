/**
 * TabBar component.
 * Tab bar container that manages visibility and overflow.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import { PanelRightClose } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/component-library';
import { readWorkspacePresentation } from '@/app/presentation/workspacePresentation';
import { Tab } from './Tab';
import { TabOverflowMenu } from './TabOverflowMenu';
import {
  resolveVisibleTabsCount,
  selectTabStripTabs,
} from './tabBarLayout';
import { WorkspaceMediaEntry } from '../workspace-media/WorkspaceMediaEntry';
import type { CanvasTab, EditorGroupId, TabDragPayload } from '../types';
import { createLogger } from '@/shared/utils/logger';
import './TabBar.scss';

const log = createLogger('TabBar');

export interface TabBarProps {
  /** Tab list */
  tabs: CanvasTab[];
  /** Editor group ID */
  groupId: EditorGroupId;
  /** Active tab ID */
  activeTabId: string | null;
  /** Whether this group is active */
  isActiveGroup: boolean;
  /** Click tab */
  onTabClick: (tabId: string) => void;
  /** Double-click tab */
  onTabDoubleClick: (tabId: string) => void;
  /** Close tab */
  onTabClose: (tabId: string) => Promise<void> | void;
  /** Pin tab */
  onTabPin: (tabId: string) => void;
  /** Drag start */
  onDragStart: (payload: TabDragPayload) => void;
  /** Drag end */
  onDragEnd: () => void;
  /** Dragging tab ID */
  draggingTabId: string | null;
  /** Reorder tab */
  onReorderTab: (tabId: string, newIndex: number) => void;
  /** Open mission control */
  onOpenMissionControl?: () => void;
  /** Close all tabs */
  onCloseAllTabs?: () => Promise<void> | void;
  /** Optional label when the group action has presentation-specific semantics. */
  closeAllTabsLabel?: string;
  /** Whether the group action closes tabs or collapses a presentation panel. */
  groupActionKind?: 'close-all' | 'collapse-panel';
  /** Pop out tab as independent scene */
  onTabPopOut?: (tabId: string) => void;
  workspacePath?: string;
  /** Open workspace media gallery tab */
  onOpenWorkspaceMedia?: () => void;
  /** Open short drama center tab */
  onOpenShortDramaCenter?: () => void;
}

/**
 * Estimate tab width based on title length.
 * - Base padding: 6px * 2 = 12px (left/right)
 * - Gap: 4px
 * - Close button: 16px
 * - Char width: ~7px/char (12px font)
 * - CJK chars: ~12px/char
 */
const estimateTabWidth = (title: string): number => {
  const PADDING = 16; // 8px * 2
  const GAP = 4;
  const CLOSE_BTN = 16;
  const MIN_WIDTH = 80;
  const MAX_WIDTH = 180;
  
  // Estimate title width: CJK ~12px, others ~7px
  let titleWidth = 0;
  for (const char of title) {
    // Simple check: CJK unicode range
    if (char.charCodeAt(0) > 255) {
      titleWidth += 12;
    } else {
      titleWidth += 7;
    }
  }
  
  const estimated = PADDING + titleWidth + GAP + CLOSE_BTN;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, estimated));
};

const tabTitleForWidthEstimate = (tab: CanvasTab, deletedLabel: string): string =>
  tab.fileDeletedFromDisk ? `${tab.title} - ${deletedLabel}` : tab.title;

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  groupId,
  activeTabId,
  isActiveGroup,
  onTabClick,
  onTabDoubleClick,
  onTabClose,
  onTabPin,
  onDragStart,
  onDragEnd,
  draggingTabId,
  onReorderTab,
  onOpenMissionControl,
  onCloseAllTabs,
  closeAllTabsLabel,
  groupActionKind = 'close-all',
  onTabPopOut,
  workspacePath,
  onOpenWorkspaceMedia,
  onOpenShortDramaCenter,
}) => {
  const { t } = useTranslation('components');
  const [visibleTabsCount, setVisibleTabsCount] = useState(tabs.length);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // Track initial layout measurement completion
  const [layoutReady, setLayoutReady] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const tabsListRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  // Cache actual tab widths (keyed by tab.id + title since title affects width)
  const tabWidthCacheRef = useRef<Map<string, number>>(new Map());

  // Filter out hidden tabs
  const visibleTabs = useMemo(() => tabs.filter(t => !t.isHidden), [tabs]);
  const activeSurface = useMemo(() => {
    const activeTab = visibleTabs.find(tab => tab.id === activeTabId);
    if (activeTab?.content.type === 'workspace-media-gallery') {
      return 'media' as const;
    }
    if (activeTab?.content.type === 'short-drama-center') {
      return 'short-drama' as const;
    }
    return null;
  }, [activeTabId, visibleTabs]);
  const workspacePresentation = useMemo(readWorkspacePresentation, []);
  const collapseWorkspaceSurfaceTabs = workspacePresentation === 'minimal'
    && Boolean(onOpenShortDramaCenter);
  const stripTabs = useMemo(
    () => selectTabStripTabs(visibleTabs, collapseWorkspaceSurfaceTabs),
    [collapseWorkspaceSurfaceTabs, visibleTabs],
  );
  
  // Build cache key (id + title because title changes affect width)
  const getTabCacheKey = useCallback(
    (tab: CanvasTab) => `${tab.id}:${tab.title}:${tab.fileDeletedFromDisk ? '1' : '0'}`,
    []
  );

  // Get tab width: use cache if available, otherwise estimate
  const getTabWidth = useCallback((tab: CanvasTab): number => {
    const cacheKey = getTabCacheKey(tab);
    const cached = tabWidthCacheRef.current.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    // Estimated width
    return estimateTabWidth(tabTitleForWidthEstimate(tab, t('tabs.fileDeleted')));
  }, [getTabCacheKey, t]);

  const closeAllLivesInMenu = Boolean(onCloseAllTabs && groupActionKind === 'close-all');
  const hasCollapsedSurfaceTabs = stripTabs.length !== visibleTabs.length;
  const hasPersistentMenuAction = Boolean(
    onOpenMissionControl
    || closeAllLivesInMenu
    || hasCollapsedSurfaceTabs,
  );

  // Compute visible tab count based on DOM measurements
  const calculateVisibleTabs = useCallback(() => {
    if (!containerRef.current || stripTabs.length === 0) {
      setVisibleTabsCount(stripTabs.length);
      setLayoutReady(true);
      return;
    }

    const containerWidth = containerRef.current.clientWidth;
    
    // Measure rendered tabs and update cache
    if (tabsListRef.current) {
      const tabElements = tabsListRef.current.querySelectorAll('.canvas-tab-bar__tab-wrapper');
      tabElements.forEach((el, index) => {
        if (index < stripTabs.length) {
          const width = (el as HTMLElement).offsetWidth;
          if (width > 0) {
            const cacheKey = getTabCacheKey(stripTabs[index]);
            tabWidthCacheRef.current.set(cacheKey, width);
          }
        }
      });
    }
    
    // Total width of all tabs
    const allTabWidths = stripTabs.map(tab => getTabWidth(tab));
    const totalTabsWidth = allTabWidths.reduce((sum, w) => sum + w, 0);
    
    // Base actions width (excluding the overflow menu). Media sessions use one
    // text switcher; presentation collapse remains a visible direct action.
    const mediaEntryWidth = onOpenWorkspaceMedia
      ? (onOpenShortDramaCenter ? 132 : 52)
      : 0;
    const collapseActionWidth = onCloseAllTabs && groupActionKind === 'collapse-panel'
      ? 28
      : 0;
    const baseActionsWidth = mediaEntryWidth + collapseActionWidth + 4;
    // Overflow button width (~50px with badge, 28px with only mission control)
    const overflowBtnWidth = 50;
    // Gap before actions area
    const actionsGap = 8;
    
    // Phase 1: check if all tabs fit without overflow
    // Overflow can be hidden only when mission control entry is not needed
    const availableWithoutOverflow = containerWidth - baseActionsWidth - actionsGap;
    const canFitAll = !hasPersistentMenuAction && totalTabsWidth <= availableWithoutOverflow;
    
    // Compute actual available width
    const actionsWidth = canFitAll ? baseActionsWidth : (baseActionsWidth + overflowBtnWidth);
    const availableWidth = containerWidth - actionsWidth - actionsGap;
    
    // Phase 2: iterate tabs to determine how many fit
    let totalWidth = 0;
    let count = 0;
    
    for (let i = 0; i < stripTabs.length; i++) {
      const tabWidth = allTabWidths[i];
      
      if (totalWidth + tabWidth <= availableWidth) {
        totalWidth += tabWidth;
        count++;
      } else {
        break;
      }
    }

    // A media-session surface has its own explicit Media / Drama switcher.
    // When no complete tab fits, move every real tab into the accessible
    // overflow menu instead of leaving one clipped keyboard target behind.
    const finalCount = resolveVisibleTabsCount(
      count,
      stripTabs.length,
      activeSurface !== null,
    );
    setVisibleTabsCount(finalCount);
    setLayoutReady(true);
  }, [
    stripTabs,
    getTabWidth,
    getTabCacheKey,
    onCloseAllTabs,
    groupActionKind,
    hasPersistentMenuAction,
    onOpenWorkspaceMedia,
    onOpenShortDramaCenter,
    activeSurface,
  ]);

  // Reset to render all tabs when list changes (re-measure)
  useEffect(() => {
    // Reset to show all, then let calculateVisibleTabs recompute
    setVisibleTabsCount(stripTabs.length);
    setLayoutReady(false);
  }, [stripTabs.length]);

  // Use useLayoutEffect to measure right after DOM update
  useLayoutEffect(() => {
    // Wait a frame to ensure tabs are rendered
    const frameId = requestAnimationFrame(() => {
      calculateVisibleTabs();
    });
    
    return () => cancelAnimationFrame(frameId);
  }, [stripTabs, calculateVisibleTabs]);

  // Observe container size changes
  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      // Use requestAnimationFrame to avoid frequent recalculations
      requestAnimationFrame(() => {
        calculateVisibleTabs();
      });
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [calculateVisibleTabs]);

  // Split visible and overflow tabs
  const renderedVisibleTabsCount = layoutReady || activeSurface === null
    ? visibleTabsCount
    : 0;
  const displayedTabs = stripTabs.slice(0, renderedVisibleTabsCount);
  const displayedTabIds = new Set(displayedTabs.map(tab => tab.id));
  const overflowTabs = visibleTabs.filter(tab => !displayedTabIds.has(tab.id));

  // Handle tab drag start
  const handleTabDragStart = useCallback((tab: CanvasTab) => (_e: React.DragEvent) => {
    onDragStart({
      tabId: tab.id,
      sourceGroupId: groupId,
      tab,
    });
  }, [groupId, onDragStart]);

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  // Handle drag leave
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverIndex(null);
    }
  }, []);

  // Handle drop
  const handleDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(null);

    if (!draggingTabId) return;

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      
      // Only reorder within the same group
      if (data.sourceGroupId === groupId) {
        const currentIndex = visibleTabs.findIndex(t => t.id === data.tabId);
        if (currentIndex !== -1 && currentIndex !== targetIndex) {
          onReorderTab(data.tabId, targetIndex);
        }
      }
    } catch (err) {
      log.error('Failed to parse drag data', err);
    }
  }, [draggingTabId, groupId, visibleTabs, onReorderTab]);

  // Clear indicator when drag ends
  useEffect(() => {
    if (!draggingTabId) {
      setDragOverIndex(null);
    }
  }, [draggingTabId]);

  const handleTabListKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!target.classList.contains('canvas-tab__activation')) {
      return;
    }

    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }

    const tabButtons = Array.from(
      tabsListRef.current?.querySelectorAll<HTMLButtonElement>('.canvas-tab__activation') ?? [],
    );
    if (tabButtons.length === 0) {
      return;
    }

    event.preventDefault();
    const currentIndex = tabButtons.indexOf(target as HTMLButtonElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabButtons.length - 1
        : event.key === 'ArrowRight'
          ? (currentIndex + 1) % tabButtons.length
          : (currentIndex - 1 + tabButtons.length) % tabButtons.length;
    const nextTab = tabButtons[nextIndex];
    nextTab?.focus();
    nextTab?.click();
  }, []);

  const hasDisplayedActiveTab = displayedTabs.some(tab => tab.id === activeTabId);

  return (
    <div
      ref={containerRef}
      className={`canvas-tab-bar ${isActiveGroup ? 'is-active-group' : ''}`}
    >
      {/* Tab list */}
      <div
        ref={tabsListRef}
        className="canvas-tab-bar__tabs"
        role="tablist"
        aria-label={t('tabs.openTabs')}
        onKeyDown={handleTabListKeyDown}
      >
        {displayedTabs.map((tab, index) => {
          const targetIndex = visibleTabs.findIndex(
            visibleTab => visibleTab.id === tab.id,
          );
          return (
            <div
              key={tab.id}
              className="canvas-tab-bar__tab-wrapper"
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, targetIndex)}
            >
              {/* Drop indicator */}
              {dragOverIndex === index && draggingTabId && (
                <div className="canvas-tab-drop-indicator" />
              )}

              <Tab
                tab={tab}
                groupId={groupId}
                isActive={activeTabId === tab.id}
                onClick={() => onTabClick(tab.id)}
                onDoubleClick={() => onTabDoubleClick(tab.id)}
                onClose={() => onTabClose(tab.id)}
                onPin={() => onTabPin(tab.id)}
                onDragStart={handleTabDragStart(tab)}
                onDragEnd={onDragEnd}
                isDragging={draggingTabId === tab.id}
                isKeyboardTabStop={
                  activeTabId === tab.id || (!hasDisplayedActiveTab && index === 0)
                }
                onPopOut={onTabPopOut ? () => onTabPopOut(tab.id) : undefined}
              />
            </div>
          );
        })}
      </div>

      {/* Actions area */}
      <div ref={actionsRef} className="canvas-tab-bar__actions">
        {onOpenWorkspaceMedia && (
          <WorkspaceMediaEntry
            workspacePath={workspacePath}
            onOpen={onOpenWorkspaceMedia}
            onOpenShortDrama={onOpenShortDramaCenter}
            activeSurface={activeSurface}
          />
        )}

        {/* Overflow menu (all groups; mission control only in primary) */}
        {visibleTabs.length > 0 && layoutReady && (
          <TabOverflowMenu
            overflowTabs={overflowTabs}
            activeTabId={activeTabId}
            onTabClick={onTabClick}
            onTabClose={onTabClose}
            onTabPin={onTabPin}
            onTabPopOut={onTabPopOut}
            onReorderTab={onReorderTab}
            onOpenMissionControl={onOpenMissionControl}
            onCloseAllTabs={closeAllLivesInMenu ? onCloseAllTabs : undefined}
            closeAllTabsLabel={closeAllTabsLabel}
          />
        )}

        {/* Presentation collapse remains direct and visually distinct. */}
        {onCloseAllTabs && groupActionKind === 'collapse-panel' && visibleTabs.length > 0 && (
          <Tooltip content={closeAllTabsLabel ?? t('tabs.closeAll')} placement="bottom">
            <button
              type="button"
              className="canvas-tab-bar__action-btn canvas-tab-bar__action-btn--collapse-panel"
              aria-label={closeAllTabsLabel ?? t('tabs.closeAll')}
              onClick={async (e) => {
                e.stopPropagation();
                await onCloseAllTabs();
              }}
            >
              <PanelRightClose size={14} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

TabBar.displayName = 'TabBar';

export default TabBar;
