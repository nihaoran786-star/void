import { describe, expect, it } from 'vitest';

import {
  connectShortDramaRuntimeBridgeToEventBus,
  createShortDramaProjectAuditLog,
  createShortDramaRuntimeBridge,
  createShortDramaStaticProject,
} from './index';

describe('ShortDramaRuntimeBridge', () => {
  it('emits a short-drama status event after a runtime completion updates media state', async () => {
    const project = createShortDramaStaticProject();
    const statusEvents: unknown[] = [];
    const bridge = createShortDramaRuntimeBridge({
      project,
      onStatusEvent: event => statusEvents.push(event),
    });

    const result = await bridge.handleAgentEvent({
      type: 'completed',
      artifactId: 'episode-02-video-01',
      runId: 'run-video-episode-02',
      timestamp: 1_783_000_001_000,
      source: 'tool',
      outputMediaReference: {
        mediaItemId: 'media-video-episode-02-final',
        kind: 'video',
        label: 'Episode 02 playable render',
        previewUrl: '/short-drama-static/final-preview.mp4',
        thumbnailUrl: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E',
        durationMs: 13_000,
      },
    });

    expect(result.status).toBe('ready');
    expect(bridge.getProject().artifacts.find(artifact => artifact.id === 'episode-02-video-01')).toEqual(
      expect.objectContaining({
        status: 'reviewing',
        mediaReference: expect.objectContaining({
          mediaItemId: 'media-video-episode-02-final',
          kind: 'video',
          previewUrl: '/short-drama-static/final-preview.mp4',
        }),
      }),
    );
    expect(statusEvents).toEqual([
      expect.objectContaining({
        eventId: 'tool:completed:run-video-episode-02:episode-02-video-01:1783000001000',
        source: 'tool',
        projectId: 'static_short_drama_001',
        artifactId: 'episode-02-video-01',
        attemptId: 'attempt-run-video-episode-02',
        status: 'reviewing',
        mediaReference: expect.objectContaining({ mediaItemId: 'media-video-episode-02-final' }),
        occurredAt: 1_783_000_001_000,
      }),
    ]);
  });

  it('records runtime media updates in the project audit log for main AI review', async () => {
    const bridge = createShortDramaRuntimeBridge({ project: createShortDramaStaticProject() });

    await bridge.handleAgentEvent({
      type: 'completed',
      artifactId: 'episode-02-video-01',
      runId: 'run-video-audit',
      timestamp: 1_783_000_004_000,
      source: 'tool',
      outputMediaReference: {
        mediaItemId: 'media-video-audit',
        kind: 'video',
        label: 'Audited video render',
        previewUrl: '/short-drama-static/final-preview.mp4',
      },
    });

    const audit = createShortDramaProjectAuditLog(bridge.getProject(), {
      artifactIdOrHandle: 'EP02-VID01',
      limit: 1,
    });

    expect(audit).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-audit-log',
      entries: [
        expect.objectContaining({
          artifactId: 'episode-02-video-01',
          latestEventType: 'revision',
          latestReason: 'Tool completed run run-video-audit and attached media media-video-audit.',
          actor: 'stageAgent',
        }),
      ],
    }));
    expect(JSON.stringify(audit)).not.toContain('/short-drama-static/final-preview.mp4');
  });

  it('keeps completed runtime events idempotent for attempts and revisions', async () => {
    const bridge = createShortDramaRuntimeBridge({ project: createShortDramaStaticProject() });
    const event = {
      type: 'completed' as const,
      artifactId: 'episode-02-video-01',
      runId: 'run-idempotent-video',
      timestamp: 1_783_000_002_000,
      outputMediaItemId: 'media-video-idempotent',
    };

    await bridge.handleAgentEvent(event);
    await bridge.handleAgentEvent(event);

    const artifact = bridge.getProject().artifacts.find(item => item.id === 'episode-02-video-01')!;
    expect(artifact.attempts.filter(attempt => attempt.runId === 'run-idempotent-video')).toHaveLength(1);
    expect(artifact.revisions.filter(revision => revision.id === 'revision-run-idempotent-video')).toHaveLength(1);
    expect(artifact.attemptCount).toBe(1);
    expect(artifact.revisionCount).toBe(1);
  });

  it('preserves the last playable media when a later runtime attempt fails', async () => {
    const bridge = createShortDramaRuntimeBridge({ project: createShortDramaStaticProject() });
    const before = bridge.getProject().artifacts.find(artifact => artifact.id === 'episode-01-video-01')!;

    await bridge.handleAgentEvent({
      type: 'failed',
      artifactId: 'episode-01-video-01',
      runId: 'run-video-failed-later',
      timestamp: 1_783_000_003_000,
      source: 'tool',
      failureReason: 'Provider timeout',
      retryLimit: 0,
    });

    const after = bridge.getProject().artifacts.find(artifact => artifact.id === 'episode-01-video-01')!;
    expect(after.status).toBe('needs_intervention');
    expect(after.failureReason).toBe('Provider timeout');
    expect(after.mediaReference).toEqual(before.mediaReference);
    expect(after.revisions).toEqual(before.revisions);
  });

  it('maps flat tool-run media metadata into a playable artifact media reference', async () => {
    const handlers = new Map<string, (event: unknown) => void>();
    const bridge = createShortDramaRuntimeBridge({ project: createShortDramaStaticProject() });
    const unsubscribe = connectShortDramaRuntimeBridgeToEventBus(bridge, {
      on(eventName, handler) {
        handlers.set(eventName, handler);
        return () => handlers.delete(eventName);
      },
    });

    handlers.get('agent:tool-run-event')?.({
      eventType: 'Completed',
      toolId: 'tool-video-episode-01',
      result: {
        shortDrama: {
          outputMediaItemId: 'media-video-flat-metadata',
          outputMediaKind: 'video',
          outputMediaLabel: 'Flat metadata render',
          outputPreviewUrl: '/short-drama-static/final-preview.mp4',
          outputThumbnailUrl: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E',
          outputDurationMs: 9_000,
        },
      },
    });
    await Promise.resolve();

    const artifact = bridge.getProject().artifacts.find(item => item.id === 'episode-01-video-01')!;
    expect(artifact.status).toBe('reviewing');
    expect(artifact.mediaReference).toEqual(expect.objectContaining({
      mediaItemId: 'media-video-flat-metadata',
      kind: 'video',
      label: 'Flat metadata render',
      previewUrl: '/short-drama-static/final-preview.mp4',
      thumbnailUrl: expect.stringContaining('data:image/svg+xml'),
      durationMs: 9_000,
    }));
    expect(artifact.revisions.find(revision => revision.id === 'revision-tool-video-episode-01')).toEqual(
      expect.objectContaining({ mediaItemId: 'media-video-flat-metadata' }),
    );

    unsubscribe();
  });

  it('maps short-drama artifact handles from media tool completions into asset media references', async () => {
    const handlers = new Map<string, (event: unknown) => void>();
    const sourceProject = createShortDramaStaticProject();
    const sourceAsset = sourceProject.artifacts.find(item => item.stage === 'assets' && item.type === 'character')!;
    const asset = { ...sourceAsset, id: 'CHAR-001', handle: 'CHAR-001', mediaReference: undefined };
    const project = {
      ...sourceProject,
      artifacts: sourceProject.artifacts.map(item => item.id === sourceAsset.id ? asset : item),
    };
    const bridge = createShortDramaRuntimeBridge({ project });
    const unsubscribe = connectShortDramaRuntimeBridgeToEventBus(bridge, {
      on(eventName, handler) {
        handlers.set(eventName, handler);
        return () => handlers.delete(eventName);
      },
    });

    handlers.get('agent:tool-run-event')?.({
      eventType: 'Completed',
      toolId: 'tool-generated-asset-image',
      result: {
        shortDrama: {
          projectId: project.projectId,
          stage: 'assets',
          artifactHandle: 'CHAR-001',
          outputMediaItemId: 'media-batch-asset-1',
          outputMediaKind: 'image',
          outputPreviewUrl: 'https://cdn.example.com/asset.png',
          outputThumbnailUrl: 'https://cdn.example.com/asset.png',
          outputMediaLabel: 'Generated character asset',
        },
      },
    });
    await Promise.resolve();

    expect(bridge.getProject().artifacts.find(item => item.id === 'CHAR-001')?.mediaReference)
      .toEqual(expect.objectContaining({
        mediaItemId: 'media-batch-asset-1',
        kind: 'image',
        previewUrl: 'https://cdn.example.com/asset.png',
        label: 'Generated character asset',
      }));

    unsubscribe();
  });

  it('preserves local generated media paths from media tool completions', async () => {
    const handlers = new Map<string, (event: unknown) => void>();
    const sourceProject = createShortDramaStaticProject();
    const sourceAsset = sourceProject.artifacts.find(item => item.stage === 'assets' && item.type === 'character')!;
    const asset = { ...sourceAsset, id: 'CHAR-001', handle: 'CHAR-001', mediaReference: undefined };
    const project = {
      ...sourceProject,
      artifacts: sourceProject.artifacts.map(item => item.id === sourceAsset.id ? asset : item),
    };
    const bridge = createShortDramaRuntimeBridge({ project });
    const unsubscribe = connectShortDramaRuntimeBridgeToEventBus(bridge, {
      on(eventName, handler) {
        handlers.set(eventName, handler);
        return () => handlers.delete(eventName);
      },
    });

    handlers.get('agent:tool-run-event')?.({
      eventType: 'Completed',
      toolId: 'tool-generated-local-asset-image',
      result: {
        shortDrama: {
          projectId: project.projectId,
          stage: 'assets',
          artifactHandle: 'CHAR-001',
          outputMediaItemId: 'media-batch-asset-local-1',
          outputMediaKind: 'image',
          outputMediaPath: 'C:/work/media/generated/media_batch_001/image-001.png',
          outputMediaRelativePath: 'media/generated/media_batch_001/image-001.png',
          outputMediaLabel: 'Generated local character asset',
        },
      },
    });
    await Promise.resolve();

    expect(bridge.getProject().artifacts.find(item => item.id === 'CHAR-001')?.mediaReference)
      .toEqual(expect.objectContaining({
        mediaItemId: 'media-batch-asset-local-1',
        kind: 'image',
        localPath: 'C:/work/media/generated/media_batch_001/image-001.png',
        relativePath: 'media/generated/media_batch_001/image-001.png',
        source: 'generated',
      }));

    unsubscribe();
  });


  it('reports ignored runtime events without short-drama metadata or artifact linkage', async () => {
    const ignoredEvents: unknown[] = [];
    const handlers = new Map<string, (event: unknown) => void>();
    const bridge = createShortDramaRuntimeBridge({ project: createShortDramaStaticProject() });
    const unsubscribe = connectShortDramaRuntimeBridgeToEventBus(
      bridge,
      {
        on(eventName, handler) {
          handlers.set(eventName, handler);
          return () => handlers.delete(eventName);
        },
      },
      { onIgnoredEvent: event => ignoredEvents.push(event) },
    );

    handlers.get('agent:tool-run-event')?.({
      eventType: 'Completed',
      toolId: 'unrelated-tool-run',
    });
    await Promise.resolve();

    expect(ignoredEvents).toEqual([
      expect.objectContaining({
        status: 'ignored',
        source: 'runtime-bridge',
        reason: 'missing_short_drama_metadata',
        projectId: 'static_short_drama_001',
        toolId: 'unrelated-tool-run',
      }),
    ]);
    expect(bridge.getProject()).toEqual(createShortDramaStaticProject());

    unsubscribe();
  });

  it('ignores mismatched short-drama project events without updating local artifacts', async () => {
    const ignoredEvents: unknown[] = [];
    const handlers = new Map<string, (event: unknown) => void>();
    const bridge = createShortDramaRuntimeBridge({ project: createShortDramaStaticProject() });
    const unsubscribe = connectShortDramaRuntimeBridgeToEventBus(
      bridge,
      {
        on(eventName, handler) {
          handlers.set(eventName, handler);
          return () => handlers.delete(eventName);
        },
      },
      { onIgnoredEvent: event => ignoredEvents.push(event) },
    );

    handlers.get('agent:tool-run-event')?.({
      eventType: 'Completed',
      toolId: 'tool-video-episode-01',
      shortDrama: {
        projectId: 'other-project',
        artifactId: 'episode-01-video-01',
        outputMediaItemId: 'foreign-media',
        outputMediaKind: 'video',
      },
    });
    await Promise.resolve();

    expect(ignoredEvents).toEqual([
      expect.objectContaining({
        status: 'ignored',
        source: 'runtime-bridge',
        reason: 'project_mismatch',
        projectId: 'static_short_drama_001',
        eventProjectId: 'other-project',
      }),
    ]);
    expect(bridge.getProject().artifacts.find(item => item.id === 'episode-01-video-01')?.mediaReference?.mediaItemId)
      .toBe('media-video-01');

    unsubscribe();
  });
});
