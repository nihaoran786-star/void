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
 * P4 W6: what a delete request is actually about to remove.
 *
 * The counts drive the one confirmation the user sees. Two rules from plan
 * §2.5 are encoded in `classifyDeletionTargets` and nowhere else:
 *
 * - Cards that carry a `mediaRef`, or that are mid-generation, make the whole
 *   request confirmable — one dialog for the batch, never one per card.
 * - Group nodes are not deletable through the panel in P4 (they have no UI at
 *   all), so they are dropped from the request rather than silently removed.
 *
 * Deleting a card never touches the referenced file: the media truth lives in
 * Workspace Media and the canvas only ever held a reference to it.
 */
export interface InfiniteCanvasDeletionSummary {
  /** The ids that will actually be removed (existing, non-group). */
  nodeIds: string[];
  /** Of those, how many carry a mediaRef. */
  mediaCount: number;
  /** Of those, how many have a generation still running. */
  pendingCount: number;
  /** Of those, how many are neither — blank, text, or a failed placeholder. */
  plainCount: number;
  /** True when at least one card has media or is mid-generation. */
  requiresConfirmation: boolean;
}

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
