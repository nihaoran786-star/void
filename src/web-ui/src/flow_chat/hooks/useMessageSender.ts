/**
 * Message sending hook.
 * Encapsulates session creation, image uploads, and message assembly.
 *
 * Image handling is fully delegated to the backend coordinator which
 * decides whether to pre-analyse via a vision model, attach images
 * directly, or expose them to media tools. The frontend only passes
 * ImageContextData[] through to the backend.
 */

import { useCallback, useRef, useState } from 'react';
import { FlowChatManager } from '../services/FlowChatManager';
import type {
  ContextItem,
  ImageContext,
  SessionReferenceContext,
} from '@/shared/types/context';
import type { AIModelConfig, DefaultModelsConfig } from '@/infrastructure/config/types';
import { createLogger } from '@/shared/utils/logger';
import { formatContextForPrompt } from '@/shared/utils/contextPrompt';
import { buildImageContextsForBackend } from '../utils/imageContextForBackend';
import type { SessionConfig } from '../types/flow-chat';
import type { PersonaTurnSnapshotDescriptor } from '@/shared/services/customization';
import { createPersonaTurnSnapshot } from '@/shared/services/customization';
import {
  createComposerPresentation,
  type ComposerPresentation,
} from '../utils/composerPresentation';
import { expandSkillPromptReferences } from '../utils/skillPromptReference';
import type { SessionReferenceAccessScope } from '@/infrastructure/api/service-api/SessionAPI';
import {
  resolveSessionReferenceTranscriptInjection,
  sessionReferenceResolutionMetadata,
} from '../services/sessionReferenceTranscript';

const log = createLogger('FlowChat');

function normalizeModelSelection(
  modelId: string | undefined,
  models: AIModelConfig[],
  defaultModels: DefaultModelsConfig,
): string {
  const value = modelId?.trim();
  if (!value || value === 'auto') return 'auto';

  if (value === 'primary' || value === 'fast') {
    const resolvedDefaultId = value === 'primary' ? defaultModels.primary : defaultModels.fast;
    const matchedModel = models.find(model => model.id === resolvedDefaultId);
    return matchedModel ? value : 'auto';
  }

  const matchedModel = models.find(model =>
    model.id === value || model.name === value || model.model_name === value,
  );
  return matchedModel ? value : 'auto';
}

function shouldPreserveCreatedSession(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'preserveSession' in error
    && (error as { preserveSession?: unknown }).preserveSession === true;
}

interface UseMessageSenderProps {
  /** Current session ID */
  currentSessionId?: string;
  /** Context items */
  contexts: ContextItem[];
  /** Success callback */
  onSuccess?: (message: string, receipt: MessageSendReceipt) => void;
  /** Exit template mode callback */
  onExitTemplateMode?: () => void;
  /** Selected agent type (mode) */
  currentAgentType?: string;
  /** Workspace and transport scope for a not-yet-created session. */
  newSessionConfig?: SessionConfig;
  /** Called after a deferred session exists and before its first message is sent. */
  onSessionCreated?: (
    sessionId: string,
  ) => void | PersonaTurnSnapshotDescriptor | Promise<void | PersonaTurnSnapshotDescriptor>;
  /** Authorized scope used by the session-reference Module Interface. */
  sessionReferenceScope?: Omit<SessionReferenceAccessScope, 'currentSessionId'>;
  /**
   * Optional explicit parent-session persona state. Omission preserves the
   * legacy send path exactly and emits no persona metadata.
   */
  personaSessionState?: PersonaTurnSnapshotDescriptor;
}

export interface MessageSendReceipt {
  requestedSessionId: string | null;
  sentSessionId: string;
  submittedContextIds: readonly string[];
}

export interface EnsuredMessageSession {
  sessionId: string;
  personaSessionState?: PersonaTurnSnapshotDescriptor;
}

interface UseMessageSenderReturn {
  /** Create and prepare the deferred parent session without sending a message. */
  ensureSession: () => Promise<EnsuredMessageSession>;
  /** Send a message */
  sendMessage: (
    message: string,
    options?: {
      displayMessage?: string;
      composerPresentation?: ComposerPresentation;
    }
  ) => Promise<MessageSendReceipt | undefined>;
  /** Whether a send is in progress */
  isSending: boolean;
}

export function useMessageSender(props: UseMessageSenderProps): UseMessageSenderReturn {
  const {
    currentSessionId,
    contexts,
    onSuccess,
    onExitTemplateMode,
    currentAgentType,
    newSessionConfig,
    onSessionCreated,
    sessionReferenceScope,
    personaSessionState,
  } = props;

  const pendingSessionRef = useRef<Promise<EnsuredMessageSession> | null>(null);
  const preparedSessionRef = useRef<EnsuredMessageSession | null>(null);
  const retryableSessionIdRef = useRef<string | null>(null);
  const retryPreparationRef = useRef<UseMessageSenderProps['onSessionCreated']>();
  const pendingSendRef = useRef<Promise<MessageSendReceipt | undefined> | null>(null);
  const [isSending, setIsSending] = useState(false);

  const ensureSession = useCallback(async (): Promise<EnsuredMessageSession> => {
    if (pendingSessionRef.current) {
      return pendingSessionRef.current;
    }

    if (
      preparedSessionRef.current
      && preparedSessionRef.current.sessionId === currentSessionId
    ) {
      return preparedSessionRef.current;
    }

    const retryableSessionId = retryableSessionIdRef.current;
    if (currentSessionId && !retryableSessionId) {
      const prepared = {
        sessionId: currentSessionId,
      };
      preparedSessionRef.current = prepared;
      return prepared;
    }

    const creation = (async (): Promise<EnsuredMessageSession> => {
      let sessionId = retryableSessionId;
      let modelId: string | undefined;
      const agentType = currentAgentType || 'agentic';
      if (!sessionId) {
        const { configManager } = await import('@/infrastructure/config/services/ConfigManager');
        const [agentModels, allModels, defaultModels] = await Promise.all([
          configManager.getConfig<Record<string, string>>('ai.agent_models') || {},
          configManager.getConfig<AIModelConfig[]>('ai.models') || [],
          configManager.getConfig<DefaultModelsConfig>('ai.default_models') || {},
        ]);
        modelId = normalizeModelSelection(agentModels[agentType], allModels, defaultModels);
        sessionId = await FlowChatManager.getInstance().createChatSession({
          ...newSessionConfig,
          modelName: modelId || undefined,
        }, agentType);
      }

      const prepareSession = retryPreparationRef.current ?? onSessionCreated;
      let preparedPersona: void | PersonaTurnSnapshotDescriptor;
      try {
        preparedPersona = await prepareSession?.(sessionId);
      } catch (activationError) {
        if (shouldPreserveCreatedSession(activationError) && prepareSession) {
          retryableSessionIdRef.current = sessionId;
          retryPreparationRef.current = prepareSession;
          throw activationError;
        }
        retryableSessionIdRef.current = null;
        retryPreparationRef.current = undefined;
        const flowChatManager = FlowChatManager.getInstance();
        try {
          await flowChatManager.deleteChatSession(sessionId);
        } catch (cleanupError) {
          flowChatManager.discardLocalSession(sessionId);
          log.warn('Failed to delete unprepared session; discarded local projection', {
            sessionId,
            cleanupError: cleanupError instanceof Error
              ? cleanupError.message
              : 'unknown',
          });
        }
        throw activationError;
      }
      retryableSessionIdRef.current = null;
      retryPreparationRef.current = undefined;
      const prepared = {
        sessionId,
        ...(preparedPersona ? { personaSessionState: preparedPersona } : {}),
      };
      preparedSessionRef.current = prepared;
      log.debug(retryableSessionId ? 'Session preparation retried' : 'Session created', {
        sessionId,
        modelId,
        agentType,
      });
      return prepared;
    })();
    pendingSessionRef.current = creation;
    try {
      return await creation;
    } finally {
      if (pendingSessionRef.current === creation) {
        pendingSessionRef.current = null;
      }
    }
  }, [currentAgentType, currentSessionId, newSessionConfig, onSessionCreated]);

  const performSend = useCallback(async (
    message: string,
    options?: {
      displayMessage?: string;
      composerPresentation?: ComposerPresentation;
    }
  ) => {
    if (!message.trim()) {
      return;
    }

    const trimmedMessage = message.trim();
    const capturedPersonaSessionState = personaSessionState
      ? structuredClone(personaSessionState)
      : undefined;
    const requestedSessionId = currentSessionId ?? null;
    const submittedContexts = contexts.map(context => ({ ...context }));
    const submittedContextIds = contexts.map(context => context.id);
    // Strip inline `#img:<name>` tags from the AI-bound text. The rich text
    // editor inserts these when an image is pasted, but the named file does
    // not exist on disk; image bytes are sent out-of-band via `imageContexts`
    // below. Leaving the placeholder in the prompt misleads the model into
    // looking up a non-existent file. The display message keeps the tag so
    // the UI can still render the inline pill.
    const stripImageTags = (text: string): string =>
      text
        .replace(/#img:[^\s\n]+\s?/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    const aiTrimmedMessage = expandSkillPromptReferences(stripImageTags(trimmedMessage));
    let sessionId = requestedSessionId;
    log.debug('Send message initiated', {
      textLength: trimmedMessage.length,
      contextCount: submittedContexts.length,
      hasSession: !!sessionId,
      agentType: currentAgentType || 'agentic',
    });

    try {
      const flowChatManager = FlowChatManager.getInstance();
      let effectivePersonaSessionState = capturedPersonaSessionState;

      if (!sessionId || onSessionCreated || retryableSessionIdRef.current) {
        const prepared = await ensureSession();
        sessionId = prepared.sessionId;
        effectivePersonaSessionState = prepared.personaSessionState
          ? structuredClone(prepared.personaSessionState)
          : effectivePersonaSessionState;
      } else {
        log.debug('Reusing existing session', { sessionId });
      }
      const personaTurnSnapshot = effectivePersonaSessionState
        ? structuredClone(createPersonaTurnSnapshot(effectivePersonaSessionState))
        : undefined;

      const imageContexts = submittedContexts.filter(ctx => ctx.type === 'image') as ImageContext[];
      const sessionReferences = submittedContexts.filter(
        (context): context is SessionReferenceContext => context.type === 'session-reference',
      );
      const sessionReferenceInjection = await resolveSessionReferenceTranscriptInjection(
        sessionReferences,
        sessionReferenceScope?.workspacePath
          ? {
              currentSessionId: sessionId,
              ...sessionReferenceScope,
            }
          : undefined,
      );

      let fullMessage = aiTrimmedMessage;
      const displayMessage = options?.displayMessage?.trim() || trimmedMessage;
      const composerPresentation = options?.composerPresentation
        ?? createComposerPresentation(displayMessage, submittedContexts);

      if (submittedContexts.length > 0) {
        const fullContextSection = submittedContexts
          .map(formatContextForPrompt)
          .filter(Boolean)
          .join('\n');

        fullMessage = `${fullContextSection}\n\n${aiTrimmedMessage}`;
      }
      if (sessionReferenceInjection.prompt) {
        fullMessage = `${sessionReferenceInjection.prompt}\n\n${fullMessage}`;
      }

      // Always pass imageContexts to the backend; the coordinator decides
      // whether to pre-analyse via a vision model or attach directly.
      const imageContextsForBackend = imageContexts.length > 0
        ? buildImageContextsForBackend(imageContexts)
        : undefined;

      await flowChatManager.sendMessage(
        fullMessage,
        sessionId || undefined,
        displayMessage,
        currentAgentType || 'agentic',
        undefined,
        {
          imageContexts: imageContextsForBackend?.imageContexts,
          imageDisplayData: imageContextsForBackend?.imageDisplayData,
          userMessageMetadata: {
            composerPresentation,
            sessionReferences,
            sessionReferenceResolutions: sessionReferenceResolutionMetadata(
              sessionReferenceInjection.results,
            ),
            ...(personaTurnSnapshot ? { personaTurnSnapshot } : {}),
          },
        },
      );

      onExitTemplateMode?.();

      const receipt: MessageSendReceipt = {
        requestedSessionId,
        sentSessionId: sessionId,
        submittedContextIds,
      };
      onSuccess?.(trimmedMessage, receipt);
      log.info('Message sent successfully', {
        sessionId,
        agentType: currentAgentType || 'agentic',
        contextCount: submittedContexts.length,
        imageCount: imageContexts.length,
      });
      return receipt;
    } catch (error) {
      log.error('Failed to send message', {
        sessionId,
        agentType: currentAgentType || 'agentic',
        contextCount: submittedContexts.length,
        error: (error as Error)?.message ?? 'unknown',
      });
      throw error;
    }
  }, [
    currentSessionId,
    contexts,
    onSuccess,
    onExitTemplateMode,
    currentAgentType,
    onSessionCreated,
    ensureSession,
    sessionReferenceScope,
    personaSessionState,
  ]);

  const sendMessage = useCallback((
    message: string,
    options?: {
      displayMessage?: string;
      composerPresentation?: ComposerPresentation;
    },
  ): Promise<MessageSendReceipt | undefined> => {
    if (pendingSendRef.current) {
      return pendingSendRef.current;
    }
    if (!message.trim()) {
      return Promise.resolve(undefined);
    }

    setIsSending(true);
    const operation = performSend(message, options);
    pendingSendRef.current = operation;
    const clearPending = () => {
      if (pendingSendRef.current === operation) {
        pendingSendRef.current = null;
        setIsSending(false);
      }
    };
    void operation.then(clearPending, clearPending);
    return operation;
  }, [performSend]);

  return {
    ensureSession,
    sendMessage,
    isSending,
  };
}
