/**
 * The infinite canvas domain, in four chains.
 *
 * Thirty files used to sit flat in this folder. The names were never the
 * problem — the suffixes already say which chain a file belongs to — so the
 * files moved and NOTHING was renamed:
 *
 *   - `document/`   the document itself: its shape, its vocabulary, and the
 *                   one service that reads and writes it on disk;
 *   - `generation/` asking for a picture: what a model can do, what a request
 *                   looks like, the gateway that sends it, and the document
 *                   commands that record a generation on a card;
 *   - `agent-ops/`  instructions arriving from an AI, and the journal that
 *                   replays the ones that arrived while the board was shut;
 *   - `media/`      pictures coming back: landing them on a card, their
 *                   variants, and the catch-up pass for jobs that finished
 *                   while the board was shut.
 *
 * This barrel is the supported entry point (`@/shared/services/infinite-canvas`)
 * and its surface is unchanged by the move, so no caller that went through it
 * had to be touched.
 */
export * from './document/InfiniteCanvasTypes';
export * from './document/InfiniteCanvasDocumentContent';
export * from './generation/infiniteCanvasGenerationCapabilities';
export * from './document/InfiniteCanvasPersistencePort';
export * from './document/ImageToolTypes';
export * from './agent-ops/InfiniteCanvasAgentTaskTypes';
export * from './media/InfiniteCanvasMediaBridge';
export * from './media/InfiniteCanvasPendingReconciliation';
export * from './media/InfiniteCanvasMediaVariants';
export * from './generation/InfiniteCanvasGenerationContent';
export * from './agent-ops/InfiniteCanvasAgentOps';
export * from './agent-ops/InfiniteCanvasOpsBridge';
export * from './agent-ops/InfiniteCanvasOpsReconciliation';
export {
  buildFinalInstruction,
  buildImageGenerationBinding,
  referenceImageLabel,
  type SessionImageGenerationGateway,
  type SessionImageGenerationInvocation,
  type SessionImageReference,
} from './generation/imageGenerationInvocation';
export {
  classifyDirectSubmitError,
  connectInfiniteCanvasDirectMediaJobEvents,
  createDirectImageGenerationGateway,
  ensureInfiniteCanvasDirectMediaJobEventForwarder,
  INFINITE_CANVAS_MEDIA_JOB_EVENT,
  SUBMIT_INFINITE_CANVAS_MEDIA_JOB_COMMAND,
  type DirectImageGenerationGatewayOptions,
  type DirectMediaJobEventSource,
  type DirectMediaJobEventTarget,
  type SubmitInfiniteCanvasMediaJobArgs,
  type SubmitInfiniteCanvasMediaJobResponse,
} from './generation/DirectImageGenerationGateway';
export {
  InfiniteCanvasDocumentService,
  defaultInfiniteCanvasDocumentId,
  INFINITE_CANVAS_WORKSPACE_DIR,
  infiniteCanvasDirectoryPath,
  infiniteCanvasDocumentFilePath,
  normalizeCanvasWorkspacePath,
  parseInfiniteCanvasDocument,
  type InfiniteCanvasDocumentServiceOptions,
  type InfiniteCanvasParseResult,
  type InfiniteCanvasPersistenceFailure,
  type InfiniteCanvasPersistenceFailureListener,
} from './document/InfiniteCanvasDocumentService';
