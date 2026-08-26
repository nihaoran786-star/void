/**
 * Panel-side access to the shared InfiniteCanvasDocumentService instance.
 *
 * The service is a module singleton over the desktop persistence adapter so
 * closing or collapsing the Canvas tab never drops coalesced state: pending
 * debounced writes stay owned by the service and settle on their own timer,
 * and the next mount re-loads from the same truth.
 */
import type { InfiniteCanvasMediaJobReader } from '@/shared/services/infinite-canvas';
import { InfiniteCanvasDocumentService } from '@/shared/services/infinite-canvas';
import { infiniteCanvasDesktopPersistence } from '@/infrastructure/services/infra/infiniteCanvasDesktopPersistence';

let sharedService: InfiniteCanvasDocumentService | undefined;

export function getInfiniteCanvasDocumentService(): InfiniteCanvasDocumentService {
  if (!sharedService) {
    sharedService = new InfiniteCanvasDocumentService(infiniteCanvasDesktopPersistence);
  }
  return sharedService;
}

/**
 * Read access to the persisted media batch manifests
 * (`.void/media-jobs/<batchId>.json`) for the W7 pending reconciliation —
 * the same desktop persistence adapter the document service uses.
 */
export function getInfiniteCanvasMediaJobReader(): InfiniteCanvasMediaJobReader {
  return infiniteCanvasDesktopPersistence;
}

/**
 * P4 W1 "save a copy" port: hands one absolute workspace file path to the
 * proven file-panel download lane (system Save-as dialog + the Rust
 * `export_local_file_to_path` copy). No new command and no new capability —
 * `dialog:allow-save` is already granted. The panel never imports the Tauri
 * plugin itself, so tests inject a stub through the `saveMediaAs` prop.
 */
export type InfiniteCanvasMediaSaver = (filePath: string) => Promise<void>;

export function getInfiniteCanvasMediaSaver(): InfiniteCanvasMediaSaver {
  return async filePath => {
    const { downloadWorkspaceFileToDisk } = await import(
      '@/tools/file-system/services/workspaceFileTransfer'
    );
    // Canvas media is local-only (remote workspaces stay fail-closed), so the
    // null workspace deliberately selects the local export branch. The canvas
    // has no transfer-progress surface, so progress reports are dropped.
    await downloadWorkspaceFileToDisk(filePath, null, () => undefined);
  };
}

/**
 * P5 W1 asset-writer port: the ONE way the web layer puts image bytes on disk.
 *
 * Behind it sits the R1 desktop command `write_canvas_image_bytes`, whose
 * two-prefix allowlist (`.void/infinite-canvas/scratch/`,
 * `media/input/canvas-crops/`) is the only barrier that keeps this from being
 * a general write-anywhere hole. The port never throws: a transport failure is
 * folded into the same typed `backend` status the command itself returns, so
 * the caller has exactly one shape to render.
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

/**
 * P4 W7 "show in folder" port: the existing workspace `reveal_in_explorer`
 * command, reached through a dynamic import so the panel chunk stays free of
 * the API module. Read-only — it opens the OS file browser and nothing else.
 */
export type InfiniteCanvasMediaRevealer = (filePath: string) => Promise<void>;

export function getInfiniteCanvasMediaRevealer(): InfiniteCanvasMediaRevealer {
  return async filePath => {
    const { workspaceAPI } = await import('@/infrastructure/api/service-api/WorkspaceAPI');
    await workspaceAPI.revealInExplorer(filePath);
  };
}
