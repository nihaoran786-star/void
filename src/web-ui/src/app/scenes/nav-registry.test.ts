import { describe, expect, it } from 'vitest';
import { getSceneNav } from './nav-registry';

describe('scene navigation registry', () => {
  it.each(['settings', 'file-viewer', 'shell', 'git'] as const)(
    'registers the owned navigation for %s',
    sceneId => {
      expect(getSceneNav(sceneId)).not.toBeNull();
    },
  );

  it('keeps scenes without a dedicated navigation on MainNav', () => {
    expect(getSceneNav('session')).toBeNull();
  });
});
