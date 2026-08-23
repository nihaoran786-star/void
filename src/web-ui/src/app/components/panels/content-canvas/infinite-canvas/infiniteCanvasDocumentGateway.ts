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
