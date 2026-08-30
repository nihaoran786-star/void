/**
 * The shape of one canvas generation request, and the two pieces of text and
 * JSON every submission lane must assemble from it (K2 W4, PRD §2 / §3.1).
 *
 * This file owns no lane of its own. It declares `SessionImageGenerationInvocation`
 * — what the panel hands a gateway for all three canvas entry points (blank-card
 * text-to-image, regenerate-on-a-card, and the five image tools) — plus the §2.1
 * final instruction (style block + @图N reference table) and the §3.1 binding.
 * The live submission lane is `DirectImageGenerationGateway`, which calls both
 * builders so its binding stays byte-identical to anything else that might send.
 */

import type { StylePreset } from '@/shared/services/style-preset';

import type { ImageToolResult } from '../document/ImageToolTypes';
import type {
  CanvasImageOperationKind,
  InfiniteCanvasGenerationMediaKind,
  InfiniteCanvasGenerationParams,
} from '../document/InfiniteCanvasTypes';
import type {
  InfiniteCanvasImageBinding,
  InfiniteCanvasMediaRef,
  InfiniteCanvasShortDramaBinding,
} from '../agent-ops/InfiniteCanvasAgentTaskTypes';

/** One reference (垫图) image, in authoritative connection order (1-based). */
export interface SessionImageReference {
  order: number;
  nodeId: string;
  mediaRef: InfiniteCanvasMediaRef;
}

export interface SessionImageGenerationInvocation {
  /** Front-end generated idempotent operation ID. */
  operationId: string;
  /** 'generate' (text-to-image / regenerate) or one of the five tool IDs. */
  kind: CanvasImageOperationKind;
  /**
   * P3: which media the task produces. 'video' stamps the binding with
   * `mediaKind: 'video'`; absent defaults to 'image' and reproduces the K2
   * request byte-for-byte. Video is only legal with kind 'generate' (the five
   * tools stay image-only).
   */
  mediaKind?: InfiniteCanvasGenerationMediaKind;
  resultMode: 'self' | 'derived';
  /** Landing node: self = the blank card itself, derived = the placeholder card. */
  nodeId: string;
  /** Derivation origin; required in derived mode. */
  sourceNodeId?: string;
  /** User prompt (generate) or the completed instruction template (five tools). */
  prompt: string;
  stylePresetId?: string;
  /**
   * P4: the card's generation parameters (model / aspect ratio / resolution /
   * batch size / duration).
   */
  generationParams?: InfiniteCanvasGenerationParams;
  /** Reference cards in connection order (§3.2 collectRefs discipline). */
  references: readonly SessionImageReference[];
  /**
   * Edit object of a five-tool operation: the source card's image, listed
   * FIRST in image_urls. Never set for 'generate'.
   */
  editTargetMediaRef?: InfiniteCanvasMediaRef;
  /**
   * K3 §6.2: the short-drama asset this generation belongs to, when the card
   * it lands on is the one that came from short drama. Absent — which is every
   * ordinary card and every derived card — reproduces the pre-K3 request.
   */
  shortDrama?: InfiniteCanvasShortDramaBinding;
}

export interface SessionImageGenerationGateway {
  invoke(invocation: SessionImageGenerationInvocation): Promise<ImageToolResult>;
}

const CHINESE_ORDINALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'] as const;

/** 图一…图十, then a plain 图11 fallback beyond ten references. */
export function referenceImageLabel(order: number): string {
  const ordinal = CHINESE_ORDINALS[order - 1];
  return ordinal ? `图${ordinal}` : `图${order}`;
}

/** §2.1 final instruction: user prompt + reference table + style block. */
export function buildFinalInstruction(
  prompt: string,
  references: readonly SessionImageReference[],
  preset: StylePreset | undefined,
): string {
  let instruction = prompt;
  if (references.length > 0) {
    const table = references
      .map(reference => `@${referenceImageLabel(reference.order)}=第${reference.order}张参考图`)
      .join(', ');
    instruction += `\n\n参考图对照表：${table}`;
  }
  if (preset) {
    const stylePrompt = preset.promptTemplate ?? preset.prompt;
    if (stylePrompt) {
      instruction += `\n\n风格要求：${stylePrompt}`;
      if (preset.promptSuffix) instruction += `\n${preset.promptSuffix}`;
      if (preset.guidance) instruction += `\n注意：${preset.guidance}`;
    }
  }
  return instruction;
}

/**
 * The §3.1 binding assembly (2026-08-24 direct-path revision): every
 * submission lane must produce byte-identical bindings so the media bridge
 * lands results the same way regardless of the lane.
 */
export function buildImageGenerationBinding(
  invocation: SessionImageGenerationInvocation,
  options: { workspaceId: string; documentId: string },
): InfiniteCanvasImageBinding {
  return {
    workspaceId: options.workspaceId,
    documentId: options.documentId,
    nodeId: invocation.nodeId,
    resultMode: invocation.resultMode,
    ...(invocation.resultMode === 'derived' && invocation.sourceNodeId
      ? { sourceNodeId: invocation.sourceNodeId }
      : {}),
    toolId: invocation.kind,
    operationId: invocation.operationId,
    // Image bindings stay in their exact K2 shape; only video adds the marker
    // (mirrors the Rust CanvasOp machine-assembled binding).
    ...(invocation.mediaKind === 'video' ? { mediaKind: 'video' as const } : {}),
    ...(invocation.stylePresetId ? { stylePresetId: invocation.stylePresetId } : {}),
    ...(invocation.references.length > 0
      ? { referenceNodeIds: invocation.references.map(reference => reference.nodeId) }
      : {}),
  };
}
