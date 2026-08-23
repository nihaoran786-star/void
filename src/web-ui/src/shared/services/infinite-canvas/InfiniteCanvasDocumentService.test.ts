import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  InfiniteCanvasDocumentService,
  defaultInfiniteCanvasDocumentId,
  infiniteCanvasDocumentFilePath,
  parseInfiniteCanvasDocument,
} from './InfiniteCanvasDocumentService';
import { createInMemoryInfiniteCanvasPersistence } from './InfiniteCanvasPersistencePort';
import type {
  InfiniteCanvasDocument,
  InfiniteCanvasWorkspaceRef,
} from './InfiniteCanvasTypes';

const LOCAL_WORKSPACE: InfiniteCanvasWorkspaceRef = {
  workspaceId: 'workspace-canvas-1',
  workspacePath: 'C:/projects/canvas',
  backend: 'local',
};

const REMOTE_WORKSPACE: InfiniteCanvasWorkspaceRef = {
  workspaceId: 'workspace-remote',
  workspacePath: '/remote/project',
  backend: 'remote',
};

function defaultFilePath(workspace: InfiniteCanvasWorkspaceRef): string {
  return infiniteCanvasDocumentFilePath(
    workspace.workspacePath,
    defaultInfiniteCanvasDocumentId(workspace.workspaceId),
  );
}

describe('InfiniteCanvasDocumentService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates and persists a default document per workspace on first load', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port);

    const result = await service.loadDefaultDocument(LOCAL_WORKSPACE);

    expect(result.status).toBe('created');
    if (result.status !== 'created') return;
    expect(result.document).toMatchObject({
      schemaVersion: '1',
      workspaceId: LOCAL_WORKSPACE.workspaceId,
      revision: 1,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    expect(store.files.has(defaultFilePath(LOCAL_WORKSPACE))).toBe(true);

    const reload = await service.loadDefaultDocument(LOCAL_WORKSPACE);
    expect(reload.status).toBe('loaded');
  });

  it('keeps documents of different workspaces in different files', () => {
    const otherWorkspace: InfiniteCanvasWorkspaceRef = {
      ...LOCAL_WORKSPACE,
      workspaceId: 'workspace-canvas-2',
    };
    expect(defaultFilePath(LOCAL_WORKSPACE)).not.toBe(defaultFilePath(otherWorkspace));
    expect(defaultFilePath(LOCAL_WORKSPACE)).toContain('/.void/infinite-canvas/');
  });

  it('is fail-closed on a remote workspace for load, save, and mutate', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port);

    const loaded = await service.loadDefaultDocument(REMOTE_WORKSPACE);
    expect(loaded).toMatchObject({
      status: 'failed',
      error: { kind: 'unavailable' },
    });

    const mutated = await service.mutateDefaultDocument(REMOTE_WORKSPACE, current => ({
      nodes: current.nodes,
      edges: current.edges,
      viewport: current.viewport,
    }));
    expect(mutated).toMatchObject({
      status: 'failed',
      error: { kind: 'unavailable' },
    });

    expect(store.writeCount()).toBe(0);
  });

  it('rejects a stale revision as a typed conflict instead of overwriting', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port);

    const created = await service.loadDefaultDocument(LOCAL_WORKSPACE);
    if (created.status !== 'created') throw new Error('expected created');

    const firstSave = await service.saveDocument(LOCAL_WORKSPACE, created.document);
    expect(firstSave.status).toBe('saved');
    if (firstSave.status !== 'saved') return;
    expect(firstSave.document.revision).toBe(created.document.revision + 1);

    // Same base document again: the persisted revision has moved on.
    const staleSave = await service.saveDocument(LOCAL_WORKSPACE, created.document);
    expect(staleSave).toEqual({
      status: 'conflict',
      expectedRevision: created.document.revision,
      actualRevision: firstSave.document.revision,
    });

    // The persisted file still carries the first save, not the stale one.
    const persisted = parseInfiniteCanvasDocument(
      store.files.get(defaultFilePath(LOCAL_WORKSPACE))!,
    );
    if (persisted.status !== 'ok') throw new Error('expected persisted document');
    expect(persisted.document.revision).toBe(firstSave.document.revision);
  });

  it('coalesces mutations in the debounce window into a single CAS write', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port, { debounceMs: 50 });

    await service.loadDefaultDocument(LOCAL_WORKSPACE);
    const writesAfterCreate = store.writeCount();

    const first = await service.mutateDefaultDocument(LOCAL_WORKSPACE, current => ({
      nodes: [...current.nodes, {
        nodeId: 'node-1',
        kind: 'text' as const,
        position: { x: 10, y: 20 },
        text: 'hello',
      }],
      edges: current.edges,
      viewport: current.viewport,
    }));
    const second = await service.mutateDefaultDocument(LOCAL_WORKSPACE, current => ({
      nodes: current.nodes,
      edges: current.edges,
      viewport: { x: 5, y: 5, zoom: 2 },
    }));

    expect(first.status).toBe('applied');
    expect(second.status).toBe('applied');
    if (second.status !== 'applied') return;
    expect(second.document.nodes).toHaveLength(1);
    expect(second.document.viewport).toEqual({ x: 5, y: 5, zoom: 2 });

    // Nothing hit the disk inside the debounce window.
    expect(store.writeCount()).toBe(writesAfterCreate);

    await vi.advanceTimersByTimeAsync(60);

    expect(store.writeCount()).toBe(writesAfterCreate + 1);
    const persisted = parseInfiniteCanvasDocument(
      store.files.get(defaultFilePath(LOCAL_WORKSPACE))!,
    );
    if (persisted.status !== 'ok') throw new Error('expected persisted document');
    expect(persisted.document.nodes).toHaveLength(1);
    expect(persisted.document.viewport).toEqual({ x: 5, y: 5, zoom: 2 });
    expect(persisted.document.revision).toBe(2);
  });

  it('serializes concurrent mutations racing over a slow load so neither is lost', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    // Gate the first read so both mutations are in flight before either has a
    // document. Pre-fix, both missed pendingByPath, each awaited its own load
    // and the second overwrote the first's pending entry — a lost update.
    let releaseLoad!: () => void;
    const loadGate = new Promise<void>(resolve => { releaseLoad = resolve; });
    let reads = 0;
    const slowPort = {
      ...store.port,
      readTextFile: async (path: string) => {
        reads += 1;
        if (reads === 1) await loadGate;
        return store.port.readTextFile(path);
      },
    };
    const service = new InfiniteCanvasDocumentService(slowPort, { debounceMs: 50 });

    const textNode = (nodeId: string) => ({
      nodeId,
      kind: 'text' as const,
      position: { x: 0, y: 0 },
      text: nodeId,
    });
    const first = service.mutateDefaultDocument(LOCAL_WORKSPACE, current => ({
      nodes: [...current.nodes, textNode('node-a')],
      edges: current.edges,
      viewport: current.viewport,
    }));
    const second = service.mutateDefaultDocument(LOCAL_WORKSPACE, current => ({
      nodes: [...current.nodes, textNode('node-b')],
      edges: current.edges,
      viewport: current.viewport,
    }));
    releaseLoad();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    // Both mutations took effect: the second one saw the first one's node.
    expect(firstResult.status).toBe('applied');
    if (firstResult.status !== 'applied') return;
    expect(firstResult.document.nodes.map(node => node.nodeId)).toEqual(['node-a']);
    expect(secondResult.status).toBe('applied');
    if (secondResult.status !== 'applied') return;
    expect(secondResult.document.nodes.map(node => node.nodeId))
      .toEqual(['node-a', 'node-b']);

    // The document was created at revision 1 by the queued load; the two
    // coalesced mutations then flush as one CAS write bumping it to 2 —
    // the revision advanced twice from the empty store, with no lost update.
    await vi.advanceTimersByTimeAsync(60);
    const persisted = parseInfiniteCanvasDocument(
      store.files.get(defaultFilePath(LOCAL_WORKSPACE))!,
    );
    if (persisted.status !== 'ok') throw new Error('expected persisted document');
    expect(persisted.document.nodes.map(node => node.nodeId)).toEqual(['node-a', 'node-b']);
    expect(persisted.document.revision).toBe(2);
  });

  it('flushes pending mutations on demand and reports the save outcome', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port, { debounceMs: 10_000 });

    await service.loadDefaultDocument(LOCAL_WORKSPACE);
    await service.mutateDefaultDocument(LOCAL_WORKSPACE, current => ({
      nodes: current.nodes,
      edges: current.edges,
      viewport: { x: 1, y: 2, zoom: 3 },
    }));

    const results = await service.flushPendingWrites();

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ status: 'saved' });

    // A later flush with nothing pending writes nothing.
    expect(await service.flushPendingWrites()).toEqual([]);
  });

  it('surfaces a concurrent external write as a conflict at flush time', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port, { debounceMs: 10_000 });

    const created = await service.loadDefaultDocument(LOCAL_WORKSPACE);
    if (created.status !== 'created') throw new Error('expected created');

    await service.mutateDefaultDocument(LOCAL_WORKSPACE, current => ({
      nodes: current.nodes,
      edges: current.edges,
      viewport: { x: 9, y: 9, zoom: 1 },
    }));

    // Another writer bumps the file underneath the pending mutation.
    const external: InfiniteCanvasDocument = {
      ...created.document,
      revision: created.document.revision + 1,
    };
    store.files.set(defaultFilePath(LOCAL_WORKSPACE), JSON.stringify(external));

    const results = await service.flushPendingWrites();
    expect(results[0]).toEqual({
      status: 'conflict',
      expectedRevision: created.document.revision,
      actualRevision: external.revision,
    });
  });

  it('returns a typed corrupted error for unparseable JSON instead of throwing', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port);
    store.files.set(defaultFilePath(LOCAL_WORKSPACE), '{ not json');

    const result = await service.loadDefaultDocument(LOCAL_WORKSPACE);

    expect(result).toMatchObject({
      status: 'failed',
      error: { kind: 'corrupted' },
    });
  });

  it('refuses to overwrite a corrupted file on save', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port);

    const created = await service.loadDefaultDocument(LOCAL_WORKSPACE);
    if (created.status !== 'created') throw new Error('expected created');
    store.files.set(defaultFilePath(LOCAL_WORKSPACE), '###');

    const result = await service.saveDocument(LOCAL_WORKSPACE, created.document);

    expect(result).toMatchObject({
      status: 'failed',
      error: { kind: 'corrupted' },
    });
    expect(store.files.get(defaultFilePath(LOCAL_WORKSPACE))).toBe('###');
  });

  it('reports an unknown schemaVersion as incompatible, never migrating it', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port);
    store.files.set(defaultFilePath(LOCAL_WORKSPACE), JSON.stringify({
      documentId: defaultInfiniteCanvasDocumentId(LOCAL_WORKSPACE.workspaceId),
      schemaVersion: '99',
      workspaceId: LOCAL_WORKSPACE.workspaceId,
      revision: 4,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: new Date(0).toISOString(),
    }));

    const result = await service.loadDefaultDocument(LOCAL_WORKSPACE);

    expect(result).toMatchObject({
      status: 'failed',
      error: { kind: 'incompatible' },
    });
    if (result.status !== 'failed' || result.error.kind !== 'incompatible') return;
    expect(result.error.reason).toContain('99');
  });

  it('rejects structurally invalid documents with a typed error', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port);

    const invalidDocuments = [
      // Missing viewport.
      {
        documentId: 'doc', schemaVersion: '1', workspaceId: 'w', revision: 1,
        nodes: [], edges: [],
      },
      // Node with an unknown kind.
      {
        documentId: 'doc', schemaVersion: '1', workspaceId: 'w', revision: 1,
        nodes: [{ nodeId: 'n1', kind: 'video', position: { x: 0, y: 0 } }],
        edges: [], viewport: { x: 0, y: 0, zoom: 1 },
      },
      // Edge missing its target.
      {
        documentId: 'doc', schemaVersion: '1', workspaceId: 'w', revision: 1,
        nodes: [], edges: [{ edgeId: 'e1', sourceNodeId: 'n1' }],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      // Negative revision.
      {
        documentId: 'doc', schemaVersion: '1', workspaceId: 'w', revision: -2,
        nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 },
      },
    ];

    for (const invalid of invalidDocuments) {
      store.files.set(defaultFilePath(LOCAL_WORKSPACE), JSON.stringify(invalid));
      const result = await service.loadDefaultDocument(LOCAL_WORKSPACE);
      expect(result).toMatchObject({
        status: 'failed',
        error: { kind: 'invalid-document' },
      });
    }
  });

  it('round-trips node payloads including media and style preset references', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port, { debounceMs: 1 });

    await service.loadDefaultDocument(LOCAL_WORKSPACE);
    await service.mutateDefaultDocument(LOCAL_WORKSPACE, current => ({
      nodes: [{
        nodeId: 'image-1',
        kind: 'image' as const,
        position: { x: 100, y: 200 },
        size: { width: 320, height: 180 },
        mediaRef: {
          workspacePath: LOCAL_WORKSPACE.workspacePath,
          relativePath: 'media/generated/batch-1/item-1.png',
        },
        stylePresetId: 'cinematic:noir-01',
      }, {
        nodeId: 'text-1',
        kind: 'text' as const,
        position: { x: -40, y: 60 },
        text: 'storyboard note',
      }],
      edges: [{ edgeId: 'edge-1', sourceNodeId: 'text-1', targetNodeId: 'image-1' }],
      viewport: current.viewport,
    }));
    await service.flushPendingWrites();

    const reloaded = await new InfiniteCanvasDocumentService(store.port)
      .loadDefaultDocument(LOCAL_WORKSPACE);

    expect(reloaded.status).toBe('loaded');
    if (reloaded.status !== 'loaded') return;
    expect(reloaded.document.nodes).toEqual([
      expect.objectContaining({
        nodeId: 'image-1',
        kind: 'image',
        size: { width: 320, height: 180 },
        mediaRef: {
          workspacePath: LOCAL_WORKSPACE.workspacePath,
          relativePath: 'media/generated/batch-1/item-1.png',
        },
        stylePresetId: 'cinematic:noir-01',
      }),
      expect.objectContaining({ nodeId: 'text-1', text: 'storyboard note' }),
    ]);
    expect(reloaded.document.edges).toEqual([
      { edgeId: 'edge-1', sourceNodeId: 'text-1', targetNodeId: 'image-1' },
    ]);
    // The K3 reserved field never comes back populated in phase 1.
    expect(reloaded.document.nodes.every(node => node.domainRef === undefined)).toBe(true);
  });

  it('returns a typed io error when the atomic write fails, keeping the old file', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port);

    const created = await service.loadDefaultDocument(LOCAL_WORKSPACE);
    if (created.status !== 'created') throw new Error('expected created');
    const before = store.files.get(defaultFilePath(LOCAL_WORKSPACE));

    const failingWrite = vi.spyOn(store.port, 'writeTextFileAtomic')
      .mockRejectedValueOnce(new Error('disk full'));

    const result = await service.saveDocument(LOCAL_WORKSPACE, created.document);

    expect(result).toMatchObject({ status: 'failed', error: { kind: 'io' } });
    expect(store.files.get(defaultFilePath(LOCAL_WORKSPACE))).toBe(before);
    failingWrite.mockRestore();
  });

  it('loads a pre-K2 document without inventing any K2 generation fields', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port);
    const preK2Node = {
      nodeId: 'image-1',
      kind: 'image',
      position: { x: 1, y: 2 },
      mediaRef: { workspacePath: 'C:/ws', relativePath: 'media/input/a.png' },
      stylePresetId: 'cinematic:noir',
    };
    store.files.set(defaultFilePath(LOCAL_WORKSPACE), JSON.stringify({
      documentId: defaultInfiniteCanvasDocumentId(LOCAL_WORKSPACE.workspaceId),
      schemaVersion: '1',
      workspaceId: LOCAL_WORKSPACE.workspaceId,
      revision: 3,
      nodes: [preK2Node],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: new Date(0).toISOString(),
    }));

    const result = await service.loadDefaultDocument(LOCAL_WORKSPACE);

    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    expect(result.document.nodes).toEqual([preK2Node]);
    expect(result.document.nodes[0]).not.toHaveProperty('prompt');
    expect(result.document.nodes[0]).not.toHaveProperty('derivedFrom');
    expect(result.document.nodes[0]).not.toHaveProperty('generation');
  });

  it('round-trips the K2 additive fields prompt, derivedFrom, and generation', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port, { debounceMs: 1 });

    await service.loadDefaultDocument(LOCAL_WORKSPACE);
    await service.mutateDefaultDocument(LOCAL_WORKSPACE, current => ({
      nodes: [{
        nodeId: 'blank-1',
        kind: 'image' as const,
        position: { x: 0, y: 0 },
        prompt: '',
      }, {
        nodeId: 'derived-1',
        kind: 'image' as const,
        position: { x: 400, y: 0 },
        prompt: 'a red fox in the snow',
        derivedFrom: {
          sourceNodeId: 'blank-1',
          toolId: 'upscale' as const,
          operationId: 'op-1',
        },
        generation: {
          operationId: 'op-1',
          toolId: 'upscale' as const,
          resultMode: 'derived' as const,
          status: 'failed' as const,
          batchId: 'batch-7',
          errorKind: 'backend' as const,
        },
      }],
      edges: current.edges,
      viewport: current.viewport,
    }));
    await service.flushPendingWrites();

    const reloaded = await new InfiniteCanvasDocumentService(store.port)
      .loadDefaultDocument(LOCAL_WORKSPACE);

    expect(reloaded.status).toBe('loaded');
    if (reloaded.status !== 'loaded') return;
    expect(reloaded.document.nodes).toEqual([
      { nodeId: 'blank-1', kind: 'image', position: { x: 0, y: 0 }, prompt: '' },
      {
        nodeId: 'derived-1',
        kind: 'image',
        position: { x: 400, y: 0 },
        prompt: 'a red fox in the snow',
        derivedFrom: { sourceNodeId: 'blank-1', toolId: 'upscale', operationId: 'op-1' },
        generation: {
          operationId: 'op-1',
          toolId: 'upscale',
          resultMode: 'derived',
          status: 'failed',
          batchId: 'batch-7',
          errorKind: 'backend',
        },
      },
    ]);
  });

  it('drops broken K2 field values as absent instead of failing the document', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port);
    store.files.set(defaultFilePath(LOCAL_WORKSPACE), JSON.stringify({
      documentId: defaultInfiniteCanvasDocumentId(LOCAL_WORKSPACE.workspaceId),
      schemaVersion: '1',
      workspaceId: LOCAL_WORKSPACE.workspaceId,
      revision: 1,
      nodes: [{
        nodeId: 'image-1',
        kind: 'image',
        position: { x: 0, y: 0 },
        prompt: 42,
        derivedFrom: { sourceNodeId: 'x', toolId: 'not-a-tool', operationId: 'op' },
        generation: { operationId: 'op', toolId: 'generate', resultMode: 'weird', status: 'pending' },
      }, {
        nodeId: 'image-2',
        kind: 'image',
        position: { x: 10, y: 10 },
        derivedFrom: 'nonsense',
        generation: {
          operationId: 'op-2',
          toolId: 'generate',
          resultMode: 'self',
          status: 'pending',
          batchId: 17,
          errorKind: 'not-an-error-kind',
        },
      }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: new Date(0).toISOString(),
    }));

    const result = await service.loadDefaultDocument(LOCAL_WORKSPACE);

    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    const [first, second] = result.document.nodes;
    expect(first).toEqual({ nodeId: 'image-1', kind: 'image', position: { x: 0, y: 0 } });
    expect(second).toEqual({
      nodeId: 'image-2',
      kind: 'image',
      position: { x: 10, y: 10 },
      // Required generation fields are valid; broken optional ones are dropped.
      generation: {
        operationId: 'op-2',
        toolId: 'generate',
        resultMode: 'self',
        status: 'pending',
      },
    });
  });

  it('dispose drops pending writes without touching the disk', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port, { debounceMs: 20 });

    await service.loadDefaultDocument(LOCAL_WORKSPACE);
    const writesAfterCreate = store.writeCount();
    await service.mutateDefaultDocument(LOCAL_WORKSPACE, current => ({
      nodes: current.nodes,
      edges: current.edges,
      viewport: { x: 7, y: 7, zoom: 1 },
    }));

    service.dispose();
    await vi.advanceTimersByTimeAsync(100);

    expect(store.writeCount()).toBe(writesAfterCreate);
  });
});
