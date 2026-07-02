import { describe, expect, it } from 'vitest';

import {
  createShortDramaArtifactChangeExplanation,
  createShortDramaProjectAuditLog,
  createShortDramaStaticProject,
  updateShortDramaArtifactPrompt,
} from './index';

describe('ShortDramaAuditLog', () => {
  it('explains why a short-drama artifact changed without exposing raw media payloads', () => {
    const base = createShortDramaStaticProject();
    const update = updateShortDramaArtifactPrompt(base, {
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
    const project = update.status === 'ready' ? update.project : base;

    const explanation = createShortDramaArtifactChangeExplanation(project, 'CHAR-01');

    expect(explanation).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-audit-log',
      artifactId: 'episode-01-character-guard',
      handle: 'CHAR-01',
      currentStatus: 'revising',
      summary: expect.stringContaining('User asked to mature the lead character'),
      events: expect.arrayContaining([
        expect.objectContaining({
          type: 'revision',
          source: 'mainAI',
          title: 'Revision 3',
          reason: 'User asked to mature the lead character while preserving continuity.',
          userInstruction: '女主角色图更成熟一点，但不要换人。',
        }),
        expect.objectContaining({
          type: 'attempt',
          title: 'Attempt 4',
          status: 'created',
          relatedRevisionId: 'revision-episode-01-character-guard-456',
        }),
        expect.objectContaining({
          type: 'impact',
          title: 'Downstream impact',
          affectedArtifactIds: expect.arrayContaining(['episode-01-storyboard-01']),
        }),
        expect.objectContaining({
          type: 'media',
          title: 'Media reference',
          mediaItemId: 'media-image-hero',
          mediaKind: 'image',
          previewState: 'available',
        }),
      ]),
      omittedContext: expect.arrayContaining(['rawMediaPayloads']),
    }));
    expect(JSON.stringify(explanation)).not.toContain('data:image/svg+xml');
    expect(JSON.stringify(explanation)).not.toContain('/short-drama-static/final-preview.mp4');
  });

  it('returns an explicit not_found explanation state for unknown handles', () => {
    const project = createShortDramaStaticProject();

    const explanation = createShortDramaArtifactChangeExplanation(project, 'EP99-VID01');

    expect(explanation).toEqual(expect.objectContaining({
      status: 'not_found',
      source: 'short-drama-audit-log',
      error: expect.objectContaining({
        code: 'artifact_missing',
      }),
    }));
  });

  it('lists recent project-level artifact changes for main AI review without raw payloads', () => {
    const base = createShortDramaStaticProject();
    const update = updateShortDramaArtifactPrompt(base, {
      idOrHandle: 'CHAR-01',
      patch: {
        prompt: {
          positive: 'same guard, stronger silhouette, consistent red robe',
        },
      },
      reason: 'User asked to keep the lead character consistent.',
      userInstruction: '女主角色图保持统一。',
      source: 'mainAI',
      timestamp: 789,
      markDownstream: true,
    });
    const project = update.status === 'ready' ? update.project : base;

    const audit = createShortDramaProjectAuditLog(project, {
      stage: 'assets',
      limit: 5,
    });

    expect(audit).toEqual(expect.objectContaining({
      status: 'ready',
      source: 'short-drama-audit-log',
      projectId: 'static_short_drama_001',
      query: {
        stage: 'assets',
        limit: 5,
      },
      entries: expect.arrayContaining([
        expect.objectContaining({
          artifactId: 'episode-01-character-guard',
          handle: 'CHAR-01',
          stage: 'assets',
          latestEventType: 'revision',
          latestReason: 'User asked to keep the lead character consistent.',
          actor: 'mainAI',
          affectedArtifactIds: expect.arrayContaining(['episode-01-storyboard-01']),
          omittedContext: expect.arrayContaining(['rawMediaPayloads', 'fullPromptHistory']),
        }),
      ]),
    }));
    expect(JSON.stringify(audit)).not.toContain('data:image/svg+xml');
    expect(JSON.stringify(audit)).not.toContain('/short-drama-static/final-preview.mp4');
  });
});
