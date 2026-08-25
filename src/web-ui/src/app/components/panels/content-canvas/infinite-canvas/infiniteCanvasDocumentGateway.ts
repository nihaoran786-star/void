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
