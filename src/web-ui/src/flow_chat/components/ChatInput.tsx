/**
 * Standalone chat input component
 * Separated from bottom bar, supports session-level state awareness
 */

import React, { useRef, useCallback, useEffect, useReducer, useState, useMemo } from 'react';
import path from 'path-browserify';
import { useTranslation } from 'react-i18next';
import { Bot, Image, Loader2, Plus, X, Files, MessageSquarePlus, Users } from 'lucide-react';
import { ContextDropZone } from '../../shared/context-system';
import { useActiveSessionState } from '@/flow_chat/hooks';
import {
  RichTextInput,
  type MentionState,
  type RichTextInputElement,
} from './RichTextInput';
import { FileMentionPicker } from './FileMentionPicker';
import { globalEventBus } from '@/infrastructure/event-bus';
import {
  useSessionStateMachine,
  useSessionStateMachineActions,
} from '../hooks/useSessionStateMachine';
import { SessionExecutionEvent } from '../state-machine/types';
import { deriveSessionState } from '../state-machine/derivedState';
import { ModelSelector } from './ModelSelector';
import { FlowChatStore } from '../store/FlowChatStore';
import type { FlowChatState, Session } from '../types/flow-chat';
import type { FileContext, DirectoryContext, ImageContext } from '@/types/context.ts';
import { SmartRecommendations } from './smart-recommendations';
import { useCurrentWorkspace } from '@/infrastructure/contexts/WorkspaceContext';
import { useWorkspaceContext } from '@/infrastructure/contexts/WorkspaceContext';
import { WorkspaceKind } from '@/shared/types';
import { createImageContextFromFile, createImageContextFromClipboard } from '../utils/imageUtils';
import { notificationService } from '@/shared/notification-system';
import { inputReducer, initialInputState } from '../reducers/inputReducer';
import { modeReducer, initialModeState } from '../reducers/modeReducer';
import { CHAT_INPUT_CONFIG } from '../constants/chatInputConfig';
import { useMessageSender } from '../hooks/useMessageSender';
import { useComposerModePersistence } from '../hooks/useComposerModePersistence';
import { useComposerPersonaSelection } from '../hooks/useComposerPersonaSelection';
import { ComposerPersonaPicker } from './ComposerPersonaPicker';
import { ComposerActionButton } from './ComposerActionButton';
import {
  localizeCatalogPresentation,
  type AgentCatalogEntry,
  type TeamCatalogEntry,
} from '@/shared/services/customization';
import { resolveEmployeeAvatarUrl } from '@/app/scenes/agents/components/employeeAvatar';
import { useChatInputState } from '../store/chatInputStateStore';
import { useInputHistoryStore } from '../store/inputHistoryStore';
import { startBtwThread } from '../services/BtwThreadService';
import { cancelComposerTarget } from '../services/cancelComposerTarget';
import { runUsageReportCommand } from '../services/usageReportService';
import {
  isGoalSlashCommand,
  parseGoalCommand,
  runGoalCommandSafely,
  runGoalManagementCommandSafely,
} from '../services/goalService';
import {
  DEEP_REVIEW_SLASH_COMMAND,
  getDeepReviewLaunchErrorMessage,
  buildDeepReviewLaunchFromSlashCommand,
  buildDeepReviewPreviewFromSlashCommand,
  isDeepReviewSlashCommand,
  launchDeepReviewSession,
} from '../services/DeepReviewService';
import { createLogger } from '@/shared/utils/logger';
import { Tooltip, IconButton, confirmWarning } from '@/component-library';
import { PendingQueuePanel } from './PendingQueuePanel';
import {
  openBtwSessionInAuxPane,
} from '../services/openBtwSession';
import { resolveSessionRelationship } from '../utils/sessionMetadata';
import { useComposerTarget } from '../hooks/useComposerTarget';
import { useComposerContexts } from '../hooks/useComposerContexts';
import { isAcpFlowSession } from '../utils/acpSession';
import { resolveWorkspaceChatInputMode } from '../utils/chatInputMode';
import { useSceneStore } from '@/app/stores/sceneStore';
import type { SceneTabId } from '@/app/components/SceneBar/types';
import { configAPI } from '@/infrastructure/api';
import type {
  ModeSkillInfo,
  ToolPermissionConfig,
  ToolPermissionMode,
} from '@/infrastructure/config/types';
import {
  DEFAULT_TOOL_PERMISSION_CONFIG,
  toolPermissionConfigService,
} from '@/infrastructure/config/services/ToolPermissionConfigService';
import MCPAPI, { type MCPPrompt, type MCPPromptMessage, type MCPServerInfo } from '@/infrastructure/api/service-api/MCPAPI';
import { ChatInputWorkspaceStrip } from './ChatInputWorkspaceStrip';
import { expandWidgetPromptReferenceTokens } from '@/tools/generative-widget/widgetPromptReference';
import { useDeepReviewConsent } from './DeepReviewConsentDialog';
import { useSessionReviewActivity } from '../hooks/useSessionReviewActivity';
import { shouldBlockDeepReviewCommand } from '../utils/deepReviewCommandGuard';
import { deriveDeepReviewSessionConcurrencyGuard } from '../utils/deepReviewCapacityGuard';
import { popLastExistingImageUndoId } from '../utils/chatInputImageUndo';
import { agentAPI } from '@/infrastructure/api/service-api/AgentAPI';
import { shouldShowChatInputImageStrip } from '../utils/chatInputImageStrip';
import { buildImageContextsForBackend } from '../utils/imageContextForBackend';
import {
  getMediaReferencePromptText,
  MEDIA_REFERENCE_EVENT,
  type MediaReferenceEventDetail,
} from '@/shared/services/media-reference';
import { setChatPopupActive } from './chatPopupState';
import { isComposerActionAllowed } from '../utils/composerSubmissionGuard';
import { useSessionModeStore } from '@/app/stores/sessionModeStore';
import {
  completeNewSessionDraft,
  isNewSessionDraftWorkspaceAvailable,
  selectNewSessionDraftPersona,
  selectNewSessionDraftWorkspace,
} from '../services/NewSessionDraftService';
import { customizationTaskDispatchService } from '@/app/services/CustomizationTaskDispatchService';
import { DEFAULT_REVIEW_TEAM_ID } from '@/shared/services/review-team/defaults';
import {
  clearSessionComposerDraftIfRevision,
  consumeEmptyPasteClearGuard,
  countEmptyPasteClearGuards,
  getSessionComposerDraft,
  getSessionComposerDraftRevision,
  isSessionComposerSnapshotCurrent,
  observeSessionComposerQueue,
  resolveSessionComposerHydration,
  resolveSessionComposerDraftGuard,
  saveSessionComposerDraft,
  saveSessionComposerDraftIfRevision,
  shouldApplyGuardedComposerResult,
  shouldApplySessionComposerHydration,
  shouldClaimSuccessfulSendReceipt,
  shouldDeactivateComposerAfterSend,
  shouldRestoreFailedComposer,
  shouldRestoreFailedComposerContent,
} from '../store/sessionComposerStore';
import {
  composerPresentationToValue,
  getComposerPresentationContexts,
  parseComposerPresentation,
} from '../utils/composerPresentation';
import { createSkillPromptReferenceToken } from '../utils/skillPromptReference';
import { shouldRouteComposerEvent } from '../utils/composerEventRouting';
import { ComposerVoiceInputButton } from './voice/ComposerVoiceInputButton';
import { useComposerVoiceInput } from './voice/useComposerVoiceInput';
import './ChatInput.scss';

const log = createLogger('ChatInput');
const BoostSkillsSubmenu = React.lazy(() => import('./BoostSkillsSubmenu'));

export interface ChatInputProps {
  className?: string;
  onSendMessage?: (message: string) => void;
  /** Exact persistent child session for an independently mounted BTW/subagent composer. */
  sessionId?: string;
  /** Explicit owner of sessionId; required to validate the child-session boundary. */
  parentSessionId?: string;
}

type SlashActionItem = {
  kind: 'action';
  id: string;
  command: string;
  label: string;
};

type SlashModeItem = {
  kind: 'mode';
  id: string;
  name: string;
};

type SlashMcpPromptItem = {
  kind: 'mcpPrompt';
  id: string;
  command: string;
  label: string;
  serverId: string;
  serverName: string;
  promptName: string;
  description?: string;
  arguments: Array<{
    name: string;
    required: boolean;
    description?: string;
  }>;
};

type SlashPickerItem = SlashActionItem | SlashModeItem | SlashMcpPromptItem;
type PendingLargePasteMap = Record<string, string>;

function getCharacterCount(text: string): number {
  return Array.from(text).length;
}

function buildMcpPromptSlashCommand(serverId: string, promptName: string): string {
  return `/${serverId}:${promptName}`;
}

function parseSlashArguments(input: string): string[] {
  const matches = input.match(/"([^"]*)"|'([^']*)'|[^\s]+/g) || [];
  return matches.map(token => {
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith('\'') && token.endsWith('\''))
    ) {
      return token.slice(1, -1);
    }
    return token;
  });
}

function renderMcpPromptContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!content || typeof content !== 'object') {
    return '[Unsupported MCP prompt content]';
  }

  const block = content as Record<string, unknown>;
  const type = typeof block.type === 'string' ? block.type : undefined;

  if (type === 'text' && typeof block.text === 'string') {
    return block.text;
  }

  if (type === 'image') {
    return `[Image${typeof block.mimeType === 'string' ? `: ${block.mimeType}` : ''}]`;
  }

  if (type === 'audio') {
    return `[Audio${typeof block.mimeType === 'string' ? `: ${block.mimeType}` : ''}]`;
  }

  if (type === 'resource_link') {
    const uri = typeof block.uri === 'string' ? block.uri : 'unknown';
    const name = typeof block.name === 'string' ? block.name : undefined;
    return name ? `[Resource Link: ${name} (${uri})]` : `[Resource Link: ${uri}]`;
  }

  if (type === 'resource' && block.resource && typeof block.resource === 'object') {
    const resource = block.resource as Record<string, unknown>;
    const resourceText =
      typeof resource.text === 'string'
        ? resource.text
        : typeof resource.content === 'string'
          ? resource.content
          : undefined;
    if (resourceText) {
      return resourceText;
    }
    const uri = typeof resource.uri === 'string' ? resource.uri : 'unknown';
    return `[Resource: ${uri}]`;
  }

  return '[Unsupported MCP prompt content]';
}

function renderMcpPromptMessages(messages: MCPPromptMessage[]): string {
  return messages
    .map(message => {
      const text = renderMcpPromptContent(message.content).trim();
      if (!text) {
        return '';
      }

      switch (message.role) {
        case 'system':
          return text;
        case 'user':
          return `User: ${text}`;
        case 'assistant':
          return `Assistant: ${text}`;
        default:
          return `${message.role}: ${text}`;
      }
    })
    .filter(Boolean)
    .join('\n\n');
}

function getSessionContextUsageDisplay(session?: Session): { current: number; max: number } {
  if (!session) {
    return { current: 0, max: 128128 };
  }

  if (session.currentAcpContextUsage) {
    return {
      current: session.currentAcpContextUsage.used,
      max: session.currentAcpContextUsage.size,
    };
  }

  return {
    current: session.currentTokenUsage?.totalTokens || 0,
    max: session.maxContextTokens || 128128,
  };
}

export const ChatInput: React.FC<ChatInputProps> = ({
  className = '',
  onSendMessage,
  sessionId,
  parentSessionId,
}) => {
  const { t } = useTranslation('flow-chat');
  const { t: tCommon } = useTranslation('common');
  const { t: tAgents } = useTranslation('scenes/agents');
  const isIndependentChildComposer = Boolean(sessionId);
  
  const [inputState, dispatchInput] = useReducer(inputReducer, initialInputState);
  const [modeState, dispatchMode] = useReducer(modeReducer, initialModeState);
  
  const richTextInputRef = useRef<RichTextInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const agentBoostRef = useRef<HTMLDivElement>(null);
  const isImeComposingRef = useRef(false);
  // Ref so the queuedInput sync effect can read the latest value without it being a dep
  const inputValueRef = useRef('');
  const pendingLargePastesRef = useRef<PendingLargePasteMap>({});
  const emptyPasteClearGuardCountRef = useRef(0);
  const largePasteCountersRef = useRef<Record<number, number>>({});
  const undoImageStackRef = useRef<string[]>([]);
  
  // History navigation state
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [savedDraft, setSavedDraft] = useState('');
  const { addMessage: addToHistory, getSessionHistory } = useInputHistoryStore();
  
  const {
    contexts,
    addContext,
    removeContext,
    replaceContexts,
  } = useComposerContexts(isIndependentChildComposer);
  const contextsRef = useRef(contexts);

  useEffect(() => {
    inputValueRef.current = inputState.value;
  }, [inputState.value]);

  useEffect(() => {
    contextsRef.current = contexts;
  }, [contexts]);

  const imageContexts = useMemo(
    () => contexts.filter((c): c is ImageContext => c.type === 'image'),
    [contexts],
  );
  const currentImageCount = imageContexts.length;
  const showImageStrip = shouldShowChatInputImageStrip({
    imageCount: currentImageCount,
    isInputActive: inputState.isActive,
  });
  
  const activeSessionState = useActiveSessionState();
  const [flowChatState, setFlowChatState] = useState<FlowChatState>(() => FlowChatStore.getInstance().getState());
  const currentSessionId = activeSessionState.sessionId;
  const mainSessionId = parentSessionId || currentSessionId;
  const composerTarget = useComposerTarget({
    mainSessionId,
    targetSessionId: sessionId,
    parentSessionId,
    sessions: flowChatState.sessions,
  });
  const previousComposerSessionIdRef = useRef<string | null>(null);
  const previousComposerScopeIdRef = useRef<string | null>(null);
  const deferredCreatedSessionIdRef = useRef<string | null>(null);
  const lastAppliedQueuedInputRef = useRef<{
    sessionId: string | null;
    value: string | null;
  }>({ sessionId: null, value: null });
  const draftMode = useSessionModeStore(state => state.mode);
  const draftId = useSessionModeStore(state => state.draftId);
  const draftStatus = useSessionModeStore(state => state.draftStatus);
  const draftWorkspace = useSessionModeStore(state => state.draftWorkspace);
  const draftExecutionPolicy = useSessionModeStore(state => state.draftExecutionPolicy);
  const draftPersonaTarget = useSessionModeStore(state => state.draftPersonaTarget);
  const setDraftStatus = useSessionModeStore(state => state.setDraftStatus);
  const isNewSessionDraft =
    !isIndependentChildComposer
    && !currentSessionId
    && draftStatus !== 'idle';
  const effectiveTargetSessionId =
    composerTarget.status === 'ready' ? composerTarget.sessionId : null;
  const effectiveTargetSessionIdRef = useRef<string | null>(
    effectiveTargetSessionId,
  );
  effectiveTargetSessionIdRef.current = effectiveTargetSessionId;
  const isPrimaryComposer = !isIndependentChildComposer;
  const composerScopeId = effectiveTargetSessionId || draftId;
  const effectiveTargetSession = effectiveTargetSessionId
    ? flowChatState.sessions.get(effectiveTargetSessionId)
    : undefined;
  const effectiveTargetRelationship = resolveSessionRelationship(effectiveTargetSession);
  const isBtwSession = effectiveTargetRelationship.displayAsChild;

  // Memoize history so keyboard handlers don't see a fresh [] on every render.
  const inputHistory = useMemo(
    () => (effectiveTargetSessionId ? getSessionHistory(effectiveTargetSessionId) : []),
    [effectiveTargetSessionId, getSessionHistory],
  );
  const sessionSnapshot = useSessionStateMachine(effectiveTargetSessionId);
  const derivedState = useMemo(
    () => sessionSnapshot
      ? deriveSessionState(sessionSnapshot, {
        processingInputDraftTrimmed: inputState.value.trim(),
      })
      : null,
    [inputState.value, sessionSnapshot],
  );

  useEffect(() => {
    if (!isSessionComposerSnapshotCurrent(
      effectiveTargetSessionId,
      sessionSnapshot?.sessionId,
    )) {
      return;
    }

    const previousScopeId = previousComposerScopeIdRef.current;
    const sessionChanged = previousScopeId !== composerScopeId;
    const queueDecision = observeSessionComposerQueue(
      lastAppliedQueuedInputRef.current,
      effectiveTargetSessionId,
      derivedState?.queuedInput,
    );
    const queuedInput = queueDecision.observation.value;
    lastAppliedQueuedInputRef.current = queueDecision.observation;

    if (!shouldApplySessionComposerHydration(
      sessionChanged,
      queueDecision,
      inputValueRef.current,
    )) {
      return;
    }

    if (sessionChanged && previousScopeId) {
      saveSessionComposerDraft(previousScopeId, {
        value: inputValueRef.current,
        contexts: contextsRef.current,
        pendingLargePastes: pendingLargePastesRef.current,
      });
    }

    const restoredDraft = composerScopeId
      ? getSessionComposerDraft(composerScopeId)
      : undefined;
    const hydration = resolveSessionComposerHydration(queuedInput, restoredDraft);

    previousComposerSessionIdRef.current = effectiveTargetSessionId;
    previousComposerScopeIdRef.current = composerScopeId;
    emptyPasteClearGuardCountRef.current = countEmptyPasteClearGuards(
      Object.keys(hydration.pendingLargePastes).length > 0,
      inputValueRef.current,
      hydration.value,
    );
    inputValueRef.current = hydration.value;
    pendingLargePastesRef.current = hydration.pendingLargePastes;
    contextsRef.current = hydration.contexts;
    if (queuedInput) {
      dispatchInput({ type: 'ACTIVATE' });
    }
    dispatchInput({ type: 'SET_VALUE', payload: hydration.value });
    replaceContexts(hydration.contexts);
    setHistoryIndex(-1);
    if (queuedInput) {
      richTextInputRef.current?.focus();
    }
  }, [
    composerScopeId,
    derivedState?.queuedInput,
    effectiveTargetSessionId,
    replaceContexts,
    sessionSnapshot?.sessionId,
  ]);

  useEffect(() => {
    if (!isIndependentChildComposer) {
      return;
    }
    return () => {
      const scopeId = previousComposerScopeIdRef.current;
      if (!scopeId) {
        return;
      }
      saveSessionComposerDraft(scopeId, {
        value: inputValueRef.current,
        contexts: contextsRef.current,
        pendingLargePastes: pendingLargePastesRef.current,
      });
    };
  }, [isIndependentChildComposer]);

  const currentReviewActivity = useSessionReviewActivity(effectiveTargetSessionId);
  const { confirmDeepReviewLaunch, deepReviewConsentDialog } = useDeepReviewConsent();
  // isMultiLine: true when content overflows a single line (scrollHeight > threshold or has newlines)
  const [isMultiLine, setIsMultiLine] = useState(false);
  // showPlaceholder is true when the editor DOM is truly empty (value empty AND no residual <br>)
  const [showPlaceholder, setShowPlaceholder] = useState(true);

  const checkDomEmpty = useCallback(() => {
    const el = richTextInputRef.current;
    if (!el) { setShowPlaceholder(true); return; }
    const hasOnlyBr =
      el.childNodes.length === 1 &&
      (el.childNodes[0] as Element).nodeName === 'BR';
    const isEmpty = (el.textContent ?? '').trim() === '' &&
      (el.childNodes.length === 0 || hasOnlyBr);
    setShowPlaceholder(isEmpty && contexts.length === 0);
  }, [contexts.length]);

  // Shared measurement: temporarily unconstrain the editor and use the capsule input
  // width so the result is consistent between capsule ↔ multi-line transitions.
  const measureIsMultiLine = useCallback(() => {
    const hasNewline = inputState.value.includes('\n');
    const hasImages = imageContexts.length > 0;
    if (hasNewline || hasImages) {
      setIsMultiLine(true);
      return;
    }
    const el = richTextInputRef.current;
    if (!el) {
      setIsMultiLine(false);
      return;
    }
    // Capsule input width ≈ box width minus Plus-area (~36px) and right-actions (~140px)
    const boxEl = el.closest('.void-chat-input__box') as HTMLElement | null;
    const boxWidth = boxEl?.offsetWidth ?? containerRef.current?.offsetWidth ?? 400;
    const capsuleInputWidth = Math.max(80, boxWidth - 176);

    // Temporarily remove flex stretching + set capsule width to get the true content height.
    const prevFlex = el.style.flex;
    const prevMinH = el.style.minHeight;
    const prevWidth = el.style.width;
    el.style.flex = 'none';
    el.style.minHeight = '0';
    el.style.width = `${capsuleInputWidth}px`;
    const naturalHeight = el.scrollHeight;
    el.style.flex = prevFlex;
    el.style.minHeight = prevMinH;
    el.style.width = prevWidth;
    // ~1.45 × 14px ≈ 20px per line; threshold of 32px means "needs > 1 line"
    setIsMultiLine(naturalHeight > 32);
  }, [inputState.value, imageContexts.length]);

  // Re-measure when value or image count changes (handles typing / deleting)
  useEffect(() => {
    // Defer one frame so RichTextInput has synced the new value to the contenteditable DOM.
    const rafId = requestAnimationFrame(() => {
      measureIsMultiLine();
      checkDomEmpty();
    });
    return () => cancelAnimationFrame(rafId);
  }, [measureIsMultiLine, checkDomEmpty]);

  // Also watch DOM mutations on the editor so that Shift+Enter in an empty input
  // (which adds a <br> without changing the React value) triggers expansion,
  // and so that residual <br> after deletion is detected for placeholder visibility.
  useEffect(() => {
    const el = richTextInputRef.current;
    if (!el) return;
    let rafId: number;
    const observer = new MutationObserver(() => {
      rafId = requestAnimationFrame(() => {
        measureIsMultiLine();
        checkDomEmpty();
      });
    });
    observer.observe(el, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  // measureIsMultiLine / checkDomEmpty capture latest closure values
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { transition, setQueuedInput } = useSessionStateMachineActions(effectiveTargetSessionId);

  const {
    workspace,
    workspacePath: activeWorkspacePath,
    workspaceName,
  } = useCurrentWorkspace();
  const { openedWorkspacesList } = useWorkspaceContext();
  const composerWorkspacePath =
    effectiveTargetSession?.workspacePath?.trim()
    || activeWorkspacePath?.trim()
    || '';

  const draftWorkspaceOptions = useMemo(
    () => openedWorkspacesList.filter(
      candidate => candidate.workspaceKind !== WorkspaceKind.Assistant,
    ),
    [openedWorkspacesList],
  );
  const pendingDraftWorkspaceIdsRef = useRef<Set<string> | null>(null);

  const handleCreateDraftWorkspace = useCallback(() => {
    pendingDraftWorkspaceIdsRef.current = new Set(
      draftWorkspaceOptions.map(candidate => candidate.id),
    );
    window.dispatchEvent(new Event('nav:new-project'));
  }, [draftWorkspaceOptions]);

  useEffect(() => {
    if (!isNewSessionDraft) {
      pendingDraftWorkspaceIdsRef.current = null;
      return;
    }

    const previousWorkspaceIds = pendingDraftWorkspaceIdsRef.current;
    if (!previousWorkspaceIds) {
      return;
    }

    const createdWorkspace = draftWorkspaceOptions.find(
      candidate => !previousWorkspaceIds.has(candidate.id),
    );
    if (createdWorkspace) {
      selectNewSessionDraftWorkspace(createdWorkspace);
      pendingDraftWorkspaceIdsRef.current = null;
    }
  }, [draftWorkspaceOptions, isNewSessionDraft]);

  const chatStripRepositoryPath = useMemo(() => {
    if (isNewSessionDraft) {
      return draftWorkspace?.rootPath?.trim() || '';
    }
    const fromContext = composerWorkspacePath;
    const fromSession = (effectiveTargetSession?.workspacePath || '').trim();
    return fromSession || fromContext;
  }, [
    draftWorkspace?.rootPath,
    effectiveTargetSession?.workspacePath,
    isNewSessionDraft,
    composerWorkspacePath,
  ]);

  const chatStripWorkspaceLabel = useMemo(() => {
    if (isNewSessionDraft) {
      return draftWorkspace?.name?.trim() || t('workspaceStrip.selectWorkspace');
    }
    const name = (workspaceName || '').trim();
    if (name) return name;
    if (chatStripRepositoryPath) return path.basename(chatStripRepositoryPath);
    return '';
  }, [
    chatStripRepositoryPath,
    draftWorkspace?.name,
    isNewSessionDraft,
    workspaceName,
    t,
  ]);
  
  const [tokenUsage, setTokenUsage] = React.useState({ current: 0, max: 128128 });
  const isAssistantWorkspace = workspace?.workspaceKind === WorkspaceKind.Assistant;
  const draftAgentType =
    draftExecutionPolicy
    || (draftMode === 'cowork'
      ? 'Cowork'
      : draftMode === 'media'
        ? 'Media'
        : 'agentic');

  useEffect(() => {
    if (isNewSessionDraft) {
      dispatchMode({ type: 'SET_CURRENT_MODE', payload: draftAgentType });
    }
  }, [draftAgentType, isNewSessionDraft]);

  const currentMode = isNewSessionDraft ? draftAgentType : modeState.current;
  const isAcpTargetSession = isAcpFlowSession(effectiveTargetSession);
  const isModeDropdownOpen = modeState.dropdownOpen;
  const activeSessionMode = effectiveTargetSessionId
    ? flowChatState.sessions.get(effectiveTargetSessionId)?.mode
    : undefined;
  const isChildComposerTarget =
    composerTarget.status === 'ready' && composerTarget.kind === 'child';
  const composerAgentType =
    isChildComposerTarget ? composerTarget.agentType : currentMode;
  const {
    modePersistencePending,
    isModePersistencePending,
    persistModeChange,
  } = useComposerModePersistence({
    sessionId: effectiveTargetSessionId,
    enabled:
      Boolean(effectiveTargetSessionId)
      && !isNewSessionDraft
      && !isChildComposerTarget
      && !isAcpTargetSession
      && effectiveTargetSession?.sessionKind === 'normal',
  });
  const {
    activeAgent: composerActiveAgent,
    activeTeam: composerActiveTeam,
    activePersonaBinding: composerActivePersonaBinding,
    agents: composerPersonaAgents,
    teams: composerPersonaTeams,
    loading: composerPersonaLoading,
    status: composerPersonaStatus,
    enabled: composerPersonaEnabled,
    busyId: composerPersonaBusyId,
    personaPersistencePending,
    isPersonaPersistencePending,
    personaSessionState,
    selectAgent: selectComposerAgent,
    clearAgent: clearComposerAgent,
    runTeamAction: runComposerTeamAction,
  } = useComposerPersonaSelection({
    session: effectiveTargetSession,
    workspacePath: isNewSessionDraft
      ? draftWorkspace?.rootPath
      : composerWorkspacePath,
    currentAgentType: composerAgentType,
    enabled:
      (isNewSessionDraft || Boolean(effectiveTargetSessionId))
      && !isChildComposerTarget
      && !isAcpTargetSession
      && (isNewSessionDraft || effectiveTargetSession?.sessionKind === 'normal'),
    deferredSelection: isNewSessionDraft
      ? {
          target: draftPersonaTarget,
          onChange: selectNewSessionDraftPersona,
        }
      : undefined,
  });
  const customizationPersistencePending =
    modePersistencePending || personaPersistencePending;
  const draftCreationPending = isNewSessionDraft && draftStatus === 'creating';
  const customizationInteractionPending =
    customizationPersistencePending || draftCreationPending;
  useEffect(() => {
    if (draftCreationPending && modeState.dropdownOpen) {
      dispatchMode({ type: 'CLOSE_DROPDOWN' });
    }
  }, [draftCreationPending, modeState.dropdownOpen]);
  const isCustomizationPersistencePending = useCallback(
    () =>
      draftCreationPending
      || isModePersistencePending(effectiveTargetSessionId)
      || isPersonaPersistencePending(),
    [
      draftCreationPending,
      effectiveTargetSessionId,
      isModePersistencePending,
      isPersonaPersistencePending,
    ],
  );
  const activePersonaDisplayName = useMemo(() => {
    if (composerActiveTeam) {
      return localizeCatalogPresentation(
        composerActiveTeam.identity,
        key => tAgents(key),
      ).displayName;
    }
    if (composerActiveAgent) {
      return localizeCatalogPresentation(
        composerActiveAgent.identity,
        key => tAgents(key),
      ).displayName;
    }
    return composerActivePersonaBinding?.kind === 'team_lead'
      ? tCommon('customization.composerPersona.teams')
      : tCommon('customization.composerPersona.selectedAgent');
  }, [
    composerActiveAgent,
    composerActivePersonaBinding?.kind,
    composerActiveTeam,
    tAgents,
    tCommon,
  ]);
  const hasActiveComposerPersona = Boolean(
    composerActiveAgent || composerActiveTeam || composerActivePersonaBinding,
  );
  const isActiveComposerTeam = Boolean(
    composerActiveTeam || composerActivePersonaBinding?.kind === 'team_lead',
  );
  const activePersonaAvatarIdentity = composerActiveTeam?.identity.id
    ?? composerActiveAgent?.identity.id
    ?? (composerActivePersonaBinding?.kind === 'team_lead'
      ? composerActivePersonaBinding.teamDefinitionId
        ?? composerActivePersonaBinding.personaId
      : composerActivePersonaBinding?.personaId)
    ?? null;
  const activePersonaAvatarSrc = useMemo(
    () => activePersonaAvatarIdentity
      ? resolveEmployeeAvatarUrl(activePersonaAvatarIdentity)
      : null,
    [activePersonaAvatarIdentity],
  );
  const [failedPersonaAvatarSrc, setFailedPersonaAvatarSrc] = useState<string | null>(null);

  useEffect(() => {
    setFailedPersonaAvatarSrc(null);
  }, [activePersonaAvatarIdentity]);

  const activePersonaAvatarFailed = activePersonaAvatarSrc === null
    || failedPersonaAvatarSrc === activePersonaAvatarSrc;
  const canSwitchModes =
    !isChildComposerTarget
    && !isAssistantWorkspace
    && currentMode !== 'Cowork'
    && currentMode !== 'Media';

  // Session-level mode policy: Cowork/Media sessions are fixed; code sessions should not switch into those top-level modes.
  const switchableModes = useMemo(
    () =>
      modeState.available.filter(mode =>
        mode.id !== 'Cowork' &&
        mode.id !== 'Media' &&
        (isAssistantWorkspace || mode.id !== 'Claw')
      ),
    [isAssistantWorkspace, modeState.available]
  );

  // Stable refs for Shift+Tab mode cycling (avoids adding deps to handleKeyDown)
  const switchableModesRef = useRef(switchableModes);
  switchableModesRef.current = switchableModes;
  const currentModeRef = useRef(currentMode);
  currentModeRef.current = currentMode;
  const applyModeChangeRef = useRef<
    ((modeId: string) => Promise<void>) | null
  >(null);

  /** Code session: modes switchable on top of default agentic */
  const incrementalCodeModes = useMemo(
    () =>
      switchableModes.filter(
        m => m.id !== 'agentic'
      ),
    [switchableModes]
  );

  const openScene = useSceneStore(s => s.openScene);
  const [boostPanelSkills, setBoostPanelSkills] = useState<ModeSkillInfo[]>([]);
  const [boostSkillsLoading, setBoostSkillsLoading] = useState(false);
  const [toolPermissionConfig, setToolPermissionConfig] = useState<ToolPermissionConfig>(
    DEFAULT_TOOL_PERMISSION_CONFIG,
  );
  const [permissionConfigStatus, setPermissionConfigStatus] = useState<
    'loading' | 'ready' | 'failed'
  >('loading');
  const [permissionModeSaving, setPermissionModeSaving] = useState(false);

  const setChatInputActive = useChatInputState(state => state.setActive);
  const setChatInputExpanded = useChatInputState(state => state.setExpanded);
  const setChatInputHeight = useChatInputState(state => state.setInputHeight);
  const runtimeBoostSkills = useMemo(
    // Only surface skills that this mode will actually resolve at runtime.
    () => boostPanelSkills.filter(skill => skill.selectedForRuntime),
    [boostPanelSkills]
  );

  useEffect(() => {
    const unsubscribe = FlowChatStore.getInstance().subscribe(setFlowChatState);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadPermissionConfig = async () => {
      if (!cancelled) setPermissionConfigStatus('loading');
      try {
        const config = await toolPermissionConfigService.loadConfig();
        if (!cancelled) {
          setToolPermissionConfig(config);
          setPermissionConfigStatus('ready');
        }
      } catch (error) {
        log.warn('Failed to load tool permission config', { error });
        if (!cancelled) setPermissionConfigStatus('failed');
      }
    };
    const handleConfigUpdated = () => {
      void loadPermissionConfig();
    };
    void loadPermissionConfig();
    globalEventBus.on('mode:config:updated', handleConfigUpdated);
    return () => {
      cancelled = true;
      globalEventBus.off('mode:config:updated', handleConfigUpdated);
    };
  }, []);

  const handlePermissionModeChange = useCallback(async (mode: ToolPermissionMode) => {
    if (
      permissionConfigStatus !== 'ready'
      || permissionModeSaving
      || mode === toolPermissionConfig.mode
    ) return;
    if (mode === 'full_access') {
      const confirmed = await confirmWarning(
        t('chatInput.permissionMode.fullAccessWarningTitle'),
        t('chatInput.permissionMode.fullAccessWarningMessage'),
        {
          confirmText: t('chatInput.permissionMode.fullAccessConfirm'),
          cancelText: t('chatInput.permissionMode.cancel'),
        },
      );
      if (!confirmed) return;
    }

    const previous = toolPermissionConfig;
    setToolPermissionConfig({ ...previous, mode });
    setPermissionModeSaving(true);
    try {
      setToolPermissionConfig(
        await toolPermissionConfigService.saveMode(mode, previous),
      );
    } catch (error) {
      log.error('Failed to save tool permission mode', { error, mode });
      setToolPermissionConfig(previous);
      notificationService.error(t('chatInput.permissionMode.changeFailed'));
    } finally {
      setPermissionModeSaving(false);
    }
  }, [permissionConfigStatus, permissionModeSaving, t, toolPermissionConfig]);

  useEffect(() => {
    if (isIndependentChildComposer) {
      return;
    }
    setChatInputActive(inputState.isActive);
  }, [inputState.isActive, isIndependentChildComposer, setChatInputActive]);
  
  useEffect(() => {
    if (isIndependentChildComposer) {
      return;
    }
    setChatInputExpanded(inputState.isExpanded);
  }, [inputState.isExpanded, isIndependentChildComposer, setChatInputExpanded]);

  const newSessionConfig = useMemo(
    () =>
      isNewSessionDraft && draftWorkspace
        ? {
            workspaceId: draftWorkspace.id,
            workspacePath: draftWorkspace.rootPath,
            remoteConnectionId: draftWorkspace.remoteConnectionId,
            remoteSshHost: draftWorkspace.remoteSshHost,
          }
        : undefined,
    [
      draftWorkspace,
      isNewSessionDraft,
    ],
  );

  const handleDeferredSessionCreated = useCallback(async (sessionId: string) => {
    deferredCreatedSessionIdRef.current = sessionId;
    const personaSessionState = draftPersonaTarget
      ? await customizationTaskDispatchService.activateCreatedSession({
          target: draftPersonaTarget,
          sessionId,
          scenario: draftMode,
          executionPolicy: draftAgentType,
          workspacePath: draftWorkspace?.rootPath,
        })
      : undefined;
    completeNewSessionDraft();
    return personaSessionState;
  }, [draftAgentType, draftMode, draftPersonaTarget, draftWorkspace?.rootPath]);
  
  // Reset history index when switching sessions
  useEffect(() => {
    setHistoryIndex(-1);
  }, [effectiveTargetSessionId]);
  
  const { ensureSession, sendMessage } = useMessageSender({
    currentSessionId: effectiveTargetSessionId || undefined,
    contexts,
    onSuccess: onSendMessage,
    // Composer mode is authoritative (synced from session on switch, updated in
    // applyModeChange). Prefer it over session.mode so a stale store cannot force
    // agentic when the user selected Team or another mode.
    currentAgentType: composerAgentType,
    personaSessionState,
    newSessionConfig,
    onSessionCreated: isNewSessionDraft ? handleDeferredSessionCreated : undefined,
    sessionReferenceScope: isNewSessionDraft
      ? newSessionConfig
      : effectiveTargetSession
        ? {
            workspaceId: effectiveTargetSession.workspaceId,
            workspacePath: effectiveTargetSession.workspacePath || '',
            remoteConnectionId: effectiveTargetSession.remoteConnectionId,
            remoteSshHost: effectiveTargetSession.remoteSshHost,
          }
        : undefined,
  });

  const modeInfoById = useMemo(
    () => new Map(modeState.available.map(mode => [mode.id, mode])),
    [modeState.available],
  );

  const getModeDisplayName = useCallback((modeId?: string) => {
    if (!modeId) {
      return '';
    }

    return (
      t(`chatInput.modeNames.${modeId}`, { defaultValue: '' }) ||
      modeInfoById.get(modeId)?.name ||
      modeId
    );
  }, [modeInfoById, t]);

  const confirmPromptCacheGuardIfNeeded = useCallback(async () => {
    const nextMode = currentMode.trim();
    const lastSubmittedMode = effectiveTargetSession?.lastSubmittedMode?.trim();
    if (!nextMode || !lastSubmittedMode || nextMode === lastSubmittedMode) {
      return true;
    }

    const nextScopeKey = modeInfoById.get(nextMode)?.promptCacheScopeKey;
    const previousScopeKey = modeInfoById.get(lastSubmittedMode)?.promptCacheScopeKey;
    if (!nextScopeKey || !previousScopeKey || nextScopeKey === previousScopeKey) {
      return true;
    }

    return confirmWarning(
      t('chatInput.promptCacheGuardTitle', {
        defaultValue: 'Switching this mode will reset prompt cache reuse',
      }),
      t('chatInput.promptCacheGuardBody', {
        defaultValue:
          'The next request will switch from {{fromMode}} to {{toMode}}, so this session will stop reusing its current prompt cache. Continue?',
        fromMode: getModeDisplayName(lastSubmittedMode),
        toMode: getModeDisplayName(nextMode),
      }),
      {
        confirmText: t('chatInput.promptCacheGuardConfirm', {
          defaultValue: 'Send anyway',
        }),
        cancelText: t('chatInput.promptCacheGuardCancel', {
          defaultValue: 'Stay here',
        }),
      },
    );
  }, [currentMode, effectiveTargetSession?.lastSubmittedMode, getModeDisplayName, modeInfoById, t]);

  const [mcpPromptCommands, setMcpPromptCommands] = useState<SlashMcpPromptItem[]>([]);
  const [mcpPromptCommandsLoading, setMcpPromptCommandsLoading] = useState(false);

  const loadMcpPromptCommands = useCallback(async () => {
    setMcpPromptCommandsLoading(true);

    try {
      const servers = await MCPAPI.getServers();
      const connectedServers = servers.filter(
        server => server.status === 'Connected' || server.status === 'Healthy'
      );

      const promptGroups = await Promise.all(
        connectedServers.map(async (server: MCPServerInfo) => {
          try {
            const prompts = await MCPAPI.listPrompts({
              serverId: server.id,
              refresh: true,
            });
            return prompts.map((prompt: MCPPrompt) => ({
              kind: 'mcpPrompt' as const,
              id: `${server.id}:${prompt.name}`,
              command: buildMcpPromptSlashCommand(server.id, prompt.name),
              label:
                prompt.description?.trim() ||
                `${server.name} MCP prompt`,
              serverId: server.id,
              serverName: server.name,
              promptName: prompt.name,
              description: prompt.description,
              arguments: (prompt.arguments || []).map(argument => ({
                name: argument.name,
                required: argument.required,
                description: argument.description,
              })),
            }));
          } catch (error) {
            log.warn('Failed to load MCP prompts for server', {
              serverId: server.id,
              error,
            });
            return [] as SlashMcpPromptItem[];
          }
        })
      );

      setMcpPromptCommands(
        promptGroups
          .flat()
          .sort((a, b) => a.command.localeCompare(b.command))
      );
    } finally {
      setMcpPromptCommandsLoading(false);
    }
  }, []);
  
  const [recommendationContext, setRecommendationContext] = React.useState<{
    workspacePath?: string;
    sessionId?: string;
    turnIndex?: number;
    modifiedFiles?: string[];
  } | null>(null);
  
  const [mentionState, setMentionState] = useState<MentionState>({
    isActive: false,
    query: '',
    startOffset: 0,
  });
  
  const [slashCommandState, setSlashCommandState] = useState<{
    isActive: boolean;
    kind: 'modes' | 'actions' | 'all';
    query: string;
    selectedIndex: number;
  }>({
    isActive: false,
    kind: 'modes',
    query: '',
    selectedIndex: 0,
  });

  useEffect(() => {
    setChatPopupActive(slashCommandState.isActive || mentionState.isActive);
    return () => setChatPopupActive(false);
  }, [mentionState.isActive, slashCommandState.isActive]);

  const clearPendingLargePastes = useCallback(() => {
    pendingLargePastesRef.current = {};
  }, []);

  const createLargePastePlaceholder = useCallback((text: string): string | null => {
    const charCount = getCharacterCount(text);
    if (charCount <= CHAT_INPUT_CONFIG.largePaste.thresholdChars) {
      return null;
    }

    const nextCounters = largePasteCountersRef.current;
    const nextSuffix = (nextCounters[charCount] ?? 0) + 1;
    nextCounters[charCount] = nextSuffix;

    const base = t('input.largePastePlaceholder', {
      count: charCount,
      defaultValue: '[Pasted Content {{count}} chars]',
    });
    const placeholder = nextSuffix === 1 ? base : `${base} #${nextSuffix}`;

    pendingLargePastesRef.current = {
      ...pendingLargePastesRef.current,
      [placeholder]: text,
    };

    return placeholder;
  }, [t]);

  const prunePendingLargePastes = useCallback((text: string) => {
    const entries = Object.entries(pendingLargePastesRef.current);
    if (entries.length === 0) {
      return;
    }

    pendingLargePastesRef.current = Object.fromEntries(
      entries.filter(([placeholder]) => text.includes(placeholder))
    );
  }, []);

  const expandPendingLargePastes = useCallback((text: string) => {
    let expanded = text;
    for (const [placeholder, actual] of Object.entries(pendingLargePastesRef.current)) {
      if (expanded.includes(placeholder)) {
        expanded = expanded.split(placeholder).join(actual);
      }
    }
    return expanded;
  }, []);

  const expandComposerSpecialTokens = useCallback((text: string) => {
    return expandWidgetPromptReferenceTokens(expandPendingLargePastes(text)).trim();
  }, [expandPendingLargePastes]);

  React.useEffect(() => {
    if (inputState.value === '') {
      const guard = consumeEmptyPasteClearGuard(
        emptyPasteClearGuardCountRef.current,
      );
      emptyPasteClearGuardCountRef.current = guard.remainingGuardCount;
      if (guard.shouldSkipClear) {
        return;
      }
      clearPendingLargePastes();
    }
  }, [clearPendingLargePastes, inputState.value]);
  
  React.useEffect(() => {
    const store = FlowChatStore.getInstance();
    
    const unsubscribe = store.subscribe((state: FlowChatState) => {
      if (effectiveTargetSessionId) {
        const session = state.sessions.get(effectiveTargetSessionId);
        if (session) {
          setTokenUsage(getSessionContextUsageDisplay(session));
        }
      }
    });

    if (effectiveTargetSessionId) {
      const state = store.getState();
      const session = state.sessions.get(effectiveTargetSessionId);
      if (session) {
        setTokenUsage(getSessionContextUsageDisplay(session));
      }
    }

    return () => unsubscribe();
  }, [effectiveTargetSessionId]);

  React.useEffect(() => {
    const handleFillInput = (event: Event) => {
      const customEvent = event as CustomEvent<{
        message: string;
        targetSessionId?: string;
      }>;
      const message = customEvent.detail?.message;
      if (!shouldRouteComposerEvent({
        composerSessionId: effectiveTargetSessionId,
        targetSessionId: customEvent.detail?.targetSessionId,
        isPrimary: isPrimaryComposer,
      })) {
        return;
      }
      
      if (message) {
        clearPendingLargePastes();
        dispatchInput({ type: 'ACTIVATE' });
        dispatchInput({ type: 'SET_VALUE', payload: message });
        
        if (richTextInputRef.current) {
          richTextInputRef.current.focus();
        }
      }
    };

    window.addEventListener('fill-chat-input', handleFillInput);
    
    return () => {
      window.removeEventListener('fill-chat-input', handleFillInput);
    };
  }, [
    clearPendingLargePastes,
    effectiveTargetSessionId,
    isPrimaryComposer,
  ]);

  React.useEffect(() => {
    const handleFillChatInput = (data: {
      content: string;
      onlyIfEmpty?: boolean;
      mode?: 'replace' | 'append';
      separator?: string;
      composerPresentation?: unknown;
      targetSessionId?: string;
    }) => {
      const parsedPresentation = data.mode === 'append'
        ? null
        : parseComposerPresentation(data.composerPresentation);
      const restoredContent = parsedPresentation
        ? composerPresentationToValue(parsedPresentation)
        : data.content;
      const requestedTargetSessionId = data.targetSessionId?.trim();
      if (!shouldRouteComposerEvent({
        composerSessionId: effectiveTargetSessionId,
        targetSessionId: requestedTargetSessionId,
        isPrimary: isPrimaryComposer,
      })) {
        return;
      }

      if (data.onlyIfEmpty && inputValueRef.current.trim().length > 0) {
        return;
      }

      const nextValue =
        data.mode === 'append'
          ? (() => {
              const currentValue = inputValueRef.current;
              if (!currentValue.trim()) {
                return restoredContent;
              }

              const separator = data.separator ?? '\n\n';
              return `${currentValue.replace(/\s+$/, '')}${separator}${restoredContent.replace(/^\s+/, '')}`;
            })()
          : restoredContent;

      if (data.mode !== 'append') {
        clearPendingLargePastes();
        const restoredContexts = parsedPresentation
          ? getComposerPresentationContexts(parsedPresentation)
          : [];
        contextsRef.current = restoredContexts;
        replaceContexts(restoredContexts);
      }
      dispatchInput({ type: 'ACTIVATE' });
      dispatchInput({ type: 'SET_VALUE', payload: nextValue });
      inputValueRef.current = nextValue;
      if (parsedPresentation) {
        window.requestAnimationFrame(() => {
          richTextInputRef.current?.restorePresentation?.(parsedPresentation);
        });
      }

      if (richTextInputRef.current) {
        richTextInputRef.current.focus();
      }
    };

    globalEventBus.on('fill-chat-input', handleFillChatInput);

    return () => {
      globalEventBus.off('fill-chat-input', handleFillChatInput);
    };
  }, [
    clearPendingLargePastes,
    effectiveTargetSessionId,
    isPrimaryComposer,
    replaceContexts,
  ]);

  // Expose current input value for external queries (e.g. deep review fill-back confirmation)
  React.useEffect(() => {
    const handleGetChatInputState = (request: {
      getValue?: () => string;
      targetSessionId?: string;
    }) => {
      if (!shouldRouteComposerEvent({
        composerSessionId: effectiveTargetSessionId,
        targetSessionId: request.targetSessionId,
        isPrimary: isPrimaryComposer,
      })) {
        return;
      }
      request.getValue = () => inputValueRef.current;
    };

    globalEventBus.on('chat-input:get-state', handleGetChatInputState);

    return () => {
      globalEventBus.off('chat-input:get-state', handleGetChatInputState);
    };
  }, [effectiveTargetSessionId, isPrimaryComposer]);

  React.useEffect(() => {
    if (!slashCommandState.isActive || slashCommandState.kind !== 'all' || derivedState?.isProcessing) {
      return;
    }

    void loadMcpPromptCommands();
  }, [derivedState?.isProcessing, loadMcpPromptCommands, slashCommandState.isActive, slashCommandState.kind]);

  // Stable ref so the mcp-app:message handler can read the latest value without
  // being included in the effect's dependency array (prevents rapid listener
  // teardown/re-registration on every keystroke or streaming update).
  const inputStateValueRef = React.useRef(inputState.value);
  React.useEffect(() => {
    inputStateValueRef.current = inputState.value;
  });

  // Handle MCP App ui/message requests (aligned with VSCode behavior)
  React.useEffect(() => {
    const handleMcpAppMessage = async (event: import('@/infrastructure/api/service-api/MCPAPI').McpAppMessageEvent) => {
      const { requestId, params, targetSessionId } = event;
      if (!shouldRouteComposerEvent({
        composerSessionId: effectiveTargetSessionId,
        targetSessionId,
        isPrimary: isPrimaryComposer,
      })) {
        return;
      }

      // Don't fill if input already has content (aligned with VSCode behavior)
      if (inputStateValueRef.current.trim()) {
        log.warn('MCP App ui/message rejected: input already has content');
        // Send error response (VSCode returns { isError: true } in this case)
        globalEventBus.emit('mcp-app:message-response', {
          requestId,
          result: { isError: true }
        } as import('@/infrastructure/api/service-api/MCPAPI').McpAppMessageResponseEvent);
        return;
      }

      try {
        // Extract text content and set input
        const textContent = params.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n\n');

        if (textContent) {
          clearPendingLargePastes();
          dispatchInput({ type: 'ACTIVATE' });
          dispatchInput({ type: 'SET_VALUE', payload: textContent });
        }

        // Handle image attachments (respect max image limit)
        let imgCount = currentImageCount;
        for (const block of params.content) {
          if (block.type === 'image') {
            if (imgCount >= CHAT_INPUT_CONFIG.image.maxCount) break;
            try {
              const mimeType = block.mimeType || 'image/png';
              const binaryString = atob(block.data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const blob = new Blob([bytes], { type: mimeType });
              const file = new File([blob], `image.${mimeType.split('/')[1] || 'png'}`, { type: mimeType });
              const imageContext = await createImageContextFromClipboard(file, {
                workspacePath: composerWorkspacePath,
              });
              addContext(imageContext);
              imgCount++;
            } catch (err) {
              log.error('Failed to add image from MCP App message', { err });
            }
          }
        }

        // Focus input
        if (richTextInputRef.current) {
          richTextInputRef.current.focus();
        }

        // Send success response
        globalEventBus.emit('mcp-app:message-response', {
          requestId,
          result: { isError: false }
        } as import('@/infrastructure/api/service-api/MCPAPI').McpAppMessageResponseEvent);
      } catch (err) {
        log.error('Failed to handle MCP App ui/message', { err });
        // Send error response
        globalEventBus.emit('mcp-app:message-response', {
          requestId,
          result: { isError: true }
        } as import('@/infrastructure/api/service-api/MCPAPI').McpAppMessageResponseEvent);
      }
    };

    globalEventBus.on('mcp-app:message', handleMcpAppMessage);

    return () => {
      globalEventBus.off('mcp-app:message', handleMcpAppMessage);
    };
  }, [
    addContext,
    clearPendingLargePastes,
    composerWorkspacePath,
    currentImageCount,
    effectiveTargetSessionId,
    isPrimaryComposer,
  ]);

  React.useEffect(() => {
    const handleInsertContextTag = (event: Event) => {
      const customEvent = event as CustomEvent<{
        context: any;
        targetSessionId?: string;
      }>;
      if (!shouldRouteComposerEvent({
        composerSessionId: effectiveTargetSessionId,
        targetSessionId: customEvent.detail?.targetSessionId,
        isPrimary: isPrimaryComposer,
      })) {
        return;
      }
      const context = customEvent.detail?.context;
      
      if (context) {
        if (!inputState.isActive) {
          dispatchInput({ type: 'ACTIVATE' });
        }

        setTimeout(() => {
          if (richTextInputRef.current && (richTextInputRef.current as any).insertTag) {
            const el = richTextInputRef.current;
            if (!el.textContent?.trim() && !el.querySelector('[data-context-id]')) {
              el.innerHTML = '';
            }
            el.focus();
            const sel = window.getSelection();
            if (sel) {
              sel.selectAllChildren(el);
              sel.collapseToEnd();
            }
            (el as any).insertTag(context);
          }
        }, 50);
      }
    };

    window.addEventListener('insert-context-tag', handleInsertContextTag);
    
    return () => {
      window.removeEventListener('insert-context-tag', handleInsertContextTag);
    };
  }, [effectiveTargetSessionId, inputState.isActive, isPrimaryComposer]);

  React.useEffect(() => {
    const fetchAvailableModes = async () => {
      try {
        const { agentAPI } = await import('@/infrastructure/api/service-api/AgentAPI');
        const modes = await agentAPI.getAvailableModes();
        dispatchMode({ type: 'SET_AVAILABLE_MODES', payload: modes });
      } catch (error) {
        log.error('Failed to fetch available modes', { error });
      }
    };
    
    fetchAvailableModes();
    
    const handleModeConfigUpdated = () => {
      fetchAvailableModes();
    };
    
    globalEventBus.on('mode:config:updated', handleModeConfigUpdated);
    
    return () => {
      globalEventBus.off('mode:config:updated', handleModeConfigUpdated);
    };
  }, []);

  React.useEffect(() => {
    const handleSessionSwitched = (event: Event) => {
      const customEvent = event as CustomEvent<{ sessionId: string; mode: string }>;
      const { sessionId, mode } = customEvent.detail || {};
      
      if (sessionId === effectiveTargetSessionId && mode) {
        if (isModePersistencePending(sessionId)) {
          return;
        }
        log.debug('Session switched, syncing mode', { sessionId, mode });
        dispatchMode({ type: 'SET_CURRENT_MODE', payload: mode });
        if (isPrimaryComposer) {
          try {
            sessionStorage.setItem('void:flowchat:lastMode', mode);
          } catch {
            // ignore
          }
        }
      }
    };

    window.addEventListener('void:session-switched', handleSessionSwitched);
    
    return () => {
      window.removeEventListener('void:session-switched', handleSessionSwitched);
    };
  }, [
    effectiveTargetSessionId,
    isModePersistencePending,
    isPrimaryComposer,
  ]);

  React.useEffect(() => {
    if (isModePersistencePending(effectiveTargetSessionId)) {
      return;
    }
    const nextMode = resolveWorkspaceChatInputMode({
      currentMode,
      isAssistantWorkspace,
      sessionMode: activeSessionMode,
    });

    if (nextMode) {
      log.debug('Syncing mode with workspace and session', {
        sessionId: effectiveTargetSessionId,
        mode: nextMode,
        sessionMode: activeSessionMode,
        isAssistantWorkspace,
      });
      dispatchMode({ type: 'SET_CURRENT_MODE', payload: nextMode });
      if (isPrimaryComposer) {
        try {
          sessionStorage.setItem('void:flowchat:lastMode', nextMode);
        } catch {
          // ignore
        }
      }
    }
  }, [
    activeSessionMode,
    currentMode,
    effectiveTargetSessionId,
    isAssistantWorkspace,
    isModePersistencePending,
    isPrimaryComposer,
  ]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (agentBoostRef.current && !agentBoostRef.current.contains(event.target as Node)) {
        dispatchMode({ type: 'CLOSE_DROPDOWN' });
      }
    };

    if (modeState.dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [modeState.dropdownOpen]);

  useEffect(() => {
    if (!isModeDropdownOpen) {
      return;
    }
    let cancelled = false;
    setBoostSkillsLoading(true);
    (async () => {
      try {
        const list = await configAPI.getModeSkillConfigs({
          modeId: composerAgentType,
          workspacePath: composerWorkspacePath || undefined,
        });
        if (!cancelled) {
          setBoostPanelSkills(list);
        }
      } catch (err) {
        log.error('Failed to load mode-resolved skills for boost panel', {
          err,
          modeId: composerAgentType,
          workspacePath: composerWorkspacePath || undefined,
        });
        if (!cancelled) setBoostPanelSkills([]);
      } finally {
        if (!cancelled) setBoostSkillsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [composerAgentType, composerWorkspacePath, isModeDropdownOpen]);

  useEffect(() => {
    const handleMediaReference = (event: Event) => {
      const detail = (event as CustomEvent<MediaReferenceEventDetail>).detail;
      if (!detail) {
        return;
      }
      if (!shouldRouteComposerEvent({
        composerSessionId: effectiveTargetSessionId,
        targetSessionId: detail.targetSessionId,
        isPrimary: isPrimaryComposer,
      })) {
        return;
      }

      if (detail.context && !contexts.some(context => context.id === detail.context?.id)) {
        addContext(detail.context);
      }

      const promptText = getMediaReferencePromptText(detail).trim();
      const currentValue = inputValueRef.current;
      const nextValue = promptText
        ? currentValue.trim()
          ? `${currentValue.trimEnd()}\n${promptText}`
          : promptText
        : currentValue;

      dispatchInput({ type: 'ACTIVATE' });
      if (nextValue !== currentValue) {
        dispatchInput({ type: 'SET_VALUE', payload: nextValue });
        inputValueRef.current = nextValue;
        prunePendingLargePastes(nextValue);
      }

      if (derivedState?.isProcessing && nextValue.trim()) {
        setQueuedInput(nextValue);
      }

      requestAnimationFrame(() => {
        richTextInputRef.current?.focus();
      });
    };

    window.addEventListener(MEDIA_REFERENCE_EVENT, handleMediaReference);
    return () => {
      window.removeEventListener(MEDIA_REFERENCE_EVENT, handleMediaReference);
    };
  }, [
    addContext,
    contexts,
    derivedState?.isProcessing,
    effectiveTargetSessionId,
    isPrimaryComposer,
    prunePendingLargePastes,
    setQueuedInput,
  ]);

  useEffect(() => {
    const handleImagePaste = async (event: Event) => {
      const customEvent = event as CustomEvent<{ file: File }>;
      const file = customEvent.detail?.file;
      
      if (!file) return;

      if (currentImageCount >= CHAT_INPUT_CONFIG.image.maxCount) {
        notificationService.warning(t('input.maxImagesWarning', { count: CHAT_INPUT_CONFIG.image.maxCount }), { duration: 3000 });
        return;
      }
      
      try {
        const imageContext = await createImageContextFromClipboard(file, {
          workspacePath: composerWorkspacePath,
        });

        addContext(imageContext);
        undoImageStackRef.current.push(imageContext.id);

        if (!inputState.isActive) {
          dispatchInput({ type: 'ACTIVATE' });
        }
      } catch (error) {
        log.error('Failed to process clipboard image', { fileName: file.name, error });
        notificationService.error(
          `${t('input.imagePasteFailed')}: ${error instanceof Error ? error.message : t('error.unknown')}`,
          { duration: 3000 }
        );
      }
    };
    
    const inputElement = richTextInputRef.current;
    if (inputElement) {
      inputElement.addEventListener('imagePaste', handleImagePaste);
    }
    
    return () => {
      if (inputElement) {
        inputElement.removeEventListener('imagePaste', handleImagePaste);
      }
    };
  }, [addContext, composerWorkspacePath, currentImageCount, inputState.isActive, t]);

  React.useEffect(() => {
    if (!effectiveTargetSessionId || !composerWorkspacePath) {
      return;
    }

    const store = FlowChatStore.getInstance();
    const state = store.getState();
    const session = state.sessions.get(effectiveTargetSessionId);

    if (!session || session.dialogTurns.length === 0) {
      return;
    }

    const lastTurn = session.dialogTurns[session.dialogTurns.length - 1];
    
    if (lastTurn.status === 'completed') {
      const modifiedFiles: string[] = [];
      
      for (const round of lastTurn.modelRounds) {
        for (const item of round.items) {
          if (item.type === 'tool') {
            const toolItem = item as import('../types/flow-chat').FlowToolItem;
            const fileModifyTools = ['write_file', 'edit_file', 'create_file', 'delete_file'];
            if (fileModifyTools.includes(toolItem.toolName)) {
              const toolInput = toolItem.toolCall?.input;
              if (toolInput && typeof toolInput === 'object') {
                const filePath = (toolInput as any).file_path || (toolInput as any).path || (toolInput as any).filePath;
                if (filePath && typeof filePath === 'string') {
                  modifiedFiles.push(filePath);
                }
              }
            }
          }
        }
      }

      if (modifiedFiles.length > 0) {
        log.debug('File modifications detected, updating recommendation context', { modifiedFiles });
        setRecommendationContext({
          workspacePath: composerWorkspacePath,
          sessionId: effectiveTargetSessionId,
          turnIndex: session.dialogTurns.length - 1,
          modifiedFiles: [...new Set(modifiedFiles)]
        });
      }
    }
  }, [composerWorkspacePath, derivedState?.isProcessing, effectiveTargetSessionId]);

  const getFilteredActions = useCallback(() => {
    const items: SlashActionItem[] = [
      ...(isBtwSession
        ? []
        : [{
            kind: 'action' as const,
            id: 'btw',
            command: '/btw',
            label: t('btw.title', { defaultValue: 'Side question' }),
          }]),
      {
        kind: 'action',
        id: 'goal',
        command: '/goal',
        label: t('chatInput.goalAction', { defaultValue: 'Session goal' }),
      },
      {
        kind: 'action',
        id: 'usage',
        command: '/usage',
        label: t('chatInput.usageAction', { defaultValue: 'Usage report' }),
      },
      {
        kind: 'action',
        id: 'deepreview',
        command: DEEP_REVIEW_SLASH_COMMAND,
        label: t('chatInput.deepreviewAction', { defaultValue: 'Deep review' }),
      },
      ...(!derivedState?.isProcessing
        ? [
            {
              kind: 'action' as const,
              id: 'compact',
              command: '/compact',
              label: t('chatInput.compactAction', { defaultValue: 'Compact session' }),
            },
            {
              kind: 'action' as const,
              id: 'init',
              command: '/init',
              label: t('chatInput.initAction', { defaultValue: 'Generate AGENTS.md' }),
            },
          ]
        : []),
    ];

    const q = (slashCommandState.query || '').trim().toLowerCase();
    if (!q) return items;

    return items.filter(i => {
      const cmd = i.command.slice(1).toLowerCase();
      return cmd.includes(q) || i.label.toLowerCase().includes(q);
    });
  }, [derivedState?.isProcessing, isBtwSession, slashCommandState.query, t]);

  const getFilteredMcpPromptCommands = useCallback((): SlashMcpPromptItem[] => {
    const q = (slashCommandState.query || '').trim().toLowerCase();
    if (!q) {
      return mcpPromptCommands;
    }

    return mcpPromptCommands.filter(item => {
      const commandToken = item.command.slice(1).toLowerCase();
      return (
        commandToken.includes(q) ||
        item.serverName.toLowerCase().includes(q) ||
        item.label.toLowerCase().includes(q)
      );
    });
  }, [mcpPromptCommands, slashCommandState.query]);

  const resolveTypedMcpPromptCommand = useCallback((text: string): SlashMcpPromptItem | null => {
    const trimmed = text.trim();
    if (!trimmed.startsWith('/')) {
      return null;
    }

    const token = trimmed.slice(1).split(/\s+/, 1)[0]?.toLowerCase() || '';
    if (!token) {
      return null;
    }

    return (
      mcpPromptCommands.find(item => item.command.slice(1).toLowerCase() === token) || null
    );
  }, [mcpPromptCommands]);

  const getSlashPickerItems = useCallback((): SlashPickerItem[] => {
    const actions = getFilteredActions();
    const mcpPrompts = getFilteredMcpPromptCommands();
    let modeList = incrementalCodeModes;
    if (canSwitchModes && slashCommandState.query) {
      const q = slashCommandState.query;
      modeList = incrementalCodeModes.filter(
        mode =>
          mode.name.toLowerCase().includes(q) ||
          mode.id.toLowerCase().includes(q)
      );
    }
    const modes: SlashModeItem[] = (canSwitchModes ? modeList : []).map(mode => ({
      kind: 'mode',
      id: mode.id,
      name: mode.name,
    }));
    return [...actions, ...mcpPrompts, ...modes];
  }, [canSwitchModes, getFilteredActions, getFilteredMcpPromptCommands, incrementalCodeModes, slashCommandState.query]);
  
  const handleInputChange = useCallback((text: string, activeContexts: import('../../shared/types/context').ContextItem[]) => {
    if (!inputState.isActive && text.length > 0) {
      dispatchInput({ type: 'ACTIVATE' });
    }

    const activeContextIds = new Set(activeContexts.map(context => context.id));
    contexts.forEach(context => {
      // Image contexts are not represented by inline tag pills inside the
      // editor; they live in a separate thumbnail strip and are removed via
      // their own × button. Skip them when reconciling against editor tags.
      if (context.type === 'image') return;
      if (!activeContextIds.has(context.id)) {
        removeContext(context.id);
      }
    });
    
    prunePendingLargePastes(text);
    dispatchInput({ type: 'SET_VALUE', payload: text });
    inputValueRef.current = text;

    const trimmedLower = text.trim().toLowerCase();
    const isBtwCommand = trimmedLower.startsWith('/btw');
    const isCompactCommand = trimmedLower.startsWith('/compact');
    const isGoalCommand = isGoalSlashCommand(text);
    const isUsageCommand = trimmedLower.startsWith('/usage');
    const isDeepReviewCommand = isDeepReviewSlashCommand(text);
    const isProcessing = !!derivedState?.isProcessing;

    // Don't queue /btw or /goal while the main session is processing; they have dedicated flows.
    if (derivedState?.isProcessing && !isBtwCommand && !isGoalCommand && !isCompactCommand && !isUsageCommand && !isDeepReviewCommand) {
      setQueuedInput(text);
    }

    if (text.startsWith('/')) {
      const afterSlash = text.slice(1);
      const hasWhitespace = /\s/.test(afterSlash);
      const query = afterSlash.trimStart().split(/\s+/, 1)[0]?.toLowerCase?.() ?? '';
      const matchedMcpPrompt = resolveTypedMcpPromptCommand(text);

      // While the main session is running, expose a single quick action (/btw) via the same picker UX.
      if (isProcessing) {
        // Only show the picker for "/..." patterns that are plausibly a command (/ or /b... /d...).
        // Once the user types a space (starts composing the real question), stop showing the picker
        // so Enter can submit "/btw ..." or "/DeepReview ..." instead of selecting from the picker.
        if (!hasWhitespace && (query === '' || query.startsWith('b') || query.startsWith('d') || query.startsWith('g') || query.startsWith('u'))) {
          setSlashCommandState({
            isActive: true,
            kind: 'actions',
            query,
            selectedIndex: 0,
          });
        } else if (slashCommandState.isActive && slashCommandState.kind === 'actions') {
          setSlashCommandState({ isActive: false, kind: 'modes', query: '', selectedIndex: 0 });
        }
        return;
      }

      // When idle, keep the picker for mode switching, but don't interfere with executable slash commands.
      if (!isBtwCommand && !isGoalCommand && !isCompactCommand && !isUsageCommand && !isDeepReviewCommand && !matchedMcpPrompt) {
        setSlashCommandState({
          isActive: true,
          kind: 'all',
          query,
          selectedIndex: 0,
        });
        return;
      }
    }

    if (slashCommandState.isActive) {
      setSlashCommandState({
        isActive: false,
        kind: 'modes',
        query: '',
        selectedIndex: 0,
      });
    }
  }, [contexts, derivedState, inputState.isActive, prunePendingLargePastes, removeContext, resolveTypedMcpPromptCommand, setQueuedInput, slashCommandState.isActive, slashCommandState.kind]);

  const submitBtwFromInput = useCallback(async () => {
    if (!derivedState) return;
    if (!currentSessionId) {
      notificationService.error(t('btw.noSession', { defaultValue: 'No active session for /btw' }));
      return;
    }
    if (isBtwSession) {
      notificationService.warning(t('btw.nestedDisabled', { defaultValue: 'Side questions cannot create another side question' }));
      return;
    }

    const originalMessage = inputState.value.trim();
    const originalPendingLargePastes = { ...pendingLargePastesRef.current };
    const message = expandComposerSpecialTokens(originalMessage);
    const messageCharCount = getCharacterCount(message);
    const question = message.replace(/^\/btw\b/i, '').trim();

    // Clear input without adding to main history.
    dispatchInput({ type: 'CLEAR_VALUE' });
    clearPendingLargePastes();
    setQueuedInput(null);
    setSlashCommandState({ isActive: false, kind: 'modes', query: '', selectedIndex: 0 });

    if (!question) {
      notificationService.warning(t('btw.empty', { defaultValue: 'Please provide a question after /btw' }));
      return;
    }

    if (messageCharCount > CHAT_INPUT_CONFIG.largePaste.maxMessageChars) {
      notificationService.error(
        t('input.messageTooLarge', {
          max: CHAT_INPUT_CONFIG.largePaste.maxMessageChars,
          count: messageCharCount,
          defaultValue: 'Message exceeds the maximum length of {{max}} characters ({{count}} provided).',
        }),
        { duration: 4000 }
      );
      pendingLargePastesRef.current = originalPendingLargePastes;
      dispatchInput({ type: 'ACTIVATE' });
      dispatchInput({ type: 'SET_VALUE', payload: originalMessage });
      return;
    }

    try {
      const imagePayload = imageContexts.length > 0
        ? buildImageContextsForBackend(imageContexts)
        : undefined;
      const { childSessionId } = await startBtwThread({
        parentSessionId: currentSessionId,
        workspacePath: chatStripRepositoryPath,
        question,
        modelId: 'fast',
        imagePayload,
      });
      openBtwSessionInAuxPane({
        childSessionId,
        parentSessionId: currentSessionId,
        workspacePath: chatStripRepositoryPath,
        expand: true,
      });
      dispatchInput({ type: 'DEACTIVATE' });
    } catch (e) {
      log.error('Failed to start /btw thread', { e });
      dispatchInput({ type: 'ACTIVATE' });
      pendingLargePastesRef.current = originalPendingLargePastes;
      dispatchInput({ type: 'SET_VALUE', payload: originalMessage });
      notificationService.error(
        t('btw.startFailed', {
          defaultValue: 'Side question failed to start. Check that the session is loaded and try again.',
        }),
        { duration: 5000 },
      );
    }
  }, [chatStripRepositoryPath, clearPendingLargePastes, currentSessionId, derivedState, expandComposerSpecialTokens, imageContexts, inputState.value, isBtwSession, setQueuedInput, t]);

  const submitCompactFromInput = useCallback(async () => {
    if (!effectiveTargetSessionId || !effectiveTargetSession) {
      notificationService.error(
        t('chatInput.compactNoSession', { defaultValue: 'No active session for /compact' })
      );
      return;
    }

    if (derivedState?.isProcessing) {
      notificationService.warning(
        t('chatInput.compactBusy', {
          defaultValue: 'Wait until the session is idle before using /compact.',
        })
      );
      return;
    }

    const message = inputState.value.trim();
    if (!/^\/compact\s*$/i.test(message)) {
      notificationService.warning(
        t('chatInput.compactUsage', { defaultValue: 'Use /compact without extra arguments.' })
      );
      return;
    }

    dispatchInput({ type: 'CLEAR_VALUE' });
    setQueuedInput(null);
    setSlashCommandState({ isActive: false, kind: 'modes', query: '', selectedIndex: 0 });

    try {
      const { agentAPI } = await import('@/infrastructure/api');
      await agentAPI.compactSession({
        sessionId: effectiveTargetSessionId,
        workspacePath: effectiveTargetSession.workspacePath,
        remoteConnectionId: effectiveTargetSession.remoteConnectionId,
        remoteSshHost: effectiveTargetSession.remoteSshHost,
      });
    } catch (error) {
      log.error('Failed to trigger /compact', {
        error,
        sessionId: effectiveTargetSessionId,
      });
      dispatchInput({ type: 'ACTIVATE' });
      dispatchInput({ type: 'SET_VALUE', payload: message });
      notificationService.error(
        error instanceof Error ? error.message : t('error.unknown'),
        {
          title: t('chatInput.compactFailed', { defaultValue: 'Session compaction failed' }),
          duration: 5000,
        }
      );
    }
  }, [
    derivedState?.isProcessing,
    effectiveTargetSession,
    effectiveTargetSessionId,
    inputState.value,
    setQueuedInput,
    t,
  ]);

  const runEffectiveSessionUsageReport = useCallback(async () => {
    if (!effectiveTargetSessionId || !effectiveTargetSession) {
      notificationService.error(
        t('chatInput.usageNoSession', { defaultValue: 'No active session for /usage' })
      );
      return;
    }

    try {
      const result = await runUsageReportCommand({
        session: effectiveTargetSession,
        isProcessing: !!derivedState?.isProcessing,
        busyMessage: t('chatInput.usageBusy', {
          defaultValue: 'Wait until the session is idle before using /usage.',
        }),
        noWorkspaceMessage: t('chatInput.usageNoWorkspace', {
          defaultValue: 'A workspace is required to build a usage report.',
        }),
        failedTitle: t('chatInput.usageFailed', { defaultValue: 'Usage report failed' }),
        unknownErrorMessage: t('error.unknown'),
        loadingMarkdown: t('usage.loading.markdown', { defaultValue: 'Generating usage report...' }),
      });

      if (result.inserted) {
        dispatchInput({ type: 'DEACTIVATE' });
      }
    } catch (error) {
      log.error('Failed to trigger /usage', {
        error,
        sessionId: effectiveTargetSessionId,
      });
      throw error;
    }
  }, [
    derivedState?.isProcessing,
    effectiveTargetSession,
    effectiveTargetSessionId,
    t,
  ]);

  const submitUsageFromInput = useCallback(async () => {
    if (!effectiveTargetSessionId || !effectiveTargetSession) {
      notificationService.error(
        t('chatInput.usageNoSession', { defaultValue: 'No active session for /usage' })
      );
      return;
    }

    const message = inputState.value.trim();
    if (!/^\/usage\s*$/i.test(message)) {
      notificationService.warning(
        t('chatInput.usageCommandUsage', { defaultValue: 'Use /usage without extra arguments.' })
      );
      return;
    }

    dispatchInput({ type: 'CLEAR_VALUE' });
    setQueuedInput(null);
    setSlashCommandState({ isActive: false, kind: 'modes', query: '', selectedIndex: 0 });

    try {
      await runEffectiveSessionUsageReport();
    } catch {
      dispatchInput({ type: 'ACTIVATE' });
      dispatchInput({ type: 'SET_VALUE', payload: message });
    }
  }, [
    effectiveTargetSession,
    effectiveTargetSessionId,
    inputState.value,
    runEffectiveSessionUsageReport,
    setQueuedInput,
    t,
  ]);

  const handleToolbarUsageReport = useCallback(() => {
    void runEffectiveSessionUsageReport().catch(() => {
      /* errors surfaced by runUsageReportCommand */
    });
  }, [runEffectiveSessionUsageReport]);

  const submitInitFromInput = useCallback(async () => {
    if (!effectiveTargetSessionId || !effectiveTargetSession) {
      notificationService.error(
        t('chatInput.initNoSession', { defaultValue: 'No active session for /init' })
      );
      return;
    }

    if (derivedState?.isProcessing) {
      notificationService.warning(
        t('chatInput.initBusy', {
          defaultValue: 'Wait until the session is idle before using /init.',
        })
      );
      return;
    }

    const message = inputState.value.trim();
    if (!/^\/init\s*$/i.test(message)) {
      notificationService.warning(
        t('chatInput.initUsage', { defaultValue: 'Use /init without extra arguments.' })
      );
      return;
    }

    dispatchInput({ type: 'CLEAR_VALUE' });
    setQueuedInput(null);
    setSlashCommandState({ isActive: false, kind: 'modes', query: '', selectedIndex: 0 });

    try {
      await agentAPI.runInitAgentsMd({
        sessionId: effectiveTargetSessionId,
        workspacePath: effectiveTargetSession.workspacePath,
        remoteConnectionId: effectiveTargetSession.remoteConnectionId,
        remoteSshHost: effectiveTargetSession.remoteSshHost,
      });
      dispatchInput({ type: 'DEACTIVATE' });
    } catch (error) {
      log.error('Failed to trigger /init', {
        error,
        sessionId: effectiveTargetSessionId,
      });
      dispatchInput({ type: 'ACTIVATE' });
      dispatchInput({ type: 'SET_VALUE', payload: message });
      notificationService.error(
        error instanceof Error ? error.message : t('error.unknown'),
        {
          title: t('chatInput.initFailed', { defaultValue: 'Session init failed' }),
          duration: 5000,
        }
      );
    }
  }, [
    derivedState?.isProcessing,
    effectiveTargetSession,
    effectiveTargetSessionId,
    inputState.value,
    setQueuedInput,
    t,
  ]);

  const submitGoalFromInput = useCallback(async () => {
    if (!effectiveTargetSessionId || !effectiveTargetSession) {
      notificationService.error(
        t('chatInput.goalNoSession', { defaultValue: 'No active session for /goal' })
      );
      return;
    }

    if (isBtwSession) {
      notificationService.warning(
        t('chatInput.goalNestedDisabled', {
          defaultValue: 'Goal mode can only be started from the main session.',
        })
      );
      return;
    }

    const message = inputState.value.trim();
    const parsed = parseGoalCommand(message);
    if (!parsed) {
      notificationService.warning(
        t('chatInput.goalUsage', {
          defaultValue:
            'Use /goal, /goal edit <objective>, /goal pause, /goal resume, or /goal clear.',
        })
      );
      return;
    }

    const originalMessage = message;
    dispatchInput({ type: 'CLEAR_VALUE' });
    setQueuedInput(null);
    setSlashCommandState({ isActive: false, kind: 'modes', query: '', selectedIndex: 0 });

    if (parsed.action !== 'activate') {
      const result = await runGoalManagementCommandSafely({
        session: effectiveTargetSession,
        action: parsed.action,
        goalText: parsed.goalText,
        tokenBudget: parsed.tokenBudget,
        failedTitle: t('chatInput.goalFailed', { defaultValue: 'Goal mode update failed' }),
        unknownErrorMessage: t('error.unknown'),
        updatedTitle: t('chatInput.goalUpdated', { defaultValue: 'Session goal updated' }),
      });

      if (!result) {
        dispatchInput({ type: 'ACTIVATE' });
        dispatchInput({ type: 'SET_VALUE', payload: originalMessage });
        return;
      }

      onSendMessage?.(result.displayMessage);
      dispatchInput({ type: 'DEACTIVATE' });
      return;
    }

    const result = await runGoalCommandSafely({
      session: effectiveTargetSession,
      userHint: parsed.userHint,
      loadingMessage: t('chatInput.goalGenerating', { defaultValue: 'Generating session goal...' }),
      failedTitle: t('chatInput.goalFailed', { defaultValue: 'Goal mode activation failed' }),
      unknownErrorMessage: t('error.unknown'),
      aiFailedMessage: t('chatInput.goalAiFailed', {
        defaultValue: 'Goal mode AI request failed. Check model configuration and try again.',
      }),
      activatedTitle: t('chatInput.goalActivated', { defaultValue: 'Session goal activated' }),
    });

    if (!result) {
      dispatchInput({ type: 'ACTIVATE' });
      dispatchInput({ type: 'SET_VALUE', payload: originalMessage });
      return;
    }

    onSendMessage?.(result.goalText);
    dispatchInput({ type: 'DEACTIVATE' });
  }, [
    effectiveTargetSession,
    effectiveTargetSessionId,
    inputState.value,
    isBtwSession,
    onSendMessage,
    setQueuedInput,
    t,
  ]);

  const submitDeepreviewFromInput = useCallback(async (messageOverride?: string) => {
    let targetSessionId = effectiveTargetSessionId;
    let targetSession = effectiveTargetSession;
    const workspacePath = targetSession?.workspacePath || draftWorkspace?.rootPath;
    if (!workspacePath) {
      notificationService.error(
        t('chatInput.deepreviewNoSession', { defaultValue: 'No active session for /DeepReview' })
      );
      return;
    }

    const message = (messageOverride ?? inputState.value).trim();
    if (!isDeepReviewSlashCommand(message)) {
      notificationService.warning(
        t('chatInput.deepreviewUsage', {
          defaultValue: 'Use /DeepReview with optional focus text, for example /DeepReview review commit abc123 for security.',
        })
      );
      return;
    }

    if (isBtwSession) {
      notificationService.warning(
        t('chatInput.deepreviewNestedDisabled', {
          defaultValue: 'Deep Review can only be started from the main session.',
        }),
      );
      return;
    }

    if (shouldBlockDeepReviewCommand(message, currentReviewActivity)) {
      notificationService.warning(
        t('chatInput.deepreviewBusy', {
          defaultValue: 'A review is already running for this session. Stop or finish it before starting another Deep Review.',
        }),
      );
      return;
    }

    const originalPendingLargePastes = { ...pendingLargePastesRef.current };

    try {
      const preview = await buildDeepReviewPreviewFromSlashCommand(
        message,
        workspacePath,
      );
      const confirmed = await confirmDeepReviewLaunch(preview, {
        sessionConcurrencyGuard: deriveDeepReviewSessionConcurrencyGuard(
          flowChatState,
          targetSessionId,
        ),
      });
      if (!confirmed) {
        return;
      }

      if (!targetSessionId || !targetSession) {
        if (useSessionModeStore.getState().draftStatus !== 'idle') {
          setDraftStatus('creating');
        }
        const ensured = await ensureSession();
        targetSessionId = ensured.sessionId;
        targetSession = FlowChatStore.getInstance().getState().sessions.get(targetSessionId);
        if (!targetSession) {
          throw new Error('Created Deep Review parent session is unavailable.');
        }
      }

      addToHistory(targetSessionId, message);
      setHistoryIndex(-1);
      setSavedDraft('');
      dispatchInput({ type: 'CLEAR_VALUE' });
      clearPendingLargePastes();
      setQueuedInput(null);
      setSlashCommandState({ isActive: false, kind: 'modes', query: '', selectedIndex: 0 });

      const { prompt, runManifest } = await buildDeepReviewLaunchFromSlashCommand(
        message,
        targetSession.workspacePath,
      );

      await launchDeepReviewSession({
        parentSessionId: targetSessionId,
        workspacePath: targetSession.workspacePath,
        prompt,
        displayMessage: message,
        runManifest,
        childSessionName: t('chatInput.deepreviewThreadTitle', {
          defaultValue: 'Deep review',
        }),
      });
      dispatchInput({ type: 'DEACTIVATE' });
    } catch (error) {
      log.error('Failed to trigger /DeepReview', {
        error,
        sessionId: targetSessionId,
      });
      if (useSessionModeStore.getState().draftStatus !== 'idle') {
        setDraftStatus('error');
      }
      pendingLargePastesRef.current = originalPendingLargePastes;
      dispatchInput({ type: 'ACTIVATE' });
      dispatchInput({ type: 'SET_VALUE', payload: message });
      notificationService.error(
        getDeepReviewLaunchErrorMessage(error, t, t('error.unknown')),
        {
          title: t('chatInput.deepreviewFailed', { defaultValue: 'Deep review failed' }),
          duration: 5000,
        }
      );
    }
  }, [
    addToHistory,
    clearPendingLargePastes,
    confirmDeepReviewLaunch,
    currentReviewActivity,
    effectiveTargetSession,
    effectiveTargetSessionId,
    draftWorkspace?.rootPath,
    ensureSession,
    flowChatState,
    inputState.value,
    isBtwSession,
    setDraftStatus,
    setQueuedInput,
    t,
  ]);

  const submitMcpPromptFromInput = useCallback(async () => {
    const originalMessage = inputState.value.trim();
    let command = resolveTypedMcpPromptCommand(originalMessage);

    if (!command) {
      await loadMcpPromptCommands();
      command = resolveTypedMcpPromptCommand(originalMessage);
    }

    if (!command) {
      notificationService.warning(
        t('chatInput.noMatchingCommand', { defaultValue: 'No matching command' })
      );
      return;
    }

    const argsText = originalMessage
      .slice(command.command.length)
      .trim();
    const argValues = parseSlashArguments(argsText);
    const requiredArgs = command.arguments.filter(argument => argument.required);

    if (argValues.length < requiredArgs.length) {
      const requiredNames = requiredArgs.map(argument => argument.name).join(', ');
      notificationService.warning(
        t('chatInput.mcpPromptMissingArgs', {
          defaultValue: 'This MCP prompt requires arguments: {{args}}',
          args: requiredNames,
        })
      );
      return;
    }

    const confirmed = await confirmPromptCacheGuardIfNeeded();
    if (!confirmed) {
      return;
    }

    const requestedSessionId = effectiveTargetSessionId;
    const submittedDraftRevision = getSessionComposerDraftRevision(
      requestedSessionId,
    );
    const originalPendingLargePastes = { ...pendingLargePastesRef.current };
    const originalContexts = [...contextsRef.current];
    const originalPresentation = richTextInputRef.current?.getPresentation?.();
    if (!requestedSessionId) {
      deferredCreatedSessionIdRef.current = null;
    }
    if (effectiveTargetSessionId) {
      addToHistory(effectiveTargetSessionId, originalMessage);
    }
    setHistoryIndex(-1);
    setSavedDraft('');
    dispatchInput({ type: 'CLEAR_VALUE' });
    inputValueRef.current = '';
    clearPendingLargePastes();
    setQueuedInput(null);
    setSlashCommandState({ isActive: false, kind: 'modes', query: '', selectedIndex: 0 });

    try {
      const promptArguments = command.arguments.reduce<Record<string, string>>((acc, argument, index) => {
        const value = argValues[index];
        if (typeof value === 'string' && value.length > 0) {
          acc[argument.name] = value;
        }
        return acc;
      }, {});

      const prompt = await MCPAPI.getPrompt({
        serverId: command.serverId,
        promptName: command.promptName,
        arguments: Object.keys(promptArguments).length > 0 ? promptArguments : undefined,
      });

      const renderedPrompt = renderMcpPromptMessages(prompt.messages);
      if (!renderedPrompt.trim()) {
        throw new Error('MCP prompt returned no displayable content');
      }

      const receipt = await sendMessage(renderedPrompt, {
        displayMessage: originalMessage,
        composerPresentation: originalPresentation,
      });
      if (receipt) {
        const draftGuard = resolveSessionComposerDraftGuard(
          receipt.requestedSessionId,
          receipt.sentSessionId,
          submittedDraftRevision,
        );
        const draftMutationApplied = draftGuard
          ? clearSessionComposerDraftIfRevision(draftGuard)
          : false;
        if (
          shouldApplyGuardedComposerResult(draftGuard, draftMutationApplied)
          && shouldClaimSuccessfulSendReceipt(
            previousComposerSessionIdRef.current,
            receipt.requestedSessionId,
            receipt.sentSessionId,
          )
        ) {
          const currentContexts = contextsRef.current;
          contextsRef.current = currentContexts;
          receipt.submittedContextIds.forEach(removeContext);
          if (shouldDeactivateComposerAfterSend(
            previousComposerSessionIdRef.current,
            receipt,
            inputValueRef.current,
            currentContexts.map(context => context.id),
            pendingLargePastesRef.current,
          )) {
            dispatchInput({ type: 'DEACTIVATE' });
          }
        }
      }
    } catch (error) {
      log.error('Failed to run MCP prompt command', {
        command: originalMessage,
        error,
      });
      const createdSessionId = deferredCreatedSessionIdRef.current;
      const draftGuard = resolveSessionComposerDraftGuard(
        requestedSessionId,
        createdSessionId,
        submittedDraftRevision,
      );
      const draftMutationApplied = draftGuard
        ? saveSessionComposerDraftIfRevision(draftGuard, {
            value: originalMessage,
            contexts: originalContexts,
            pendingLargePastes: originalPendingLargePastes,
          })
        : false;
      if (
        shouldApplyGuardedComposerResult(draftGuard, draftMutationApplied)
        && shouldRestoreFailedComposer(
          previousComposerSessionIdRef.current,
          requestedSessionId,
          createdSessionId,
        )
      ) {
        if (shouldRestoreFailedComposerContent(
          inputValueRef.current,
          pendingLargePastesRef.current,
        )) {
          inputValueRef.current = originalMessage;
          pendingLargePastesRef.current = originalPendingLargePastes;
          dispatchInput({ type: 'ACTIVATE' });
          dispatchInput({ type: 'SET_VALUE', payload: originalMessage });
        }
        const currentContexts = contextsRef.current;
        const currentContextIds = new Set(currentContexts.map(context => context.id));
        const missingOriginalContexts = originalContexts.filter(
          context => !currentContextIds.has(context.id),
        );
        if (missingOriginalContexts.length > 0) {
          const mergedContexts = [...currentContexts, ...missingOriginalContexts];
          contextsRef.current = mergedContexts;
          replaceContexts(mergedContexts);
        }
      }
      notificationService.error(
        error instanceof Error ? error.message : t('error.unknown'),
        {
          title: t('chatInput.mcpPromptFailed', { defaultValue: 'MCP prompt failed' }),
          duration: 5000,
        }
      );
    }
  }, [
    clearPendingLargePastes,
    addToHistory,
    confirmPromptCacheGuardIfNeeded,
    effectiveTargetSessionId,
    inputState.value,
    loadMcpPromptCommands,
    resolveTypedMcpPromptCommand,
    removeContext,
    replaceContexts,
    sendMessage,
    setQueuedInput,
    t,
  ]);

  const handleCancelCurrentTask = useCallback(async () => {
    if (!effectiveTargetSession) return;
    try {
      await cancelComposerTarget(effectiveTargetSession);
    } catch (error) {
      log.error('Failed to stop composer target', {
        sessionId: effectiveTargetSession.sessionId,
        error,
      });
      notificationService.error(
        t('childSession.stopFailed', {
          defaultValue: 'Failed to stop this session.',
        }),
      );
    }
  }, [effectiveTargetSession, t]);
  
  const handleSendOrCancel = useCallback(async () => {
    if (!derivedState && !isNewSessionDraft) {
      return;
    }
    
    const sendButtonMode = derivedState?.sendButtonMode ?? 'send';
    const draftTrimmed = inputState.value.trim();

    if (isNewSessionDraft && draftStatus === 'creating') {
      return;
    }

    const selectedDraftWorkspaceIsOpen = isNewSessionDraftWorkspaceAvailable(
      draftWorkspace,
      draftWorkspaceOptions,
    );

    if (isNewSessionDraft && (!draftWorkspace || !selectedDraftWorkspaceIsOpen)) {
      if (draftWorkspace && !selectedDraftWorkspaceIsOpen) {
        selectNewSessionDraftWorkspace(null);
        setDraftStatus('draft');
      }
      notificationService.warning(
        t(
          draftWorkspace && !selectedDraftWorkspaceIsOpen
            ? 'workspaceStrip.selectedWorkspaceUnavailable'
            : 'workspaceStrip.selectWorkspaceBeforeSend',
        ),
        { duration: 3500 },
      );
      return;
    }

    // While generating, an empty control in `cancel` mode means stop. If the user has typed a follow-up,
    // never treat this path as cancel — that would call cancel_dialog_turn and abort the current round early.
    if (sendButtonMode === 'cancel' && !draftTrimmed) {
      await handleCancelCurrentTask();
      return;
    }

    const submissionIntent = sendButtonMode === 'retry'
      ? 'retry'
      : sendButtonMode === 'split'
        ? 'split_submit'
        : 'submit';
    if (!isComposerActionAllowed(
      isCustomizationPersistencePending(),
      submissionIntent,
    )) {
      return;
    }
    
    if (sendButtonMode === 'retry') {
      await transition(SessionExecutionEvent.RESET);
    }
    
    if (!draftTrimmed) return;
    
    const originalMessage = draftTrimmed;
    const submittedSessionId = effectiveTargetSessionId;
    const originalPendingLargePastes = { ...pendingLargePastesRef.current };
    const originalContexts = [...contextsRef.current];
    const originalPresentation = richTextInputRef.current?.getPresentation?.();
    if (!submittedSessionId) {
      deferredCreatedSessionIdRef.current = null;
    }
    const submittedDraftRevision = getSessionComposerDraftRevision(
      submittedSessionId,
    );
    const message = expandComposerSpecialTokens(originalMessage);
    const messageCharCount = getCharacterCount(message);

    if (message.toLowerCase().startsWith('/btw')) {
      // When idle, /btw can be sent via the normal send button.
      await submitBtwFromInput();
      return;
    }

    if (isGoalSlashCommand(message)) {
      await submitGoalFromInput();
      return;
    }

    if (/^\/compact\s*$/i.test(message)) {
      await submitCompactFromInput();
      return;
    }

    if (/^\/usage\s*$/i.test(message)) {
      await submitUsageFromInput();
      return;
    }

    if (/^\/init\s*$/i.test(message)) {
      await submitInitFromInput();
      return;
    }

    if (isDeepReviewSlashCommand(message)) {
      await submitDeepreviewFromInput();
      return;
    }

    if (
      isNewSessionDraft
      && draftPersonaTarget?.kind === 'team'
      && draftPersonaTarget.identity.id === DEFAULT_REVIEW_TEAM_ID
    ) {
      await submitDeepreviewFromInput(`${DEEP_REVIEW_SLASH_COMMAND} ${message}`);
      return;
    }

    if (resolveTypedMcpPromptCommand(message)) {
      await submitMcpPromptFromInput();
      return;
    }

    if (message.toLowerCase().startsWith('/compact')) {
      notificationService.warning(
        t('chatInput.compactUsage', { defaultValue: 'Use /compact without extra arguments.' })
      );
      return;
    }

    if (message.toLowerCase().startsWith('/usage')) {
      notificationService.warning(
        t('chatInput.usageCommandUsage', { defaultValue: 'Use /usage without extra arguments.' })
      );
      return;
    }

    if (message.toLowerCase().startsWith('/init')) {
      notificationService.warning(
        t('chatInput.initUsage', { defaultValue: 'Use /init without extra arguments.' })
      );
      return;
    }

    if (message.toLowerCase().startsWith('/goal') && !isGoalSlashCommand(message)) {
      notificationService.warning(
        t('chatInput.goalUsage', {
          defaultValue:
            'Use /goal, /goal edit <objective>, /goal pause, /goal resume, or /goal clear.',
        })
      );
      return;
    }
    
    if (messageCharCount > CHAT_INPUT_CONFIG.largePaste.maxMessageChars) {
      notificationService.error(
        t('input.messageTooLarge', {
          max: CHAT_INPUT_CONFIG.largePaste.maxMessageChars,
          count: messageCharCount,
          defaultValue: 'Message exceeds the maximum length of {{max}} characters ({{count}} provided).',
        }),
        { duration: 4000 }
      );
      pendingLargePastesRef.current = originalPendingLargePastes;
      dispatchInput({ type: 'ACTIVATE' });
      dispatchInput({ type: 'SET_VALUE', payload: originalMessage });
      return;
    }

    const confirmed = await confirmPromptCacheGuardIfNeeded();
    if (!confirmed) {
      return;
    }

    // Add to history before clearing (session-scoped)
    if (effectiveTargetSessionId) {
      addToHistory(effectiveTargetSessionId, message);
    }
    setHistoryIndex(-1);
    setSavedDraft('');

    dispatchInput({ type: 'CLEAR_VALUE' });
    inputValueRef.current = '';
    clearPendingLargePastes();
    // Clear machine queue too; otherwise the queuedInput→input sync effect puts the text back after send.
    setQueuedInput(null);

    try {
      if (isNewSessionDraft) {
        setDraftStatus('creating');
      }
      const receipt = await sendMessage(message, {
        displayMessage: originalMessage,
        composerPresentation: originalPresentation,
      });
      if (receipt) {
        const draftGuard = resolveSessionComposerDraftGuard(
          receipt.requestedSessionId,
          receipt.sentSessionId,
          submittedDraftRevision,
        );
        const draftMutationApplied = draftGuard
          ? clearSessionComposerDraftIfRevision(draftGuard)
          : false;
        if (
          shouldApplyGuardedComposerResult(draftGuard, draftMutationApplied)
          && shouldClaimSuccessfulSendReceipt(
            previousComposerSessionIdRef.current,
            receipt.requestedSessionId,
            receipt.sentSessionId,
          )
        ) {
          const currentContexts = contextsRef.current;
          contextsRef.current = currentContexts;
          receipt.submittedContextIds.forEach(removeContext);
          if (shouldDeactivateComposerAfterSend(
            previousComposerSessionIdRef.current,
            receipt,
            inputValueRef.current,
            currentContexts.map(context => context.id),
            pendingLargePastesRef.current,
          )) {
            dispatchInput({ type: 'DEACTIVATE' });
          }
        }
      }
    } catch (error) {
      if (
        isNewSessionDraft &&
        useSessionModeStore.getState().draftStatus !== 'idle'
      ) {
        setDraftStatus('error');
      }
      log.error('Failed to send message', { error });
      const createdSessionId = deferredCreatedSessionIdRef.current;
      const draftGuard = resolveSessionComposerDraftGuard(
        submittedSessionId,
        createdSessionId,
        submittedDraftRevision,
      );
      const draftMutationApplied = draftGuard
        ? saveSessionComposerDraftIfRevision(draftGuard, {
            value: originalMessage,
            contexts: originalContexts,
            pendingLargePastes: originalPendingLargePastes,
          })
        : false;
      if (
        shouldApplyGuardedComposerResult(draftGuard, draftMutationApplied)
        && shouldRestoreFailedComposer(
          previousComposerSessionIdRef.current,
          submittedSessionId,
          createdSessionId,
        )
      ) {
        if (shouldRestoreFailedComposerContent(
          inputValueRef.current,
          pendingLargePastesRef.current,
        )) {
          inputValueRef.current = originalMessage;
          pendingLargePastesRef.current = originalPendingLargePastes;
          dispatchInput({ type: 'ACTIVATE' });
          dispatchInput({ type: 'SET_VALUE', payload: originalMessage });
        }
        const currentContexts = contextsRef.current;
        const currentContextIds = new Set(currentContexts.map(context => context.id));
        const missingOriginalContexts = originalContexts.filter(
          context => !currentContextIds.has(context.id),
        );
        const mergedContexts = [...currentContexts, ...missingOriginalContexts];
        contextsRef.current = mergedContexts;
        if (missingOriginalContexts.length > 0) {
          replaceContexts(mergedContexts);
        }
      }
      if (derivedState?.isProcessing) {
        setQueuedInput(originalMessage);
      }
    }
  }, [
    inputState.value,
    derivedState,
    handleCancelCurrentTask,
    transition,
    sendMessage,
    addToHistory,
    effectiveTargetSessionId,
    clearPendingLargePastes,
    removeContext,
    replaceContexts,
    expandComposerSpecialTokens,
    setQueuedInput,
    submitBtwFromInput,
    submitGoalFromInput,
    submitCompactFromInput,
    submitUsageFromInput,
    submitInitFromInput,
    submitDeepreviewFromInput,
    submitMcpPromptFromInput,
    confirmPromptCacheGuardIfNeeded,
    t,
    resolveTypedMcpPromptCommand,
    draftStatus,
    draftWorkspace,
    draftWorkspaceOptions,
    draftPersonaTarget,
    isCustomizationPersistencePending,
    isNewSessionDraft,
    setDraftStatus,
  ]);
  
  const getFilteredIncrementalModes = useCallback(() => {
    if (!canSwitchModes) return [];
    if (!slashCommandState.query) return incrementalCodeModes;
    return incrementalCodeModes.filter(
      mode =>
        mode.name.toLowerCase().includes(slashCommandState.query) ||
        mode.id.toLowerCase().includes(slashCommandState.query)
    );
  }, [canSwitchModes, incrementalCodeModes, slashCommandState.query]);

  const applyModeChange = useCallback(async (modeId: string) => {
    if (isCustomizationPersistencePending()) {
      return;
    }

    const targetSessionId = effectiveTargetSessionId;
    if (targetSessionId) {
      try {
        await persistModeChange(modeId);
      } catch {
        notificationService.error(
          tCommon('customization.composerPersona.modeChangeFailed'),
        );
        return;
      }
      if (effectiveTargetSessionIdRef.current !== targetSessionId) {
        return;
      }
    }

    dispatchMode({
      type: 'SET_CURRENT_MODE',
      payload: modeId,
    });
    if (isPrimaryComposer) {
      try {
        sessionStorage.setItem('void:flowchat:lastMode', modeId);
      } catch {
        // ignore
      }
    }
  }, [
    effectiveTargetSessionId,
    isCustomizationPersistencePending,
    isPrimaryComposer,
    persistModeChange,
    tCommon,
  ]);

  applyModeChangeRef.current = applyModeChange;

  const requestModeChange = useCallback((modeId: string) => {
    if (isCustomizationPersistencePending()) {
      return;
    }
    if (!canSwitchModes) {
      dispatchMode({ type: 'CLOSE_DROPDOWN' });
      return;
    }

    if (modeId === currentMode) {
      dispatchMode({ type: 'CLOSE_DROPDOWN' });
      return;
    }

    if (!switchableModes.some(mode => mode.id === modeId)) {
      dispatchMode({ type: 'CLOSE_DROPDOWN' });
      return;
    }

    void applyModeChange(modeId);
    dispatchMode({ type: 'CLOSE_DROPDOWN' });
  }, [
    applyModeChange,
    canSwitchModes,
    currentMode,
    isCustomizationPersistencePending,
    switchableModes,
  ]);
  
  const selectSlashCommandMode = useCallback((modeId: string) => {
    requestModeChange(modeId);
    
    dispatchInput({ type: 'CLEAR_VALUE' });
    setSlashCommandState({
      isActive: false,
      kind: 'modes',
      query: '',
      selectedIndex: 0,
    });
  }, [requestModeChange]);

  const selectSlashCommandAction = useCallback((actionId: string) => {
    const raw = inputState.value || '';
    const lower = raw.trimStart().toLowerCase();

    let next = raw;

    if (actionId === 'btw') {
      if (isBtwSession) {
        return;
      }
      if (!lower.startsWith('/btw')) {
        next = '/btw ';
      } else {
        // Normalize to "/btw " + rest, preserving any already typed question.
        const m = raw.match(/^(\s*)\/btw\b/i);
        if (m) {
          const leadingWs = m[1] || '';
          const rest = raw.slice(m[0].length);
          next = `${leadingWs}/btw ${rest.trimStart()}`;
        } else {
          next = '/btw ';
        }
      }
    } else if (actionId === 'compact') {
      next = '/compact';
    } else if (actionId === 'goal') {
      if (!lower.startsWith('/goal')) {
        next = '/goal ';
      } else {
        const m = raw.match(/^(\s*)\/goal\b/i);
        if (m) {
          const leadingWs = m[1] || '';
          const rest = raw.slice(m[0].length);
          next = `${leadingWs}/goal ${rest.trimStart()}`;
        } else {
          next = '/goal ';
        }
      }
    } else if (actionId === 'usage') {
      next = '/usage';
    } else if (actionId === 'init') {
      next = '/init';
    } else if (actionId === 'deepreview') {
      next = `${DEEP_REVIEW_SLASH_COMMAND} `;
    } else {
      return;
    }

    dispatchInput({ type: 'SET_VALUE', payload: next });
    // Clear the machine's queued input so the queuedInput sync effect does not overwrite
    // the just-set "/btw ..." value back to the stale "/" that was queued while processing.
    setQueuedInput(null);
    setSlashCommandState({ isActive: false, kind: 'modes', query: '', selectedIndex: 0 });
    window.setTimeout(() => richTextInputRef.current?.focus(), 0);
  }, [inputState.value, isBtwSession, setQueuedInput]);

  const selectSlashPromptCommand = useCallback((item: SlashMcpPromptItem) => {
    const hasArguments = item.arguments.length > 0;
    dispatchInput({
      type: 'SET_VALUE',
      payload: hasArguments ? `${item.command} ` : item.command,
    });
    setQueuedInput(null);
    setSlashCommandState({ isActive: false, kind: 'modes', query: '', selectedIndex: 0 });
    window.setTimeout(() => richTextInputRef.current?.focus(), 0);
  }, [setQueuedInput]);

  const handleBoostStartBtw = useCallback(
    (e: React.SyntheticEvent) => {
      e.stopPropagation();
      if (!currentSessionId) {
        notificationService.error(t('btw.noSession', { defaultValue: 'No active session for /btw' }));
        return;
      }
      if (isBtwSession) {
        notificationService.warning(
          t('btw.nestedDisabled', { defaultValue: 'Side questions cannot create another side question' })
        );
        return;
      }
      selectSlashCommandAction('btw');
      dispatchMode({ type: 'CLOSE_DROPDOWN' });
    },
    [currentSessionId, isBtwSession, selectSlashCommandAction, t]
  );
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Local /btw shortcut (Ctrl/Cmd+Alt+B) should work even when ChatInput is focused.
    if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      e.stopPropagation();

      if (!currentSessionId) {
        notificationService.error(t('btw.noSession', { defaultValue: 'No active session for /btw' }));
        return;
      }
      if (isBtwSession) {
        notificationService.warning(t('btw.nestedDisabled', { defaultValue: 'Side questions cannot create another side question' }));
        return;
      }

      const selected = (window.getSelection?.()?.toString() ?? '').trim();
      const initial = selected ? `/btw Explain this:\n\n${selected}` : '/btw ';
      dispatchInput({ type: 'ACTIVATE' });
      dispatchInput({ type: 'SET_VALUE', payload: initial });
      window.setTimeout(() => richTextInputRef.current?.focus(), 0);
      return;
    }

    const nativeEvt = e.nativeEvent as KeyboardEvent;
    // IME-owned keys must stay with the input method. In particular, Escape
    // closes the Chinese/Japanese/Korean candidate window and must not cancel
    // the running void session.
    const isComposing =
      isImeComposingRef.current
      || nativeEvt.isComposing
      || nativeEvt.keyCode === 229;

    if (e.key === 'Escape' && isComposing) {
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
      const imageId = popLastExistingImageUndoId(
        undoImageStackRef.current,
        new Set(contextsRef.current.map(context => context.id)),
      );
      if (imageId) {
        e.preventDefault();
        removeContext(imageId);
        return;
      }
    }

    if (e.key === 'Tab' && e.shiftKey) {
      if (isCustomizationPersistencePending()) {
        e.preventDefault();
        return;
      }
      const modes = switchableModesRef.current;
      const modeNow = currentModeRef.current;
      const apply = applyModeChangeRef.current;
      if (!(canSwitchModes && apply && modes.length > 1)) return;

      e.preventDefault();
      e.stopPropagation();

      if (slashCommandState.isActive) {
        setSlashCommandState({ isActive: false, kind: 'modes', query: '', selectedIndex: 0 });
        dispatchInput({ type: 'CLEAR_VALUE' });
      }

      const currentIdx = modes.findIndex(m => m.id === modeNow);
      if (currentIdx === -1) {
        void apply(modes[0].id);
        return;
      }
      const nextIdx = (currentIdx + 1) % modes.length;
      void apply(modes[nextIdx].id);
      return;
    }

    if (slashCommandState.isActive) {
      if (!(slashCommandState.kind === 'modes' && !canSwitchModes)) {
        const items =
          slashCommandState.kind === 'modes'
            ? getFilteredIncrementalModes()
            : slashCommandState.kind === 'actions'
              ? getFilteredActions()
              : getSlashPickerItems();
        const maxIndex = Math.max(0, items.length - 1);
        
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSlashCommandState(prev => ({
            ...prev,
            selectedIndex: Math.min(prev.selectedIndex + 1, maxIndex),
          }));
          return;
        }
        
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSlashCommandState(prev => ({
            ...prev,
            selectedIndex: Math.max(prev.selectedIndex - 1, 0),
          }));
          return;
        }
        
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (items.length > 0) {
            if (slashCommandState.kind === 'modes') {
              const mode = items[slashCommandState.selectedIndex] as any;
              selectSlashCommandMode(mode.id);
            } else if (slashCommandState.kind === 'actions') {
              const action = items[slashCommandState.selectedIndex] as any;
              selectSlashCommandAction(action.id);
            } else {
              const item = items[slashCommandState.selectedIndex] as SlashPickerItem;
              if (item.kind === 'mode') {
                selectSlashCommandMode(item.id);
              } else if (item.kind === 'mcpPrompt') {
                selectSlashPromptCommand(item);
              } else {
                selectSlashCommandAction(item.id);
              }
            }
          }
          return;
        }
        
        if (e.key === 'Escape') {
          e.preventDefault();
          const kind = slashCommandState.kind;
          setSlashCommandState({ isActive: false, kind: 'modes', query: '', selectedIndex: 0 });

          // For mode switching picker, "/" is just a trigger and should be cleared on cancel.
          if (kind !== 'actions') {
            dispatchInput({ type: 'CLEAR_VALUE' });
          }
          return;
        }
        
        if (e.key === 'Tab') {
          e.preventDefault();
          if (items.length > 0) {
            if (slashCommandState.kind === 'modes') {
              const mode = items[slashCommandState.selectedIndex] as any;
              selectSlashCommandMode(mode.id);
            } else if (slashCommandState.kind === 'actions') {
              const action = items[slashCommandState.selectedIndex] as any;
              selectSlashCommandAction(action.id);
            } else {
              const item = items[slashCommandState.selectedIndex] as SlashPickerItem;
              if (item.kind === 'mode') {
                selectSlashCommandMode(item.id);
              } else if (item.kind === 'mcpPrompt') {
                selectSlashPromptCommand(item);
              } else {
                selectSlashCommandAction(item.id);
              }
            }
          }
          return;
        }
      }
    }
    
    // History navigation with up/down arrows
    // Only handle when not in slash command mode and not composing
    if (!slashCommandState.isActive && inputHistory.length > 0) {
      const selection = window.getSelection();
      const editor = richTextInputRef.current;
      
      if (selection && selection.rangeCount > 0 && editor) {
        const range = selection.getRangeAt(0);
        
        // Check cursor position
        const isAtStart = range.collapsed && range.startOffset === 0 && 
                          (range.startContainer === editor || 
                           (range.startContainer.nodeType === Node.TEXT_NODE && 
                            range.startContainer.previousSibling === null &&
                            range.startContainer.parentNode === editor));
        
        // For end position, we need to check if cursor is at the end of content
        const isAtEnd = (() => {
          if (!range.collapsed) return false;
          const editorContent = editor.textContent || '';
          let cursorPos = 0;
          const traverse = (node: Node): boolean => {
            if (node === range.startContainer) {
              if (node.nodeType === Node.TEXT_NODE) {
                cursorPos += range.startOffset;
              }
              return true;
            }
            if (node.nodeType === Node.TEXT_NODE) {
              cursorPos += (node.textContent || '').length;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              for (const child of Array.from(node.childNodes)) {
                if (traverse(child)) return true;
              }
            }
            return false;
          };
          traverse(editor);
          return cursorPos === editorContent.length;
        })();
        
        // Arrow Up at start of line -> go back in history
        if (e.key === 'ArrowUp' && isAtStart) {
          e.preventDefault();
          
          // Save draft if starting navigation
          if (historyIndex === -1 && inputState.value.trim()) {
            setSavedDraft(inputState.value);
          }
          
          // Navigate back (older messages)
          if (historyIndex < inputHistory.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            dispatchInput({ type: 'SET_VALUE', payload: inputHistory[newIndex] });
          }
          return;
        }
        
        // Arrow Down at end of line -> go forward in history
        if (e.key === 'ArrowDown' && isAtEnd) {
          e.preventDefault();
          
          if (historyIndex > 0) {
            // Navigate forward (newer messages)
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            dispatchInput({ type: 'SET_VALUE', payload: inputHistory[newIndex] });
          } else if (historyIndex === 0) {
            // Return to draft/empty
            setHistoryIndex(-1);
            dispatchInput({ type: 'SET_VALUE', payload: savedDraft });
          }
          return;
        }
      }
    }
    
    if (e.key === 'Enter' && !e.shiftKey) {
      if (isComposing) {
        return;
      }
      
      e.preventDefault();

      if (!isComposerActionAllowed(
        isCustomizationPersistencePending(),
        'submit',
      )) {
        return;
      }

      const isBtwCommand = inputState.value.trim().toLowerCase().startsWith('/btw');
      if (isBtwCommand) {
        // Allow /btw submission even while the main session is generating.
        void submitBtwFromInput();
        return;
      }

      if (isGoalSlashCommand(inputState.value.trim())) {
        void submitGoalFromInput();
        return;
      }

      if (derivedState?.isProcessing) {
        if (!inputState.value.trim()) return;
        void handleSendOrCancel();
        return;
      }

      handleSendOrCancel();
    }
    
    if (e.key === 'Escape' && derivedState?.canCancel) {
      e.preventDefault();
      void handleCancelCurrentTask();
    }
  }, [handleSendOrCancel, submitBtwFromInput, submitGoalFromInput, derivedState, handleCancelCurrentTask, slashCommandState, getFilteredIncrementalModes, getFilteredActions, getSlashPickerItems, selectSlashCommandMode, selectSlashCommandAction, selectSlashPromptCommand, canSwitchModes, historyIndex, inputHistory, savedDraft, inputState.value, currentSessionId, isBtwSession, t, removeContext, isCustomizationPersistencePending]);

  const handleImeCompositionStart = useCallback(() => {
    isImeComposingRef.current = true;
  }, []);

  const handleImeCompositionEnd = useCallback(() => {
    isImeComposingRef.current = false;
  }, []);

  const handleImageInput = useCallback(() => {
    const remaining = CHAT_INPUT_CONFIG.image.maxCount - currentImageCount;
    if (remaining <= 0) {
      notificationService.warning(t('input.maxImagesWarning', { count: CHAT_INPUT_CONFIG.image.maxCount }), { duration: 3000 });
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = CHAT_INPUT_CONFIG.image.acceptedTypes.join(',');
    input.multiple = true;
    
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      
      const fileArray = Array.from(files).slice(0, remaining);
      if (files.length > remaining) {
        notificationService.warning(t('input.maxImagesWarning', { count: CHAT_INPUT_CONFIG.image.maxCount }), { duration: 3000 });
      }
      
      for (const file of fileArray) {
        try {
          const imageContext = await createImageContextFromFile(file, {
            workspacePath: composerWorkspacePath,
          });
          addContext(imageContext);
        } catch (error) {
          log.error('Failed to process image', { fileName: file.name, error });
          notificationService.error(
            `${file.name}: ${error instanceof Error ? error.message : t('error.processingFailed')}`,
            { duration: 3000 }
          );
        }
      }
    };
    
    input.click();
  }, [addContext, composerWorkspacePath, currentImageCount, t]);
  

  const focusRichTextInputSoon = useCallback(() => {
    window.requestAnimationFrame(() => {
      richTextInputRef.current?.focus();
    });
  }, []);

  const insertVoiceTranscript = useCallback((transcript: string) => {
    const current = inputValueRef.current;
    const next = current.trim()
      ? `${current.trimEnd()} ${transcript}`
      : transcript;
    dispatchInput({ type: 'ACTIVATE' });
    dispatchInput({ type: 'SET_VALUE', payload: next });
    inputValueRef.current = next;
  }, []);

  const voiceInput = useComposerVoiceInput({
    composerSessionId: effectiveTargetSessionId,
    insertText: insertVoiceTranscript,
    focusInputSoon: focusRichTextInputSoon,
  });

  // Space-to-focus: when no editable element is focused, Space key focuses the input.
  useEffect(() => {
    if (!isPrimaryComposer) {
      return;
    }
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key !== ' ') return;
      const target = e.target as HTMLElement;
      const isEditable =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]') !== null;
      if (isEditable) return;
      e.preventDefault();
      focusRichTextInputSoon();
    };
    document.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [focusRichTextInputSoon, isPrimaryComposer]);

  const insertSkillIntoInput = useCallback(
    (skillName: string) => {
      const line = createSkillPromptReferenceToken(skillName);
      dispatchInput({ type: 'ACTIVATE' });
      const cur = inputState.value;
      const next = cur.trim() ? `${cur.trimEnd()}\n\n${line}` : line;
      dispatchInput({ type: 'SET_VALUE', payload: next });
      dispatchMode({ type: 'CLOSE_DROPDOWN' });
      focusRichTextInputSoon();
    },
    [focusRichTextInputSoon, inputState.value]
  );

  const handleBoostPickImage = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      dispatchMode({ type: 'CLOSE_DROPDOWN' });
      handleImageInput();
    },
    [handleImageInput]
  );

  const handleBoostOpenAtContext = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    dispatchMode({ type: 'CLOSE_DROPDOWN' });
    dispatchInput({ type: 'ACTIVATE' });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const el = richTextInputRef.current;
        if (el && typeof (el as unknown as { openMention?: () => void }).openMention === 'function') {
          (el as unknown as { openMention: () => void }).openMention();
        }
      });
    });
  }, []);

  const handleOpenSkillsLibrary = useCallback(() => {
    dispatchMode({ type: 'CLOSE_DROPDOWN' });
    openScene('skills' as SceneTabId);
  }, [openScene]);

  const handleOpenAgentsLibrary = useCallback(() => {
    dispatchMode({ type: 'CLOSE_DROPDOWN' });
    openScene('agents' as SceneTabId);
  }, [openScene]);

  const handleSelectComposerAgent = useCallback((entry: AgentCatalogEntry) => {
    if (isCustomizationPersistencePending()) {
      return;
    }
    dispatchMode({ type: 'CLOSE_DROPDOWN' });
    void selectComposerAgent(entry).catch(() => {
      notificationService.error(
        tCommon('customization.composerPersona.activationFailed'),
      );
    });
  }, [
    isCustomizationPersistencePending,
    selectComposerAgent,
    tCommon,
  ]);

  const handleClearComposerAgent = useCallback(() => {
    if (isCustomizationPersistencePending()) {
      return;
    }
    void clearComposerAgent().catch(() => {
      notificationService.error(
        tCommon('customization.composerPersona.clearFailed'),
      );
    });
  }, [
    clearComposerAgent,
    isCustomizationPersistencePending,
    tCommon,
  ]);

  const handleSelectComposerTeam = useCallback((entry: TeamCatalogEntry) => {
    dispatchMode({ type: 'CLOSE_DROPDOWN' });
    if (isCustomizationPersistencePending()) {
      return;
    }
    void runComposerTeamAction(entry, {
      launchDeepReview: async () => {
        const currentDraft = inputState.value.trim();
        const command = isDeepReviewSlashCommand(currentDraft)
          ? currentDraft
          : `${DEEP_REVIEW_SLASH_COMMAND}${currentDraft ? ` ${currentDraft}` : ''}`;
        await submitDeepreviewFromInput(command);
      },
      openShortDrama: () => {
        window.dispatchEvent(new CustomEvent('void:open-short-drama-center'));
      },
    }).catch(() => {
      notificationService.error(
        tCommon('customization.composerPersona.teamActionFailed'),
      );
    });
  }, [
    inputState.value,
    isCustomizationPersistencePending,
    runComposerTeamAction,
    submitDeepreviewFromInput,
    tCommon,
  ]);
  useEffect(() => {
    if (!isPrimaryComposer) {
      return;
    }
    const dropZone = containerRef.current?.closest('.void-chat-input-drop-zone') as HTMLElement | null;
    const el = dropZone ?? containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setChatInputHeight(el.offsetHeight);
    });
    observer.observe(el);
    setChatInputHeight(el.offsetHeight);
    return () => observer.disconnect();
  }, [isPrimaryComposer, setChatInputHeight]);


  const renderActionButton = () => {
    return (
      <ComposerActionButton
        available={Boolean(derivedState) || isNewSessionDraft}
        mode={derivedState?.sendButtonMode ?? 'send'}
        hasDraft={Boolean(inputState.value.trim())}
        hasQueuedInput={derivedState?.hasQueuedInput ?? false}
        customizationPersistencePending={customizationPersistencePending}
        sessionCreationPending={draftCreationPending}
        sendLabel={t('input.sendShortcut')}
        creatingLabel={t('chatInput.creatingDraftSession')}
        retryLabel={t('input.retry')}
        cancelLabel={t('input.stopGeneration')}
        onPrimaryAction={() => {
          void handleSendOrCancel();
        }}
        onCancel={() => {
          void handleCancelCurrentTask();
        }}
      />
    );
  };

  return (
    <>
      {deepReviewConsentDialog}
      <ContextDropZone
        acceptedTypes={['file', 'directory', 'image', 'code-snippet', 'mermaid-diagram']}
        className="void-chat-input-drop-zone"
        onContextCommit={isIndependentChildComposer ? addContext : undefined}
        onContextAdded={(context) => {
          if (context.type === 'image' && currentImageCount >= CHAT_INPUT_CONFIG.image.maxCount) {
            notificationService.warning(t('input.maxImagesWarning', { count: CHAT_INPUT_CONFIG.image.maxCount }), { duration: 3000 });
            return;
          }
          // Images are shown as separate thumbnails outside the editor; they
          // don't get an inline #img: pill. All other context types do.
          if (
            context.type !== 'image' &&
            richTextInputRef.current &&
            (richTextInputRef.current as any).insertTag
          ) {
            (richTextInputRef.current as any).insertTag(context);
          }
          if (!inputState.isActive) {
            dispatchInput({ type: 'ACTIVATE' });
          }
        }}
      >
        <div 
          ref={containerRef}
          className={`void-chat-input ${isMultiLine ? 'void-chat-input--multi-line' : 'void-chat-input--capsule'} ${derivedState?.isProcessing ? 'void-chat-input--processing' : ''} ${className}`}
          data-testid="chat-input-container"
          data-composer-session-id={effectiveTargetSessionId || undefined}
          data-composer-kind={isIndependentChildComposer ? 'child' : 'main'}
        >
        {recommendationContext && (
          <SmartRecommendations
            context={recommendationContext}
            className="void-chat-input__recommendations"
          />
        )}

        <PendingQueuePanel sessionId={effectiveTargetSessionId || undefined} />

        <div className="void-chat-input__container">
          <div className={`void-chat-input__box ${isMultiLine ? 'void-chat-input__box--multi-line' : 'void-chat-input__box--capsule'}`}>
            <div className="void-chat-input__input-area">
              {showImageStrip && (
                <div
                  className="void-chat-input__image-strip"
                  data-testid="chat-input-image-strip"
                >
                  {imageContexts.map(image => {
                    const previewUrl = image.thumbnailUrl || image.dataUrl;
                    return (
                      <div
                        key={image.id}
                        className="void-chat-input__image-chip"
                        title={image.imageName}
                      >
                        {previewUrl ? (
                          <img
                            className="void-chat-input__image-chip-thumb"
                            src={previewUrl}
                            alt={image.imageName}
                          />
                        ) : (
                          <div className="void-chat-input__image-chip-thumb void-chat-input__image-chip-thumb--placeholder">
                            <Image size={14} />
                          </div>
                        )}
                        <button
                          type="button"
                          className="void-chat-input__image-chip-remove"
                          aria-label={t('input.removeImage', { defaultValue: 'Remove image' })}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeContext(image.id);
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {showPlaceholder && (
                <span className="void-chat-input__placeholder" aria-hidden>
                  {t('input.placeholder')}
                </span>
              )}
              <RichTextInput
                ref={richTextInputRef}
                value={inputState.value}
                onChange={handleInputChange}
                onLargePaste={createLargePastePlaceholder}
                onKeyDown={handleKeyDown}
                onCompositionStart={handleImeCompositionStart}
                onCompositionEnd={handleImeCompositionEnd}
                placeholder=""
                aria-label={t('input.placeholder')}
                disabled={false}
                contexts={contexts}
                onRemoveContext={removeContext}
                onMentionStateChange={setMentionState}
                data-testid="chat-input-textarea"
              />

              
              <FileMentionPicker
                isOpen={mentionState.isActive}
                searchQuery={mentionState.query}
                workspacePath={composerWorkspacePath}
                onSelect={(context: FileContext | DirectoryContext) => {
                  addContext(context);
                  
                  if (richTextInputRef.current && (richTextInputRef.current as any).insertTagReplacingMention) {
                    (richTextInputRef.current as any).insertTagReplacingMention(context);
                  }
                }}
                onClose={() => {
                  if (richTextInputRef.current && (richTextInputRef.current as any).closeMention) {
                    (richTextInputRef.current as any).closeMention();
                  }
                  setMentionState({ isActive: false, query: '', startOffset: 0 });
                }}
              />
              
              {slashCommandState.isActive && (() => {
                if (slashCommandState.kind === 'actions') {
                  const actions = getFilteredActions();
                  return (
                    <div className="void-chat-input__slash-command-picker">
                      <div className="void-chat-input__slash-command-header">
                        <span>{t('chatInput.quickAction', { defaultValue: 'Quick action' })}</span>
                        <span className="void-chat-input__slash-command-hint">{t('chatInput.selectHint')}</span>
                      </div>
                      <div className="void-chat-input__slash-command-list">
                        {actions.length > 0 ? (
                          actions.map((action, index) => (
                            <div
                              key={action.id}
                              className={`void-chat-input__slash-command-item ${index === slashCommandState.selectedIndex ? 'void-chat-input__slash-command-item--selected' : ''}`}
                              onClick={() => selectSlashCommandAction(action.id)}
                              onMouseEnter={() => setSlashCommandState(prev => ({ ...prev, selectedIndex: index }))}
                            >
                              <span className="void-chat-input__slash-command-name">{action.command}</span>
                              <span className="void-chat-input__slash-command-label">{action.label}</span>
                            </div>
                          ))
                        ) : (
                          <div className="void-chat-input__slash-command-empty">
                            {t('chatInput.noMatchingCommand', { defaultValue: 'No matching command' })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                if (slashCommandState.kind === 'all') {
                  const items = getSlashPickerItems();
                  return (
                    <div className="void-chat-input__slash-command-picker">
                      <div className="void-chat-input__slash-command-header">
                        <span>{t('chatInput.quickAction', { defaultValue: 'Commands' })}</span>
                        <span className="void-chat-input__slash-command-hint">{t('chatInput.selectHint')}</span>
                      </div>
                      <div className="void-chat-input__slash-command-list">
                        {mcpPromptCommandsLoading && items.length === 0 ? (
                          <div className="void-chat-input__slash-command-empty">
                            {t('chatInput.loadingMcpPrompts', { defaultValue: 'Loading MCP prompts…' })}
                          </div>
                        ) : items.length > 0 ? (
                          items.map((item, index) => (
                            <div
                              key={`${item.kind}-${item.id}`}
                              className={`void-chat-input__slash-command-item ${index === slashCommandState.selectedIndex ? 'void-chat-input__slash-command-item--selected' : ''} ${item.kind === 'mode' && item.id === modeState.current ? 'void-chat-input__slash-command-item--active' : ''}`}
                              onClick={() => {
                                if (item.kind === 'mode') {
                                  selectSlashCommandMode(item.id);
                                } else if (item.kind === 'mcpPrompt') {
                                  selectSlashPromptCommand(item);
                                } else {
                                  selectSlashCommandAction(item.id);
                                }
                              }}
                              onMouseEnter={() => setSlashCommandState(prev => ({ ...prev, selectedIndex: index }))}
                            >
                              <span className="void-chat-input__slash-command-name">
                                {item.kind === 'mode' ? `/${item.id}` : item.command}
                              </span>
                              <span className="void-chat-input__slash-command-label">
                                {item.kind === 'mode'
                                  ? item.name
                                  : item.kind === 'mcpPrompt'
                                    ? `${item.serverName} · ${item.label}`
                                    : item.label}
                              </span>
                              {item.kind === 'mode' && item.id === modeState.current && <span className="void-chat-input__slash-command-current">{t('chatInput.current')}</span>}
                            </div>
                          ))
                        ) : (
                          <div className="void-chat-input__slash-command-empty">
                            {t('chatInput.noMatchingCommand', { defaultValue: 'No matching command' })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                if (!canSwitchModes) return null;

                const filteredModes = getFilteredIncrementalModes();
                return (
                  <div className="void-chat-input__slash-command-picker">
                    <div className="void-chat-input__slash-command-header">
                      <span>{t('chatInput.addModeMenuTitle')}</span>
                      <span className="void-chat-input__slash-command-hint">{t('chatInput.selectHint')}</span>
                    </div>
                    <div className="void-chat-input__slash-command-list">
                      {filteredModes.length > 0 ? (
                        filteredModes.map((mode, index) => (
                          <div
                            key={mode.id}
                            className={`void-chat-input__slash-command-item ${index === slashCommandState.selectedIndex ? 'void-chat-input__slash-command-item--selected' : ''} ${mode.id === modeState.current ? 'void-chat-input__slash-command-item--active' : ''}`}
                            onClick={() => selectSlashCommandMode(mode.id)}
                            onMouseEnter={() => setSlashCommandState(prev => ({ ...prev, selectedIndex: index }))}
                          >
                            <span className="void-chat-input__slash-command-name">/{mode.id}</span>
                            <span className="void-chat-input__slash-command-label">{mode.name}</span>
                            {mode.id === modeState.current && <span className="void-chat-input__slash-command-current">{t('chatInput.current')}</span>}
                          </div>
                        ))
                      ) : (
                        <div className="void-chat-input__slash-command-empty">
                          {t('chatInput.noMatchingMode')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
            
            <div className="void-chat-input__actions">
              <div className="void-chat-input__actions-left">
                <div className="void-chat-input__agent-boost" ref={agentBoostRef}>
                  <Tooltip content={t('chatInput.addBoostTooltip')}>
                    <IconButton
                      className="void-chat-input__agent-boost-add"
                      variant="ghost"
                      size="xs"
                      aria-label={t('chatInput.addBoostTooltip')}
                      aria-haspopup="menu"
                      aria-expanded={modeState.dropdownOpen}
                      disabled={customizationInteractionPending}
                      onClick={e => {
                        e.stopPropagation();
                        dispatchMode({ type: 'TOGGLE_DROPDOWN' });
                      }}
                    >
                      <Plus size={14} strokeWidth={2.25} />
                    </IconButton>
                  </Tooltip>

                  {canSwitchModes && modeState.current !== 'agentic' && (
                    <div
                      className={`void-chat-input__agent-capsule void-chat-input__agent-capsule--${modeState.current === 'debug' ? 'debug' : modeState.current}`}
                    >
                      <span className="void-chat-input__agent-capsule-label">
                        {t(`chatInput.modeNames.${modeState.current}`, { defaultValue: '' }) ||
                          modeState.available.find(m => m.id === modeState.current)?.name ||
                          modeState.current}
                      </span>
                      <button
                        type="button"
                        className="void-chat-input__agent-capsule-close"
                        aria-label={t('chatInput.resetToAgentic')}
                        disabled={customizationInteractionPending}
                        onClick={e => {
                          e.stopPropagation();
                          void applyModeChange('agentic');
                          dispatchMode({ type: 'CLOSE_DROPDOWN' });
                        }}
                      >
                        <X size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                  )}

                  {hasActiveComposerPersona && (
                    <div className="void-chat-input__agent-capsule void-chat-input__persona-capsule">
                      {activePersonaAvatarFailed ? (
                        <span className="void-chat-input__persona-avatar-fallback" aria-hidden>
                          {isActiveComposerTeam ? (
                            <Users size={12} />
                          ) : (
                            <Bot size={12} />
                          )}
                        </span>
                      ) : (
                        <img
                          className="void-chat-input__persona-avatar"
                          src={activePersonaAvatarSrc}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          onError={() => setFailedPersonaAvatarSrc(activePersonaAvatarSrc)}
                        />
                      )}
                      <span className="void-chat-input__agent-capsule-label">
                        {activePersonaDisplayName}
                      </span>
                      <button
                        type="button"
                        className="void-chat-input__agent-capsule-close"
                        aria-label={tCommon('customization.composerPersona.clearPersona')}
                        disabled={customizationInteractionPending}
                        onClick={e => {
                          e.stopPropagation();
                          handleClearComposerAgent();
                        }}
                      >
                        <X size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                  )}

                  {isNewSessionDraft && draftStatus !== 'draft' ? (
                    <span
                      className={`void-chat-input__draft-status void-chat-input__draft-status--${draftStatus}`}
                      role="status"
                      aria-live="polite"
                      data-testid="new-session-draft-status"
                    >
                      {draftStatus === 'creating' ? (
                        <Loader2 size={12} aria-hidden />
                      ) : null}
                      {draftStatus === 'creating'
                        ? t('chatInput.creatingDraftSession')
                        : t('chatInput.createDraftFailedRetry')}
                    </span>
                  ) : null}

                  {modeState.dropdownOpen && (
                    <div className="void-chat-input__mode-dropdown void-chat-input__mode-dropdown--agent-boost">
                      {canSwitchModes && (
                        <>
                          <div className="void-chat-input__boost-section">
                            {incrementalCodeModes.length > 0 ? (
                              incrementalCodeModes.map(modeOption => {
                                const modeDescription =
                                  t(`chatInput.modeDescriptions.${modeOption.id}`, { defaultValue: '' }) ||
                                  modeOption.description ||
                                  modeOption.name;
                                const modeName =
                                  t(`chatInput.modeNames.${modeOption.id}`, { defaultValue: '' }) || modeOption.name;
                                return (
                                  <Tooltip key={modeOption.id} content={modeDescription} placement="left">
                                    <div
                                      className={`void-chat-input__mode-option ${modeState.current === modeOption.id ? 'void-chat-input__mode-option--active' : ''}`}
                                      onClick={e => {
                                        e.stopPropagation();
                                        requestModeChange(modeOption.id);
                                      }}
                                    >
                                      <span className="void-chat-input__mode-option-name">{modeName}</span>
                                      {modeState.current === modeOption.id && (
                                        <span className="void-chat-input__slash-command-current">{t('chatInput.current')}</span>
                                      )}
                                    </div>
                                  </Tooltip>
                                );
                              })
                            ) : (
                              <div className="void-chat-input__agent-boost-empty void-chat-input__agent-boost-empty--inline">
                                {t('chatInput.noIncrementalModes')}
                              </div>
                            )}
                          </div>

                          <div className="void-chat-input__boost-section-divider" aria-hidden />
                        </>
                      )}

                      <div className="void-chat-input__boost-section">
                        {composerPersonaEnabled ? (
                          <ComposerPersonaPicker
                            agents={composerPersonaAgents}
                            teams={composerPersonaTeams}
                            loading={composerPersonaLoading}
                            status={composerPersonaStatus}
                            activePersonaId={composerActiveAgent?.identity.id}
                            activeTeamId={composerActiveTeam?.identity.id}
                            busyId={
                              composerPersonaBusyId
                              ?? (modePersistencePending ? '__mode_pending__' : undefined)
                            }
                            onSelectAgent={handleSelectComposerAgent}
                            onSelectTeam={handleSelectComposerTeam}
                            onOpenLibrary={handleOpenAgentsLibrary}
                          />
                        ) : null}

                        <div
                          role="button"
                          tabIndex={0}
                          className="void-chat-input__boost-context-row"
                          onClick={handleBoostOpenAtContext}
                          onKeyDown={e => e.key === 'Enter' && handleBoostOpenAtContext(e)}
                        >
                          <Files size={14} className="void-chat-input__boost-context-icon" aria-hidden />
                          <span>{t('chatInput.boostAddContext')}</span>
                        </div>

                        <div
                          role="button"
                          tabIndex={0}
                          className="void-chat-input__boost-context-row"
                          onClick={handleBoostPickImage}
                          onKeyDown={e => e.key === 'Enter' && handleBoostPickImage(e as any)}
                        >
                          <Image size={14} className="void-chat-input__boost-context-icon" aria-hidden />
                          <span>{t('input.addImage')}</span>
                        </div>

                        <React.Suspense fallback={null}>
                          <BoostSkillsSubmenu
                            skills={runtimeBoostSkills}
                            loading={boostSkillsLoading}
                            onSelectSkill={insertSkillIntoInput}
                            onOpenLibrary={handleOpenSkillsLibrary}
                          />
                        </React.Suspense>

                        {!!currentSessionId && !isBtwSession && (
                          <>
                            <div className="void-chat-input__boost-section-divider" aria-hidden />
                            <div
                              role="button"
                              tabIndex={0}
                              className="void-chat-input__boost-context-row"
                              data-testid="chat-input-boost-start-btw"
                              onClick={handleBoostStartBtw}
                              onKeyDown={e => e.key === 'Enter' && handleBoostStartBtw(e)}
                            >
                              <MessageSquarePlus size={14} className="void-chat-input__boost-context-icon" aria-hidden />
                              <span>{t('chatInput.boostStartBtw')}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="void-chat-input__actions-right">
                <div className="void-chat-input__model-usage-group">
                  <ModelSelector
                    currentMode={composerAgentType}
                    sessionId={effectiveTargetSessionId || undefined}
                    currentTokens={tokenUsage.current}
                    maxTokens={tokenUsage.max}
                  />
                </div>

                <ComposerVoiceInputButton controller={voiceInput} />
                {voiceInput.phase === 'idle' ? renderActionButton() : null}
              </div>
            </div>
            <ChatInputWorkspaceStrip
                repositoryPath={chatStripRepositoryPath}
                workspaceLabel={chatStripWorkspaceLabel}
                workspacePicker={
                  isNewSessionDraft
                    ? {
                        ariaLabel: t('workspaceStrip.selectWorkspace'),
                        options: draftWorkspaceOptions.map(candidate => ({
                          id: candidate.id,
                          label: candidate.name,
                        })),
                        selectedId: draftWorkspace?.id,
                        createLabel: t('workspaceStrip.createWorkspace'),
                        onCreate: handleCreateDraftWorkspace,
                        onSelect: workspaceId => {
                          const selectedWorkspace = draftWorkspaceOptions.find(
                            candidate => candidate.id === workspaceId,
                          );
                          if (selectedWorkspace) {
                            selectNewSessionDraftWorkspace(selectedWorkspace);
                          }
                        },
                      }
                    : undefined
                }
                usageReport={
                  effectiveTargetSessionId && effectiveTargetSession
                    ? { visible: true, onOpen: handleToolbarUsageReport }
                    : undefined
                }
                permissionControl={{
                  mode: isAcpTargetSession ? 'acp' : toolPermissionConfig.mode,
                  status: isAcpTargetSession ? 'ready' : permissionConfigStatus,
                  saving: permissionModeSaving,
                  onChange: isAcpTargetSession ? undefined : handlePermissionModeChange,
                }}
              />
          </div>
        </div>
      </div>
    </ContextDropZone>
    </>
  );
};

export default ChatInput;
