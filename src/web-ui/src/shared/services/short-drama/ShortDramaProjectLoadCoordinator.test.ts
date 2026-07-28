import { describe, expect, it, vi } from 'vitest';

import {
  createShortDramaProjectLoadCoordinator,
} from './ShortDramaProjectLoadCoordinator';
import type { ShortDramaLibraryState } from './ShortDramaTypes';

describe('ShortDramaProjectLoadCoordinator', () => {
  it('applies only the newest project load when an older request resolves last', async () => {
    const coordinator = createShortDramaProjectLoadCoordinator();
    let resolveFirst!: (state: ShortDramaLibraryState) => void;
    const firstLoad = new Promise<ShortDramaLibraryState>((resolve) => {
      resolveFirst = resolve;
    });
    const firstRequest = coordinator.load(() => firstLoad);
    const latestState: ShortDramaLibraryState = {
      status: 'empty',
      source: 'manifest',
      reason: 'no_project',
    };

    await expect(
      coordinator.load(async () => latestState),
    ).resolves.toEqual({
      status: 'ready',
      source: 'project-load',
      state: latestState,
    });

    resolveFirst({
      status: 'error',
      source: 'manifest',
      error: { code: 'load_failed', message: 'stale failure' },
    });
    await expect(firstRequest).resolves.toEqual({
      status: 'stale',
      source: 'project-load',
    });
  });

  it('invalidates an outstanding request when its presentation unmounts', async () => {
    const coordinator = createShortDramaProjectLoadCoordinator();
    let resolveLoad!: (state: ShortDramaLibraryState) => void;
    const load = new Promise<ShortDramaLibraryState>((resolve) => {
      resolveLoad = resolve;
    });
    const request = coordinator.load(() => load);

    coordinator.invalidate();
    resolveLoad({
      status: 'empty',
      source: 'manifest',
      reason: 'no_project',
    });

    await expect(request).resolves.toEqual({
      status: 'stale',
      source: 'project-load',
    });
  });

  it('keeps the latest load error typed instead of throwing into the panel', async () => {
    const coordinator = createShortDramaProjectLoadCoordinator();
    const error = new Error('disk unavailable');
    const load = vi.fn(async (): Promise<ShortDramaLibraryState> => {
      throw error;
    });

    await expect(coordinator.load(load)).resolves.toEqual({
      status: 'failed',
      source: 'project-load',
      error,
    });
  });
});
