/**
 * Infinite Canvas generation-task vocabulary (K2 W4, PRD §2).
 *
 * The media reference and the binding every generation task carries: what the
 * canvas says about a picture, and what it stamps on a task so the result can
 * be landed back on the right card. Deliberately free of any lane: the canvas
 * never talks to flow_chat, and nothing here knows how a task is submitted.
 */

import type {
  CanvasImageOperationKind,
  InfiniteCanvasMediaRef,
} from './InfiniteCanvasTypes';

/**
 * Same shape as `InfiniteCanvasNode['mediaRef']`; the media truth is never
 * copied. Defined in `InfiniteCanvasTypes` and re-exported here so the many
 * files that reach for it through this module keep their import path.
 */
export type { InfiniteCanvasMediaRef };

/**
 * The §3.1 binding object ("return address label"). It is embedded verbatim
 * in the task message and the model must copy it, unchanged, into the
 * `infinite_canvas` parameter of GenerateImage. The backend treats it as an
 * opaque JSON payload and flows it back on completion.
 */
export interface InfiniteCanvasImageBinding {
  workspaceId: string;
  documentId: string;
  /** Landing node: self mode = the blank card itself; derived mode = the placeholder card. */
  nodeId: string;
  resultMode: 'self' | 'derived';
  /** Derivation edge origin; required in derived mode, omitted in self mode. */
  sourceNodeId?: string;
  toolId: CanvasImageOperationKind;
  /** Front-end generated idempotent operation ID; the unique landing anchor. */
  operationId: string;
  /**
   * P3: media kind marker of a GenerateVideo binding. Image bindings omit it
   * (the Rust CanvasOp machine-assembled binding does the same), so pre-P3
   * bindings keep their exact K2 shape.
   */
  mediaKind?: 'video';
  /** Audit echo only; the prompt is fully assembled on the front end. */
  stylePresetId?: string;
  /** Reference cards in connection order; audit echo only. */
  referenceNodeIds?: string[];
}

/**
 * K3 §6.2: the second return address a generation can carry — the short-drama
 * asset that owns the card.
 *
 * "Whoever owns the data is responsible for generating it" lands as *data*,
 * not as a new permission: a card that came from short drama generates on the
 * board's own direct pipeline exactly as before, and simply files the result
 * in the asset's ledger by shipping these coordinates alongside the canvas
 * binding. The backend route they take is the one AssetAI and SplitAI have
 * always used, so no stage agent gained a capability and no fixed policy moved.
 *
 * The fields are the ones the existing lane already consumes — nothing here is
 * invented. `stage` is typed as a plain string on purpose: the canvas must not
 * import the short-drama stage union, and the neutral adapter that builds this
 * object is the only thing that knows the real values.
 */
export interface InfiniteCanvasShortDramaBinding {
  projectId: string;
  stage: string;
  artifactId: string;
  artifactHandle?: string;
  outputMediaLabel?: string;
}
