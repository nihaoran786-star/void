/**
 * The one lane every paid picture leaves the board through.
 *
 * Three entry points reach it — the blank card's send button, "try that
 * again", and the five image tools — and they all end at `submitOperation`:
 * register the pending operation in the document FIRST, then send it, and roll
 * the registration back to a typed failure if the send does not go through. A
 * pending card with no task behind it spins forever; a task with no pending
 * card is money spent on a result nothing is waiting for.
 *
 * Everything that touches the outside world is injected: the document commit
 * and the generation runtime. Nothing here reads the disk or the gateway on
 * its own.
 */
import React from 'react';
import type { Node } from '@xyflow/react';

import {
  resolveShortDramaCanvasGenerationBinding,
} from '@/shared/services/canvas-short-drama/shortDramaCanvasImport';
import type { ShortDramaProject } from '@/shared/services/short-drama/ShortDramaTypes';
import type {
  ImageToolErrorKind,
  InfiniteCanvasDocument,
  InfiniteCanvasDomainRef,
  InfiniteCanvasMutator,
  InfiniteCanvasShortDramaBinding,
  SessionImageGenerationInvocation,
} from '@/shared/services/infinite-canvas';

import {
  failOperationContent,
  infiniteCanvasWillAutoFile,
  retryOperationContent,
} from './infiniteCanvasPanelModel';
import {
  beginAccumulatingGenerationContent,
  beginSelfGenerationContent,
  collectReferenceNodes,
} from './infiniteCanvasGenerationModel';
import type { InfiniteCanvasGenerationRuntime } from './infiniteCanvasGenerationRuntime';

/** A line the board shows about a generation, in words the owner can act on. */
export interface CanvasGenerationNotice {
  /** i18n key under the components namespace. */
  messageKey: string;
  errorKind?: ImageToolErrorKind;
  /**
   * P5 review C8: not every notice is a failure. A long-running, paid call
   * needs to say it is running somewhere the user can still see after the
   * surface they started it from has closed.
   */
  busy?: boolean;
}

/**
 * The operations whose request carries a picture the front end BUILT, not the
 * source card's own (adversarial review P2).
 *
 * Inpainting and erasing send the original with the red marks burnt in;
 * outpainting sends it on a larger transparent canvas. That composite lives in
 * the scratch directory and is not reachable from the failed card, so a retry
 * would silently fall back to the bare original — a wrong result, paid for.
 */
export const CANVAS_SCRATCH_COMPOSITE_TOOLS: ReadonlySet<string> = new Set([
  'inpaint',
  'erase',
  'expand',
]);

type CanvasDocumentNode = InfiniteCanvasDocument['nodes'][number];

/** The ordered reference list `collectReferenceNodes` hands back on success. */
type CanvasCollectedReferences =
  Extract<ReturnType<typeof collectReferenceNodes>, { status: 'ok' }>['references'];

export interface CanvasMediaNodeHit {
  document: Readonly<InfiniteCanvasDocument>;
  node: CanvasDocumentNode;
}

export interface CanvasGenerationDispatchDeps {
  workspacePath: string;
  runtime: InfiniteCanvasGenerationRuntime;
  /** The document as last projected; the panel owns the box. */
  documentRef: { readonly current: InfiniteCanvasDocument | undefined };
  commit: (
    mutator: InfiniteCanvasMutator,
    options?: { history?: boolean },
  ) => Promise<InfiniteCanvasDocument | undefined>;
  setNotice: (notice: CanvasGenerationNotice | null) => void;
  /** So the badge on an owned card can be weakened without a re-projection. */
  setFlowNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  manualReturnNodeIdsRef: { readonly current: Set<string> };
  readShortDramaProject: (
    workspacePath: string | undefined,
  ) => Promise<ShortDramaProject | undefined>;
  createOperationId: () => string;
}

export interface CanvasGenerationDispatch {
  /** Generation-capable cards: image (K2) and video (P3) share one lane. */
  findMediaNode: (nodeId: string) => CanvasMediaNodeHit | undefined;
  findImageNode: (nodeId: string) => CanvasMediaNodeHit | undefined;
  /** Shared pre-dispatch gate: prompt, ordered references, target session. */
  prepareDispatch: (
    document: Readonly<InfiniteCanvasDocument>,
    referenceTargetNodeId: string,
    prompt: string,
  ) => CanvasCollectedReferences | undefined;
  submitOperation: (invocation: SessionImageGenerationInvocation) => Promise<void>;
  resolveGenerationOwnership: (
    domainRef: InfiniteCanvasDomainRef | undefined,
  ) => Promise<InfiniteCanvasShortDramaBinding | undefined>;
  generateForNode: (nodeId: string) => Promise<void>;
  retryGeneration: (
    nodeId: string,
    options?: { confirmedRespend?: boolean },
  ) => Promise<void>;
  /** P4 review C3: the card whose retry is waiting for "yes, charge me again". */
  retryConfirmNodeId: string | null;
  confirmRetryRespend: () => void;
  cancelRetryRespend: () => void;
}

export function useCanvasGenerationDispatch(
  deps: CanvasGenerationDispatchDeps,
): CanvasGenerationDispatch {
  const {
    workspacePath,
    runtime,
    documentRef,
    commit,
    setNotice,
    setFlowNodes,
    manualReturnNodeIdsRef,
    readShortDramaProject,
    createOperationId,
  } = deps;

  /**
   * P4 review C3: the card whose retry is waiting for the "yes, charge me
   * again" confirmation. Only ever set for a card the user stopped waiting on.
   */
  const [retryConfirmNodeId, setRetryConfirmNodeId] = React.useState<string | null>(null);

  const findMediaNode = React.useCallback((nodeId: string) => {
    const document = documentRef.current;
    const node = document?.nodes.find(candidate => candidate.nodeId === nodeId);
    if (!document || !node || (node.kind !== 'image' && node.kind !== 'video')) {
      return undefined;
    }
    return { document, node };
  }, [documentRef]);

  const findImageNode = React.useCallback((nodeId: string) => {
    const found = findMediaNode(nodeId);
    return found?.node.kind === 'image' ? found : undefined;
  }, [findMediaNode]);

  /**
   * Sends one already-registered pending operation through the gateway and
   * rolls the pending state back to a typed failure when dispatch fails.
   */
  const submitOperation = React.useCallback(async (
    invocation: SessionImageGenerationInvocation,
  ) => {
    // Catch-all included: an unexpected throw out of the gateway must also
    // roll the already-registered pending card back to a retryable typed
    // failure — a pending card with no in-flight task would spin forever.
    let errorKind: ImageToolErrorKind | undefined;
    try {
      const result = await runtime.gateway.invoke(invocation);
      if (result.status === 'failed') {
        errorKind = result.error?.kind ?? 'backend';
      }
    } catch {
      errorKind = 'backend';
    }
    if (errorKind !== undefined) {
      const failedKind = errorKind;
      await commit(document => failOperationContent(
        document,
        invocation.operationId,
        failedKind,
      ));
      setNotice({
        messageKey: `infiniteCanvas.generation.errorKind.${failedKind}`,
        errorKind: failedKind,
      });
    }
  }, [commit, runtime, setNotice]);

  /**
   * A5 / C1: one sentence, one mark, two causes.
   *
   * Whenever a press on an owned card is NOT going to file its result into the
   * short-drama asset — because the batch is bigger than one (A5), or because
   * the asset's coordinates could not be read (C1) — the user is told once, in
   * the board's own notice line, and the card's badge is weakened so the state
   * is still legible after the line is dismissed.
   *
   * Before this, C1 was completely invisible: the coordinates silently failed
   * to resolve, the picture was generated and paid for anyway, and the badge
   * went on saying "from short drama · CHAR-001" exactly as it does when
   * filing WILL happen. There was no way to tell the two apart.
   */
  const noteManualReturn = React.useCallback((nodeId: string, manual: boolean) => {
    const known = manualReturnNodeIdsRef.current.has(nodeId);
    if (manual) manualReturnNodeIdsRef.current.add(nodeId);
    else manualReturnNodeIdsRef.current.delete(nodeId);
    if (known === manual) return;
    setFlowNodes(nodes => nodes.map(node => (
      node.id === nodeId
        ? {
            ...node,
            data: manual
              ? { ...node.data, domainManualReturn: true }
              : { ...node.data, domainManualReturn: undefined },
          }
        : node
    )));
  }, [manualReturnNodeIdsRef, setFlowNodes]);

  /**
   * K3 §6.2: the short-drama coordinates a generation on an owned card should
   * be filed under, or `undefined` for every other card.
   *
   * Resolved at press time rather than stored on the card, for the same reason
   * the badge's handle is: `domainRef` is a four-field contract, and an asset
   * that moved stage or was renamed must not be filed under a stale copy.
   *
   * Every failure — no reference, no project, no such asset — is `undefined`,
   * i.e. generate anyway without coordinates. Refusing to draw the picture
   * because a manifest could not be read would be the wrong trade: the user
   * still has the explicit "send back to short drama" button afterwards.
   */
  const resolveGenerationOwnership = React.useCallback(async (
    domainRef: InfiniteCanvasDomainRef | undefined,
  ): Promise<InfiniteCanvasShortDramaBinding | undefined> => {
    if (!domainRef) return undefined;
    const project = await Promise.resolve(readShortDramaProject(workspacePath))
      .catch(() => undefined);
    if (!project) return undefined;
    return resolveShortDramaCanvasGenerationBinding(project, domainRef);
  }, [readShortDramaProject, workspacePath]);

  /** Shared pre-dispatch gate: prompt, ordered references, target session. */
  const prepareDispatch = React.useCallback((
    document: Readonly<InfiniteCanvasDocument>,
    referenceTargetNodeId: string,
    prompt: string,
  ) => {
    if (!prompt.trim()) {
      setNotice({ messageKey: 'infiniteCanvas.generation.promptRequired' });
      return undefined;
    }
    const collected = collectReferenceNodes(document, referenceTargetNodeId);
    if (collected.status === 'error') {
      setNotice({
        messageKey: collected.error.kind === 'reference-not-image'
          ? 'infiniteCanvas.video.referenceNotSupported'
          : 'infiniteCanvas.generation.referenceNotReady',
      });
      return undefined;
    }
    if (!runtime.hasTargetSession()) {
      setNotice({ messageKey: 'infiniteCanvas.generation.noSession' });
      return undefined;
    }
    setNotice(null);
    return collected.references;
  }, [runtime, setNotice]);

  const generateForNode = React.useCallback(async (nodeId: string) => {
    const found = findMediaNode(nodeId);
    if (!found) return;
    const { document, node } = found;
    if (node.generation?.status === 'pending') return;
    // P3: a video card dispatches through the same lane, marked 'video' —
    // the message routes to GenerateVideo, the binding carries mediaKind.
    const mediaKind = node.kind === 'video' ? 'video' as const : 'image' as const;
    const prompt = (node.prompt ?? '').trim();
    const references = prepareDispatch(document, nodeId, prompt);
    if (!references) return;

    // P4 W3: the card's own parameters ride along; the gateway clamps them
    // once more against the model's allow list before the request goes out.
    const generationParams = node.generationParams;

    const operationId = createOperationId();
    // §7.6: generation and regeneration both land on THIS card. A blank card
    // gets its first picture; a card that already has some gets one more —
    // the results of the same intent pile up instead of scattering sibling
    // cards across the board. The five tools and crop still derive (they are
    // dispatched elsewhere, and their lineage has to stay visible).
    //
    // Adversarial review P1: the branch reads `current`, not the snapshot this
    // callback closed over. `found` was taken before the await above, so a
    // card whose first picture landed in between was still being registered as
    // a blank-card first shot — a registration `beginSelfGenerationContent`
    // refuses, leaving no pending state anywhere.
    const next = await commit(current => {
      const target = current.nodes.find(entry => entry.nodeId === nodeId);
      return target?.mediaRef === undefined
        ? beginSelfGenerationContent(current, nodeId, operationId, { mediaKind })
        : beginAccumulatingGenerationContent(current, nodeId, operationId, { mediaKind });
    });
    // P1: and the request is only paid for if it has somewhere to land. Every
    // registration helper can decline (the card went away, another shot got
    // there first), and submitting anyway spent money on a result no card was
    // waiting for. Same guard the crop lane already carries.
    if (!next?.nodes.some(entry => entry.generation?.operationId === operationId)) {
      setNotice({
        messageKey: 'infiniteCanvas.generation.cardMissing',
        errorKind: 'invalid-input',
      });
      return;
    }
    // K3 §6.2: a card that came from short drama files its result in that
    // asset's ledger too. Only this lane does — a generation in self mode
    // lands on the owned card itself, so the picture the asset ends up
    // holding is the picture the user sees on it. The five tools and crop
    // derive a NEW card that owns nothing, and auto-filing every exploration
    // as a review request would flood the short-drama panel; those still go
    // home through the explicit "send back" button, which is the user's own
    // decision about which attempt was the good one.
    //
    // A5: ...but only one picture at a time. The backend attach reads the
    // first result and files it, so a batch would put an unchosen candidate
    // into review while the other three were still arriving. A batch on an
    // owned card therefore travels WITHOUT coordinates and the user picks the
    // good one and sends it back themselves — which is the decision they were
    // asking for by requesting four in the first place.
    //
    // C1: and a card whose coordinates cannot be read is the same situation
    // arrived at by a different road, so it gets the same sentence and the
    // same weakened badge rather than a second vocabulary.
    const willAutoFile = infiniteCanvasWillAutoFile(node);
    const shortDrama = willAutoFile
      ? await resolveGenerationOwnership(node.domainRef)
      : undefined;
    if (node.domainRef && !shortDrama) {
      noteManualReturn(nodeId, true);
      setNotice({ messageKey: 'infiniteCanvas.domainRef.manualReturn' });
    } else if (node.domainRef) {
      noteManualReturn(nodeId, false);
    }
    await submitOperation({
      operationId,
      kind: 'generate',
      mediaKind,
      resultMode: 'self',
      nodeId,
      prompt,
      stylePresetId: node.stylePresetId,
      references,
      ...(generationParams ? { generationParams } : {}),
      ...(shortDrama ? { shortDrama } : {}),
    });
  }, [
    commit,
    createOperationId,
    findMediaNode,
    noteManualReturn,
    prepareDispatch,
    resolveGenerationOwnership,
    setNotice,
    submitOperation,
  ]);

  const retryGeneration = React.useCallback(async (
    nodeId: string,
    options: { confirmedRespend?: boolean } = {},
  ) => {
    const found = findMediaNode(nodeId);
    if (!found) return;
    const { document, node } = found;
    const generation = node.generation;
    if (!generation || generation.status !== 'failed') return;

    // P4 review C3: "stop waiting" is not a cancel — the original job is very
    // likely still running and still billed, and the retry takes a NEW
    // operationId, which un-anchors that first result: the user would pay
    // twice and keep one picture. Nobody may walk into that by accident, so
    // this one retry asks first (and "retry every failed one" skips these
    // rows entirely).
    if (generation.errorKind === 'cancelled' && !options.confirmedRespend) {
      setRetryConfirmNodeId(nodeId);
      return;
    }

    const isDerived = generation.resultMode === 'derived';
    const sourceNodeId = node.derivedFrom?.sourceNodeId;
    const source = sourceNodeId
      ? document.nodes.find(candidate => candidate.nodeId === sourceNodeId)
      : undefined;
    if (isDerived && (!sourceNodeId || !source)) {
      setNotice({ messageKey: 'infiniteCanvas.generation.errorKind.invalid-input' });
      return;
    }
    if (isDerived && generation.toolId !== 'generate' && !source?.mediaRef) {
      setNotice({ messageKey: 'infiniteCanvas.generation.errorKind.invalid-input' });
      return;
    }
    /*
      Adversarial review P2: the three lanes that submit a SCRATCH COMPOSITE
      cannot be retried from here.

      Inpainting, erasing and outpainting do not send the source picture — they
      send a picture the front end built in the editor: the original with the
      user's red marks burnt in, or the original sitting on a larger
      transparent canvas. The retry below only knows about `source.mediaRef`,
      so it re-ran the request against the bare original: the marks and the
      frame were gone, the result was guaranteed to be wrong, and the user paid
      for it. Saying "open it again" costs nothing and is the truth.
    */
    if (isDerived && CANVAS_SCRATCH_COMPOSITE_TOOLS.has(generation.toolId)) {
      setNotice({
        messageKey: 'infiniteCanvas.generation.retryNeedsEditor',
        errorKind: 'invalid-input',
      });
      return;
    }

    const prompt = (node.prompt ?? '').trim();
    const referenceTargetNodeId = isDerived ? sourceNodeId! : nodeId;
    const references = prepareDispatch(document, referenceTargetNodeId, prompt);
    if (!references) return;

    const nextOperationId = createOperationId();
    await commit(current => retryOperationContent(
      current,
      generation.operationId,
      nextOperationId,
    ));
    await submitOperation({
      operationId: nextOperationId,
      kind: generation.toolId,
      // P3: the retry keeps the registered media kind — a failed video
      // generation re-arms as a video task, never as an image one.
      ...(generation.mediaKind ? { mediaKind: generation.mediaKind } : {}),
      resultMode: generation.resultMode,
      nodeId,
      ...(isDerived ? { sourceNodeId } : {}),
      prompt,
      stylePresetId: isDerived ? source?.stylePresetId : node.stylePresetId,
      references,
      // A retry re-sends the card's own parameters; a card that never had
      // any (e.g. a five-tool placeholder) still sends none.
      ...(node.generationParams ? { generationParams: node.generationParams } : {}),
      ...(isDerived && generation.toolId !== 'generate' && source?.mediaRef
        ? { editTargetMediaRef: source.mediaRef }
        : {}),
    });
  }, [commit, createOperationId, findMediaNode, prepareDispatch, setNotice, submitOperation]);

  const confirmRetryRespend = React.useCallback(() => {
    const nodeId = retryConfirmNodeId;
    setRetryConfirmNodeId(null);
    if (nodeId) void retryGeneration(nodeId, { confirmedRespend: true });
  }, [retryConfirmNodeId, retryGeneration]);

  const cancelRetryRespend = React.useCallback(() => setRetryConfirmNodeId(null), []);

  return {
    findMediaNode,
    findImageNode,
    prepareDispatch,
    submitOperation,
    resolveGenerationOwnership,
    generateForNode,
    retryGeneration,
    retryConfirmNodeId,
    confirmRetryRespend,
    cancelRetryRespend,
  };
}
