import { describe, expect, it } from 'vitest';
import type { ContextItem } from '@/shared/types/context';
import {
  composerPresentationToAccessibleText,
  composerPresentationToValue,
  createComposerPresentation,
  parseComposerPresentation,
} from './composerPresentation';
import { createSkillPromptReferenceToken } from './skillPromptReference';

const image: ContextItem = {
  id: 'image-1',
  timestamp: 1,
  type: 'image',
  imagePath: 'D:/work/cat.png',
  imageName: 'cat.png',
  fileSize: 42,
  mimeType: 'image/png',
  dataUrl: 'data:image/png;base64,huge',
  thumbnailUrl: 'blob:huge',
  source: 'file',
  isLocal: true,
};

describe('composerPresentation', () => {
  it('preserves ordered text, file/image, Skill, media and session segments', () => {
    const file: ContextItem = {
      id: 'file-1', timestamp: 1, type: 'file', filePath: 'D:/work/a.ts', fileName: 'a.ts',
    };
    const session: ContextItem = {
      id: 'session-1', timestamp: 1, type: 'session-reference',
      sessionId: 's-1', sessionTitle: 'Research', workspacePath: 'D:/work',
    };
    const skill = createSkillPromptReferenceToken('audit');
    const value = `Review #file:a.ts with ${skill} then #session:Research`;
    const presentation = createComposerPresentation(value, [file, session]);

    expect(presentation.segments.map(segment => segment.type)).toEqual([
      'text', 'context', 'text', 'skill', 'text', 'context',
    ]);
    expect(composerPresentationToValue(presentation)).toBe(value);
    expect(composerPresentationToAccessibleText(presentation)).toContain('[Skill: audit]');
  });

  it('strips image payloads while retaining restorable path and name', () => {
    const presentation = createComposerPresentation('look', [image]);
    const json = JSON.stringify(presentation);
    expect(json).not.toContain('base64');
    expect(json).not.toContain('thumbnailUrl');
    expect(json).toContain('D:/work/cat.png');
    expect(parseComposerPresentation(JSON.parse(json))).toEqual(presentation);
  });

  it('strictly rejects unsupported versions and malformed segments', () => {
    expect(parseComposerPresentation({ version: 2, segments: [] })).toBeNull();
    expect(parseComposerPresentation({ version: 1, segments: [{ type: 'magic' }] })).toBeNull();
  });

  it('does not drop duplicate context labels', () => {
    const first: ContextItem = {
      id: 'file-1', timestamp: 1, type: 'file', filePath: 'D:/one/a.ts', fileName: 'a.ts',
    };
    const second: ContextItem = {
      id: 'file-2', timestamp: 2, type: 'file', filePath: 'D:/two/a.ts', fileName: 'a.ts',
    };
    const presentation = createComposerPresentation(
      '#file:a.ts and #file:a.ts',
      [first, second],
    );

    expect(presentation.segments.filter(segment => segment.type === 'context'))
      .toHaveLength(2);
  });

  it('keeps overlapping context tokens attached to the correct files', () => {
    const short: ContextItem = {
      id: 'file-short', timestamp: 1, type: 'file', filePath: 'D:/a', fileName: 'a',
    };
    const long: ContextItem = {
      id: 'file-long', timestamp: 2, type: 'file', filePath: 'D:/a.ts', fileName: 'a.ts',
    };
    const presentation = createComposerPresentation(
      '#file:a then #file:a.ts',
      [short, long],
    );
    const contextIds = presentation.segments
      .filter((segment): segment is Extract<typeof segment, { type: 'context' }> =>
        segment.type === 'context')
      .map(segment => segment.context.id);

    expect(contextIds).toEqual(['file-short', 'file-long']);
  });
});
