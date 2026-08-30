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

  /**
   * Adversarial review P3: parsing must repair, never delete.
   *
   * The next save writes back whatever the parser produced, so a list the
   * parser drops is a list the user loses for good. Every readable picture
   * has to survive.
   */
  it('merges a current picture the list has lost, instead of dropping the list', () => {
    const node = parseNodeOf({
      mediaRef: { workspacePath: WS, relativePath: 'z.png' },
      mediaVariants: [{ workspacePath: WS, relativePath: 'a.png' }],
      activeVariantIndex: 0,
    });
    expect(node.mediaVariants).toEqual([
      { workspacePath: WS, relativePath: 'a.png' },
      { workspacePath: WS, relativePath: 'z.png' },
    ]);
    // mediaRef is immutable and still points at what the card was showing.
    expect(node.mediaRef).toEqual({ workspacePath: WS, relativePath: 'z.png' });
    expect(node.activeVariantIndex).toBe(1);
  });

  it('keeps every readable picture when one entry is corrupted', () => {
    const node = parseNodeOf({
      mediaRef: { workspacePath: WS, relativePath: 'a.png' },
      mediaVariants: [
        { workspacePath: WS, relativePath: 'a.png' },
        { workspacePath: WS },
        { workspacePath: WS, relativePath: 'b.png' },
        'nonsense',
        { workspacePath: WS, relativePath: 'c.png' },
      ],
      activeVariantIndex: 0,
    });
    expect(node.mediaVariants).toEqual([
      { workspacePath: WS, relativePath: 'a.png' },
      { workspacePath: WS, relativePath: 'b.png' },
      { workspacePath: WS, relativePath: 'c.png' },
    ]);
    expect(node.activeVariantIndex).toBe(0);
    expect(node.mediaRef).toEqual({ workspacePath: WS, relativePath: 'a.png' });
  });

  it('drops a duplicate entry rather than the list, keeping append-only true', () => {
    const node = parseNodeOf({
      mediaRef: { workspacePath: WS, relativePath: 'b.png' },
      mediaVariants: [
        { workspacePath: WS, relativePath: 'a.png' },
        { workspacePath: WS, relativePath: 'b.png' },
        { workspacePath: WS, relativePath: 'a.png' },
      ],
      activeVariantIndex: 1,
    });
    expect(node.mediaVariants).toEqual([
      { workspacePath: WS, relativePath: 'a.png' },
      { workspacePath: WS, relativePath: 'b.png' },
    ]);
    expect(node.activeVariantIndex).toBe(1);
  });

  it('rebuilds a lost current picture from the list rather than losing the card', () => {
    const node = parseNodeOf({
      mediaVariants: [
        { workspacePath: WS, relativePath: 'a.png' },
        { workspacePath: WS, relativePath: 'b.png' },
      ],
      activeVariantIndex: 1,
    });
    expect(node.mediaRef).toEqual({ workspacePath: WS, relativePath: 'b.png' });
    expect(node.mediaVariants).toEqual([
      { workspacePath: WS, relativePath: 'a.png' },
      { workspacePath: WS, relativePath: 'b.png' },
    ]);
    expect(node.activeVariantIndex).toBe(1);
  });

  it('reads a list of one as the single-picture card it already is', () => {
    const node = parseNodeOf({
      mediaVariants: [{ workspacePath: WS, relativePath: 'a.png' }],
      activeVariantIndex: 0,
    });
    expect(node.mediaRef).toEqual({ workspacePath: WS, relativePath: 'a.png' });
    expect(node.mediaVariants).toBeUndefined();
    expect(node.activeVariantIndex).toBeUndefined();
  });
});
