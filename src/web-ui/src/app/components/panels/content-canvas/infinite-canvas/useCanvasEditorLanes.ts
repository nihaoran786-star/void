/**
 * P5 / P6: the three board-filling editors — crop, red marks, outpainting —
 * and the chains that run when their send button is pressed.
 *
 * All three share one shape: write the picture the editor produced to disk
 * FIRST, and only once the bytes have landed touch the document. Crop stops
 * there (it is a local derivation, PRD §3.8); mask and expand carry on into a
 * paid submission whose edit target is the composite that was just written.
 * A failed write must never reach a paid submission.
 *
 * The chains reach the outside world only through the ports the panel injects:
 * `commit`, the asset writer and `submitOperation`. Nothing here talks to a
 * gateway, a command or the disk on its own.
 */
import React from 'react';

import type {
  CanvasExpandInsets,
  ImageToolErrorKind,
  ImageToolId,
  InfiniteCanvasDocument,
  InfiniteCanvasMutator,
  MaskImageToolId,
  SessionImageGenerationInvocation,
} from '@/shared/services/infinite-canvas';
import {
  buildExpandInstruction,
  buildMaskInstruction,
  EXPAND_DIRECTIVE_KEY,
  maskDirectiveKey,
} from '@/shared/services/infinite-canvas';

import type { InfiniteCanvasAssetWriter } from './infiniteCanvasDocumentGateway';
import {
  canvasCropRelativePath,
  canvasScratchRelativePath,
} from './infiniteCanvasImageRaster';
import type { InfiniteCanvasMediaRef } from './InfiniteCanvasNodes';
import {
  applyLocalDerivedMedia,
  beginDerivedOperationContent,
} from './infiniteCanvasPanelModel';
import { setNodePromptContent } from './infiniteCanvasGenerationModel';

/** P5 W4: the card whose picture is open in the mask editor, and for which tool. */
export interface MaskEditorRequest {
  nodeId: string;
  toolId: MaskImageToolId;
  mediaRef: InfiniteCanvasMediaRef;
}

/** P5 W2: the card whose picture is open in the crop editor. */
export interface CropEditorRequest {
  nodeId: string;
  mediaRef: InfiniteCanvasMediaRef;
}

/** P6: the card whose picture is open in the outpainting editor. */
export interface ExpandEditorRequest {
  nodeId: string;
  mediaRef: InfiniteCanvasMediaRef;
}

/** The panel's notice line, as these lanes need to write to it. */
export interface CanvasEditorNotice {
  messageKey: string;
  errorKind?: ImageToolErrorKind;
  busy?: boolean;
}

/**
 * Why a canvas PNG did not reach the disk, in words the owner can act on.
 *
 * P5 review P11: every non-`written` status used to collapse into one
 * "saving failed, this is a backend problem" line. `invalid_input` is what the
 * command reports for a payload it will not take — in practice a picture too
 * large to send — and telling someone to retry a picture that will never fit
 * is worse than telling them nothing.
 */
export function assetWriteNotice(
  lane: 'mask' | 'crop' | 'expand',
  status: 'invalid_input' | 'path_denied' | 'backend',
): CanvasEditorNotice {
  if (status === 'invalid_input') {
    return { messageKey: `infiniteCanvas.${lane}.writeTooLarge`, errorKind: 'invalid-input' };
  }
  if (status === 'path_denied') {
    return { messageKey: `infiniteCanvas.${lane}.writeDenied`, errorKind: 'invalid-input' };
  }
  return { messageKey: `infiniteCanvas.${lane}.writeFailed`, errorKind: 'backend' };
}

/** The ids and the file path one editor press will use. */
export interface CanvasEditorLanePlan {
  derivedNodeId: string;
  edgeId: string;
  relativePath: string;
}

/**
 * Crop's plan. The cropped picture is the owner's work, so it lands beside the
 * picture it came from rather than in scratch.
 */
export function planCropEditorLane(
  operationId: string,
  sourceRelativePath: string,
  now: number,
): CanvasEditorLanePlan {
  return {
    derivedNodeId: `node-${operationId}`,
    edgeId: `edge-${operationId}`,
    relativePath: canvasCropRelativePath(sourceRelativePath, now),
  };
}

/**
 * The composite lanes' plan.
 *
 * Keyed on the operation id: re-submitting one operation overwrites one file
 * rather than piling up, and it lands nowhere near the four media library scan
 * roots.
 */
export function planCompositeEditorLane(
  operationId: string,
  lane: 'mask' | 'expand',
): CanvasEditorLanePlan {
  return {
    derivedNodeId: `node-${operationId}`,
    edgeId: `edge-${operationId}`,
    relativePath: lane === 'expand'
      ? canvasScratchRelativePath(operationId, 'expand')
      : canvasScratchRelativePath(operationId),
  };
}

export interface CanvasEditorLanesDeps {
  workspacePath: string;
  /** Already resolved by the panel; `undefined` means the port does not exist. */
  assetWriter: InfiniteCanvasAssetWriter | undefined;
  commit: (
    mutator: InfiniteCanvasMutator,
    options?: { history?: boolean },
  ) => Promise<InfiniteCanvasDocument | undefined>;
  submitOperation: (invocation: SessionImageGenerationInvocation) => Promise<void>;
  /** Shared pre-dispatch gate: prompt, ordered references, target session. */
  prepareDispatch: (
    document: Readonly<InfiniteCanvasDocument>,
    referenceTargetNodeId: string,
    prompt: string,
  ) => readonly unknown[] | undefined;
  findImageNode: (nodeId: string) => {
    document: Readonly<InfiniteCanvasDocument>;
    node: { mediaRef?: InfiniteCanvasMediaRef; stylePresetId?: string };
  } | undefined;
  createOperationId: () => string;
  setNotice: (notice: CanvasEditorNotice | null) => void;
  /** The panel's translator, for the two instruction templates. */
  t: (key: string) => string;
  /** Injected in tests so a crop path is deterministic. */
  now?: () => number;
}

export interface CanvasEditorLane<Request, Confirm extends (...args: never[]) => void> {
  request: Request | null;
  open: (request: Request) => void;
  close: () => void;
  confirm: Confirm;
}

export interface CanvasEditorLanes {
  crop: CanvasEditorLane<CropEditorRequest, (base64Png: string) => Promise<void>>;
  mask: CanvasEditorLane<
    MaskEditorRequest,
    (base64Png: string, instruction: string) => Promise<void>
  >;
  expand: CanvasEditorLane<
    ExpandEditorRequest,
    (
      base64Png: string,
      insets: CanvasExpandInsets,
      sceneDescription: string,
    ) => Promise<void>
  >;
  /** Whether any of the three is open — the board's keyboard reads this. */
  anyOpen: boolean;
}

export function useCanvasEditorLanes(deps: CanvasEditorLanesDeps): CanvasEditorLanes {
  const {
    workspacePath,
    assetWriter,
    commit,
    submitOperation,
    prepareDispatch,
    findImageNode,
    createOperationId,
    setNotice,
    t,
    now = Date.now,
  } = deps;

  const [maskRequest, setMaskRequest] = React.useState<MaskEditorRequest | null>(null);
  const [cropRequest, setCropRequest] = React.useState<CropEditorRequest | null>(null);
  const [expandRequest, setExpandRequest] = React.useState<ExpandEditorRequest | null>(null);

  /**
   * Adversarial review P7: one press of a board-filling editor's send button
   * is one submission.
   *
   * Each confirm below reads its request out of React state and clears it, but
   * a second call in the SAME tick still sees the old value — a double click,
   * a stuck key repeat or a re-entrant event handler therefore wrote the
   * composite twice and, for mask and expand, submitted two paid operations
   * for one press. A ref settles it before the render that would have.
   *
   * It is released when an editor OPENS rather than when a confirm finishes:
   * the editor closes on confirm either way, so the only thing that can
   * legitimately submit again is a fresh open.
   */
  const submittingRef = React.useRef(false);

  const openMask = React.useCallback((request: MaskEditorRequest) => {
    setCropRequest(null);
    setExpandRequest(null);
    submittingRef.current = false;
    setMaskRequest(request);
  }, []);

  const openCrop = React.useCallback((request: CropEditorRequest) => {
    setMaskRequest(null);
    setExpandRequest(null);
    submittingRef.current = false;
    setCropRequest(request);
  }, []);

  const openExpand = React.useCallback((request: ExpandEditorRequest) => {
    setCropRequest(null);
    setMaskRequest(null);
    submittingRef.current = false;
    setExpandRequest(request);
  }, []);

  const closeMask = React.useCallback(() => setMaskRequest(null), []);
  const closeCrop = React.useCallback(() => setCropRequest(null), []);
  const closeExpand = React.useCallback(() => setExpandRequest(null), []);

  /**
   * P5 W2 crop: a LOCAL derivation (PRD §3.8).
   *
   * Strict order — write the file first, mutate the document only once the
   * bytes are on disk — so a card pointing at a file that does not exist is
   * unreachable. The derived card gets its `mediaRef` in the SAME mutation
   * that registers the operation, which is the one place in this product where
   * the front end writes a derived card's mediaRef itself; everywhere else the
   * media bridge does it. The source card is not touched at all.
   */
  const confirmCrop = React.useCallback(async (base64Png: string) => {
    // P7: one press, one crop. See `submittingRef`.
    if (submittingRef.current) return;
    submittingRef.current = true;
    const request = cropRequest;
    setCropRequest(null);
    if (!request) return;
    if (!assetWriter) {
      setNotice({ messageKey: 'infiniteCanvas.crop.writeFailed', errorKind: 'unavailable' });
      return;
    }
    const operationId = createOperationId();
    const plan = planCropEditorLane(operationId, request.mediaRef.relativePath, now());
    const written = await assetWriter({
      workspacePath,
      relativePath: plan.relativePath,
      base64Png,
    });
    if (written.status !== 'written') {
      setNotice(assetWriteNotice('crop', written.status));
      return;
    }
    const next = await commit(current => {
      const begun = beginDerivedOperationContent(
        current,
        request.nodeId,
        'crop',
        operationId,
        plan.derivedNodeId,
        plan.edgeId,
      );
      return applyLocalDerivedMedia({ ...current, ...begun }, plan.derivedNodeId, {
        workspacePath,
        relativePath: written.relativePath,
      });
    });
    // P5 review P12: the bytes are already on disk by now. If the source card
    // disappeared between opening the editor and confirming (a delete, an
    // agent op, a reload), `beginDerivedOperationContent` grows nothing and the
    // crop became a file with no card — silently, until the user found it in
    // the media library. Now it says so.
    if (!next?.nodes.some(node => node.nodeId === plan.derivedNodeId)) {
      setNotice({ messageKey: 'infiniteCanvas.crop.cardMissing', errorKind: 'invalid-input' });
    }
  }, [assetWriter, commit, createOperationId, cropRequest, now, setNotice, workspacePath]);

  /**
   * The chain mask and expand share, word for word.
   *
   * Nothing about the submission contract changes — `GenerateImage` still sees
   * "a prompt and one reference image" and knows nothing about marks or about
   * a larger canvas. What changes is WHICH image: the scratch composite
   * replaces the source picture as the edit target, and the connected
   * reference cards are deliberately dropped so exactly one path travels with
   * the request.
   */
  const runCompositeLane = React.useCallback(async (
    lane: 'mask' | 'expand',
    request: { nodeId: string },
    toolId: ImageToolId,
    finalPrompt: string,
    base64Png: string,
  ) => {
    const found = findImageNode(request.nodeId);
    if (!found?.node.mediaRef) return;
    const { document, node } = found;
    // Same gate as every other dispatch: a prompt, a reachable target session.
    if (!prepareDispatch(document, request.nodeId, finalPrompt)) return;
    if (!assetWriter) {
      setNotice({
        messageKey: `infiniteCanvas.${lane}.writeFailed`,
        errorKind: 'unavailable',
      });
      return;
    }

    const operationId = createOperationId();
    const plan = planCompositeEditorLane(operationId, lane);
    const written = await assetWriter({
      workspacePath,
      relativePath: plan.relativePath,
      base64Png,
    });
    if (written.status !== 'written') {
      // The 32 MB ceiling lands here as a typed `invalid_input`, which the
      // shared notice turns into "the picture is too large to save. Nothing
      // was generated and nothing was charged."
      setNotice(assetWriteNotice(lane, written.status));
      return;
    }

    await commit(current => {
      const begun = beginDerivedOperationContent(
        current,
        request.nodeId,
        toolId,
        operationId,
        plan.derivedNodeId,
        plan.edgeId,
      );
      return setNodePromptContent({ ...current, ...begun }, plan.derivedNodeId, finalPrompt);
    });
    await submitOperation({
      operationId,
      kind: toolId,
      resultMode: 'derived',
      nodeId: plan.derivedNodeId,
      sourceNodeId: request.nodeId,
      prompt: finalPrompt,
      stylePresetId: node.stylePresetId,
      references: [],
      editTargetMediaRef: { workspacePath, relativePath: written.relativePath },
    });
  }, [
    assetWriter,
    commit,
    createOperationId,
    findImageNode,
    prepareDispatch,
    setNotice,
    submitOperation,
    workspacePath,
  ]);

  /**
   * P5 W4 mask lane: the red-mark composite becomes the reference of an
   * ordinary derived generation (PRD §3.7).
   *
   * Order is the money rule: write the composite first, and submit only if it
   * landed. A failed write must never reach a paid submission.
   */
  const confirmMask = React.useCallback(async (
    base64Png: string,
    instruction: string,
  ) => {
    // P7: one press, one paid submission. See `submittingRef`.
    if (submittingRef.current) return;
    submittingRef.current = true;
    const request = maskRequest;
    setMaskRequest(null);
    if (!request) return;
    const finalPrompt = buildMaskInstruction(t(maskDirectiveKey(request.toolId)), instruction);
    await runCompositeLane('mask', request, request.toolId, finalPrompt, base64Png);
  }, [maskRequest, runCompositeLane, t]);

  /**
   * P6 expand lane: the outpainting composite becomes the edit target of an
   * ordinary derived generation.
   *
   * Exactly the mask lane's chain, and deliberately so. The only differences
   * are WHAT the composite is (the picture on a larger transparent canvas
   * instead of the picture with red marks burnt in) and where the prompt comes
   * from (the frame, through the existing `expand` instruction template,
   * instead of the user's sentence).
   */
  const confirmExpand = React.useCallback(async (
    base64Png: string,
    insets: CanvasExpandInsets,
    sceneDescription: string,
  ) => {
    // P7: one press, one paid submission. See `submittingRef`.
    if (submittingRef.current) return;
    submittingRef.current = true;
    const request = expandRequest;
    setExpandRequest(null);
    if (!request) return;
    // §7.4.4: whatever the user typed underneath describes the room being
    // added. Empty is fine — the template's own fallback covers it — and it
    // goes through the SAME assembler either way.
    const finalPrompt = buildExpandInstruction(
      t(EXPAND_DIRECTIVE_KEY),
      insets,
      sceneDescription,
    );
    await runCompositeLane('expand', request, 'expand', finalPrompt, base64Png);
  }, [expandRequest, runCompositeLane, t]);

  return {
    crop: { request: cropRequest, open: openCrop, close: closeCrop, confirm: confirmCrop },
    mask: { request: maskRequest, open: openMask, close: closeMask, confirm: confirmMask },
    expand: {
      request: expandRequest,
      open: openExpand,
      close: closeExpand,
      confirm: confirmExpand,
    },
    anyOpen: Boolean(maskRequest || cropRequest || expandRequest),
  };
}
