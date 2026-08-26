import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { StylePresetCatalog, stylePresetCatalog } from './StylePresetCatalog';

const webUiPublicDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../public',
);

// Conversion conservation counts (K1-a exit gate): the converted data must
// keep exactly the entry counts of the kunpeng sources. A change here means
// the conversion lost or invented entries and is an acceptance failure.
const EXPECTED_COUNTS = {
  cinematic: 67,
  'animation-2d': 94,
  midjourney: 84,
  'mg-motion': 72,
} as const;
const EXPECTED_TOTAL = 67 + 94 + 84 + 72; // 317
const EXPECTED_PROMPT_DOCS = 13;

describe('StylePresetCatalog', () => {
  const catalog = stylePresetCatalog;

  it('conserves the converted entry counts per family and in total', () => {
    for (const [family, count] of Object.entries(EXPECTED_COUNTS)) {
      expect(catalog.listByFamily(family as keyof typeof EXPECTED_COUNTS)).toHaveLength(count);
    }
    expect(catalog.list()).toHaveLength(EXPECTED_TOTAL);
    expect(catalog.listPromptTemplateDocs()).toHaveLength(EXPECTED_PROMPT_DOCS);
  });

  it('has globally unique preset ids and doc ids', () => {
    const presetIds = catalog.list().map((preset) => preset.presetId);
    expect(new Set(presetIds).size).toBe(presetIds.length);

    const docIds = catalog.listPromptTemplateDocs().map((doc) => doc.docId);
    expect(new Set(docIds).size).toBe(docIds.length);
  });

  it('carries schema version, kunpeng MIT origin, and a usable prompt on every preset', () => {
    for (const preset of catalog.list()) {
      expect(preset.schemaVersion).toBe('1');
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.category.length).toBeGreaterThan(0);
      expect(preset.origin.project).toBe('kunpeng');
      expect(preset.origin.license).toBe('MIT');
      expect(preset.origin.sourcePath.length).toBeGreaterThan(0);
      // Every preset must offer at least one prompt payload.
      expect(Boolean(preset.promptTemplate) || Boolean(preset.prompt)).toBe(true);
    }
  });

  it('resolves presets by id and returns undefined for unknown ids', () => {
    const first = catalog.list()[0];
    expect(catalog.getById(first.presetId)).toBe(first);
    expect(catalog.getById('no-such-preset')).toBeUndefined();
    expect(catalog.getPromptTemplateDocById('no-such-doc')).toBeUndefined();
  });

  it('filters by family without leaking other families', () => {
    const midjourney = catalog.listByFamily('midjourney');
    expect(midjourney.every((preset) => preset.family === 'midjourney')).toBe(true);
    expect(midjourney.every((preset) => preset.engineHint === 'midjourney')).toBe(true);

    const mg = catalog.listByFamily('mg-motion');
    expect(mg.every((preset) => preset.family === 'mg-motion')).toBe(true);
  });

  it('filters by family plus category and lists distinct categories', () => {
    const categories = catalog.listCategories('midjourney');
    expect(categories.length).toBeGreaterThan(0);
    const sum = categories
      .map((category) => catalog.listByCategory('midjourney', category).length)
      .reduce((a, b) => a + b, 0);
    expect(sum).toBe(EXPECTED_COUNTS.midjourney);

    // A category from one family must not match inside another family.
    expect(catalog.listByCategory('mg-motion', categories[0])).toHaveLength(0);
  });

  it('resolves prompt template docs by id with group and content intact', () => {
    const docs = catalog.listPromptTemplateDocs();
    const doc = catalog.getPromptTemplateDocById(docs[0].docId);
    expect(doc).toBe(docs[0]);
    for (const entry of docs) {
      expect(entry.content.length).toBeGreaterThan(0);
      expect(entry.origin.project).toBe('kunpeng');
      expect(entry.origin.license).toBe('MIT');
    }
  });

  // P5 W5: the two style-library families ship re-encoded thumbnails under
  // src/web-ui/public/style-presets/. The other two upstream families never had
  // sample images, so their thumbnailRef must stay empty and the picker falls
  // back to the deterministic swatch.
  it('gives every cinematic and animation-2d preset a thumbnail file that really exists', () => {
    for (const family of ['cinematic', 'animation-2d'] as const) {
      const presets = catalog.listByFamily(family);
      expect(presets.length).toBeGreaterThan(0);
      for (const preset of presets) {
        const thumbnailRef = preset.thumbnailRef;
        expect(thumbnailRef, `${preset.presetId} has no thumbnailRef`).toBeTruthy();
        expect(thumbnailRef).toMatch(
          new RegExp(`^style-presets/${family}/[0-9a-f]{16}\\.webp$`),
        );
        const absolutePath = path.join(webUiPublicDirectory, thumbnailRef as string);
        expect(existsSync(absolutePath), `${thumbnailRef} is missing on disk`).toBe(true);
        expect(statSync(absolutePath).size).toBeLessThanOrEqual(48 * 1024);
      }
    }
  });

  it('maps each thumbnail file to exactly one preset', () => {
    const refs = catalog
      .list()
      .map((preset) => preset.thumbnailRef)
      .filter((ref): ref is string => Boolean(ref));
    expect(refs).toHaveLength(EXPECTED_COUNTS.cinematic + EXPECTED_COUNTS['animation-2d']);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it('leaves midjourney and mg-motion presets without a thumbnail', () => {
    for (const family of ['midjourney', 'mg-motion'] as const) {
      for (const preset of catalog.listByFamily(family)) {
        expect(preset.thumbnailRef).toBeUndefined();
      }
    }
  });

  it('supports constructing an isolated catalog over injected data', () => {
    const custom = new StylePresetCatalog(
      [
        {
          presetId: 'cinematic:test-only',
          schemaVersion: '1',
          family: 'cinematic',
          name: '测试预设',
          category: 'live-action',
          promptTemplate: 'test template',
          origin: { project: 'kunpeng', license: 'MIT', sourcePath: 'test' },
        },
      ],
      [],
    );
    expect(custom.list()).toHaveLength(1);
    expect(custom.getById('cinematic:test-only')?.name).toBe('测试预设');
    expect(custom.listPromptTemplateDocs()).toHaveLength(0);
  });
});
