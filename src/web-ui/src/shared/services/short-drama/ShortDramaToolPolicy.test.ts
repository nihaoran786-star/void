import { describe, expect, it } from 'vitest';

import {
  authorizeShortDramaAgentWrite,
  authorizeShortDramaToolUse,
  createShortDramaToolPolicy,
  getShortDramaAgentReadScopes,
} from './ShortDramaToolPolicy';

describe('ShortDramaToolPolicy', () => {
  it('allows orchestrator project tools without requiring a stage workspace', () => {
    const policy = createShortDramaToolPolicy({ actorRole: 'orchestrator' });
    const authorization = authorizeShortDramaToolUse(
      { actorRole: 'orchestrator' },
      {
        tool: 'listShortDramaProjectAuditLog',
        capability: 'explain',
        targetScope: 'project',
      },
    );

    expect(policy).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-tool-policy',
      policy: expect.objectContaining({
        actorRole: 'orchestrator',
        scope: 'project',
      }),
    }));
    expect(authorization).toEqual({
      status: 'allow',
      source: 'short-drama-tool-policy',
      reason: 'List recent artifact changes, actors, reasons, and downstream impact without raw payloads.',
    });
  });

  it('enforces stage scope for page-level specialist agents', () => {
    const allowed = authorizeShortDramaToolUse(
      { actorRole: 'video', stage: 'video' },
      {
        tool: 'readShortDramaArtifact',
        capability: 'read',
        targetScope: 'stage',
        targetStage: 'video',
      },
    );
    const denied = authorizeShortDramaToolUse(
      { actorRole: 'video', stage: 'video' },
      {
        tool: 'updateShortDramaArtifactPrompt',
        capability: 'updatePrompt',
        targetScope: 'artifact',
        targetStage: 'post',
      },
    );

    expect(allowed).toEqual(expect.objectContaining({
      status: 'allow',
      source: 'short-drama-tool-policy',
    }));
    expect(denied).toEqual({
      status: 'deny',
      source: 'short-drama-tool-policy',
      error: {
        code: 'stage_mismatch',
        message: 'Specialist tool request targets post, but the workspace owns video.',
      },
    });
  });

  it('requires main AI approval for specialist generation requests', () => {
    const authorization = authorizeShortDramaToolUse(
      { actorRole: 'video', stage: 'video' },
      {
        tool: 'requestShortDramaGeneration',
        capability: 'requestGeneration',
        targetScope: 'artifact',
        targetStage: 'video',
      },
    );

    expect(authorization).toEqual({
      status: 'requires_approval',
      source: 'short-drama-tool-policy',
      reason: 'Generation can be requested only for the focused artifact.',
    });
  });

  it('allows page-level specialist agents to read and explain current-stage media artifacts', () => {
    const readCurrentStageMedia = authorizeShortDramaToolUse(
      { actorRole: 'video', stage: 'video' },
      {
        tool: 'readShortDramaMediaArtifact',
        capability: 'read',
        targetScope: 'artifact',
        targetStage: 'video',
      },
    );
    const explainCurrentStageMedia = authorizeShortDramaToolUse(
      { actorRole: 'video', stage: 'video' },
      {
        tool: 'explainShortDramaMediaArtifactChange',
        capability: 'explain',
        targetScope: 'artifact',
        targetStage: 'video',
      },
    );
    const deniedOtherStageMedia = authorizeShortDramaToolUse(
      { actorRole: 'video', stage: 'video' },
      {
        tool: 'readShortDramaMediaArtifact',
        capability: 'read',
        targetScope: 'artifact',
        targetStage: 'post',
      },
    );

    expect(readCurrentStageMedia).toEqual(expect.objectContaining({
      status: 'allow',
      source: 'short-drama-tool-policy',
    }));
    expect(explainCurrentStageMedia).toEqual(expect.objectContaining({
      status: 'allow',
      source: 'short-drama-tool-policy',
    }));
    expect(deniedOtherStageMedia).toEqual({
      status: 'deny',
      source: 'short-drama-tool-policy',
      error: {
        code: 'stage_mismatch',
        message: 'Specialist tool request targets post, but the workspace owns video.',
      },
    });
  });

  it('denies tools absent from a specialist catalog', () => {
    const authorization = authorizeShortDramaToolUse(
      { actorRole: 'post', stage: 'post' },
      {
        tool: 'validateShortDramaProjectIntegrity',
        capability: 'validate',
        targetScope: 'project',
        targetStage: 'post',
      },
    );

    expect(authorization).toEqual({
      status: 'deny',
      source: 'short-drama-tool-policy',
      error: {
        code: 'scope_denied',
        message: 'Tool validateShortDramaProjectIntegrity is not available for this short drama actor.',
      },
    });
  });

  it('exposes low-context read scopes for cross-stage specialist work', () => {
    expect(getShortDramaAgentReadScopes({ actorRole: 'director', stage: 'script' })).toEqual({
      script: 'full',
      assets: 'allSummary',
      storyboards: 'episodeRelated',
      video: 'statusSummary',
      post: 'statusSummary',
    });
    expect(getShortDramaAgentReadScopes({ actorRole: 'image', stage: 'assets' })).toEqual({
      script: 'episode',
      assets: 'allSummary',
      storyboards: 'episodeRelated',
      video: 'statusSummary',
      post: 'statusSummary',
    });
    expect(getShortDramaAgentReadScopes({ actorRole: 'image', stage: 'storyboards' })).toEqual({
      script: 'segment',
      assets: 'referenced',
      storyboards: 'episodeRelated',
      video: 'statusSummary',
      post: 'statusSummary',
    });
    expect(getShortDramaAgentReadScopes({ actorRole: 'video', stage: 'video' })).toEqual({
      script: 'segment',
      assets: 'referenced',
      storyboards: 'referenced',
      video: 'referenced',
      post: 'statusSummary',
    });
    expect(getShortDramaAgentReadScopes({ actorRole: 'post', stage: 'post' })).toEqual({
      script: 'segment',
      assets: 'referenced',
      storyboards: 'referenced',
      video: 'referenced',
      post: 'statusSummary',
    });
  });

  it('defines default write boundaries for all page-level specialist agents', () => {
    const scriptWritesScript = authorizeShortDramaAgentWrite(
      { actorRole: 'director', stage: 'script' },
      'updatePrompt',
      'script',
    );
    const assetWritesAsset = authorizeShortDramaAgentWrite(
      { actorRole: 'image', stage: 'assets' },
      'attachMedia',
      'assets',
    );
    const assetWritesVideo = authorizeShortDramaAgentWrite(
      { actorRole: 'image', stage: 'assets' },
      'attachMedia',
      'video',
    );
    const splitWritesStoryboard = authorizeShortDramaAgentWrite(
      { actorRole: 'image', stage: 'storyboards' },
      'updatePrompt',
      'storyboards',
    );
    const videoWritesStoryboard = authorizeShortDramaAgentWrite(
      { actorRole: 'video', stage: 'video' },
      'updatePrompt',
      'storyboards',
    );
    const editorWritesPost = authorizeShortDramaAgentWrite(
      { actorRole: 'post', stage: 'post' },
      'attachMedia',
      'post',
    );
    const editorWritesVideo = authorizeShortDramaAgentWrite(
      { actorRole: 'post', stage: 'post' },
      'attachMedia',
      'video',
    );

    expect(scriptWritesScript.status).toBe('allow');
    expect(assetWritesAsset.status).toBe('allow');
    expect(assetWritesVideo).toEqual(expect.objectContaining({
      status: 'request_required',
      source: 'short-drama-tool-policy',
      stage: 'video',
      capability: 'attachMedia',
    }));
    expect(splitWritesStoryboard.status).toBe('allow');
    expect(videoWritesStoryboard).toEqual(expect.objectContaining({
      status: 'request_required',
      source: 'short-drama-tool-policy',
      stage: 'storyboards',
      capability: 'updatePrompt',
    }));
    expect(editorWritesPost.status).toBe('allow');
    expect(editorWritesVideo).toEqual(expect.objectContaining({
      status: 'request_required',
      source: 'short-drama-tool-policy',
      stage: 'video',
      capability: 'attachMedia',
    }));
  });

  it('forces cross-stage writes through change requests instead of direct mutation', () => {
    const directScriptWrite = authorizeShortDramaAgentWrite(
      { actorRole: 'video', stage: 'video' },
      'updatePrompt',
      'script',
    );
    const requestScriptChange = authorizeShortDramaAgentWrite(
      { actorRole: 'video', stage: 'video' },
      'requestChange',
      'script',
    );
    const videoWrite = authorizeShortDramaAgentWrite(
      { actorRole: 'video', stage: 'video' },
      'updatePrompt',
      'video',
    );

    expect(directScriptWrite).toEqual({
      status: 'request_required',
      source: 'short-drama-tool-policy',
      stage: 'script',
      capability: 'updatePrompt',
      reason: 'video cannot updatePrompt in script; create a cross-stage change request instead.',
    });
    expect(requestScriptChange).toEqual({
      status: 'allow',
      source: 'short-drama-tool-policy',
      stage: 'script',
      capability: 'requestChange',
      reason: 'video may requestChange in script.',
    });
    expect(videoWrite).toEqual({
      status: 'allow',
      source: 'short-drama-tool-policy',
      stage: 'video',
      capability: 'updatePrompt',
      reason: 'video may updatePrompt in video.',
    });
  });
});
