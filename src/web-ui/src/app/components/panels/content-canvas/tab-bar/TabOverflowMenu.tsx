/**
 * TabOverflowMenu component.
 * Provides one consistent "more actions" menu for group-level actions and
 * overflow tabs. The trigger never changes behavior based on tab count.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, LayoutGrid, MoreHorizontal, Pin, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/component-library';
import type { CanvasTab } from '../types';
import './TabOverflowMenu.scss';
export interface TabOverflowMenuProps {
  /** Overflow tabs */
  overflowTabs: CanvasTab[];
  /** Active tab ID */
  activeTabId: string | null;
  /** Tab click callback */
  onTabClick: (tabId: string) => void;
  /** Close tab callback */
  onTabClose: (tabId: string) => Promise<void> | void;
  /** Pin or unpin a hidden tab. */
  onTabPin?: (tabId: string) => void;
  /** Pop a hidden tab out as an independent scene. */
  onTabPopOut?: (tabId: string) => void;
  /** Reorder tab callback (move to index) */
  onReorderTab: (tabId: string, newIndex: number) => void;
  /** Open mission control (optional, only for primary group) */
  onOpenMissionControl?: () => void;
  /** Close every tab in the current group. */
  onCloseAllTabs?: () => Promise<void> | void;
  /** Accessible label for the close-all action. */
  closeAllTabsLabel?: string;
}

export const TabOverflowMenu: React.FC<TabOverflowMenuProps> = ({
  overflowTabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabPin,
  onTabPopOut,
  onReorderTab,
  onOpenMissionControl,
  onCloseAllTabs,
  closeAllTabsLabel,
}) => {
  const { t } = useTranslation('components');
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasOverflow = overflowTabs.length > 0;
  const hasMissionControl = !!onOpenMissionControl;
  const hasCloseAll = !!onCloseAllTabs;

  // Update menu position
  const updateMenuPosition = useCallback(() => {
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      const menuWidth = 240;
      
      // Compute left to keep menu within right boundary
      let left = rect.left;
      if (left + menuWidth > window.innerWidth) {
        left = rect.right - menuWidth;
      }
      
      setMenuPosition({
        top: rect.bottom + 4,
        left: Math.max(8, left),
      });
    }
  }, []);

  // The trigger always opens the same menu. This avoids the previous
  // context-dependent behavior where the icon sometimes navigated directly.
  const handleButtonClick = useCallback(() => {
    if (!isOpen) {
      updateMenuPosition();
    }
    setIsOpen(prev => !prev);
  }, [isOpen, updateMenuPosition]);

  // Close menu on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        wrapperRef.current &&
        !wrapperRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    // Delay listener to avoid triggering the current click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
    return () => cancelAnimationFrame(frameId);
  }, [isOpen]);

  const handleMenuKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );

    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
      return;
    }

    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || items.length === 0) {
      return;
    }

    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowDown'
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  }, []);

  // Handle mission control click
  const handleMissionControlClick = useCallback(() => {
    onOpenMissionControl?.();
    setIsOpen(false);
  }, [onOpenMissionControl]);

  const handleCloseAllClick = useCallback(async () => {
    setIsOpen(false);
    await onCloseAllTabs?.();
  }, [onCloseAllTabs]);

  // Handle tab click
  const handleTabClick = useCallback((tabId: string) => {
    // Move tab to front (index 0) so it becomes visible
    onReorderTab(tabId, 0);
    // Then switch to the tab
    onTabClick(tabId);
    setIsOpen(false);
  }, [onTabClick, onReorderTab]);

  // Handle close click
  const handleCloseClick = useCallback(async (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    await onTabClose(tabId);
  }, [onTabClose]);

  const handlePinClick = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    onTabPin?.(tabId);
  }, [onTabPin]);

  const handlePopOutClick = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    onTabPopOut?.(tabId);
    setIsOpen(false);
  }, [onTabPopOut]);

  const handleItemMiddleMouseDown = useCallback((e: React.MouseEvent, tab: CanvasTab) => {
    if (e.button !== 1) return;
    if (tab.state === 'pinned') return;
    e.preventDefault();
  }, []);

  const handleItemAuxClick = useCallback(
    async (e: React.MouseEvent, tab: CanvasTab) => {
      if (e.button !== 1) return;
      if (tab.state === 'pinned') return;
      e.preventDefault();
      e.stopPropagation();
      await onTabClose(tab.id);
      setIsOpen(false);
    },
    [onTabClose]
  );

  const shouldShowButton = hasOverflow || hasMissionControl || hasCloseAll;
  
  // Hide button when no overflow and no mission control
  if (!shouldShowButton) {
    return null;
  }

  const tooltipContent = hasOverflow
    ? `${t('tabs.moreActions')} · ${t('tabs.hiddenTabsCount', { count: overflowTabs.length })}`
    : t('tabs.moreActions');

  return (
    <div ref={wrapperRef} className="canvas-tab-panorama-wrapper">
      <Tooltip content={tooltipContent} placement="bottom">
        <button
          ref={triggerRef}
          type="button"
          className={`canvas-tab-panorama-btn ${hasOverflow ? 'has-overflow' : ''} ${isOpen ? 'is-open' : ''} ${!hasMissionControl ? 'overflow-only' : ''}`}
          onClick={handleButtonClick}
          aria-label={tooltipContent}
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          <MoreHorizontal size={15} />
          {hasOverflow && (
            <span className="canvas-tab-panorama-btn__badge">
              +{overflowTabs.length}
            </span>
          )}
        </button>
      </Tooltip>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="canvas-tab-overflow-menu"
          role="menu"
          aria-label={t('tabs.moreActions')}
          onKeyDown={handleMenuKeyDown}
          style={{
            position: 'fixed',
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
          }}
        >
          {/* Mission control entry - shown only when available */}
          {hasMissionControl && (
            <>
              <button
                type="button"
                role="menuitem"
                className="canvas-tab-overflow-menu__mission-control"
                onClick={handleMissionControlClick}
              >
                <LayoutGrid size={14} />
                <span>{t('tabs.missionControl')}</span>
              </button>

              {(hasOverflow || hasCloseAll) && (
                <div className="canvas-tab-overflow-menu__divider" />
              )}
            </>
          )}

          {/* Overflow tab list */}
          {hasOverflow && (
            <div className="canvas-tab-overflow-menu__list">
              {overflowTabs.map((tab) => {
                const deletedSuffix = tab.fileDeletedFromDisk ? ` - ${t('tabs.fileDeleted')}` : '';
                const titleWithDeleted = `${tab.title}${deletedSuffix}`;
                return (
                <div
                  key={tab.id}
                  className={`canvas-tab-overflow-menu__item ${
                    activeTabId === tab.id ? 'is-active' : ''
                  } ${tab.isDirty ? 'is-dirty' : ''} ${tab.fileDeletedFromDisk ? 'is-file-deleted' : ''}`}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="canvas-tab-overflow-menu__item-main"
                    onClick={() => handleTabClick(tab.id)}
                    onMouseDown={(e) => handleItemMiddleMouseDown(e, tab)}
                    onAuxClick={(e) => void handleItemAuxClick(e, tab)}
                  >
                    <span className="canvas-tab-overflow-menu__item-title">
                      {tab.state === 'preview' && <em>{titleWithDeleted}</em>}
                      {tab.state !== 'preview' && titleWithDeleted}
                    </span>

                    {tab.isDirty && (
                      <span className="canvas-tab-overflow-menu__item-dirty">●</span>
                    )}
                  </button>

                  <div className="canvas-tab-overflow-menu__item-actions">
                    {onTabPin && (
                      <button
                        type="button"
                        role="menuitem"
                        className="canvas-tab-overflow-menu__item-action"
                        aria-label={tab.state === 'pinned' ? t('tabs.unpin') : t('tabs.pin')}
                        title={tab.state === 'pinned' ? t('tabs.unpin') : t('tabs.pin')}
                        onClick={(e) => handlePinClick(e, tab.id)}
                      >
                        <Pin size={12} />
                      </button>
                    )}

                    {onTabPopOut && (
                      <button
                        type="button"
                        role="menuitem"
                        className="canvas-tab-overflow-menu__item-action"
                        aria-label={t('tabs.popOut')}
                        title={t('tabs.popOut')}
                        onClick={(e) => handlePopOutClick(e, tab.id)}
                      >
                        <ExternalLink size={12} />
                      </button>
                    )}

                    <button
                      type="button"
                      role="menuitem"
                      className="canvas-tab-overflow-menu__item-action canvas-tab-overflow-menu__item-close"
                      aria-label={t('tabs.close')}
                      title={t('tabs.close')}
                      onClick={(e) => handleCloseClick(e, tab.id)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              );
              })}
            </div>
          )}

          {hasCloseAll && (
            <>
              {(hasMissionControl || hasOverflow) && (
                <div className="canvas-tab-overflow-menu__divider" />
              )}
              <button
                type="button"
                role="menuitem"
                className="canvas-tab-overflow-menu__close-all"
                onClick={() => void handleCloseAllClick()}
              >
                <X size={14} />
                <span>{closeAllTabsLabel ?? t('tabs.closeAll')}</span>
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

TabOverflowMenu.displayName = 'TabOverflowMenu';

export default TabOverflowMenu;
