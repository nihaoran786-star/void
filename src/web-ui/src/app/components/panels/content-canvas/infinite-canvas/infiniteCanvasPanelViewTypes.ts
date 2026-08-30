/**
 * The shapes the panel's small surfaces are told about, and nothing else.
 *
 * The confirmation dialog needs to know what a delete request covers; the task
 * queue needs to know what one running generation looks like. Both used to
 * read those two shapes out of `infiniteCanvasPanelModel`, which meant a
 * hundred-line dialog pulled in the whole six-hundred-line projection layer to
 * learn the name of a type. The declarations live here; the projection module
 * imports them, computes them, and re-exports them, so every existing import
 * of these names still resolves.
 *
 * Types only — no logic, no React, no imports outside the canvas contract.
 */
import type {
  ImageToolErrorKind,
  InfiniteCanvasNode,
} from '@/shared/services/infinite-canvas';

/**
 * What a delete request is about to remove. Declared beside the command that
 * computes it (`classifyDeletionTargets`), and re-exported here so the dialog
 * keeps the import it has always had.
 */
export type { InfiniteCanvasDeletionSummary } from '@/shared/services/infinite-canvas';

/** One row of the task queue: an in-flight or failed generation on this canvas. */
export interface InfiniteCanvasGenerationTask {
  nodeId: string;
  operationId: string;
  toolId: NonNullable<InfiniteCanvasNode['generation']>['toolId'];
  status: 'pending' | 'failed';
  mediaKind: 'image' | 'video';
  errorKind?: ImageToolErrorKind;
  /** First line of the card's prompt, for the row label. May be empty. */
  promptLine: string;
}
