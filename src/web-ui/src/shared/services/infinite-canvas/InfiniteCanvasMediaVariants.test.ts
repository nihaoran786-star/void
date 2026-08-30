/**
 * §7.6 data contract: a card holds a LIST of pictures plus a current item.
 *
 * The guards here are the ones the rule stands on — append-only, `mediaRef`
 * always mirroring the current item, and a one-picture card staying byte-for-
 * byte the pre-§7.6 shape so old documents are untouched.
 */
import { describe, expect, it } from 'vitest';

import {
  appendInfiniteCanvasVariants,
  infiniteCanvasActiveVariantIndex,
  infiniteCanvasGenerationAppendsToCard,
  infiniteCanvasNodeVariants,
  infiniteCanvasOperationAccumulates,
  setInfiniteCanvasActiveVariant,
  withInfiniteCanvasVariants,
} from './InfiniteCanvasMediaVariants';
import type { InfiniteCanvasNode } from './InfiniteCanvasTypes';

const WS = 'C:/ws';

function ref(name: string): { workspacePath: string; relativePath: string } {
  return { workspacePath: WS, relativePath: `media/generated/${name}.png` };
}

function card(overrides: Partial<InfiniteCanvasNode> = {}): InfiniteCanvasNode {
  return {
    nodeId: 'card-1',
    kind: 'image',
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

describe('infinite canvas media variants', () => {
  it('reads a pre-7.6 single-picture card as a list of one', () => {
    const node = card({ mediaRef: ref('a') });
    expect(infiniteCanvasNodeVariants(node)).toEqual([ref('a')]);
    expect(infiniteCanvasActiveVariantIndex(node)).toBe(0);
  });

  it('reads a card without media as an empty list', () => {
    expect(infiniteCanvasNodeVariants(card())).toEqual([]);
  });

  it('keeps a one-picture card in the pre-7.6 shape', () => {
    const node = withInfiniteCanvasVariants(card(), [ref('a')], 0);
    expect(node.mediaRef).toEqual(ref('a'));
    expect(node.mediaVariants).toBeUndefined();
    expect(node.activeVariantIndex).toBeUndefined();
  });

  it('keeps mediaRef equal to the current variant', () => {
    const node = withInfiniteCanvasVariants(card(), [ref('a'), ref('b'), ref('c')], 2);
    expect(node.mediaVariants).toHaveLength(3);
    expect(node.activeVariantIndex).toBe(2);
    expect(node.mediaRef).toEqual(ref('c'));
  });

  it('clamps an out-of-range current item to the first picture', () => {
    const node = withInfiniteCanvasVariants(card(), [ref('a'), ref('b')], 9);
    expect(node.activeVariantIndex).toBe(0);
    expect(node.mediaRef).toEqual(ref('a'));
  });

  it('appends in order and shows the first new picture', () => {
    const first = appendInfiniteCanvasVariants(card(), [ref('a')]);
    const second = appendInfiniteCanvasVariants(first, [ref('b'), ref('c')]);
    expect(second.mediaVariants).toEqual([ref('a'), ref('b'), ref('c')]);
    expect(second.activeVariantIndex).toBe(1);
    expect(second.mediaRef).toEqual(ref('b'));
  });

  it('never replaces an existing picture', () => {
    const before = withInfiniteCanvasVariants(card(), [ref('a'), ref('b')], 0);
    const after = appendInfiniteCanvasVariants(before, [ref('c')]);
    expect(after.mediaVariants?.slice(0, 2)).toEqual([ref('a'), ref('b')]);
    expect(after.mediaVariants).toHaveLength(3);
  });

  it('is a no-op on a picture the card already carries', () => {
    const before = withInfiniteCanvasVariants(card(), [ref('a'), ref('b')], 1);
    const after = appendInfiniteCanvasVariants(before, [ref('a'), ref('b')]);
    expect(after).toBe(before);
  });

  it('appends only the pictures that are new', () => {
    const before = withInfiniteCanvasVariants(card(), [ref('a')], 0);
    const after = appendInfiniteCanvasVariants(before, [ref('a'), ref('b')]);
    expect(after.mediaVariants).toEqual([ref('a'), ref('b')]);
    expect(after.mediaRef).toEqual(ref('b'));
  });

  it('moves the current item without touching the list', () => {
    const before = withInfiniteCanvasVariants(card(), [ref('a'), ref('b'), ref('c')], 2);
    const after = setInfiniteCanvasActiveVariant(before, 0);
    expect(after.mediaVariants).toEqual(before.mediaVariants);
    expect(after.activeVariantIndex).toBe(0);
    expect(after.mediaRef).toEqual(ref('a'));
  });

  it('ignores an out-of-range or unchanged current item', () => {
    const before = withInfiniteCanvasVariants(card(), [ref('a'), ref('b')], 1);
    expect(setInfiniteCanvasActiveVariant(before, 7)).toBe(before);
    expect(setInfiniteCanvasActiveVariant(before, -1)).toBe(before);
    expect(setInfiniteCanvasActiveVariant(before, 1)).toBe(before);
  });

  it('accumulates only for plain generation', () => {
    expect(infiniteCanvasOperationAccumulates('generate')).toBe(true);
    for (const toolId of ['inpaint', 'erase', 'crop', 'expand', 'upscale', 'matting'] as const) {
      expect(infiniteCanvasOperationAccumulates(toolId)).toBe(false);
    }
    expect(infiniteCanvasOperationAccumulates(undefined)).toBe(false);
  });

  it('lets only a self-mode regenerate land on a card that already has media', () => {
    expect(infiniteCanvasGenerationAppendsToCard({
      operationId: 'op-1', toolId: 'generate', resultMode: 'self', status: 'pending',
    })).toBe(true);
    expect(infiniteCanvasGenerationAppendsToCard({
      operationId: 'op-1', toolId: 'generate', resultMode: 'derived', status: 'pending',
    })).toBe(false);
    expect(infiniteCanvasGenerationAppendsToCard({
      operationId: 'op-1', toolId: 'inpaint', resultMode: 'self', status: 'pending',
    })).toBe(false);
    expect(infiniteCanvasGenerationAppendsToCard(undefined)).toBe(false);
  });
});
