/**
 * FlowChat context.
 * Pass callbacks and config through the tree to avoid prop drilling.
 */

import { createContext, useContext } from 'react';
import type React from 'react';
import type { FlowChatConfig, Session } from '../../types/flow-chat';
import type { LineRange } from '@/component-library';
import type { ComposerPresentation } from '../../utils/composerPresentation';

export interface FlowChatComposerFillRequest {
  content: string;
  composerPresentation?: ComposerPresentation;
  /** Exact session whose composer should be restored. Never infer this from visible text. */
  targetSessionId?: string;
}

export interface FlowChatContextValue {
  // File and panel actions
  onFileViewRequest?: (filePath: string, fileName: string, lineRange?: LineRange) => void;
  onTabOpen?: (tabInfo: any, sessionId?: string, panelType?: string) => void;
  onHttpLinkClick?: (url: string, event: React.MouseEvent<HTMLAnchorElement>) => boolean | void;
  onOpenVisualization?: (type: string, data: any) => void;
  onSwitchToChatPanel?: () => void;

  // Tool actions
  onToolConfirm?: (toolId: string, updatedInput?: any, permissionOptionId?: string, approve?: boolean) => Promise<void>;
  onToolReject?: (toolId: string, permissionOptionId?: string) => Promise<void>;

  // Session info
  sessionId?: string;
  /**
   * Live session object for surfaces that render a session other than the
   * active one (BTW child panel, Agent debug chat).
   *
   * The main Flow Chat surface must not put the active session here: its
   * identity changes on every streamed flush, which would change this context
   * value and re-render every mounted message. It passes the stable
   * `sessionWorkspacePath` instead and lets consumers read live turn state
   * from the store.
   */
  activeSessionOverride?: Session | null;
  /** Workspace path of the rendered session; stable for the session's lifetime. */
  sessionWorkspacePath?: string;
  allowUserMessageRollback?: boolean;
  allowUserMessageEdit?: boolean;
  onFillUserMessageInput?: (request: FlowChatComposerFillRequest) => void;

  // Config
  config?: FlowChatConfig;

  // ========== Explore group collapse state ==========
  /**
   * Expanded/collapsed state for explore groups.
   * key: groupId, value: true means expanded.
   */
  exploreGroupStates?: Map<string, boolean>;

  /**
   * Toggle explore group expanded/collapsed state.
   */
  onExploreGroupToggle?: (groupId: string) => void;

  /**
   * Expand the specified explore group.
   */
  onExpandGroup?: (groupId: string) => void;

  /**
   * Expand all explore groups within a turn.
   */
  onExpandAllInTurn?: (turnId: string) => void;

  /**
   * Collapse the specified explore group.
   */
  onCollapseGroup?: (groupId: string) => void;

  // Message search state
  searchQuery?: string;
  searchMatchIndices?: ReadonlySet<number>;
  searchCurrentMatchVirtualIndex?: number;
}

export const FlowChatContext = createContext<FlowChatContextValue>({});

/**
 * FlowChat context hook.
 */
export const useFlowChatContext = () => {
  return useContext(FlowChatContext);
};
