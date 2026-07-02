import { describe, expect, it } from 'vitest';

import {
  createShortDramaAssetUsageGraph,
  createShortDramaStaticProject,
  previewShortDramaArtifactPromptImpact,
  updateShortDramaArtifactPrompt,
} from './index';
import type { ShortDramaProject } from './ShortDramaTypes';

describe('ShortDramaArtifactRevisionWorkflow', () => {
  it('updates an artifact prompt through a revision instead of overwriting history', () => {
    const project = createShortDramaStaticProject();

    const result = updateShortDramaArtifactPrompt(project, {
      idOrHandle: 'EP01-VID01',
      patch: {
        summary: 'Slow the first push-in and keep the handheld break sharper.',
        prompt: {
          motion: 'slower ceremonial push-in, abrupt handheld threat break',
        },
      },
      reason: 'User asked the first video shot to feel less rushed.',
      userInstruction: '这个镜头太快，前半段慢一点，后半段威胁感更强。',
      source: 'mainAI',
      timestamp: 42,
    });

    expect(result.status).toBe('ready');
    const nextArtifact = result.status === 'ready'
      ? result.project.artifacts.find(artifact => artifact.id === 'episode-01-video-01')
      : undefined;
    const originalArtifact = project.artifacts.find(artifact => artifact.id === 'episode-01-video-01');

    expect(originalArtifact?.summary).toContain('Slow push');
    expect(nextArtifact).toEqual(expect.objectContaining({
      status: 'revising',
      summary: 'Slow the first push-in and keep the handheld break sharper.',
      prompt: { motion: 'slower ceremonial push-in, abrupt handheld threat break' },
      revisionCount: (originalArtifact?.revisionCount ?? 0) + 1,
      attemptCount: (originalArtifact?.attemptCount ?? 0) + 1,
    }));
    expect(nextArtifact?.revisions.at(-1)).toEqual(expect.objectContaining({
      id: 'revision-episode-01-video-01-42',
      previousRevisionId: originalArtifact?.revisions.at(-1)?.id,
      changedFields: ['summary', 'prompt.motion'],
      reason: 'User asked the first video shot to feel less rushed.',
      userInstruction: '这个镜头太快，前半段慢一点，后半段威胁感更强。',
      source: 'mainAI',
    }));
    expect(nextArtifact?.attempts.at(-1)).toEqual(expect.objectContaining({
      id: 'attempt-episode-01-video-01-42',
      revisionId: 'revision-episode-01-video-01-42',
      inputInstruction: '这个镜头太快，前半段慢一点，后半段威胁感更强。',
      status: 'created',
    }));
  });

  it('marks direct and transitive downstream artifacts stale or reviewing when requested', () => {
    const base = createShortDramaStaticProject();
    const project: ShortDramaProject = {
      ...base,
      artifacts: base.artifacts.map(artifact => (
        artifact.id === 'episode-01-video-01'
          ? { ...artifact, dependsOn: ['episode-01-storyboard-01'] }
          : artifact.id === 'episode-01-post-voice'
            ? { ...artifact, dependsOn: ['episode-01-video-01'] }
            : artifact
      )),
    };

    const result = updateShortDramaArtifactPrompt(project, {
      idOrHandle: 'episode-01-storyboard-01',
      patch: { prompt: { positive: 'stronger diagonal threat composition' } },
      reason: 'Storyboard composition drifted from the script.',
      userInstruction: '这个分镜构图偏了，重新加强斜向威胁。',
      source: 'stageAgent',
      timestamp: 99,
      markDownstream: true,
    });

    expect(result.status).toBe('ready');
    const nextProject = result.status === 'ready' ? result.project : project;

    expect(result.status === 'ready' ? result.impact.items.find(item => item.artifactId === 'episode-01-video-01') : undefined)
      .toEqual(expect.objectContaining({ recommendation: 'regenerate' }));
    expect(nextProject.artifacts.find(artifact => artifact.id === 'episode-01-video-01')).toEqual(expect.objectContaining({
      status: 'stale',
      statusReason: 'Shot 01-03 video render depends on Scene 01 shots 01-03.',
    }));
    expect(nextProject.artifacts.find(artifact => artifact.id === 'episode-01-post-voice')).toEqual(expect.objectContaining({
      status: 'reviewing',
      statusReason: 'Lead dialogue voice pass is affected through downstream dependency on Scene 01 shots 01-03.',
    }));
  });

  it('previews impact without mutating the project before user approval', () => {
    const project = createShortDramaStaticProject();

    const impact = previewShortDramaArtifactPromptImpact(project, 'episode-01-character-guard');

    expect(impact.status).toBe('ready');
    expect(impact.items.find(item => item.artifactId === 'episode-01-storyboard-01')).toEqual(expect.objectContaining({
      recommendation: 'regenerate',
      reason: 'Scene 01 shots 01-03 depends on Chai Yong character reference.',
    }));
    expect(project.artifacts.find(artifact => artifact.id === 'episode-01-storyboard-01')?.status).toBe('ready');
  });

  it('builds a global asset usage graph from asset anchors to downstream artifacts', () => {
    const base = createShortDramaStaticProject();
    const project: ShortDramaProject = {
      ...base,
      artifacts: base.artifacts.map(artifact => (
        artifact.id === 'episode-01-video-01'
          ? { ...artifact, dependsOn: ['episode-01-storyboard-01', 'episode-01-character-guard'] }
          : artifact
      )),
    };

    const graph = createShortDramaAssetUsageGraph(project);

    expect(graph.find(entry => entry.assetId === 'episode-01-character-guard')).toEqual(expect.objectContaining({
      assetHandle: 'CHAR-01',
      assetType: 'character',
      usedBy: expect.arrayContaining([
        expect.objectContaining({
          artifactId: 'episode-01-storyboard-01',
          artifactHandle: 'EP01-SB01',
          usageType: 'visual_reference',
          confidence: 1,
        }),
        expect.objectContaining({
          artifactId: 'episode-01-video-01',
          artifactHandle: 'EP01-VID01',
          usageType: 'continuity_requirement',
          confidence: 1,
        }),
      ]),
    }));
  });

  it('returns explicit missing artifact state for prompt updates', () => {
    const project = createShortDramaStaticProject();

    const result = updateShortDramaArtifactPrompt(project, {
      idOrHandle: 'EP99-VID01',
      patch: { summary: 'No-op' },
      reason: 'Missing artifact test.',
      userInstruction: 'missing',
      source: 'user',
      timestamp: 1,
    });

    expect(result.status).toBe('not_found');
  });
});
