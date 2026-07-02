import { describe, expect, it } from 'vitest';

import { createShortDramaStaticProject } from './ShortDramaStaticProject';
import { writeShortDramaRuntimeFocus } from './ShortDramaRuntimeFocus';
import type { ShortDramaManifestAdapter } from './ShortDramaTypes';

function createMemoryAdapter(): ShortDramaManifestAdapter & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    kind: 'local',
    files,
    async exists(key) {
      return files.has(key);
    },
    async read(key) {
      return files.get(key);
    },
    async write(key, value) {
      files.set(key, value);
    },
  };
}

describe('ShortDramaRuntimeFocus', () => {
  it('persists right-panel focus as the runtime focus sidecar for agent tools', async () => {
    const adapter = createMemoryAdapter();
    const project = createShortDramaStaticProject();

    const result = await writeShortDramaRuntimeFocus(adapter, project, {
      workspaceRoot: 'C:/workspace/drama',
      activeStage: 'video',
      activeEpisodeId: 'episode-01',
      activeArtifactHandle: 'EP01-VID01',
      activeMediaItemId: 'media-video-01',
      selectionSource: 'right-panel',
    });

    expect(result.status).toBe('ready');
    expect(adapter.files.has('.void/short-drama/focus.json')).toBe(true);
    expect(JSON.parse(adapter.files.get('.void/short-drama/focus.json') ?? '{}')).toEqual({
      workspaceRoot: 'C:/workspace/drama',
      projectPath: 'C:/workspace/drama/.void/short-drama',
      activeStage: 'video',
      activeEpisodeId: 'episode-01',
      activeArtifactHandle: 'EP01-VID01',
      activeMediaItemId: 'media-video-01',
      selectionSource: 'right-panel',
    });
  });
});
