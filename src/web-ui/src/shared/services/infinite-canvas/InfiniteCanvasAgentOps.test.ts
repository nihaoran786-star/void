import { describe, expect, it } from 'vitest';

import {
  applyCanvasAgentOpsBatchContent,
  applyCanvasAgentOpsBatchesContent,
  parseCanvasAgentOpsBatch,
  type CanvasAgentOpsBatch,
} from './InfiniteCanvasAgentOps';
import {
  beginDerivedOperationContent,
  beginSelfGenerationContent,
} from './InfiniteCanvasGenerationContent';
import type {
  InfiniteCanvasDocument,
  InfiniteCanvasNode,
} from './InfiniteCanvasTypes';

const MEDIA_REF = { workspacePath: 'C:/ws', relativePath: 'media/generated/b1/image-001.png' };

function makeDocument(overrides: Partial<InfiniteCanvasDocument> = {}): InfiniteCanvasDocument {
  return {
    documentId: 'doc-1',
    schemaVersion: '1',
    workspaceId: 'workspace-1',
    revision: 3,
    nodes: [
      { nodeId: 'node-blank', kind: 'image', position: { x: 0, y: 0 }, prompt: 'blank' },
      { nodeId: 'node-media', kind: 'image', position: { x: 200, y: 0 }, mediaRef: { ...MEDIA_REF } },
      { nodeId: 'node-text', kind: 'text', position: { x: 0, y: 200 }, text: 'hello' },
      { nodeId: 'node-video-blank', kind: 'video', position: { x: 400, y: 0 }, prompt: 'move it' },
    ],
    edges: [
      { edgeId: 'edge-1', sourceNodeId: 'node-media', targetNodeId: 'node-blank' },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: '2026-08-24T00:00:00.000Z',
    ...overrides,
  };
}

function batch(ops: unknown[], seq = 1, batchId = `batch-${seq}`): CanvasAgentOpsBatch {
  const parsed = parseCanvasAgentOpsBatch({ seq, batchId, ops });
  if (!parsed) throw new Error('test batch failed to parse');
  return parsed;
}

function nodeById(nodes: readonly InfiniteCanvasNode[], nodeId: string): InfiniteCanvasNode {
  const node = nodes.find(candidate => candidate.nodeId === nodeId);
  if (!node) throw new Error(`node ${nodeId} not found`);
  return node;
}

describe('parseCanvasAgentOpsBatch', () => {
  it('rejects batches without a valid seq, batchId, or ops array', () => {
    expect(parseCanvasAgentOpsBatch(undefined)).toBeUndefined();
    expect(parseCanvasAgentOpsBatch({ seq: 0, batchId: 'b', ops: [] })).toBeUndefined();
    expect(parseCanvasAgentOpsBatch({ seq: 1.5, batchId: 'b', ops: [] })).toBeUndefined();
    expect(parseCanvasAgentOpsBatch({ seq: 1, batchId: '', ops: [] })).toBeUndefined();
    expect(parseCanvasAgentOpsBatch({ seq: 1, batchId: 'b', ops: 'nope' })).toBeUndefined();
  });

  it('turns unparseable ops into malformed markers instead of dropping the batch', () => {
    const parsed = parseCanvasAgentOpsBatch({
      seq: 1,
      batchId: 'b-1',
      ops: [
        { op: 'delete_node', nodeId: 'node-x' },
        { op: 'move_node', nodeId: 'node-x' },
        'not-an-object',
      ],
    });
    expect(parsed?.ops.map(op => op.op)).toEqual(['delete_node', 'malformed', 'malformed']);
  });

  it('filters non-whitelisted update_node.set fields at parse time', () => {
    const parsed = parseCanvasAgentOpsBatch({
      seq: 1,
      batchId: 'b-1',
      ops: [{
        op: 'update_node',
        nodeId: 'node-blank',
        set: {
          prompt: 'new prompt',
          mediaRef: { workspacePath: 'C:/evil', relativePath: 'x.png' },
          derivedFrom: { sourceNodeId: 'a', toolId: 'generate', operationId: 'op' },
          generation: { operationId: 'op' },
          domainRef: { moduleId: 'm', kind: 'k', id: 'i', role: 'r' },
        },
      }],
    });
    const op = parsed?.ops[0];
    expect(op?.op).toBe('update_node');
    if (op?.op !== 'update_node') throw new Error('unexpected op');
    expect(op.set).toEqual({ prompt: 'new prompt' });
  });
});

describe('applyCanvasAgentOpsBatchContent', () => {
  it('applies add_node for text, image and video kinds', () => {
    const result = applyCanvasAgentOpsBatchContent(makeDocument(), batch([
      { op: 'add_node', nodeId: 'n-t', kind: 'text', position: { x: 1, y: 2 }, text: 'note' },
      {
        op: 'add_node', nodeId: 'n-i', kind: 'image', position: { x: 3, y: 4 },
        size: { width: 320, height: 240 }, prompt: 'a cat', stylePresetId: 'sp-1',
      },
      { op: 'add_node', nodeId: 'n-v', kind: 'video', position: { x: 5, y: 6 }, prompt: 'moving cat' },
    ]));
    if (result.status !== 'applied') throw new Error('expected applied');
    expect(result.outcomes.every(outcome => outcome.status === 'applied')).toBe(true);
    expect(nodeById(result.content.nodes, 'n-t')).toMatchObject({ kind: 'text', text: 'note' });
    expect(nodeById(result.content.nodes, 'n-i')).toMatchObject({
      kind: 'image', size: { width: 320, height: 240 }, prompt: 'a cat', stylePresetId: 'sp-1',
    });
    expect(nodeById(result.content.nodes, 'n-v')).toMatchObject({ kind: 'video', prompt: 'moving cat' });
    expect(result.content.agentOps).toEqual({ appliedSeq: 1 });
  });

  it('skips group and unknown add_node kinds with a typed reason', () => {
    const result = applyCanvasAgentOpsBatchContent(makeDocument(), batch([
      { op: 'add_node', nodeId: 'n-g', kind: 'group', position: { x: 0, y: 0 } },
      { op: 'add_node', nodeId: 'n-a', kind: 'audio', position: { x: 0, y: 0 } },
    ]));
    if (result.status !== 'applied') throw new Error('expected applied');
    expect(result.outcomes.map(outcome => outcome.reason))
      .toEqual(['kind_not_allowed', 'kind_not_allowed']);
    expect(result.content.nodes).toHaveLength(4);
    // The watermark still advances: a rejected op can never wedge the journal.
    expect(result.content.agentOps).toEqual({ appliedSeq: 1 });
  });

  it('treats add of an existing nodeId as an idempotent skip', () => {
    const result = applyCanvasAgentOpsBatchContent(makeDocument(), batch([
      { op: 'add_node', nodeId: 'node-blank', kind: 'image', position: { x: 9, y: 9 } },
    ]));
    if (result.status !== 'applied') throw new Error('expected applied');
    expect(result.outcomes[0]).toMatchObject({ status: 'skipped', reason: 'already_exists' });
    expect(nodeById(result.content.nodes, 'node-blank').position).toEqual({ x: 0, y: 0 });
  });

  it('applies whitelisted update_node fields and reports missing nodes', () => {
    const result = applyCanvasAgentOpsBatchContent(makeDocument(), batch([
      {
        op: 'update_node', nodeId: 'node-blank',
        set: { prompt: 'updated', position: { x: 42, y: 24 }, size: { width: 100, height: 80 } },
      },
      { op: 'update_node', nodeId: 'node-ghost', set: { prompt: 'x' } },
    ]));
    if (result.status !== 'applied') throw new Error('expected applied');
    expect(nodeById(result.content.nodes, 'node-blank')).toMatchObject({
      prompt: 'updated', position: { x: 42, y: 24 }, size: { width: 100, height: 80 },
    });
    expect(result.outcomes[1]).toMatchObject({ status: 'skipped', reason: 'node_not_found' });
  });

  it('connects and disconnects idempotently', () => {
    const document = makeDocument();
    const result = applyCanvasAgentOpsBatchContent(document, batch([
      { op: 'connect', edgeId: 'edge-new', sourceNodeId: 'node-media', targetNodeId: 'node-text' },
      // Duplicate pair (already connected by edge-1): idempotent skip.
      { op: 'connect', edgeId: 'edge-dup', sourceNodeId: 'node-media', targetNodeId: 'node-blank' },
      { op: 'connect', edgeId: 'edge-self', sourceNodeId: 'node-text', targetNodeId: 'node-text' },
      { op: 'connect', edgeId: 'edge-ghost', sourceNodeId: 'node-ghost', targetNodeId: 'node-text' },
      { op: 'disconnect', edgeId: 'edge-1' },
      { op: 'disconnect', edgeId: 'edge-never-existed' },
    ]));
    if (result.status !== 'applied') throw new Error('expected applied');
    expect(result.outcomes.map(outcome => outcome.status))
      .toEqual(['applied', 'skipped', 'skipped', 'skipped', 'applied', 'skipped']);
    expect(result.outcomes[1]?.reason).toBe('already_exists');
    expect(result.outcomes[2]?.reason).toBe('self_edge');
    expect(result.outcomes[3]?.reason).toBe('node_not_found');
    expect(result.outcomes[5]?.reason).toBe('already_removed');
    expect(result.content.edges.map(edge => edge.edgeId)).toEqual(['edge-new']);
  });

  it('deletes blank cards with their incident edges but never media cards', () => {
    const result = applyCanvasAgentOpsBatchContent(makeDocument(), batch([
      { op: 'delete_node', nodeId: 'node-blank' },
      { op: 'delete_node', nodeId: 'node-media' },
      { op: 'delete_node', nodeId: 'node-ghost' },
    ]));
    if (result.status !== 'applied') throw new Error('expected applied');
    expect(result.outcomes[0]?.status).toBe('applied');
    expect(result.outcomes[1]).toMatchObject({ status: 'skipped', reason: 'delete_protected' });
    expect(result.outcomes[2]).toMatchObject({ status: 'skipped', reason: 'already_removed' });
    expect(result.content.nodes.some(node => node.nodeId === 'node-blank')).toBe(false);
    // edge-1 pointed at node-blank and is removed with it.
    expect(result.content.edges).toHaveLength(0);
    expect(nodeById(result.content.nodes, 'node-media').mediaRef).toEqual(MEDIA_REF);
  });

  it('registers a self image generation on a blank card', () => {
    const result = applyCanvasAgentOpsBatchContent(makeDocument(), batch([
      {
        op: 'begin_generation', mode: 'self', operationId: 'op-1', toolId: 'generate',
        nodeId: 'node-blank', prompt: 'a cyber cat', stylePresetId: 'sp-9',
      },
    ]));
    if (result.status !== 'applied') throw new Error('expected applied');
    expect(result.outcomes[0]?.status).toBe('applied');
    const target = nodeById(result.content.nodes, 'node-blank');
    expect(target.prompt).toBe('a cyber cat');
    expect(target.stylePresetId).toBe('sp-9');
    expect(target.generation).toEqual({
      operationId: 'op-1', toolId: 'generate', resultMode: 'self', status: 'pending',
    });
  });

  it('registers a self video generation on a blank video card with mediaKind recorded', () => {
    const result = applyCanvasAgentOpsBatchContent(makeDocument(), batch([
      {
        op: 'begin_generation', mode: 'self', operationId: 'op-v', toolId: 'generate',
        mediaKind: 'video', nodeId: 'node-video-blank',
      },
    ]));
    if (result.status !== 'applied') throw new Error('expected applied');
    expect(nodeById(result.content.nodes, 'node-video-blank').generation).toEqual({
      operationId: 'op-v', toolId: 'generate', resultMode: 'self', status: 'pending',
      mediaKind: 'video',
    });
  });

  it('rejects self generation on a media card and on a kind-mismatched card', () => {
    const result = applyCanvasAgentOpsBatchContent(makeDocument(), batch([
      {
        op: 'begin_generation', mode: 'self', operationId: 'op-a', toolId: 'generate',
        nodeId: 'node-media',
      },
      {
        op: 'begin_generation', mode: 'self', operationId: 'op-b', toolId: 'generate',
        mediaKind: 'video', nodeId: 'node-blank',
      },
    ]));
    if (result.status !== 'applied') throw new Error('expected applied');
    expect(result.outcomes[0]).toMatchObject({ status: 'skipped', reason: 'self_target_has_media' });
    expect(result.outcomes[1]).toMatchObject({ status: 'skipped', reason: 'target_kind_mismatch' });
    expect(nodeById(result.content.nodes, 'node-media').generation).toBeUndefined();
    expect(nodeById(result.content.nodes, 'node-blank').generation).toBeUndefined();
  });

  it('registers a derived video generation: placeholder card, edge, mediaKind', () => {
    const result = applyCanvasAgentOpsBatchContent(makeDocument(), batch([
      {
        op: 'begin_generation', mode: 'derived', operationId: 'op-d', toolId: 'generate',
        mediaKind: 'video', nodeId: 'node-placeholder', sourceNodeId: 'node-media',
        edgeId: 'edge-derived', prompt: 'make it move',
      },
    ]));
    if (result.status !== 'applied') throw new Error('expected applied');
    const placeholder = nodeById(result.content.nodes, 'node-placeholder');
    expect(placeholder.kind).toBe('video');
    expect(placeholder.prompt).toBe('make it move');
    expect(placeholder.derivedFrom).toEqual({
      sourceNodeId: 'node-media', toolId: 'generate', operationId: 'op-d',
    });
    expect(placeholder.generation).toMatchObject({
      operationId: 'op-d', resultMode: 'derived', status: 'pending', mediaKind: 'video',
    });
    expect(result.content.edges).toContainEqual({
      edgeId: 'edge-derived', sourceNodeId: 'node-media', targetNodeId: 'node-placeholder',
    });
    // The derivation source is untouched.
    expect(nodeById(result.content.nodes, 'node-media').mediaRef).toEqual(MEDIA_REF);
  });

  it('supports add→connect dependencies within one batch', () => {
    const result = applyCanvasAgentOpsBatchContent(makeDocument(), batch([
      { op: 'add_node', nodeId: 'n-new', kind: 'image', position: { x: 700, y: 0 } },
      { op: 'connect', edgeId: 'edge-chain', sourceNodeId: 'node-media', targetNodeId: 'n-new' },
    ]));
    if (result.status !== 'applied') throw new Error('expected applied');
    expect(result.outcomes.every(outcome => outcome.status === 'applied')).toBe(true);
    expect(result.content.edges).toContainEqual({
      edgeId: 'edge-chain', sourceNodeId: 'node-media', targetNodeId: 'n-new',
    });
  });

  it('is idempotent: a batch at or below the watermark is a whole-batch no-op', () => {
    const document = makeDocument({ agentOps: { appliedSeq: 5 } });
    expect(applyCanvasAgentOpsBatchContent(document, batch([
      { op: 'delete_node', nodeId: 'node-blank' },
    ], 5))).toEqual({ status: 'stale', appliedSeq: 5 });
    expect(applyCanvasAgentOpsBatchContent(document, batch([
      { op: 'delete_node', nodeId: 'node-blank' },
    ], 3))).toEqual({ status: 'stale', appliedSeq: 5 });
    const fresh = applyCanvasAgentOpsBatchContent(document, batch([
      { op: 'delete_node', nodeId: 'node-blank' },
    ], 6));
    expect(fresh.status).toBe('applied');
  });

  it('never rewrites an existing mediaRef through any operation', () => {
    const document = makeDocument();
    const before = JSON.parse(JSON.stringify(nodeById(document.nodes, 'node-media')));
    const result = applyCanvasAgentOpsBatchContent(document, batch([
      { op: 'update_node', nodeId: 'node-media', set: { mediaRef: { workspacePath: 'X', relativePath: 'y' } } },
      { op: 'delete_node', nodeId: 'node-media' },
      { op: 'begin_generation', mode: 'self', operationId: 'op-x', toolId: 'generate', nodeId: 'node-media' },
      { op: 'add_node', nodeId: 'node-media', kind: 'image', position: { x: 1, y: 1 } },
    ]));
    if (result.status !== 'applied') throw new Error('expected applied');
    // Forbidden update fields are filtered at parse, leaving an empty set.
    expect(result.outcomes[0]).toMatchObject({ status: 'skipped', reason: 'empty_update' });
    expect(nodeById(result.content.nodes, 'node-media')).toEqual(before);
  });

  it('records malformed ops as typed skips', () => {
    const result = applyCanvasAgentOpsBatchContent(makeDocument(), batch([
      { op: 'teleport_node', nodeId: 'node-blank' },
    ]));
    if (result.status !== 'applied') throw new Error('expected applied');
    expect(result.outcomes[0]).toMatchObject({ status: 'skipped', reason: 'malformed_op' });
  });
});

describe('applyCanvasAgentOpsBatchesContent', () => {
  it('applies only batches above the watermark, in ascending seq order', () => {
    const document = makeDocument({ agentOps: { appliedSeq: 2 } });
    const result = applyCanvasAgentOpsBatchesContent(document, [
      batch([{ op: 'add_node', nodeId: 'n-4', kind: 'text', position: { x: 0, y: 0 } }], 4),
      batch([{ op: 'delete_node', nodeId: 'node-blank' }], 2),
      batch([
        { op: 'add_node', nodeId: 'n-3', kind: 'image', position: { x: 0, y: 0 } },
        { op: 'connect', edgeId: 'e-3', sourceNodeId: 'n-3', targetNodeId: 'node-media' },
      ], 3),
    ]);
    expect(result.appliedBatches.map(entry => entry.seq)).toEqual([3, 4]);
    expect(result.content.agentOps).toEqual({ appliedSeq: 4 });
    // Batch 2 was already applied: node-blank must survive.
    expect(result.content.nodes.some(node => node.nodeId === 'node-blank')).toBe(true);
    expect(result.content.nodes.some(node => node.nodeId === 'n-3')).toBe(true);
    expect(result.content.nodes.some(node => node.nodeId === 'n-4')).toBe(true);
    expect(result.content.edges.some(edge => edge.edgeId === 'e-3')).toBe(true);
  });

  it('returns unchanged content and no applied batches when everything is stale', () => {
    const document = makeDocument({ agentOps: { appliedSeq: 9 } });
    const result = applyCanvasAgentOpsBatchesContent(document, [
      batch([{ op: 'delete_node', nodeId: 'node-blank' }], 9),
    ]);
    expect(result.appliedBatches).toEqual([]);
    expect(result.content.nodes).toEqual(document.nodes);
    expect(result.content.agentOps).toEqual({ appliedSeq: 9 });
  });
});

describe('sunk generation content helpers (K2 semantics preserved)', () => {
  it('beginSelfGenerationContent defaults reproduce the K2 image behavior', () => {
    const document = makeDocument();
    const begun = beginSelfGenerationContent(document, 'node-blank', 'op-k2');
    expect(nodeById(begun.nodes, 'node-blank').generation).toEqual({
      operationId: 'op-k2', toolId: 'generate', resultMode: 'self', status: 'pending',
    });
    // Media cards and re-registrations stay untouched.
    expect(beginSelfGenerationContent(document, 'node-media', 'op-k2').nodes)
      .toEqual(document.nodes);
    const again = beginSelfGenerationContent(
      { ...document, nodes: begun.nodes }, 'node-blank', 'op-k2',
    );
    expect(again.nodes).toEqual(begun.nodes);
  });

  it('beginDerivedOperationContent defaults create an image placeholder as in K2', () => {
    const document = makeDocument();
    const begun = beginDerivedOperationContent(
      document, 'node-media', 'expand', 'op-e', 'node-d', 'edge-d',
    );
    const placeholder = nodeById(begun.nodes, 'node-d');
    expect(placeholder.kind).toBe('image');
    expect(placeholder.generation).toEqual({
      operationId: 'op-e', toolId: 'expand', resultMode: 'derived', status: 'pending',
    });
    expect(begun.edges).toContainEqual({
      edgeId: 'edge-d', sourceNodeId: 'node-media', targetNodeId: 'node-d',
    });
    // Idempotent on operationId.
    const again = beginDerivedOperationContent(
      { ...document, nodes: begun.nodes, edges: begun.edges },
      'node-media', 'expand', 'op-e', 'node-d2', 'edge-d2',
    );
    expect(again.nodes).toEqual(begun.nodes);
  });
});
