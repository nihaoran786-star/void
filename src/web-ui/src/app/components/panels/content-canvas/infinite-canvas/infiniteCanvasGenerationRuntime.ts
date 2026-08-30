/**
 * Panel-side construction of the media generation runtime.
 *
 * 2026-08-24 owner decision (supersedes K2 W6 session wiring): canvas buttons
 * submit straight to the backend media pipeline through the direct gateway —
 * no session, no AI relay. There is no longer a session sender anywhere in the
 * tree; `sourceSessionId` is kept as an accepted option for prop compatibility
 * only. Tests keep injecting a fake runtime through the panel prop.
 */
import type { StylePresetCatalog } from '@/shared/services/style-preset';
import type { SessionImageGenerationGateway } from '@/shared/services/infinite-canvas';
import {
  createDirectImageGenerationGateway,
  ensureInfiniteCanvasDirectMediaJobEventForwarder,
} from '@/shared/services/infinite-canvas';

export interface InfiniteCanvasGenerationRuntime {
  gateway: SessionImageGenerationGateway;
  /**
   * Direct path: generation never needs a target session, so this is always
   * true. Kept on the interface because the panel (and injected test
   * runtimes) still consult it before dispatching.
   */
  hasTargetSession: () => boolean;
}

export interface InfiniteCanvasGenerationRuntimeOptions {
  workspaceId: string;
  /** Local canvas workspace root; the direct command is bound to it. */
  workspacePath: string;
  documentId: string;
  /** Unused since the direct-path switch; accepted for compatibility. */
  sourceSessionId?: string;
  catalog?: StylePresetCatalog;
}

export function createInfiniteCanvasGenerationRuntime(
  options: InfiniteCanvasGenerationRuntimeOptions,
): InfiniteCanvasGenerationRuntime {
  // Completed batches arrive over the direct Tauri channel; the process-wide
  // forwarder relays them onto agent:tool-run-event for the media bridge.
  ensureInfiniteCanvasDirectMediaJobEventForwarder();
  const gateway = createDirectImageGenerationGateway({
    workspaceId: options.workspaceId,
    workspacePath: options.workspacePath,
    documentId: options.documentId,
    catalog: options.catalog,
  });
  return {
    gateway,
    hasTargetSession: () => true,
  };
}
