import { describe, expect, it, vi } from 'vitest';

import {
  SHORT_DRAMA_PROJECT_CHANGED_EVENT,
  connectShortDramaProjectChangedEventsToToolRunBus,
  isShortDramaProjectChangedForWorkspace,
  parseToolRunShortDramaProjectChangedEvent,
  resolveShortDramaProjectChangedForWorkspace,
  type ShortDramaProjectChangedEvent,
} from './ShortDramaProjectChangedEvent';

describe('ShortDramaProjectChangedEvent', () => {
  it('parses short drama project changed events from runtime tool result payloads', () => {
    const changed: ShortDramaProjectChangedEvent = {
      workspaceRoot: 'C:/workspace',
      projectPath: 'C:/workspace/.void/short-drama',
      action: 'initialize_from_script',
      projectState: 'indexed',
      schemaKind: 'ui-envelope-v1',
      source: 'ShortDramaProject',
    };

    expect(parseToolRunShortDramaProjectChangedEvent({
      result: {
        data: {
          shortDramaProjectChanged: changed,
        },
      },
    })).toEqual(changed);
  });

  it('compares project change events against the current workspace using normalized paths', () => {
    expect(isShortDramaProjectChangedForWorkspace({
      workspaceRoot: 'C:/workspace',
      projectPath: 'C:/workspace/.void/short-drama',
      action: 'set_focus',
      projectState: 'ready',
      source: 'ShortDramaProject',
    }, 'C:\\workspace\\')).toBe(true);
  });

  it('ignores project events emitted for another active workspace', () => {
    expect(resolveShortDramaProjectChangedForWorkspace({
      workspaceRoot: 'C:/workspace-b',
      projectPath: 'C:/workspace-b/.void/short-drama',
      action: 'update_artifact',
      projectState: 'ready',
      source: 'ShortDramaProject',
    }, 'C:/workspace-a')).toEqual({
      status: 'ignore',
      source: 'project-changed-event',
      reason: 'different_workspace',
    });
  });

  it('reports a typed mismatch when the event project path escapes the active workspace project', () => {
    expect(resolveShortDramaProjectChangedForWorkspace({
      workspaceRoot: 'C:/workspace',
      projectPath: 'C:/other/.void/short-drama',
      action: 'update_artifact',
      projectState: 'ready',
      source: 'ShortDramaProject',
    }, 'C:/workspace')).toEqual(expect.objectContaining({
      status: 'mismatch',
      source: 'project-changed-event',
      binding: expect.objectContaining({
        status: 'mismatch',
        error: expect.objectContaining({ code: 'workspace_mismatch' }),
      }),
    }));
  });

  it('bridges tool-run events into the typed short drama project changed event', () => {
    const handlers = new Map<string, (event: unknown) => void>();
    const emit = vi.fn();
    const eventBus = {
      on: vi.fn((eventName: string, handler: (event: unknown) => void) => {
        handlers.set(eventName, handler);
        return () => handlers.delete(eventName);
      }),
      emit,
    };
    const changed: ShortDramaProjectChangedEvent = {
      workspaceRoot: 'C:/workspace',
      projectPath: 'C:/workspace/.void/short-drama',
      action: 'update_artifact',
      projectState: 'ready',
      source: 'ShortDramaProject',
    };

    connectShortDramaProjectChangedEventsToToolRunBus(eventBus);
    handlers.get('agent:tool-run-event')?.({ shortDramaProjectChanged: changed });

    expect(emit).toHaveBeenCalledWith(SHORT_DRAMA_PROJECT_CHANGED_EVENT, changed);
  });
});
