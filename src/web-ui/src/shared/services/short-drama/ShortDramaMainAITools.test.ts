import { describe, expect, it } from 'vitest';

import {
  createShortDramaMainAITools,
  createShortDramaStaticProject,
} from './index';

describe('ShortDramaMainAITools', () => {
  it('gives the main AI a low-context awareness snapshot before searching right-panel artifacts', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const awareness = tools.getProjectAwareness({
      activeStage: 'post',
      activeEpisodeId: 'episode-03',
    });

    expect(awareness).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      projectId: 'static_short_drama_001',
      title: 'Under the Neon',
      projectStatus: 'review',
      activeStage: 'post',
      activeEpisodeId: 'episode-03',
      episodes: expect.objectContaining({
        total: 10,
        activeEpisodeNumber: 3,
      }),
      media: expect.objectContaining({
        total: 34,
        ready: 4,
        empty: 29,
        playable: 2,
        previewAvailable: 4,
        indexOutline: expect.objectContaining({
          source: 'media-artifact-index',
          includesEmptySlots: true,
          nextTool: 'listMedia',
          byStage: expect.arrayContaining([
            expect.objectContaining({
              stage: 'video',
              total: 10,
              empty: 8,
              playable: 1,
              sampleHandles: expect.arrayContaining(['EP01-VID01', 'EP02-VID01', 'EP03-VID01']),
            }),
            expect.objectContaining({
              stage: 'post',
              total: 11,
              empty: 10,
              playable: 1,
              sampleHandles: expect.arrayContaining(['EP01-POST01', 'EP03-POST01']),
            }),
          ]),
          attention: expect.objectContaining({
            playableHandles: expect.arrayContaining(['EP01-VID01', 'EP01-POST01']),
            emptySlotHandles: expect.arrayContaining(['EP03-VID01', 'EP03-POST01']),
            missingPreviewHandles: expect.arrayContaining(['EP02-VID01']),
          }),
          recommendedQueries: expect.arrayContaining([
            { includeEmpty: true },
            { includeEmpty: true, mediaStatus: 'empty' },
            { playable: true },
          ]),
        }),
      }),
      workspace: expect.objectContaining({
        stage: 'post',
        activeEpisodeId: 'episode-03',
        specialistAgentRole: 'post',
        panelState: 'collapsed',
      }),
      contextBudget: expect.objectContaining({
        strategy: 'summary-first',
        maxRecommendedReadItems: 8,
        rawPayloadsIncluded: false,
      }),
      omittedSections: expect.arrayContaining([
        'fullScriptDocument',
        'rawMediaPayloads',
        'fullRevisionHistory',
      ]),
      availableTools: expect.arrayContaining([
        'listShortDramaMedia',
        'searchShortDramaProjectIndex',
        'readShortDramaArtifact',
        'readShortDramaMediaArtifact',
        'listShortDramaProjectAuditLog',
        'setShortDramaStageFocus',
        'explainShortDramaMediaArtifactChange',
        'updateShortDramaMediaArtifactPrompt',
      ]),
      nextReads: expect.arrayContaining([
        expect.objectContaining({
          tool: 'listShortDramaMedia',
          reason: expect.stringContaining('right-panel media'),
        }),
        expect.objectContaining({
          tool: 'searchShortDramaProjectIndex',
          reason: expect.stringContaining('structured filters'),
        }),
      ]),
    }));
    expect(awareness.stageSummaries).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'assets', total: 3, ready: 1, emptyMedia: 2 }),
      expect.objectContaining({ stage: 'post', total: 11, ready: 1, emptyMedia: 10 }),
    ]));
    expect(JSON.stringify(awareness)).not.toContain('/short-drama-static/final-preview.mp4');
    expect(JSON.stringify(awareness)).not.toContain('data:image/svg+xml');
  });

  it('includes the current focused artifact media in the main AI awareness snapshot', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const awareness = tools.getProjectAwareness({
      activeStage: 'video',
      activeEpisodeId: 'episode-01',
      activeArtifactIdOrHandle: 'EP01-VID01',
      panelState: 'pinned',
    });

    expect(awareness).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      activeStage: 'video',
      activeEpisodeId: 'episode-01',
      workspace: expect.objectContaining({
        stage: 'video',
        activeEpisodeId: 'episode-01',
        activeArtifactId: 'episode-01-video-01',
        activeArtifactHandle: 'EP01-VID01',
        activeMedia: {
          artifactHandle: 'EP01-VID01',
          mediaKind: 'video',
          mediaStatus: 'ready',
          mediaItemId: 'media-video-01',
          previewAvailable: true,
          playable: true,
        },
        panelState: 'pinned',
      }),
    }));
    expect(JSON.stringify(awareness)).not.toContain('/short-drama-static/episode-01-shot-03.mp4');
  });

  it('exposes workspace-bound persistent stage agent sessions to the main AI awareness snapshot', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);
    const workspacePath = 'C:/Users/17949/Documents/void-source';
    const parentSessionId = 'main-session-001';
    const sessions = [
      { childSessionId: 'session-script', parentSessionId, agentType: 'ScriptAI', workspacePath, lastActiveAt: 5 },
      { childSessionId: 'session-assets', parentSessionId, agentType: 'AssetAI', workspacePath, lastActiveAt: 4 },
      { childSessionId: 'session-split', parentSessionId, agentType: 'SplitAI', workspacePath, lastActiveAt: 3 },
      { childSessionId: 'session-video', parentSessionId, agentType: 'VideoAI', workspacePath, lastActiveAt: 2 },
      { childSessionId: 'session-editor', parentSessionId, agentType: 'EditorAI', workspacePath, lastActiveAt: 1 },
    ];
    const bindings = [
      { stage: 'script' as const, agentName: 'ScriptAI' as const, childSessionId: 'session-script', parentSessionId, workspaceRoot: workspacePath, status: 'ready' as const, source: 'main_ai_wake' as const },
      { stage: 'assets' as const, agentName: 'AssetAI' as const, childSessionId: 'session-assets', parentSessionId, workspaceRoot: workspacePath, status: 'ready' as const, source: 'main_ai_wake' as const },
      { stage: 'storyboards' as const, agentName: 'SplitAI' as const, childSessionId: 'session-split', parentSessionId, workspaceRoot: workspacePath, status: 'ready' as const, source: 'main_ai_wake' as const },
      { stage: 'video' as const, agentName: 'VideoAI' as const, childSessionId: 'session-video', parentSessionId, workspaceRoot: workspacePath, status: 'ready' as const, source: 'main_ai_wake' as const },
      { stage: 'post' as const, agentName: 'EditorAI' as const, childSessionId: 'session-editor', parentSessionId, workspaceRoot: workspacePath, status: 'ready' as const, source: 'main_ai_wake' as const },
    ];

    const awareness = tools.getProjectAwareness({
      activeStage: 'video',
      activeEpisodeId: 'episode-01',
      workspacePath,
      parentSessionId,
      stageAgentSessions: sessions,
      stageAgentBindings: bindings,
    });

    expect(awareness.workspace).toEqual(expect.objectContaining({
      stage: 'video',
      specialistSessionId: 'session-video',
      parentSessionId,
      stageAgentBindingStatus: 'ready',
    }));
    expect(awareness.stageAgents).toEqual([
      expect.objectContaining({ stage: 'script', agentName: 'ScriptAI', status: 'ready', childSessionId: 'session-script', matchedBy: 'persistentStageBinding' }),
      expect.objectContaining({ stage: 'assets', agentName: 'AssetAI', status: 'ready', childSessionId: 'session-assets', matchedBy: 'persistentStageBinding' }),
      expect.objectContaining({ stage: 'storyboards', agentName: 'SplitAI', status: 'ready', childSessionId: 'session-split', matchedBy: 'persistentStageBinding' }),
      expect.objectContaining({ stage: 'video', agentName: 'VideoAI', status: 'ready', childSessionId: 'session-video', matchedBy: 'persistentStageBinding' }),
      expect.objectContaining({ stage: 'post', agentName: 'EditorAI', status: 'ready', childSessionId: 'session-editor', matchedBy: 'persistentStageBinding' }),
    ]);
    expect(JSON.stringify(awareness.stageAgents)).not.toContain('short-drama-stage-agent:');
  });

  it('lists every right-panel media item for the main AI without exposing raw preview payloads', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const inventory = tools.listMedia({ limit: 20 });
    const playable = tools.listMedia({ playable: true });
    const postFinal = tools.listMedia({ stage: 'post', episodeNumber: 1, mediaKind: 'video' });

    expect(inventory).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      query: { limit: 20 },
    }));
    expect(inventory.status === 'ready' ? inventory.results.map(item => item.mediaItemId) : []).toEqual([
      'media-image-hero',
      'media-storyboard-01',
      'media-video-01',
      'media-post-final-01',
      'media-video-missing',
    ]);
    expect(inventory.status === 'ready' ? inventory.results[0] : undefined).toEqual(expect.objectContaining({
      artifactId: 'episode-01-character-guard',
      artifactHandle: 'CHAR-01',
      mediaKind: 'image',
      previewAvailable: true,
      thumbnailAvailable: true,
      playable: false,
      scrollTargetId: 'short-drama-artifact-episode-01-character-guard',
    }));
    expect(playable.status === 'ready' ? playable.results.map(item => item.artifactId) : []).toEqual([
      'episode-01-video-01',
      'episode-01-post-final',
    ]);
    expect(postFinal).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      results: [
        expect.objectContaining({
          artifactId: 'episode-01-post-final',
          mediaItemId: 'media-post-final-01',
          playable: true,
          scrollTargetId: 'short-drama-artifact-episode-01-post-final',
        }),
      ],
    }));
    expect(JSON.stringify(inventory)).not.toContain('/short-drama-static/final-preview.mp4');
    expect(JSON.stringify(inventory)).not.toContain('data:image/svg+xml');
  });

  it('lets the main AI include empty media confirmation slots when auditing right-panel media', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const emptyPostSlots = tools.listMedia({
      stage: 'post',
      includeEmpty: true,
      mediaStatus: 'empty',
      limit: 20,
    });
    const emptyVideoSlots = tools.listMedia({
      stage: 'video',
      episodeNumber: 3,
      includeEmpty: true,
      mediaStatus: 'empty',
    });

    expect(emptyPostSlots).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
    }));
    expect(emptyPostSlots.status === 'ready' ? emptyPostSlots.results : []).toEqual(expect.arrayContaining([
      expect.objectContaining({
        artifactId: 'episode-02-post-subtitle',
        stage: 'post',
        episodeNumber: 2,
        mediaKind: 'video',
        mediaStatus: 'empty',
        mediaItemId: undefined,
        previewAvailable: false,
        playable: false,
        scrollTargetId: 'short-drama-artifact-episode-02-post-subtitle',
      }),
      expect.objectContaining({
        artifactId: 'episode-03-post-placeholder',
        stage: 'post',
        episodeNumber: 3,
        mediaKind: 'video',
        mediaStatus: 'empty',
        mediaItemId: undefined,
        previewAvailable: false,
        playable: false,
        scrollTargetId: 'short-drama-artifact-episode-03-post-placeholder',
      }),
    ]));
    expect(emptyVideoSlots).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      results: [
        expect.objectContaining({
          artifactId: 'episode-03-video-placeholder',
          stage: 'video',
          episodeNumber: 3,
          mediaKind: 'video',
          mediaStatus: 'empty',
          mediaItemId: undefined,
          previewAvailable: false,
          playable: false,
          scrollTargetId: 'short-drama-artifact-episode-03-video-placeholder',
        }),
      ],
    }));
  });

  it('lets the main AI opt into empty media confirmation slots in the unified search index', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const search = tools.searchProjectIndex({
      kind: 'media',
      stage: 'post',
      episodeNumber: 3,
      includeEmptyMedia: true,
      mediaStatus: 'empty',
      hasMedia: false,
      limit: 5,
    });

    expect(search).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      results: [
        expect.objectContaining({
          kind: 'media',
          sourceId: 'episode-03-post-placeholder',
          handle: 'EP03-POST01',
          stage: 'post',
          episodeNumber: 3,
          mediaKind: 'video',
          mediaStatus: 'empty',
          hasMedia: false,
          hasMediaPreview: false,
          hasPlayableMedia: false,
        }),
      ],
    }));
    expect(JSON.stringify(search)).not.toContain('/short-drama-static/final-preview.mp4');
    expect(JSON.stringify(search)).not.toContain('data:image/svg+xml');
  });

  it('lets the main AI search, read, and locate media artifacts through one structured facade', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const search = tools.searchArtifacts({
      mediaKind: 'video',
      hasPlayableMedia: true,
      limit: 5,
    });
    const read = tools.readArtifact({
      idOrHandle: 'EP01-POST01',
      includeMediaMetadata: true,
      tokenBudget: 16,
    });
    const locate = tools.locateArtifact('EP01-POST01');

    expect(search.status).toBe('ready');
    expect(search.status === 'ready' ? search.results.map(result => result.id) : []).toEqual([
      'episode-01-video-01',
      'episode-01-post-final',
    ]);
    expect(read).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-01-post-final',
      media: expect.objectContaining({
        mediaItemId: 'media-post-final-01',
        kind: 'video',
        playable: true,
      }),
    }));
    expect(JSON.stringify(read)).not.toContain('/short-drama-static/final-preview.mp4');
    expect(locate).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      stage: 'post',
      scrollTargetId: 'short-drama-artifact-episode-01-post-final',
    }));
  });

  it('lets the main AI read a right-panel media artifact by stable media item id', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const read = tools.readMediaArtifact({
      mediaItemId: 'media-post-final-01',
      includeMediaMetadata: true,
      tokenBudget: 16,
    });

    expect(read).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-01-post-final',
      entry: expect.objectContaining({
        handle: 'EP01-POST01',
      }),
      media: expect.objectContaining({
        mediaItemId: 'media-post-final-01',
        kind: 'video',
        playable: true,
        source: 'artifact-reference',
      }),
    }));
    expect(JSON.stringify(read)).not.toContain('/short-drama-static/final-preview.mp4');
  });

  it('lets the main AI read empty media confirmation slots without losing media state', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const read = tools.readArtifact({
      idOrHandle: 'EP03-POST01',
      includeMediaMetadata: true,
      tokenBudget: 20,
    });

    expect(read).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-03-post-placeholder',
      media: {
        mediaItemId: undefined,
        kind: 'video',
        label: 'Episode 03 post placeholder',
        mediaStatus: 'empty',
        previewAvailable: false,
        thumbnailAvailable: false,
        playable: false,
        source: 'media-inventory',
      },
      omittedContext: expect.not.arrayContaining(['mediaMetadata']),
    }));
  });

  it('lets the main AI target a media artifact by episode, scene, and shot coordinates', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const media = tools.listMedia({
      stage: 'video',
      episodeNumber: 1,
      sceneNumber: 1,
      shotNumber: 3,
      mediaKind: 'video',
    });
    const index = tools.searchProjectIndex({
      kind: 'media',
      stage: 'video',
      episodeNumber: 1,
      sceneNumber: 1,
      shotNumber: 3,
      mediaKind: 'video',
    });
    const focused = tools.focusArtifact({
      stage: 'video',
      episodeNumber: 1,
      sceneNumber: 1,
      shotNumber: 3,
      mediaKind: 'video',
    });

    expect(media).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      results: [
        expect.objectContaining({
          artifactId: 'episode-01-video-01',
          sceneNumber: 1,
          shotNumber: 1,
          shotNumbers: [1, 2, 3],
          playable: true,
        }),
      ],
    }));
    expect(index.status === 'ready' ? index.results.map(result => result.sourceId) : []).toEqual([
      'episode-01-video-01',
    ]);
    expect(focused).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-01-video-01',
      workspace: expect.objectContaining({
        stage: 'video',
        activeEpisodeId: 'episode-01',
        activeArtifactHandle: 'EP01-VID01',
      }),
    }));
  });

  it('locates a media artifact from structured user-facing filters when no handle is known', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const located = tools.locateArtifact({
      text: 'Missing clip',
      stage: 'video',
      episodeNumber: 2,
      mediaKind: 'video',
      hasMedia: true,
    });
    const ambiguous = tools.locateArtifact({
      text: 'video',
      stage: 'video',
    });

    expect(located).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-02-video-01',
      handle: 'EP02-VID01',
      scrollTargetId: 'short-drama-artifact-episode-02-video-01',
    }));
    expect(ambiguous).toEqual(expect.objectContaining({
      status: 'conflict',
      source: 'short-drama-main-ai-tools',
      error: expect.objectContaining({ code: 'artifact_location_ambiguous' }),
    }));
    expect(ambiguous.status === 'conflict' ? ambiguous.matches.length : 0).toBeGreaterThan(1);
  });

  it('updates artifact prompts only through revision workflow and returns impact', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const impact = tools.previewImpact('CHAR-01');
    const update = tools.updateArtifactPrompt({
      idOrHandle: 'CHAR-01',
      patch: {
        prompt: {
          positive: 'same guard, stronger court silhouette, consistent red robe',
        },
      },
      reason: 'Keep character continuity for downstream storyboard and video.',
      userInstruction: '这个角色图风格要更统一。',
      source: 'mainAI',
      timestamp: 123,
      markDownstream: true,
    });

    expect(impact.status).toBe('ready');
    expect(impact.status === 'ready' ? impact.changedArtifactId : undefined).toBe('episode-01-character-guard');
    expect(update).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-01-character-guard',
      revisionId: 'revision-episode-01-character-guard-123',
      impact: expect.objectContaining({ status: 'ready' }),
    }));

    const nextProject = update.status === 'ready' ? update.project : project;
    expect(nextProject.artifacts.find(artifact => artifact.id === 'episode-01-character-guard')).toEqual(expect.objectContaining({
      status: 'revising',
      revisionCount: 3,
      attemptCount: 4,
    }));
    expect(nextProject.artifacts.find(artifact => artifact.id === 'episode-01-storyboard-01')).toEqual(expect.objectContaining({
      status: 'stale',
    }));
  });

  it('lets the main AI revise a specific right-panel media prompt by media item id', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const update = tools.updateMediaArtifactPrompt({
      mediaItemId: 'media-post-final-01',
      patch: {
        prompt: {
          positive: 'tighten final assembly timing and keep the court suspense tone',
        },
      },
      reason: 'User pointed at the final preview media item and asked for a tighter edit.',
      userInstruction: '把这个成片节奏压紧一点，但不要换风格。',
      source: 'mainAI',
      timestamp: 789,
      markDownstream: true,
    });

    expect(update).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-01-post-final',
      revisionId: 'revision-episode-01-post-final-789',
    }));
    const nextProject = update.status === 'ready' ? update.project : project;
    expect(nextProject.artifacts.find(artifact => artifact.id === 'episode-01-post-final')).toEqual(expect.objectContaining({
      status: 'revising',
      prompt: expect.objectContaining({
        positive: 'tighten final assembly timing and keep the court suspense tone',
      }),
      revisions: expect.arrayContaining([
        expect.objectContaining({
          id: 'revision-episode-01-post-final-789',
          userInstruction: '把这个成片节奏压紧一点，但不要换风格。',
          source: 'mainAI',
        }),
      ]),
    }));
  });

  it('lets the main AI explain artifact changes through the audit facade', () => {
    const base = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(base);
    const update = tools.updateArtifactPrompt({
      idOrHandle: 'CHAR-01',
      patch: {
        prompt: {
          positive: 'same guard, more mature expression, consistent red robe',
        },
      },
      reason: 'User asked to mature the lead character while preserving continuity.',
      userInstruction: '女主角色图更成熟一点，但不要换人。',
      source: 'mainAI',
      timestamp: 456,
      markDownstream: true,
    });
    const nextTools = createShortDramaMainAITools(update.status === 'ready' ? update.project : base);

    const explanation = nextTools.explainArtifactChange('CHAR-01');

    expect(explanation).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-01-character-guard',
      handle: 'CHAR-01',
      summary: expect.stringContaining('User asked to mature the lead character'),
      events: expect.arrayContaining([
        expect.objectContaining({
          type: 'revision',
          title: 'Revision 3',
          source: 'mainAI',
        }),
        expect.objectContaining({
          type: 'attempt',
          title: 'Attempt 4',
          relatedRevisionId: 'revision-episode-01-character-guard-456',
        }),
      ]),
    }));
    expect(JSON.stringify(explanation)).not.toContain('data:image/svg+xml');
  });

  it('lets the main AI explain a right-panel media artifact change by media item id', () => {
    const base = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(base);
    const update = tools.updateShortDramaMediaArtifactPrompt({
      mediaItemId: 'media-post-final-01',
      patch: {
        prompt: {
          positive: 'shorter final rhythm, same suspense tone',
        },
      },
      reason: 'User asked to tighten the specific final media output.',
      userInstruction: '这个成片为什么变快了？先记录这次节奏调整。',
      source: 'mainAI',
      timestamp: 901,
      markDownstream: true,
    });
    const nextTools = createShortDramaMainAITools(update.status === 'ready' ? update.project : base);

    const explanation = nextTools.explainMediaArtifactChange('media-post-final-01');

    expect(explanation).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-01-post-final',
      handle: 'EP01-POST01',
      summary: expect.stringContaining('User asked to tighten'),
      events: expect.arrayContaining([
        expect.objectContaining({
          type: 'revision',
          revisionId: 'revision-episode-01-post-final-901',
          source: 'mainAI',
        }),
        expect.objectContaining({
          type: 'media',
          mediaItemId: 'media-post-final-01',
          playable: true,
        }),
      ]),
    }));
    expect(JSON.stringify(explanation)).not.toContain('/short-drama-static/final-preview.mp4');
  });

  it('manages page-level workspace focus without making assets depend on episode navigation', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const workspaces = tools.listStageWorkspaces({
      selectedStage: 'video',
      activeEpisodeId: 'episode-02',
      panelState: 'open',
    });
    const videoWorkspace = workspaces.status === 'ready'
      ? workspaces.workspaces.find(workspace => workspace.stage === 'video')
      : undefined;
    const focusedVideo = videoWorkspace
      ? tools.setStageFocus(videoWorkspace, {
          stage: 'video',
          artifactIdOrHandle: 'EP01-VID01',
          source: 'mainAI',
        })
      : undefined;
    const assetWorkspace = workspaces.status === 'ready'
      ? workspaces.workspaces.find(workspace => workspace.stage === 'assets')
      : undefined;
    const focusedAsset = assetWorkspace
      ? tools.setStageFocus(assetWorkspace, {
          stage: 'assets',
          artifactIdOrHandle: 'CHAR-01',
          source: 'mainAI',
        })
      : undefined;

    expect(workspaces.status).toBe('ready');
    expect(videoWorkspace).toEqual(expect.objectContaining({
      stage: 'video',
      activeEpisodeId: 'episode-02',
      specialistAgentRole: 'video',
    }));
    expect(focusedVideo).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      workspace: expect.objectContaining({
        activeEpisodeId: 'episode-01',
        activeArtifactHandle: 'EP01-VID01',
        activeMedia: expect.objectContaining({
          artifactHandle: 'EP01-VID01',
          mediaKind: 'video',
          mediaStatus: 'ready',
          playable: true,
        }),
      }),
    }));
    expect(focusedAsset).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      workspace: expect.objectContaining({
        stage: 'assets',
        activeEpisodeId: undefined,
        activeArtifactHandle: 'CHAR-01',
        specialistAgentRole: 'asset',
      }),
    }));
  });

  it('lets the main AI locate and focus the right panel in one tool call', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const focusedPost = tools.focusArtifact('EP01-POST01', { panelState: 'pinned' });
    const focusedVideo = tools.focusArtifact({
      text: 'Missing clip',
      stage: 'video',
      episodeNumber: 2,
      mediaKind: 'video',
      hasMedia: true,
    });
    const focusedAsset = tools.focusArtifact('CHAR-01');

    expect(focusedPost).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-01-post-final',
      scrollTargetId: 'short-drama-artifact-episode-01-post-final',
      workspace: expect.objectContaining({
        stage: 'post',
        activeEpisodeId: 'episode-01',
        activeArtifactId: 'episode-01-post-final',
        activeArtifactHandle: 'EP01-POST01',
        panelState: 'pinned',
        lastFocusSource: 'mainAI',
      }),
    }));
    expect(focusedVideo).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-02-video-01',
      workspace: expect.objectContaining({
        stage: 'video',
        activeEpisodeId: 'episode-02',
        activeArtifactHandle: 'EP02-VID01',
      }),
    }));
    expect(focusedAsset).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-01-character-guard',
      workspace: expect.objectContaining({
        stage: 'assets',
        activeEpisodeId: undefined,
        activeArtifactHandle: 'CHAR-01',
      }),
    }));
  });

  it('exposes the global asset usage graph to the main AI without scanning the UI', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const usage = tools.listAssetUsage({ assetType: 'character' });

    expect(usage).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      entries: [
        expect.objectContaining({
          assetId: 'episode-01-character-guard',
          assetHandle: 'CHAR-01',
          assetType: 'character',
          usedBy: expect.arrayContaining([
            expect.objectContaining({
              artifactId: 'episode-01-storyboard-01',
              artifactHandle: 'EP01-SB01',
              usageType: 'visual_reference',
            }),
          ]),
        }),
      ],
    }));
  });

  it('exposes focused specialist context packages to the main AI by artifact handle', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const context = tools.getSpecialistContext('EP01-VID01');

    expect(context).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      context: expect.objectContaining({
        projectId: 'static_short_drama_001',
        artifactId: 'episode-01-video-01',
        stage: 'video',
        activeEpisodeId: 'episode-01',
        activeArtifactId: 'episode-01-video-01',
        referencedAssets: expect.arrayContaining([
          expect.stringContaining('CHAR-01 Chai Yong character reference'),
        ]),
        forbiddenActions: expect.arrayContaining([
          'read_full_chat_history',
          'overwrite_prompt_revision_history',
        ]),
      }),
    }));
    expect(JSON.stringify(context)).not.toContain('Outer palace road location');
  });

  it('exposes page-level specialist context from a stage workspace to the main AI', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const workspaces = tools.listStageWorkspaces({
      selectedStage: 'video',
      activeEpisodeId: 'episode-02',
      panelState: 'open',
    });
    const videoWorkspace = workspaces.status === 'ready'
      ? workspaces.workspaces.find(workspace => workspace.stage === 'video')
      : undefined;
    const context = videoWorkspace ? tools.getStageSpecialistContext(videoWorkspace) : undefined;

    expect(context).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      context: expect.objectContaining({
        artifactId: 'episode-02-video-01',
        episodeId: 'episode-02',
        activeEpisodeId: 'episode-02',
        stage: 'video',
        agentRole: 'video',
      }),
    }));
  });

  it('exposes structured tool policy so the main AI can route work without hard-coded workflow rules', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const mainPolicy = tools.getToolPolicy({ actorRole: 'orchestrator' });
    const videoPolicy = tools.getToolPolicy({ actorRole: 'video', stage: 'video' });

    expect(mainPolicy).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      policy: expect.objectContaining({
        actorRole: 'orchestrator',
        scope: 'project',
        permissions: expect.arrayContaining([
          expect.objectContaining({ tool: 'validateShortDramaProjectIntegrity', capability: 'validate', access: 'allow', scope: 'project' }),
          expect.objectContaining({ tool: 'searchShortDramaProjectIndex', capability: 'search', access: 'allow' }),
          expect.objectContaining({ tool: 'resolveShortDramaNaturalLanguageTarget', capability: 'locate', access: 'allow' }),
          expect.objectContaining({ tool: 'listShortDramaMedia', capability: 'search', access: 'allow' }),
          expect.objectContaining({ tool: 'readShortDramaMediaArtifact', capability: 'read', access: 'allow', scope: 'artifact' }),
          expect.objectContaining({ tool: 'explainShortDramaArtifactChange', capability: 'explain', access: 'allow', scope: 'project' }),
          expect.objectContaining({ tool: 'createShortDramaDispatchPlan', capability: 'dispatch', access: 'allow' }),
          expect.objectContaining({ tool: 'reviewShortDramaStageOutput', capability: 'review', access: 'allow', scope: 'project' }),
          expect.objectContaining({ tool: 'deleteShortDramaArtifact', capability: 'delete', access: 'deny' }),
        ]),
      }),
    }));
    expect(videoPolicy).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      policy: expect.objectContaining({
        actorRole: 'video',
        stage: 'video',
        scope: 'stage',
        permissions: expect.arrayContaining([
          expect.objectContaining({ tool: 'listShortDramaMedia', capability: 'search', access: 'allow', scope: 'stage' }),
          expect.objectContaining({ tool: 'readShortDramaArtifact', capability: 'read', access: 'allow', scope: 'stage' }),
          expect.objectContaining({ tool: 'explainShortDramaArtifactChange', capability: 'explain', access: 'allow', scope: 'artifact' }),
          expect.objectContaining({ tool: 'updateShortDramaArtifactPrompt', capability: 'updatePrompt', access: 'allow', scope: 'artifact' }),
          expect.objectContaining({ tool: 'createShortDramaDispatchPlan', capability: 'dispatch', access: 'deny' }),
          expect.objectContaining({ tool: 'deleteShortDramaArtifact', capability: 'delete', access: 'deny' }),
        ]),
        forbiddenActions: expect.arrayContaining([
          'modify_other_stage_without_main_ai_dispatch',
          'delete_artifacts_or_media',
        ]),
      }),
    }));
    expect(videoPolicy.status === 'ready' ? videoPolicy.policy.permissions : []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ tool: 'validateShortDramaProjectIntegrity' }),
    ]));
  });

  it('exposes a policy-derived tool catalog for main AI routing', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const catalog = tools.listToolCatalog({ actorRole: 'orchestrator' });

    expect(catalog).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      actorRole: 'orchestrator',
      scope: 'project',
      recommendedOrder: [
        'getShortDramaProjectAwareness',
        'validateShortDramaProjectIntegrity',
        'routeShortDramaChatIntake',
        'resolveShortDramaNaturalLanguageTarget',
        'focusShortDramaNaturalLanguageTarget',
        'searchShortDramaProjectIndex',
        'listShortDramaMedia',
        'readShortDramaArtifact',
        'readShortDramaMediaArtifact',
        'setShortDramaStageFocus',
        'listShortDramaProjectAuditLog',
        'explainShortDramaArtifactChange',
        'explainShortDramaMediaArtifactChange',
        'optimizeShortDramaNaturalLanguageTarget',
        'previewShortDramaImpact',
        'updateShortDramaArtifactPrompt',
        'updateShortDramaMediaArtifactPrompt',
        'createShortDramaDispatchPlan',
        'reviewShortDramaStageOutput',
      ],
      tools: expect.arrayContaining([
        expect.objectContaining({
          name: 'validateShortDramaProjectIntegrity',
          capability: 'validate',
          access: 'allow',
          scope: 'project',
        }),
        expect.objectContaining({
          name: 'listShortDramaMedia',
          capability: 'search',
          access: 'allow',
          scope: 'project',
        }),
        expect.objectContaining({
          name: 'readShortDramaMediaArtifact',
          capability: 'read',
          access: 'allow',
          scope: 'artifact',
        }),
        expect.objectContaining({
          name: 'getShortDramaProjectAwareness',
          capability: 'read',
          access: 'allow',
          scope: 'project',
        }),
        expect.objectContaining({
          name: 'focusShortDramaNaturalLanguageTarget',
          capability: 'setFocus',
          access: 'allow',
          scope: 'project',
        }),
        expect.objectContaining({
          name: 'listShortDramaProjectAuditLog',
          capability: 'explain',
          access: 'allow',
          scope: 'project',
        }),
        expect.objectContaining({
          name: 'optimizeShortDramaNaturalLanguageTarget',
          capability: 'updatePrompt',
          access: 'allow',
          scope: 'artifact',
        }),
        expect.objectContaining({
          name: 'explainShortDramaMediaArtifactChange',
          capability: 'explain',
          access: 'allow',
          scope: 'artifact',
        }),
        expect.objectContaining({
          name: 'updateShortDramaMediaArtifactPrompt',
          capability: 'updatePrompt',
          access: 'allow',
          scope: 'artifact',
        }),
        expect.objectContaining({
          name: 'routeShortDramaChatIntake',
          capability: 'intake',
          access: 'allow',
          scope: 'project',
        }),
        expect.objectContaining({
          name: 'reviewShortDramaStageOutput',
          capability: 'review',
          access: 'allow',
          scope: 'project',
        }),
        expect.objectContaining({
          name: 'deleteShortDramaArtifact',
          capability: 'delete',
          access: 'deny',
          scope: 'project',
        }),
      ]),
    }));
  });

  it('exposes callable facade methods matching the policy tool names', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    expect(typeof tools.listShortDramaMedia).toBe('function');
    expect(typeof tools.searchShortDramaProjectIndex).toBe('function');
    expect(typeof tools.readShortDramaArtifact).toBe('function');
    expect(typeof tools.readShortDramaMediaArtifact).toBe('function');
    expect(typeof tools.setShortDramaStageFocus).toBe('function');
    expect(typeof tools.listShortDramaProjectAuditLog).toBe('function');
    expect(typeof tools.previewShortDramaImpact).toBe('function');
    expect(typeof tools.updateShortDramaArtifactPrompt).toBe('function');
    expect(typeof tools.explainShortDramaMediaArtifactChange).toBe('function');
    expect(typeof tools.updateShortDramaMediaArtifactPrompt).toBe('function');
    expect(typeof tools.optimizeShortDramaNaturalLanguageTarget).toBe('function');
    expect(typeof tools.reviewShortDramaStageOutput).toBe('function');

    const media = tools.listShortDramaMedia({ includeEmpty: true, mediaStatus: 'empty', limit: 3 });
    const search = tools.searchShortDramaProjectIndex({ kind: 'media', includeEmptyMedia: true, mediaStatus: 'empty', limit: 3 });
    const read = tools.readShortDramaArtifact({ idOrHandle: 'EP03-POST01', includeMediaMetadata: true });
    const audit = tools.listShortDramaProjectAuditLog({ stage: 'assets', limit: 3 });
    const impact = tools.previewShortDramaImpact('CHAR-01');

    expect(media).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
    }));
    expect(search).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
    }));
    expect(read).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-03-post-placeholder',
    }));
    expect(audit).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      entries: expect.arrayContaining([
        expect.objectContaining({
          handle: 'CHAR-01',
          stage: 'assets',
        }),
      ]),
    }));
    expect(impact).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      changedArtifactId: 'episode-01-character-guard',
    }));
  });

  it('exposes a stage-scoped tool catalog for page-level specialist agents', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const catalog = tools.listToolCatalog({ actorRole: 'video', stage: 'video' });

    expect(catalog).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      actorRole: 'video',
      stage: 'video',
      scope: 'stage',
      recommendedOrder: [
        'searchShortDramaProjectIndex',
        'listShortDramaMedia',
        'readShortDramaMediaArtifact',
        'readShortDramaArtifact',
        'explainShortDramaMediaArtifactChange',
        'explainShortDramaArtifactChange',
        'readShortDramaScriptSegment',
        'updateShortDramaArtifactPrompt',
        'createShortDramaAttempt',
        'requestShortDramaReview',
        'requestShortDramaChange',
        'requestShortDramaGeneration',
      ],
      tools: expect.arrayContaining([
        expect.objectContaining({
          name: 'readShortDramaMediaArtifact',
          capability: 'read',
          access: 'allow',
          scope: 'artifact',
          stage: 'video',
        }),
        expect.objectContaining({
          name: 'explainShortDramaMediaArtifactChange',
          capability: 'explain',
          access: 'allow',
          scope: 'artifact',
          stage: 'video',
        }),
        expect.objectContaining({
          name: 'explainShortDramaArtifactChange',
          capability: 'explain',
          access: 'allow',
          scope: 'artifact',
          stage: 'video',
        }),
        expect.objectContaining({
          name: 'requestShortDramaChange',
          capability: 'requestChange',
          access: 'allow',
          scope: 'stage',
        }),
        expect.objectContaining({
          name: 'requestShortDramaGeneration',
          capability: 'requestGeneration',
          access: 'requiresMainAIApproval',
          scope: 'artifact',
          stage: 'video',
        }),
      ]),
    }));
    expect(catalog.status === 'ready' ? catalog.tools : []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'validateShortDramaProjectIntegrity' }),
      expect.objectContaining({ name: 'routeShortDramaChatIntake' }),
    ]));
    expect(catalog.status === 'ready' ? catalog.tools : []).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'createShortDramaDispatchPlan',
        capability: 'dispatch',
        access: 'deny',
      }),
    ]));
  });

  it('exposes dependency graph, storyboard reference plans, and cross-stage change requests through the tool facade', () => {
    const baseProject = createShortDramaStaticProject();
    const project = {
      ...baseProject,
      storyboardReferencePlans: [
        {
          id: 'plan-ep01-sc01-sh01',
          episodeId: 'episode-01',
          sceneId: 'SC01',
          shotId: 'SH01',
          scriptSegmentId: 'script-segment-episode-01',
          characterAssetIds: ['episode-01-character-guard'],
          locationAssetIds: [],
          propAssetIds: ['episode-01-prop-letter'],
          requiredBeats: ['guard reveals the sealed letter'],
          visualNotes: ['keep the guard identity consistent'],
        },
      ],
    };
    const tools = createShortDramaMainAITools(project);

    const graph = tools.listShortDramaDependencyGraph();
    const plans = tools.listShortDramaStoryboardReferencePlans({ episodeId: 'episode-01' });
    const builtPlans = tools.createShortDramaStoryboardReferencePlansFromBreakdown();
    const appliedPlans = tools.applyShortDramaStoryboardReferencePlansFromBreakdown();
    const change = tools.requestShortDramaChange({
      actorRole: 'video',
      stage: 'video',
      targetStage: 'storyboards',
      targetArtifactIdOrHandle: 'EP01-SB01',
      reason: 'Video generation needs clearer camera motion.',
      suggestion: 'Add slow push-in camera movement to the storyboard prompt.',
      timestamp: 456,
    });
    const directWrite = tools.authorizeShortDramaAgentWrite(
      { actorRole: 'video', stage: 'video' },
      'updatePrompt',
      'script',
    );

    expect(graph).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      graph: expect.objectContaining({
        source: 'short-drama-dependency-graph',
      }),
    }));
    expect(plans).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      summaries: expect.arrayContaining([
        expect.stringContaining('guard reveals the sealed letter'),
      ]),
    }));
    expect(builtPlans).toEqual(expect.objectContaining({
      status: 'ready',
      plans: expect.arrayContaining([expect.objectContaining({
        scriptSegmentId: 'script-segment-episode-01',
        characterAssetIds: ['episode-01-character-guard'],
      })]),
    }));
    expect(appliedPlans).toEqual(expect.objectContaining({
      status: 'ready',
      planCount: expect.any(Number),
      project: expect.objectContaining({
        storyboardReferencePlans: expect.any(Array),
      }),
    }));
    expect(change).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      request: expect.objectContaining({
        id: 'change-request-storyboards-456',
        targetArtifactHandle: 'EP01-SB01',
      }),
    }));
    expect(directWrite).toEqual(expect.objectContaining({
      status: 'request_required',
      source: 'short-drama-main-ai-tools',
    }));
  });

  it('includes forbidden actions and approval constraints in agent-facing tool catalogs', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const mainCatalog = tools.listToolCatalog({ actorRole: 'orchestrator' });
    const videoCatalog = tools.listToolCatalog({ actorRole: 'video', stage: 'video' });

    expect(mainCatalog).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      forbiddenActions: expect.arrayContaining([
        'read_full_chat_history',
        'overwrite_prompt_revision_history',
        'access_raw_media_without_media_summary_tool',
        'delete_artifacts_or_media',
      ]),
      tools: expect.arrayContaining([
        expect.objectContaining({
          name: 'deleteShortDramaArtifact',
          access: 'deny',
          reason: expect.stringContaining('Deletion requires'),
        }),
      ]),
    }));
    expect(videoCatalog).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      forbiddenActions: expect.arrayContaining([
        'modify_other_stage_without_main_ai_dispatch',
        'dispatch_other_specialist_agents',
        'bypass_revision_attempt_history',
      ]),
      tools: expect.arrayContaining([
        expect.objectContaining({
          name: 'requestShortDramaGeneration',
          access: 'requiresMainAIApproval',
          reason: expect.stringContaining('Generation can be requested only for the focused artifact'),
        }),
        expect.objectContaining({
          name: 'createShortDramaDispatchPlan',
          access: 'deny',
          reason: expect.stringContaining('Only the main AI'),
        }),
      ]),
    }));
  });

  it('authorizes page-level specialist tool use through the main AI facade', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    expect(typeof tools.authorizeShortDramaToolUse).toBe('function');

    const allowed = tools.authorizeShortDramaToolUse(
      { actorRole: 'video', stage: 'video' },
      {
        tool: 'updateShortDramaArtifactPrompt',
        capability: 'updatePrompt',
        targetScope: 'artifact',
        targetStage: 'video',
      },
    );
    const denied = tools.authorizeShortDramaToolUse(
      { actorRole: 'video', stage: 'video' },
      {
        tool: 'updateShortDramaArtifactPrompt',
        capability: 'updatePrompt',
        targetScope: 'artifact',
        targetStage: 'post',
      },
    );
    const generation = tools.authorizeShortDramaToolUse(
      { actorRole: 'video', stage: 'video' },
      {
        tool: 'requestShortDramaGeneration',
        capability: 'requestGeneration',
        targetScope: 'artifact',
        targetStage: 'video',
      },
    );

    expect(allowed).toEqual(expect.objectContaining({
      status: 'allow',
      source: 'short-drama-main-ai-tools',
    }));
    expect(denied).toEqual(expect.objectContaining({
      status: 'deny',
      source: 'short-drama-main-ai-tools',
      error: expect.objectContaining({
        code: 'stage_mismatch',
      }),
    }));
    expect(generation).toEqual(expect.objectContaining({
      status: 'requires_approval',
      source: 'short-drama-main-ai-tools',
      reason: expect.stringContaining('Generation can be requested only'),
    }));
  });

  it('exposes callable scaffold tools for page-level specialist agents', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    expect(typeof tools.createShortDramaAttempt).toBe('function');
    expect(typeof tools.requestShortDramaReview).toBe('function');
    expect(typeof tools.requestShortDramaGeneration).toBe('function');

    const attempt = tools.createShortDramaAttempt({
      artifactId: 'episode-02-video-01',
      userInstruction: '请重新生成第二集视频，镜头运动放慢。',
      source: 'stageAgent',
      timestamp: 1701,
    });
    const review = tools.requestShortDramaReview({
      artifactId: 'episode-02-video-01',
      finding: '第二集视频缺少冷色宫墙一致性。',
      severity: 'minor',
      retryBudget: 2,
      timestamp: 1702,
    });
    const generation = tools.requestShortDramaGeneration({
      artifactId: 'episode-02-video-01',
      userInstruction: '请用当前视频页焦点生成新版本。',
      timestamp: 1703,
    });

    expect(attempt).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-02-video-01',
      attemptId: 'attempt-episode-02-video-01-1701',
    }));
    expect(attempt.status === 'ready'
      ? attempt.project.artifacts.find(artifact => artifact.id === 'episode-02-video-01')
      : undefined).toEqual(expect.objectContaining({
        status: 'generating',
        attemptCount: 1,
        attempts: expect.arrayContaining([
          expect.objectContaining({
            id: 'attempt-episode-02-video-01-1701',
            status: 'created',
            inputInstruction: '请重新生成第二集视频，镜头运动放慢。',
          }),
        ]),
      }));
    expect(review).toEqual(expect.objectContaining({
      status: 'needsCorrection',
      source: 'short-drama-main-ai-tools',
      review: expect.objectContaining({
        artifactId: 'episode-02-video-01',
        correctionInstruction: expect.stringContaining('第二集视频缺少冷色宫墙一致性'),
      }),
    }));
    expect(generation).toEqual(expect.objectContaining({
      status: 'needs_approval',
      source: 'short-drama-main-ai-tools',
      request: expect.objectContaining({
        artifactId: 'episode-02-video-01',
        stage: 'video',
        userInstruction: '请用当前视频页焦点生成新版本。',
        requiresMainAIApproval: true,
      }),
    }));
  });

  it('exposes dispatch and review scaffold through the main AI facade', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const dispatch = tools.createDispatchPlan({
      userGoal: '继续制作所有未完成产物。',
      approved: true,
    });
    const review = tools.reviewArtifactOutput({
      artifactId: 'episode-02-video-01',
      finding: '第二集视频缺少冷色宫墙一致性。',
      severity: 'minor',
      retryBudget: 2,
      timestamp: 321,
    });

    expect(dispatch).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      plan: expect.objectContaining({
        tasks: expect.arrayContaining([
          expect.objectContaining({
            stage: 'video',
            targetArtifactIds: expect.arrayContaining(['episode-02-video-01']),
          }),
        ]),
      }),
    }));
    expect(review).toEqual(expect.objectContaining({
      status: 'needsCorrection',
      source: 'short-drama-main-ai-tools',
      review: expect.objectContaining({
        correctionInstruction: expect.stringContaining('第二集视频缺少冷色宫墙一致性'),
      }),
    }));
  });

  it('lets the main AI search and read script segments without scanning the markdown UI', () => {
    const base = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools({
      ...base,
      scriptDocument: {
        kind: 'markdown',
        content: [
          '# 第1集',
          '宫门夜雨。',
          '',
          '# 第2集',
          '城外追逐。',
          '## 第4场 街头',
          'Lantern shadow crosses the cold street wall.',
        ].join('\n'),
      },
    });

    const search = tools.searchScriptSegments({
      episodeNumber: 2,
      sceneNumber: 4,
      text: 'cold street',
    });
    const read = tools.readScriptSegment('EP02-SC04', { tokenBudget: 6 });

    expect(search).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      results: [
        expect.objectContaining({
          id: 'script-segment-episode-02-scene-04',
          handle: 'EP02-SC04',
        }),
      ],
    }));
    expect(read).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      segment: expect.objectContaining({
        handle: 'EP02-SC04',
      }),
      omittedContext: expect.arrayContaining(['contentOverflow']),
    }));
  });

  it('lets the main AI search all short-drama coordinates through one low-context index', () => {
    const base = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools({
      ...base,
      scriptDocument: {
        kind: 'markdown',
        content: [
          '# 第2集',
          'Outer palace road at night.',
          '## Scene 4 Street chase',
          'A lantern drops near the cold street wall.',
        ].join('\n'),
      },
    });

    const result = tools.searchProjectIndex({
      text: 'street',
      episodeNumber: 2,
      limit: 10,
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      results: expect.arrayContaining([
        expect.objectContaining({
          kind: 'artifact',
          sourceId: 'episode-02-location-street',
        }),
        expect.objectContaining({
          kind: 'media',
          sourceId: 'episode-02-video-01',
        }),
        expect.objectContaining({
          kind: 'scriptSegment',
          handle: 'EP02-SC04',
        }),
      ]),
    }));
    expect(JSON.stringify(result)).not.toContain('/short-drama-static/final-preview.mp4');
  });

  it('lets the main AI validate derived index integrity before relying on media search results', () => {
    const base = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools({
      ...base,
      artifacts: [
        ...base.artifacts,
        {
          id: 'episode-99-orphan-video',
          episodeId: 'episode-99',
          stage: 'video',
          type: 'video',
          title: 'Orphan video',
          summary: 'Video points at missing coordinates.',
          agentRole: 'video',
          status: 'ready',
          revisionCount: 0,
          attemptCount: 0,
          attempts: [],
          revisions: [],
          mediaReference: { mediaItemId: 'media-orphan-video', kind: 'video', label: 'Orphan video' },
          dependsOn: ['missing-storyboard'],
        },
      ],
    });

    const integrity = tools.validateProjectIntegrity();

    expect(integrity).toEqual(expect.objectContaining({
      status: 'issues',
      source: 'short-drama-main-ai-tools',
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'episode_missing',
          artifactId: 'episode-99-orphan-video',
        }),
        expect.objectContaining({
          code: 'media_playback_missing',
          relatedId: 'media-orphan-video',
        }),
      ]),
    }));
    expect(JSON.stringify(integrity)).not.toContain('/short-drama-static/final-preview.mp4');
    expect(JSON.stringify(integrity)).not.toContain('data:image/svg+xml');
  });

  it('lets the main AI locate demo media from Chinese user-facing references', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const streetImage = tools.searchProjectIndex({
      text: '第二集街头那张图',
      kind: 'artifact',
      limit: 3,
    });
    const finalPreview = tools.searchProjectIndex({
      text: '后期第一集成片',
      kind: 'artifact',
      limit: 3,
    });
    const leadCharacter = tools.searchProjectIndex({
      text: '女主角色图',
      kind: 'artifact',
      limit: 3,
    });

    expect(streetImage).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      results: expect.arrayContaining([
        expect.objectContaining({
          sourceId: 'episode-02-location-street',
          handle: 'LOC-01',
        }),
      ]),
    }));
    expect(finalPreview).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      results: expect.arrayContaining([
        expect.objectContaining({
          sourceId: 'episode-01-post-final',
          handle: 'EP01-POST01',
        }),
      ]),
    }));
    expect(leadCharacter).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      results: expect.arrayContaining([
        expect.objectContaining({
          sourceId: 'episode-01-character-guard',
          handle: 'CHAR-01',
        }),
      ]),
    }));
  });

  it('lets the main AI resolve natural language targets through the structured facade', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);
    const videoWorkspace = tools.listStageWorkspaces({
      selectedStage: 'video',
      activeEpisodeId: 'episode-01',
    });
    const focusedWorkspace = videoWorkspace.status === 'ready'
      ? tools.setStageFocus(videoWorkspace.workspaces.find(workspace => workspace.stage === 'video')!, {
          stage: 'video',
          artifactIdOrHandle: 'EP01-VID01',
          source: 'mainAI',
        })
      : undefined;

    const streetImage = tools.resolveNaturalLanguageTarget({ text: '第二集街头那张图' });
    const currentShot = focusedWorkspace?.status === 'ready'
      ? tools.resolveNaturalLanguageTarget({
          text: '这个镜头太慢',
          workspace: focusedWorkspace.workspace,
        })
      : undefined;

    expect(streetImage).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      query: expect.objectContaining({
        stage: 'assets',
        episodeNumber: 2,
        mediaKind: 'image',
      }),
      candidates: expect.arrayContaining([
        expect.objectContaining({
          sourceId: 'episode-02-location-street',
          handle: 'LOC-01',
        }),
      ]),
    }));
    expect(currentShot).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      focusedArtifactId: 'episode-01-video-01',
      candidates: [
        expect.objectContaining({
          sourceId: 'episode-01-video-01',
          handle: 'EP01-VID01',
        }),
      ],
    }));
  });

  it('lets the main AI resolve and focus a natural-language post final slot', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const focused = tools.focusNaturalLanguageTarget({
      text: '第三集后期成片',
      limit: 5,
    });

    expect(focused).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-03-post-placeholder',
      handle: 'EP03-POST01',
      stage: 'post',
      episodeId: 'episode-03',
      scrollTargetId: 'short-drama-artifact-episode-03-post-placeholder',
      workspace: expect.objectContaining({
        stage: 'post',
        activeEpisodeId: 'episode-03',
        activeArtifactId: 'episode-03-post-placeholder',
        activeArtifactHandle: 'EP03-POST01',
      }),
    }));
  });

  it('lets the main AI optimize a natural-language target through revision history', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const optimized = tools.optimizeNaturalLanguageTarget(
      { text: '第三集后期成片', limit: 5 },
      {
        userInstruction: '给第三集后期成片补一个字幕成片占位，保持当前后期节奏。',
        reason: 'User asked to improve the specified post-production final slot.',
        source: 'mainAI',
        timestamp: 1301,
        markDownstream: true,
      },
    );

    expect(optimized).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-03-post-placeholder',
      revisionId: 'revision-episode-03-post-placeholder-1301',
      workspace: expect.objectContaining({
        stage: 'post',
        activeEpisodeId: 'episode-03',
        activeArtifactId: 'episode-03-post-placeholder',
        activeArtifactHandle: 'EP03-POST01',
        lastFocusSource: 'mainAI',
      }),
    }));
    const nextProject = optimized.status === 'ready' ? optimized.project : project;
    expect(nextProject.artifacts.find(artifact => artifact.id === 'episode-03-post-placeholder')).toEqual(expect.objectContaining({
      status: 'revising',
      revisionCount: 1,
      attemptCount: 1,
      prompt: expect.objectContaining({
        positive: '给第三集后期成片补一个字幕成片占位，保持当前后期节奏。',
      }),
    }));
  });

  it('returns explicit specialist context errors for unknown artifacts', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const context = tools.getSpecialistContext('EP99-VID01');

    expect(context).toEqual(expect.objectContaining({
      status: 'not_found',
      source: 'short-drama-main-ai-tools',
    }));
  });

  it('lets the main AI locate and focus a right-panel artifact by media item id', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const location = tools.locateArtifact({
      mediaItemId: 'media-post-final-01',
      limit: 10,
    });
    const focused = tools.focusArtifact({
      mediaItemId: 'media-post-final-01',
      limit: 10,
    });

    expect(location).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-01-post-final',
      handle: 'EP01-POST01',
      stage: 'post',
      episodeId: 'episode-01',
      scrollTargetId: 'short-drama-artifact-episode-01-post-final',
    }));
    expect(focused).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-01-post-final',
      handle: 'EP01-POST01',
      workspace: expect.objectContaining({
        stage: 'post',
        activeEpisodeId: 'episode-01',
        activeArtifactId: 'episode-01-post-final',
        activeArtifactHandle: 'EP01-POST01',
        activeMedia: expect.objectContaining({
          mediaItemId: 'media-post-final-01',
          playable: true,
        }),
      }),
    }));
  });

  it('returns explicit errors from the facade instead of empty UI states', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const missingRead = tools.readArtifact({ idOrHandle: 'EP99-VID01' });
    const missingImpact = tools.previewImpact('EP99-VID01');

    expect(missingRead).toEqual(expect.objectContaining({
      status: 'not_found',
      source: 'short-drama-main-ai-tools',
    }));
    expect(missingImpact).toEqual(expect.objectContaining({
      status: 'not_found',
      source: 'short-drama-main-ai-tools',
    }));
  });
});
