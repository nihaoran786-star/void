import { describe, expect, it } from 'vitest';

import {
  createShortDramaMediaArtifactIndex,
  createShortDramaSearchIndex,
  createShortDramaStageTimelineViewModel,
  createShortDramaDefaultLibraryService,
  createShortDramaStaticProject,
  initializeShortDramaWorkspaceProject,
  migrateShortDramaLegacyProjectPath,
  staticShortDramaLibraryService,
  updateShortDramaProductionMode,
} from './index';

function createMemoryManifestAdapter(seed?: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(seed ?? {}));
  const adapter = {
    kind: 'local' as const,
    async read(key: string) {
      return store.get(key);
    },
    async write(key: string, value: string) {
      store.set(key, value);
    },
  };

  return { adapter, store };
}

describe('staticShortDramaLibraryService', () => {
  it('returns an unsupported state when no workspace is available', async () => {
    await expect(staticShortDramaLibraryService.loadProject()).resolves.toMatchObject({
      status: 'unsupported',
      error: {
        code: 'missing_workspace',
      },
    });
  });

  it('loads the static short drama project for a workspace', async () => {
    const state = await staticShortDramaLibraryService.loadProject('C:/work');

    expect(state.status).toBe('ready');
    if (state.status === 'ready') {
      expect(state.project.projectId).toBe('static_short_drama_001');
      expect(state.project.episodes).toHaveLength(10);
      expect(state.project.productionPlan.episodeRange).toBe('Episode 01-10');
      expect(state.project.artifacts.some(artifact => artifact.episodeId === 'episode-10')).toBe(true);
      expect(state.project.artifacts.filter(artifact => artifact.stage === 'assets').map(artifact => artifact.type).sort()).toEqual([
        'character',
        'location',
        'prop',
      ]);
    }
  });

  it('creates a 100-episode placeholder project for long-series media and scroll stability tests', () => {
    const project = createShortDramaStaticProject({ episodeCount: 100 });
    const postTimeline = createShortDramaStageTimelineViewModel(project, 'post');
    const videoMedia = createShortDramaMediaArtifactIndex(project, { includeEmpty: true })
      .filter(entry => entry.stage === 'video');
    const postMedia = createShortDramaMediaArtifactIndex(project, { includeEmpty: true })
      .filter(entry => entry.stage === 'post' && entry.mediaKind === 'video');
    const searchIndex = createShortDramaSearchIndex(project, { includeEmptyMedia: true });

    expect(project.episodes).toHaveLength(100);
    expect(project.productionPlan.episodeRange).toBe('Episode 01-100');
    expect(project.productionPlan.steps.every(step => step.episodeIds.length === 100)).toBe(true);
    expect(postTimeline).toHaveLength(100);
    expect(videoMedia).toEqual(expect.arrayContaining([
      expect.objectContaining({ episodeNumber: 100, artifactHandle: 'EP100-VID01', mediaStatus: 'empty' }),
    ]));
    expect(postMedia).toEqual(expect.arrayContaining([
      expect.objectContaining({ episodeNumber: 100, artifactHandle: 'EP100-POST01', mediaStatus: 'empty' }),
    ]));
    expect(JSON.stringify(searchIndex)).not.toContain('data:image/svg+xml');
    expect(JSON.stringify(searchIndex)).not.toContain('/short-drama-static/final-preview.mp4');
  });

  it('initializes an empty single-workspace short drama project without demo fallback', async () => {
    const { adapter, store } = createMemoryManifestAdapter();

    const result = await initializeShortDramaWorkspaceProject(adapter, {
      kind: 'empty',
      projectId: 'workspace_drama',
      title: 'Workspace Drama',
      timestamp: 1000,
    });

    expect(result).toMatchObject({
      status: 'ready',
      action: 'initialized',
      project: {
        projectId: 'workspace_drama',
        title: 'Workspace Drama',
        activeStage: 'script',
      },
    });
    expect(store.has('.void/short-drama/manifest.json')).toBe(true);
    expect(store.has('.void/short-drama/workspace_drama/manifest.json')).toBe(false);
    expect(store.get('.void/short-drama/script.md')).toContain('# 第1集');
    expect(JSON.parse(store.get('.void/short-drama/indexes/script-segment-index.json') ?? '{}')).toEqual(
      expect.objectContaining({
        source: 'derived',
        entries: expect.arrayContaining([
          expect.objectContaining({ handle: 'EP01', episodeNumber: 1 }),
        ]),
      }),
    );
    expect(store.get('.void/short-drama/audit-log.jsonl')).toContain('Initialized empty short drama project.');
  });

  it('initializes a script project and derives episodes from top-level script headings', async () => {
    const { adapter, store } = createMemoryManifestAdapter();

    const result = await initializeShortDramaWorkspaceProject(adapter, {
      kind: 'script',
      projectId: 'script_drama',
      title: 'Script Drama',
      scriptContent: '# 第1集\n\n开场。\n\n# Episode 2\n\n转折。\n\n# EP03\n\n结尾。',
      timestamp: 1000,
    });

    expect(result.status).toBe('ready');
    expect(result.status === 'ready' ? result.project.episodes.map(episode => episode.number) : []).toEqual([1, 2, 3]);
    expect(JSON.parse(store.get('.void/short-drama/indexes/script-segment-index.json') ?? '{}')).toEqual(
      expect.objectContaining({
        entries: expect.arrayContaining([
          expect.objectContaining({ handle: 'EP01', headingText: '第1集' }),
          expect.objectContaining({ handle: 'EP02', headingText: 'Episode 2' }),
          expect.objectContaining({ handle: 'EP03', headingText: 'EP03' }),
        ]),
      }),
    );
  });

  it('initializes an explicit demo fixture project at the single-workspace root', async () => {
    const { adapter, store } = createMemoryManifestAdapter();

    const result = await initializeShortDramaWorkspaceProject(adapter, {
      kind: 'demo',
      demoEpisodeCount: 10,
      timestamp: 1000,
    });

    expect(result.status).toBe('ready');
    expect(result.status === 'ready' ? result.project.projectId : undefined).toBe('static_short_drama_001');
    expect(result.status === 'ready' ? result.project.episodes : []).toHaveLength(10);
    expect(store.has('.void/short-drama/manifest.json')).toBe(true);
    expect(store.has('.void/short-drama/static_short_drama_001/manifest.json')).toBe(false);
    expect(store.get('.void/short-drama/audit-log.jsonl')).toContain('Initialized demo short drama fixture.');
  });

  it('migrates an old projectId path into the single-workspace root without deleting the legacy source', async () => {
    const legacyProject = createShortDramaStaticProject({ episodeCount: 2 });
    const { adapter, store } = createMemoryManifestAdapter({
      '.void/short-drama/static_short_drama_001/manifest.json': JSON.stringify({
        manifestVersion: 1,
        project: legacyProject,
      }),
      '.void/short-drama/static_short_drama_001/script.md': '# 第1集\n\nlegacy script wins',
      '.void/short-drama/static_short_drama_001/artifacts/episode-01-video-01.json': JSON.stringify({
        ...legacyProject.artifacts.find(artifact => artifact.id === 'episode-01-video-01'),
        title: 'Legacy sidecar title',
      }),
    });

    const result = await migrateShortDramaLegacyProjectPath(adapter, {
      projectId: 'static_short_drama_001',
      timestamp: 1000,
    });

    expect(result.status).toBe('ready');
    expect(store.has('.void/short-drama/manifest.json')).toBe(true);
    expect(store.get('.void/short-drama/static_short_drama_001/manifest.json')).toBeDefined();
    expect(store.get('.void/short-drama/script.md')).toContain('legacy script wins');
    expect(JSON.parse(store.get('.void/short-drama/artifacts/episode-01-video-01.json') ?? '{}')).toEqual(
      expect.objectContaining({ title: 'Legacy sidecar title' }),
    );
    expect(store.get('.void/short-drama/audit-log.jsonl')).toContain('Migrated legacy short drama project path');
  });

  it('protects an existing single-workspace project during init and legacy migration unless overwrite is explicit', async () => {
    const { adapter, store } = createMemoryManifestAdapter();
    const initial = await initializeShortDramaWorkspaceProject(adapter, {
      kind: 'empty',
      projectId: 'existing_drama',
      title: 'Existing Drama',
      timestamp: 1000,
    });
    if (initial.status !== 'ready') {
      throw new Error('Expected initialized project');
    }
    const before = store.get('.void/short-drama/manifest.json');
    store.set('.void/short-drama/legacy_drama/manifest.json', JSON.stringify({
      manifestVersion: 1,
      project: createShortDramaStaticProject({ episodeCount: 1 }),
    }));

    await expect(initializeShortDramaWorkspaceProject(adapter, {
      kind: 'demo',
      timestamp: 2000,
    })).resolves.toMatchObject({
      status: 'protected',
      existingProjectId: 'existing_drama',
    });
    await expect(migrateShortDramaLegacyProjectPath(adapter, {
      projectId: 'legacy_drama',
      timestamp: 2000,
    })).resolves.toMatchObject({
      status: 'protected',
      existingProjectId: 'existing_drama',
    });
    expect(store.get('.void/short-drama/manifest.json')).toBe(before);
  });

  it('loads static project when manifest is empty and restores saved manifest state later', async () => {
    const store = new Map<string, string>();
    const adapter = {
      kind: 'local' as const,
      async read(key: string) {
        return store.get(key);
      },
      async write(key: string, value: string) {
        store.set(key, value);
      },
    };
    const service = createShortDramaDefaultLibraryService(adapter, 'static_short_drama_001', { demoMode: true });

    const initial = await service.loadProject('C:/work');
    expect(initial.status).toBe('ready');
    expect(initial.status === 'ready' ? initial.source : undefined).toBe('static');

    if (initial.status !== 'ready') {
      throw new Error('Expected initial static project');
    }

    await service.saveProject(updateShortDramaProductionMode(initial.project, 'automatic'));
    const restored = await service.loadProject('C:/work');

    expect(restored.status).toBe('ready');
    expect(restored.status === 'ready' ? restored.source : undefined).toBe('manifest');
    expect(restored.status === 'ready' ? restored.project.productionPlan.mode : undefined).toBe('automatic');
  });

  it('writes derived artifact, media, script segment, and search indexes as rebuildable caches without making them the source of truth', async () => {
    const store = new Map<string, string>();
    const adapter = {
      kind: 'local' as const,
      async read(key: string) {
        return store.get(key);
      },
      async write(key: string, value: string) {
        store.set(key, value);
      },
    };
    const service = createShortDramaDefaultLibraryService(adapter, 'static_short_drama_001', { demoMode: true });
    const initial = await service.loadProject('C:/work');
    if (initial.status !== 'ready') {
      throw new Error('Expected initial static project');
    }

    await service.saveProject(initial.project);

    expect(store.has('.void/short-drama/manifest.json')).toBe(true);
    expect(JSON.parse(store.get('.void/short-drama/indexes/artifact-index.json') ?? '{}')).toEqual(
      expect.objectContaining({
        cacheVersion: 1,
        source: 'derived',
        entries: expect.arrayContaining([
          expect.objectContaining({ id: 'episode-01-video-01', handle: 'EP01-VID01' }),
        ]),
      }),
    );
    expect(JSON.parse(store.get('.void/short-drama/indexes/media-index.json') ?? '{}')).toEqual(
      expect.objectContaining({
        cacheVersion: 1,
        source: 'derived',
        entries: expect.arrayContaining([
          expect.objectContaining({
            artifactId: 'episode-01-post-final',
            mediaItemId: 'media-post-final-01',
            playable: true,
          }),
        ]),
      }),
    );
    expect(JSON.parse(store.get('.void/short-drama/indexes/script-segment-index.json') ?? '{}')).toEqual(
      expect.objectContaining({
        cacheVersion: 1,
        source: 'derived',
        entries: expect.arrayContaining([
          expect.objectContaining({
            id: 'script-segment-episode-01',
            handle: 'EP01',
            episodeNumber: 1,
          }),
        ]),
      }),
    );
    const searchIndex = JSON.parse(store.get('.void/short-drama/indexes/search-index.json') ?? '{}');
    expect(searchIndex).toEqual(
      expect.objectContaining({
        cacheVersion: 1,
        source: 'derived',
        entries: expect.arrayContaining([
          expect.objectContaining({ id: 'artifact:episode-01-video-01', kind: 'artifact' }),
          expect.objectContaining({ id: 'media:episode-01-post-final', kind: 'media' }),
          expect.objectContaining({ id: 'script:script-segment-episode-01', kind: 'scriptSegment' }),
        ]),
      }),
    );
    expect(JSON.stringify(searchIndex)).not.toContain('/short-drama-static/final-preview.mp4');
    expect(JSON.stringify(searchIndex)).not.toContain('data:image/svg+xml');
    store.set('.void/short-drama/indexes/artifact-index.json', '{broken json');
    store.set('.void/short-drama/indexes/media-index.json', '{broken json');
    store.set('.void/short-drama/indexes/script-segment-index.json', '{broken json');
    store.set('.void/short-drama/indexes/search-index.json', '{broken json');
    const restored = await service.loadProject('C:/work');

    expect(restored.status).toBe('ready');
    expect(restored.status === 'ready' ? restored.project.projectId : undefined).toBe('static_short_drama_001');
  });

  it('writes script, artifact, revision, and attempt sidecars as source-of-truth files', async () => {
    const store = new Map<string, string>();
    const adapter = {
      kind: 'local' as const,
      async read(key: string) {
        return store.get(key);
      },
      async write(key: string, value: string) {
        store.set(key, value);
      },
    };
    const service = createShortDramaDefaultLibraryService(adapter, 'static_short_drama_001', { demoMode: true });
    const initial = await service.loadProject('C:/work');
    if (initial.status !== 'ready') {
      throw new Error('Expected initial static project');
    }

    await service.saveProject(initial.project);

    expect(store.get('.void/short-drama/script.md')).toContain('# 第1集');
    expect(JSON.parse(store.get('.void/short-drama/artifacts/episode-01-video-01.json') ?? '{}')).toEqual(
      expect.objectContaining({
        id: 'episode-01-video-01',
        stage: 'video',
        mediaReference: expect.objectContaining({
          mediaItemId: 'media-video-01',
        }),
      }),
    );
    expect(JSON.parse(store.get('.void/short-drama/assets/episode-01-character-guard.json') ?? '{}')).toEqual(
      expect.objectContaining({
        id: 'episode-01-character-guard',
        stage: 'assets',
        type: 'character',
      }),
    );
    expect(JSON.parse(store.get('.void/short-drama/revisions/episode-01-video-01.json') ?? '[]')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'revision-video-01' }),
      ]),
    );
    expect(JSON.parse(store.get('.void/short-drama/attempts/episode-01-video-01.json') ?? '[]')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'attempt-video-01' }),
      ]),
    );
    const auditLogLines = (store.get('.void/short-drama/audit-log.jsonl') ?? '').trim().split('\n');
    expect(auditLogLines.map(line => JSON.parse(line))).toEqual(expect.arrayContaining([
      expect.objectContaining({
        artifactId: 'episode-01-video-01',
        latestEventType: 'revision',
      }),
    ]));
    expect(store.get('.void/short-drama/audit-log.jsonl')).not.toContain('/short-drama-static/final-preview.mp4');
  });

  it('loads script and artifact source sidecars over stale manifest inline data', async () => {
    const store = new Map<string, string>();
    const adapter = {
      kind: 'local' as const,
      async read(key: string) {
        return store.get(key);
      },
      async write(key: string, value: string) {
        store.set(key, value);
      },
    };
    const service = createShortDramaDefaultLibraryService(adapter, 'static_short_drama_001', { demoMode: true });
    const initial = await service.loadProject('C:/work');
    if (initial.status !== 'ready') {
      throw new Error('Expected initial static project');
    }

    await service.saveProject(initial.project);
    const staleManifest = {
      manifestVersion: 1,
      projectId: initial.project.projectId,
      title: initial.project.title,
      status: initial.project.status,
      activeStage: initial.project.activeStage,
      activeEpisodeId: initial.project.activeEpisodeId,
      createdAt: 1,
      updatedAt: 1,
      indexVersions: { artifact: 1, media: 1, scriptSegment: 1, search: 1 },
      project: {
        ...initial.project,
        scriptDocument: { kind: 'markdown', content: '# 第1集\n\nstale manifest script' },
        artifacts: initial.project.artifacts.map(artifact => artifact.id === 'episode-01-video-01'
          ? { ...artifact, title: 'Stale manifest title', revisions: [], attempts: [], revisionCount: 0, attemptCount: 0 }
          : artifact),
      },
    };
    store.set('.void/short-drama/manifest.json', JSON.stringify(staleManifest));
    store.set('.void/short-drama/script.md', '# 第1集\n\nsidecar script wins');
    store.set('.void/short-drama/artifacts/episode-01-video-01.json', JSON.stringify({
      ...initial.project.artifacts.find(artifact => artifact.id === 'episode-01-video-01'),
      title: 'Sidecar video title',
    }));
    store.set('.void/short-drama/assets/episode-01-character-guard.json', JSON.stringify({
      ...initial.project.artifacts.find(artifact => artifact.id === 'episode-01-character-guard'),
      title: 'Sidecar asset title',
    }));

    const restored = await service.loadProject('C:/work');

    expect(restored.status).toBe('ready');
    const restoredProject = restored.status === 'ready' ? restored.project : undefined;
    expect(restoredProject?.scriptDocument?.content).toContain('sidecar script wins');
    expect(restoredProject?.artifacts.find(artifact => artifact.id === 'episode-01-video-01')?.title).toBe('Sidecar video title');
    expect(restoredProject?.artifacts.find(artifact => artifact.id === 'episode-01-character-guard')?.title).toBe('Sidecar asset title');
    expect(restoredProject?.artifacts.find(artifact => artifact.id === 'episode-01-video-01')?.revisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'revision-video-01' }),
      ]),
    );
    expect(restoredProject?.artifacts.find(artifact => artifact.id === 'episode-01-video-01')?.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'attempt-video-01' }),
      ]),
    );
  });

  it('does not fail project saving when derived index cache writes fail', async () => {
    const store = new Map<string, string>();
    const adapter = {
      kind: 'local' as const,
      async read(key: string) {
        return store.get(key);
      },
      async write(key: string, value: string) {
        if (key.includes('/indexes/')) {
          throw new Error('cache unavailable');
        }
        store.set(key, value);
      },
    };
    const service = createShortDramaDefaultLibraryService(adapter, 'static_short_drama_001');
    const projectState = await staticShortDramaLibraryService.loadProject('C:/work');
    if (projectState.status !== 'ready') {
      throw new Error('Expected static project');
    }

    const save = await service.saveProject(projectState.project);
    const restored = await service.loadProject('C:/work');

    expect(save.status).toBe('ready');
    expect(store.has('.void/short-drama/manifest.json')).toBe(true);
    expect(restored.status === 'ready' ? restored.project.projectId : undefined).toBe('static_short_drama_001');
  });

  it('rebuilds missing, stale, and corrupted derived index caches from source files on load', async () => {
    const store = new Map<string, string>();
    const adapter = {
      kind: 'local' as const,
      async read(key: string) {
        return store.get(key);
      },
      async write(key: string, value: string) {
        store.set(key, value);
      },
    };
    const service = createShortDramaDefaultLibraryService(adapter, 'static_short_drama_001', { demoMode: true });
    const initial = await service.loadProject('C:/work');
    if (initial.status !== 'ready') {
      throw new Error('Expected initial static project');
    }

    await service.saveProject(initial.project);
    store.delete('.void/short-drama/indexes/media-index.json');
    store.set('.void/short-drama/indexes/artifact-index.json', JSON.stringify({ cacheVersion: 0, source: 'derived', entries: [] }));
    store.set('.void/short-drama/indexes/search-index.json', '{broken json');

    const restored = await service.loadProject('C:/work');
    const artifactIndex = JSON.parse(store.get('.void/short-drama/indexes/artifact-index.json') ?? '{}');
    const mediaIndex = JSON.parse(store.get('.void/short-drama/indexes/media-index.json') ?? '{}');
    const searchIndex = JSON.parse(store.get('.void/short-drama/indexes/search-index.json') ?? '{}');

    expect(restored.status).toBe('ready');
    expect(artifactIndex).toEqual(expect.objectContaining({
      cacheVersion: 1,
      generatedAt: expect.any(Number),
      entries: expect.arrayContaining([
        expect.objectContaining({ id: 'episode-01-video-01', handle: 'EP01-VID01' }),
      ]),
    }));
    expect(mediaIndex).toEqual(expect.objectContaining({
      cacheVersion: 1,
      entries: expect.arrayContaining([
        expect.objectContaining({ artifactId: 'episode-01-post-final', playable: true }),
      ]),
    }));
    expect(searchIndex).toEqual(expect.objectContaining({
      cacheVersion: 1,
      entries: expect.arrayContaining([
        expect.objectContaining({ id: 'artifact:episode-01-video-01' }),
      ]),
    }));
  });

  it('fills old static preview manifests with placeholder episodes for local UI testing', async () => {
    const fullProject = await staticShortDramaLibraryService.loadProject('C:/work');
    if (fullProject.status !== 'ready') {
      throw new Error('Expected static project');
    }

    const oldTwoEpisodeProject = {
      ...fullProject.project,
      episodes: fullProject.project.episodes.slice(0, 2),
      artifacts: fullProject.project.artifacts.filter(artifact => (
        artifact.episodeId === 'episode-01' || artifact.episodeId === 'episode-02'
      )),
      productionPlan: {
        ...fullProject.project.productionPlan,
        episodeRange: 'Episode 01-02',
        steps: fullProject.project.productionPlan.steps.map(step => ({
          ...step,
          episodeIds: ['episode-01', 'episode-02'],
        })),
      },
    };
    const store = new Map<string, string>();
    const adapter = {
      kind: 'local' as const,
      async read(key: string) {
        return store.get(key);
      },
      async write(key: string, value: string) {
        store.set(key, value);
      },
    };
    const service = createShortDramaDefaultLibraryService(adapter, 'static_short_drama_001');

    await service.saveProject(oldTwoEpisodeProject);
    const restored = await service.loadProject('C:/work');

    expect(restored.status).toBe('ready');
    expect(restored.status === 'ready' ? restored.source : undefined).toBe('manifest');
    expect(restored.status === 'ready' ? restored.project.episodes : []).toHaveLength(10);
    expect(restored.status === 'ready'
      ? restored.project.artifacts.some(artifact => artifact.id === 'episode-10-post-placeholder')
      : false).toBe(true);
  });

  it('backfills static media preview references into older saved manifests', async () => {
    const fullProject = await staticShortDramaLibraryService.loadProject('C:/work');
    if (fullProject.status !== 'ready') {
      throw new Error('Expected static project');
    }

    const oldProject = {
      ...fullProject.project,
      artifacts: fullProject.project.artifacts.map(artifact => (
        artifact.id === 'episode-01-video-01' || artifact.id === 'episode-01-post-final'
          ? { ...artifact, mediaReference: undefined }
          : artifact
      )),
    };
    const store = new Map<string, string>();
    const adapter = {
      kind: 'local' as const,
      async read(key: string) {
        return store.get(key);
      },
      async write(key: string, value: string) {
        store.set(key, value);
      },
    };
    const service = createShortDramaDefaultLibraryService(adapter, 'static_short_drama_001');

    await service.saveProject(oldProject);
    const restored = await service.loadProject('C:/work');

    expect(restored.status).toBe('ready');
    const restoredProject = restored.status === 'ready' ? restored.project : undefined;
    expect(restoredProject?.artifacts.find(artifact => artifact.id === 'episode-01-video-01')?.mediaReference?.previewUrl).toBe('/short-drama-static/final-preview.mp4');
    expect(restoredProject?.artifacts.find(artifact => artifact.id === 'episode-01-post-final')?.mediaReference?.previewUrl).toBe('/short-drama-static/final-preview.mp4');
  });
});
