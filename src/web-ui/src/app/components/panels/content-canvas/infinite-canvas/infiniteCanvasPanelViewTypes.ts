/**
 * The shapes the panel's small surfaces are told about, and nothing else.
 *
 * The confirmation dialog needs to know what a delete request covers; the task
 * queue needs to know what one running generation looks like. Both are now
 * declared beside the command that computes them, in the canvas domain:
 * `InfiniteCanvasDeletionSummary` next to `classifyDeletionTargets`, and
 * `InfiniteCanvasGenerationTask` next to `collectGenerationTasks`.
 *
 * This file stays as the door those two surfaces have always used, so neither
 * had to be touched by the move.
 *
 * Types only - no logic, no React, no imports outside the canvas contract.
 */
export type {
  InfiniteCanvasDeletionSummary,
  InfiniteCanvasGenerationTask,
} from '@/shared/services/infinite-canvas';
