import type { ShortDramaLibraryState } from './ShortDramaTypes';

export type ShortDramaProjectLoadResult =
  | {
      status: 'ready';
      source: 'project-load';
      state: ShortDramaLibraryState;
    }
  | {
      status: 'stale';
      source: 'project-load';
    }
  | {
      status: 'failed';
      source: 'project-load';
      error: unknown;
    };

export interface ShortDramaProjectLoadCoordinator {
  load(
    loader: () => Promise<ShortDramaLibraryState>,
  ): Promise<ShortDramaProjectLoadResult>;
  invalidate(): void;
}

/**
 * Owns latest-wins ordering for initial and event-triggered project loads.
 * Presentation code consumes the typed result and never applies a stale load.
 */
export function createShortDramaProjectLoadCoordinator():
  ShortDramaProjectLoadCoordinator {
  let requestEpoch = 0;

  return {
    async load(loader) {
      const currentEpoch = ++requestEpoch;
      try {
        const state = await loader();
        return currentEpoch === requestEpoch
          ? { status: 'ready', source: 'project-load', state }
          : { status: 'stale', source: 'project-load' };
      } catch (error) {
        return currentEpoch === requestEpoch
          ? { status: 'failed', source: 'project-load', error }
          : { status: 'stale', source: 'project-load' };
      }
    },
    invalidate() {
      requestEpoch += 1;
    },
  };
}
