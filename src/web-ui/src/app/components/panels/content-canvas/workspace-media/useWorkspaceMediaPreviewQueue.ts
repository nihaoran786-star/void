import React from 'react';

import type {
  WorkspaceMediaImagePreviewResolver,
  WorkspaceMediaPreviewResolver,
} from '@/shared/services/workspace-media';

export type WorkspaceMediaPreviewState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'failed' };

export interface WorkspaceMediaPreviewCandidate {
  key: string;
  filePath: string;
  extension: string;
  kind: 'image' | 'video';
  modifiedAt?: number;
}

interface UseWorkspaceMediaPreviewQueueOptions {
  candidates: WorkspaceMediaPreviewCandidate[];
  containerRef: React.RefObject<HTMLElement | null>;
  enabled: boolean;
  imagePreviewResolver: WorkspaceMediaImagePreviewResolver;
  mediaPreviewResolver: WorkspaceMediaPreviewResolver;
  maxConcurrent?: number;
}

const DEFAULT_MAX_CONCURRENT = 2;
const FALLBACK_VISIBLE_ITEM_LIMIT = 12;
export const WORKSPACE_MEDIA_READY_PREVIEW_LIMIT = 48;
const PREVIEW_TARGET_ATTRIBUTE = 'data-workspace-media-preview-key';

function sameKeys(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const key of left) {
    if (!right.has(key)) {
      return false;
    }
  }
  return true;
}

function candidateSignature(candidates: WorkspaceMediaPreviewCandidate[]): string {
  return candidates
    .map(candidate => candidate.key)
    .sort()
    .join('\u0000');
}

/**
 * Keeps local media reads behind the presentation boundary. Only candidates
 * from the active filtered view can enter the queue, and modern WebViews must
 * also report the card inside the viewport overscan region.
 */
export function useWorkspaceMediaPreviewQueue({
  candidates,
  containerRef,
  enabled,
  imagePreviewResolver,
  mediaPreviewResolver,
  maxConcurrent = DEFAULT_MAX_CONCURRENT,
}: UseWorkspaceMediaPreviewQueueOptions): Record<string, WorkspaceMediaPreviewState> {
  const [previewStates, setPreviewStates] = React.useState<
    Record<string, WorkspaceMediaPreviewState>
  >({});
  const [eligibleKeys, setEligibleKeys] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [queueVersion, scheduleQueue] = React.useReducer(
    (version: number) => version + 1,
    0,
  );
  const isMountedRef = React.useRef(false);
  const queueEpochRef = React.useRef(0);
  const inFlightKeysRef = React.useRef<Set<string>>(new Set());
  const eligibleKeysRef = React.useRef(eligibleKeys);
  eligibleKeysRef.current = eligibleKeys;
  const readyOrderRef = React.useRef<string[]>([]);
  const candidateMap = React.useMemo(
    () => new Map(candidates.map(candidate => [candidate.key, candidate])),
    [candidates],
  );
  const signature = React.useMemo(
    () => candidateSignature(candidates),
    [candidates],
  );
  const candidatesRef = React.useRef(candidates);
  candidatesRef.current = candidates;
  const candidateMapRef = React.useRef(candidateMap);
  candidateMapRef.current = candidateMap;

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      queueEpochRef.current += 1;
    };
  }, []);

  React.useEffect(() => {
    queueEpochRef.current += 1;
    const activeCandidates = candidatesRef.current;
    const currentKeys = new Set(activeCandidates.map(candidate => candidate.key));
    readyOrderRef.current = readyOrderRef.current.filter(key => currentKeys.has(key));

    setPreviewStates(current => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([key, state]) => (
          currentKeys.has(key) && state.status !== 'loading'
        )),
      );
      const currentEntries = Object.entries(current);
      const nextEntries = Object.entries(next);
      if (
        currentEntries.length === nextEntries.length
        && currentEntries.every(([key, state]) => next[key] === state)
      ) {
        return current;
      }
      return next;
    });

    if (!enabled || activeCandidates.length === 0) {
      setEligibleKeys(current => (current.size === 0 ? current : new Set()));
      return;
    }

    const container = containerRef.current;
    const ownerWindow = container?.ownerDocument.defaultView;
    const IntersectionObserverConstructor = ownerWindow?.IntersectionObserver
      ?? globalThis.IntersectionObserver;

    if (!container) {
      const fallbackKeys = new Set(
        activeCandidates
          .slice(0, FALLBACK_VISIBLE_ITEM_LIMIT)
          .map(candidate => candidate.key),
      );
      setEligibleKeys(current => (
        sameKeys(current, fallbackKeys) ? current : fallbackKeys
      ));
      return;
    }

    if (typeof IntersectionObserverConstructor !== 'function') {
      const collectMountedFallbackKeys = () => {
        const fallbackKeys = new Set(
          Array.from(container.querySelectorAll<HTMLElement>(
            `[${PREVIEW_TARGET_ATTRIBUTE}]`,
          ))
            .map(target => target.getAttribute(PREVIEW_TARGET_ATTRIBUTE))
            .filter((key): key is string => Boolean(key && currentKeys.has(key)))
            .slice(0, FALLBACK_VISIBLE_ITEM_LIMIT),
        );
        setEligibleKeys(current => (
          sameKeys(current, fallbackKeys) ? current : fallbackKeys
        ));
      };
      collectMountedFallbackKeys();

      const MutationObserverConstructor = ownerWindow?.MutationObserver
        ?? globalThis.MutationObserver;
      if (typeof MutationObserverConstructor !== 'function') {
        return;
      }
      const mutationObserver = new MutationObserverConstructor(
        collectMountedFallbackKeys,
      );
      mutationObserver.observe(container, { childList: true, subtree: true });
      return () => mutationObserver.disconnect();
    }

    const observer = new IntersectionObserverConstructor((entries) => {
      const updates = entries
        .map(entry => ({
          eligible: entry.isIntersecting || entry.intersectionRatio > 0,
          key: (entry.target as HTMLElement).getAttribute(
            PREVIEW_TARGET_ATTRIBUTE,
          ),
        }))
        .filter((update): update is { eligible: boolean; key: string } => (
          Boolean(update.key && currentKeys.has(update.key))
        ));
      if (updates.length === 0) {
        return;
      }
      setEligibleKeys(current => {
        const next = new Set(
          Array.from(current).filter(key => currentKeys.has(key)),
        );
        for (const update of updates) {
          if (update.eligible) {
            next.add(update.key);
          } else {
            next.delete(update.key);
          }
        }
        return sameKeys(current, next) ? current : next;
      });
    }, {
      root: null,
      rootMargin: '320px 0px',
      threshold: 0.01,
    });

    const observeTarget = (target: HTMLElement) => {
      const key = target.getAttribute(PREVIEW_TARGET_ATTRIBUTE);
      if (key && currentKeys.has(key)) {
        observer.observe(target);
      }
    };
    const observeTargetsInside = (node: Node) => {
      const HTMLElementConstructor = ownerWindow?.HTMLElement;
      if (
        typeof HTMLElementConstructor !== 'function'
        || !(node instanceof HTMLElementConstructor)
      ) {
        return;
      }
      if (node.hasAttribute(PREVIEW_TARGET_ATTRIBUTE)) {
        observeTarget(node);
      }
      node.querySelectorAll<HTMLElement>(
        `[${PREVIEW_TARGET_ATTRIBUTE}]`,
      ).forEach(observeTarget);
    };
    const unobserveTargetsInside = (node: Node): string[] => {
      const HTMLElementConstructor = ownerWindow?.HTMLElement;
      if (
        typeof HTMLElementConstructor !== 'function'
        || !(node instanceof HTMLElementConstructor)
      ) {
        return [];
      }
      const targets: HTMLElement[] = [];
      if (node.hasAttribute(PREVIEW_TARGET_ATTRIBUTE)) {
        targets.push(node);
      }
      node.querySelectorAll<HTMLElement>(
        `[${PREVIEW_TARGET_ATTRIBUTE}]`,
      ).forEach(target => targets.push(target));
      const removedKeys: string[] = [];
      for (const target of targets) {
        observer.unobserve(target);
        const key = target.getAttribute(PREVIEW_TARGET_ATTRIBUTE);
        if (key && currentKeys.has(key)) {
          removedKeys.push(key);
        }
      }
      return removedKeys;
    };

    container.querySelectorAll<HTMLElement>(
      `[${PREVIEW_TARGET_ATTRIBUTE}]`,
    ).forEach(observeTarget);

    const MutationObserverConstructor = ownerWindow?.MutationObserver
      ?? globalThis.MutationObserver;
    const mutationObserver = typeof MutationObserverConstructor === 'function'
      ? new MutationObserverConstructor(records => {
        const removedKeys: string[] = [];
        for (const record of records) {
          record.removedNodes.forEach(node => {
            removedKeys.push(...unobserveTargetsInside(node));
          });
          record.addedNodes.forEach(observeTargetsInside);
        }
        if (removedKeys.length > 0) {
          setEligibleKeys(current => {
            const next = new Set(current);
            removedKeys.forEach(key => next.delete(key));
            return sameKeys(current, next) ? current : next;
          });
        }
      })
      : null;
    mutationObserver?.observe(container, { childList: true, subtree: true });

    setEligibleKeys(current => {
      const next = new Set(
        Array.from(current).filter(key => currentKeys.has(key)),
      );
      return sameKeys(current, next) ? current : next;
    });

    return () => {
      mutationObserver?.disconnect();
      observer.disconnect();
    };
  }, [containerRef, enabled, signature]);

  React.useEffect(() => {
    if (!enabled || maxConcurrent <= 0) {
      return;
    }

    const availableSlots = Math.max(
      0,
      maxConcurrent - inFlightKeysRef.current.size,
    );
    if (availableSlots === 0) {
      return;
    }

    const candidatesToLoad = candidates
      .filter(candidate => (
        eligibleKeys.has(candidate.key)
        && !previewStates[candidate.key]
        && !inFlightKeysRef.current.has(candidate.key)
      ))
      .slice(0, availableSlots);
    if (candidatesToLoad.length === 0) {
      return;
    }

    setPreviewStates(current => {
      const next = { ...current };
      for (const candidate of candidatesToLoad) {
        next[candidate.key] = { status: 'loading' };
      }
      return next;
    });

    for (const candidate of candidatesToLoad) {
      const requestEpoch = queueEpochRef.current;
      const resolver = candidate.kind === 'image'
        ? imagePreviewResolver
        : mediaPreviewResolver;
      inFlightKeysRef.current.add(candidate.key);
      let resolution: Promise<string | undefined>;
      try {
        resolution = Promise.resolve(resolver({
          filePath: candidate.filePath,
          extension: candidate.extension,
          kind: candidate.kind,
          modifiedAt: candidate.modifiedAt,
        }));
      } catch (error) {
        resolution = Promise.reject(error);
      }
      void resolution
        .then(resolvedUrl => {
          if (
            !isMountedRef.current
            || queueEpochRef.current !== requestEpoch
            || !candidateMapRef.current.has(candidate.key)
          ) {
            return;
          }
          setPreviewStates(current => {
            const next = {
              ...current,
              [candidate.key]: resolvedUrl
                ? { status: 'ready', url: resolvedUrl } as const
                : { status: 'failed' } as const,
            };
            if (!resolvedUrl) {
              return next;
            }

            const readyOrder = readyOrderRef.current.filter(
              key => key !== candidate.key && next[key]?.status === 'ready',
            );
            readyOrder.push(candidate.key);
            while (readyOrder.length > WORKSPACE_MEDIA_READY_PREVIEW_LIMIT) {
              const evictionIndex = readyOrder.findIndex(
                key => !eligibleKeysRef.current.has(key),
              );
              if (evictionIndex < 0) {
                break;
              }
              const [evictedKey] = readyOrder.splice(evictionIndex, 1);
              delete next[evictedKey];
            }
            readyOrderRef.current = readyOrder;
            return next;
          });
        })
        .catch(() => {
          if (
            !isMountedRef.current
            || queueEpochRef.current !== requestEpoch
            || !candidateMapRef.current.has(candidate.key)
          ) {
            return;
          }
          setPreviewStates(current => ({
            ...current,
            [candidate.key]: { status: 'failed' },
          }));
        })
        .finally(() => {
          inFlightKeysRef.current.delete(candidate.key);
          if (isMountedRef.current) {
            scheduleQueue();
          }
        });
    }
  }, [
    candidates,
    eligibleKeys,
    enabled,
    imagePreviewResolver,
    maxConcurrent,
    mediaPreviewResolver,
    previewStates,
    queueVersion,
  ]);

  return previewStates;
}
