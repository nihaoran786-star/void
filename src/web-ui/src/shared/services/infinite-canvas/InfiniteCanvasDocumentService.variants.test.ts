/**
 * §7.6 parser slice: the gallery fields are additive, tolerated when broken,
 * and a pre-§7.6 document must round-trip through the parser untouched.
 */
import { describe, expect, it } from 'vitest';

import { parseInfiniteCanvasDocument } from './InfiniteCanvasDocumentService';

const WS = 'C:/ws';

function rawDocument(node: Record<string, unknown>): string {
  return JSON.stringify({
    documentId: 'doc-1',
    schemaVersion: '1',
    workspaceId: 'workspace-1',
    revision: 4,
    nodes: [{ nodeId: 'card-1', kind: 'image', position: { x: 10, y: 20 }, ...node }],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: '2026-08-28T00:00:00.000Z',
  });
}

function parseNodeOf(node: Record<string, unknown>) {
  const parsed = parseInfiniteCanvasDocument(rawDocument(node));
  if (parsed.status !== 'ok') throw new Error(`expected ok, got ${parsed.error.kind}`);
  return parsed.document.nodes[0];
}

describe('infinite canvas document parser — media variants (§7.6)', () => {
  it('loads a pre-7.6 single-picture card unchanged', () => {
    const node = parseNodeOf({ mediaRef: { workspacePath: WS, relativePath: 'a.png' } });
    expect(node.mediaRef).toEqual({ workspacePath: WS, relativePath: 'a.png' });
    expect(node.mediaVariants).toBeUndefined();
    expect(node.activeVariantIndex).toBeUndefined();
  });

  it('round-trips a gallery card', () => {
    const node = parseNodeOf({
      mediaRef: { workspacePath: WS, relativePath: 'b.png' },
      mediaVariants: [
        { workspacePath: WS, relativePath: 'a.png' },
        { workspacePath: WS, relativePath: 'b.png' },
        { workspacePath: WS, relativePath: 'c.png' },
      ],
      activeVariantIndex: 1,
    });
    expect(node.mediaVariants).toHaveLength(3);
    expect(node.activeVariantIndex).toBe(1);
    expect(node.mediaRef).toEqual({ workspacePath: WS, relativePath: 'b.png' });

    const again = parseInfiniteCanvasDocument(JSON.stringify({
      documentId: 'doc-1',
      schemaVersion: '1',
      workspaceId: 'workspace-1',
      revision: 4,
      nodes: [node],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: '2026-08-28T00:00:00.000Z',
    }));
    expect(again.status).toBe('ok');
    if (again.status === 'ok') expect(again.document.nodes[0]).toEqual(node);
  });

  it('repairs an index that disagrees with the mediaRef', () => {
    const node = parseNodeOf({
      mediaRef: { workspacePath: WS, relativePath: 'c.png' },
      mediaVariants: [
        { workspacePath: WS, relativePath: 'a.png' },
        { workspacePath: WS, relativePath: 'c.png' },
      ],
      activeVariantIndex: 0,
    });
    expect(node.activeVariantIndex).toBe(1);
    expect(node.mediaRef).toEqual({ workspacePath: WS, relativePath: 'c.png' });
  });

  it('drops a list that does not contain the current picture', () => {
    const node = parseNodeOf({
      mediaRef: { workspacePath: WS, relativePath: 'z.png' },
      mediaVariants: [{ workspacePath: WS, relativePath: 'a.png' }],
      activeVariantIndex: 0,
    });
    expect(node.mediaVariants).toBeUndefined();
    expect(node.mediaRef).toEqual({ workspacePath: WS, relativePath: 'z.png' });
  });

  it('drops a corrupted list whole instead of failing the document', () => {
    const node = parseNodeOf({
      mediaRef: { workspacePath: WS, relativePath: 'a.png' },
      mediaVariants: [{ workspacePath: WS, relativePath: 'a.png' }, { workspacePath: WS }],
      activeVariantIndex: 0,
    });
    expect(node.mediaVariants).toBeUndefined();
    expect(node.mediaRef).toEqual({ workspacePath: WS, relativePath: 'a.png' });
  });

  it('ignores a list on a card that carries no picture at all', () => {
    const node = parseNodeOf({
      mediaVariants: [{ workspacePath: WS, relativePath: 'a.png' }],
      activeVariantIndex: 0,
    });
    expect(node.mediaVariants).toBeUndefined();
    expect(node.mediaRef).toBeUndefined();
  });
});
