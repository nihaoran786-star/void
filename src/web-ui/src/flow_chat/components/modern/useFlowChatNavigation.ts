/**
 * FlowChat navigation side effects.
 *
 * Handles cross-session focus requests and turn pinning events for the modern
 * virtualized list.
 */

import { useEffect, useState, type RefObject } from 'react';
import { globalEventBus } from '@/infrastructure/event-bus';
import { createLogger } from '@/shared/utils/logger';
import { flowChatStore } from '../../store/FlowChatStore';
import { useModernFlowChatStore, type VirtualItem } from '../../store/modernFlowChatStore';
import { flowChatManager } from '../../services/FlowChatManager';
import {
  FLOWCHAT_FOCUS_ITEM_EVENT,
  FLOWCHAT_PIN_TURN_TO_TOP_EVENT,
  type FlowChatFocusItemRequest,
  type FlowChatPinTurnToTopRequest,
} from '../../events/flowchatNavigation';
import type { VirtualMessageListRef } from './VirtualMessageList';
import { resolveFlowChatFocusTarget, type ResolvedFocusTarget } from './flowChatFocusTarget';

const log = createLogger('useFlowChatNavigation');

interface UseFlowChatNavigationOptions {
  isActive?: boolean;
  activeSessionId?: string;
  virtualItems: VirtualItem[];
  virtualListRef: RefObject<VirtualMessageListRef | null>;
  onExpandExploreGroup?: (groupId: string) => void;
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs: number,
  shouldContinue: () => boolean = () => true,
): Promise<boolean> {
  const start = performance.now();
  while (shouldContinue() && performance.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
  return shouldContinue() && predicate();
}

async function waitForAnimationFrames(
  frameCount: number,
  shouldContinue: () => boolean = () => true,
): Promise<boolean> {
  let remaining = Math.max(0, frameCount);
  while (shouldContinue() && remaining > 0) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    remaining -= 1;
  }
  return shouldContinue();
}

function navigateToResolvedTarget(
  virtualListRef: RefObject<VirtualMessageListRef | null>,
  target: ResolvedFocusTarget,
): void {
  const list = virtualListRef.current;
  if (!list) return;

  if (target.preferPinnedTurnNavigation && target.resolvedTurnId) {
    list.pinTurnToTop(target.resolvedTurnId, { behavior: 'auto' });
    return;
  }

  if (target.resolvedVirtualIndex != null) {
    list.scrollToIndex(target.resolvedVirtualIndex);
    return;
  }

  if (target.resolvedTurnIndex) {
    list.scrollToTurn(target.resolvedTurnIndex);
  }
}

export function useFlowChatNavigation({
  isActive = true,
  activeSessionId,
  virtualItems,
  virtualListRef,
  onExpandExploreGroup,
}: UseFlowChatNavigationOptions): void {
  const [pendingTurnPinRequest, setPendingTurnPinRequest] = useState<FlowChatPinTurnToTopRequest | null>(null);

  useEffect(() => {
    if (!isActive) return;
    const unsubscribe = globalEventBus.on<FlowChatPinTurnToTopRequest>(FLOWCHAT_PIN_TURN_TO_TOP_EVENT, (request) => {
      if (!request || request.sessionId !== activeSessionId) {
        return;
      }

      setPendingTurnPinRequest(request);
    });

    return unsubscribe;
  }, [activeSessionId, isActive]);

  useEffect(() => {
    if (!isActive) {
      setPendingTurnPinRequest(null);
      return;
    }
    if (!pendingTurnPinRequest) return;
    if (pendingTurnPinRequest.sessionId !== activeSessionId) {
      setPendingTurnPinRequest(null);
      return;
    }

    const accepted = virtualListRef.current?.pinTurnToTop(pendingTurnPinRequest.turnId, {
      behavior: pendingTurnPinRequest.behavior ?? 'auto',
      pinMode: pendingTurnPinRequest.pinMode,
    }) ?? false;
    if (accepted) {
      setPendingTurnPinRequest(null);
    }
  }, [activeSessionId, isActive, pendingTurnPinRequest, virtualItems, virtualListRef]);

  useEffect(() => {
    if (!isActive) return;
    let disposed = false;
    const shouldContinue = () => !disposed;
    const unsubscribe = globalEventBus.on<FlowChatFocusItemRequest>(FLOWCHAT_FOCUS_ITEM_EVENT, async (request) => {
      const { sessionId, itemId } = request;
      if (!sessionId || disposed) return;

      if (activeSessionId !== sessionId) {
        try {
          await flowChatManager.switchChatSession(sessionId);
          if (disposed) return;
        } catch (error) {
          if (disposed) return;
          log.warn('Failed to switch session for focus request', { sessionId, error });
          return;
        }
      }

      const isReady = await waitForCondition(() => {
        const modernActiveSessionId = useModernFlowChatStore.getState().activeSession?.sessionId;
        return modernActiveSessionId === sessionId && !!virtualListRef.current;
      }, 1500, shouldContinue);
      if (!isReady) return;

      const targetSession = flowChatStore.getState().sessions.get(sessionId);
      const resolvedTarget = resolveFlowChatFocusTarget(
        request,
        useModernFlowChatStore.getState().virtualItems,
        targetSession,
      );

      if (resolvedTarget.expandExploreGroupId) {
        onExpandExploreGroup?.(resolvedTarget.expandExploreGroupId);
      }

      navigateToResolvedTarget(virtualListRef, resolvedTarget);

      if (!itemId) return;

      const framesCompleted = await waitForAnimationFrames(2, shouldContinue);
      if (!framesCompleted) return;

      const maxAttempts = 120;
      let attempts = 0;
      const tryFocus = () => {
        if (disposed) return;
        attempts += 1;
        const focusItemId = resolvedTarget.focusItemId ?? itemId;
        const element = document.querySelector(`[data-flow-item-id="${CSS.escape(focusItemId)}"]`) as HTMLElement | null;
        if (!element) {
          if (attempts % 12 === 0 && !resolvedTarget.preferPinnedTurnNavigation) {
            navigateToResolvedTarget(virtualListRef, resolvedTarget);
          }
          if (attempts < maxAttempts) {
            requestAnimationFrame(tryFocus);
          }
          return;
        }

        element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
        element.classList.add('flowchat-flow-item--focused');
        window.setTimeout(() => element.classList.remove('flowchat-flow-item--focused'), 1600);
      };

      requestAnimationFrame(tryFocus);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [activeSessionId, isActive, onExpandExploreGroup, virtualListRef]);
}
