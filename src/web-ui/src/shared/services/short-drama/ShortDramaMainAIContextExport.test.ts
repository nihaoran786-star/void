import { describe, expect, it } from 'vitest';

import {
  createShortDramaMainAIContextExport,
  createShortDramaStaticProject,
} from './index';

describe('ShortDramaMainAIContextExport', () => {
  it('exports a low-context right-panel awareness package for main AI without raw media URLs', () => {
    const project = createShortDramaStaticProject();

    const result = createShortDramaMainAIContextExport(project, {
      activeStage: 'post',
      activeEpisodeId: 'episode-02',
      activeArtifactIdOrHandle: 'EP02-POST01',
      panelState: 'open',
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-context-export',
      context: expect.objectContaining({
        id: 'short-drama-context-static_short_drama_001',
        type: 'code-snippet',
        filePath: '.void/short-drama/awareness.md',
        fileName: 'short-drama-awareness.md',
        language: 'markdown',
      }),
      awareness: expect.objectContaining({
        source: 'short-drama-main-ai-tools',
        projectId: 'static_short_drama_001',
        activeStage: 'post',
        activeEpisodeId: 'episode-02',
      }),
    }));
    expect(result.context.selectedText).toContain('# Short Drama Right Panel');
    expect(result.context.selectedText).toContain('activeStage: post');
    expect(result.context.selectedText).toContain('activeEpisode: 2');
    expect(result.context.selectedText).toContain('listShortDramaMedia');
    expect(result.context.selectedText).toContain('reviewShortDramaStageOutput');
    expect(result.context.selectedText).toContain('emptyMedia');
    expect(result.context.selectedText).not.toContain('/short-drama-static/final-preview.mp4');
    expect(result.context.selectedText).not.toContain('data:image/svg+xml');
  });

  it('does not expose raw media references anywhere in the main AI export payload', () => {
    const sourceProject = createShortDramaStaticProject();
    const project = {
      ...sourceProject,
      artifacts: sourceProject.artifacts.map(artifact => artifact.id === 'episode-01-character-guard'
        ? {
            ...artifact,
            mediaReference: {
              mediaItemId: 'media-image-hero',
              kind: 'image' as const,
              label: 'External raw image reference',
              previewUrl: 'https://cdn.example.com/raw-short-drama-image.png',
              thumbnailUrl: 'data:image/png;base64,raw-thumbnail-bytes',
              localPath: 'C:/Users/17949/Pictures/raw-short-drama-image.png',
              filePath: '/mnt/workspace/raw-short-drama-image.png',
            },
          }
        : artifact),
    };

    const result = createShortDramaMainAIContextExport(project, {
      activeStage: 'assets',
      activeEpisodeId: 'episode-01',
      activeArtifactIdOrHandle: 'episode-01-character-guard',
      panelState: 'open',
    });

    expect(result.status).toBe('ready');
    const payload = JSON.stringify(result);
    expect(payload).toContain('media-image-hero');
    expect(payload).toContain('previewAvailable');
    expect(payload).toContain('activeMedia');
    expect(payload).not.toContain('data:image/svg+xml');
    expect(payload).not.toContain('raw-thumbnail-bytes');
    expect(payload).not.toContain('https://cdn.example.com/raw-short-drama-image.png');
    expect(payload).not.toContain('C:/Users/17949/Pictures/raw-short-drama-image.png');
    expect(payload).not.toContain('/mnt/workspace/raw-short-drama-image.png');
    expect(payload).not.toContain('/short-drama-static/final-preview.mp4');
    expect(payload).not.toContain('mediaReference');
    expect(payload).not.toContain('previewUrl');
    expect(payload).not.toContain('thumbnailUrl');
    expect(payload).not.toContain('localPath');
    expect(payload).not.toContain('rawMediaBytes');
    expect(payload).not.toContain('rawMediaPayloadsIncluded');
  });

  it('exports persistent stage agent session status without embedding chat history', () => {
    const project = createShortDramaStaticProject();
    const workspacePath = 'C:/Users/17949/Documents/void-source';
    const parentSessionId = 'main-session-001';

    const result = createShortDramaMainAIContextExport(project, {
      activeStage: 'assets',
      workspacePath,
      parentSessionId,
      stageAgentSessions: [
        { childSessionId: 'session-script', parentSessionId, agentType: 'ScriptAI', workspacePath },
        { childSessionId: 'session-assets', parentSessionId, agentType: 'AssetAI', workspacePath },
        { childSessionId: 'session-split', parentSessionId, agentType: 'SplitAI', workspacePath },
        { childSessionId: 'session-video', parentSessionId, agentType: 'VideoAI', workspacePath },
        { childSessionId: 'session-editor', parentSessionId, agentType: 'EditorAI', workspacePath },
      ],
      stageAgentBindings: [
        { stage: 'script', agentName: 'ScriptAI', childSessionId: 'session-script', parentSessionId, workspaceRoot: workspacePath, status: 'ready', source: 'main_ai_wake' },
        { stage: 'assets', agentName: 'AssetAI', childSessionId: 'session-assets', parentSessionId, workspaceRoot: workspacePath, status: 'ready', source: 'main_ai_wake' },
        { stage: 'storyboards', agentName: 'SplitAI', childSessionId: 'session-split', parentSessionId, workspaceRoot: workspacePath, status: 'ready', source: 'main_ai_wake' },
        { stage: 'video', agentName: 'VideoAI', childSessionId: 'session-video', parentSessionId, workspaceRoot: workspacePath, status: 'ready', source: 'main_ai_wake' },
        { stage: 'post', agentName: 'EditorAI', childSessionId: 'session-editor', parentSessionId, workspaceRoot: workspacePath, status: 'ready', source: 'main_ai_wake' },
      ],
    });

    expect(result.status).toBe('ready');
    expect(result.status === 'ready' ? result.context.selectedText : '').toContain('## Stage Agents');
    expect(result.status === 'ready' ? result.context.selectedText : '').toContain('- assets: agent=AssetAI, status=ready, childSessionId=session-assets');
    expect(result.status === 'ready' ? result.context.selectedText : '').toContain('- video: agent=VideoAI, status=ready, childSessionId=session-video');
    expect(result.status === 'ready' ? result.context.selectedText : '').not.toContain('Message this agent');
    expect(result.status === 'ready' ? result.context.selectedText : '').not.toContain('暂无会话');
  });
});
