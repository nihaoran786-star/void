/**
 * FlowChat header.
 * Shows the currently viewed turn and user message.
 * Height matches side panel headers (40px).
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Crosshair,
  GitPullRequest,
  List,
  MoreHorizontal,
  PictureInPicture2,
  Search,
  X,
} from 'lucide-react';
import { IconButton, Input } from '@/component-library';
import { useTranslation } from 'react-i18next';
import { SessionFilesBadge } from './SessionFilesBadge';
import { useWorkspaceContext } from '@/infrastructure/contexts/WorkspaceContext';
import { createReviewPlatformTab } from '@/shared/utils/tabUtils';
import { useFlowChatPresentationActive } from './FlowChatPresentationActivity';
import './FlowChatHeader.scss';

export interface FlowChatHeaderTurnSummary {
  turnId: string;
  turnIndex: number;
  title: string;
}

export interface FlowChatHeaderSubagentSummary {
  sessionId: string;
  title: string;
  agentType?: string;
  status: 'processing' | 'finishing';
}

export interface FlowChatHeaderProps {
  /** Current turn index. */
  currentTurn: number;
  /** Total turns. */
  totalTurns: number;
  /**
   * Current user message. No longer displayed — the header is an action
   * cluster, not a bar — but kept in the contract so existing callers and the
   * turn-pin flow do not change shape.
   */
  currentUserMessage?: string;
  /** Whether the header is visible. */
  visible: boolean;
  /** Session ID. */
  sessionId?: string;
  /** Ordered turn summaries used by header navigation. */
  turns?: FlowChatHeaderTurnSummary[];
  /** Jump to a specific turn. Return false when the container rejects the selection and the list should stay open. */
  onJumpToTurn?: (turnId: string) => boolean | void;
  /** Jump to the currently displayed turn. */
  onJumpToCurrentTurn?: () => void;
  /** Jump to the previous turn. */
  onJumpToPreviousTurn?: () => void;
  /** Jump to the next turn. */
  onJumpToNextTurn?: () => void;
  /** Current search query string. */
  searchQuery?: string;
  /** Called when the user types in the search box. */
  onSearchChange?: (query: string) => void;
  /** Total number of search matches. */
  searchMatchCount?: number;
  /** 1-based index of the currently focused match. */
  searchCurrentMatch?: number;
  /** Navigate to the next match. */
  onSearchNext?: () => void;
  /** Navigate to the previous match. */
  onSearchPrev?: () => void;
  /** Called when the user closes the search bar. */
  onSearchClose?: () => void;
  /** Increments each time the parent requests to open the search bar. */
  searchOpenRequest?: number;
  /** Running background subagents launched by the active parent session. */
  backgroundSubagents?: FlowChatHeaderSubagentSummary[];
  /** Open a background subagent in the right-side panel. */
  onOpenBackgroundSubagent?: (sessionId: string) => void;
  /** Show the compact floating-chat / preview-first action in the chat header. */
  showPreviewFirstToggle?: boolean;
  /** Whether preview-first is currently active. */
  isPreviewFirstActive?: boolean;
  /** Toggle preview-first / compact floating chat presentation. */
  onPreviewFirstToggle?: () => void;
}
export const FlowChatHeader: React.FC<FlowChatHeaderProps> = ({
  currentTurn,
  totalTurns,
  visible,
  sessionId,
  turns = [],
  onJumpToTurn,
  onJumpToCurrentTurn,
  onJumpToPreviousTurn,
  onJumpToNextTurn,
  searchQuery = '',
  onSearchChange,
  searchMatchCount = 0,
  searchCurrentMatch = 0,
  onSearchNext,
  onSearchPrev,
  onSearchClose,
  searchOpenRequest = 0,
  backgroundSubagents = [],
  onOpenBackgroundSubagent,
  showPreviewFirstToggle = false,
  isPreviewFirstActive = false,
  onPreviewFirstToggle,
}) => {
  const { t } = useTranslation('flow-chat');
  const { currentWorkspace } = useWorkspaceContext();
  const isPresentationActive = useFlowChatPresentationActive();
  const [isTurnListOpen, setIsTurnListOpen] = useState(false);
  const [isSubagentListOpen, setIsSubagentListOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const turnListRef = useRef<HTMLDivElement | null>(null);
  const subagentListRef = useRef<HTMLDivElement | null>(null);
  const subagentButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreActionsRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const activeTurnItemRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const hasConversationHeader = visible && totalTurns > 0;

  const turnListTooltip = t('flowChatHeader.turnList', {
    defaultValue: 'Turn list',
  });
  const untitledTurnLabel = t('flowChatHeader.untitledTurn', {
    defaultValue: 'Untitled turn',
  });
  const moreActionsLabel = t('flowChatHeader.moreActions', {
    defaultValue: 'More actions',
  });
  const previousTurnDisabled = currentTurn <= 1;
  const nextTurnDisabled = currentTurn <= 0 || currentTurn >= totalTurns;
  const hasTurnNavigation = turns.length > 0 && !!onJumpToTurn;
  const hasBackgroundSubagents = backgroundSubagents.length > 0;
  const displayTurns = useMemo(() => (
    turns.map(turn => ({
      ...turn,
      title: turn.title.trim() || untitledTurnLabel,
    }))
  ), [turns, untitledTurnLabel]);
  const displayBackgroundSubagents = useMemo(() => (
    backgroundSubagents.map((subagent) => ({
      ...subagent,
      title: subagent.title.trim() || t('flowChatHeader.backgroundSubagentUntitled', {
        defaultValue: 'Background subagent',
      }),
    }))
  ), [backgroundSubagents, t]);
  const hasNoResults = searchQuery.trim().length > 0 && searchMatchCount === 0;

  useEffect(() => {
    if (
      !isPresentationActive
      || (!isTurnListOpen && !isSubagentListOpen && !isMoreMenuOpen)
    ) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedOutsideMore = !moreActionsRef.current?.contains(target);
      if (
        !turnListRef.current?.contains(target) &&
        !subagentListRef.current?.contains(target) &&
        clickedOutsideMore
      ) {
        setIsTurnListOpen(false);
        setIsSubagentListOpen(false);
      }
      if (isMoreMenuOpen && clickedOutsideMore) {
        setIsMoreMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsTurnListOpen(false);
        setIsSubagentListOpen(false);
        if (isTurnListOpen) {
          requestAnimationFrame(() => moreButtonRef.current?.focus());
        }
        if (isSubagentListOpen) {
          requestAnimationFrame(() => subagentButtonRef.current?.focus());
        }
        if (isMoreMenuOpen) {
          setIsMoreMenuOpen(false);
          requestAnimationFrame(() => moreButtonRef.current?.focus());
        }
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMoreMenuOpen, isPresentationActive, isSubagentListOpen, isTurnListOpen]);

  useEffect(() => {
    if (isPresentationActive) return;
    setIsTurnListOpen(false);
    setIsSubagentListOpen(false);
    setIsSearchOpen(false);
    setIsMoreMenuOpen(false);
  }, [isPresentationActive]);

  const prevSearchOpenRequestRef = useRef(0);
  useEffect(() => {
    if (!isPresentationActive) return;
    if (searchOpenRequest > 0 && searchOpenRequest !== prevSearchOpenRequestRef.current) {
      prevSearchOpenRequestRef.current = searchOpenRequest;
      setIsSearchOpen(true);
    }
  }, [isPresentationActive, searchOpenRequest]);

  useEffect(() => {
    setIsTurnListOpen(false);
  }, [currentTurn]);

  useEffect(() => {
    if (!hasBackgroundSubagents) {
      setIsSubagentListOpen(false);
    }
  }, [hasBackgroundSubagents]);

  useEffect(() => {
    if (!isPresentationActive || !isSearchOpen) return;

    const frameId = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [isPresentationActive, isSearchOpen]);

  useEffect(() => {
    if (!isPresentationActive || !isTurnListOpen) return;

    const frameId = requestAnimationFrame(() => {
      activeTurnItemRef.current?.focus({ preventScroll: true });
      activeTurnItemRef.current?.scrollIntoView({
        block: 'center',
        inline: 'nearest',
      });
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [currentTurn, displayTurns.length, isPresentationActive, isTurnListOpen]);

  useEffect(() => {
    if (!isPresentationActive || !isMoreMenuOpen) return;

    const frameId = requestAnimationFrame(() => {
      const firstEnabledItem = moreMenuRef.current?.querySelector<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      );
      firstEnabledItem?.focus();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [isMoreMenuOpen, isPresentationActive]);

  const handleOpenSearch = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  const handleCloseSearch = useCallback(() => {
    setIsSearchOpen(false);
    onSearchClose?.();
  }, [onSearchClose]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        handleCloseSearch();
        e.preventDefault();
        return;
      }

      if (e.key === 'Enter') {
        if (e.shiftKey) {
          onSearchPrev?.();
        } else {
          onSearchNext?.();
        }
        e.preventDefault();
      }
    },
    [handleCloseSearch, onSearchNext, onSearchPrev],
  );

  const handleToggleSubagentList = () => {
    if (!hasBackgroundSubagents) return;
    setIsTurnListOpen(false);
    setIsMoreMenuOpen(false);
    setIsSubagentListOpen(prev => !prev);
  };

  const closeMoreMenu = useCallback((restoreFocus = false) => {
    setIsMoreMenuOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => moreButtonRef.current?.focus());
    }
  }, []);

  const handleToggleMoreMenu = useCallback(() => {
    setIsTurnListOpen(false);
    setIsSubagentListOpen(false);
    setIsMoreMenuOpen(prev => !prev);
  }, []);

  const handleMoreMenuKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const enabledItems = Array.from(
      moreMenuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? [],
    );
    if (enabledItems.length === 0) return;

    const currentIndex = enabledItems.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown') {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % enabledItems.length;
    } else if (event.key === 'ArrowUp') {
      nextIndex = currentIndex < 0
        ? enabledItems.length - 1
        : (currentIndex - 1 + enabledItems.length) % enabledItems.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = enabledItems.length - 1;
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMoreMenu(true);
      return;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      enabledItems[nextIndex]?.focus();
    }
  }, [closeMoreMenu]);

  const handleOpenTurnListFromMenu = useCallback(() => {
    if (!hasTurnNavigation) return;
    closeMoreMenu();
    setIsSubagentListOpen(false);
    setIsTurnListOpen(true);
  }, [closeMoreMenu, hasTurnNavigation]);

  const runMoreMenuAction = useCallback((action?: () => void, restoreFocus = true) => {
    closeMoreMenu(restoreFocus);
    action?.();
  }, [closeMoreMenu]);

  const handleOpenPullRequests = useCallback(() => {
    createReviewPlatformTab(currentWorkspace?.rootPath);
  }, [currentWorkspace?.rootPath]);

  const handleTurnSelect = (turnId: string) => {
    if (!onJumpToTurn) return;
    const accepted = onJumpToTurn(turnId);
    if (accepted === false) {
      return;
    }
    setIsTurnListOpen(false);
    closeMoreMenu(true);
  };

  const handleSubagentSelect = (sessionId: string) => {
    onOpenBackgroundSubagent?.(sessionId);
    setIsSubagentListOpen(false);
  };

  if (!hasConversationHeader) {
    return null;
  }

  // The header is no longer a full-width bar over the transcript. It is one
  // floating action cluster in the top-right corner: session actions, the
  // background-subagent chip, search when open, and the more menu. Turn
  // navigation lives inside the more menu.
  return (
    <div className="flowchat-header">
      <div className="flowchat-header__actions">
        {isPresentationActive && (
          <SessionFilesBadge sessionId={sessionId} />
        )}

        {hasBackgroundSubagents && (
          <div className="flowchat-header__subagent-nav" ref={subagentListRef}>
            <IconButton
              ref={subagentButtonRef}
              className={`flowchat-header__subagent-nav-button${isSubagentListOpen ? ' flowchat-header__subagent-nav-button--active' : ''}`}
              variant="ghost"
              size="xs"
              onClick={handleToggleSubagentList}
              tooltip={t('flowChatHeader.backgroundSubagents', {
                count: backgroundSubagents.length,
                defaultValue: 'Running background subagents',
              })}
              aria-label={t('flowChatHeader.backgroundSubagents', {
                count: backgroundSubagents.length,
                defaultValue: 'Running background subagents',
              })}
              aria-expanded={isSubagentListOpen}
              aria-haspopup="dialog"
              data-testid="flowchat-header-background-subagents"
            >
              <span className="flowchat-header__subagent-nav-button-inner">
                <Bot size={14} />
                <span
                  className="flowchat-header__subagent-status-dot"
                  aria-hidden="true"
                />
              </span>
            </IconButton>

            {isSubagentListOpen && (
              <div
                className="flowchat-header__subagent-list-panel"
                role="dialog"
                aria-label={t('flowChatHeader.backgroundSubagents', {
                  count: backgroundSubagents.length,
                  defaultValue: 'Running background subagents',
                })}
              >
                <div className="flowchat-header__subagent-list-header">
                  <span>
                    {t('flowChatHeader.backgroundSubagents', {
                      count: backgroundSubagents.length,
                      defaultValue: 'Running background subagents',
                    })}
                  </span>
                  <span>{backgroundSubagents.length}</span>
                </div>
                <div className="flowchat-header__subagent-list">
                  {displayBackgroundSubagents.map((subagent) => (
                    <button
                      key={subagent.sessionId}
                      type="button"
                      className="flowchat-header__subagent-list-item"
                      onClick={() => handleSubagentSelect(subagent.sessionId)}
                    >
                      <span className="flowchat-header__subagent-list-title">
                        {subagent.title}
                      </span>
                      <span className="flowchat-header__subagent-list-meta">
                        {[
                          subagent.agentType,
                          subagent.status === 'finishing'
                            ? t('flowChatHeader.subagentStatusFinishing', {
                                defaultValue: 'Finishing',
                              })
                            : t('flowChatHeader.subagentStatusProcessing', {
                                defaultValue: 'Running',
                              }),
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {isSearchOpen && (
          <div className="flowchat-header__search" role="search" data-testid="flowchat-header-search-bar">
            <Input
              ref={searchInputRef}
              className="flowchat-header__search-field"
              variant="filled"
              inputSize="small"
              prefix={<Search size={12} className="flowchat-header__search-prefix-icon" aria-hidden="true" />}
              suffix={
                <span className="flowchat-header__search-inline-controls">
                  <span className="flowchat-header__search-count" aria-live="polite">
                    {searchQuery.trim()
                      ? hasNoResults
                        ? t('flowChatHeader.searchNoResults', { defaultValue: 'No results' })
                        : t('flowChatHeader.searchResult', {
                          current: searchCurrentMatch,
                          total: searchMatchCount,
                          defaultValue: `${searchCurrentMatch} / ${searchMatchCount}`,
                        })
                      : null}
                  </span>
                  <span className="flowchat-header__search-nav">
                    <button
                      className="flowchat-header__search-nav-btn"
                      onClick={onSearchPrev}
                      disabled={searchMatchCount === 0}
                      title={t('flowChatHeader.searchPrevious', { defaultValue: 'Previous match' })}
                      aria-label={t('flowChatHeader.searchPrevious', { defaultValue: 'Previous match' })}
                      type="button"
                    >
                      <ChevronUp size={10} />
                    </button>
                    <button
                      className="flowchat-header__search-nav-btn"
                      onClick={onSearchNext}
                      disabled={searchMatchCount === 0}
                      title={t('flowChatHeader.searchNext', { defaultValue: 'Next match' })}
                      aria-label={t('flowChatHeader.searchNext', { defaultValue: 'Next match' })}
                      type="button"
                    >
                      <ChevronDown size={10} />
                    </button>
                  </span>
                </span>
              }
              type="text"
              value={searchQuery}
              onChange={e => onSearchChange?.(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={t('flowChatHeader.searchPlaceholder', { defaultValue: 'Search messages' })}
              aria-label={t('flowChatHeader.searchPlaceholder', { defaultValue: 'Search messages' })}
              error={hasNoResults}
            />
            <IconButton
              className="flowchat-header__search-close"
              variant="ghost"
              size="xs"
              onClick={handleCloseSearch}
              tooltip={t('flowChatHeader.searchClose', { defaultValue: 'Close search' })}
              aria-label={t('flowChatHeader.searchClose', { defaultValue: 'Close search' })}
            >
              <X size={14} />
            </IconButton>
          </div>
        )}

        <div className="flowchat-header__turn-nav" ref={turnListRef}>
          {isTurnListOpen && hasTurnNavigation && (
            <div className="flowchat-header__turn-list-panel" role="dialog" aria-label={turnListTooltip}>
              <div className="flowchat-header__turn-list-header">
                <span>{turnListTooltip}</span>
                <span>{currentTurn}/{totalTurns}</span>
              </div>
              <div className="flowchat-header__turn-list">
                {displayTurns.map(turn => (
                  <button
                    key={turn.turnId}
                    type="button"
                    className={`flowchat-header__turn-list-item${turn.turnIndex === currentTurn ? ' flowchat-header__turn-list-item--active' : ''}`}
                    onClick={() => handleTurnSelect(turn.turnId)}
                    ref={turn.turnIndex === currentTurn ? activeTurnItemRef : undefined}
                  >
                    <span className="flowchat-header__turn-list-badge">
                      {t('flowChatHeader.turnBadge', {
                        current: turn.turnIndex,
                        defaultValue: `Turn ${turn.turnIndex}`,
                      })}
                    </span>
                    <span className="flowchat-header__turn-list-title">{turn.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {hasConversationHeader && (
          <div className="flowchat-header__more-actions" ref={moreActionsRef}>
            <IconButton
              ref={moreButtonRef}
              className={`flowchat-header__more-button${isMoreMenuOpen ? ' flowchat-header__more-button--active' : ''}`}
              variant="ghost"
              size="xs"
              onClick={handleToggleMoreMenu}
              tooltip={moreActionsLabel}
              aria-label={moreActionsLabel}
              aria-haspopup="menu"
              aria-expanded={isMoreMenuOpen}
              data-testid="flowchat-header-more-actions"
            >
              <MoreHorizontal size={14} />
            </IconButton>

            {isMoreMenuOpen && (
              <div
                ref={moreMenuRef}
                className="flowchat-header__more-menu"
                role="menu"
                aria-label={moreActionsLabel}
                onKeyDown={handleMoreMenuKeyDown}
              >
              <button
                type="button"
                role="menuitem"
                className="flowchat-header__more-menu-item"
                onClick={() => runMoreMenuAction(handleOpenPullRequests)}
                data-testid="flowchat-header-pull-requests"
              >
                <GitPullRequest size={14} aria-hidden="true" />
                <span>{t('flowChatHeader.pullRequests', { defaultValue: 'Pull requests' })}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="flowchat-header__more-menu-item"
                onClick={() => runMoreMenuAction(handleOpenSearch, false)}
                data-testid="flowchat-header-search"
              >
                <Search size={14} aria-hidden="true" />
                <span>{t('flowChatHeader.searchOpen', { defaultValue: 'Search messages' })}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="flowchat-header__more-menu-item"
                onClick={handleOpenTurnListFromMenu}
                disabled={!hasTurnNavigation}
                data-testid="flowchat-header-turn-list"
              >
                <List size={14} aria-hidden="true" />
                <span>{turnListTooltip}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="flowchat-header__more-menu-item"
                onClick={() => runMoreMenuAction(onJumpToCurrentTurn)}
                disabled={currentTurn <= 0 || !onJumpToCurrentTurn}
                data-testid="flowchat-header-turn-current"
              >
                <Crosshair size={14} aria-hidden="true" />
                <span>
                  {t('flowChatHeader.jumpToCurrentTurn', {
                    turn: currentTurn,
                    defaultValue: `Jump to Turn ${currentTurn}`,
                  })}
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="flowchat-header__more-menu-item"
                onClick={() => runMoreMenuAction(onJumpToPreviousTurn)}
                disabled={previousTurnDisabled || !onJumpToPreviousTurn}
                data-testid="flowchat-header-turn-prev"
              >
                <ChevronUp size={14} aria-hidden="true" />
                <span>{t('flowChatHeader.previousTurn', { defaultValue: 'Previous turn' })}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="flowchat-header__more-menu-item"
                onClick={() => runMoreMenuAction(onJumpToNextTurn)}
                disabled={nextTurnDisabled || !onJumpToNextTurn}
                data-testid="flowchat-header-turn-next"
              >
                <ChevronDown size={14} aria-hidden="true" />
                <span>{t('flowChatHeader.nextTurn', { defaultValue: 'Next turn' })}</span>
              </button>
              {showPreviewFirstToggle && (
                <button
                  type="button"
                  role="menuitem"
                  className={`flowchat-header__more-menu-item${isPreviewFirstActive ? ' flowchat-header__more-menu-item--active' : ''}`}
                  onClick={() => runMoreMenuAction(onPreviewFirstToggle)}
                  disabled={!onPreviewFirstToggle}
                  aria-pressed={isPreviewFirstActive}
                  data-testid="flowchat-header-preview-first-toggle"
                >
                  <PictureInPicture2 size={14} aria-hidden="true" />
                  <span>{t('layout.previewFirst.toggle', { defaultValue: 'Open compact chat' })}</span>
                </button>
              )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

FlowChatHeader.displayName = 'FlowChatHeader';

