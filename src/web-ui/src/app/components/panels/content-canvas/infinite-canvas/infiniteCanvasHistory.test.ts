/**
 * P4 W5: the pure undo / redo logic — diff capture, the reverse patch, the
 * staleness precondition that keeps history safe next to the media and ops
 * bridges, the depth cap, and the keyboard guards.
 */
import { describe, expect, it } from 'vitest';

import {
  applyHistoryEntryContent,
  captureUserEdit,
  emptyInfiniteCanvasHistory,
  historyShortcutFor,
  INFINITE_CANVAS_HISTORY_LIMIT,
  isEditableTarget,
  pushHistoryEntry,
} from './infiniteCanvasHistory';
import type {
  InfiniteCanvasDocument,
  InfiniteCanvasDocumentContent,
  InfiniteCanvasNode,
} from '@/shared/services/infinite-canvas';

const MEDIA_REF = { workspacePath: 'C:/ws', relativePath: 'media/generated/b1/image-001.png' };

function documentOf(
  nodes: InfiniteCanvasNode[],
  edges: InfiniteCanvasDocument['edges'] = [],
): InfiniteCanvasDocument {
  return {
    documentId: 'doc-1',
    schemaVersion: '1',
    workspaceId: 'workspace-1',
    revision: 1,
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: new Date(0).toISOString(),
  };
}

function card(nodeId: string, overrides: Partial<InfiniteCanvasNode> = {}): InfiniteCanvasNode {
  return { nodeId, kind: 'image', position: { x: 0, y: 0 }, prompt: '', ...overrides };
}

function contentOf(document: Readonly<InfiniteCanvasDocument>): InfiniteCanvasDocumentContent {
  return { nodes: document.nodes, edges: document.edges, viewport: document.viewport };
}

/** Records an edit and immediately undoes it, the way the panel does. */
function roundTrip(
  before: InfiniteCanvasDocument,
  after: InfiniteCanvasDocumentContent,
): InfiniteCanvasDocumentContent {
  const entry = captureUserEdit(before, after);
  if (!entry) throw new Error('expected the edit to be recorded');
  const applied = applyHistoryEntryContent({ ...before, ...after }, entry, 'undo');
  if (applied.status !== 'applied') throw new Error('expected the undo to apply');
  return applied.content;
}

describe('captureUserEdit', () => {
  it('records nothing when no node and no edge changed', () => {
    const document = documentOf([card('a')]);

    expect(captureUserEdit(document, contentOf(document))).toBeUndefined();
    // A pure viewport change is not an entry either — the diff never looks at
    // the viewport, which is exactly the plan's "panning is not an edit".
    expect(captureUserEdit(document, {
      ...contentOf(document),
      viewport: { x: 500, y: 500, zoom: 2 },
    })).toBeUndefined();
  });

  it('records only the entities the edit actually touched', () => {
    const document = documentOf([card('a'), card('b', { position: { x: 10, y: 10 } })]);

    const entry = captureUserEdit(document, {
      ...contentOf(document),
      nodes: [document.nodes[0], { ...document.nodes[1], position: { x: 99, y: 99 } }],
    });

    expect(entry?.nodeIds).toEqual(['b']);
    expect(entry?.edgeIds).toEqual([]);
    expect(entry?.before.nodes.b.position).toEqual({ x: 10, y: 10 });
    expect(entry?.after.nodes.b.position).toEqual({ x: 99, y: 99 });
  });

  it('is not fooled by key order differences', () => {
    const document = documentOf([card('a', { mediaRef: { ...MEDIA_REF } })]);
    const reordered: InfiniteCanvasNode = {
      mediaRef: { ...MEDIA_REF },
      prompt: '',
      position: { x: 0, y: 0 },
      kind: 'image',
      nodeId: 'a',
    };

    expect(captureUserEdit(document, { ...contentOf(document), nodes: [reordered] }))
      .toBeUndefined();
  });
});

describe('applyHistoryEntryContent', () => {
  it('undoes an added card and redoes it back', () => {
    const before = documentOf([card('a')]);
    const after: InfiniteCanvasDocumentContent = {
      ...contentOf(before),
      nodes: [...before.nodes, card('b')],
    };
    const entry = captureUserEdit(before, after)!;

    const undone = applyHistoryEntryContent({ ...before, ...after }, entry, 'undo');
    expect(undone.status).toBe('applied');
    if (undone.status !== 'applied') throw new Error('unreachable');
    expect(undone.content.nodes.map(node => node.nodeId)).toEqual(['a']);

    const redone = applyHistoryEntryContent(
      { ...before, ...undone.content },
      entry,
      'redo',
    );
    expect(redone.status).toBe('applied');
    if (redone.status !== 'applied') throw new Error('unreachable');
    expect(redone.content.nodes.map(node => node.nodeId)).toEqual(['a', 'b']);
  });

  it('brings a deleted card back whole, mediaRef included', () => {
    const before = documentOf([
      card('a', { mediaRef: { ...MEDIA_REF }, prompt: 'kept' }),
      card('b'),
    ]);
    const after: InfiniteCanvasDocumentContent = {
      ...contentOf(before),
      nodes: [before.nodes[1]],
    };

    const content = roundTrip(before, after);

    const restored = content.nodes.find(node => node.nodeId === 'a');
    expect(restored).toEqual(before.nodes[0]);
    expect(restored?.mediaRef).toEqual(MEDIA_REF);
  });

  it('restores a deleted card together with its edges', () => {
    const before = documentOf(
      [card('a'), card('b')],
      [{ edgeId: 'e1', sourceNodeId: 'a', targetNodeId: 'b' }],
    );
    const after: InfiniteCanvasDocumentContent = {
      nodes: [before.nodes[0]],
      edges: [],
      viewport: before.viewport,
    };

    const content = roundTrip(before, after);

    expect(content.nodes.map(node => node.nodeId).sort()).toEqual(['a', 'b']);
    expect(content.edges).toEqual([{ edgeId: 'e1', sourceNodeId: 'a', targetNodeId: 'b' }]);
  });

  it('puts a dragged card back where it started', () => {
    const before = documentOf([card('a', { position: { x: 5, y: 5 } })]);
    const after: InfiniteCanvasDocumentContent = {
      ...contentOf(before),
      nodes: [{ ...before.nodes[0], position: { x: 400, y: 220 } }],
    };

    expect(roundTrip(before, after).nodes[0].position).toEqual({ x: 5, y: 5 });
  });

  it('restores the previous prompt text', () => {
    const before = documentOf([card('a', { prompt: 'first' })]);
    const after: InfiniteCanvasDocumentContent = {
      ...contentOf(before),
      nodes: [{ ...before.nodes[0], prompt: 'second' }],
    };

    expect(roundTrip(before, after).nodes[0].prompt).toBe('first');
  });

  it('leaves everything the entry did not touch alone', () => {
    const before = documentOf([card('a'), card('b')]);
    const after: InfiniteCanvasDocumentContent = {
      ...contentOf(before),
      nodes: [{ ...before.nodes[0], prompt: 'edited' }, before.nodes[1]],
    };
    const entry = captureUserEdit(before, after)!;

    // Between the edit and the undo the agent added a card and a result
    // landed on an untouched one — neither may be rolled back.
    const meanwhile = documentOf([
      { ...before.nodes[0], prompt: 'edited' },
      { ...before.nodes[1], mediaRef: { ...MEDIA_REF } },
      card('agent-card'),
    ]);

    const applied = applyHistoryEntryContent(meanwhile, entry, 'undo');
    expect(applied.status).toBe('applied');
    if (applied.status !== 'applied') throw new Error('unreachable');
    expect(applied.content.nodes.map(node => node.nodeId))
      .toEqual(['a', 'b', 'agent-card']);
    expect(applied.content.nodes[0].prompt).toBe('');
    expect(applied.content.nodes[1].mediaRef).toEqual(MEDIA_REF);
  });

  it('reports stale when a touched card received media in the meantime', () => {
    const before = documentOf([card('a', { position: { x: 0, y: 0 } })]);
    const after: InfiniteCanvasDocumentContent = {
      ...contentOf(before),
      nodes: [{ ...before.nodes[0], position: { x: 300, y: 0 } }],
    };
    const entry = captureUserEdit(before, after)!;

    const filled = documentOf([{
      ...before.nodes[0],
      position: { x: 300, y: 0 },
      mediaRef: { ...MEDIA_REF },
    }]);

    expect(applyHistoryEntryContent(filled, entry, 'undo')).toEqual({ status: 'stale' });
  });

  it('reports stale when a touched card was deleted in the meantime', () => {
    const before = documentOf([card('a'), card('b')]);
    const after: InfiniteCanvasDocumentContent = {
      ...contentOf(before),
      nodes: [{ ...before.nodes[0], prompt: 'edited' }, before.nodes[1]],
    };
    const entry = captureUserEdit(before, after)!;

    expect(applyHistoryEntryContent(documentOf([card('b')]), entry, 'undo'))
      .toEqual({ status: 'stale' });
  });

  it('drops a restored edge whose other endpoint no longer exists', () => {
    const before = documentOf(
      [card('a'), card('b')],
      [{ edgeId: 'e1', sourceNodeId: 'a', targetNodeId: 'b' }],
    );
    const after: InfiniteCanvasDocumentContent = {
      nodes: before.nodes,
      edges: [],
      viewport: before.viewport,
    };
    const entry = captureUserEdit(before, after)!;

    // Card b is gone by the time the edge deletion is undone.
    const applied = applyHistoryEntryContent(
      documentOf([card('a')]),
      entry,
      'undo',
    );
    expect(applied.status).toBe('applied');
    if (applied.status !== 'applied') throw new Error('unreachable');
    expect(applied.content.edges).toEqual([]);
  });
});

describe('pushHistoryEntry', () => {
  function entryAt(index: number) {
    const before = documentOf([card('a', { prompt: String(index) })]);
    return captureUserEdit(before, {
      ...contentOf(before),
      nodes: [{ ...before.nodes[0], prompt: `${index}-edited` }],
    })!;
  }

  it('caps the stack at the configured depth, dropping the oldest', () => {
    let state = emptyInfiniteCanvasHistory();
    for (let index = 0; index < 60; index += 1) {
      state = pushHistoryEntry(state, entryAt(index));
    }

    expect(INFINITE_CANVAS_HISTORY_LIMIT).toBe(50);
    expect(state.undo).toHaveLength(50);
    expect(state.undo[0].before.nodes.a.prompt).toBe('10');
    expect(state.undo[49].before.nodes.a.prompt).toBe('59');
  });

  it('clears the redo branch whenever a new edit is recorded', () => {
    const state = { undo: [], redo: [entryAt(1)] };

    expect(pushHistoryEntry(state, entryAt(2)).redo).toEqual([]);
  });
});

describe('keyboard guards', () => {
  it('maps the undo and redo idioms of both platforms', () => {
    const base = { ctrlKey: false, metaKey: false, shiftKey: false };
    expect(historyShortcutFor({ ...base, key: 'z', ctrlKey: true })).toBe('undo');
    expect(historyShortcutFor({ ...base, key: 'Z', metaKey: true })).toBe('undo');
    expect(historyShortcutFor({ ...base, key: 'z', ctrlKey: true, shiftKey: true }))
      .toBe('redo');
    expect(historyShortcutFor({ ...base, key: 'y', ctrlKey: true })).toBe('redo');
    expect(historyShortcutFor({ ...base, key: 'z' })).toBeUndefined();
    expect(historyShortcutFor({ ...base, key: 'a', ctrlKey: true })).toBeUndefined();
    expect(historyShortcutFor({ ...base, key: 'z', ctrlKey: true, altKey: true }))
      .toBeUndefined();
  });

  it('treats text entry surfaces as owning their own undo', () => {
    expect(isEditableTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isEditableTarget({ tagName: 'input' })).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', closest: () => ({}) })).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', closest: () => null })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
