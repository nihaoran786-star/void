/**
 * The short-drama runtime bridge, listening whether or not anyone is looking
 * at the short-drama tab.
 *
 * `connectShortDramaRuntimeBridgeToEventBus` had exactly one caller: an effect
 * inside `ShortDramaCenterPanel`. That is the wrong lifetime for it. The
 * commonest way an owned asset gets a new picture is the user standing on the
 * CANVAS tab and pressing generate, and in that situation the short-drama
 * panel is usually unmounted. The backend still attached the asset's
 * coordinates, the provider was still paid, and the finished event still
 * arrived on the bus — with nobody subscribed. The picture never came home,
 * and nothing anywhere said so.
 *
 * So the subscription is installed once for the application, at the same layer
 * as `ensureInfiniteCanvasDirectMediaJobEventForwarder`, and no longer depends
 * on a component being mounted. The panel's own effect is gone; it learns
 * about the write the way it already learns about every other write, by
 * reloading on `short-drama:project-changed`.
 *
 * Two things make an always-on listener affordable:
 *
 *  1. **A synchronous pre-filter.** `agent:tool-run-event` carries every tool
 *     run in the app. A payload with no short-drama coordinates is dropped
 *     before anything touches the disk.
 *  2. **A fresh read per event.** No project is cached between events, so
 *     there is no stale copy to overwrite the manifest with — the panel's
 *     in-memory project problem is not recreated here. Events that survive the
 *     pre-filter are rare enough that one read each is not worth optimising.
 *
 * Handling is serialized: two completions arriving together must not both read
 * the project, append to it, and write it back. The manifest writer's own save
 * queue would order the two writes, but not the two reads.
 */
import { globalEventBus } from '@/infrastructure/event-bus';
import { workspaceManager } from '@/infrastructure/services/business/workspaceManager';
import { createLogger } from '@/shared/utils/logger';

import { emitShortDramaProjectChanged } from './ShortDramaProjectChangedEvent';
import { createShortDramaManifestLibraryService } from './ShortDramaProjectViewModel';
import {
  createShortDramaRuntimeBridge,
  handleShortDramaSubagentSessionLinkedPayload,
  handleShortDramaToolRunPayload,
  payloadCarriesShortDramaMetadata,
  type ShortDramaRuntimeEventBus,
} from './ShortDramaRuntimeBridge';
import type { ShortDramaManifestState, ShortDramaProject } from './ShortDramaTypes';
import { createShortDramaProjectPath } from './ShortDramaWorkspaceBinding';
import { createShortDramaWorkspaceManifestAdapter } from './ShortDramaWorkspaceManifestAdapter';

const log = createLogger('ShortDramaRuntimeBridgeSubscription');

/**
 * One workspace holds exactly one `.void/short-drama/manifest.json`, and the
 * reader ignores this id when resolving the file. Passed anyway, matching what
 * the panel and the canvas reader pass, so the three cannot drift apart.
 */
const SHORT_DRAMA_PROJECT_ID = 'static_short_drama_001';

export interface ShortDramaRuntimeBridgeSubscriptionOptions {
  eventBus?: ShortDramaRuntimeEventBus;
  /** The workspace whose project these events belong to, read per event. */
  resolveWorkspacePath?: () => string | undefined;
  loadProject?: (workspacePath: string) => Promise<ShortDramaProject | undefined>;
  saveProject?: (
    workspacePath: string,
    project: ShortDramaProject,
  ) => Promise<ShortDramaManifestState>;
  notifyProjectChanged?: (workspacePath: string) => void;
}

function defaultResolveWorkspacePath(): string | undefined {
  // Read per event rather than captured at install time: the user may switch
  // workspaces, and a picture must come home to the project it belongs to.
  return workspaceManager.getState().currentWorkspace?.rootPath?.trim() || undefined;
}

function libraryService(workspacePath: string) {
  return createShortDramaManifestLibraryService(
    createShortDramaWorkspaceManifestAdapter(workspacePath),
    SHORT_DRAMA_PROJECT_ID,
  );
}

async function defaultLoadProject(workspacePath: string): Promise<ShortDramaProject | undefined> {
  try {
    const state = await libraryService(workspacePath).loadProject(workspacePath);
    return state.status === 'ready' ? state.project : undefined;
  } catch {
    return undefined;
  }
}

function defaultSaveProject(workspacePath: string, project: ShortDramaProject) {
  return libraryService(workspacePath).saveProject(project);
}

function defaultNotifyProjectChanged(workspacePath: string) {
  emitShortDramaProjectChanged({
    workspaceRoot: workspacePath,
    projectPath: createShortDramaProjectPath(workspacePath),
    action: 'update_artifact',
    projectState: 'ready',
    source: 'ShortDramaProject',
  });
}

/**
 * Subscribes for as long as the returned disposer is not called. Exported for
 * tests and for anyone who needs a scoped instance;
 * {@link ensureShortDramaRuntimeBridgeSubscription} is what the application
 * uses.
 */
export function connectShortDramaRuntimeBridgeToWorkspace(
  options: ShortDramaRuntimeBridgeSubscriptionOptions = {},
): () => void {
  const eventBus = options.eventBus ?? globalEventBus;
  const resolveWorkspacePath = options.resolveWorkspacePath ?? defaultResolveWorkspacePath;
  const loadProject = options.loadProject ?? defaultLoadProject;
  const saveProject = options.saveProject ?? defaultSaveProject;
  const notifyProjectChanged = options.notifyProjectChanged ?? defaultNotifyProjectChanged;

  let queue: Promise<unknown> = Promise.resolve();

  const runWithProject = (
    handle: (
      bridge: ReturnType<typeof createShortDramaRuntimeBridge>,
      workspacePath: string,
    ) => Promise<unknown>,
  ) => {
    queue = queue.then(async () => {
      const workspacePath = resolveWorkspacePath();
      if (!workspacePath) {
        return;
      }
      const project = await loadProject(workspacePath);
      if (!project) {
        return;
      }
      let changed = false;
      const bridge = createShortDramaRuntimeBridge({
        project,
        saveProject: next => {
          changed = true;
          return saveProject(workspacePath, next);
        },
      });
      await handle(bridge, workspacePath);
      if (changed) {
        notifyProjectChanged(workspacePath);
      }
    }).catch(error => {
      log.warn('Short drama runtime event could not be applied', { error });
    });
    return queue;
  };

  const unsubscribers = [
    eventBus.on('agent:subagent-session-linked', event => {
      if (!payloadCarriesShortDramaMetadata(event)) {
        return;
      }
      void runWithProject(bridge => handleShortDramaSubagentSessionLinkedPayload(bridge, event));
    }),
    eventBus.on('agent:tool-run-event', event => {
      // The cheap gate: this lane carries every tool run in the app, and only
      // the ones wearing short-drama coordinates are worth a manifest read.
      if (!payloadCarriesShortDramaMetadata(event)) {
        return;
      }
      void runWithProject(bridge => handleShortDramaToolRunPayload(bridge, event));
    }),
  ];

  return () => {
    unsubscribers.forEach(unsubscribe => unsubscribe());
  };
}

let installed: (() => void) | undefined;

/**
 * Installs the application-wide subscription once. Safe to call from anywhere
 * that might be the first to need it; later calls do nothing.
 */
export function ensureShortDramaRuntimeBridgeSubscription(
  options: ShortDramaRuntimeBridgeSubscriptionOptions = {},
): void {
  if (installed) {
    return;
  }
  installed = connectShortDramaRuntimeBridgeToWorkspace(options);
}

/** Test seam: forgets the installed subscription without unsubscribing twice. */
export function resetShortDramaRuntimeBridgeSubscription(): void {
  installed?.();
  installed = undefined;
}
