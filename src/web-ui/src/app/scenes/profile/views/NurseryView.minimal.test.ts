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

const sha256Text = (source: string): string =>
  createHash('sha256').update(source).digest('hex');

describe('Nursery Minimal presentation contract', () => {
  const source = readSource('./NurseryView.minimal.scss');

  it('loads once through the lazy Nursery feature stylesheet', () => {
    const owner = readSource('./NurseryView.scss');

    expect(owner.match(/@use '\.\/NurseryView\.minimal' as minimal;/g)).toHaveLength(1);
    expect(owner.match(/@include minimal\.styles;/g)).toHaveLength(1);
    expect(readSource('../../../presentation/minimalWorkspacePresentation.scss'))
      .not.toContain('NurseryView.minimal.scss');
  });

  it('keeps gallery behavior and pre-existing Classic presentation unchanged', () => {
    const projectionFreeClassic = readSource('./NurseryView.scss')
      .replace("@use './NurseryView.minimal' as minimal;\n", '')
      .replace('\n\n@include minimal.styles;\n', '\n');

    expect(sha256Text(projectionFreeClassic)).toBe(
      '0a4ff738e71becc5f98d32504fb79015376e203c95f87c14b9330e0cf4e5e777',
    );
    expect(sha256('./NurseryView.tsx')).toBe(
      '16732b9a3c98db38eb1b0d7e5f76921003b2df25cf645d081c5fcd9f5710c044',
    );
    expect(sha256('./NurseryGallery.tsx')).toBe(
      '591398a73f4b41e2e751a76655e647591345bcfcad6ba655daba5c18d131f816',
    );
    expect(sha256('./AssistantQuickInput.tsx')).toBe(
      'cc5ee4a14460bdea0e7b582634b8fba729364d6c18b24fba0e4829257568c54d',
    );
  });

  it('routes the Automation handoff through the canonical scene interface', () => {
    const assistantConfig = readSource('./AssistantConfigPage.tsx');

    expect(assistantConfig).toContain(
      "const openScene = useSceneStore((state) => state.openScene);",
    );
    expect(assistantConfig).toContain("openScene('automation');");
    expect(assistantConfig).toContain('onClick={handleOpenAutomation}');
    expect(assistantConfig).not.toContain('useSceneManager');
  });

  it('scopes all presentation changes to Minimal Nursery surfaces', () => {
    expect(source).toContain('@mixin styles {');
    expect(source).toContain('.void-ui--minimal {');
    expect(source).not.toMatch(/\n {2}\.(?:nursery|acp|aqi)/);
  });

  it('uses a compact graphic-free configuration header', () => {
    expect(source).toMatch(
      /\.nursery-template-brand-mark \{[\s\S]*?display: none;/,
    );
    expect(source).toMatch(
      /\.nursery-template-hero \{[\s\S]*?min-height: 112px;[\s\S]*?background: var\(--workspace-surface-panel\);/,
    );
    expect(source).not.toContain('/visuals/void-robot-hero.webp');
    expect(source).toMatch(
      /\.nursery-template-card \{[\s\S]*?width: 100%;[\s\S]*?background: transparent;[\s\S]*?border: 0;/,
    );
    expect(source).toMatch(
      /\.nursery-template-card__content \{[\s\S]*?grid-template-areas:[\s\S]*?width: 100%;/,
    );
    expect(source).toMatch(
      /\.nursery-template-card__action \{[\s\S]*?display: inline-flex;[\s\S]*?background: var\(--workspace-surface-raised\);/,
    );
    expect(source).toMatch(
      /\.nursery-template-card__deco \{[\s\S]*?display: none;/,
    );
  });

  it('keeps large assistant collections compact and incrementally renderable', () => {
    expect(source).toMatch(
      /\.nursery-gallery \{[\s\S]*?\.gallery-grid \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    );
    expect(source).toMatch(
      /\.assistant-card \{[\s\S]*?height: 132px;[\s\S]*?content-visibility: auto;[\s\S]*?contain-intrinsic-size: auto 132px;/,
    );
    expect(source).toMatch(
      /\.assistant-card__vibe \{[\s\S]*?-webkit-line-clamp: 1;/,
    );
    expect(source).toMatch(
      /\.assistant-card__footer-hint \{[\s\S]*?display: none;/,
    );
  });

  it('collapses the assistant grid to one shrink-safe column on narrow windows', () => {
    expect(source).toMatch(
      /@media \(max-width: 900px\) \{[\s\S]*?\.void-ui--minimal \.nursery-gallery \{[\s\S]*?\.gallery-grid \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/,
    );
  });

  it('uses the workspace typography and a single compact composer treatment', () => {
    expect(source).toContain('font-family: var(--workspace-font-family);');
    expect(source).toContain('font-size: var(--workspace-font-size-title);');
    expect(source).toMatch(
      /\.aqi__embed\.void-textarea \.void-textarea__field \{[\s\S]*?min-height: 56px;/,
    );
    expect(source).toMatch(/\.aqi__hint \{[\s\S]*?display: none;/);
    expect(source).toMatch(
      /&:focus-within \{[\s\S]*?border-color: var\(--workspace-focus-ring-subtle\);[\s\S]*?outline: none;/,
    );
  });

  it('keeps the Automation handoff action on one line at narrow panel widths', () => {
    expect(source).toMatch(
      /\.acp-automation-entry__action\.btn \{[\s\S]*?flex-shrink: 0;[\s\S]*?white-space: nowrap;/,
    );
    expect(source).toMatch(
      /\.acp-automation-entry \{[\s\S]*?background: transparent;[\s\S]*?border: 0;[\s\S]*?border-radius: 0;/,
    );
    expect(source).toMatch(
      /\.acp-left-header__meta \{[\s\S]*?flex-wrap: nowrap;[\s\S]*?overflow: hidden;/,
    );
    expect(source).toMatch(
      /\.acp-left-header__meta-tag \{[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/,
    );
    expect(source).toMatch(
      /@media \(max-width: 1080px\)[\s\S]*?\.acp-layout \{[\s\S]*?flex-direction: column;/,
    );
  });

  it('removes decorative rendering cost and layout-motion feedback', () => {
    expect(source).not.toMatch(/(?:linear|radial|conic)-gradient/i);
    expect(source).not.toMatch(/(?<![\w-])#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/\brgba?\s*\(|\bhsla?\s*\(/i);
    expect(source).not.toMatch(/(?:-webkit-)?backdrop-filter/i);
    expect(source).not.toMatch(/\bbox-shadow\s*:/i);
    expect(source).not.toMatch(/\b(?:translate|scale)\s*\(/i);
    expect(source).not.toMatch(/transition\s*:\s*all/i);
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('provides localized quick-message copy without changing the sender component', () => {
    const simplifiedChinese = JSON.parse(
      readSource('../../../../locales/zh-CN/flow-chat.json'),
    ) as { input: { assistantPlaceholder: string; sendHint: string } };
    const traditionalChinese = JSON.parse(
      readSource('../../../../locales/zh-TW/flow-chat.json'),
    ) as { input: { assistantPlaceholder: string; sendHint: string } };
    const english = JSON.parse(
      readSource('../../../../locales/en-US/flow-chat.json'),
    ) as { input: { assistantPlaceholder: string; sendHint: string } };

    expect(simplifiedChinese.input.assistantPlaceholder).toBe('给 {{name}} 发送消息…');
    expect(simplifiedChinese.input.sendHint).toBe('回车发送 · Shift+回车换行');
    expect(traditionalChinese.input.assistantPlaceholder).toBe('給 {{name}} 發送消息…');
    expect(english.input.assistantPlaceholder).toBe('Message {{name}}…');
  });
});
