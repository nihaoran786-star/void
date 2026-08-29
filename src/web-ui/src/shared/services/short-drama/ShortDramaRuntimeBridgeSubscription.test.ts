import { describe, expect, it, vi } from 'vitest';

import { connectShortDramaRuntimeBridgeToWorkspace } from './ShortDramaRuntimeBridgeSubscription';
import { createShortDramaStaticProject } from './ShortDramaProjectViewModel';
import type { ShortDramaProject } from './ShortDramaTypes';

const WORKSPACE = 'C:/work';

function fakeBus() {
  const handlers = new Map<string, Array<(event: unknown) => void>>();
  return {
    bus: {
      on(name: 'agent:subagent-session-linked' | 'agent:tool-run-event', handler: (event: unknown) => void) {
        const list = handlers.get(name) ?? [];
        list.push(handler);
        handlers.set(name, list);
        return () => {
          handlers.set(name, (handlers.get(name) ?? []).filter(item => item !== handler));
        };
      },
    },
    emit(name: string, event: unknown) {
      (handlers.get(name) ?? []).forEach(handler => handler(event));
    },
    count(name: string) {
      return (handlers.get(name) ?? []).length;
    },
  };
}

function harness(overrides: { project?: ShortDramaProject; workspacePath?: string | undefined } = {}) {
  const project = overrides.project ?? createShortDramaStaticProject();
  const saved: ShortDramaProject[] = [];
  const changed: string[] = [];
  const bus = fakeBus();
  const loadProject = vi.fn(async () => project);
  const dispose = connectShortDramaRuntimeBridgeToWorkspace({
    eventBus: bus.bus,
    resolveWorkspacePath: () => ('workspacePath' in overrides ? overrides.workspacePath : WORKSPACE),
    loadProject,
    saveProject: async (_workspacePath, next) => {
      saved.push(next);
      return { status: 'ready', source: 'manifest', project: next };
    },
    notifyProjectChanged: workspacePath => { changed.push(workspacePath); },
  });
  return { project, saved, changed, bus, loadProject, dispose };
}

function completedEvent(project: ShortDramaProject) {
  const artifact = project.artifacts.find(item => item.mediaReference?.kind === 'image')!;
  return {
    artifact,
    payload: {
      eventType: 'Completed',
      toolId: 'tool-run-1',
      result: {
        shortDrama: {
          projectId: project.projectId,
          artifactId: artifact.id,
          runId: 'run-canvas-1',
          outputMediaItemId: 'media_batch_77-1',
          outputMediaKind: 'image',
          outputMediaPath: `${WORKSPACE}/media/generated/media_batch_77/image-001.png`,
          outputMediaRelativePath: 'media/generated/media_batch_77/image-001.png',
        },
      },
    },
  };
}

describe('short drama runtime bridge subscription (F2)', () => {
  it('lands a completed run with no short-drama panel mounted anywhere', async () => {
    // The whole point: nothing here renders, nothing here holds a project.
    const { project, saved, changed, bus, dispose } = harness();
    const { artifact, payload } = completedEvent(project);

    bus.emit('agent:tool-run-event', payload);
    await vi.waitFor(() => expect(saved).toHaveLength(1));

    const updated = saved[0].artifacts.find(item => item.id === artifact.id)!;
    expect(updated.status).toBe('reviewing');
    expect(updated.mediaReference?.mediaItemId).toBe('media_batch_77-1');
    expect(updated.revisions.at(-1)?.mediaItemId).toBe('media_batch_77-1');
    // And the panel, whenever it comes back, is told to reload.
    expect(changed).toEqual([WORKSPACE]);
    dispose();
  });

  it('does not read the manifest for tool runs that carry no coordinates', async () => {
    const { loadProject, saved, bus, dispose } = harness();

    bus.emit('agent:tool-run-event', {
      eventType: 'Completed',
      toolId: 'some-other-tool',
      result: { batch: { batch_id: 'b1' } },
    });
    await Promise.resolve();

    expect(loadProject).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
    dispose();
  });

  it('re-reads the project for every event instead of holding a stale copy', async () => {
    const { project, loadProject, saved, bus, dispose } = harness();
    const { payload } = completedEvent(project);

    bus.emit('agent:tool-run-event', payload);
    bus.emit('agent:tool-run-event', {
      ...payload,
      result: {
        shortDrama: {
          ...(payload.result.shortDrama as Record<string, unknown>),
          runId: 'run-canvas-2',
          outputMediaItemId: 'media_batch_78-1',
          outputMediaRelativePath: 'media/generated/media_batch_78/image-001.png',
        },
      },
    });
    await vi.waitFor(() => expect(saved).toHaveLength(2));

    expect(loadProject).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('does nothing at all when no workspace is open', async () => {
    const { project, saved, bus, dispose } = harness({ workspacePath: undefined });
    const { payload } = completedEvent(project);

    bus.emit('agent:tool-run-event', payload);
    await Promise.resolve();
    await Promise.resolve();

    expect(saved).toHaveLength(0);
    dispose();
  });

  it('unsubscribes both lanes when disposed', () => {
    const { bus, dispose } = harness();
    expect(bus.count('agent:tool-run-event')).toBe(1);
    expect(bus.count('agent:subagent-session-linked')).toBe(1);
    dispose();
    expect(bus.count('agent:tool-run-event')).toBe(0);
    expect(bus.count('agent:subagent-session-linked')).toBe(0);
  });
});
