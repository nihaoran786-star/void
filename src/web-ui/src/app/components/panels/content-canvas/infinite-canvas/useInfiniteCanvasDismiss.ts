/**
 * One dismissal contract for every transient surface on the Infinite Canvas
 * (owner feedback 2026-08-26).
 *
 * The owner asked for the "Close" buttons to go: a popover, a picker or the
 * full-screen viewer closes by pressing outside it or by pressing Escape, and
 * nothing else. Rather than repeating that in each component — three pickers
 * and a viewer had grown four slightly different versions of it — every
 * surface calls this hook and gets identical behaviour.
 *
 * Notes on the details that matter:
 * - The press listener is `mousedown` in the CAPTURE phase, so a surface
 *   closes as soon as the user presses somewhere else, before that press turns
 *   into a click on whatever is underneath.
 * - `ignore` exists for the control that opened the surface. Without it the
 *   opening button could never close its own surface: the press would dismiss
 *   and the click would immediately re-open.
 * - `inside` lets a surface be non-contiguous — the viewer's media is one
 *   element and its chrome another, and pressing either must not close.
 *
 * Pure interaction plumbing: it owns no state and touches no document data.
 */
import React from 'react';

/**
 * What a board-filling editor must treat as part of itself: the anchored
 * popovers, pickers and confirmations it opens all mount as siblings of the
 * editor rather than children of it.
 */
export const EDITOR_INSIDE_SELECTORS = [
  '.infinite-canvas-popover',
  '.infinite-canvas-picker',
  '.infinite-canvas-dialog',
] as const;

/**
 * An element, or a ref to one. Refs are resolved at event time, so a surface
 * can name a region that had not mounted yet when the hook was called.
 */
export type InfiniteCanvasDismissTarget =
  | Element
  | { readonly current: Element | null }
  | null
  | undefined;

export interface InfiniteCanvasDismissOptions {
  /** Called on an outside press or on Escape. */
  onDismiss: () => void;
  /** Set false to unhook without unmounting the surface. */
  enabled?: boolean;
  /** Further regions that count as part of the surface. */
  inside?: readonly InfiniteCanvasDismissTarget[];
  /**
   * CSS selectors whose matches (or ancestors) count as part of the surface,
   * for regions this surface cannot hold a ref to.
   *
   * The board-filling editors need this: their pill and their shared generator
   * open the ordinary canvas popovers (parameters, model), which mount as
   * siblings of the editor rather than inside it. Without this, pressing a
   * choice in the popover the editor itself opened would read as "pressed
   * outside" and close the editor underneath it.
   */
  insideSelectors?: readonly string[];
  /** The control that opened the surface; a press there must not dismiss. */
  ignore?: readonly InfiniteCanvasDismissTarget[];
}

/**
 * Duck-typed on purpose. `instanceof Element` is wrong here: tests build their
 * own JSDOM window, whose `Element` is a different constructor from the
 * ambient one, and the check would silently report "outside" for every node.
 */
function resolveTarget(target: InfiniteCanvasDismissTarget): Element | null {
  if (!target) return null;
  if (typeof (target as Element).contains === 'function') return target as Element;
  return (target as { current: Element | null }).current ?? null;
}

function isNode(value: EventTarget | null): value is Node {
  return Boolean(value) && typeof (value as Node).nodeType === 'number';
}

/**
 * Adversarial review C4: Escape closes ONE thing — the last one opened.
 *
 * An outside press picks its own victim (everything else contains the press),
 * but a key press has no such geometry: every mounted surface used to see the
 * same Escape and dismiss itself. Opening a parameter popover inside the
 * outpainting or mask editor and pressing Escape therefore closed both, and
 * the frame the user had spent a minute dragging — or the marks they had spent
 * a minute painting — went with it, silently.
 *
 * So the hooks keep a registration stack and only its top handles Escape. The
 * top is the most recently mounted surface, which is exactly "the last thing
 * the user opened"; the next press reaches the one underneath.
 */
const escapeStack: object[] = [];

/**
 * Returns the ref to put on the surface. Everything outside it (and outside
 * `inside` / `ignore`) dismisses on press; Escape always dismisses.
 */
export function useInfiniteCanvasDismiss<T extends Element = HTMLElement>(
  options: InfiniteCanvasDismissOptions,
): React.MutableRefObject<T | null> {
  const surfaceRef = React.useRef<T | null>(null);
  const latest = React.useRef(options);
  latest.current = options;
  /** This surface's identity in the Escape stack; stable for its lifetime. */
  const token = React.useRef({}).current;

  const enabled = options.enabled !== false;

  React.useEffect(() => {
    if (!enabled) return undefined;
    const ownerDocument = surfaceRef.current?.ownerDocument
      ?? (typeof document === 'undefined' ? undefined : document);
    if (!ownerDocument) return undefined;

    const isWithin = (target: EventTarget | null): boolean => {
      if (!isNode(target)) return false;
      const { inside, ignore, insideSelectors } = latest.current;
      const element = (target as Partial<Element>).closest
        ? (target as Element)
        : (target as Node).parentElement;
      if (insideSelectors?.length && element?.closest) {
        if (insideSelectors.some(selector => element.closest(selector))) return true;
      }
      const candidates: InfiniteCanvasDismissTarget[] = [
        surfaceRef.current,
        ...(inside ?? []),
        ...(ignore ?? []),
      ];
      return candidates.some(candidate => {
        const element = resolveTarget(candidate);
        return Boolean(element) && (element === target || element!.contains(target));
      });
    };

    const onPress = (event: Event) => {
      if (isWithin(event.target)) return;
      latest.current.onDismiss();
    };
    const onKeyDown = (event: Event) => {
      if ((event as KeyboardEvent).key !== 'Escape') return;
      // Somebody outside this hook already took the press.
      if (event.defaultPrevented) return;
      // Only the top of the stack answers, so one Escape closes one surface.
      if (escapeStack[escapeStack.length - 1] !== token) return;
      // A press landing inside another registered surface belongs to that
      // surface, never to this one.
      const { insideSelectors } = latest.current;
      const target = event.target;
      if (insideSelectors?.length && isNode(target)) {
        const element = (target as Partial<Element>).closest
          ? (target as Element)
          : (target as Node).parentElement;
        if (element?.closest && !surfaceRef.current?.contains(target)
          && insideSelectors.some(selector => element.closest(selector))) {
          return;
        }
      }
      event.preventDefault();
      latest.current.onDismiss();
    };

    escapeStack.push(token);
    ownerDocument.addEventListener('mousedown', onPress, true);
    ownerDocument.addEventListener('keydown', onKeyDown, true);
    return () => {
      const index = escapeStack.lastIndexOf(token);
      if (index >= 0) escapeStack.splice(index, 1);
      ownerDocument.removeEventListener('mousedown', onPress, true);
      ownerDocument.removeEventListener('keydown', onKeyDown, true);
    };
  }, [enabled, token]);

  return surfaceRef;
}
