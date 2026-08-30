/**
 * Panel-side access to the shared services the Infinite Canvas panel needs.
 *
 * This file is a shell and nothing else: it names the ports the panel binds
 * and hands back the one instance of each. No desktop command is issued here.
 * The three that used to be — `write_canvas_image_bytes`,
 * `prune_canvas_scratch` and `analyze_infinite_canvas_image` — now live in
 * `@/infrastructure/services/infra/infiniteCanvasDesktopCommands`, which is
 * where an adapter belongs; the panel only ever sees the port.
 *
 * The export names and shapes are deliberately unchanged, because panel tests
 * mock this module by path (`vi.mock('./infiniteCanvasDocumentGateway')`) and
 * some of those mocks deliberately leave ports out.
 *
 * The document service is a module singleton over the desktop persistence
 * adapter so closing or collapsing the Canvas tab never drops coalesced state:
 * pending debounced writes stay owned by the service and settle on their own
 * timer, and the next mount re-loads from the same truth.
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
 * The three desktop-command ports, re-exported so the panel keeps one place to
 * look and the tests keep one module to mock. Every implementation is in the
 * infra adapter; nothing below this comment does any work.
 */
export {
  ANALYZE_CANVAS_IMAGE_COMMAND,
  CANVAS_IMAGE_ANALYSIS_STATUSES,
  PRUNE_CANVAS_SCRATCH_COMMAND,
  WRITE_CANVAS_IMAGE_BYTES_COMMAND,
  getInfiniteCanvasAssetWriter,
  getInfiniteCanvasImageAnalyzer,
  getInfiniteCanvasScratchPruner,
} from '@/infrastructure/services/infra/infiniteCanvasDesktopCommands';

export type {
  InfiniteCanvasAssetWriteRequest,
  InfiniteCanvasAssetWriteResult,
  InfiniteCanvasAssetWriter,
  InfiniteCanvasImageAnalysisRequest,
  InfiniteCanvasImageAnalysisResult,
  InfiniteCanvasImageAnalysisStatus,
  InfiniteCanvasImageAnalyzer,
  InfiniteCanvasScratchPruner,
} from '@/infrastructure/services/infra/infiniteCanvasDesktopCommands';

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
