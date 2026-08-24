/**
 * Infinite Canvas agent-task sender port (K2 W4, PRD §2 path A).
 *
 * The canvas never talks to flow_chat directly: the shared gateway assembles
 * the task message and hands it to this injected sender port. The only
 * implementation allowed to import FlowChatManager lives in the app layer
 * (`app/components/panels/content-canvas/infinite-canvas/
 * InfiniteCanvasAgentTaskSessionSender.ts`), mirroring the short-drama
 * precedent.
 */

import type { CanvasImageOperationKind } from './InfiniteCanvasTypes';

/** Same shape as `InfiniteCanvasNode['mediaRef']`; the media truth is never copied. */
export interface InfiniteCanvasMediaRef {
  workspacePath: string;
  relativePath: string;
}

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

export interface InfiniteCanvasAgentTaskSendRequest {
  targetSessionId: string;
  /** Full task message (instruction + image list + constraints + binding JSON). */
  message: string;
  /** Short human-readable summary shown as the user message input summary. */
  inputSummary: string;
  /** Binding echoed into `userMessageMetadata.infiniteCanvasImageTask`. */
  binding: InfiniteCanvasImageBinding;
}

export type InfiniteCanvasAgentTaskSendResult =
  | { status: 'ready'; targetSessionId: string }
  | { status: 'error'; error: { message: string } };

/** Sender port; the app layer injects the flow_chat-backed implementation. */
export interface InfiniteCanvasAgentTaskSessionSender {
  sendImageGenerationTask(
    request: InfiniteCanvasAgentTaskSendRequest,
  ): Promise<InfiniteCanvasAgentTaskSendResult>;
}
