/**
 * Desktop adapters for the three Infinite Canvas commands that are not file
 * I/O: writing image bytes, sweeping the scratch folder, and reading a picture
 * back as a prompt.
 *
 * These used to sit in the panel folder, which put `api.invoke` inside
 * `app/components/` and pointed the dependency the wrong way round — the UI
 * was talking to the desktop backend directly instead of through an adapter.
 * They live here now, beside `infiniteCanvasDesktopPersistence`, which is the
 * same arrangement for the same reason. The panel keeps a thin shell that
 * names the ports and hands back these implementations.
 *
 * Two habits are shared by all three and are load-bearing:
 *
 * - the API client is reached through a dynamic import, so the canvas chunk
 *   does not pull the API module in at load time;
 * - none of them throws. A transport failure is folded into the same typed
 *   status the command itself returns, so a caller has exactly one shape to
 *   render and never a rejected promise to catch.
 */

/**
 * P5 W1 asset-writer port: the ONE way the web layer puts image bytes on disk.
 *
 * Behind it sits the R1 desktop command `write_canvas_image_bytes`, whose
 * two-prefix allowlist (`.void/infinite-canvas/scratch/`,
 * `media/input/canvas-crops/`) is the only barrier that keeps this from being
 * a general write-anywhere hole.
 */
export interface InfiniteCanvasAssetWriteRequest {
  workspacePath: string;
  /** Workspace-relative destination; must match the command's allowlist. */
  relativePath: string;
  /** Bare base64 (no `data:` prefix) PNG bytes. */
  base64Png: string;
}

export type InfiniteCanvasAssetWriteResult =
  | { status: 'written'; relativePath: string; bytesWritten?: number }
  | {
    status: 'invalid_input' | 'path_denied' | 'backend';
    relativePath?: string;
    message?: string;
  };

export type InfiniteCanvasAssetWriter = (
  request: InfiniteCanvasAssetWriteRequest,
) => Promise<InfiniteCanvasAssetWriteResult>;

export const WRITE_CANVAS_IMAGE_BYTES_COMMAND = 'write_canvas_image_bytes';
export const PRUNE_CANVAS_SCRATCH_COMMAND = 'prune_canvas_scratch';

export function getInfiniteCanvasAssetWriter(): InfiniteCanvasAssetWriter {
  return async request => {
    try {
      const { api } = await import('@/infrastructure/api/service-api/ApiClient');
      const response = await api.invoke<InfiniteCanvasAssetWriteResult>(
        WRITE_CANVAS_IMAGE_BYTES_COMMAND,
        { request },
      );
      return response ?? { status: 'backend', message: 'Empty response.' };
    } catch (error) {
      return {
        status: 'backend',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

/**
 * P5 W1 scratch cleanup port. Fired once when the panel mounts and deliberately
 * best-effort: red-mark composites are intermediates, and a failed sweep must
 * never surface as an error or delay the board.
 */
export type InfiniteCanvasScratchPruner = (
  request: { workspacePath: string; maxAgeDays?: number },
) => Promise<void>;

export function getInfiniteCanvasScratchPruner(): InfiniteCanvasScratchPruner {
  return async request => {
    try {
      const { api } = await import('@/infrastructure/api/service-api/ApiClient');
      await api.invoke(PRUNE_CANVAS_SCRATCH_COMMAND, { request });
    } catch {
      // Housekeeping only — see the doc comment.
    }
  };
}

/**
 * P5 W7 reverse-prompt port: read a picture the owner already has and get a
 * generation prompt back.
 *
 * Behind it sits the R2 desktop command `analyze_infinite_canvas_image`, which
 * runs the owner-configured vision model directly. It deliberately does NOT go
 * through the session AI: a canvas button that burns a conversation round to
 * describe a picture, and drops the answer in the transcript rather than on
 * the card, is the thing CONTEXT.md already rules out.
 *
 * Every outcome is one of `CANVAS_IMAGE_ANALYSIS_STATUSES`; the port folds a
 * transport failure into `backend` so the card renders one shape, never a
 * thrown error and never silence.
 */
export interface InfiniteCanvasImageAnalysisRequest {
  workspacePath: string;
  /** Workspace-relative path of the picture to read. */
  relativePath: string;
  detail?: 'summary' | 'detailed';
}

/** Mirrors the Rust `CANVAS_IMAGE_ANALYSIS_STATUSES` set, in the same order. */
export const CANVAS_IMAGE_ANALYSIS_STATUSES = [
  'completed',
  'unsupported_model',
  'provider_not_configured',
  'invalid_image',
  'path_denied',
  'backend',
] as const;

export type InfiniteCanvasImageAnalysisStatus =
  (typeof CANVAS_IMAGE_ANALYSIS_STATUSES)[number];

export interface InfiniteCanvasImageAnalysisResult {
  status: InfiniteCanvasImageAnalysisStatus;
  prompt?: string;
  summary?: string;
  modelId?: string;
  message?: string;
}

export type InfiniteCanvasImageAnalyzer = (
  request: InfiniteCanvasImageAnalysisRequest,
) => Promise<InfiniteCanvasImageAnalysisResult>;

export const ANALYZE_CANVAS_IMAGE_COMMAND = 'analyze_infinite_canvas_image';

export function getInfiniteCanvasImageAnalyzer(): InfiniteCanvasImageAnalyzer {
  return async request => {
    try {
      const { api } = await import('@/infrastructure/api/service-api/ApiClient');
      const response = await api.invoke<InfiniteCanvasImageAnalysisResult>(
        ANALYZE_CANVAS_IMAGE_COMMAND,
        { request },
      );
      return response ?? { status: 'backend', message: 'Empty response.' };
    } catch (error) {
      return {
        status: 'backend',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };
}
