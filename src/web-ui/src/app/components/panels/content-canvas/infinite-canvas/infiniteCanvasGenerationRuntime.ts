/**
 * Panel-side construction of the session-backed image generation runtime
 * (K2 W6): the shared gateway plus the flow-chat session resolvers, wired
 * through the app-layer sender. Tests inject a fake runtime through the
 * panel prop instead of mocking flow_chat internals.
 */
import type { StylePresetCatalog } from '@/shared/services/style-preset';
import type { SessionImageGenerationGateway } from '@/shared/services/infinite-canvas';
import { createSessionImageGenerationGateway } from '@/shared/services/infinite-canvas';

import {
  createInfiniteCanvasAgentTaskSessionSender,
  createInfiniteCanvasSessionResolvers,
} from './InfiniteCanvasAgentTaskSessionSender';

export interface InfiniteCanvasGenerationRuntime {
  gateway: SessionImageGenerationGateway;
  /** True when a target session (source or active) is currently available. */
  hasTargetSession: () => boolean;
}

export interface InfiniteCanvasGenerationRuntimeOptions {
  workspaceId: string;
  /** Canvas workspace path; gates the active-session fallback to the same workspace. */
  workspacePath: string;
  documentId: string;
  /** Canvas surface presentation sourceSessionId; preferred dispatch target. */
  sourceSessionId?: string;
  catalog?: StylePresetCatalog;
}

export function createInfiniteCanvasGenerationRuntime(
  options: InfiniteCanvasGenerationRuntimeOptions,
): InfiniteCanvasGenerationRuntime {
  const resolvers = createInfiniteCanvasSessionResolvers({
    sourceSessionId: options.sourceSessionId,
    workspacePath: options.workspacePath,
  });
  const gateway = createSessionImageGenerationGateway({
    workspaceId: options.workspaceId,
    documentId: options.documentId,
    sender: createInfiniteCanvasAgentTaskSessionSender(),
    getSourceSessionId: resolvers.getSourceSessionId,
    getActiveSessionId: resolvers.getActiveSessionId,
    catalog: options.catalog,
  });
  return {
    gateway,
    hasTargetSession: () => Boolean(
      resolvers.getSourceSessionId() ?? resolvers.getActiveSessionId(),
    ),
  };
}
