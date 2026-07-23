import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useShallow} from 'zustand/react/shallow';
import path from 'path-browserify';
import {CornerUpLeft, Image as ImageIcon, Link2, Loader2, Send, Square, Sparkles, X} from 'lucide-react';
import {FlowChatContext} from '../modern/FlowChatContext';
import {FlowChatPresentationActivityProvider} from '../modern/FlowChatPresentationActivity';
import {VirtualItemRenderer} from '../modern/VirtualItemRenderer';
import {ProcessingIndicator} from '../modern/ProcessingIndicator';
import {
  shouldReserveProcessingIndicatorSpace,
  shouldShowProcessingIndicator,
} from '../modern/processingIndicatorVisibility';
import {useExploreGroupState} from '../modern/useExploreGroupState';
import {ScrollToBottomButton} from '@/flow_chat';
import {flowChatStore} from '../../store/FlowChatStore';
import type {DialogTurn, FlowChatConfig, Session} from '../../types/flow-chat';
import {sessionToVirtualItems} from '../../store/modernFlowChatStore';
import {FLOWCHAT_FOCUS_ITEM_EVENT, type FlowChatFocusItemRequest} from '../../events/flowchatNavigation';
import {fileTabManager} from '@/shared/services/FileTabManager';
import {createTab} from '@/shared/utils/tabUtils';
import {IconButton, type LineRange} from '@/component-library';
import {resolveSessionRelationship} from '../../utils/sessionMetadata';
import {agentAPI, btwAPI, configAPI} from '@/infrastructure/api';
import {globalEventBus} from '@/infrastructure/event-bus';
import {notificationService} from '@/shared/notification-system';
import {createLogger} from '@/shared/utils/logger';
import {FlowChatManager} from '../../services/FlowChatManager';
import {createImageContextFromFile} from '../../utils/imageUtils';
import {buildImageContextsForBackend} from '../../utils/imageContextForBackend';
import type {ModeSkillInfo} from '@/infrastructure/config/types';
import type {CodeSnippetContext, ImageContext} from '@/shared/types/context';
import {stateMachineManager, SessionExecutionState} from '../../state-machine';
import {settleStoppedReviewSessionState} from '../../utils/reviewSessionStop';
import {findLatestCodeReviewResult, findLatestCodeReviewResultState} from '../../utils/reviewSessionSummary';
import {
  deriveDeepReviewInterruption,
  deriveDeepReviewResultRecoveryInterruption,
  type DeepReviewResultRecoveryReason,
} from '../../utils/deepReviewContinuation';
import {buildReviewRemediationItems, type CodeReviewRemediationData} from '../../utils/codeReviewRemediation';
import {ReviewActionBar} from './DeepReviewActionBar';
import {
  buildChildSkillCommandMessage,
  filterRuntimeSkillsForChildComposer,
} from './BtwSessionComposerSkill';
import {
  getReviewActionBarStateForSession,
  type ReviewActionMode,
  type ReviewActionPhase,
  useReviewActionBarStore,
} from '../../store/deepReviewActionBarStore';
import {loadPersistedReviewState} from '../../services/ReviewActionBarPersistenceService';
import type {ReviewActionPersistedState} from '@/shared/types/session-history';
import {useBtwSessionSnapshots} from './useBtwSessionSnapshots';
import './BtwSessionPanel.scss';

export interface BtwSessionPanelProps {
  childSessionId?: string;
  parentSessionId?: string;
  workspacePath?: string;
  isActive?: boolean;
  presentationTitle?: string;
  showKindBadge?: boolean;
}

const PANEL_CONFIG: FlowChatConfig = {
  enableMarkdown: true,
  autoScroll: true,
  showTimestamps: false,
  maxHistoryRounds: 50,
  enableVirtualScroll: false,
  theme: 'dark',
};

const resolveSessionTitle = (session?: Session | null, fallback = 'Side thread') =>
  session?.title?.trim() || fallback;
const log = createLogger('BtwSessionPanel');
const REVIEW_ACTION_BOTTOM_BLANK_SPACE_PX = 96;
const MemoizedReviewActionBar = React.memo(ReviewActionBar);

const isActiveReviewTurnStatus = (status?: DialogTurn['status']) =>
  status === 'pending' ||
  status === 'image_analyzing' ||
  status === 'processing' ||
  status === 'finishing';

const isProcessingState = (state: SessionExecutionState | null | undefined) =>
  state === SessionExecutionState.PROCESSING ||
  state === SessionExecutionState.FINISHING;

const resolveActiveBtwRequestId = (session?: Session | null): string | undefined => {
  const turns = session?.dialogTurns ?? [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!isActiveReviewTurnStatus(turn.status)) {
      continue;
    }
    const match = turn.id.match(/^btw-turn-(.+)$/);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  const requestId = session?.btwOrigin?.requestId?.trim();
  if (requestId) {
    return requestId;
  }

  return undefined;
};

type DeepReviewActionData = CodeReviewRemediationData & {
  review_mode?: 'standard' | 'deep';
};

const isSameReviewResult = (left: unknown, right: unknown): boolean => {
  if (left === right) {
    return true;
  }
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
};

export const BtwSessionPanel: React.FC<BtwSessionPanelProps> = ({
  childSessionId,
  parentSessionId,
  workspacePath,
  isActive = true,
  presentationTitle,
  showKindBadge = true,
}) => {
  const { t } = useTranslation('flow-chat');
  const {
    childSession,
    parentSession,
    reviewSession,
  } = useBtwSessionSnapshots({
    childSessionId,
    parentSessionId,
    isActive,
  });
  const [stoppingReview, setStoppingReview] = useState(false);
  const [composerValue, setComposerValue] = useState('');
  const [composerImageContexts, setComposerImageContexts] = useState<ImageContext[]>([]);
  const [composerTextContexts, setComposerTextContexts] = useState<CodeSnippetContext[]>([]);
  const [isAddingComposerImage, setIsAddingComposerImage] = useState(false);
  const [isAddingComposerTextFile, setIsAddingComposerTextFile] = useState(false);
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false);
  const [composerSkills, setComposerSkills] = useState<ModeSkillInfo[]>([]);
  const [isLoadingComposerSkills, setIsLoadingComposerSkills] = useState(false);
  const [isSkillPickerOpen, setIsSkillPickerOpen] = useState(false);
  const [stoppingChildSession, setStoppingChildSession] = useState(false);
  const [childExecutionState, setChildExecutionState] = useState<SessionExecutionState>(() =>
    childSessionId
      ? stateMachineManager.getCurrentState(childSessionId)
      : SessionExecutionState.IDLE
  );
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const composerImageInputRef = useRef<HTMLInputElement>(null);
  const composerFileInputRef = useRef<HTMLInputElement>(null);
  const [actionBarHeight, setActionBarHeight] = useState(0);
  const shouldAutoScrollRef = useRef(true);
  const autoScrollFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isActive || !childSessionId) {
      if (isActive) {
        setChildExecutionState(SessionExecutionState.IDLE);
      }
      return;
    }

    setChildExecutionState(stateMachineManager.getCurrentState(childSessionId));
    return stateMachineManager.subscribeGlobal((sessionId, machine) => {
      if (sessionId === childSessionId) {
        setChildExecutionState(machine.currentState);
      }
    });
  }, [childSessionId, isActive]);

  const childAgentType = childSession?.mode || childSession?.config?.agentType || 'agentic';
  const childRelationship = resolveSessionRelationship(childSession);
  const childKind = childRelationship.kind === 'review' ||
    childRelationship.kind === 'deep_review' ||
    childRelationship.kind === 'miniapp' ||
    childRelationship.kind === 'subagent'
    ? childRelationship.kind
    : 'btw';
  const childBadgeLabel = t(`childSession.kinds.${childKind}.short`, {
    defaultValue: childKind === 'deep_review'
      ? 'Deep'
      : childKind === 'review'
        ? 'Review'
        : childKind === 'subagent'
          ? 'Agent'
        : childKind === 'miniapp'
          ? 'MiniApp'
          : t('btw.shortLabel'),
  });
  const childTitleFallback = t(`childSession.kinds.${childKind}.title`, {
    defaultValue: t('btw.threadLabel'),
  });
  const childPresentationTitle = presentationTitle?.trim()
    || resolveSessionTitle(childSession, childTitleFallback);
  const childOriginLabel = t(`childSession.kinds.${childKind}.origin`, {
    defaultValue: t('btw.origin'),
  });
  const showOriginMeta = childKind !== 'miniapp' && childKind !== 'subagent';
  const virtualItems = useMemo(() => sessionToVirtualItems(childSession ?? null), [childSession]);
  const {
    exploreGroupStates,
    onExploreGroupToggle,
    onExpandGroup,
    onExpandAllInTurn,
    onCollapseGroup,
  } = useExploreGroupState(virtualItems);

  // Load history for historical sessions that have not yet had their turns loaded.
  const isLoadingRef = useRef(false);
  const historySession = childSession ?? reviewSession;
  useEffect(() => {
    if (!childSessionId || !historySession) return;
    if (!historySession.isHistorical) return;
    if (isLoadingRef.current) return;

    const path = workspacePath ?? historySession.workspacePath;
    if (!path) return;

    isLoadingRef.current = true;
    flowChatStore.loadSessionHistory(
      childSessionId,
      path,
      undefined,
      historySession.remoteConnectionId,
      historySession.remoteSshHost,
      { includeInternal: historySession.sessionKind === 'subagent' },
    ).finally(() => {
      isLoadingRef.current = false;
    });
  }, [childSessionId, historySession, workspacePath]);

  const updateScrollAffordance = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowScrollToBottom(distanceFromBottom > 120);
    if (distanceFromBottom < 80) {
      shouldAutoScrollRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const container = scrollContainerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        shouldAutoScrollRef.current = false;
      } else if (e.deltaY > 0) {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        if (distanceFromBottom < 100) {
          shouldAutoScrollRef.current = true;
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: true });
    container.addEventListener('scroll', updateScrollAffordance, { passive: true });
    updateScrollAffordance();
    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('scroll', updateScrollAffordance);
    };
  }, [isActive, updateScrollAffordance]);

  useEffect(() => {
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
    if (!isActive) return;

    const container = scrollContainerRef.current;
    if (!container || !shouldAutoScrollRef.current) return;
    autoScrollFrameRef.current = window.requestAnimationFrame(() => {
      autoScrollFrameRef.current = null;
      container.scrollTop = container.scrollHeight;
      setShowScrollToBottom(false);
    });

    return () => {
      if (autoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
    };
  }, [isActive, virtualItems]);

  const handleScrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    shouldAutoScrollRef.current = true;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    setShowScrollToBottom(false);
  }, []);

  const handleFileViewRequest = useCallback((
    filePath: string,
    fileName: string,
    lineRange?: LineRange
  ) => {
    let absoluteFilePath = filePath;
    const isWindowsAbsolutePath = /^[A-Za-z]:[\\/]/.test(filePath);

    if (!isWindowsAbsolutePath && !path.isAbsolute(filePath) && workspacePath) {
      absoluteFilePath = path.join(workspacePath, filePath);
    }

    fileTabManager.openFile({
      filePath: absoluteFilePath,
      fileName,
      workspacePath,
      jumpToRange: lineRange,
      mode: 'agent',
    });
  }, [workspacePath]);

  const handleTabOpen = useCallback((tabInfo: any) => {
    if (!tabInfo?.type) return;
    createTab({
      type: tabInfo.type,
      title: tabInfo.title || 'New Tab',
      data: tabInfo.data,
      metadata: tabInfo.metadata,
      checkDuplicate: !!tabInfo.metadata?.duplicateCheckKey,
      duplicateCheckKey: tabInfo.metadata?.duplicateCheckKey,
      replaceExisting: false,
      mode: 'agent',
    });
  }, []);

  const handleFillUserMessageInput = useCallback((content: string) => {
    setComposerValue(content);
    window.requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  }, []);

  const contextValue = useMemo(() => ({
    onFileViewRequest: handleFileViewRequest,
    onTabOpen: handleTabOpen,
    sessionId: childSessionId,
    activeSessionOverride: childSession ?? null,
    allowUserMessageEdit: false,
    onFillUserMessageInput: handleFillUserMessageInput,
    config: PANEL_CONFIG,
    exploreGroupStates,
    onExploreGroupToggle,
    onExpandGroup,
    onExpandAllInTurn,
    onCollapseGroup,
  }), [
    childSession,
    childSessionId,
    handleFileViewRequest,
    handleFillUserMessageInput,
    handleTabOpen,
    exploreGroupStates,
    onExploreGroupToggle,
    onExpandGroup,
    onExpandAllInTurn,
    onCollapseGroup,
  ]);

  const lastDialogTurn = childSession?.dialogTurns[childSession.dialogTurns.length - 1];
  const lastModelRound = lastDialogTurn?.modelRounds[lastDialogTurn.modelRounds.length - 1];
  const lastItem = lastModelRound?.items[lastModelRound.items.length - 1];
  const lastItemContent = lastItem && 'content' in lastItem ? String((lastItem as any).content || '') : '';
  const isTurnProcessing = isActiveReviewTurnStatus(lastDialogTurn?.status);
  const effectiveChildExecutionState = isActive && childSessionId
    ? stateMachineManager.getCurrentState(childSessionId)
    : childExecutionState;
  const isChildSessionProcessing =
    isTurnProcessing || isProcessingState(effectiveChildExecutionState);
  const [isContentGrowing, setIsContentGrowing] = useState(true);
  const contentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (contentTimeoutRef.current) {
      clearTimeout(contentTimeoutRef.current);
      contentTimeoutRef.current = null;
    }

    if (!isActive) {
      return;
    }

    if (!isTurnProcessing) {
      setIsContentGrowing(false);
      return;
    }

    setIsContentGrowing(true);
    contentTimeoutRef.current = setTimeout(() => {
      contentTimeoutRef.current = null;
      setIsContentGrowing(false);
    }, 500);

    return () => {
      if (contentTimeoutRef.current) {
        clearTimeout(contentTimeoutRef.current);
        contentTimeoutRef.current = null;
      }
    };
  }, [isActive, isTurnProcessing, lastItemContent]);

  const showProcessingIndicator = useMemo(() => {
    return shouldShowProcessingIndicator({
      isTurnProcessing,
      lastItem,
      isContentGrowing,
    });
  }, [isTurnProcessing, lastItem, isContentGrowing]);

  const reserveProcessingIndicatorSpace = useMemo(() => {
    return shouldReserveProcessingIndicatorSpace({
      isTurnProcessing,
      lastItem,
      isContentGrowing,
    });
  }, [isTurnProcessing, lastItem, isContentGrowing]);

  const canStopReviewSession =
    (childKind === 'review' || childKind === 'deep_review') &&
    isTurnProcessing &&
    !stoppingReview;
  const canUseComposer = childKind === 'btw' || childKind === 'subagent';
  const trimmedComposerValue = composerValue.trim();
  const runtimeComposerSkills = useMemo(
    () => filterRuntimeSkillsForChildComposer(composerSkills),
    [composerSkills],
  );
  const composerCommandText = composerValue.trimStart();
  const lowerComposerCommandText = composerCommandText.toLowerCase();
  const isSkillCommandInput =
    lowerComposerCommandText === '/skill' ||
    lowerComposerCommandText.startsWith('/skill ');
  const slashCommandQuery = useMemo(() => {
    const text = composerValue.trimStart();
    const lowerText = text.toLowerCase();
    if (!lowerText.startsWith('/') || lowerText === '/skill' || lowerText.startsWith('/skill ')) {
      return '';
    }
    return lowerText.slice(1).trimStart();
  }, [composerValue]);
  const skillCommandQuery = useMemo(() => {
    const text = composerValue.trimStart();
    if (!text.toLowerCase().startsWith('/skill')) {
      return '';
    }
    return text.slice('/skill'.length).trimStart();
  }, [composerValue]);
  const visibleSkillItems = useMemo(
    () => filterRuntimeSkillsForChildComposer(composerSkills, skillCommandQuery),
    [composerSkills, skillCommandQuery],
  );
  const showSkillCommandItem =
    childKind === 'subagent' &&
    isSkillPickerOpen &&
    composerCommandText.startsWith('/') &&
    !isSkillCommandInput &&
    'skill'.startsWith(slashCommandQuery);
  const showSkillPicker =
    childKind === 'subagent' &&
    isSkillPickerOpen &&
    composerCommandText.startsWith('/') &&
    (showSkillCommandItem || isSkillCommandInput);
  const canSubmitComposer =
    canUseComposer &&
    Boolean(childSessionId) &&
    Boolean(trimmedComposerValue) &&
    !isSubmittingMessage &&
    !isAddingComposerImage &&
    !isAddingComposerTextFile &&
    !isChildSessionProcessing;

  useEffect(() => {
    if (!isActive) {
      return;
    }

    if (childKind !== 'subagent') {
      setComposerSkills([]);
      setIsLoadingComposerSkills(false);
      setIsSkillPickerOpen(false);
      return;
    }

    let cancelled = false;
    setIsLoadingComposerSkills(true);
    configAPI.getModeSkillConfigs({
      modeId: childAgentType,
      workspacePath: workspacePath || childSession?.workspacePath || undefined,
    }).then((skills) => {
      if (!cancelled) {
        setComposerSkills(skills);
      }
    }).catch((error) => {
      log.error('Failed to load child session skills', {
        childSessionId,
        childAgentType,
        workspacePath: workspacePath || childSession?.workspacePath || undefined,
        error,
      });
      if (!cancelled) {
        setComposerSkills([]);
      }
    }).finally(() => {
      if (!cancelled) {
        setIsLoadingComposerSkills(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [childAgentType, childKind, childSession?.workspacePath, childSessionId, isActive, workspacePath]);

  // ---- Review action bar integration ----
  const {
    actionBarPhase,
    actionBarMinimized,
    actionBarChildSessionId,
    actionBarLastSubmittedAction,
    actionBarCompletedCount,
    actionBarTotalCount,
    actionBarFixScopedCount,
    actionBarFixScopedCompletedCount,
  } = useReviewActionBarStore(useShallow((state) => {
    const actionState = getReviewActionBarStateForSession(state, childSessionId);
    const completedIds = actionState?.completedRemediationIds;
    const fixingIds = actionState?.fixingRemediationIds;
    const selectedIds = actionState?.selectedRemediationIds;
    const fixScopedIds = fixingIds && fixingIds.size > 0 ? fixingIds : selectedIds;
    let fixScopedCompletedCount = 0;
    if (fixScopedIds && completedIds) {
      for (const id of fixScopedIds) {
        if (completedIds.has(id)) {
          fixScopedCompletedCount += 1;
        }
      }
    }
    return {
      actionBarPhase: actionState?.phase ?? 'idle',
      actionBarMinimized: actionState?.minimized ?? false,
      actionBarChildSessionId: actionState?.childSessionId ?? null,
      actionBarLastSubmittedAction: actionState?.lastSubmittedAction ?? null,
      actionBarCompletedCount: completedIds?.size ?? 0,
      actionBarTotalCount: actionState?.remediationItems.length ?? 0,
      actionBarFixScopedCount: fixScopedIds?.size ?? 0,
      actionBarFixScopedCompletedCount: fixScopedCompletedCount,
    };
  }));
  const reviewRelationship = resolveSessionRelationship(reviewSession);
  const isDeepReview = reviewRelationship.kind === 'deep_review';
  const isReviewSession =
    reviewRelationship.kind === 'review' || reviewRelationship.kind === 'deep_review';
  const canReturnToParentSession = isReviewSession && Boolean(parentSessionId);
  const btwOrigin = childSession?.btwOrigin;
  const hasReviewActionBarLifecycle =
    isReviewSession &&
    actionBarChildSessionId === childSessionId &&
    actionBarPhase !== 'idle';
  const showReviewActionBar = hasReviewActionBarLifecycle && !actionBarMinimized;

  const showMinimizedIndicator =
    isReviewSession &&
    actionBarChildSessionId === childSessionId &&
    actionBarPhase !== 'idle' &&
    actionBarMinimized;
  const reviewActionBottomPadding = showReviewActionBar
    ? actionBarHeight + REVIEW_ACTION_BOTTOM_BLANK_SPACE_PX
    : showMinimizedIndicator
      ? REVIEW_ACTION_BOTTOM_BLANK_SPACE_PX
      : 0;
  const parentLabel = resolveSessionTitle(parentSession, t('btw.parent'));
  const backTooltip = btwOrigin?.parentTurnIndex
    ? t('flowChatHeader.btwBackTooltipWithTurn', {
        title: parentLabel,
        turn: btwOrigin.parentTurnIndex,
        defaultValue: `Go back to the source session: ${parentLabel} (Turn ${btwOrigin.parentTurnIndex})`,
      })
    : t('flowChatHeader.btwBackTooltipWithoutTurn', {
        title: parentLabel,
        defaultValue: `Go back to the source session: ${parentLabel}`,
      });

  const remainingCount = actionBarTotalCount - actionBarCompletedCount;
  const totalCount = actionBarTotalCount;
  const minimizedCountLabel = (
    ['fix_running', 'fix_completed', 'fix_failed', 'fix_timeout', 'fix_interrupted'].includes(actionBarPhase) &&
    actionBarFixScopedCount > 0
  )
    ? `${actionBarFixScopedCompletedCount}/${actionBarFixScopedCount}`
    : `${remainingCount}/${totalCount}`;
  const minimizedActionLabel = useMemo(() => {
    switch (actionBarPhase) {
      case 'review_running':
        return isDeepReview
          ? t('deepReviewActionBar.minimizedReviewRunningDeep', {
              defaultValue: 'Deep Review running',
            })
          : t('deepReviewActionBar.minimizedReviewRunningStandard', {
              defaultValue: 'Code Review running',
            });
      case 'fix_running':
        return actionBarLastSubmittedAction === 'fix-review'
          ? t('deepReviewActionBar.minimizedFixReview', {
              defaultValue: 'Fixing and re-reviewing',
            })
          : t('deepReviewActionBar.minimizedFix', {
              defaultValue: 'Fixing',
            });
      case 'fix_completed':
        return t('deepReviewActionBar.minimizedFixCompleted', {
          defaultValue: 'Fix completed',
        });
      case 'fix_failed':
      case 'fix_timeout':
      case 'review_error':
        return t('deepReviewActionBar.minimizedFixFailed', {
          defaultValue: 'Needs attention',
        });
      case 'review_interrupted':
      case 'resume_blocked':
      case 'resume_failed':
        return t('deepReviewActionBar.minimizedReviewInterrupted', {
          defaultValue: 'Review interrupted',
        });
      case 'resume_running':
        return t('deepReviewActionBar.minimizedResume', {
          defaultValue: 'Continuing review',
        });
      default:
        return isDeepReview
          ? t('deepReviewActionBar.minimizedDeep', {
              defaultValue: 'Deep Review',
            })
          : t('deepReviewActionBar.minimizedStandard', {
              defaultValue: 'Code Review',
            });
    }
  }, [actionBarPhase, actionBarLastSubmittedAction, isDeepReview, t]);

  const actionBarPresentationSessionRef = useRef<Session | null>(childSession ?? null);
  if (isActive && showReviewActionBar) {
    actionBarPresentationSessionRef.current = childSession ?? null;
  }

  // Detect when a review completes with a remediation plan and auto-show the action bar.
  useEffect(() => {
    if (!isReviewSession || !childSessionId || !reviewSession) return;

    const latestReviewResultState = findLatestCodeReviewResultState(reviewSession);
    const latestReviewData = latestReviewResultState.status === 'valid'
      ? latestReviewResultState.result as DeepReviewActionData
      : null;
    const reviewMode: ReviewActionMode = isDeepReview ? 'deep' : 'standard';
    const latestReviewMode = latestReviewData?.review_mode ?? 'standard';
    const lastTurn = reviewSession.dialogTurns[reviewSession.dialogTurns.length - 1];
    const turnStatus = lastTurn?.status;
    const isComplete = turnStatus === 'completed';
    const isError = turnStatus === 'error' || Boolean(reviewSession.error);
    const isReviewRunning = isActiveReviewTurnStatus(turnStatus);
    const deepReviewInterruption = isDeepReview
      ? deriveDeepReviewInterruption(reviewSession)
      : null;
    const resultRecoveryReason: DeepReviewResultRecoveryReason | null =
      isDeepReview && isComplete
        ? latestReviewResultState.status === 'missing'
          ? 'missing_submit_code_review'
          : latestReviewResultState.status === 'invalid'
            ? 'invalid_submit_code_review'
            : latestReviewData && latestReviewMode !== 'deep'
              ? 'wrong_review_mode'
              : null
        : null;
    const resultRecoveryInterruption = resultRecoveryReason
      ? deriveDeepReviewResultRecoveryInterruption(reviewSession, resultRecoveryReason)
      : null;

    const store = useReviewActionBarStore.getState();
    const currentActionState = store.getSessionState(childSessionId);
    const isCurrentResumeRunning =
      currentActionState?.phase === 'resume_running';
    if (isCurrentResumeRunning) {
      const resumeTurnHasStarted =
        !currentActionState.resumeBaselineTurnId ||
        lastTurn?.id !== currentActionState.resumeBaselineTurnId;

      if (!resumeTurnHasStarted) {
        return;
      }

      if (turnStatus === 'error') {
        store.updatePhase('resume_failed', lastTurn?.error ?? reviewSession.error ?? undefined, childSessionId);
        store.restore(childSessionId);
        return;
      }

      if (turnStatus === 'cancelled' && deepReviewInterruption) {
        store.showInterruptedActionBar({
          childSessionId,
          parentSessionId: parentSessionId ?? null,
          interruption: deepReviewInterruption,
        });
        store.restore(childSessionId);
        return;
      }

      if (turnStatus !== 'completed') {
        return;
      }
    }

    if (isReviewRunning) {
      const canShowRunningAction =
        !currentActionState ||
        currentActionState.phase === 'idle';

      if (canShowRunningAction) {
        store.showRunningActionBar({
          childSessionId,
          parentSessionId: parentSessionId ?? null,
          reviewMode,
        });
      }
      return;
    }

    if (resultRecoveryInterruption) {
      const canShowResultRecovery =
        !currentActionState ||
        currentActionState.phase === 'idle' ||
        currentActionState.phase === 'review_waiting_capacity' ||
        currentActionState.phase === 'resume_running';

      if (canShowResultRecovery) {
        store.showInterruptedActionBar({
          childSessionId,
          parentSessionId: parentSessionId ?? null,
          interruption: resultRecoveryInterruption,
        });
      }
      return;
    }

    if (isDeepReview && (!latestReviewData || latestReviewMode !== 'deep') && deepReviewInterruption) {
      store.showInterruptedActionBar({
        childSessionId,
        parentSessionId: parentSessionId ?? null,
        interruption: deepReviewInterruption,
      });
      return;
    }

    if (!latestReviewData) return;
    if (isDeepReview && latestReviewMode !== 'deep') return;
    if (!isDeepReview && latestReviewMode === 'deep') return;

    const hasRemediationPlan = buildReviewRemediationItems(latestReviewData).length > 0;

    // Only activate if the action bar is idle or not yet shown for this session
    if (currentActionState && currentActionState.phase !== 'idle') {
      // A fix request briefly coexists with the previous completed review turn
      // until FlowChatManager creates the new fix turn; ignore that stale terminal state.
      const currentFixTurnHasStarted = currentActionState.phase !== 'fix_running' ||
        !currentActionState.fixingBaselineTurnId ||
        lastTurn?.id !== currentActionState.fixingBaselineTurnId;

      if (currentActionState.phase === 'fix_running' && !currentFixTurnHasStarted && (isComplete || isError)) {
        return;
      }

      // Update phase based on turn status if currently showing
      if (turnStatus === 'cancelled' && currentActionState.phase === 'fix_running') {
        const fixScopeIds = currentActionState.fixingRemediationIds.size > 0
          ? currentActionState.fixingRemediationIds
          : currentActionState.selectedRemediationIds;
        const remainingFixIds = [...fixScopeIds].filter((id) => !currentActionState.completedRemediationIds.has(id));
        store.setRemainingFixIds(remainingFixIds, childSessionId);
        store.setActiveAction(null, undefined, childSessionId);
        store.updatePhase('fix_interrupted', undefined, childSessionId);
        store.restore(childSessionId);
      } else if (isError && currentActionState.phase === 'resume_running') {
        store.updatePhase('resume_failed', reviewSession.error ?? undefined, childSessionId);
      } else if (
        isError &&
        currentActionState.phase !== 'fix_failed' &&
        currentActionState.phase !== 'review_error' &&
        currentActionState.phase !== 'fix_interrupted'
      ) {
        store.updatePhase(
          currentActionState.phase === 'fix_running' ? 'fix_failed' : 'review_error',
          reviewSession.error ?? undefined,
          childSessionId,
        );
      } else if (isComplete && currentActionState.phase === 'fix_running') {
        if (hasRemediationPlan && !isSameReviewResult(currentActionState.reviewData, latestReviewData)) {
          store.showActionBar({
            childSessionId,
            parentSessionId: parentSessionId ?? null,
            reviewData: latestReviewData,
            reviewMode,
            phase: 'review_completed',
            completedRemediationIds: currentActionState.completedRemediationIds,
          });
        } else {
          // Fix completed with no further remediation needed — update phase to
          // show completion state in the action bar instead of dismissing it.
          store.updatePhase('fix_completed', undefined, childSessionId);
        }
      } else if (isComplete && currentActionState.phase === 'resume_running') {
        store.showActionBar({
          childSessionId,
          parentSessionId: parentSessionId ?? null,
          reviewData: latestReviewData,
          reviewMode,
          phase: 'review_completed',
          completedRemediationIds: currentActionState.completedRemediationIds,
        });
      } else if (isComplete && currentActionState.phase === 'review_running') {
        store.showActionBar({
          childSessionId,
          parentSessionId: parentSessionId ?? null,
          reviewData: latestReviewData,
          reviewMode,
          phase: 'review_completed',
          completedRemediationIds: currentActionState.completedRemediationIds,
        });
      } else if (isComplete && currentActionState.phase === 'review_waiting_capacity') {
        store.showActionBar({
          childSessionId,
          parentSessionId: parentSessionId ?? null,
          reviewData: latestReviewData,
          reviewMode,
          phase: 'review_completed',
        });
      }
      return;
    }

    if (!isComplete && !isError) return;

    if (isError) {
      store.showActionBar({
        childSessionId,
        parentSessionId: parentSessionId ?? null,
        reviewData: latestReviewData,
        reviewMode,
        phase: 'review_error',
      });
      return;
    }

    store.showActionBar({
      childSessionId,
      parentSessionId: parentSessionId ?? null,
      reviewData: latestReviewData,
      reviewMode,
      phase: 'review_completed',
    });
  }, [
    reviewSession,
    childSessionId,
    parentSessionId,
    isReviewSession,
    isDeepReview,
    actionBarPhase,
    actionBarChildSessionId,
  ]);

  // Restore persisted review action state on mount
  useEffect(() => {
    if (!isReviewSession || !childSessionId || !reviewSession) return;

    const store = useReviewActionBarStore.getState();
    const currentActionState = store.getSessionState(childSessionId);
    const canReplaceRunningPlaceholder =
      currentActionState?.phase === 'review_running';
    // Only restore if store is idle, or if the start-time running placeholder
    // is waiting for a more specific persisted action state for this session.
    if (!canReplaceRunningPlaceholder && currentActionState && currentActionState.phase !== 'idle') return;

    const workspacePath = reviewSession.workspacePath;
    if (!workspacePath) return;

    let cancelled = false;

    loadPersistedReviewState(
      childSessionId,
      workspacePath,
      reviewSession.remoteConnectionId,
      reviewSession.remoteSshHost,
    ).then((persisted: ReviewActionPersistedState | null) => {
      if (cancelled || !persisted) return;

      const latestReviewData = findLatestCodeReviewResult(reviewSession) as DeepReviewActionData | null;
      const reviewMode: ReviewActionMode = isDeepReview ? 'deep' : 'standard';

      // Detect fix interruption
      let phase: ReviewActionPhase = persisted.phase as ReviewActionPhase;
      let remainingFixIds: string[] = [];

      if (persisted.phase === 'fix_running') {
        const lastTurn = reviewSession.dialogTurns[reviewSession.dialogTurns.length - 1];
        const isStillRunning = isActiveReviewTurnStatus(lastTurn?.status);

        if (!isStillRunning) {
          // Fix was interrupted — determine remaining items
          phase = 'fix_interrupted';
          const latestItems = latestReviewData ? buildReviewRemediationItems(latestReviewData) : [];
          const latestIds = new Set(latestItems.map((i) => i.id));
          // Items that were being fixed but still exist in latest review data
          remainingFixIds = persisted.completedRemediationIds.filter((id: string) => latestIds.has(id));
        }
      }

      store.showActionBar({
        childSessionId,
        parentSessionId: parentSessionId ?? null,
        reviewData: latestReviewData ?? ({} as CodeReviewRemediationData),
        reviewMode,
        phase,
        completedRemediationIds: new Set(persisted.completedRemediationIds),
      });

      // Apply additional restored state
      store.setCustomInstructions(persisted.customInstructions, childSessionId);
      if (persisted.minimized) {
        store.minimize(childSessionId);
      }
      if (remainingFixIds.length > 0) {
        store.setRemainingFixIds(remainingFixIds, childSessionId);
      }
    }).catch(() => {
      // Ignore persistence load errors
    });

    return () => {
      cancelled = true;
    };
  }, [reviewSession, childSessionId, parentSessionId, isReviewSession, isDeepReview]);

  // Observe action bar height to adjust body padding dynamically
  useEffect(() => {
    if (!isActive) {
      return;
    }

    if (!showReviewActionBar) {
      setActionBarHeight(0);
      return;
    }

    const el = actionBarRef.current;
    if (!el) return;
    const measuredEl =
      el.querySelector<HTMLElement>('.deep-review-action-bar') ?? el;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        setActionBarHeight(h);
      }
    });

    observer.observe(measuredEl);
    // Initial measurement
    setActionBarHeight(measuredEl.getBoundingClientRect().height);

    return () => {
      observer.disconnect();
    };
  }, [isActive, showReviewActionBar]);

  const handleStopReviewSession = useCallback(async () => {
    if (!childSessionId || stoppingReview || !isTurnProcessing) {
      return;
    }

    setStoppingReview(true);
    try {
      const cancelRequest = agentAPI.cancelSession(childSessionId);
      await settleStoppedReviewSessionState(childSessionId);
      await cancelRequest;
    } catch (error) {
      log.error('Failed to stop review session', { childSessionId, error });
      notificationService.error(
        t('childSession.stopReviewFailed', {
          defaultValue: 'Failed to stop the review session.',
        }),
      );
    } finally {
      setStoppingReview(false);
    }
  }, [childSessionId, stoppingReview, isTurnProcessing, t]);

  const handleSubmitComposer = useCallback(async () => {
    if (!canSubmitComposer || !childSessionId || !childSession) {
      return;
    }

    const message = trimmedComposerValue;
    const childSkillCommand = childKind === 'subagent'
      ? buildChildSkillCommandMessage(message, runtimeComposerSkills)
      : { kind: 'plain' as const, message };
    const messageForAgent = childSkillCommand.message;
    const imageContexts = composerImageContexts;
    const textContexts = composerTextContexts;
    setComposerValue('');
    setComposerImageContexts([]);
    setComposerTextContexts([]);
    setIsSkillPickerOpen(false);
    setIsSubmittingMessage(true);
    try {
      const imageContextOptions = imageContexts.length > 0
        ? buildImageContextsForBackend(imageContexts)
        : undefined;
      const agentType = childAgentType;
      const contextPrompt = textContexts.map(formatComposerTextFileContextForPrompt).filter(Boolean).join('\n');
      const aiMessage = contextPrompt ? `${contextPrompt}\n\n${messageForAgent}` : messageForAgent;
      const displayMessage = contextPrompt ? message : undefined;
      if (imageContextOptions) {
        await FlowChatManager.getInstance().sendMessage(
          aiMessage,
          childSessionId,
          displayMessage,
          agentType,
          undefined,
          imageContextOptions,
        );
      } else {
        await FlowChatManager.getInstance().sendMessage(
          aiMessage,
          childSessionId,
          displayMessage,
          agentType,
        );
      }
    } catch (error) {
      setComposerValue(message);
      setComposerImageContexts(imageContexts);
      setComposerTextContexts(textContexts);
      log.error('Failed to send child session message', {
        childSessionId,
        childKind,
        error,
      });
      notificationService.error(
        t('childSession.sendFailed', {
          defaultValue: 'Failed to send the message.',
        }),
      );
    } finally {
      setIsSubmittingMessage(false);
    }
  }, [
    canSubmitComposer,
    childKind,
    childSession,
    childSessionId,
    composerImageContexts,
    composerTextContexts,
    childAgentType,
    runtimeComposerSkills,
    t,
    trimmedComposerValue,
  ]);

  const handleComposerValueChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    setComposerValue(nextValue);
    setIsSkillPickerOpen(
      childKind === 'subagent' && nextValue.trimStart().startsWith('/'),
    );
  }, [childKind]);

  const handleSelectComposerSkillCommand = useCallback(() => {
    setComposerValue('/skill ');
    setIsSkillPickerOpen(true);
    window.requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  }, []);

  const handleSelectComposerSkill = useCallback((skill: ModeSkillInfo) => {
    setComposerValue(`/skill ${skill.name} `);
    setIsSkillPickerOpen(false);
    window.requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  }, []);

  const handleComposerImageInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.length === 0) {
      return;
    }

    setIsAddingComposerImage(true);
    try {
      const contexts = await Promise.all(
        files
          .filter(file => file.type.startsWith('image/'))
          .map(file => createImageContextFromFile(file, { workspacePath })),
      );
      if (contexts.length > 0) {
        setComposerImageContexts(previous => [...previous, ...contexts]);
      }
    } catch (error) {
      log.error('Failed to add child session image attachment', {
        childSessionId,
        childKind,
        error,
      });
      notificationService.error(
        t('childSession.attachmentFailed', {
          defaultValue: 'Failed to attach the image.',
        }),
      );
    } finally {
      setIsAddingComposerImage(false);
    }
  }, [childKind, childSessionId, t, workspacePath]);

  const handleRemoveComposerImage = useCallback((imageId: string) => {
    setComposerImageContexts(previous => previous.filter(image => image.id !== imageId));
  }, []);

  const handleComposerFileInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    const textFiles = files.filter(isSupportedComposerTextFile);
    if (textFiles.length === 0) {
      return;
    }

    setIsAddingComposerTextFile(true);
    try {
      const contexts = await Promise.all(textFiles.map(readComposerTextFileContext));
      setComposerTextContexts(previous => [...previous, ...contexts]);
    } catch (error) {
      log.error('Failed to add child session text attachment', {
        childSessionId,
        childKind,
        error,
      });
      notificationService.error(
        t('childSession.attachmentFailed', {
          defaultValue: 'Failed to attach the file.',
        }),
      );
    } finally {
      setIsAddingComposerTextFile(false);
    }
  }, [childKind, childSessionId, t]);

  const handleRemoveComposerTextFile = useCallback((contextId: string) => {
    setComposerTextContexts(previous => previous.filter(context => context.id !== contextId));
  }, []);

  const handleComposerKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape' && isSkillPickerOpen) {
      event.preventDefault();
      setIsSkillPickerOpen(false);
      return;
    }

    if (
      (event.key === 'Enter' || event.key === 'Tab') &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      showSkillCommandItem
    ) {
      event.preventDefault();
      handleSelectComposerSkillCommand();
      return;
    }

    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    void handleSubmitComposer();
  }, [handleSelectComposerSkillCommand, handleSubmitComposer, isSkillPickerOpen, showSkillCommandItem]);

  const handleStopChildSession = useCallback(async () => {
    if (!childSessionId || stoppingChildSession || !isChildSessionProcessing) {
      return;
    }

    setStoppingChildSession(true);
    try {
      if (childKind === 'btw') {
        const requestId = resolveActiveBtwRequestId(childSession);
        if (!requestId) {
          throw new Error(`Active /btw request not found for session: ${childSessionId}`);
        }
        await btwAPI.cancel({ requestId });
      } else {
        await agentAPI.cancelSession(childSessionId);
      }
    } catch (error) {
      log.error('Failed to stop child session', {
        childSessionId,
        childKind,
        error,
      });
      notificationService.error(
        t('childSession.stopFailed', {
          defaultValue: 'Failed to stop this session.',
        }),
      );
    } finally {
      setStoppingChildSession(false);
    }
  }, [
    childKind,
    childSession,
    childSessionId,
    isChildSessionProcessing,
    stoppingChildSession,
    t,
  ]);

  const handleReturnToParentSession = useCallback(() => {
    const resolvedParentSessionId = btwOrigin?.parentSessionId || parentSessionId;
    if (!resolvedParentSessionId) {
      return;
    }

    const requestId = btwOrigin?.requestId;
    const request: FlowChatFocusItemRequest = {
      sessionId: resolvedParentSessionId,
      turnIndex: btwOrigin?.parentTurnIndex,
      itemId: requestId ? `btw_marker_${requestId}` : undefined,
      source: 'btw-back',
    };

    globalEventBus.emit(
      FLOWCHAT_FOCUS_ITEM_EVENT,
      request,
      'BtwSessionPanel',
    );
  }, [btwOrigin, parentSessionId]);

  if (!childSessionId || !childSession) {
    return (
      <div className="btw-session-panel btw-session-panel--empty">
        <div className="btw-session-panel__empty-state">
          {t('btw.emptyThreadLabel', { label: t('btw.threadLabel') })}
        </div>
      </div>
    );
  }

  return (
    <FlowChatContext.Provider value={contextValue}>
      <div
        className={`btw-session-panel${showReviewActionBar ? ' btw-session-panel--has-action-bar' : ''}${canUseComposer ? ' btw-session-panel--has-composer' : ''}`}
      >
        <div className="btw-session-panel__header">
          <div className="btw-session-panel__header-left">
            {showKindBadge && (
              <span className="btw-session-panel__badge">{childBadgeLabel}</span>
            )}
          </div>
          <div className="btw-session-panel__header-title-wrap">
            <span className="btw-session-panel__title">{childPresentationTitle}</span>
          </div>
          <div className="btw-session-panel__header-right">
            {showOriginMeta && (
              <div className="btw-session-panel__meta">
                <span className="btw-session-panel__meta-label">{childOriginLabel}</span>
                <Link2 size={11} />
                <span className="btw-session-panel__meta-title">{resolveSessionTitle(parentSession, t('btw.parent'))}</span>
              </div>
            )}
            {(childKind === 'review' || childKind === 'deep_review') && (
              <IconButton
                className="btw-session-panel__stop-button"
                variant="ghost"
                size="xs"
                onClick={() => void handleStopReviewSession()}
                disabled={!canStopReviewSession}
                tooltip={stoppingReview
                  ? t('childSession.stoppingReview', { defaultValue: 'Stopping review...' })
                  : t('childSession.stopReview', { defaultValue: 'Stop review' })}
                aria-label={stoppingReview
                  ? t('childSession.stoppingReview', { defaultValue: 'Stopping review...' })
                  : t('childSession.stopReview', { defaultValue: 'Stop review' })}
                data-testid="btw-session-panel-stop-review"
              >
                <Square size={11} />
              </IconButton>
            )}
            {canReturnToParentSession && (
              <IconButton
                className="btw-session-panel__origin-button"
                variant="ghost"
                size="xs"
                onClick={handleReturnToParentSession}
                tooltip={backTooltip}
                aria-label={t('btw.backToParent')}
                data-testid="btw-session-panel-origin-button"
              >
                <CornerUpLeft size={12} />
              </IconButton>
            )}
          </div>
        </div>

        <FlowChatPresentationActivityProvider isActive={isActive}>
          <div
            ref={scrollContainerRef}
            className="btw-session-panel__body"
            style={reviewActionBottomPadding > 0 ? { paddingBottom: `${reviewActionBottomPadding}px` } : undefined}
          >
            {virtualItems.length === 0 ? (
              <div className="btw-session-panel__empty-state">{t('session.empty')}</div>
            ) : (
              <>
                {virtualItems.map((item, index) => (
                  <VirtualItemRenderer
                    key={`${item.turnId}-${item.type}-${index}`}
                    item={item}
                    index={index}
                  />
                ))}
                <ProcessingIndicator
                  visible={showProcessingIndicator}
                  reserveSpace={reserveProcessingIndicatorSpace}
                />
              </>
            )}
          </div>
          <ScrollToBottomButton
            visible={showScrollToBottom}
            onClick={handleScrollToBottom}
            className="btw-session-panel__scroll-to-bottom"
          />
        </FlowChatPresentationActivityProvider>
        {showMinimizedIndicator && (
          <div className="btw-session-panel__minimized-indicator">
            <button
              type="button"
              onClick={() => useReviewActionBarStore.getState().restore(childSessionId)}
              className="btw-session-panel__minimized-button"
              aria-label={t('deepReviewActionBar.restore', {
                label: minimizedActionLabel,
                defaultValue: `Open ${minimizedActionLabel}`,
              })}
            >
              <Sparkles size={14} />
              <span className="btw-session-panel__minimized-text">
                {minimizedActionLabel}
              </span>
              {totalCount > 0 && (
                <span className="btw-session-panel__minimized-count">
                  {minimizedCountLabel}
                </span>
              )}
            </button>
          </div>
        )}

        {hasReviewActionBarLifecycle && (
          <div
            ref={showReviewActionBar ? actionBarRef : undefined}
            className="btw-session-panel__action-bar-wrapper"
            hidden={!showReviewActionBar}
            aria-hidden={!showReviewActionBar}
          >
            <MemoizedReviewActionBar
              childSessionId={childSessionId}
              isActive={isActive && showReviewActionBar}
              presentationSession={actionBarPresentationSessionRef.current}
            />
          </div>
        )}

        {canUseComposer && (
          <div className="btw-session-panel__composer" data-testid="btw-session-panel-composer">
            <input
              ref={composerImageInputRef}
              data-testid="btw-session-panel-image-input"
              className="btw-session-panel__composer-file-input"
              type="file"
              accept="image/*"
              multiple
              onChange={handleComposerImageInputChange}
              tabIndex={-1}
            />
            <input
              ref={composerFileInputRef}
              data-testid="btw-session-panel-file-input"
              className="btw-session-panel__composer-file-input"
              type="file"
              accept=".md,.txt,text/markdown,text/plain"
              multiple
              onChange={handleComposerFileInputChange}
              tabIndex={-1}
            />
            {showSkillPicker && (
              <div
                className="btw-session-panel__composer-skill-picker"
                role="listbox"
                aria-label={t('childSession.skillPickerLabel', {
                  defaultValue: 'Available skills',
                })}
              >
                {isLoadingComposerSkills ? (
                  <div className="btw-session-panel__composer-skill-empty">
                    {t('childSession.skillPickerLoading', { defaultValue: 'Loading skills...' })}
                  </div>
                ) : showSkillCommandItem ? (
                  <button
                    type="button"
                    className="btw-session-panel__composer-skill-item"
                    data-testid="btw-session-panel-skill-command"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={handleSelectComposerSkillCommand}
                    role="option"
                  >
                    <span className="btw-session-panel__composer-skill-name">
                      /skill
                    </span>
                    <span className="btw-session-panel__composer-skill-description">
                      {t('childSession.skillCommandDescription', {
                        defaultValue: 'Use an enabled skill',
                      })}
                    </span>
                  </button>
                ) : visibleSkillItems.length > 0 ? (
                  visibleSkillItems.slice(0, 6).map(skill => (
                    <button
                      key={skill.key}
                      type="button"
                      className="btw-session-panel__composer-skill-item"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSelectComposerSkill(skill)}
                      role="option"
                    >
                      <span className="btw-session-panel__composer-skill-name">
                        {skill.name}
                      </span>
                      {skill.description && (
                        <span className="btw-session-panel__composer-skill-description">
                          {skill.description}
                        </span>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="btw-session-panel__composer-skill-empty">
                    {t('childSession.skillPickerEmpty', { defaultValue: 'No enabled skills for this agent.' })}
                  </div>
                )}
              </div>
            )}
            <div className="btw-session-panel__composer-box">
              {(composerImageContexts.length > 0 || composerTextContexts.length > 0) && (
                <div className="btw-session-panel__composer-attachments">
                  {composerImageContexts.map(image => (
                    <button
                      key={image.id}
                      type="button"
                      className="btw-session-panel__composer-attachment"
                      onClick={() => handleRemoveComposerImage(image.id)}
                      title={t('childSession.removeAttachment', {
                        defaultValue: 'Remove attachment',
                      })}
                      aria-label={t('childSession.removeAttachmentNamed', {
                        name: image.imageName,
                        defaultValue: `Remove ${image.imageName}`,
                      })}
                    >
                      <span>{image.imageName}</span>
                      <X size={10} />
                    </button>
                  ))}
                  {composerTextContexts.map(context => (
                    <button
                      key={context.id}
                      type="button"
                      className="btw-session-panel__composer-attachment"
                      onClick={() => handleRemoveComposerTextFile(context.id)}
                      title={t('childSession.removeAttachment', {
                        defaultValue: 'Remove attachment',
                      })}
                      aria-label={t('childSession.removeAttachmentNamed', {
                        name: context.fileName,
                        defaultValue: `Remove ${context.fileName}`,
                      })}
                    >
                      <span>{context.fileName}</span>
                      <X size={10} />
                    </button>
                  ))}
                </div>
              )}
              <div className="btw-session-panel__composer-row">
                <button
                  type="button"
                  className="btw-session-panel__composer-attach-button btw-session-panel__composer-attach-button--image"
                  onClick={() => composerImageInputRef.current?.click()}
                  disabled={isSubmittingMessage || isChildSessionProcessing || isAddingComposerImage}
                  aria-label={t('childSession.attachImage', { defaultValue: 'Attach image' })}
                  title={t('childSession.attachImage', { defaultValue: 'Attach image' })}
                >
                  {isAddingComposerImage ? (
                    <Loader2 className="btw-session-panel__composer-loading-icon" size={14} />
                  ) : (
                    <ImageIcon size={14} />
                  )}
                </button>
                <button
                  type="button"
                  className="btw-session-panel__composer-attach-button btw-session-panel__composer-attach-button--file"
                  onClick={() => composerFileInputRef.current?.click()}
                  disabled={isSubmittingMessage || isChildSessionProcessing || isAddingComposerTextFile}
                  aria-label={t('childSession.attachFile', { defaultValue: 'Attach text file' })}
                  title={t('childSession.attachFile', { defaultValue: 'Attach text file' })}
                >
                  {isAddingComposerTextFile ? (
                    <Loader2 className="btw-session-panel__composer-loading-icon" size={14} />
                  ) : (
                    <Link2 size={14} />
                  )}
                </button>
                <textarea
                  ref={composerInputRef}
                  className="btw-session-panel__composer-input"
                  value={composerValue}
                  onChange={handleComposerValueChange}
                  onKeyDown={handleComposerKeyDown}
                  disabled={isSubmittingMessage || isChildSessionProcessing}
                  rows={1}
                  placeholder={childKind === 'subagent'
                    ? t('childSession.composerPlaceholderAgent', {
                      defaultValue: 'Message this agent...',
                    })
                    : t('childSession.composerPlaceholderFollowup', {
                      defaultValue: 'Ask a follow-up...',
                    })}
                  aria-label={t('childSession.composerAriaLabel', {
                    defaultValue: 'Message child session',
                  })}
                />
                {isChildSessionProcessing ? (
                  <button
                    type="button"
                    className="btw-session-panel__composer-button btw-session-panel__composer-button--stop"
                    onClick={() => void handleStopChildSession()}
                    disabled={stoppingChildSession}
                    aria-label={stoppingChildSession
                      ? t('childSession.stopping', { defaultValue: 'Stopping...' })
                      : t('childSession.stop', { defaultValue: 'Stop' })}
                    title={stoppingChildSession
                      ? t('childSession.stopping', { defaultValue: 'Stopping...' })
                      : t('childSession.stop', { defaultValue: 'Stop' })}
                  >
                    <Square size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btw-session-panel__composer-button"
                    onClick={() => void handleSubmitComposer()}
                    disabled={!canSubmitComposer}
                    aria-label={t('childSession.send', { defaultValue: 'Send' })}
                    title={t('childSession.send', { defaultValue: 'Send' })}
                  >
                    <Send size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </FlowChatContext.Provider>
  );
};

BtwSessionPanel.displayName = 'BtwSessionPanel';

function isSupportedComposerTextFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.md')
    || name.endsWith('.txt')
    || file.type === 'text/markdown'
    || file.type === 'text/plain';
}

async function readComposerTextFileContext(file: File): Promise<CodeSnippetContext> {
  const text = await file.text();
  return {
    id: `btw-text-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: 'code-snippet',
    filePath: file.name,
    fileName: file.name,
    startLine: 1,
    endLine: Math.max(1, text.split(/\r?\n/).length),
    selectedText: text,
    language: file.name.toLowerCase().endsWith('.md') ? 'markdown' : 'text',
    timestamp: Date.now(),
    metadata: {
      source: 'btw-session-panel-file-input',
      fileSize: file.size,
      mimeType: file.type,
    },
  };
}

function formatComposerTextFileContextForPrompt(context: CodeSnippetContext): string {
  return [
    `[Text Attachment: ${context.fileName}]`,
    `Lines: ${context.startLine}-${context.endLine}`,
    '',
    '```' + (context.language ?? 'text'),
    context.selectedText,
    '```',
  ].join('\n');
}
