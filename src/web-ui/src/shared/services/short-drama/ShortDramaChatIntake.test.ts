import { describe, expect, it } from 'vitest';

import {
  applyShortDramaChatIntakeRoute,
  createShortDramaMainAITools,
  createShortDramaStaticProject,
  routeShortDramaChatIntake,
} from './index';

describe('ShortDramaChatIntake', () => {
  it('routes markdown scripts from the left chat without exposing raw attachment content', () => {
    const project = createShortDramaStaticProject();
    const route = routeShortDramaChatIntake(project, {
      fileName: 'palace-script.md',
      mimeType: 'text/markdown',
      text: [
        '# 第1集',
        '宫门夜雨，女主发现密信。',
        '',
        '# 第2集',
        '城外街头追逐，冷色宫墙延续。',
      ].join('\n'),
      userInstruction: '用这个剧本替换当前短剧剧本。',
      sizeBytes: 2048,
    });

    expect(route).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-chat-intake',
      route: expect.objectContaining({
        kind: 'scriptDocument',
        targetStage: 'script',
        manifestAction: 'updateScriptDocument',
        targetPath: '.void/short-drama/script.md',
        confidence: expect.any(Number),
        recommendedManifestPatch: expect.objectContaining({
          action: 'updateScriptDocument',
          scriptDocument: expect.objectContaining({
            kind: 'markdown',
            filePath: '.void/short-drama/script.md',
          }),
        }),
      }),
    }));
    expect(route.status === 'ready' ? route.route.summary : '').toContain('2 episode headings');
    expect(route.status === 'ready' ? route.route.omittedContext : []).toEqual(expect.arrayContaining([
      'rawAttachmentContent',
    ]));
    expect(JSON.stringify(route)).not.toContain('宫门夜雨，女主发现密信。');
  });

  it('routes image assets by user instruction instead of adding right-panel upload behavior', () => {
    const project = createShortDramaStaticProject();
    const route = routeShortDramaChatIntake(project, {
      fileName: 'hero-reference.png',
      mimeType: 'image/png',
      userInstruction: '这是女主角色图，作为全局资产锚点。',
      sizeBytes: 512_000,
    });

    expect(route).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-chat-intake',
      route: expect.objectContaining({
        kind: 'assetMedia',
        targetStage: 'assets',
        artifactType: 'character',
        manifestAction: 'createArtifactDraft',
        targetPath: '.void/short-drama/media/assets/characters/hero-reference.png',
        recommendedManifestPatch: expect.objectContaining({
          action: 'createArtifactDraft',
          artifactDraft: expect.objectContaining({
            stage: 'assets',
            type: 'character',
            status: 'pending',
            mediaReference: expect.objectContaining({
              kind: 'image',
              label: 'hero-reference.png',
            }),
          }),
        }),
      }),
    }));
  });

  it('routes final cut videos to the post stage and exposes the route through the main AI facade', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);

    const route = tools.routeChatIntake({
      fileName: 'episode-01-final.mp4',
      mimeType: 'video/mp4',
      userInstruction: '第一集后期成片，放到成品预览。',
      sizeBytes: 8_000_000,
    });

    expect(route).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      route: expect.objectContaining({
        kind: 'postMedia',
        targetStage: 'post',
        artifactType: 'video',
        manifestAction: 'attachMediaReference',
        targetPath: '.void/short-drama/media/post/episode-01-final.mp4',
        recommendedManifestPatch: expect.objectContaining({
          action: 'attachMediaReference',
          mediaReference: expect.objectContaining({
            kind: 'video',
            label: 'episode-01-final.mp4',
          }),
        }),
      }),
    }));
  });

  it('returns explicit unsupported status for unknown chat attachments', () => {
    const project = createShortDramaStaticProject();

    const route = routeShortDramaChatIntake(project, {
      fileName: 'archive.zip',
      mimeType: 'application/zip',
      userInstruction: '看看这个能不能用。',
      sizeBytes: 100,
    });

    expect(route).toEqual(expect.objectContaining({
      status: 'unsupported',
      source: 'short-drama-chat-intake',
      error: expect.objectContaining({
        code: 'unsupported_runtime',
      }),
    }));
  });

  it('applies a script route to project state without writing files', () => {
    const project = createShortDramaStaticProject();
    const route = routeShortDramaChatIntake(project, {
      fileName: 'palace-script.md',
      mimeType: 'text/markdown',
      text: '# 第1集\n新剧本内容。',
      userInstruction: '替换剧本。',
    });

    const applied = applyShortDramaChatIntakeRoute(project, route);

    expect(applied).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-chat-intake',
      project: expect.objectContaining({
        scriptDocument: expect.objectContaining({
          kind: 'markdown',
          filePath: '.void/short-drama/script.md',
        }),
      }),
    }));
    expect(applied.status === 'ready' ? applied.project.scriptDocument?.content : undefined).toBe('');
  });

  it('applies an asset media route as a pending asset artifact draft', () => {
    const project = createShortDramaStaticProject();
    const route = routeShortDramaChatIntake(project, {
      fileName: 'hero-reference.png',
      mimeType: 'image/png',
      userInstruction: '女主角色图。',
    });

    const applied = applyShortDramaChatIntakeRoute(project, route);

    expect(applied).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-chat-intake',
      artifactId: 'chat-intake-asset-hero-reference',
    }));
    const nextProject = applied.status === 'ready' ? applied.project : project;
    expect(nextProject.artifacts.find(artifact => artifact.id === 'chat-intake-asset-hero-reference')).toEqual(expect.objectContaining({
      stage: 'assets',
      type: 'character',
      title: 'hero reference',
      status: 'pending',
      mediaReference: expect.objectContaining({
        kind: 'image',
        label: 'hero-reference.png',
      }),
    }));
  });

  it('applies a post video route through the main AI facade to the active episode final preview', () => {
    const project = createShortDramaStaticProject();
    const tools = createShortDramaMainAITools(project);
    const route = tools.routeChatIntake({
      fileName: 'episode-01-final.mp4',
      mimeType: 'video/mp4',
      userInstruction: '第一集后期成片。',
    });

    const applied = tools.applyChatIntakeRoute(route);

    expect(applied).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-main-ai-tools',
      artifactId: 'episode-01-post-final',
    }));
    const nextProject = applied.status === 'ready' ? applied.project : project;
    expect(nextProject.artifacts.find(artifact => artifact.id === 'episode-01-post-final')).toEqual(expect.objectContaining({
      mediaReference: expect.objectContaining({
        mediaItemId: 'static_short_drama_001-episode-01-final-draft',
        kind: 'video',
        label: 'episode-01-final.mp4',
      }),
      status: 'revising',
    }));
  });
});
