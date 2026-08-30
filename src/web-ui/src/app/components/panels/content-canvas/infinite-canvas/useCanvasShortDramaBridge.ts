/**
 * K3: everything the board does with the short-drama module, in one place.
 *
 * Three halves of one idea — a picture arriving from an asset, the badge that
 * says where a card came from, and the press that sends a refined picture back
 * — used to be three unrelated stretches of the panel with the same imports
 * repeated between them. They are one lane: they share the request bookkeeping,
 * the project read, and the mount guard.
 *
 * Nothing here reads the disk or the manifest on its own. Both directions are
 * injected ports (`readShortDramaProject`, `sendPictureBackToShortDrama`), and
 * every document change goes through the panel's `commit`.
 */
import React from 'react';
import type { Node } from '@xyflow/react';

import { notificationService } from '@/shared/notification-system/services/NotificationService';
import {
  resolveShortDramaCanvasImport,
  resolveShortDramaCanvasOrigin,
  type ShortDramaCanvasOrigin,
} from '@/shared/services/canvas-short-drama/shortDramaCanvasImport';
import {
  type ShortDramaCanvasWriteBackRefusal,
  type ShortDramaCanvasWriteBackRequest,
  type ShortDramaCanvasWriteBackResult,
} from '@/shared/services/canvas-short-drama/shortDramaCanvasWriteBack';
import type { ShortDramaProject } from '@/shared/services/short-drama/ShortDramaTypes';
import type {
  InfiniteCanvasDocument,
  InfiniteCanvasDomainRef,
  InfiniteCanvasMutator,
} from '@/shared/services/infinite-canvas';
import { infiniteCanvasDomainRefKey } from '@/shared/services/infinite-canvas';

import type { InfiniteCanvasDomainOrigins } from './infiniteCanvasDomainOrigins';
import {
  addDomainImportNodeContent,
  consumeImportRequestContent,
  findDomainImportNodeId,
  isImportRequestConsumed,
} from './infiniteCanvasPanelModel';

/**
 * K3 §5.2: one refusal, one sentence. Every reason the write-back can give
 * back has its own line — a press that does nothing and says nothing is the
 * failure mode this whole slice exists to avoid.
 */
export const WRITE_BACK_REFUSAL_KEYS: Record<ShortDramaCanvasWriteBackRefusal, string> = {
  'remote-workspace': 'infiniteCanvas.writeBack.refused.remoteWorkspace',
  'foreign-workspace': 'infiniteCanvas.writeBack.refused.foreignWorkspace',
  'project-unreadable': 'infiniteCanvas.writeBack.refused.projectUnreadable',
  'asset-missing': 'infiniteCanvas.writeBack.refused.assetMissing',
  'unusable-picture': 'infiniteCanvas.writeBack.refused.unusablePicture',
  'save-failed': 'infiniteCanvas.writeBack.refused.saveFailed',
};

export interface CanvasShortDramaBridgeDeps {
  workspacePath: string;
  /** The projected cards; only their `domainRef`s are read, to key the badges. */
  flowNodes: Node[];
  /** The document as last projected; the panel owns the box. */
  documentRef: { readonly current: InfiniteCanvasDocument | undefined };
  commit: (
    mutator: InfiniteCanvasMutator,
    options?: { history?: boolean },
  ) => Promise<InfiniteCanvasDocument | undefined>;
  /** So a card can be marked busy without a re-projection. */
  setFlowNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  /** Puts the card that just landed (or was found again) under the user. */
  revealNode: (nodeId: string) => void;
  nextSpawnPosition: () => { x: number; y: number };
  createNodeId: () => string;
  /**
   * K3 §5.1.5: "open the board and bring this short-drama asset with you".
   * A given `requestId` is imported at most once (§5.1.6).
   */
  pendingDomainImport?: {
    domainRef: InfiniteCanvasDomainRef;
    requestId: string;
  };
  readShortDramaProject: (
    workspacePath: string | undefined,
  ) => Promise<ShortDramaProject | undefined>;
  sendPictureBackToShortDrama: (
    request: ShortDramaCanvasWriteBackRequest,
  ) => Promise<ShortDramaCanvasWriteBackResult>;
  /** The panel's translator, for the notifications this lane raises. */
  t: (key: string) => string;
}

export interface CanvasShortDramaBridge {
  /**
   * §5.1.8: handles for the "from short drama" badges, resolved at runtime.
   * `undefined` means "not read yet" and is not the same as an empty map,
   * which means "read, and this card's asset is gone".
   */
  domainOrigins: InfiniteCanvasDomainOrigins | undefined;
  /** §5.2: "send back to short drama", for the card's own toolbar. */
  sendNodeToShortDrama: (nodeId: string) => void;
}

export function useCanvasShortDramaBridge(
  deps: CanvasShortDramaBridgeDeps,
): CanvasShortDramaBridge {
  const {
    workspacePath,
    flowNodes,
    documentRef,
    commit,
    setFlowNodes,
    revealNode,
    nextSpawnPosition,
    createNodeId,
    pendingDomainImport,
    readShortDramaProject,
    sendPictureBackToShortDrama,
    t,
  } = deps;

  const [domainOrigins, setDomainOrigins] = React.useState<
    InfiniteCanvasDomainOrigins | undefined
  >(undefined);
  /**
   * Bumped after a successful send home, so the badge picks up the asset's new
   * "waiting for review" state. Nothing else invalidates the lookup: the board
   * does not subscribe to short drama, and a picture the user is refining must
   * never change under them.
   */
  const [domainOriginsRefreshKey, setDomainOriginsRefreshKey] = React.useState(0);
  /**
   * K3 §5.1.6: the request ids this panel has already acted on.
   *
   * The surface uses the `'update'` strategy, so an already-open board really
   * does receive each new payload — and it also keeps receiving the last one
   * across re-mounts and session restores. Without this the same asset would
   * quietly land again every time the tab came back.
   */
  const handledImportRequestIdsRef = React.useRef(new Set<string>());
  /**
   * The import runs at most once per request id, so it must NOT be abandoned
   * just because the effect re-ran — `t` and a few callbacks change identity on
   * ordinary re-renders, and a per-effect cancel flag would abort the one run
   * the request ever gets. Unmounting is the only thing that should stop it.
   */
  const isMountedRef = React.useRef(true);
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  /**
   * §5.1.8: resolve the badge handles whenever the set of belonging cards
   * changes. Keyed on the set, not on every commit, so moving a card or typing
   * in one does not re-read the project.
   */
  const domainRefSignature = React.useMemo(() => {
    const keys: string[] = [];
    for (const node of flowNodes) {
      const domainRef = (node.data as { domainRef?: InfiniteCanvasDomainRef }).domainRef;
      if (domainRef) keys.push(infiniteCanvasDomainRefKey(domainRef));
    }
    return keys.sort().join('|');
  }, [flowNodes]);

  React.useEffect(() => {
    if (!domainRefSignature) {
      // Nothing belongs to anything: that is a complete answer, not a pending
      // one, so the map is empty rather than absent.
      setDomainOrigins(new Map());
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const project = await readShortDramaProject(workspacePath);
      if (cancelled) return;
      if (!project) {
        // Unreadable is not the same as "the asset is gone", and a badge must
        // not accuse a project it could not open.
        setDomainOrigins(undefined);
        return;
      }
      const next = new Map<string, ShortDramaCanvasOrigin>();
      for (const node of documentRef.current?.nodes ?? []) {
        if (!node.domainRef) continue;
        const origin = resolveShortDramaCanvasOrigin(project, node.domainRef);
        if (origin) next.set(infiniteCanvasDomainRefKey(node.domainRef), origin);
      }
      setDomainOrigins(next);
    })();
    return () => { cancelled = true; };
  }, [
    documentRef,
    domainOriginsRefreshKey,
    domainRefSignature,
    readShortDramaProject,
    workspacePath,
  ]);

  /**
   * §5.1.6: the import itself. One request id lands at most one card, and an
   * asset that already has a card on this board reveals that card instead of
   * growing a second one — one asset, one official refinement slot.
   *
   * The picture's path is resolved HERE, not carried in the payload, so an
   * asset whose picture changed between the press and the open still lands
   * with the picture it has now.
   *
   * E4 — three guards, not two, and the third is the one that matters:
   *
   *  1. `handledImportRequestIdsRef` — per-mount, cheap, stops a re-render
   *     from re-running the effect.
   *  2. `findDomainImportNodeId` — one asset, one card.
   *  3. `consumedImportRequestIds` in the DOCUMENT — durable.
   *
   * Guards 1 and 2 both evaporate in the exact sequence the user is most
   * likely to hit: land a card, delete it (the documented undo), switch tabs
   * and back. The surface's tab content is persisted and its strategy is
   * 'update', so the same payload arrives again at a fresh mount with an empty
   * ref and no card to find — and the deleted card grew back. Guard 3 is what
   * makes "delete the card" stick.
   *
   * Guard 3 is CLAIMED FIRST, before the project is read and before anything
   * is warned about, in its own mutation. It cannot be checked off the panel's
   * in-memory document: on a fresh mount the load is still in flight when this
   * effect runs, so the only place the answer is reliable is inside a mutator,
   * where the document service has already resolved the document and holds the
   * per-path queue. Claiming first also means every terminal path — landed,
   * revealed, refused — is covered by one write instead of three.
   *
   * The failure direction of claim-first is deliberate: a crash between the
   * claim and the card loses the import, and the user presses again. The other
   * order loses the user's deletion, permanently, on every tab switch.
   */
  React.useEffect(() => {
    const pending = pendingDomainImport;
    if (!pending) return undefined;
    if (handledImportRequestIdsRef.current.has(pending.requestId)) return undefined;
    handledImportRequestIdsRef.current.add(pending.requestId);

    void (async () => {
      // Never `history: true`: claiming a request is bookkeeping, not the
      // user's edit, and undo must not re-open the door.
      let alreadyConsumed = false;
      const claimed = await commit(current => {
        alreadyConsumed = isImportRequestConsumed(current, pending.requestId);
        return alreadyConsumed
          ? { nodes: current.nodes, edges: current.edges, viewport: current.viewport }
          : consumeImportRequestContent(current, pending.requestId);
      });
      if (!isMountedRef.current || !claimed || alreadyConsumed) return;

      const existing = findDomainImportNodeId(claimed, pending.domainRef);
      if (existing) {
        revealNode(existing);
        return;
      }

      const project = await readShortDramaProject(workspacePath);
      if (!isMountedRef.current) return;
      const resolved = project
        ? resolveShortDramaCanvasImport(project, pending.domainRef, workspacePath)
        : { status: 'refused', reason: 'asset-missing' } as const;
      if (resolved.status !== 'ready') {
        // Never silent: an open board with no new card would leave the user
        // wondering whether the press registered at all.
        notificationService.warning(
          t(resolved.reason === 'unusable-picture'
            ? 'infiniteCanvas.domainImport.unusablePicture'
            : 'infiniteCanvas.domainImport.assetMissing'),
          { duration: 4000 },
        );
        return;
      }

      const nodeId = createNodeId();
      const position = nextSpawnPosition();
      // The duplicate check runs again inside the mutator, where it is atomic
      // against anything else committing to this document.
      const document = await commit(current => (
        findDomainImportNodeId(current, pending.domainRef)
          ? { nodes: current.nodes, edges: current.edges, viewport: current.viewport }
          : addDomainImportNodeContent(
            current,
            nodeId,
            position,
            resolved.mediaRef,
            pending.domainRef,
          )
      ), { history: true });
      if (!isMountedRef.current || !document) return;
      const landed = findDomainImportNodeId(document, pending.domainRef);
      if (landed) revealNode(landed);
    })();

    return undefined;
  }, [
    commit,
    createNodeId,
    nextSpawnPosition,
    pendingDomainImport,
    readShortDramaProject,
    revealNode,
    t,
    workspacePath,
  ]);

  /**
   * §5.2: "send back to short drama".
   *
   * The panel's whole job here is to name the card and hand it over. Which
   * workspace, which asset, whether the picture converts, whether the asset
   * still exists — every one of those questions belongs to the write-back
   * service, and asking any of them here would put a second copy of the rules
   * on the board.
   *
   * One press at a time per card: a second press while the first is in flight
   * is dropped rather than queued, so an impatient double click cannot write
   * twice. (The service is idempotent anyway; this just keeps the card honest
   * about what is happening.)
   */
  const sendingToShortDramaRef = React.useRef(new Set<string>());
  const markSendingToShortDrama = React.useCallback((nodeId: string, busy: boolean) => {
    setFlowNodes(nodes => nodes.map(node => (
      node.id === nodeId
        ? { ...node, data: { ...node.data, sendToShortDramaBusy: busy } }
        : node
    )));
  }, [setFlowNodes]);

  const sendNodeToShortDrama = React.useCallback((nodeId: string) => {
    const node = documentRef.current?.nodes.find(entry => entry.nodeId === nodeId);
    const domainRef = node?.domainRef;
    const mediaRef = node?.mediaRef;
    if (!domainRef || !mediaRef) return;
    if (sendingToShortDramaRef.current.has(nodeId)) return;
    sendingToShortDramaRef.current.add(nodeId);
    markSendingToShortDrama(nodeId, true);

    void sendPictureBackToShortDrama({
      domainRef,
      mediaRef,
      canvasNodeId: nodeId,
      workspacePath,
      backend: 'local',
    })
      .then(result => {
        if (result.status === 'sent') {
          // A2: `sent` covers two different things and only one of them is
          // news. `already-recorded` means the asset is holding this exact
          // picture already and nothing was written — a green "sent home" for
          // that is what made "send A, send B, go back to A" look like it
          // worked while doing nothing. Neutral wording, neutral colour.
          if (result.outcome === 'already-recorded') {
            notificationService.info(
              t('infiniteCanvas.writeBack.alreadySent'),
              { duration: 4000 },
            );
          } else {
            notificationService.success(t('infiniteCanvas.writeBack.sent'), { duration: 4000 });
          }
          // Either way the asset's state on the short-drama side may differ
          // from what the badge last read; re-read it.
          setDomainOriginsRefreshKey(key => key + 1);
          return;
        }
        notificationService.warning(t(WRITE_BACK_REFUSAL_KEYS[result.reason]), { duration: 5000 });
      })
      .catch(() => {
        notificationService.warning(
          t(WRITE_BACK_REFUSAL_KEYS['save-failed']),
          { duration: 5000 },
        );
      })
      .finally(() => {
        sendingToShortDramaRef.current.delete(nodeId);
        if (isMountedRef.current) markSendingToShortDrama(nodeId, false);
      });
  }, [
    documentRef,
    markSendingToShortDrama,
    sendPictureBackToShortDrama,
    t,
    workspacePath,
  ]);

  return { domainOrigins, sendNodeToShortDrama };
}
