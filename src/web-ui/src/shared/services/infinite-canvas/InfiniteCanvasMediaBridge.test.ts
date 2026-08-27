import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  connectInfiniteCanvasMediaBridgeToEventBus,
  createInfiniteCanvasMediaBridge,
  type InfiniteCanvasMediaBridge,
} from './InfiniteCanvasMediaBridge';
import {
  InfiniteCanvasDocumentService,
  defaultInfiniteCanvasDocumentId,
  infiniteCanvasDocumentFilePath,
} from './InfiniteCanvasDocumentService';
import { createInMemoryInfiniteCanvasPersistence } from './InfiniteCanvasPersistencePort';
import type {
  InfiniteCanvasDocument,
  InfiniteCanvasNode,
  InfiniteCanvasWorkspaceRef,
} from './InfiniteCanvasTypes';

const WORKSPACE: InfiniteCanvasWorkspaceRef = {
  workspaceId: 'workspace-1',
  workspacePath: 'C:/ws',
  backend: 'local',
};
const DOCUMENT_ID = defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId);

const SOURCE_MEDIA_REF = { workspacePath: 'C:/ws', relativePath: 'media/generated/b0/src.png' };
const OCCUPIED_MEDIA_REF = { workspacePath: 'C:/ws', relativePath: 'media/generated/b0/keep.png' };
const GALLERY_MEDIA_REF = { workspacePath: 'C:/ws', relativePath: 'media/generated/b0/first.png' };

function seedNodes(): InfiniteCanvasNode[] {
  return [
    {
      nodeId: 'card-self',
      kind: 'image',
      position: { x: 0, y: 0 },
      prompt: '一只猫',
      generation: {
        operationId: 'op-self',
        toolId: 'generate',
        resultMode: 'self',
        status: 'pending',
      },
    },
    {
      nodeId: 'card-src',
      kind: 'image',
      position: { x: 100, y: 0 },
      mediaRef: { ...SOURCE_MEDIA_REF },
    },
    {
      nodeId: 'card-derived',
      kind: 'image',
      position: { x: 500, y: 0 },
      derivedFrom: { sourceNodeId: 'card-src', toolId: 'expand', operationId: 'op-derived' },
      generation: {
        operationId: 'op-derived',
        toolId: 'expand',
        resultMode: 'derived',
        status: 'pending',
      },
    },
    {
      // P3: a pending video placeholder derived from card-src (image-to-video).
      nodeId: 'card-video',
      kind: 'video',
      position: { x: 500, y: 300 },
      derivedFrom: { sourceNodeId: 'card-src', toolId: 'generate', operationId: 'op-video' },
      generation: {
        operationId: 'op-video',
        toolId: 'generate',
        resultMode: 'derived',
        status: 'pending',
        mediaKind: 'video',
      },
    },
    {
      // Illegal-by-construction state used to prove the never-overwrite guard.
      // The tool id matters since 7.6: a plain generation would legitimately
      // ACCUMULATE onto a card that already holds a picture, so the guard is
      // proven with a five-tool result, which may never land here.
      nodeId: 'card-occupied',
      kind: 'image',
      position: { x: 0, y: 300 },
      mediaRef: { ...OCCUPIED_MEDIA_REF },
      generation: {
        operationId: 'op-occupied',
        toolId: 'matting',
        resultMode: 'self',
        status: 'pending',
      },
    },
    {
      // 7.6: a card that already holds a picture and is waiting on a
      // regenerate of its own - the one shape allowed to land on top.
      nodeId: 'card-gallery',
      kind: 'image',
      position: { x: 0, y: 600 },
      prompt: 'a cat',
      mediaRef: { ...GALLERY_MEDIA_REF },
      generation: {
        operationId: 'op-gallery',
        toolId: 'generate',
        resultMode: 'self',
        status: 'pending',
      },
    },
  ];
}

interface Harness {
  bridge: InfiniteCanvasMediaBridge;
  readDocument: () => Promise<InfiniteCanvasDocument>;
}

function createHarness(): Harness {
  const store = createInMemoryInfiniteCanvasPersistence();
  const document: InfiniteCanvasDocument = {
    documentId: DOCUMENT_ID,
    schemaVersion: '1',
    workspaceId: WORKSPACE.workspaceId,
    revision: 1,
    nodes: seedNodes(),
    edges: [{ edgeId: 'edge-1', sourceNodeId: 'card-src', targetNodeId: 'card-derived' }],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: new Date(0).toISOString(),
  };
  store.files.set(
    infiniteCanvasDocumentFilePath(WORKSPACE.workspacePath, DOCUMENT_ID),
    JSON.stringify(document),
  );
  const service = new InfiniteCanvasDocumentService(store.port);
  const bridge = createInfiniteCanvasMediaBridge({
    workspace: WORKSPACE,
    documentId: DOCUMENT_ID,
    documentService: service,
  });
  return {
    bridge,
    async readDocument() {
      const result = await service.mutateDefaultDocument(WORKSPACE, content => content);
      if (result.status !== 'applied') throw new Error('failed to read document');
      return result.document;
    },
  };
}

function binding(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    workspaceId: WORKSPACE.workspaceId,
    documentId: DOCUMENT_ID,
    nodeId: 'card-self',
    resultMode: 'self',
    toolId: 'generate',
    operationId: 'op-self',
    ...overrides,
  };
}

function completedMediaEvent(bindingOverrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sessionId: 'session-1',
    eventType: 'Completed',
    toolId: 'tool-call-1',
    toolName: 'GenerateImage',
    result: {
      status: 'completed',
      source: 'apimart',
      kind: 'image',
      batch: { batch_id: 'batch-1' },
      infiniteCanvas: binding({
        outputMediaItemId: 'batch-1-1',
        outputMediaKind: 'image',
        outputMediaRelativePath: 'media/generated/batch-1/image-001.png',
        ...bindingOverrides,
      }),
    },
  };
}

/** P4-R2 `outputMediaItems` payload for a batch of `count` produced images. */
function batchItems(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_unused, index) => ({
    itemIndex: index + 1,
    mediaItemId: `batch-1-${index + 1}`,
    mediaKind: 'image',
    relativePath: `media/generated/batch-1/image-00${index + 1}.png`,
    path: `C:/ws/media/generated/batch-1/image-00${index + 1}.png`,
  }));
}

function node(document: InfiniteCanvasDocument, nodeId: string): InfiniteCanvasNode {
  const found = document.nodes.find(candidate => candidate.nodeId === nodeId);
  if (!found) throw new Error(`node ${nodeId} missing`);
  return found;
}

describe('InfiniteCanvasMediaBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves a self-mode completion into the blank card itself', async () => {
    const { bridge, readDocument } = createHarness();

    const result = await bridge.handleToolRunEvent(completedMediaEvent());

    expect(result).toEqual({ status: 'applied', action: 'resolved', operationId: 'op-self' });
    const card = node(await readDocument(), 'card-self');
    expect(card.mediaRef).toEqual({
      workspacePath: 'C:/ws',
      relativePath: 'media/generated/batch-1/image-001.png',
    });
    expect(card.generation).toBeUndefined();
    expect(card.prompt).toBe('一只猫');
    expect(card.derivedFrom).toBeUndefined();
  });

  it('resolves a derived-mode completion into the placeholder card, leaving the source untouched', async () => {
    const { bridge, readDocument } = createHarness();

    const result = await bridge.handleToolRunEvent(completedMediaEvent({
      nodeId: 'card-derived',
      resultMode: 'derived',
      sourceNodeId: 'card-src',
      toolId: 'expand',
      operationId: 'op-derived',
    }));

    expect(result).toEqual({ status: 'applied', action: 'resolved', operationId: 'op-derived' });
    const document = await readDocument();
    const derived = node(document, 'card-derived');
    expect(derived.mediaRef?.relativePath).toBe('media/generated/batch-1/image-001.png');
    expect(derived.generation).toBeUndefined();
    expect(derived.derivedFrom).toEqual({
      sourceNodeId: 'card-src',
      toolId: 'expand',
      operationId: 'op-derived',
    });
    expect(node(document, 'card-src').mediaRef).toEqual(SOURCE_MEDIA_REF);
  });

  it('ignores a self-mode completion whose landing node already has an image (never-overwrite)', async () => {
    const { bridge, readDocument } = createHarness();

    const result = await bridge.handleToolRunEvent(completedMediaEvent({
      nodeId: 'card-occupied',
      operationId: 'op-occupied',
    }));

    expect(result).toMatchObject({ status: 'ignored', reason: 'result_mode_mismatch' });
    expect(node(await readDocument(), 'card-occupied').mediaRef).toEqual(OCCUPIED_MEDIA_REF);
  });

  it('ignores a tampered resultMode that contradicts the registered generation', async () => {
    const { bridge, readDocument } = createHarness();

    const result = await bridge.handleToolRunEvent(completedMediaEvent({
      nodeId: 'card-derived',
      resultMode: 'self',
      operationId: 'op-derived',
    }));

    expect(result).toMatchObject({ status: 'ignored', reason: 'result_mode_mismatch' });
    const derived = node(await readDocument(), 'card-derived');
    expect(derived.mediaRef).toBeUndefined();
    expect(derived.generation?.status).toBe('pending');
  });

  it('resolves a video completion into the pending video card (P3 §3.5)', async () => {
    const { bridge, readDocument } = createHarness();

    const result = await bridge.handleToolRunEvent({
      eventType: 'Completed',
      toolName: 'GenerateVideo',
      result: {
        status: 'completed',
        kind: 'video',
        batch: { batch_id: 'batch-v1' },
        infiniteCanvas: binding({
          nodeId: 'card-video',
          resultMode: 'derived',
          sourceNodeId: 'card-src',
          operationId: 'op-video',
          mediaKind: 'video',
          outputMediaKind: 'video',
          outputMediaRelativePath: 'media/generated/batch-v1/video-001.mp4',
        }),
      },
    });

    expect(result).toEqual({ status: 'applied', action: 'resolved', operationId: 'op-video' });
    const document = await readDocument();
    const video = node(document, 'card-video');
    expect(video.kind).toBe('video');
    expect(video.mediaRef).toEqual({
      workspacePath: 'C:/ws',
      relativePath: 'media/generated/batch-v1/video-001.mp4',
    });
    expect(video.generation).toBeUndefined();
    expect(node(document, 'card-src').mediaRef).toEqual(SOURCE_MEDIA_REF);
  });

  it('fails a video result aimed at an image card as a typed retryable invalid-input (P4)', async () => {
    const { bridge, readDocument } = createHarness();

    // Tampered binding: op-self anchors an image card, but the result claims
    // to be a video. The media must never land — and the card must not keep
    // spinning either: the generation settles as a retryable typed failure.
    const result = await bridge.handleToolRunEvent(completedMediaEvent({
      mediaKind: 'video',
      outputMediaKind: 'video',
      outputMediaRelativePath: 'media/generated/batch-v1/video-001.mp4',
    }));

    expect(result).toMatchObject({
      status: 'applied',
      action: 'failed',
      errorKind: 'invalid-input',
    });
    const card = node(await readDocument(), 'card-self');
    expect(card.mediaRef).toBeUndefined();
    expect(card.generation).toMatchObject({ status: 'failed', errorKind: 'invalid-input' });
  });

  it('fails an image result aimed at a video card as a typed retryable invalid-input (P4)', async () => {
    const { bridge, readDocument } = createHarness();

    const result = await bridge.handleToolRunEvent(completedMediaEvent({
      nodeId: 'card-video',
      resultMode: 'derived',
      operationId: 'op-video',
      outputMediaKind: 'image',
    }));

    expect(result).toMatchObject({
      status: 'applied',
      action: 'failed',
      errorKind: 'invalid-input',
    });
    const video = node(await readDocument(), 'card-video');
    expect(video.mediaRef).toBeUndefined();
    expect(video.generation).toMatchObject({ status: 'failed', errorKind: 'invalid-input' });

    // A duplicated mismatch event is an idempotent typed no-op.
    const replay = await bridge.handleToolRunEvent(completedMediaEvent({
      nodeId: 'card-video',
      resultMode: 'derived',
      operationId: 'op-video',
      outputMediaKind: 'image',
    }));
    expect(replay).toMatchObject({ status: 'ignored', reason: 'already_terminal' });
  });

  it('gates video failure classification onto the video card through the same lane', async () => {
    const { bridge, readDocument } = createHarness();

    const result = await bridge.handleToolRunEvent({
      eventType: 'Completed',
      toolName: 'GenerateVideo',
      params: {
        infinite_canvas: binding({
          nodeId: 'card-video',
          resultMode: 'derived',
          operationId: 'op-video',
          mediaKind: 'video',
        }),
      },
      result: { status: 'error', source: 'apimart', error: { code: 'provider_not_configured' } },
    });

    expect(result).toMatchObject({ status: 'applied', action: 'failed', errorKind: 'auth' });
    expect(node(await readDocument(), 'card-video').generation).toMatchObject({
      status: 'failed',
      errorKind: 'auth',
      mediaKind: 'video',
    });
  });

  it('attaches the batch id from a submission receipt and keeps the node pending', async () => {
    const { bridge, readDocument } = createHarness();

    const result = await bridge.handleToolRunEvent({
      eventType: 'Completed',
      toolName: 'GenerateImage',
      result: {
        status: 'polling',
        batch_id: 'batch-9',
        infiniteCanvas: binding(),
      },
    });

    expect(result).toEqual({
      status: 'applied',
      action: 'batch-attached',
      operationId: 'op-self',
    });
    const card = node(await readDocument(), 'card-self');
    expect(card.generation).toMatchObject({ status: 'pending', batchId: 'batch-9' });
  });

  it('confirms pending on a Started event carrying the binding in params', async () => {
    const { bridge, readDocument } = createHarness();

    const result = await bridge.handleToolRunEvent({
      eventType: 'Started',
      toolName: 'GenerateImage',
      params: { prompt: '一只猫', infinite_canvas: binding() },
    });

    expect(result).toEqual({ status: 'applied', action: 'pending', operationId: 'op-self' });
    expect(node(await readDocument(), 'card-self').generation?.status).toBe('pending');
  });

  it.each([
    [{ code: 'provider_not_configured' }, 'auth'],
    [{ code: 'safety_rejected', http_status: 500 }, 'invalid-input'],
    [{ code: 'provider_error', http_status: 429 }, 'rate-limit'],
    [{ code: 'provider_error', http_status: 401 }, 'auth'],
    [{ code: 'provider_error', http_status: 500 }, 'backend'],
  ] as const)('maps the %o error result onto the typed errorKind %s', async (error, errorKind) => {
    const { bridge, readDocument } = createHarness();

    const result = await bridge.handleToolRunEvent({
      eventType: 'Completed',
      toolName: 'GenerateImage',
      params: { infinite_canvas: binding() },
      result: { status: 'error', source: 'apimart', error },
    });

    expect(result).toEqual({
      status: 'applied',
      action: 'failed',
      operationId: 'op-self',
      errorKind,
    });
    expect(node(await readDocument(), 'card-self').generation).toMatchObject({
      status: 'failed',
      errorKind,
    });
  });

  it('marks a timed-out batch as a typed timeout failure', async () => {
    const { bridge, readDocument } = createHarness();

    const result = await bridge.handleToolRunEvent({
      eventType: 'Completed',
      toolName: 'GenerateImage',
      result: { status: 'timeout', infiniteCanvas: binding() },
    });

    expect(result).toMatchObject({ status: 'applied', action: 'failed', errorKind: 'timeout' });
    expect(node(await readDocument(), 'card-self').generation?.errorKind).toBe('timeout');
  });

  it('ignores real-shape Failed and Cancelled events, which carry no binding', async () => {
    // Real backend events (contracts/events agentic.rs ToolEventData): Failed
    // carries only { tool_id, tool_name, error } and Cancelled only
    // { tool_id, tool_name, reason } — neither has params or result, so the
    // bridge can never route them to a card. Accepted tradeoff: when the tool
    // throws Err instead of returning a typed error result, the card stays
    // pending until the W7 reconciliation turns it into a retryable timeout.
    const { bridge, readDocument } = createHarness();

    const failed = await bridge.handleToolRunEvent({
      sessionId: 'session-1',
      eventType: 'Failed',
      toolId: 'tool-call-1',
      toolName: 'GenerateImage',
      error: 'boom',
    });
    expect(failed).toMatchObject({ status: 'ignored', reason: 'missing_metadata' });

    const cancelled = await bridge.handleToolRunEvent({
      sessionId: 'session-1',
      eventType: 'Cancelled',
      toolId: 'tool-call-1',
      toolName: 'GenerateImage',
      reason: 'user cancelled',
    });
    expect(cancelled).toMatchObject({ status: 'ignored', reason: 'missing_metadata' });

    // The pending cards are untouched — W7 owns their eventual exit.
    const document = await readDocument();
    expect(node(document, 'card-self').generation?.status).toBe('pending');
    expect(node(document, 'card-derived').generation?.status).toBe('pending');
  });

  it('rejects a cross-workspace binding without touching the document', async () => {
    const { bridge, readDocument } = createHarness();

    const result = await bridge.handleToolRunEvent(completedMediaEvent({
      workspaceId: 'workspace-other',
    }));

    expect(result).toMatchObject({
      status: 'ignored',
      reason: 'workspace_mismatch',
      eventWorkspaceId: 'workspace-other',
    });
    expect(node(await readDocument(), 'card-self').mediaRef).toBeUndefined();
  });

  it('rejects a cross-document binding without touching the document', async () => {
    const { bridge, readDocument } = createHarness();

    const result = await bridge.handleToolRunEvent(completedMediaEvent({
      documentId: 'doc-other',
    }));

    expect(result).toMatchObject({
      status: 'ignored',
      reason: 'document_mismatch',
      eventDocumentId: 'doc-other',
    });
    expect(node(await readDocument(), 'card-self').mediaRef).toBeUndefined();
  });

  it('treats a duplicated completion as an idempotent no-op after the resolve', async () => {
    const { bridge, readDocument } = createHarness();

    await bridge.handleToolRunEvent(completedMediaEvent());
    const repeat = await bridge.handleToolRunEvent(completedMediaEvent());

    expect(repeat).toMatchObject({ status: 'ignored', reason: 'operation_not_found' });
    const card = node(await readDocument(), 'card-self');
    expect(card.mediaRef?.relativePath).toBe('media/generated/batch-1/image-001.png');
  });

  it('treats a duplicated failure event as already terminal', async () => {
    const { bridge } = createHarness();
    const failureEvent = {
      eventType: 'Completed',
      toolName: 'GenerateImage',
      params: { infinite_canvas: binding() },
      result: { status: 'error', error: { code: 'provider_not_configured' } },
    };

    await bridge.handleToolRunEvent(failureEvent);
    const repeat = await bridge.handleToolRunEvent(failureEvent);

    expect(repeat).toMatchObject({ status: 'ignored', reason: 'already_terminal' });
  });

  it('ignores events without an infinite canvas binding as missing_metadata', async () => {
    const { bridge } = createHarness();

    const result = await bridge.handleToolRunEvent({
      eventType: 'Completed',
      toolName: 'GenerateImage',
      result: { status: 'completed', shortDrama: { projectId: 'p1' } },
    });

    expect(result).toMatchObject({ status: 'ignored', reason: 'missing_metadata' });
  });

  it('ignores unknown operation ids as operation_not_found', async () => {
    const { bridge } = createHarness();

    const result = await bridge.handleToolRunEvent(completedMediaEvent({
      operationId: 'op-unknown',
      nodeId: 'card-unknown',
    }));

    expect(result).toMatchObject({ status: 'ignored', reason: 'operation_not_found' });
  });

  // —— P4 W4: batch (n > 1) landing ————————————————————————————————————————

  it('lands an n=1 batch array exactly like the singular field did', async () => {
    const { bridge, readDocument } = createHarness();

    const result = await bridge.handleToolRunEvent(completedMediaEvent({
      outputMediaItems: [{
        itemIndex: 1,
        mediaItemId: 'batch-1-1',
        mediaKind: 'image',
        relativePath: 'media/generated/batch-1/image-001.png',
        path: 'C:/ws/media/generated/batch-1/image-001.png',
      }],
    }));

    expect(result).toEqual({ status: 'applied', action: 'resolved', operationId: 'op-self' });
    const document = await readDocument();
    expect(document.nodes).toHaveLength(6);
    expect(document.edges).toHaveLength(1);
    const card = node(document, 'card-self');
    expect(card.mediaRef).toEqual({
      workspacePath: 'C:/ws',
      relativePath: 'media/generated/batch-1/image-001.png',
    });
    expect(card.generation).toBeUndefined();
    expect(card.prompt).toBe(seedNodes()[0].prompt);
  });

  it('piles an n=3 batch onto the anchor card, growing no sibling at all', async () => {
    const { bridge, readDocument } = createHarness();

    const result = await bridge.handleToolRunEvent(completedMediaEvent({
      outputMediaItems: batchItems(3),
    }));

    expect(result).toEqual({ status: 'applied', action: 'resolved', operationId: 'op-self' });
    const document = await readDocument();
    expect(document.nodes).toHaveLength(6);
    const card = node(document, 'card-self');
    expect(card.mediaVariants?.map(variant => variant.relativePath)).toEqual([
      'media/generated/batch-1/image-001.png',
      'media/generated/batch-1/image-002.png',
      'media/generated/batch-1/image-003.png',
    ]);
    expect(card.activeVariantIndex).toBe(0);
    expect(card.mediaRef?.relativePath).toBe('media/generated/batch-1/image-001.png');
    expect(document.edges.map(edge => edge.edgeId)).toEqual(['edge-1']);
  });

  it('appends a regenerate onto the pictures the card already carries', async () => {
    const { bridge, readDocument } = createHarness();

    const result = await bridge.handleToolRunEvent(completedMediaEvent({
      nodeId: 'card-gallery',
      operationId: 'op-gallery',
      outputMediaItems: batchItems(2),
    }));

    expect(result).toEqual({ status: 'applied', action: 'resolved', operationId: 'op-gallery' });
    const document = await readDocument();
    expect(document.nodes).toHaveLength(6);
    const card = node(document, 'card-gallery');
    expect(card.mediaVariants).toEqual([
      GALLERY_MEDIA_REF,
      { workspacePath: 'C:/ws', relativePath: 'media/generated/batch-1/image-001.png' },
      { workspacePath: 'C:/ws', relativePath: 'media/generated/batch-1/image-002.png' },
    ]);
    // The freshly produced picture becomes the one the card face shows.
    expect(card.activeVariantIndex).toBe(1);
    expect(card.generation).toBeUndefined();
  });

  it('appends a singular (non-batch) regenerate result too', async () => {
    const { bridge, readDocument } = createHarness();

    await bridge.handleToolRunEvent(completedMediaEvent({
      nodeId: 'card-gallery',
      operationId: 'op-gallery',
    }));

    const card = node(await readDocument(), 'card-gallery');
    expect(card.mediaVariants).toEqual([
      GALLERY_MEDIA_REF,
      { workspacePath: 'C:/ws', relativePath: 'media/generated/batch-1/image-001.png' },
    ]);
    expect(card.mediaRef?.relativePath).toBe('media/generated/batch-1/image-001.png');
  });

  it('is idempotent when the same batch completion event is replayed', async () => {
    const { bridge, readDocument } = createHarness();
    const event = completedMediaEvent({ outputMediaItems: batchItems(3) });

    await bridge.handleToolRunEvent(event);
    const afterFirst = await readDocument();
    const replay = await bridge.handleToolRunEvent(event);
    const afterSecond = await readDocument();

    expect(replay).toMatchObject({ status: 'ignored', reason: 'operation_not_found' });
    expect(afterSecond.nodes.map(candidate => candidate.nodeId))
      .toEqual(afterFirst.nodes.map(candidate => candidate.nodeId));
    expect(afterSecond.edges.map(edge => edge.edgeId))
      .toEqual(afterFirst.edges.map(edge => edge.edgeId));
  });

  it('lands every surviving item of a partial batch on the anchor', async () => {
    const { bridge, readDocument } = createHarness();

    await bridge.handleToolRunEvent({
      ...completedMediaEvent({
        outputMediaItems: [batchItems(3)[1], batchItems(3)[2]],
      }),
    });

    const document = await readDocument();
    const card = node(document, 'card-self');
    expect(card.mediaRef?.relativePath).toBe('media/generated/batch-1/image-002.png');
    expect(card.mediaVariants?.map(variant => variant.relativePath)).toEqual([
      'media/generated/batch-1/image-002.png',
      'media/generated/batch-1/image-003.png',
    ]);
    expect(document.nodes).toHaveLength(6);
  });

  it('settles a batch with no usable item as a typed failure, adding no cards', async () => {
    const { bridge, readDocument } = createHarness();

    const result = await bridge.handleToolRunEvent({
      sessionId: 'session-1',
      eventType: 'Completed',
      toolId: 'tool-call-1',
      toolName: 'GenerateImage',
      result: {
        status: 'partial',
        kind: 'image',
        batch: { batch_id: 'batch-1' },
        infiniteCanvas: binding({ outputMediaKind: 'image', outputMediaItems: [] }),
      },
    });

    expect(result).toMatchObject({ status: 'applied', action: 'failed', errorKind: 'backend' });
    const document = await readDocument();
    expect(document.nodes).toHaveLength(6);
    expect(node(document, 'card-self').generation?.status).toBe('failed');
  });

  it('writes nothing at all when the anchor card was tampered into holding media', async () => {
    const { bridge, readDocument } = createHarness();
    const before = await readDocument();

    const result = await bridge.handleToolRunEvent(completedMediaEvent({
      nodeId: 'card-occupied',
      operationId: 'op-occupied',
      outputMediaItems: batchItems(3),
    }));

    expect(result).toMatchObject({ status: 'ignored', reason: 'result_mode_mismatch' });
    const after = await readDocument();
    expect(after.nodes).toEqual(before.nodes);
    expect(after.edges).toEqual(before.edges);
  });

  it('drops corrupted batch entries but still lands the valid ones', async () => {
    const { bridge, readDocument } = createHarness();

    await bridge.handleToolRunEvent(completedMediaEvent({
      outputMediaItems: [
        batchItems(2)[0],
        { itemIndex: 'two', relativePath: 'media/generated/batch-1/image-002.png' },
        { itemIndex: 3 },
        'nonsense',
      ],
    }));

    const document = await readDocument();
    expect(node(document, 'card-self').mediaRef?.relativePath)
      .toBe('media/generated/batch-1/image-001.png');
    expect(document.nodes).toHaveLength(6);
  });
});

describe('connectInfiniteCanvasMediaBridgeToEventBus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to agent:tool-run-event, reports ignored events, and unsubscribes', async () => {
    const { bridge, readDocument } = createHarness();
    const handlers = new Map<string, (event: unknown) => void>();
    let unsubscribed = 0;
    const eventBus = {
      on(eventName: 'agent:tool-run-event', handler: (event: unknown) => void) {
        handlers.set(eventName, handler);
        return () => {
          unsubscribed += 1;
          handlers.delete(eventName);
        };
      },
    };
    const ignoredEvents: unknown[] = [];
    const disconnect = connectInfiniteCanvasMediaBridgeToEventBus(bridge, eventBus, {
      onIgnoredEvent: event => ignoredEvents.push(event),
    });

    const handler = handlers.get('agent:tool-run-event');
    expect(handler).toBeDefined();

    handler?.(completedMediaEvent());
    handler?.({ eventType: 'Completed', result: { status: 'completed' } });
    await vi.waitFor(async () => {
      expect(ignoredEvents).toHaveLength(1);
    });
    expect(ignoredEvents[0]).toMatchObject({ reason: 'missing_metadata' });
    expect(node(await readDocument(), 'card-self').mediaRef?.relativePath)
      .toBe('media/generated/batch-1/image-001.png');

    disconnect();
    expect(unsubscribed).toBe(1);
    expect(handlers.size).toBe(0);
  });
});
