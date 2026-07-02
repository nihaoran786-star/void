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
