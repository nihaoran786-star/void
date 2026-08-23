/**
 * Session-backed image generation gateway (K2 W4, PRD §2 path A).
 *
 * The single submission lane for all three canvas entry points — blank-card
 * text-to-image, regenerate-on-a-card, and the five image tools. It assembles
 * the §2.1 final instruction (style block + @图N reference table), the §2.2
 * hard constraints for the model (UploadMediaImage first, image_urls order,
 * copy the binding verbatim), and the §3.1 binding JSON, then sends the
 * message through the injected session sender. There is no second submission
 * pipeline: the five-tool `ImageToolGateway` below is a thin adapter over
 * this gateway.
 *
 * Target session: the canvas surface's sourceSessionId first, falling back to
 * the currently active session; with neither, a typed `invalid-input` failure
 * is returned (never a silent no-op).
 */

import type { StylePreset, StylePresetCatalog } from '@/shared/services/style-preset';
import { stylePresetCatalog } from '@/shared/services/style-preset';

import type {
  ImageToolErrorKind,
  ImageToolGateway,
  ImageToolInvocation,
  ImageToolResult,
} from './ImageToolTypes';
import type { CanvasImageOperationKind } from './InfiniteCanvasTypes';
import type {
  InfiniteCanvasAgentTaskSessionSender,
  InfiniteCanvasImageBinding,
  InfiniteCanvasMediaRef,
} from './InfiniteCanvasAgentTaskTypes';

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
  resultMode: 'self' | 'derived';
  /** Landing node: self = the blank card itself, derived = the placeholder card. */
  nodeId: string;
  /** Derivation origin; required in derived mode. */
  sourceNodeId?: string;
  /** User prompt (generate) or the completed instruction template (five tools). */
  prompt: string;
  stylePresetId?: string;
  /** Reference cards in connection order (§3.2 collectRefs discipline). */
  references: readonly SessionImageReference[];
  /**
   * Edit object of a five-tool operation: the source card's image, listed
   * FIRST in image_urls. Never set for 'generate'.
   */
  editTargetMediaRef?: InfiniteCanvasMediaRef;
}

export interface SessionImageGenerationGateway {
  invoke(invocation: SessionImageGenerationInvocation): Promise<ImageToolResult>;
}

export interface SessionImageGenerationGatewayOptions {
  workspaceId: string;
  documentId: string;
  sender: InfiniteCanvasAgentTaskSessionSender;
  /** Canvas surface presentation metadata sourceSessionId; preferred target. */
  getSourceSessionId?: () => string | undefined;
  /** Fallback target when the source session is gone (e.g. restored tab). */
  getActiveSessionId?: () => string | undefined;
  catalog?: StylePresetCatalog;
}

const CHINESE_ORDINALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'] as const;

/** 图一…图十, then a plain 图11 fallback beyond ten references. */
export function referenceImageLabel(order: number): string {
  const ordinal = CHINESE_ORDINALS[order - 1];
  return ordinal ? `图${ordinal}` : `图${order}`;
}

function failure(
  operationId: string,
  kind: ImageToolErrorKind,
  message: string,
): ImageToolResult {
  return { operationId, status: 'failed', error: { kind, message } };
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

function buildImageInputList(invocation: SessionImageGenerationInvocation): string {
  const lines: string[] = [];
  let index = 0;
  if (invocation.editTargetMediaRef) {
    index += 1;
    lines.push(`${index}. 编辑对象：${invocation.editTargetMediaRef.relativePath}`);
  }
  for (const reference of invocation.references) {
    index += 1;
    lines.push(
      `${index}. 参考${referenceImageLabel(reference.order)}：${reference.mediaRef.relativePath}`,
    );
  }
  if (lines.length === 0) {
    return '图片输入清单：无（纯文生图，image_urls 传空数组）。';
  }
  return [
    '图片输入清单（image_urls 必须严格按此顺序，编辑对象在前、参考图按连线顺序在后）：',
    ...lines,
  ].join('\n');
}

function buildBinding(
  invocation: SessionImageGenerationInvocation,
  options: Pick<SessionImageGenerationGatewayOptions, 'workspaceId' | 'documentId'>,
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
    ...(invocation.stylePresetId ? { stylePresetId: invocation.stylePresetId } : {}),
    ...(invocation.references.length > 0
      ? { referenceNodeIds: invocation.references.map(reference => reference.nodeId) }
      : {}),
  };
}

/** §2.2 task message: instruction + input list + hard constraints + binding JSON. */
export function buildImageGenerationTaskMessage(
  invocation: SessionImageGenerationInvocation,
  finalInstruction: string,
  binding: InfiniteCanvasImageBinding,
): string {
  return [
    '请处理这个无限画布出图任务。',
    '',
    '任务指令：',
    finalInstruction,
    '',
    buildImageInputList(invocation),
    '',
    '执行要求（必须严格遵守）：',
    '1. 图片输入清单中凡是本地 workspace 相对路径的图片，先用 UploadMediaImage（path = 该相对路径）取得公网 URL；已是 http(s) URL 的引用直接使用，不要重复上传。',
    '2. 再调用 GenerateImage：prompt 使用上面的任务指令原文；image_urls 严格按图片输入清单的顺序填入取得的 URL（纯文生图时传空数组）；n 固定为 1。',
    '3. 将下面的绑定 JSON 原样复制到 GenerateImage 的 infinite_canvas 参数，一字不改：',
    JSON.stringify(binding, null, 2),
    '4. 不要改写、合并或拆分任务指令；如任务不合理请直接回复说明原因。',
  ].join('\n');
}

export function createSessionImageGenerationGateway(
  options: SessionImageGenerationGatewayOptions,
): SessionImageGenerationGateway {
  const catalog = options.catalog ?? stylePresetCatalog;
  const resultsByOperationId = new Map<string, ImageToolResult>();

  return {
    async invoke(invocation) {
      const recorded = resultsByOperationId.get(invocation.operationId);
      if (recorded) return recorded;

      const record = (result: ImageToolResult): ImageToolResult => {
        resultsByOperationId.set(invocation.operationId, result);
        return result;
      };

      if (invocation.resultMode === 'derived' && !invocation.sourceNodeId) {
        return record(failure(
          invocation.operationId,
          'invalid-input',
          'A derived operation requires a sourceNodeId.',
        ));
      }
      if (invocation.kind !== 'generate' && invocation.resultMode !== 'derived') {
        return record(failure(
          invocation.operationId,
          'invalid-input',
          'Image tool operations always derive a new card.',
        ));
      }
      if (invocation.kind !== 'generate' && !invocation.editTargetMediaRef) {
        return record(failure(
          invocation.operationId,
          'invalid-input',
          'An image tool operation requires the source image as its edit target.',
        ));
      }

      const targetSessionId = options.getSourceSessionId?.() ?? options.getActiveSessionId?.();
      if (!targetSessionId) {
        // Do not record: once a session becomes available, a retry with the
        // same operationId must be able to dispatch.
        return failure(
          invocation.operationId,
          'invalid-input',
          'No target session is available; open the canvas from a session first.',
        );
      }

      const preset = invocation.stylePresetId
        ? catalog.getById(invocation.stylePresetId)
        : undefined;
      const finalInstruction = buildFinalInstruction(
        invocation.prompt,
        invocation.references,
        preset,
      );
      const binding = buildBinding(invocation, options);
      const message = buildImageGenerationTaskMessage(invocation, finalInstruction, binding);

      const sent = await options.sender.sendImageGenerationTask({
        targetSessionId,
        message,
        inputSummary: `无限画布出图任务：${invocation.kind} → ${invocation.nodeId}`,
        binding,
      });
      if (sent.status === 'error') {
        // Not recorded either: dispatch never happened, so a retry is legal.
        return failure(invocation.operationId, 'backend', sent.error.message);
      }

      return record({
        operationId: invocation.operationId,
        status: 'succeeded',
        // Self mode lands in the card itself, so this is the card's own ID.
        derivedNodeId: invocation.nodeId,
      });
    },
  };
}

/**
 * Context a five-tool invocation still needs beyond `ImageToolInvocation`:
 * the panel resolves it from the current document at dispatch time (W6).
 */
export interface SessionImageToolDispatchContext {
  /** Placeholder card created at dispatch (W2 beginDerivedOperationContent). */
  derivedNodeId: string;
  /** Instruction template with all 【】 placeholders completed. */
  instruction: string;
  /** The source card's image; first entry of image_urls. */
  editTargetMediaRef: InfiniteCanvasMediaRef;
  references: readonly SessionImageReference[];
  stylePresetId?: string;
}

export type SessionImageToolInvocationResolution =
  | { status: 'ok'; context: SessionImageToolDispatchContext }
  | { status: 'error'; error: { kind: ImageToolErrorKind; message: string } };

/**
 * The five-tool `ImageToolGateway` as a thin adapter over the session
 * gateway — the contract-mandated single submission lane (§4-W4). The
 * resolver supplies the document-derived context; everything else is a
 * straight pass-through.
 */
export function createSessionImageToolGateway(
  gateway: SessionImageGenerationGateway,
  resolveInvocation: (invocation: ImageToolInvocation) => SessionImageToolInvocationResolution,
): ImageToolGateway {
  return {
    async invoke(invocation) {
      const resolved = resolveInvocation(invocation);
      if (resolved.status === 'error') {
        return { operationId: invocation.operationId, status: 'failed', error: resolved.error };
      }
      return gateway.invoke({
        operationId: invocation.operationId,
        kind: invocation.toolId,
        resultMode: 'derived',
        nodeId: resolved.context.derivedNodeId,
        sourceNodeId: invocation.sourceNodeId,
        prompt: resolved.context.instruction,
        stylePresetId: resolved.context.stylePresetId,
        references: resolved.context.references,
        editTargetMediaRef: resolved.context.editTargetMediaRef,
      });
    },
  };
}
