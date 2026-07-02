import { describe, expect, it } from 'vitest';
import type { ImageContext, PullRequestContext } from '@/shared/types/context';
import { formatContextForPrompt } from './contextPrompt';

describe('formatContextForPrompt', () => {
  it('includes remote id for pull request contexts', () => {
    const context: PullRequestContext = {
      id: 'pr-1',
      type: 'pull-request',
      label: 'PR #42 overview',
      section: 'overview',
      content: 'Review this change.',
      remoteId: 'origin-github',
      repository: 'owner/repo',
      pullRequestNumber: 42,
      pullRequestTitle: 'Fix bug',
      sourceUrl: 'https://example.com/owner/repo/pull/42',
      timestamp: 123,
    };

    const rendered = formatContextForPrompt(context);

    expect(rendered).toContain('Remote ID: origin-github');
    expect(rendered).toContain('Repository: owner/repo');
    expect(rendered).toContain('Pull Request: #42 Fix bug');
    expect(rendered).toContain('URL: https://example.com/owner/repo/pull/42');
  });

  it('formats pull request CI contexts', () => {
    const context: PullRequestContext = {
      id: 'pr-ci-1',
      type: 'pull-request',
      label: 'PR #42 CI',
      section: 'ci',
      content: 'Checks: 2/3 passed, 1 failed, 0 pending',
      remoteId: 'origin-github',
      repository: 'owner/repo',
      pullRequestNumber: 42,
      pullRequestTitle: 'Fix bug',
      timestamp: 123,
    };

    const rendered = formatContextForPrompt(context);

    expect(rendered).toContain('[Pull Request Context: PR #42 CI]');
    expect(rendered).toContain('Section: ci');
    expect(rendered).toContain('Checks: 2/3 passed, 1 failed, 0 pending');
  });

  it('formats image contexts with tool-readable paths', () => {
    const context: ImageContext = {
      id: 'img-1',
      type: 'image',
      imagePath: 'C:/repo/.void/media/uploads/reference.jpg',
      imageName: 'reference.jpg',
      fileSize: 123,
      mimeType: 'image/jpeg',
      source: 'file',
      isLocal: true,
      timestamp: 123,
    };

    const rendered = formatContextForPrompt(context);

    expect(rendered).toContain('[Image: reference.jpg]');
    expect(rendered).toContain('Path: C:/repo/.void/media/uploads/reference.jpg');
    expect(rendered).toContain('Image ID: img-1');
  });

  it('formats data-url image contexts with image names and ids', () => {
    const context: ImageContext = {
      id: 'img-data-1',
      type: 'image',
      imagePath: '',
      imageName: 'thor-reference.png',
      fileSize: 123,
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,abc123',
      source: 'file',
      isLocal: false,
      timestamp: 123,
    };

    const rendered = formatContextForPrompt(context);

    expect(rendered).toContain('[Image: thor-reference.png]');
    expect(rendered).toContain('Image ID: img-data-1');
    expect(rendered).not.toContain('Path:');
  });
});
