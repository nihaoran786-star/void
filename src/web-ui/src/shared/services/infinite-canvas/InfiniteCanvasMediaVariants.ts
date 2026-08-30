/**
 * One card, several pictures (visual language §7.6, owner 2026-08-28).
 *
 * A media card used to hold exactly one picture in `mediaRef`. It now holds an
 * ordered LIST of pictures plus a current item; `mediaRef` stays as the
 * compatibility outlet that always mirrors "the one the card face shows".
 *
 * Two rules rule this file, and every helper here exists to keep them true:
 *
 * 1. **Append, never overwrite.** No entry that is already in the list may be
 *    changed, replaced or removed. The never-overwrite invariant (PRD
 *    §3.4/§3.5) did not go away — it moved from "the single mediaRef" to
 *    "every entry of the list". Only the *current item* may move.
 * 2. **`mediaRef` and the list are always consistent.** `mediaRef` is exactly
 *    `variants[activeVariantIndex]`, and a one-picture card writes neither
 *    field, so documents written before §7.6 round-trip byte for byte.
 *
 * schemaVersion stays '1': both fields are additive and parsed tolerantly.
 */
import type { CanvasImageOperationKind, InfiniteCanvasNode } from './InfiniteCanvasTypes';

/** The shape both `mediaRef` and every list entry use. */
export interface InfiniteCanvasVariantRef {
  workspacePath: string;
  relativePath: string;
}

/** Node fields this module owns; kept narrow so any node-like value fits. */
type VariantCarrier = Pick<
  InfiniteCanvasNode,
  'mediaRef' | 'mediaVariants' | 'activeVariantIndex'
>;

function variantKey(ref: InfiniteCanvasVariantRef): string {
  return `${ref.workspacePath}\u0000${ref.relativePath}`;
}

/**
 * The card's pictures, oldest first.
 *
 * A pre-§7.6 card (only `mediaRef`) reads as a list of exactly one, which is
 * what makes every old document behave unchanged without a migration.
 */
export function infiniteCanvasNodeVariants(
  node: Readonly<VariantCarrier>,
): readonly InfiniteCanvasVariantRef[] {
  if (node.mediaVariants && node.mediaVariants.length > 0) return node.mediaVariants;
  return node.mediaRef ? [node.mediaRef] : [];
}

/** Index of the picture the card face shows; 0 for a one-picture card. */
export function infiniteCanvasActiveVariantIndex(node: Readonly<VariantCarrier>): number {
  const variants = infiniteCanvasNodeVariants(node);
  if (variants.length === 0) return 0;
  const index = node.activeVariantIndex ?? 0;
  if (!Number.isInteger(index) || index < 0 || index >= variants.length) return 0;
  return index;
}

/**
 * Writes a variant list and a current item onto a node, normalized.
 *
 * Normalization is what keeps rule 2 true everywhere: the index is clamped,
 * `mediaRef` is re-derived from it, and a list of one drops both new fields so
 * the node is written exactly the way it was before §7.6 existed.
 */
export function withInfiniteCanvasVariants<TNode extends VariantCarrier>(
  node: TNode,
  variants: readonly InfiniteCanvasVariantRef[],
  activeIndex: number,
): TNode {
  const {
    mediaRef: _mediaRef,
    mediaVariants: _mediaVariants,
    activeVariantIndex: _activeVariantIndex,
    ...rest
  } = node;
  if (variants.length === 0) return rest as TNode;
  const index = Number.isInteger(activeIndex) && activeIndex >= 0 && activeIndex < variants.length
    ? activeIndex
    : 0;
  const current = variants[index];
  const base = {
    ...rest,
    mediaRef: { workspacePath: current.workspacePath, relativePath: current.relativePath },
  } as TNode;
  if (variants.length === 1) return base;
  return {
    ...base,
    mediaVariants: variants.map(ref => ({
      workspacePath: ref.workspacePath,
      relativePath: ref.relativePath,
    })),
    activeVariantIndex: index,
  } as TNode;
}

/**
 * Appends produced pictures to a card, in the order given.
 *
 * Entries the card already carries are skipped, which is the whole idempotency
 * story for replayed tool-run events and for the reconciliation pass running
 * over a batch that already landed. The first genuinely new picture becomes the
 * current item — a regenerate shows its result — and when nothing is new the
 * very same node object comes back, so callers can keep reading identity as
 * "nothing happened".
 */
export function appendInfiniteCanvasVariants<TNode extends VariantCarrier>(
  node: TNode,
  refs: readonly InfiniteCanvasVariantRef[],
): TNode {
  const existing = infiniteCanvasNodeVariants(node);
  const seen = new Set(existing.map(variantKey));
  const next = [...existing];
  let firstNewIndex: number | undefined;
  for (const ref of refs) {
    if (!ref.relativePath.trim()) continue;
    const key = variantKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    if (firstNewIndex === undefined) firstNewIndex = next.length;
    next.push({ workspacePath: ref.workspacePath, relativePath: ref.relativePath });
  }
  if (firstNewIndex === undefined) return node;
  return withInfiniteCanvasVariants(node, next, firstNewIndex);
}

/**
 * Moves the current item. The list itself is untouched — this is the one
 * card-level change §7.6 allows, and an out-of-range index is ignored.
 */
export function setInfiniteCanvasActiveVariant<TNode extends VariantCarrier>(
  node: TNode,
  index: number,
): TNode {
  const variants = infiniteCanvasNodeVariants(node);
  if (variants.length === 0) return node;
  if (!Number.isInteger(index) || index < 0 || index >= variants.length) return node;
  if (infiniteCanvasActiveVariantIndex(node) === index) return node;
  return withInfiniteCanvasVariants(node, variants, index);
}

/**
 * §7.6's landing rule, as one predicate: does a result of this operation kind
 * pile up on the card it was fired from?
 *
 * Only plain generation does. The five tools (inpaint / erase / matting /
 * expand / upscale) and the local crop turn a picture into a DIFFERENT
 * picture, and §7.6 keeps their lineage visible by giving each its own card.
 */
export function infiniteCanvasOperationAccumulates(
  toolId: CanvasImageOperationKind | undefined,
): boolean {
  return toolId === 'generate';
}

/**
 * May this registered generation land on a card that already holds pictures?
 *
 * Before §7.6 the answer was always no, and that "no" was the never-overwrite
 * guard in the media bridge. It is now yes for exactly one shape — a
 * regenerate fired at the card itself — and every other event still bounces
 * off a card that carries media.
 */
export function infiniteCanvasGenerationAppendsToCard(
  generation: InfiniteCanvasNode['generation'],
): boolean {
  return generation !== undefined
    && generation.resultMode === 'self'
    && infiniteCanvasOperationAccumulates(generation.toolId);
}
