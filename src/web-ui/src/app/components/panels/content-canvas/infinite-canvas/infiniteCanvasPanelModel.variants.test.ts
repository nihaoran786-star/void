/**
 * §7.6 panel side: projecting a card's pictures and switching the current one.
 *
 * The switch is the only card-level change a landed picture allows, so the two
 * guards here are that the list survives it untouched and that a no-op switch
 * writes nothing at all — an entry the undo stack would otherwise record for a
 * change the user cannot see.
 */
import { describe, expect, it } from 'vitest';

import type { InfiniteCanvasDocument, InfiniteCanvasNode } from '@/shared/services/infinite-canvas';
import {
  setNodeActiveVariantContent,
  toFlowNodeViews,
} from './infiniteCanvasPanelModel';

const WS = 'C:/ws';

function ref(name: string) {
  return { workspacePath: WS, relativePath: `media/generated/${name}.png` };
}

function documentWith(node: InfiniteCanvasNode): InfiniteCanvasDocument {
  return {
    documentId: 'doc-1',
    schemaVersion: '1',
    workspaceId: 'workspace-1',
    revision: 1,
    nodes: [node],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: new Date(0).toISOString(),
  };
}

function galleryCard(): InfiniteCanvasNode {
  return {
    nodeId: 'card-1',
    kind: 'image',
    position: { x: 0, y: 0 },
    mediaRef: ref('a'),
    mediaVariants: [ref('a'), ref('b'), ref('c')],
    activeVariantIndex: 0,
  };
}

describe('§7.6 panel projection and the current picture', () => {
  it('projects a pre-§7.6 card as a list of one', () => {
    const views = toFlowNodeViews([{
      nodeId: 'card-1',
      kind: 'image',
      position: { x: 0, y: 0 },
      mediaRef: ref('a'),
    }]);

    expect(views[0].data.mediaVariants).toEqual([ref('a')]);
    expect(views[0].data.activeVariantIndex).toBe(0);
  });

  it('projects no list at all for a card with no picture', () => {
    const views = toFlowNodeViews([{ nodeId: 'card-1', kind: 'image', position: { x: 0, y: 0 } }]);

    expect(views[0].data.mediaVariants).toBeUndefined();
    expect(views[0].data.activeVariantIndex).toBeUndefined();
  });

  it('switches the current picture and leaves the list untouched', () => {
    const document = documentWith(galleryCard());

    const next = setNodeActiveVariantContent(document, 'card-1', 2);

    expect(next.nodes[0].mediaVariants).toEqual([ref('a'), ref('b'), ref('c')]);
    expect(next.nodes[0].activeVariantIndex).toBe(2);
    expect(next.nodes[0].mediaRef).toEqual(ref('c'));
  });

  it('writes nothing for an unknown card, an out-of-range index, or a no-op', () => {
    const document = documentWith(galleryCard());

    expect(setNodeActiveVariantContent(document, 'card-other', 1).nodes).toBe(document.nodes);
    expect(setNodeActiveVariantContent(document, 'card-1', 9).nodes).toBe(document.nodes);
    expect(setNodeActiveVariantContent(document, 'card-1', 0).nodes).toBe(document.nodes);
  });

  it('is exactly reversible, which is what makes it undoable', () => {
    const document = documentWith(galleryCard());

    const moved = setNodeActiveVariantContent(document, 'card-1', 2);
    const back = setNodeActiveVariantContent({ ...document, ...moved }, 'card-1', 0);

    expect(back.nodes[0]).toEqual(document.nodes[0]);
  });
});
