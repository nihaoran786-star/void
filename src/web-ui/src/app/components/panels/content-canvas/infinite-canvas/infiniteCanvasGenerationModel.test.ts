import { describe, expect, it } from 'vitest';

import type { InfiniteCanvasDocument } from '@/shared/services/infinite-canvas';
import { parseInfiniteCanvasDocument } from '@/shared/services/infinite-canvas';

import {
  addBlankGenerationCardContent,
  beginSelfGenerationContent,
  collectReferenceNodes,
  setNodePromptContent,
} from './infiniteCanvasGenerationModel';
import {
  beginDerivedOperationContent,
  connectNodesContent,
  removeEdgesContent,
} from './infiniteCanvasPanelModel';

const MEDIA_REF_A = { workspacePath: 'C:/ws', relativePath: 'media/input/a.png' };
const MEDIA_REF_B = { workspacePath: 'C:/ws', relativePath: 'media/input/b.png' };
const MEDIA_REF_TARGET = { workspacePath: 'C:/ws', relativePath: 'media/input/t.png' };

function makeDocument(
  overrides: Partial<InfiniteCanvasDocument> = {},
): InfiniteCanvasDocument {
  return {
    documentId: 'doc-1',
    schemaVersion: '1',
    workspaceId: 'workspace-1',
    revision: 1,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe('infiniteCanvasGenerationModel', () => {
  describe('addBlankGenerationCardContent', () => {
    it('adds an image card with an empty prompt and no mediaRef', () => {
      const next = addBlankGenerationCardContent(makeDocument(), 'blank-1', { x: 10, y: 20 });
      expect(next.nodes).toEqual([
        { nodeId: 'blank-1', kind: 'image', position: { x: 10, y: 20 }, prompt: '' },
      ]);
    });

    it('is idempotent on an existing nodeId', () => {
      const document = makeDocument();
      const first = addBlankGenerationCardContent(document, 'blank-1', { x: 0, y: 0 });
      const again = addBlankGenerationCardContent(
        { ...document, nodes: first.nodes }, 'blank-1', { x: 99, y: 99 },
      );
      expect(again.nodes).toEqual(first.nodes);
    });
  });

  describe('setNodePromptContent', () => {
    it('writes the prompt only on the addressed image card', () => {
      const document = makeDocument({
        nodes: [
          { nodeId: 'img', kind: 'image', position: { x: 0, y: 0 }, prompt: '' },
          { nodeId: 'txt', kind: 'text', position: { x: 0, y: 0 }, text: '' },
        ],
      });

      const next = setNodePromptContent(document, 'img', 'a lighthouse at dawn');
      expect(next.nodes[0]).toMatchObject({ prompt: 'a lighthouse at dawn' });

      const textUntouched = setNodePromptContent(document, 'txt', 'nope');
      expect(textUntouched.nodes[1]).not.toHaveProperty('prompt');
    });
  });

  describe('beginSelfGenerationContent', () => {
    it('registers a pending self generation on a blank card', () => {
      const document = makeDocument({
        nodes: [{ nodeId: 'blank-1', kind: 'image', position: { x: 0, y: 0 }, prompt: 'p' }],
      });

      const next = beginSelfGenerationContent(document, 'blank-1', 'op-1');

      expect(next.nodes[0].generation).toEqual({
        operationId: 'op-1',
        toolId: 'generate',
        resultMode: 'self',
        status: 'pending',
      });
    });

    it('rejects a card that already has a mediaRef, field for field', () => {
      const node = {
        nodeId: 'img',
        kind: 'image' as const,
        position: { x: 1, y: 2 },
        mediaRef: { ...MEDIA_REF_A },
        prompt: 'existing',
      };
      const document = makeDocument({ nodes: [node] });

      const next = beginSelfGenerationContent(document, 'img', 'op-1');

      expect(next.nodes).toEqual([node]);
      expect(next.nodes[0]).not.toHaveProperty('generation');
    });

    it('rejects missing and non-image nodes', () => {
      const document = makeDocument({
        nodes: [{ nodeId: 'txt', kind: 'text', position: { x: 0, y: 0 }, text: '' }],
      });
      expect(beginSelfGenerationContent(document, 'missing', 'op-1').nodes)
        .toEqual(document.nodes);
      expect(beginSelfGenerationContent(document, 'txt', 'op-1').nodes)
        .toEqual(document.nodes);
    });

    it('is a no-op for the same operationId but lets a new one retry', () => {
      const document = makeDocument({
        nodes: [{ nodeId: 'blank-1', kind: 'image', position: { x: 0, y: 0 }, prompt: 'p' }],
      });
      const first = beginSelfGenerationContent(document, 'blank-1', 'op-1');
      const withPending = { ...document, nodes: first.nodes };

      const samAgain = beginSelfGenerationContent(withPending, 'blank-1', 'op-1');
      expect(samAgain.nodes).toEqual(first.nodes);

      const retried = beginSelfGenerationContent(withPending, 'blank-1', 'op-2');
      expect(retried.nodes[0].generation).toMatchObject({
        operationId: 'op-2',
        status: 'pending',
      });
    });
  });

  describe('collectReferenceNodes', () => {
    function makeReferenceDocument(): InfiniteCanvasDocument {
      const base = makeDocument({
        nodes: [
          { nodeId: 'ref-a', kind: 'image', position: { x: 0, y: 0 }, mediaRef: { ...MEDIA_REF_A } },
          { nodeId: 'ref-b', kind: 'image', position: { x: 0, y: 0 }, mediaRef: { ...MEDIA_REF_B } },
          {
            nodeId: 'target',
            kind: 'image',
            position: { x: 0, y: 0 },
            mediaRef: { ...MEDIA_REF_TARGET },
            prompt: '@图一 composition, @图二 palette',
          },
        ],
      });
      let edges = connectNodesContent(base, 'e-a', 'ref-a', 'target').edges;
      edges = connectNodesContent({ ...base, edges }, 'e-b', 'ref-b', 'target').edges;
      return { ...base, edges };
    }

    it('orders references by edge creation order and excludes the target itself', () => {
      const document = makeReferenceDocument();

      const result = collectReferenceNodes(document, 'target');

      expect(result).toEqual({
        status: 'ok',
        references: [
          { order: 1, nodeId: 'ref-a', mediaRef: MEDIA_REF_A },
          { order: 2, nodeId: 'ref-b', mediaRef: MEDIA_REF_B },
        ],
      });
    });

    it('re-orders after an edge is removed and re-connected', () => {
      const document = makeReferenceDocument();

      // Remove the ref-a line, then reconnect it: ref-a moves to the back.
      const removed = removeEdgesContent(document, ['e-a']);
      const reconnected = connectNodesContent(
        { ...document, edges: removed.edges }, 'e-a2', 'ref-a', 'target',
      );

      const result = collectReferenceNodes(
        { ...document, edges: reconnected.edges }, 'target',
      );

      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.references.map(reference => reference.nodeId))
        .toEqual(['ref-b', 'ref-a']);
      expect(result.references.map(reference => reference.order)).toEqual([1, 2]);
    });

    it('skips self-referencing edges so cycles are harmless', () => {
      const document = makeReferenceDocument();
      const withSelfEdge = {
        ...document,
        edges: [
          { edgeId: 'e-self', sourceNodeId: 'target', targetNodeId: 'target' },
          ...document.edges,
        ],
      };

      const result = collectReferenceNodes(withSelfEdge, 'target');

      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.references.map(reference => reference.nodeId))
        .toEqual(['ref-a', 'ref-b']);
    });

    it('returns a typed reference-not-ready error when a reference has no image', () => {
      const document = makeReferenceDocument();
      const withBlankRef = {
        ...document,
        nodes: [
          ...document.nodes,
          { nodeId: 'ref-blank', kind: 'image' as const, position: { x: 0, y: 0 }, prompt: '' },
        ],
        edges: [
          ...document.edges,
          { edgeId: 'e-blank', sourceNodeId: 'ref-blank', targetNodeId: 'target' },
        ],
      };

      expect(collectReferenceNodes(withBlankRef, 'target')).toEqual({
        status: 'error',
        error: { kind: 'reference-not-ready', nodeId: 'ref-blank' },
      });
    });

    it('collects nothing for a card without incoming edges', () => {
      const document = makeReferenceDocument();
      expect(collectReferenceNodes(document, 'ref-a')).toEqual({
        status: 'ok',
        references: [],
      });
    });

    it('skips version-tree edges: a derived card regenerates without references', () => {
      // Regenerate derives 'derived-1' from 'target'; the version-tree edge it
      // writes must never turn the source into a 垫图 reference.
      const document = makeReferenceDocument();
      const begun = beginDerivedOperationContent(
        document, 'target', 'generate', 'op-regen', 'derived-1', 'edge-derived',
      );

      const result = collectReferenceNodes(
        { ...document, nodes: begun.nodes, edges: begun.edges },
        'derived-1',
      );

      expect(result).toEqual({ status: 'ok', references: [] });
    });

    it('still collects a manual connection into a derived card', () => {
      const document = makeReferenceDocument();
      const begun = beginDerivedOperationContent(
        document, 'target', 'generate', 'op-regen', 'derived-1', 'edge-derived',
      );
      const withDerived = { ...document, nodes: begun.nodes, edges: begun.edges };
      const connected = connectNodesContent(withDerived, 'e-manual', 'ref-a', 'derived-1');

      const result = collectReferenceNodes(
        { ...withDerived, edges: connected.edges },
        'derived-1',
      );

      expect(result).toEqual({
        status: 'ok',
        references: [{ order: 1, nodeId: 'ref-a', mediaRef: MEDIA_REF_A }],
      });
    });

    it('keeps counting unmarked pre-role edges as references (old-document compat)', () => {
      // Documents written before the role field carry unmarked derivation
      // edges; the recorded trade-off is that those still count as references.
      const document = makeReferenceDocument();
      const legacy = {
        ...document,
        nodes: [
          ...document.nodes,
          {
            nodeId: 'legacy-derived',
            kind: 'image' as const,
            position: { x: 0, y: 0 },
            derivedFrom: { sourceNodeId: 'ref-a', toolId: 'generate' as const, operationId: 'op-old' },
          },
        ],
        edges: [
          ...document.edges,
          { edgeId: 'e-legacy', sourceNodeId: 'ref-a', targetNodeId: 'legacy-derived' },
        ],
      };

      expect(collectReferenceNodes(legacy, 'legacy-derived')).toEqual({
        status: 'ok',
        references: [{ order: 1, nodeId: 'ref-a', mediaRef: MEDIA_REF_A }],
      });
    });
  });

  it('round-trips a blank generation card through the persisted document format', () => {
    const document = makeDocument();
    const withBlank = addBlankGenerationCardContent(document, 'blank-1', { x: 3, y: 4 });
    const withPrompt = setNodePromptContent(
      { ...document, nodes: withBlank.nodes }, 'blank-1', 'a quiet harbor at night',
    );
    const withPending = beginSelfGenerationContent(
      { ...document, nodes: withPrompt.nodes }, 'blank-1', 'op-1',
    );
    const persisted: InfiniteCanvasDocument = { ...document, nodes: withPending.nodes };

    const parsed = parseInfiniteCanvasDocument(JSON.stringify(persisted));

    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;
    expect(parsed.document.nodes).toEqual([{
      nodeId: 'blank-1',
      kind: 'image',
      position: { x: 3, y: 4 },
      prompt: 'a quiet harbor at night',
      generation: {
        operationId: 'op-1',
        toolId: 'generate',
        resultMode: 'self',
        status: 'pending',
      },
    }]);
  });
});
