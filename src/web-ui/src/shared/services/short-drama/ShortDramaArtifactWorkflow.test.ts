import { describe, expect, it } from 'vitest';

import {
  analyzeShortDramaArtifactImpact,
  applyShortDramaAgentEvent,
  approveShortDramaArtifactReview,
  bindShortDramaSubagentSession,
  connectShortDramaRuntimeBridgeToEventBus,
  createShortDramaRuntimeBridge,
  createShortDramaAgentTaskDispatchAdapter,
  createShortDramaRegenerationRequests,
  createShortDramaOrchestratorDispatchPlan,
  createShortDramaSpecialistContextPackage,
  confirmShortDramaRegeneration,
  confirmShortDramaRegenerationPlan,
  createShortDramaAgentTaskContext,
  createShortDramaDefaultLibraryService,
  createShortDramaStaticProject,
  createShortDramaManifestLibraryService,
  createShortDramaWorkspaceManifestAdapter,
  createShortDramaWorkspaceMediaLookup,
  markShortDramaImpactedArtifacts,
  mapShortDramaSubagentSessionLinked,
  readShortDramaManifest,
  updateShortDramaProductionMode,
  writeShortDramaManifest,
} from './index';

describe('ShortDrama media references', () => {
  it('marks missing media references stale without scanning workspace media', () => {
    const project = createShortDramaStaticProject();
    const lookup = createShortDramaWorkspaceMediaLookup([
      { id: 'media-image-hero', kind: 'image', previewUrl: 'void-media://image/hero' },
    ]);

    const existing = lookup.resolve(project.artifacts.find(item => item.mediaReference?.mediaItemId === 'media-image-hero')!);
    const missing = lookup.resolve(project.artifacts.find(item => item.mediaReference?.mediaItemId === 'media-video-missing')!);
    const nonMedia = lookup.resolve(project.artifacts.find(item => !item.mediaReference)!);

    expect(existing.status).toBe('ready');
    expect(existing.previewUrl).toBe('void-media://image/hero');
    expect(missing.status).toBe('stale');
    expect(missing.error?.code).toBe('media_missing');
    expect(nonMedia.status).toBe('unsupported');
  });
});

describe('ShortDrama manifest service', () => {
  it('round-trips project manifest data through an adapter boundary', async () => {
    const project = createShortDramaStaticProject();
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

    const writeResult = await writeShortDramaManifest(adapter, project);
    const result = await readShortDramaManifest(adapter, project.projectId);

    expect(writeResult.status).toBe('ready');
    expect(writeResult.project?.projectId).toBe(project.projectId);
    expect(result.status).toBe('ready');
    expect(result.project?.projectId).toBe(project.projectId);
    expect(result.project?.artifacts.length).toBe(project.artifacts.length);
  });

  it('reports missing, incompatible, and remote unsupported manifest states explicitly', async () => {
    const missing = await readShortDramaManifest({
      kind: 'local',
      async read() {
        return undefined;
      },
      async write() {},
    }, 'missing-project');
    const incompatible = await readShortDramaManifest({
      kind: 'local',
      async read() {
        return JSON.stringify({ manifestVersion: 999, project: createShortDramaStaticProject() });
      },
      async write() {},
    }, 'bad-version');
    const remote = await readShortDramaManifest({
      kind: 'remote',
      async read() {
        return undefined;
      },
      async write() {},
    }, 'remote-project');
    const remoteWrite = await writeShortDramaManifest({
      kind: 'remote',
      async read() {
        return undefined;
      },
      async write() {
        throw new Error('remote writes should not run');
      },
    }, createShortDramaStaticProject());

    expect(missing.status).toBe('empty');
    expect(incompatible.status).toBe('error');
    expect(incompatible.error?.code).toBe('version_incompatible');
    expect(remote.status).toBe('unsupported');
    expect(remote.error?.code).toBe('remote_workspace');
    expect(remoteWrite.status).toBe('unsupported');
    expect(remoteWrite.error?.code).toBe('remote_workspace');
  });

  it('reports manifest read and write adapter failures as explicit error states', async () => {
    const readFailed = await readShortDramaManifest({
      kind: 'local',
      async read() {
        throw new Error('permission denied');
      },
      async write() {},
    }, 'locked-project');
    const writeFailed = await writeShortDramaManifest({
      kind: 'local',
      async read() {
        return undefined;
      },
      async write() {
        throw new Error('permission denied');
      },
    }, createShortDramaStaticProject());

    expect(readFailed.status).toBe('error');
    expect(readFailed.error?.code).toBe('load_failed');
    expect(readFailed.error?.message).toContain('could not be read');
    expect(writeFailed.status).toBe('error');
    expect(writeFailed.error?.code).toBe('save_failed');
    expect(writeFailed.error?.message).toContain('could not be saved');
  });

  it('loads saved project state through a manifest-backed library service', async () => {
    const project = createShortDramaStaticProject();
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
    const writer = createShortDramaManifestLibraryService(adapter, project.projectId);
    const reader = createShortDramaManifestLibraryService(adapter, project.projectId);

    const saved = await writer.saveProject(project);
    const loaded = await reader.loadProject('C:/workspace');

    expect(saved.status).toBe('ready');
    expect(loaded.status).toBe('ready');
    expect(loaded.status === 'ready' ? loaded.source : undefined).toBe('manifest');
    expect(loaded.status === 'ready' ? loaded.project.projectId : undefined).toBe(project.projectId);
  });

  it('reports empty instead of static demo data when no workspace project exists', async () => {
    const adapter = {
      kind: 'local' as const,
      async read() {
        return undefined;
      },
      async write() {},
    };
    const service = createShortDramaDefaultLibraryService(adapter, 'static_short_drama_001');

    const loaded = await service.loadProject('C:/workspace');

    expect(loaded).toEqual(expect.objectContaining({
      status: 'empty',
      source: 'manifest',
      reason: 'no_project',
    }));
  });

  it('uses the configured static episode count only in explicit demo mode', async () => {
    const adapter = {
      kind: 'local' as const,
      async read() {
        return undefined;
      },
      async write() {},
    };
    const service = createShortDramaDefaultLibraryService(adapter, 'static_short_drama_001', {
      demoMode: true,
      staticEpisodeCount: 100,
    });

    const loaded = await service.loadProject('C:/workspace');

    expect(loaded.status).toBe('ready');
    expect(loaded.status === 'ready' ? loaded.source : undefined).toBe('static');
    expect(loaded.status === 'ready' ? loaded.project.episodes : []).toHaveLength(100);
    expect(loaded.status === 'ready' ? loaded.project.episodes.at(-1)?.id : undefined).toBe('episode-100');
  });

  it('writes project source files to the workspace short drama root instead of a project-id subdirectory', async () => {
    const project = createShortDramaStaticProject();
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

    const result = await writeShortDramaManifest(adapter, project);
    const keys = [...store.keys()];

    expect(result.status).toBe('ready');
    expect(keys).toContain('.void/short-drama/manifest.json');
    expect(keys).toContain('.void/short-drama/script.md');
    expect(keys).toContain('.void/short-drama/indexes/artifact-index.json');
    expect(keys.some(key => key.startsWith(`.void/short-drama/${project.projectId}/`))).toBe(false);
  });

  it('writes the manifest schema envelope with project identity metadata at the workspace root', async () => {
    const project = createShortDramaStaticProject();
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

    await writeShortDramaManifest(adapter, project);
    const manifest = JSON.parse(store.get('.void/short-drama/manifest.json') ?? '{}');

    expect(manifest).toEqual(expect.objectContaining({
      manifestVersion: 1,
      projectId: project.projectId,
      title: project.title,
      status: project.status,
      activeStage: project.activeStage,
      activeEpisodeId: project.activeEpisodeId,
      indexVersions: {
        artifact: 1,
        media: 1,
        scriptSegment: 1,
        search: 1,
      },
    }));
    expect(typeof manifest.createdAt).toBe('number');
    expect(typeof manifest.updatedAt).toBe('number');
  });

  it('returns a version_incompatible error for unsupported manifest versions', async () => {
    const project = createShortDramaStaticProject();
    const store = new Map<string, string>([
      ['.void/short-drama/manifest.json', JSON.stringify({
        manifestVersion: 2,
        projectId: project.projectId,
        title: project.title,
        status: project.status,
        activeStage: project.activeStage,
        activeEpisodeId: project.activeEpisodeId,
        createdAt: 1,
        updatedAt: 1,
        indexVersions: { artifact: 1, media: 1, scriptSegment: 1, search: 1 },
        project,
      })],
    ]);
    const adapter = {
      kind: 'local' as const,
      async read(key: string) {
        return store.get(key);
      },
      async write() {},
    };

    const loaded = await readShortDramaManifest(adapter, project.projectId);

    expect(loaded.status).toBe('error');
    expect(loaded.status === 'error' ? loaded.error.code : undefined).toBe('version_incompatible');
  });

  it('returns manifest_invalid for missing manifest fields and invalid enums', async () => {
    const project = createShortDramaStaticProject();
    const createAdapter = (manifest: unknown) => {
      const store = new Map<string, string>([
        ['.void/short-drama/manifest.json', JSON.stringify(manifest)],
      ]);

      return {
        kind: 'local' as const,
        async read(key: string) {
          return store.get(key);
        },
        async write() {},
      };
    };
    const validEnvelope = {
      manifestVersion: 1,
      projectId: project.projectId,
      title: project.title,
      status: project.status,
      activeStage: project.activeStage,
      activeEpisodeId: project.activeEpisodeId,
      createdAt: 1,
      updatedAt: 1,
      indexVersions: { artifact: 1, media: 1, scriptSegment: 1, search: 1 },
      project,
    };

    const missingField = await readShortDramaManifest(createAdapter({ ...validEnvelope, title: undefined }), project.projectId);
    const invalidStage = await readShortDramaManifest(createAdapter({ ...validEnvelope, activeStage: 'editing' }), project.projectId);
    const invalidStatus = await readShortDramaManifest(createAdapter({ ...validEnvelope, status: 'published' }), project.projectId);

    expect(missingField.status === 'error' ? missingField.error.code : undefined).toBe('manifest_invalid');
    expect(invalidStage.status === 'error' ? invalidStage.error.code : undefined).toBe('manifest_invalid');
    expect(invalidStatus.status === 'error' ? invalidStatus.error.code : undefined).toBe('manifest_invalid');
  });

  it('does not silently read old project-id manifest paths as the active workspace project', async () => {
    const project = createShortDramaStaticProject();
    const store = new Map<string, string>([
      [`.void/short-drama/${project.projectId}/manifest.json`, JSON.stringify({ manifestVersion: 1, project })],
    ]);
    const adapter = {
      kind: 'local' as const,
      async read(key: string) {
        return store.get(key);
      },
      async write() {},
    };

    const loaded = await readShortDramaManifest(adapter, project.projectId);

    expect(loaded).toEqual({ status: 'empty', source: 'manifest', reason: 'no_project' });
  });

  it('creates workspace manifest adapter paths under .void/short-drama', async () => {
    const writes = new Map<string, string>();
    const ensured: string[] = [];
    const adapter = createShortDramaWorkspaceManifestAdapter('C:/workspace', {
      async readTextFile(path: string) {
        return writes.get(path);
      },
      async writeTextFile(path: string, content: string) {
        writes.set(path, content);
      },
      async ensureDirectory(path: string) {
        ensured.push(path);
      },
    });

    await adapter.write('.void/short-drama/project-1/manifest.json', '{"ok":true}');

    expect([...writes.keys()]).toEqual(['C:/workspace/.void/short-drama/project-1/manifest.json']);
    expect(ensured).toEqual([
      'C:/workspace/.void',
      'C:/workspace/.void/short-drama',
      'C:/workspace/.void/short-drama/project-1',
    ]);
    await expect(adapter.read('.void/short-drama/project-1/manifest.json')).resolves.toBe('{"ok":true}');
  });

  it('keeps workspace manifest writes from escaping the workspace root', async () => {
    const adapter = createShortDramaWorkspaceManifestAdapter('C:/workspace', {
      async readTextFile() {
        return undefined;
      },
      async writeTextFile() {},
      async ensureDirectory() {},
    });

    await expect(adapter.write('../outside.json', '{"ok":false}')).rejects.toThrow(
      'Short drama manifest path must stay inside the workspace.',
    );
  });
});

describe('ShortDrama agent events and impact analysis', () => {
  it('dispatches agent task requests through an event-bus adapter with explicit unsupported state', async () => {
    const observed: unknown[] = [];
    const handlers = new Map<string, (event: unknown) => void>();
    const eventBus = {
      on(eventName: string, handler: (event: unknown) => void) {
        handlers.set(eventName, handler);
        return () => handlers.delete(eventName);
      },
      emit(eventName: string, event: unknown) {
        const handler = handlers.get(eventName);
        if (!handler) {
          return false;
        }
        handler(event);
        return true;
      },
    };
    const dispatcher = createShortDramaAgentTaskDispatchAdapter(eventBus);
    const request = {
      artifactId: 'episode-01-video-01',
      episodeId: 'episode-01',
      stage: 'video' as const,
      agentRole: 'video' as const,
      contextScope: 'video' as const,
      inputSummary: 'Render selected video shot.',
    };

    const unsupported = await dispatcher.dispatchAgentTasks([request]);
    eventBus.on('short-drama:agent-tasks-dispatch-requested', event => {
      observed.push(event);
    });
    const ready = await dispatcher.dispatchAgentTasks([request]);

    expect(unsupported.status).toBe('unsupported');
    expect(unsupported.error.code).toBe('unsupported_runtime');
    expect(ready.status).toBe('ready');
    expect(observed).toEqual([{
      requests: [request],
      source: 'short-drama-center',
    }]);
  });

  it('dispatches targeted agent task requests into existing persistent stage agent sessions', async () => {
    const emitted: unknown[] = [];
    const sent: unknown[] = [];
    const dispatcher = createShortDramaAgentTaskDispatchAdapter({
      eventBus: {
        emit(eventName: string, event: unknown) {
          emitted.push({ eventName, event });
          return true;
        },
      },
      sessionSender: {
        async sendAgentTask(task) {
          sent.push(task);
          return {
            status: 'ready',
            targetSessionId: task.targetSessionId,
            messageId: 'message-video-01',
          };
        },
      },
    });
    const request = {
      artifactId: 'episode-01-video-01',
      episodeId: 'episode-01',
      stage: 'video' as const,
      agentRole: 'video' as const,
      contextScope: 'video' as const,
      inputSummary: 'Render selected video shot.',
      targetSessionId: 'session-video-agent',
    };

    const result = await dispatcher.dispatchAgentTasks([request]);

    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.dispatchedTasks).toEqual([{
        artifactId: 'episode-01-video-01',
        stage: 'video',
        targetSessionId: 'session-video-agent',
        source: 'persistent-session',
        messageId: 'message-video-01',
      }]);
    }
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      targetSessionId: 'session-video-agent',
      request,
    });
    expect((sent[0] as { message: string }).message).toContain('Render selected video shot.');
    expect(emitted).toEqual([]);
  });

  it('updates production mode locally without changing artifacts or starting agent runs', () => {
    const project = createShortDramaStaticProject();

    const automatic = updateShortDramaProductionMode(project, 'automatic');
    const semiAutomatic = updateShortDramaProductionMode(automatic, 'semiAutomatic');

    expect(project.productionPlan.mode).toBe('semiAutomatic');
    expect(automatic.productionPlan.mode).toBe('automatic');
    expect(semiAutomatic.productionPlan.mode).toBe('semiAutomatic');
    expect(automatic.artifacts).toEqual(project.artifacts);
    expect(automatic.productionPlan.steps).toEqual(project.productionPlan.steps);
  });

  it('bridges runtime events to artifact state and persists only changed short-drama projects', async () => {
    const project = createShortDramaStaticProject();
    const savedProjectIds: string[] = [];
    const bridge = createShortDramaRuntimeBridge({
      project,
      async saveProject(nextProject) {
        savedProjectIds.push(nextProject.projectId);
        return { status: 'ready', source: 'manifest', project: nextProject };
      },
    });

    const linked = await bridge.handleSubagentSessionLinked({
      sessionId: 'subagent-video-linked',
      parentSessionId: 'main-session-linked',
      parentToolCallId: 'tool-video-episode-01',
      agentType: 'video',
    });
    const completed = await bridge.handleAgentEvent({
      type: 'completed',
      artifactId: 'episode-01-video-01',
      runId: 'bridge-run-01',
      timestamp: 20,
      outputMediaItemId: 'media-video-bridge',
    });
    const ignored = await bridge.handleSubagentSessionLinked({
      sessionId: 'subagent-unknown',
      parentSessionId: 'main-session-linked',
      parentToolCallId: 'unknown-tool',
      agentType: 'video',
    });

    expect(linked.status).toBe('ready');
    expect(completed.status).toBe('ready');
    expect(ignored.status).toBe('ignored');
    expect(savedProjectIds).toEqual([project.projectId, project.projectId]);
    expect(bridge.getProject().artifacts.find(item => item.id === 'episode-01-video-01')).toEqual(expect.objectContaining({
      subagentSessionId: 'subagent-video-linked',
      status: 'reviewing',
    }));
  });

  it('subscribes the runtime bridge to generic subagent linked events', async () => {
    const project = createShortDramaStaticProject();
    let handler: ((event: unknown) => void) | undefined;
    const bridge = createShortDramaRuntimeBridge({ project });
    const unsubscribe = connectShortDramaRuntimeBridgeToEventBus(bridge, {
      on(eventName, nextHandler) {
        if (eventName === 'agent:subagent-session-linked') {
          handler = nextHandler;
        }
        return () => {
          handler = undefined;
        };
      },
    });

    handler?.({
      childSessionId: 'subagent-video-event-bus',
      parentSessionId: 'main-session-event-bus',
      parentToolCallId: 'tool-video-episode-01',
      agentType: 'video',
    });
    await Promise.resolve();

    expect(bridge.getProject().artifacts.find(item => item.id === 'episode-01-video-01')).toEqual(expect.objectContaining({
      subagentSessionId: 'subagent-video-event-bus',
      parentSessionId: 'main-session-event-bus',
    }));
    unsubscribe();
    expect(handler).toBeUndefined();
  });

  it('maps generic tool-run observer events to short-drama agent events', async () => {
    const project = createShortDramaStaticProject();
    const savedStatuses: string[] = [];
    const handlers = new Map<string, (event: unknown) => void>();
    const bridge = createShortDramaRuntimeBridge({
      project,
      async saveProject(nextProject) {
        savedStatuses.push(nextProject.artifacts.find(item => item.id === 'episode-01-video-01')?.status ?? 'missing');
        return { status: 'ready', source: 'manifest', project: nextProject };
      },
    });

    connectShortDramaRuntimeBridgeToEventBus(bridge, {
      on(eventName, nextHandler) {
        handlers.set(eventName, nextHandler);
        return () => handlers.delete(eventName);
      },
    });

    handlers.get('agent:tool-run-event')?.({
      eventType: 'Started',
      toolId: 'tool-video-episode-01',
      toolName: 'Task',
    });
    handlers.get('agent:tool-run-event')?.({
      eventType: 'Completed',
      toolId: 'tool-video-episode-01',
      toolName: 'Task',
      result: {
        shortDrama: {
          outputMediaItemId: 'media-video-tool-run',
        },
      },
    });
    await Promise.resolve();

    const artifact = bridge.getProject().artifacts.find(item => item.id === 'episode-01-video-01');
    expect(artifact?.status).toBe('reviewing');
    expect(artifact?.attempts.at(-1)?.runId).toBe('tool-video-episode-01');
    expect(artifact?.revisions.at(-1)?.mediaItemId).toBe('media-video-tool-run');
    expect(savedStatuses).toEqual(['generating', 'reviewing']);
  });

  it('creates scoped agent task context and binds subagent sessions to artifacts', () => {
    const project = createShortDramaStaticProject();
    const artifactId = 'episode-01-video-01';

    const context = createShortDramaAgentTaskContext(project, artifactId);
    const bound = bindShortDramaSubagentSession(project, {
      artifactId,
      subagentSessionId: 'subagent-video-run-99',
      parentSessionId: 'main-session-99',
      parentToolCallId: 'tool-call-99',
    });

    expect(context.status).toBe('ready');
    expect(context.request).toEqual(expect.objectContaining({
      artifactId,
      episodeId: 'episode-01',
      stage: 'video',
      agentRole: 'video',
    }));
    expect(context.request?.contextScope).toBe('video');
    expect(context.request?.inputSummary).toContain('Shot');
    expect(bound.artifacts.find(item => item.id === artifactId)).toEqual(expect.objectContaining({
      subagentSessionId: 'subagent-video-run-99',
      parentSessionId: 'main-session-99',
      parentToolCallId: 'tool-call-99',
    }));
  });

  it('maps existing SubagentSessionLinked event to artifact binding without touching generic event handlers', () => {
    const project = createShortDramaStaticProject();
    const artifactId = 'episode-01-video-01';

    const mapped = mapShortDramaSubagentSessionLinked(project, {
      sessionId: 'subagent-video-linked',
      parentSessionId: 'main-session-linked',
      parentToolCallId: 'tool-video-episode-01',
      agentType: 'video',
    });
    const ignored = mapShortDramaSubagentSessionLinked(project, {
      sessionId: 'subagent-other',
      parentSessionId: 'main-session-linked',
      parentToolCallId: 'unknown-tool',
      agentType: 'video',
    });

    expect(mapped.status).toBe('ready');
    expect(mapped.project.artifacts.find(item => item.id === artifactId)).toEqual(expect.objectContaining({
      subagentSessionId: 'subagent-video-linked',
      parentSessionId: 'main-session-linked',
      parentToolCallId: 'tool-video-episode-01',
    }));
    expect(ignored.status).toBe('ignored');
    expect(ignored.reason).toBe('no_matching_artifact');
  });

  it('maps main-AI dispatch metadata to a concrete short drama artifact binding', () => {
    const project = createShortDramaStaticProject();

    const mapped = mapShortDramaSubagentSessionLinked(project, {
      childSessionId: 'video-real-from-main-ai',
      parentSessionId: 'main-session-linked',
      shortDrama: {
        projectId: project.projectId,
        stage: 'video',
        activeArtifactHandle: 'EP01-VID01',
        activeEpisodeId: 'episode-01',
        parentToolCallId: 'tool-video-dispatch-real',
        source: 'mainAI-dispatch',
      },
    });

    expect(mapped.status).toBe('ready');
    expect(mapped.project.artifacts.find(item => item.id === 'episode-01-video-01')).toEqual(expect.objectContaining({
      subagentSessionId: 'video-real-from-main-ai',
      parentSessionId: 'main-session-linked',
      parentToolCallId: 'tool-video-dispatch-real',
    }));
  });

  it('maps created, progress, completed, failed, and cancelled events to artifact state', () => {
    const project = createShortDramaStaticProject();
    const artifactId = 'episode-01-video-01';
    const initialArtifact = project.artifacts.find(item => item.id === artifactId)!;
    const initialAttemptCount = initialArtifact.attempts.length;
    const initialRevisionCount = initialArtifact.revisions.length;

    const created = applyShortDramaAgentEvent(project, {
      type: 'created',
      artifactId,
      runId: 'run-01',
      timestamp: 0,
    });
    const started = applyShortDramaAgentEvent(created, {
      type: 'started',
      artifactId,
      runId: 'run-01',
      timestamp: 1,
      sourceSessionId: 'video-agent-session-01',
    });
    const progress = applyShortDramaAgentEvent(started, {
      type: 'progress',
      artifactId,
      runId: 'run-01',
      timestamp: 1.5,
    });
    const completed = applyShortDramaAgentEvent(progress, {
      type: 'completed',
      artifactId,
      runId: 'run-01',
      timestamp: 2,
      outputMediaItemId: 'media-video-01',
    });
    const failed = applyShortDramaAgentEvent(completed, {
      type: 'failed',
      artifactId,
      runId: 'run-02',
      timestamp: 3,
      failureReason: 'Prompt drifted from palace setting.',
    });
    const cancelled = applyShortDramaAgentEvent(failed, {
      type: 'cancelled',
      artifactId,
      runId: 'run-03',
      timestamp: 4,
      failureReason: 'User stopped regeneration.',
    });

    expect(created.artifacts.find(item => item.id === artifactId)?.status).toBe('pending');
    expect(started.artifacts.find(item => item.id === artifactId)?.status).toBe('generating');
    expect(progress.artifacts.find(item => item.id === artifactId)?.status).toBe('generating');
    expect(completed.artifacts.find(item => item.id === artifactId)?.status).toBe('reviewing');
    expect(completed.artifacts.find(item => item.id === artifactId)?.attempts).toHaveLength(initialAttemptCount + 1);
    expect(completed.artifacts.find(item => item.id === artifactId)?.attempts.find(item => item.runId === 'run-01')?.status).toBe('completed');
    expect(completed.artifacts.find(item => item.id === artifactId)?.attempts.find(item => item.runId === 'run-01')?.sourceSessionId).toBe('video-agent-session-01');
    expect(completed.artifacts.find(item => item.id === artifactId)?.revisions).toHaveLength(initialRevisionCount + 1);
    expect(failed.artifacts.find(item => item.id === artifactId)?.status).toBe('error');
    expect(failed.artifacts.find(item => item.id === artifactId)?.failureReason).toBe('Prompt drifted from palace setting.');
    expect(cancelled.artifacts.find(item => item.id === artifactId)?.attempts.find(item => item.runId === 'run-03')?.status).toBe('cancelled');
    expect(cancelled.artifacts.find(item => item.id === artifactId)?.failureReason).toBe('User stopped regeneration.');
  });

  it('creates revisions only after review approval and requests intervention after retry limit', () => {
    const project = createShortDramaStaticProject();
    const artifactId = 'episode-01-video-01';
    const initialRevisionCount = project.artifacts.find(item => item.id === artifactId)!.revisions.length;
    const reviewed = applyShortDramaAgentEvent(project, {
      type: 'completed',
      artifactId,
      runId: 'review-run-01',
      timestamp: 10,
      outputMediaItemId: 'media-video-review',
    });
    const approved = approveShortDramaArtifactReview(reviewed, {
      artifactId,
      approvedBy: 'orchestrator',
      summary: 'Approved after consistency review.',
      timestamp: 11,
    });
    const failedOnce = applyShortDramaAgentEvent(project, {
      type: 'failed',
      artifactId,
      runId: 'retry-run-01',
      timestamp: 12,
      failureReason: 'Lighting mismatch.',
      orchestratorCorrection: 'Restore warm lantern lighting.',
      retryLimit: 1,
    });
    const failedTwice = applyShortDramaAgentEvent(failedOnce, {
      type: 'failed',
      artifactId,
      runId: 'retry-run-02',
      timestamp: 13,
      failureReason: 'Still mismatched.',
      orchestratorCorrection: 'Stop and ask user to choose reference.',
      retryLimit: 1,
    });

    expect(reviewed.artifacts.find(item => item.id === artifactId)?.status).toBe('reviewing');
    expect(approved.artifacts.find(item => item.id === artifactId)?.status).toBe('ready');
    expect(approved.artifacts.find(item => item.id === artifactId)?.revisions.length).toBe(initialRevisionCount + 1);
    expect(failedTwice.artifacts.find(item => item.id === artifactId)?.status).toBe('needs_intervention');
    expect(failedTwice.artifacts.find(item => item.id === artifactId)?.failureReason).toBe('Still mismatched.');
    expect(failedTwice.artifacts.find(item => item.id === artifactId)?.attempts.at(-1)?.orchestratorCorrection).toBe('Stop and ask user to choose reference.');
  });

  it('outputs keep, review, and regenerate recommendations without mutating before user confirmation', () => {
    const project = createShortDramaStaticProject();

    const analysis = analyzeShortDramaArtifactImpact(project, 'episode-01-script');

    expect(analysis.status).toBe('ready');
    expect(analysis.items.some(item => item.recommendation === 'keep')).toBe(true);
    expect(analysis.items.some(item => item.recommendation === 'review')).toBe(true);
    expect(analysis.items.some(item => item.recommendation === 'regenerate')).toBe(true);
    expect(analysis.items.every(item => item.reason.length > 0)).toBe(true);
    expect(analysis.items.every(item => item.estimatedMinutes >= 0)).toBe(true);
    expect(analysis.items.every(item => item.estimatedCostLabel.length > 0)).toBe(true);
    expect(project.artifacts.find(item => item.id === 'episode-01-video-01')?.status).not.toBe('generating');

    const regenerated = confirmShortDramaRegeneration(project, analysis, ['episode-01-video-01']);
    const requests = createShortDramaRegenerationRequests(regenerated, ['episode-01-video-01']);

    expect(regenerated.artifacts.find(item => item.id === 'episode-01-video-01')?.status).toBe('generating');
    expect(regenerated.artifacts.find(item => item.id === 'episode-01-video-01')?.attempts.length).toBeGreaterThan(0);
    expect(regenerated.artifacts.find(item => item.id === 'episode-02-video-01')?.status).not.toBe('generating');
    expect(requests.status).toBe('ready');
    expect(requests.requests).toHaveLength(1);
    expect(requests.requests[0]).toEqual(expect.objectContaining({
      artifactId: 'episode-01-video-01',
      agentRole: 'video',
      contextScope: 'video',
    }));
  });

  it('marks downstream artifacts stale or reviewing after upstream revision changes', () => {
    const project = createShortDramaStaticProject();
    const analysis = analyzeShortDramaArtifactImpact(project, 'episode-01-script');

    const marked = markShortDramaImpactedArtifacts(project, analysis);

    expect(marked.artifacts.find(item => item.id === 'episode-01-storyboard-01')?.status).toBe('stale');
    expect(marked.artifacts.find(item => item.id === 'episode-01-character-guard')?.status).toBe('reviewing');
    expect(marked.artifacts.find(item => item.id === 'episode-02-video-01')?.status).toBe('unsupported');
  });

  it('confirms regeneration as a dispatchable plan scoped to selected artifacts', () => {
    const project = createShortDramaStaticProject();
    const analysis = analyzeShortDramaArtifactImpact(project, 'episode-01-script');

    const plan = confirmShortDramaRegenerationPlan(project, analysis, ['episode-01-video-01']);

    expect(plan.status).toBe('ready');
    expect(plan.project.artifacts.find(item => item.id === 'episode-01-video-01')?.status).toBe('generating');
    expect(plan.requests).toEqual([expect.objectContaining({
      artifactId: 'episode-01-video-01',
      episodeId: 'episode-01',
      agentRole: 'video',
      contextScope: 'video',
    })]);
  });

  it('keeps semi-automatic orchestrator plans behind approval and emits dispatch requests after approval', () => {
    const project = createShortDramaStaticProject();

    const waiting = createShortDramaOrchestratorDispatchPlan(project, {
      parentSessionId: 'main-session-01',
      approved: false,
    });
    const approved = createShortDramaOrchestratorDispatchPlan(project, {
      parentSessionId: 'main-session-01',
      approved: true,
    });
    const automatic = createShortDramaOrchestratorDispatchPlan(updateShortDramaProductionMode(project, 'automatic'), {
      parentSessionId: 'main-session-01',
      approved: false,
    });

    expect(waiting.status).toBe('needs_approval');
    expect(waiting.requests).toEqual([]);
    expect(waiting.plan.steps.length).toBe(project.productionPlan.steps.length);
    expect(approved.status).toBe('ready');
    expect(approved.requests.length).toBeGreaterThan(0);
    expect(approved.requests[0]).toEqual(expect.objectContaining({
      artifactId: expect.any(String),
      episodeId: expect.any(String),
      parentSessionId: 'main-session-01',
    }));
    expect(automatic.status).toBe('ready');
    expect(automatic.requests.length).toBe(approved.requests.length);
  });

  it('attaches persistent stage agent session targets to dispatch requests when bindings are ready', () => {
    const project = createShortDramaStaticProject();
    const baseline = createShortDramaOrchestratorDispatchPlan(project, {
      parentSessionId: 'main-session-01',
      approved: true,
    });
    expect(baseline.status).toBe('ready');
    const targetStage = baseline.status === 'ready' ? baseline.requests[0].stage : 'script';

    const approved = createShortDramaOrchestratorDispatchPlan(project, {
      parentSessionId: 'main-session-01',
      approved: true,
      stageAgentBindings: [{
        stage: targetStage,
        childSessionId: 'session-stage-agent',
        status: 'ready',
      }],
    });

    expect(approved.status).toBe('ready');
    expect(approved.requests.find(request => request.stage === targetStage)).toEqual(expect.objectContaining({
      parentSessionId: 'main-session-01',
      targetSessionId: 'session-stage-agent',
    }));
    expect(approved.requests.filter(request => request.stage !== targetStage).every(request => !request.targetSessionId)).toBe(true);
  });

  it('creates isolated specialist context packages for each agent role', () => {
    const project = createShortDramaStaticProject();

    const director = createShortDramaSpecialistContextPackage(project, 'episode-01-script');
    const image = createShortDramaSpecialistContextPackage(project, 'episode-01-character-guard');
    const video = createShortDramaSpecialistContextPackage(project, 'episode-01-video-01');
    const post = createShortDramaSpecialistContextPackage(project, 'episode-02-post-subtitle');

    expect(director.status).toBe('ready');
    expect(director.context?.agentRole).toBe('director');
    expect(director.context?.includedSections).toContain('story');
    expect(director.context?.includedSections).not.toContain('video');
    expect(image.status).toBe('ready');
    expect(image.context?.agentRole).toBe('image');
    expect(image.context?.includedSections).toEqual(expect.arrayContaining(['story', 'visual']));
    expect(image.context?.includedSections).not.toContain('post');
    expect(video.status).toBe('ready');
    expect(video.context?.includedSections).toEqual(expect.arrayContaining(['storyboard', 'video']));
    expect(video.context?.includedSections).not.toContain('post');
    expect(post.status).toBe('ready');
    expect(post.context?.includedSections).toEqual(expect.arrayContaining(['video', 'post']));
    expect(post.context?.omittedContext).toEqual(expect.arrayContaining(['full_chat_history', 'unrelated_stages']));
  });
});
