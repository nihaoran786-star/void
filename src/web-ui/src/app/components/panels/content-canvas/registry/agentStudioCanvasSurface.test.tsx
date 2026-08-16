import { beforeEach, describe, expect, it } from 'vitest';

import type { CanvasSurfaceDefinition } from '@/shared/services/canvas/CanvasSurfaceContracts';
import { CanvasSurfaceRegistry } from '@/shared/services/canvas/CanvasSurfaceRegistry';
import { CanvasSurfaceService } from '@/shared/services/canvas/CanvasSurfaceService';
import {
  resetAgentCanvasWorkspaceSnapshotsForTests,
  switchAgentCanvasWorkspace,
  useAgentCanvasStore,
} from '../stores/canvasStore';
import { createCanvasStoreHostAdapter } from './CanvasStoreHostAdapter';
import { CanvasSurfaceRendererRegistry } from './CanvasSurfaceRendererRegistry';
import { AGENT_STUDIO_SURFACE_ID } from './CanvasSurfaceIds';
import { registerFirstPartyCanvasSurfaces } from './firstPartyCanvasSurfaces';

const LOCAL_WORKSPACE = {
  status: 'ready',
  workspaceId: 'workspace-agent-studio',
  workspacePath: 'C:/agent-studio',
  backend: 'local',
} as const;

function activate() {
  const surfaces = new CanvasSurfaceRegistry<CanvasSurfaceDefinition>();
  const renderers = new CanvasSurfaceRendererRegistry();
  const activation = registerFirstPartyCanvasSurfaces(surfaces, renderers);
  const service = new CanvasSurfaceService(
    surfaces,
    createCanvasStoreHostAdapter({
      ...useAgentCanvasStore.getState(),
      isRequestCurrent: () => true,
    }),
  );
  switchAgentCanvasWorkspace(null, LOCAL_WORKSPACE.workspaceId);
  return { surfaces, renderers, activation, service };
}

describe('agent-studio Canvas surface', () => {
  beforeEach(() => {
    resetAgentCanvasWorkspaceSnapshotsForTests();
    useAgentCanvasStore.getState().reset();
  });

  it('registers alongside the other first-party surfaces and disposes with them', () => {
    const { surfaces, activation } = activate();

    expect(activation.status).toBe('active');
    expect(surfaces.resolve(AGENT_STUDIO_SURFACE_ID)).toBeDefined();

    activation.dispose();
    expect(surfaces.resolve(AGENT_STUDIO_SURFACE_ID)).toBeUndefined();
  });

  it('claims no legacy content type, so it cannot hijack an existing panel', () => {
    const { surfaces } = activate();

    expect(surfaces.resolve(AGENT_STUDIO_SURFACE_ID)?.legacyContentType).toBeUndefined();
  });

  it('rejects an open request that carries no agent definition', async () => {
    const { service } = activate();

    await expect(service.open({
      surfaceId: AGENT_STUDIO_SURFACE_ID,
      source: 'capability-rail',
      workspace: LOCAL_WORKSPACE,
      sourceSessionId: 'session-1',
      input: {},
      idempotencyKey: 'open-agent-studio-empty',
    })).resolves.toMatchObject({ status: 'incompatible' });
  });

  it('rejects a definition id that is not a non-empty string', async () => {
    const { service } = activate();

    for (const [index, definitionId] of ['', '   ', 42, null].entries()) {
      await expect(service.open({
        surfaceId: AGENT_STUDIO_SURFACE_ID,
        source: 'capability-rail',
        workspace: LOCAL_WORKSPACE,
        sourceSessionId: 'session-1',
        input: { definitionId },
        idempotencyKey: `open-agent-studio-bad-${index}`,
      })).resolves.toMatchObject({ status: 'incompatible' });
    }
  });

  it('requires a source session, because a revision is always inspected from a session', async () => {
    const { service } = activate();

    await expect(service.open({
      surfaceId: AGENT_STUDIO_SURFACE_ID,
      source: 'capability-rail',
      workspace: LOCAL_WORKSPACE,
      input: { definitionId: 'agent-def-1' },
      idempotencyKey: 'open-agent-studio-no-session',
    })).resolves.toMatchObject({ status: 'incompatible' });
  });

  it('opens a workspace-scoped instance and records the inspected definition', async () => {
    const { renderers, service } = activate();

    await expect(service.open({
      surfaceId: AGENT_STUDIO_SURFACE_ID,
      source: 'capability-rail',
      workspace: LOCAL_WORKSPACE,
      sourceSessionId: 'session-1',
      input: { definitionId: 'agent-def-1' },
      idempotencyKey: 'open-agent-studio-1',
    })).resolves.toMatchObject({ status: 'opened' });

    const content = useAgentCanvasStore.getState().primaryGroup.tabs[0]?.content;
    expect(content).toMatchObject({
      data: {
        definitionId: 'agent-def-1',
        workspacePath: LOCAL_WORKSPACE.workspacePath,
      },
      metadata: {
        canvasSurfaceId: AGENT_STUDIO_SURFACE_ID,
        canvasSurfaceInstanceKey:
          `${AGENT_STUDIO_SURFACE_ID}:${LOCAL_WORKSPACE.workspaceId}:agent-def-1`,
        canvasWorkspaceId: LOCAL_WORKSPACE.workspaceId,
        duplicateCheckKey:
          `agent-studio:${LOCAL_WORKSPACE.workspaceId}:agent-def-1`,
        sourceSessionId: 'session-1',
      },
    });
    expect(renderers.resolve(content!)?.surfaceId).toBe(AGENT_STUDIO_SURFACE_ID);
  });

  it('keeps one instance per definition, so two agents do not share a tab', async () => {
    const { service } = activate();

    const first = await service.open({
      surfaceId: AGENT_STUDIO_SURFACE_ID,
      source: 'capability-rail',
      workspace: LOCAL_WORKSPACE,
      sourceSessionId: 'session-1',
      input: { definitionId: 'agent-def-1' },
      idempotencyKey: 'open-agent-studio-a',
    });
    const second = await service.open({
      surfaceId: AGENT_STUDIO_SURFACE_ID,
      source: 'capability-rail',
      workspace: LOCAL_WORKSPACE,
      sourceSessionId: 'session-1',
      input: { definitionId: 'agent-def-2' },
      idempotencyKey: 'open-agent-studio-b',
    });

    expect(first.status).toBe('opened');
    expect(second.status).toBe('opened');
    if (first.status !== 'opened' || second.status !== 'opened') return;
    expect(second.instanceId).not.toBe(first.instanceId);
    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(2);
  });

  it('focuses the existing instance when the same definition is opened twice', async () => {
    const { service } = activate();

    const first = await service.open({
      surfaceId: AGENT_STUDIO_SURFACE_ID,
      source: 'capability-rail',
      workspace: LOCAL_WORKSPACE,
      sourceSessionId: 'session-1',
      input: { definitionId: 'agent-def-1' },
      idempotencyKey: 'open-agent-studio-same-1',
    });
    const second = await service.open({
      surfaceId: AGENT_STUDIO_SURFACE_ID,
      source: 'capability-rail',
      workspace: LOCAL_WORKSPACE,
      sourceSessionId: 'session-2',
      input: { definitionId: 'agent-def-1' },
      idempotencyKey: 'open-agent-studio-same-2',
    });

    expect(first.status).toBe('opened');
    expect(second.status).toBe('focused');
    if (first.status !== 'opened' || second.status !== 'focused') return;
    expect(second.instanceId).toBe(first.instanceId);
    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(1);
  });

  it('is unavailable on a remote workspace, matching the authoring fail-closed rule', async () => {
    const { service } = activate();

    await expect(service.open({
      surfaceId: AGENT_STUDIO_SURFACE_ID,
      source: 'capability-rail',
      workspace: {
        status: 'ready',
        workspaceId: 'workspace-remote',
        workspacePath: '/remote/project',
        backend: 'remote',
      },
      sourceSessionId: 'session-1',
      input: { definitionId: 'agent-def-1' },
      idempotencyKey: 'open-agent-studio-remote',
    })).resolves.toMatchObject({ status: 'unavailable' });
  });
});
