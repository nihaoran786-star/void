import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SCENE_TAB_REGISTRY } from './registry';

const pathFor = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

const readLocale = (locale: 'en-US' | 'zh-CN' | 'zh-TW') =>
  JSON.parse(
    readFileSync(pathFor(`../../locales/${locale}/common.json`), 'utf8'),
  ) as { scenes: Record<string, string> };

describe('scene registry localization contract', () => {
  const expectedKeys = new Map([
    ['terminal', 'scenes.terminal'],
    ['git', 'scenes.git'],
    ['settings', 'scenes.settings'],
    ['file-viewer', 'scenes.fileViewer'],
    ['profile', 'scenes.projectContext'],
  ]);

  it('routes shared scene labels through the existing common namespace', () => {
    for (const [id, labelKey] of expectedKeys) {
      expect(SCENE_TAB_REGISTRY.find(scene => scene.id === id)?.labelKey).toBe(labelKey);
    }
  });

  it.each(['en-US', 'zh-CN', 'zh-TW'] as const)(
    'keeps every shared title available in %s',
    locale => {
      const resource = readLocale(locale);

      for (const labelKey of expectedKeys.values()) {
        const key = labelKey.replace('scenes.', '');
        expect(resource.scenes[key]).toEqual(expect.any(String));
        expect(resource.scenes[key].trim()).not.toBe('');
      }
    },
  );
});
