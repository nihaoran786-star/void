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
});
