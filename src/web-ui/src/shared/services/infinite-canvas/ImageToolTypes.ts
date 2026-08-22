/**
 * Image tool contract (K0-2 of the Infinite Canvas & Media Tools
 * specification, docs/features/infinite-canvas-and-media-tools-prd.md §3).
 *
 * Phase 1 ships the typed contract and an explicit `unavailable` placeholder
 * only: no provider clients, no credentials, no network calls. Tool semantics
 * are absorbed from the MIT-licensed kunpeng `imageTools.ts` definitions
 * (idea only, code rewritten; see /THIRD-PARTY-NOTICES.md), including the
 * derive-new-node-never-overwrite invariant.
 */

export type ImageToolId = 'upscale' | 'expand' | 'inpaint' | 'erase' | 'matting';

export interface ImageToolDefinition {
  toolId: ImageToolId;
  /** i18n key; the UI never hardcodes tool copy. */
  labelKey: string;
  /** Prefilled instruction; 【】 placeholders await user completion. */
  instructionTemplate: string;
  /** Advisory only; never binds a provider. */
  engineHint?: string;
  /** Whether the tool may run without confirmation. Always false in phase 1. */
  autoRun: boolean;
}

export type ImageToolErrorKind =
  | 'unavailable'
  | 'auth'
  | 'rate-limit'
  | 'timeout'
  | 'invalid-input'
  | 'backend'
  | 'cancelled';

export interface ImageToolResult {
  /** Idempotent operation ID: re-submitting it must not execute twice. */
  operationId: string;
  status: 'succeeded' | 'failed';
  error?: { kind: ImageToolErrorKind; message: string };
  /**
   * ID of the newly derived node on success. Every image operation derives a
   * new version node; the source node and its mediaRef are never modified.
   */
  derivedNodeId?: string;
}

export interface ImageToolInvocation {
  operationId: string;
  toolId: ImageToolId;
  sourceNodeId: string;
}

export interface ImageToolGateway {
  invoke(invocation: ImageToolInvocation): Promise<ImageToolResult>;
}

/** The five phase-1 tools, in menu order. */
export const IMAGE_TOOL_DEFINITIONS: readonly ImageToolDefinition[] = [
  {
    toolId: 'upscale',
    labelKey: 'infiniteCanvas.tools.upscale',
    instructionTemplate: 'Upscale this image to 【target resolution】 while preserving detail.',
    autoRun: false,
  },
  {
    toolId: 'expand',
    labelKey: 'infiniteCanvas.tools.expand',
    instructionTemplate: 'Expand the canvas towards 【direction】 and fill it with 【scene description】.',
    autoRun: false,
  },
  {
    toolId: 'inpaint',
    labelKey: 'infiniteCanvas.tools.inpaint',
    instructionTemplate: 'Repaint the selected region as 【replacement content】.',
    autoRun: false,
  },
  {
    toolId: 'erase',
    labelKey: 'infiniteCanvas.tools.erase',
    instructionTemplate: 'Erase 【object to remove】 and reconstruct the background.',
    autoRun: false,
  },
  {
    toolId: 'matting',
    labelKey: 'infiniteCanvas.tools.matting',
    instructionTemplate: 'Cut out 【subject】 with a transparent background.',
    autoRun: false,
  },
];
