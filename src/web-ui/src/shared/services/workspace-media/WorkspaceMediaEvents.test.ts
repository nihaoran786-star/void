import { describe, expect, it } from 'vitest';

import {
  getWorkspaceMediaPendingGenerationsForWorkspace,
  mergeWorkspaceMediaPendingGenerationsForWorkspace,
  recordWorkspaceMediaRefresh,
  resetWorkspaceMediaRefreshState,
} from './WorkspaceMediaEvents';

describe('WorkspaceMediaEvents', () => {
  it('removes active pending generations when a completed signal for the same batch arrives', () => {
    resetWorkspaceMediaRefreshState();

    recordWorkspaceMediaRefresh({
      reason: 'media-tool-event',
      lifecycleStatus: 'polling',
      workspacePath: 'C:/work',
      toolId: 'tool-started',
      toolName: 'GenerateImage',
      batchId: 'batch-asset-1',
      kind: 'image',
      requestedCount: 2,
    });
    expect(getWorkspaceMediaPendingGenerationsForWorkspace('C:/work')).toHaveLength(2);

    recordWorkspaceMediaRefresh({
      reason: 'media-tool-event',
      lifecycleStatus: 'completed',
      workspacePath: 'C:/work',
      toolId: 'tool-completed',
      toolName: 'GenerateImage',
      batchId: 'batch-asset-1',
      kind: 'image',
      status: 'completed',
    });

    expect(getWorkspaceMediaPendingGenerationsForWorkspace('C:/work')).toEqual([]);
  });

  it('replaces a started tool pending signal when the same tool reports a batch while polling', () => {
    resetWorkspaceMediaRefreshState();

    recordWorkspaceMediaRefresh({
      reason: 'media-tool-event',
      lifecycleStatus: 'started',
      workspacePath: 'C:/work',
      toolId: 'video-tool-1',
      toolName: 'GenerateVideo',
      kind: 'video',
      requestedCount: 1,
      targetStage: 'video',
      artifactHandle: 'VID-E01-S01-001',
      prompt: 'rain station video',
    });
    recordWorkspaceMediaRefresh({
      reason: 'media-tool-event',
      lifecycleStatus: 'polling',
      workspacePath: 'C:/work',
      toolId: 'video-tool-1',
      toolName: 'GenerateVideo',
      batchId: 'media_batch_video_1',
      kind: 'video',
      requestedCount: 1,
      prompt: 'rain station video',
    });

    expect(getWorkspaceMediaPendingGenerationsForWorkspace('C:/work')).toEqual([
      expect.objectContaining({
        batchId: 'media_batch_video_1',
        kind: 'video',
      }),
    ]);
  });

  it('deduplicates equivalent pending generations from runtime signals and scanned job files', () => {
    resetWorkspaceMediaRefreshState();

    recordWorkspaceMediaRefresh({
      reason: 'media-tool-event',
      lifecycleStatus: 'polling',
      workspacePath: 'C:/work',
      toolId: 'video-tool-2',
      toolName: 'GenerateVideo',
      kind: 'video',
      requestedCount: 1,
      targetStage: 'video',
      artifactHandle: 'VID-E01-S01-001',
      prompt: 'rain station video',
    });

    const merged = mergeWorkspaceMediaPendingGenerationsForWorkspace([
      {
        id: 'workspace-media-pending-media_batch_video_1-1',
        batchId: 'media_batch_video_1',
        itemIndex: 1,
        kind: 'video',
        source: 'generated',
        targetStage: 'video',
        artifactHandle: 'VID-E01-S01-001',
        prompt: 'rain station video',
        requestedAspectRatio: '16:9',
        placeholderAspectRatio: '16 / 9',
      },
    ], 'C:/work');

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      batchId: 'media_batch_video_1',
      kind: 'video',
      targetStage: 'video',
      artifactHandle: 'VID-E01-S01-001',
    });
  });

  it('keeps artifact target metadata on pending generations and clears only matching targets', () => {
    resetWorkspaceMediaRefreshState();

    recordWorkspaceMediaRefresh({
      reason: 'media-tool-event',
      lifecycleStatus: 'polling',
      workspacePath: 'C:/work',
      toolId: 'tool-storyboard',
      toolName: 'GenerateImage',
      batchId: 'batch-shared',
      kind: 'image',
      requestedCount: 1,
      targetStage: 'storyboards',
      artifactHandle: 'EP01-SB01',
    });
    recordWorkspaceMediaRefresh({
      reason: 'media-tool-event',
      lifecycleStatus: 'polling',
      workspacePath: 'C:/work',
      toolId: 'tool-video',
      toolName: 'GenerateVideo',
      batchId: 'batch-shared',
      kind: 'video',
      requestedCount: 1,
      targetStage: 'video',
      artifactHandle: 'EP01-VID01',
    });

    const pendingTargets = getWorkspaceMediaPendingGenerationsForWorkspace('C:/work');
    expect(pendingTargets).toHaveLength(2);
    expect(pendingTargets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetStage: 'storyboards',
        artifactHandle: 'EP01-SB01',
      }),
      expect.objectContaining({
        targetStage: 'video',
        artifactHandle: 'EP01-VID01',
      }),
    ]));

    recordWorkspaceMediaRefresh({
      reason: 'media-tool-event',
      lifecycleStatus: 'completed',
      workspacePath: 'C:/work',
      toolId: 'tool-storyboard-complete',
      toolName: 'GenerateImage',
      batchId: 'batch-shared',
      kind: 'image',
      targetStage: 'storyboards',
      artifactHandle: 'EP01-SB01',
      status: 'completed',
    });

    expect(getWorkspaceMediaPendingGenerationsForWorkspace('C:/work')).toEqual([
      expect.objectContaining({
        targetStage: 'video',
        artifactHandle: 'EP01-VID01',
      }),
    ]);
  });

  it('clears targeted pending generations when a completed batch signal has no target metadata', () => {
    resetWorkspaceMediaRefreshState();

    recordWorkspaceMediaRefresh({
      reason: 'media-tool-event',
      lifecycleStatus: 'polling',
      workspacePath: 'C:/work',
      toolId: 'tool-asset',
      toolName: 'GenerateImage',
      batchId: 'batch-asset-no-target-complete',
      kind: 'image',
      requestedCount: 1,
      targetStage: 'assets',
      artifactHandle: 'CHAR-001',
    });

    expect(getWorkspaceMediaPendingGenerationsForWorkspace('C:/work')).toHaveLength(1);

    recordWorkspaceMediaRefresh({
      reason: 'media-tool-event',
      lifecycleStatus: 'completed',
      workspacePath: 'C:/work',
      toolId: 'tool-asset-complete',
      toolName: 'GenerateImage',
      batchId: 'batch-asset-no-target-complete',
      kind: 'image',
      status: 'completed',
    });

    expect(getWorkspaceMediaPendingGenerationsForWorkspace('C:/work')).toEqual([]);
  });
});
