import { globalEventBus } from '@/infrastructure/event-bus';
import { areShortDramaWorkspacePathsEqual } from './ShortDramaWorkspaceBinding';

export const SHORT_DRAMA_PROJECT_CHANGED_EVENT = 'short-drama:project-changed';

export type ShortDramaProjectChangedAction =
  | 'initialize_from_script'
  | 'update_artifact'
  | 'set_focus'
  | 'rebuild_indexes'
  | 'change_request';

export type ShortDramaProjectChangedState =
  | 'no_project'
  | 'empty'
  | 'script_ready'
  | 'indexed'
  | 'ready'
  | 'error';

export interface ShortDramaProjectChangedEvent {
  workspaceRoot: string;
  projectPath: string;
  action: ShortDramaProjectChangedAction;
  projectState: ShortDramaProjectChangedState;
  schemaKind?: string;
  source: 'ShortDramaProject';
}

export interface ShortDramaProjectChangedEventBus {
  on(eventName: typeof SHORT_DRAMA_PROJECT_CHANGED_EVENT | 'agent:tool-run-event', handler: (event: unknown) => void): () => void;
  emit?(eventName: typeof SHORT_DRAMA_PROJECT_CHANGED_EVENT, event: ShortDramaProjectChangedEvent): void;
}

export function emitShortDramaProjectChanged(
  event: ShortDramaProjectChangedEvent,
  eventBus: ShortDramaProjectChangedEventBus = globalEventBus,
) {
  eventBus.emit?.(SHORT_DRAMA_PROJECT_CHANGED_EVENT, event);
}

export function onShortDramaProjectChanged(
  handler: (event: ShortDramaProjectChangedEvent) => void,
  eventBus: ShortDramaProjectChangedEventBus = globalEventBus,
) {
  return eventBus.on(SHORT_DRAMA_PROJECT_CHANGED_EVENT, event => {
    const parsed = parseShortDramaProjectChangedEvent(event);
    if (parsed) {
      handler(parsed);
    }
  });
}

export function parseShortDramaProjectChangedEvent(event: unknown): ShortDramaProjectChangedEvent | undefined {
  const record = event as Record<string, unknown> | undefined;
  if (!record || typeof record !== 'object') {
    return undefined;
  }

  const workspaceRoot = record.workspaceRoot;
  const projectPath = record.projectPath;
  const action = record.action;
  const projectState = record.projectState;
  const source = record.source;
  if (
    typeof workspaceRoot !== 'string'
    || typeof projectPath !== 'string'
    || !isShortDramaProjectChangedAction(action)
    || !isShortDramaProjectChangedState(projectState)
    || source !== 'ShortDramaProject'
  ) {
    return undefined;
  }

  const schemaKind = typeof record.schemaKind === 'string'
    ? record.schemaKind
    : undefined;

  return { workspaceRoot, projectPath, action, projectState, schemaKind, source };
}

export function isShortDramaProjectChangedForWorkspace(
  event: ShortDramaProjectChangedEvent,
  workspacePath?: string,
) {
  return areShortDramaWorkspacePathsEqual(event.workspaceRoot, workspacePath);
}

export function connectShortDramaProjectChangedEventsToToolRunBus(
  eventBus: ShortDramaProjectChangedEventBus = globalEventBus,
) {
  return eventBus.on('agent:tool-run-event', event => {
    const parsed = parseToolRunShortDramaProjectChangedEvent(event);
    if (parsed) {
      emitShortDramaProjectChanged(parsed, eventBus);
    }
  });
}

export function parseToolRunShortDramaProjectChangedEvent(event: unknown): ShortDramaProjectChangedEvent | undefined {
  const payload = event as Record<string, unknown> | undefined;
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  return parseShortDramaProjectChangedEvent(payload.shortDramaProjectChanged)
    ?? parseShortDramaProjectChangedEvent(getRecord(payload.result)?.shortDramaProjectChanged)
    ?? parseShortDramaProjectChangedEvent(getRecord(payload.data)?.shortDramaProjectChanged)
    ?? parseShortDramaProjectChangedEvent(getRecord(getRecord(payload.result)?.data)?.shortDramaProjectChanged);
}

function isShortDramaProjectChangedAction(value: unknown): value is ShortDramaProjectChangedAction {
  return value === 'initialize_from_script'
    || value === 'update_artifact'
    || value === 'set_focus'
    || value === 'rebuild_indexes'
    || value === 'change_request';
}

function isShortDramaProjectChangedState(value: unknown): value is ShortDramaProjectChangedState {
  return value === 'no_project'
    || value === 'empty'
    || value === 'script_ready'
    || value === 'indexed'
    || value === 'ready'
    || value === 'error';
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
