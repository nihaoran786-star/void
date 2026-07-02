import {
  createShortDramaAgentTaskDispatchAdapter,
  type ShortDramaAgentTaskSessionSender,
} from './ShortDramaAgentTaskDispatchAdapter';
import { createShortDramaManifestLibraryService } from './ShortDramaProjectViewModel';
import {
  createShortDramaStaticProject,
  ensureShortDramaStaticPlaceholderEpisodes,
} from './ShortDramaStaticProject';
import type {
  ShortDramaAgentTaskDispatchResult,
  ShortDramaAgentTaskRequest,
  ShortDramaLibraryState,
  ShortDramaManifestAdapter,
  ShortDramaManifestState,
  ShortDramaProject,
} from './ShortDramaTypes';

export interface ShortDramaDefaultLibraryService {
  loadProject(workspacePath?: string): Promise<ShortDramaLibraryState>;
  saveProject(project: ShortDramaProject): Promise<ShortDramaManifestState>;
  dispatchAgentTasks(requests: ShortDramaAgentTaskRequest[]): Promise<ShortDramaAgentTaskDispatchResult>;
}

export interface ShortDramaDefaultLibraryServiceOptions {
  demoMode?: boolean;
  staticEpisodeCount?: number;
  sessionSender?: ShortDramaAgentTaskSessionSender;
}

export function createShortDramaDefaultLibraryService(
  adapter: ShortDramaManifestAdapter,
  projectId: string,
  options: ShortDramaDefaultLibraryServiceOptions = {},
): ShortDramaDefaultLibraryService {
  const manifestService = createShortDramaManifestLibraryService(adapter, projectId);
  const dispatchAdapter = createShortDramaAgentTaskDispatchAdapter({ sessionSender: options.sessionSender });

  return {
    async loadProject(workspacePath?: string) {
      const manifestState = await manifestService.loadProject(workspacePath);
      if (manifestState.status === 'ready') {
        return {
          ...manifestState,
          project: ensureShortDramaStaticPlaceholderEpisodes(manifestState.project),
        };
      }
      if (manifestState.status !== 'empty') {
        return manifestState;
      }

      if (!workspacePath?.trim()) {
        return {
          status: 'unsupported',
          source: 'static',
          error: { code: 'missing_workspace', message: 'A workspace is required to load the short drama center.' },
        };
      }

      if (!options.demoMode) {
        return manifestState;
      }

      return {
        status: 'ready',
        source: 'static',
        project: createShortDramaStaticProject({ episodeCount: options.staticEpisodeCount }),
        loadedAt: Date.now(),
      };
    },

    saveProject(project) {
      return manifestService.saveProject(project);
    },

    dispatchAgentTasks(requests) {
      return dispatchAdapter.dispatchAgentTasks(requests);
    },
  };
}
