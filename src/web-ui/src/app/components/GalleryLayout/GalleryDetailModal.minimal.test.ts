import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pathFor = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

const readSource = (relativePath: string): string =>
  readFileSync(pathFor(relativePath), 'utf8').replace(/\r\n/g, '\n');

const sha256 = (relativePath: string): string =>
  createHash('sha256').update(readFileSync(pathFor(relativePath))).digest('hex');

describe('Gallery detail modal Minimal presentation contract', () => {
  const source = readSource('./GalleryDetailModal.minimal.scss');

  it('loads once through the shared Minimal presentation aggregator', () => {
    const aggregator = readSource('../../presentation/minimalWorkspacePresentation.scss');

    expect(aggregator.match(/GalleryDetailModal\.minimal\.scss/g)).toHaveLength(1);
    expect(aggregator.match(/@include gallery-detail-modal\.styles;/g)).toHaveLength(1);
  });

  it('keeps the shared modal behavior and Classic presentation unchanged', () => {
    expect(sha256('./GalleryDetailModal.tsx')).toBe(
      'cadb1cedf8be11ef22a07c9a2984b62e1fb5a49dd6a6fd5acb200ea73c248d00',
    );
    expect(sha256('./GalleryDetailModal.scss')).toBe(
      '876a9b92b817d5a09a92ca7070c483074761dd513959e65a003e55f4258b7aa4',
    );
  });

  it('uses one compact shared surface for every gallery detail owner', () => {
    expect(source).toContain('.void-ui--minimal .modal-overlay:has(.gallery-detail-modal)');
    expect(source).toContain('.void-ui--minimal .modal:has(.gallery-detail-modal)');
    expect(source).toMatch(
      /\.void-ui--minimal \.gallery-detail-modal \{[\s\S]*?gap: var\(--workspace-space-3\);/,
    );
    expect(source).toMatch(
      /&__icon \{[\s\S]*?width: 40px;[\s\S]*?height: 40px;/,
    );
    expect(source).toContain('max-height: min(720px, calc(100vh - 32px));');
    expect(source).toContain('scrollbar-width: thin;');
  });

  it('neutralizes decorative capability colors but preserves their levels', () => {
    expect(source).toMatch(
      /\.agent-card__cap-pip \{[\s\S]*?background: var\(--workspace-border-subtle\) !important;/,
    );
    expect(source).toMatch(
      /\.agent-card__cap-pip\[style\] \{[\s\S]*?background: var\(--workspace-text-secondary\) !important;/,
    );
    expect(source).toMatch(
      /\.agent-card__tab\.is-active|&\.is-active/,
    );
  });

  it('uses shared typography and a single subtle focus treatment', () => {
    expect(source).toContain('font-family: var(--workspace-font-family);');
    expect(source).toContain('font-size: var(--workspace-font-size-label);');
    expect(source).toMatch(
      /&:focus-visible \{[\s\S]*?outline: 1px solid var\(--workspace-focus-ring-subtle\);[\s\S]*?outline-offset: -1px;[\s\S]*?box-shadow: none;/,
    );
  });

  it('removes decorative rendering cost and honors reduced motion', () => {
    expect(source).not.toMatch(/(?:linear|radial|conic)-gradient/i);
    expect(source).not.toMatch(/(?<![\w-])#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/\brgba?\s*\(|\bhsla?\s*\(/i);
    expect(
      [...source.matchAll(/(?:-webkit-)?backdrop-filter:\s*([^;]+);/gi)]
        .map((match) => match[1].trim()),
    ).toEqual(['none', 'none']);
    expect(source).not.toMatch(/transition\s*:\s*all/i);
    expect(source).not.toMatch(/\b(?:translate|scale)\s*\(/i);
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
