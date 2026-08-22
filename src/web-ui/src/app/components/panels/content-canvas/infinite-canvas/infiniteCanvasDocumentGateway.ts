/**
 * Panel-side access to the shared InfiniteCanvasDocumentService instance.
 *
 * The service is a module singleton over the desktop persistence adapter so
 * closing or collapsing the Canvas tab never drops coalesced state: pending
 * debounced writes stay owned by the service and settle on their own timer,
 * and the next mount re-loads from the same truth.
 */
import { InfiniteCanvasDocumentService } from '@/shared/services/infinite-canvas';
import { infiniteCanvasDesktopPersistence } from '@/infrastructure/services/infra/infiniteCanvasDesktopPersistence';

let sharedService: InfiniteCanvasDocumentService | undefined;

export function getInfiniteCanvasDocumentService(): InfiniteCanvasDocumentService {
  if (!sharedService) {
    sharedService = new InfiniteCanvasDocumentService(infiniteCanvasDesktopPersistence);
  }
  return sharedService;
}
