/**
 * Direct media generation gateway (2026-08-24 owner decision, supersedes the
 * K2 §2 path-A choice for canvas buttons).
 *
 * The canvas generate / regenerate / five-tool buttons no longer send a task
 * message into a session for the main AI to relay (that burned model context
 * on a mechanical hand-off). They invoke the
 * `submit_infinite_canvas_media_job` desktop command directly: the backend
 * runs the same APIMart pipeline the GenerateImage tool uses (upload local
 * references → validate → submit → background polling with the
 * `infinite_canvas` binding), with no AI in the loop.
 *
 * Result flow stays on the one existing landing lane:
 * - Submission receipt (status 'polling'): this gateway republishes it as an
 *   `agent:tool-run-event`, so the mounted InfiniteCanvasMediaBridge attaches
 *   the batch to the pending operation (attach-batch → W7 reconciliation
 *   safety net keeps working).
 * - Completion: Rust emits `infinite-canvas://media-job-event`; the forwarder
 *   below relays it onto `agent:tool-run-event` — the bridge lands the media
 *   or settles a typed failure exactly as before. Zero bridge changes.
 * - Typed submit errors map onto the K0-2 seven error kinds and roll the
 *   pending card back through the panel's existing failOperationContent path.
 *
 * The AI path (user asks in chat → GenerateImage / CanvasOp
 * begin_generation) is untouched; SessionImageGenerationGateway remains for
 * that contract surface but is no longer used by the panel.
 */
import { api } from '@/infrastructure/api/service-api/ApiClient';
import { globalEventBus } from '@/infrastructure/event-bus';
import type { StylePresetCatalog } from '@/shared/services/style-preset';
import { stylePresetCatalog } from '@/shared/services/style-preset';

import type { ImageToolErrorKind, ImageToolResult } from './ImageToolTypes';
import type {
  InfiniteCanvasImageBinding,
  InfiniteCanvasShortDramaBinding,
} from './InfiniteCanvasAgentTaskTypes';
import type { InfiniteCanvasGenerationParams } from './InfiniteCanvasTypes';
import {
  normalizeInfiniteCanvasGenerationParams,
  resolveInfiniteCanvasModelCapability,
} from './infiniteCanvasGenerationCapabilities';
import { classifyMediaErrorKind } from './InfiniteCanvasMediaBridge';
import {
  buildFinalInstruction,
  buildImageGenerationBinding,
  type SessionImageGenerationGateway,
  type SessionImageGenerationInvocation,
} from './SessionImageGenerationGateway';

export const SUBMIT_INFINITE_CANVAS_MEDIA_JOB_COMMAND = 'submit_infinite_canvas_media_job';
/** Tauri channel the Rust command emits finished batches on. */
export const INFINITE_CANVAS_MEDIA_JOB_EVENT = 'infinite-canvas://media-job-event';
const AGENT_TOOL_RUN_OBSERVER_EVENT = 'agent:tool-run-event';

/** Wire shape of the `submit_infinite_canvas_media_job` command arguments. */
export interface SubmitInfiniteCanvasMediaJobArgs {
  workspaceId: string;
  workspacePath: string;
  kind: 'image' | 'video';
  model?: string;
  prompt: string;
  /** Already-public reference URLs, in order (rare from the canvas). */
  imageUrls: string[];
  /**
   * Workspace-relative reference paths in the authoritative order: the edit
   * target (five tools) first, then references in connection order.
   */
  localReferencePaths: string[];
  n?: number;
  size?: string;
  /** P4-R1 additive: output resolution (image and video). */
  resolution?: string;
  /** P4-R1 additive: clip duration in seconds (video only). */
  duration?: number;
  /** P4-R1 additive: video aspect ratio (images use `size`). */
  aspectRatio?: string;
  infiniteCanvas: InfiniteCanvasImageBinding;
  /**
   * K3 §6.2: the short-drama coordinates of an owned card. Omitted for every
   * ordinary card, which is what keeps the request identical to the pre-K3
   * one.
   */
  shortDrama?: InfiniteCanvasShortDramaBinding;
}

export interface SubmitInfiniteCanvasMediaJobResponse {
  status: 'submitted' | 'error';
  batchId?: string;
  /** Full submission receipt (GenerateImage-result shape, binding echoed). */
  receipt?: unknown;
  error?: { code: string; message: string };
}

export interface DirectImageGenerationGatewayOptions {
  workspaceId: string;
  /** Local workspace root; the backend validates and stays inside it. */
  workspacePath: string;
  documentId: string;
  catalog?: StylePresetCatalog;
  /** Injection seams for tests; production uses api.invoke / globalEventBus. */
  invokeCommand?: (
    command: string,
    args: { request: SubmitInfiniteCanvasMediaJobArgs },
  ) => Promise<SubmitInfiniteCanvasMediaJobResponse>;
  emitToolRunEvent?: (event: Record<string, unknown>) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function failure(
  operationId: string,
  kind: ImageToolErrorKind,
  message: string,
): ImageToolResult {
  return { operationId, status: 'failed', error: { kind, message } };
}

/**
 * Maps a typed command error onto the K0-2 seven error kinds. Receipt-borne
 * errors reuse the media bridge classifier (provider_not_configured → auth,
 * safety_rejected → invalid-input, 429 → rate-limit, …); command-level codes
 * cover the pre-submission failures.
 */
export function classifyDirectSubmitError(
  error: { code: string; message: string },
  receipt: unknown,
): ImageToolErrorKind {
  if (error.code === 'invalid_input') return 'invalid-input';
  if (isRecord(receipt) && isRecord(receipt.error)) {
    return classifyMediaErrorKind(receipt.error);
  }
  return classifyMediaErrorKind({ code: error.code });
}

// —— Completion event forwarder (Rust → agent:tool-run-event) ————————————————

export interface DirectMediaJobEventSource {
  listen(event: string, callback: (payload: unknown) => void): () => void;
}

export interface DirectMediaJobEventTarget {
  emit(event: string, payload: unknown, sender?: string): boolean;
}

/**
 * K3 §6.2, the one rule that keeps the second return leg honest: a
 * `shortDrama` block only travels on an event that really did deliver a
 * picture.
 *
 * This lane labels every payload `eventType: 'Completed'` — the media bridge
 * needs that to attach a batch — but "completed" here means "the request
 * finished", not "there is a picture". Two payloads on this lane carry the
 * short-drama coordinates while carrying no picture at all:
 *
 *  1. the submission receipt, republished the moment the job is accepted, and
 *  2. a finished batch that failed, timed out, or came back empty.
 *
 * The short-drama runtime bridge reads `result.shortDrama` and treats a
 * Completed event as an agent run that finished, so either one would put the
 * asset into review over nothing and, worse, replace its picture with a
 * reference that has no file behind it. So the block is stripped unless the
 * batch has a saved asset with a real local path.
 *
 * It is done here, on the board's own lane, deliberately: `jobs.rs`'s
 * `attach_short_drama_media_result` is shared with the stage agents and is not
 * touched. Nothing about their behaviour changes.
 */
export function withShortDramaBindingOnlyWhenDelivered(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  const result = payload.result;
  if (!isRecord(result) || !isRecord(result.shortDrama)) return payload;
  const batch = isRecord(result.batch) ? result.batch : undefined;
  const assets = Array.isArray(batch?.assets) ? batch.assets : [];
  const delivered = assets.some(asset => isRecord(asset)
    && typeof asset.local_path === 'string'
    && asset.local_path.trim().length > 0);
  if (delivered) return payload;
  const { shortDrama: _dropped, ...rest } = result;
  return { ...payload, result: rest };
}

/**
 * Relays `infinite-canvas://media-job-event` payloads (already shaped like
 * agent tool-run observer events) onto the front-end event bus, where the
 * InfiniteCanvasMediaBridge picks them up unchanged.
 *
 * "Unchanged" still holds for everything the canvas reads: only a short-drama
 * block on an empty batch is removed (see above), and the `infiniteCanvas`
 * binding is never touched.
 */
export function connectInfiniteCanvasDirectMediaJobEvents(
  source: DirectMediaJobEventSource = api,
  target: DirectMediaJobEventTarget = globalEventBus,
): () => void {
  return source.listen(INFINITE_CANVAS_MEDIA_JOB_EVENT, payload => {
    target.emit(
      AGENT_TOOL_RUN_OBSERVER_EVENT,
      withShortDramaBindingOnlyWhenDelivered(payload),
      'InfiniteCanvasDirectGateway',
    );
  });
}

let forwarderStarted = false;

/** Starts the process-wide forwarder once (idempotent). */
export function ensureInfiniteCanvasDirectMediaJobEventForwarder(): void {
  if (forwarderStarted) return;
  forwarderStarted = true;
  connectInfiniteCanvasDirectMediaJobEvents();
}

// —— P4 generation parameters ————————————————————————————————————————————

type GenerationParamFields = Partial<Pick<
  SubmitInfiniteCanvasMediaJobArgs,
  'model' | 'size' | 'resolution' | 'duration' | 'aspectRatio'
>>;

/**
 * Turns a card's stored generation parameters into request fields (P4 W3).
 *
 * Clamped once more against the model's allow list right before dispatch —
 * the document may still hold values written before a capability change, and
 * plan §2.2 wants that second guard. Every field is omitted when unset, so a
 * card with no parameters produces exactly the pre-P4 request.
 *
 * The aspect ratio of a video travels in whichever request field the chosen
 * model accepts (`aspectRatio` for Omni-Flash-Ext / kling, `size` for
 * seedance — see the capability table).
 */
export function buildGenerationParamFields(
  params: InfiniteCanvasGenerationParams | undefined,
  kind: 'image' | 'video',
): GenerationParamFields {
  if (!params) return {};
  const normalized = normalizeInfiniteCanvasGenerationParams(params, kind);
  const fields: GenerationParamFields = {};
  if (normalized.model !== undefined) fields.model = normalized.model;
  if (normalized.resolution !== undefined) fields.resolution = normalized.resolution;
  if (kind === 'image') {
    if (normalized.size !== undefined) fields.size = normalized.size;
    return fields;
  }
  if (normalized.duration !== undefined) fields.duration = normalized.duration;
  if (normalized.aspectRatio !== undefined) {
    const capability = resolveInfiniteCanvasModelCapability('video', normalized.model);
    const field = capability.mediaKind === 'video' ? capability.aspectRatioField : 'aspectRatio';
    fields[field] = normalized.aspectRatio;
  }
  return fields;
}

/**
 * Batch size to request for an image generation (P4 W4).
 *
 * The stored `n` is clamped against the chosen model's own `nMax` (and the
 * schema ceiling of 4) one last time here — a card that stored `n: 4` and was
 * later switched to a single-image model must not send 4. With no parameters
 * at all this returns 1, i.e. the pre-P4 request byte for byte.
 */
export function resolveInfiniteCanvasBatchSize(
  params: InfiniteCanvasGenerationParams | undefined,
): number {
  if (!params) return 1;
  return normalizeInfiniteCanvasGenerationParams(params, 'image').n ?? 1;
}

// —— Gateway ————————————————————————————————————————————————————————————————

export function createDirectImageGenerationGateway(
  options: DirectImageGenerationGatewayOptions,
): SessionImageGenerationGateway {
  const catalog = options.catalog ?? stylePresetCatalog;
  const invokeCommand = options.invokeCommand
    ?? ((command: string, args: { request: SubmitInfiniteCanvasMediaJobArgs }) =>
      api.invoke<SubmitInfiniteCanvasMediaJobResponse>(command, args));
  const emitToolRunEvent = options.emitToolRunEvent
    ?? ((event: Record<string, unknown>) => {
      globalEventBus.emit(AGENT_TOOL_RUN_OBSERVER_EVENT, event, 'InfiniteCanvasDirectGateway');
    });
  const resultsByOperationId = new Map<string, ImageToolResult>();

  return {
    async invoke(invocation: SessionImageGenerationInvocation): Promise<ImageToolResult> {
      const recorded = resultsByOperationId.get(invocation.operationId);
      if (recorded) return recorded;

      const record = (result: ImageToolResult): ImageToolResult => {
        resultsByOperationId.set(invocation.operationId, result);
        return result;
      };

      // Same invocation contract the session gateway enforced (K2/P3 rules).
      if (invocation.resultMode === 'derived' && !invocation.sourceNodeId) {
        return record(failure(
          invocation.operationId,
          'invalid-input',
          'A derived operation requires a sourceNodeId.',
        ));
      }
      if (invocation.mediaKind === 'video' && invocation.kind !== 'generate') {
        return record(failure(
          invocation.operationId,
          'invalid-input',
          'Video generation only supports the generate operation.',
        ));
      }
      if (invocation.mediaKind === 'video' && invocation.editTargetMediaRef) {
        return record(failure(
          invocation.operationId,
          'invalid-input',
          'A video generation task cannot carry an edit target.',
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

      // §2.1 prompt assembly stays on the front end: user prompt + @图N
      // reference table + style block; the backend receives a final prompt.
      const preset = invocation.stylePresetId
        ? catalog.getById(invocation.stylePresetId)
        : undefined;
      const finalInstruction = buildFinalInstruction(
        invocation.prompt,
        invocation.references,
        preset,
      );
      const binding = buildImageGenerationBinding(invocation, options);
      const kind = invocation.mediaKind === 'video' ? 'video' as const : 'image' as const;
      const localReferencePaths = [
        ...(invocation.editTargetMediaRef ? [invocation.editTargetMediaRef.relativePath] : []),
        ...invocation.references.map(reference => reference.mediaRef.relativePath),
      ];
      const request: SubmitInfiniteCanvasMediaJobArgs = {
        workspaceId: options.workspaceId,
        workspacePath: options.workspacePath,
        kind,
        prompt: finalInstruction,
        imageUrls: [],
        localReferencePaths,
        // P4 W4: the image batch size comes from the card's own parameters,
        // clamped to the model's nMax; it stays 1 when nothing was chosen.
        // Video count is not a provider concept on this lane.
        ...(kind === 'image'
          ? { n: resolveInfiniteCanvasBatchSize(invocation.generationParams) }
          : {}),
        ...buildGenerationParamFields(invocation.generationParams, kind),
        infiniteCanvas: binding,
        // K3 §6.2: an owned card files its result in its asset's ledger as
        // well as on the board. Both bindings ride the same request and are
        // attached independently by the backend; see the module note above.
        ...(invocation.shortDrama ? { shortDrama: invocation.shortDrama } : {}),
      };

      let response: SubmitInfiniteCanvasMediaJobResponse;
      try {
        response = await invokeCommand(SUBMIT_INFINITE_CANVAS_MEDIA_JOB_COMMAND, { request });
      } catch (error) {
        // Not recorded: transport failures are retryable with the same
        // operationId once the backend is reachable again.
        return failure(
          invocation.operationId,
          'backend',
          error instanceof Error ? error.message : String(error),
        );
      }

      if (response.status !== 'submitted') {
        const typed = response.error ?? {
          code: 'backend',
          message: 'Media generation submission failed.',
        };
        // Not recorded either: typed failures (missing token, quota, …) must
        // stay retryable after the user fixes the cause.
        return failure(
          invocation.operationId,
          classifyDirectSubmitError(typed, response.receipt),
          typed.message,
        );
      }

      // Republish the submission receipt on the shared landing lane so the
      // media bridge attaches the batch to the pending operation (the same
      // attach-batch behaviour the session tool receipt produced).
      if (isRecord(response.receipt)) {
        emitToolRunEvent(withShortDramaBindingOnlyWhenDelivered({
          sessionId: '',
          eventType: 'Completed',
          toolId: `infinite-canvas-direct:${invocation.operationId}`,
          toolName: kind === 'video' ? 'GenerateVideo' : 'GenerateImage',
          // The receipt echoes the short-drama coordinates back; a submission
          // has no picture, so the guard above removes them here too. Without
          // it, pressing generate would put the asset into review before the
          // provider had drawn a single pixel.
          result: response.receipt,
        }) as Record<string, unknown>);
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
