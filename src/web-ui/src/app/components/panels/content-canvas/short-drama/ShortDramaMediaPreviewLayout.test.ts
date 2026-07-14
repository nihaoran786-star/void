import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readSibling(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

function extractBlock(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[\\s\\S]*?)\\n\\s*\\}`));
  return match?.groups?.body ?? '';
}

function extractFunction(source: string, name: string, nextName: string): string {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  return start >= 0 && end > start ? source.slice(start, end) : '';
}

describe('short drama media preview layout', () => {
  it('adapts to the dragged panel width instead of the application viewport', () => {
    const stylesheet = readSibling('./ShortDramaCenterPanel.scss');
    const root = extractBlock(stylesheet, '.short-drama-center');

    expect(root).toContain('container-name: short-drama-panel;');
    expect(root).toContain('container-type: inline-size;');
    expect(stylesheet).toContain('@container short-drama-panel (max-width: 620px)');
    expect(stylesheet).toContain('@container short-drama-panel (max-width: 420px)');
  });

  it('preserves complete main media while allowing compact thumbnails to crop', () => {
    const stylesheet = readSibling('./ShortDramaCenterPanel.scss');
    const mainMedia = extractBlock(
      stylesheet,
      '.short-drama-media-preview:not(.short-drama-media-preview--rail):not(.short-drama-media-preview--row) .short-drama-media-preview__canvas > img,\n.short-drama-media-preview:not(.short-drama-media-preview--rail):not(.short-drama-media-preview--row) .short-drama-media-preview__canvas video',
    );
    const thumbnailMedia = extractBlock(
      stylesheet,
      '.short-drama-media-preview--rail .short-drama-media-preview__canvas > img,\n.short-drama-media-preview--rail .short-drama-media-preview__canvas video,\n.short-drama-media-preview--row .short-drama-media-preview__canvas > img,\n.short-drama-media-preview--row .short-drama-media-preview__canvas video',
    );

    expect(mainMedia).toContain('object-fit: contain;');
    expect(thumbnailMedia).toContain('object-fit: cover;');
    expect(stylesheet).not.toContain('min-height: 236px;');
  });

  it('keeps metadata and native video controls outside the open-preview trigger', () => {
    const source = readSibling('./ShortDramaCenterPanel.tsx');

    expect(source).toContain('className="short-drama-media-preview__canvas"');
    expect(source).toContain('className="short-drama-media-preview__meta"');
    expect(source).toContain('className="short-drama-media-preview__open"');
    expect(source).toContain('onClick={(event) => event.stopPropagation()}');
    expect(source).not.toContain("role={!isRail && mediaUrl ? 'button' : undefined}");
    expect(source).not.toContain('<VideoPosterFrame');
  });

  it('keeps one stable player and never renders videos in the scene rail', () => {
    const source = readSibling('./ShortDramaCenterPanel.tsx');
    const railThumbnail = extractFunction(source, 'VideoRailThumbnail', 'extensionFromPath');

    expect(source).toContain('key={mediaUrl}');
    expect(source).not.toContain("key={`${mediaUrl}:${thumbnailUrl ?? 'no-poster'}`}");
    expect(source).not.toContain('useVideoFirstFrameThumbnail');
    expect(railThumbnail).not.toContain('<video');
  });

  it('uses an accessible horizontal filmstrip after the single main player', () => {
    const source = readSibling('./ShortDramaCenterPanel.tsx');
    const stylesheet = readSibling('./ShortDramaCenterPanel.scss');
    const videoStage = extractFunction(source, 'VideoStage', 'selectVideoPosterArtifact');
    const videoLayout = extractBlock(stylesheet, '.short-drama-center__video');
    const filmstrip = extractBlock(stylesheet, '.short-drama-center__rail');

    expect(videoStage).toContain('role="tablist"');
    expect(videoStage).toContain('role="tab"');
    expect(videoStage).toContain('aria-selected={activeVideo?.id === artifact.id}');
    expect(videoStage.indexOf('className="short-drama-center__stage"'))
      .toBeLessThan(videoStage.indexOf('className="short-drama-center__rail"'));
    expect(videoLayout).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(filmstrip).toContain('grid-auto-flow: column;');
    expect(filmstrip).toContain('overflow-x: auto;');
  });
});
