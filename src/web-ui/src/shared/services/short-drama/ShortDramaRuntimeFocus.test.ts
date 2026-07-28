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

  it('keeps overlapping focus writes ordered so an older selection cannot win last', async () => {
    const project = createShortDramaStaticProject();
    const files = new Map<string, string>();
    const writeValues: string[] = [];
    let markFirstWriteStarted!: () => void;
    const firstWriteStarted = new Promise<void>((resolve) => {
      markFirstWriteStarted = resolve;
    });
    let releaseFirstWrite!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const adapter: ShortDramaManifestAdapter = {
      kind: 'local',
      async exists(key) {
        return files.has(key);
      },
      async read(key) {
        return files.get(key);
      },
      async write(key, value) {
        writeValues.push(value);
        if (writeValues.length === 1) {
          markFirstWriteStarted();
          await firstWrite;
        }
        files.set(key, value);
      },
    };

    const olderRequest = writeShortDramaRuntimeFocus(adapter, project, {
      workspaceRoot: 'C:/workspace/drama',
      activeStage: 'script',
      activeArtifactHandle: 'EP01-SCR01',
      selectionSource: 'right-panel',
    });
    const latestRequest = writeShortDramaRuntimeFocus(adapter, project, {
      workspaceRoot: 'C:/workspace/drama',
      activeStage: 'video',
      activeArtifactHandle: 'EP01-VID01',
      selectionSource: 'right-panel',
    });

    await firstWriteStarted;
    expect(writeValues).toHaveLength(1);

    releaseFirstWrite();
    await expect(olderRequest).resolves.toMatchObject({ status: 'ready' });
    await expect(latestRequest).resolves.toMatchObject({ status: 'ready' });
    expect(writeValues).toHaveLength(2);
    expect(JSON.parse(files.get('.void/short-drama/focus.json') ?? '{}')).toMatchObject({
      activeStage: 'video',
      activeArtifactHandle: 'EP01-VID01',
    });
  });
});
