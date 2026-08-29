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

  // H2: an unreadable file used to fail the load AND every later save (the
  // CAS write re-parses it), so the board was permanently stuck with nothing
  // on screen saying why. It is now kept as a `.bak` and the board reopens.
  it('keeps an unparseable file as a .bak and opens an empty board', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port);
    store.files.set(defaultFilePath(LOCAL_WORKSPACE), '{ not json');

    const result = await service.loadDefaultDocument(LOCAL_WORKSPACE);

    expect(result.status).toBe('created');
    if (result.status !== 'created') return;
    expect(result.document.nodes).toEqual([]);
    const backupPath = result.repair?.backupPath;
    expect(backupPath).toBeDefined();
    // Nothing was deleted: the original bytes are still on disk to inspect.
    expect(store.files.get(backupPath!)).toBe('{ not json');
    // And the board is writable again.
    const reparsed = parseInfiniteCanvasDocument(
      store.files.get(defaultFilePath(LOCAL_WORKSPACE))!,
    );
    expect(reparsed.status).toBe('ok');
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

  it('recovers a document whose identity fields are unusable', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();

    const invalidDocuments = [
      // Missing viewport.
      {
        documentId: 'doc', schemaVersion: '1', workspaceId: 'w', revision: 1,
        nodes: [], edges: [],
      },
      // Negative revision.
      {
        documentId: 'doc', schemaVersion: '1', workspaceId: 'w', revision: -2,
        nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 },
      },
    ];

    for (const invalid of invalidDocuments) {
      // A fresh service per case: the recovery writes a valid file, and the
      // pending cache would otherwise answer the next load from memory.
      const service = new InfiniteCanvasDocumentService(store.port);
      const raw = JSON.stringify(invalid);
      store.files.set(defaultFilePath(LOCAL_WORKSPACE), raw);
      const result = await service.loadDefaultDocument(LOCAL_WORKSPACE);
      // H2: the whole document is unusable, so it is moved aside rather than
      // leaving the board permanently unloadable and unwritable.
      expect(result.status).toBe('created');
      if (result.status !== 'created') return;
      expect(store.files.get(result.repair!.backupPath!)).toBe(raw);
    }
  });

  // H2: a single bad card must not cost the user the whole board. This is the
  // same tolerance rule the additive fields already followed, one level up.
  it('skips an unreadable node and counts it instead of rejecting the file', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port);
    store.files.set(defaultFilePath(LOCAL_WORKSPACE), JSON.stringify({
      documentId: defaultInfiniteCanvasDocumentId(LOCAL_WORKSPACE.workspaceId),
      schemaVersion: '1',
      workspaceId: LOCAL_WORKSPACE.workspaceId,
      revision: 3,
      nodes: [
        { nodeId: 'good-1', kind: 'text', position: { x: 0, y: 0 }, text: 'kept' },
        // 'audio' is not a kind this build knows; pre-H2 it killed the file.
        { nodeId: 'bad-1', kind: 'audio', position: { x: 1, y: 1 } },
        { nodeId: 'good-2', kind: 'image', position: { x: 2, y: 2 } },
      ],
      // Edge missing its target: unreadable, skipped, counted.
      edges: [{ edgeId: 'e1', sourceNodeId: 'good-1' }],
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: new Date(0).toISOString(),
    }));

    const result = await service.loadDefaultDocument(LOCAL_WORKSPACE);

    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    expect(result.document.nodes.map(node => node.nodeId)).toEqual(['good-1', 'good-2']);
    expect(result.document.edges).toEqual([]);
    expect(result.repair).toEqual({ skippedNodes: 1, skippedEdges: 1 });
    // The file is untouched until the user edits: recovery is not a rewrite.
    expect(store.files.get(defaultFilePath(LOCAL_WORKSPACE))).toContain('audio');
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
        // K3 §5.1.4: the domain reference has a writer now, so it has to
        // survive a save and a reload. Before K3 the parser dropped it, which
        // made storing it and losing it the same thing.
        domainRef: {
          moduleId: 'short-drama',
          kind: 'character',
          id: 'artifact-1',
          role: 'refine',
        },
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
        domainRef: {
          moduleId: 'short-drama',
          kind: 'character',
          id: 'artifact-1',
          role: 'refine',
        },
      }),
      expect.objectContaining({ nodeId: 'text-1', text: 'storyboard note' }),
    ]);
    expect(reloaded.document.edges).toEqual([
      { edgeId: 'edge-1', sourceNodeId: 'text-1', targetNodeId: 'image-1' },
    ]);
    // A card that was never sent from short-drama still has no owner.
    expect(reloaded.document.nodes[1].domainRef).toBeUndefined();
  });

  /**
   * K3 §5.1.4: one bad label must never cost the user the whole board. Every
   * malformed reference below reads as "absent" and the node around it still
   * parses — the document is never invalid because of this field.
   */
  it('drops an unusable domain reference without invalidating the node', () => {
    const badRefs = [
      'short-drama',
      null,
      {},
      { moduleId: 'short-drama', kind: 'character', id: 'a' },
      { moduleId: 'short-drama', kind: 'character', id: '  ', role: 'refine' },
      { moduleId: 'short-drama', kind: 'character', id: 'a', role: 42 },
      // Forward compatibility: a module this build does not know is dropped
      // silently rather than treated as corruption.
      { moduleId: 'some-future-module', kind: 'character', id: 'a', role: 'refine' },
      { moduleId: 'short-drama', kind: 'video', id: 'a', role: 'refine' },
      { moduleId: 'short-drama', kind: 'character', id: 'a', role: 'reference' },
    ];
    const raw = JSON.stringify({
      documentId: 'doc',
      schemaVersion: '1',
      workspaceId: 'w',
      revision: 1,
      nodes: badRefs.map((domainRef, index) => ({
        nodeId: `node-${index}`,
        kind: 'image',
        position: { x: index, y: 0 },
        domainRef,
      })),
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: '2026-08-28T00:00:00.000Z',
    });

    const parsed = parseInfiniteCanvasDocument(raw);

    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;
    expect(parsed.document.nodes).toHaveLength(badRefs.length);
    expect(parsed.document.nodes.every(node => node.domainRef === undefined)).toBe(true);
  });

  it('parses the additive edge role tolerantly: derived kept, unknown dropped', () => {
    const raw = JSON.stringify({
      documentId: 'doc', schemaVersion: '1', workspaceId: 'w', revision: 1,
      nodes: [
        { nodeId: 'a', kind: 'image', position: { x: 0, y: 0 } },
        { nodeId: 'b', kind: 'image', position: { x: 0, y: 0 } },
        { nodeId: 'c', kind: 'image', position: { x: 0, y: 0 } },
      ],
      edges: [
        // Version-tree edge written by a derived operation.
        { edgeId: 'e-derived', sourceNodeId: 'a', targetNodeId: 'b', role: 'derived' },
        // Unknown role value: dropped as absent, never an invalid document.
        { edgeId: 'e-bogus', sourceNodeId: 'b', targetNodeId: 'c', role: 'reference?' },
        // Pre-role edge shape stays valid unchanged.
        { edgeId: 'e-plain', sourceNodeId: 'a', targetNodeId: 'c' },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    const parsed = parseInfiniteCanvasDocument(raw);

    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;
    expect(parsed.document.edges).toEqual([
      { edgeId: 'e-derived', sourceNodeId: 'a', targetNodeId: 'b', role: 'derived' },
      { edgeId: 'e-bogus', sourceNodeId: 'b', targetNodeId: 'c' },
      { edgeId: 'e-plain', sourceNodeId: 'a', targetNodeId: 'c' },
    ]);
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

  it('round-trips a P3 video node alongside untouched sibling nodes', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port, { debounceMs: 1 });

    await service.loadDefaultDocument(LOCAL_WORKSPACE);
    await service.mutateDefaultDocument(LOCAL_WORKSPACE, current => ({
      nodes: [{
        nodeId: 'video-1',
        kind: 'video' as const,
        position: { x: 0, y: 0 },
        size: { width: 480, height: 270 },
        prompt: 'a 5 second dolly shot',
        mediaRef: {
          workspacePath: LOCAL_WORKSPACE.workspacePath,
          relativePath: 'media/generated/batch-9/video-001.mp4',
        },
      }, {
        nodeId: 'video-pending-1',
        kind: 'video' as const,
        position: { x: 520, y: 0 },
        prompt: 'cyberpunk variant',
        derivedFrom: {
          sourceNodeId: 'image-1',
          toolId: 'generate' as const,
          operationId: 'op-v1',
        },
        generation: {
          operationId: 'op-v1',
          toolId: 'generate' as const,
          resultMode: 'derived' as const,
          status: 'pending' as const,
          mediaKind: 'video' as const,
        },
      }, {
        nodeId: 'image-1',
        kind: 'image' as const,
        position: { x: -400, y: 0 },
        mediaRef: {
          workspacePath: LOCAL_WORKSPACE.workspacePath,
          relativePath: 'media/generated/batch-1/item-1.png',
        },
      }, {
        nodeId: 'text-1',
        kind: 'text' as const,
        position: { x: -400, y: 300 },
        text: 'shot note',
      }],
      edges: [{ edgeId: 'edge-1', sourceNodeId: 'image-1', targetNodeId: 'video-pending-1' }],
      viewport: current.viewport,
    }));
    await service.flushPendingWrites();

    const reloaded = await new InfiniteCanvasDocumentService(store.port)
      .loadDefaultDocument(LOCAL_WORKSPACE);

    expect(reloaded.status).toBe('loaded');
    if (reloaded.status !== 'loaded') return;
    // The video nodes survive intact, and the sibling image/text nodes in the
    // same document are parsed unaffected.
    expect(reloaded.document.nodes).toEqual([
      expect.objectContaining({
        nodeId: 'video-1',
        kind: 'video',
        size: { width: 480, height: 270 },
        prompt: 'a 5 second dolly shot',
        mediaRef: {
          workspacePath: LOCAL_WORKSPACE.workspacePath,
          relativePath: 'media/generated/batch-9/video-001.mp4',
        },
      }),
      expect.objectContaining({
        nodeId: 'video-pending-1',
        kind: 'video',
        derivedFrom: { sourceNodeId: 'image-1', toolId: 'generate', operationId: 'op-v1' },
        generation: {
          operationId: 'op-v1',
          toolId: 'generate',
          resultMode: 'derived',
          status: 'pending',
          mediaKind: 'video',
        },
      }),
      expect.objectContaining({ nodeId: 'image-1', kind: 'image' }),
      expect.objectContaining({ nodeId: 'text-1', kind: 'text', text: 'shot note' }),
    ]);
    expect(reloaded.document.edges).toEqual([
      { edgeId: 'edge-1', sourceNodeId: 'image-1', targetNodeId: 'video-pending-1' },
    ]);
  });

  it('round-trips the P3 agentOps watermark through mutate and save', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    store.files.set(defaultFilePath(LOCAL_WORKSPACE), JSON.stringify({
      documentId: defaultInfiniteCanvasDocumentId(LOCAL_WORKSPACE.workspaceId),
      schemaVersion: '1',
      workspaceId: LOCAL_WORKSPACE.workspaceId,
      revision: 2,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: new Date(0).toISOString(),
      agentOps: { appliedSeq: 7 },
    }));
    const service = new InfiniteCanvasDocumentService(store.port, { debounceMs: 1 });

    const loaded = await service.loadDefaultDocument(LOCAL_WORKSPACE);
    expect(loaded.status).toBe('loaded');
    if (loaded.status !== 'loaded') return;
    expect(loaded.document.agentOps).toEqual({ appliedSeq: 7 });

    // A content mutation (nodes/edges/viewport) must not drop the watermark.
    await service.mutateDefaultDocument(LOCAL_WORKSPACE, current => ({
      nodes: current.nodes,
      edges: current.edges,
      viewport: { x: 3, y: 3, zoom: 1 },
    }));
    await service.flushPendingWrites();

    const persisted = parseInfiniteCanvasDocument(
      store.files.get(defaultFilePath(LOCAL_WORKSPACE))!,
    );
    if (persisted.status !== 'ok') throw new Error('expected persisted document');
    expect(persisted.document.agentOps).toEqual({ appliedSeq: 7 });
    expect(persisted.document.viewport).toEqual({ x: 3, y: 3, zoom: 1 });
  });

  it('drops broken P3 mediaKind and agentOps values as absent, keeping the document', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port);
    store.files.set(defaultFilePath(LOCAL_WORKSPACE), JSON.stringify({
      documentId: defaultInfiniteCanvasDocumentId(LOCAL_WORKSPACE.workspaceId),
      schemaVersion: '1',
      workspaceId: LOCAL_WORKSPACE.workspaceId,
      revision: 1,
      nodes: [{
        nodeId: 'video-1',
        kind: 'video',
        position: { x: 0, y: 0 },
        generation: {
          operationId: 'op-1',
          toolId: 'generate',
          resultMode: 'self',
          status: 'pending',
          mediaKind: 'hologram',
        },
      }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: new Date(0).toISOString(),
      agentOps: { appliedSeq: -3 },
    }));

    const result = await service.loadDefaultDocument(LOCAL_WORKSPACE);

    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    expect(result.document).not.toHaveProperty('agentOps');
    expect(result.document.nodes[0].generation).toEqual({
      operationId: 'op-1',
      toolId: 'generate',
      resultMode: 'self',
      status: 'pending',
    });

    // Other broken shapes are equally dropped without failing the load.
    for (const agentOps of ['nonsense', { appliedSeq: 1.5 }, { appliedSeq: 'x' }, null]) {
      store.files.set(defaultFilePath(LOCAL_WORKSPACE), JSON.stringify({
        documentId: defaultInfiniteCanvasDocumentId(LOCAL_WORKSPACE.workspaceId),
        schemaVersion: '1',
        workspaceId: LOCAL_WORKSPACE.workspaceId,
        revision: 1,
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        updatedAt: new Date(0).toISOString(),
        agentOps,
      }));
      const reloaded = await service.loadDefaultDocument(LOCAL_WORKSPACE);
      expect(reloaded.status).toBe('loaded');
      if (reloaded.status !== 'loaded') return;
      expect(reloaded.document).not.toHaveProperty('agentOps');
    }
  });

  it('loads a pre-P3 document without inventing agentOps or mediaKind', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port);
    store.files.set(defaultFilePath(LOCAL_WORKSPACE), JSON.stringify({
      documentId: defaultInfiniteCanvasDocumentId(LOCAL_WORKSPACE.workspaceId),
      schemaVersion: '1',
      workspaceId: LOCAL_WORKSPACE.workspaceId,
      revision: 5,
      nodes: [{
        nodeId: 'image-1',
        kind: 'image',
        position: { x: 1, y: 2 },
        generation: {
          operationId: 'op-1',
          toolId: 'generate',
          resultMode: 'self',
          status: 'pending',
        },
      }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: new Date(0).toISOString(),
    }));

    const result = await service.loadDefaultDocument(LOCAL_WORKSPACE);

    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    expect(result.document).not.toHaveProperty('agentOps');
    expect(result.document.nodes[0].generation).not.toHaveProperty('mediaKind');
  });

  it('round-trips the P4 additive generationParams on image and video cards', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port, { debounceMs: 1 });

    await service.loadDefaultDocument(LOCAL_WORKSPACE);
    await service.mutateDefaultDocument(LOCAL_WORKSPACE, current => ({
      nodes: [{
        nodeId: 'image-1',
        kind: 'image' as const,
        position: { x: 0, y: 0 },
        prompt: 'a red fox',
        generationParams: {
          model: 'gemini-3-pro-image-preview',
          size: '16:9',
          resolution: '2K',
          n: 3,
        },
      }, {
        nodeId: 'video-1',
        kind: 'video' as const,
        position: { x: 400, y: 0 },
        generationParams: { aspectRatio: '9:16', resolution: '1080p', duration: 8 },
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
      {
        nodeId: 'image-1',
        kind: 'image',
        position: { x: 0, y: 0 },
        prompt: 'a red fox',
        generationParams: {
          model: 'gemini-3-pro-image-preview',
          size: '16:9',
          resolution: '2K',
          n: 3,
        },
      },
      {
        nodeId: 'video-1',
        kind: 'video',
        position: { x: 400, y: 0 },
        generationParams: { aspectRatio: '9:16', resolution: '1080p', duration: 8 },
      },
    ]);
  });

  it('drops broken P4 generationParams field by field, sparing sibling nodes', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port);
    store.files.set(defaultFilePath(LOCAL_WORKSPACE), JSON.stringify({
      documentId: defaultInfiniteCanvasDocumentId(LOCAL_WORKSPACE.workspaceId),
      schemaVersion: '1',
      workspaceId: LOCAL_WORKSPACE.workspaceId,
      revision: 1,
      nodes: [
        // Whole field is a string → absent, the node itself survives.
        { nodeId: 'image-1', kind: 'image', position: { x: 0, y: 0 }, generationParams: 'nope' },
        // Whole field is an array → absent.
        { nodeId: 'image-2', kind: 'image', position: { x: 1, y: 1 }, generationParams: ['16:9'] },
        {
          nodeId: 'image-3',
          kind: 'image',
          position: { x: 2, y: 2 },
          generationParams: {
            model: 7,
            size: '',
            resolution: '2K',
            n: 9,
            duration: 2.5,
            aspectRatio: null,
          },
        },
        // Every field broken → the whole object collapses to absent.
        { nodeId: 'image-4', kind: 'image', position: { x: 3, y: 3 }, generationParams: { n: 0 } },
        // Untouched sibling: the broken neighbours must not affect it.
        {
          nodeId: 'image-5',
          kind: 'image',
          position: { x: 4, y: 4 },
          generationParams: { n: 4 },
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: new Date(0).toISOString(),
    }));

    const result = await service.loadDefaultDocument(LOCAL_WORKSPACE);

    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    expect(result.document.nodes).toEqual([
      { nodeId: 'image-1', kind: 'image', position: { x: 0, y: 0 } },
      { nodeId: 'image-2', kind: 'image', position: { x: 1, y: 1 } },
      {
        nodeId: 'image-3',
        kind: 'image',
        position: { x: 2, y: 2 },
        generationParams: { resolution: '2K' },
      },
      { nodeId: 'image-4', kind: 'image', position: { x: 3, y: 3 } },
      { nodeId: 'image-5', kind: 'image', position: { x: 4, y: 4 }, generationParams: { n: 4 } },
    ]);
  });

  it('loads a pre-P4 document without inventing generationParams', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port);
    store.files.set(defaultFilePath(LOCAL_WORKSPACE), JSON.stringify({
      documentId: defaultInfiniteCanvasDocumentId(LOCAL_WORKSPACE.workspaceId),
      schemaVersion: '1',
      workspaceId: LOCAL_WORKSPACE.workspaceId,
      revision: 3,
      nodes: [{ nodeId: 'image-1', kind: 'image', position: { x: 1, y: 2 }, prompt: 'kept' }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: new Date(0).toISOString(),
    }));

    const result = await service.loadDefaultDocument(LOCAL_WORKSPACE);

    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    expect(result.document.nodes[0]).not.toHaveProperty('generationParams');
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

  // —— H1: a coalesced write that fails must not take the edits with it ——

  it('keeps the pending document and retries after a failed flush write', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    let failNextWrite = true;
    const flakyPort = {
      ...store.port,
      writeTextFileAtomic: async (path: string, content: string) => {
        if (failNextWrite && path === defaultFilePath(LOCAL_WORKSPACE)
          && content.includes('node-keepme')) {
          failNextWrite = false;
          throw new Error('disk went away');
        }
        return store.port.writeTextFileAtomic(path, content);
      },
    };
    const service = new InfiniteCanvasDocumentService(flakyPort, { debounceMs: 20 });
    const failures: unknown[] = [];
    service.onPersistenceFailure(failure => failures.push(failure));

    await service.loadDefaultDocument(LOCAL_WORKSPACE);
    await service.mutateDefaultDocument(LOCAL_WORKSPACE, current => ({
      nodes: [...current.nodes, {
        nodeId: 'node-keepme',
        kind: 'text' as const,
        position: { x: 1, y: 2 },
        text: 'keep me',
      }],
      edges: current.edges,
      viewport: current.viewport,
    }));

    await vi.advanceTimersByTimeAsync(30);

    // The write threw, so the edits are still owned by the service and the
    // failure was reported rather than swallowed.
    expect(service.hasPendingWrites(LOCAL_WORKSPACE)).toBe(true);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ retrying: true, outcome: { status: 'failed' } });

    // The scheduled backoff retry lands the same edits without a new mutation.
    await vi.advanceTimersByTimeAsync(1_000);

    expect(service.hasPendingWrites(LOCAL_WORKSPACE)).toBe(false);
    const persisted = parseInfiniteCanvasDocument(
      store.files.get(defaultFilePath(LOCAL_WORKSPACE))!,
    );
    if (persisted.status !== 'ok') throw new Error('expected persisted document');
    expect(persisted.document.nodes.map(node => node.nodeId)).toEqual(['node-keepme']);
  });

  it('reports a flush conflict instead of dropping the edits silently', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    const service = new InfiniteCanvasDocumentService(store.port, { debounceMs: 20 });
    const failures: { retrying: boolean; outcome: { status: string } }[] = [];
    service.onPersistenceFailure(failure => failures.push(failure));

    await service.loadDefaultDocument(LOCAL_WORKSPACE);
    await service.mutateDefaultDocument(LOCAL_WORKSPACE, current => ({
      nodes: [...current.nodes, {
        nodeId: 'node-conflict',
        kind: 'text' as const,
        position: { x: 0, y: 0 },
        text: 'mine',
      }],
      edges: current.edges,
      viewport: current.viewport,
    }));

    // Somebody else advanced the file underneath the coalescing window.
    const onDisk = parseInfiniteCanvasDocument(
      store.files.get(defaultFilePath(LOCAL_WORKSPACE))!,
    );
    if (onDisk.status !== 'ok') throw new Error('expected a readable document');
    store.files.set(
      defaultFilePath(LOCAL_WORKSPACE),
      JSON.stringify({ ...onDisk.document, revision: 9 }, null, 2),
    );

    await vi.advanceTimersByTimeAsync(30);

    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      retrying: true,
      outcome: { status: 'conflict', expectedRevision: 1, actualRevision: 9 },
    });
    // The user's card is still in memory; the old code had already deleted it.
    expect(service.hasPendingWrites(LOCAL_WORKSPACE)).toBe(true);
    const stillPending = await service.loadDefaultDocument(LOCAL_WORKSPACE);
    if (stillPending.status !== 'loaded') throw new Error('expected the pending document');
    expect(stillPending.document.nodes.map(node => node.nodeId)).toEqual(['node-conflict']);

    service.dispose();
  });

  it('does not lose a mutation that arrives while a flush write is in flight', async () => {
    const store = createInMemoryInfiniteCanvasPersistence();
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>(resolve => { releaseWrite = resolve; });
    let gated = false;
    const slowPort = {
      ...store.port,
      writeTextFileAtomic: async (path: string, content: string) => {
        if (!gated && content.includes('node-first')) {
          gated = true;
          await writeGate;
        }
        return store.port.writeTextFileAtomic(path, content);
      },
    };
    const service = new InfiniteCanvasDocumentService(slowPort, { debounceMs: 20 });

    const textNode = (nodeId: string) => ({
      nodeId,
      kind: 'text' as const,
      position: { x: 0, y: 0 },
      text: nodeId,
    });
    await service.loadDefaultDocument(LOCAL_WORKSPACE);
    await service.mutateDefaultDocument(LOCAL_WORKSPACE, current => ({
      nodes: [...current.nodes, textNode('node-first')],
      edges: current.edges,
      viewport: current.viewport,
    }));

    // Start the flush and leave its write hanging on the wire.
    const flushing = vi.advanceTimersByTimeAsync(30);
    await Promise.resolve();

    // A second edit arrives mid-flight. Pre-fix it found no pending entry,
    // re-read the pre-flush file and adopted a stale base revision.
    const second = service.mutateDefaultDocument(LOCAL_WORKSPACE, current => ({
      nodes: [...current.nodes, textNode('node-second')],
      edges: current.edges,
      viewport: current.viewport,
    }));
    releaseWrite();
    await flushing;
    const secondResult = await second;

    expect(secondResult.status).toBe('applied');
    if (secondResult.status !== 'applied') return;
    expect(secondResult.document.nodes.map(node => node.nodeId))
      .toEqual(['node-first', 'node-second']);

    await vi.advanceTimersByTimeAsync(200);

    const persisted = parseInfiniteCanvasDocument(
      store.files.get(defaultFilePath(LOCAL_WORKSPACE))!,
    );
    if (persisted.status !== 'ok') throw new Error('expected persisted document');
    expect(persisted.document.nodes.map(node => node.nodeId))
      .toEqual(['node-first', 'node-second']);
    expect(service.hasPendingWrites(LOCAL_WORKSPACE)).toBe(false);
  });
});
