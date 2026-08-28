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
import { INFINITE_CANVAS_SURFACE_ID } from './CanvasSurfaceIds';
import { registerFirstPartyCanvasSurfaces } from './firstPartyCanvasSurfaces';

const LOCAL_WORKSPACE = {
  status: 'ready',
  workspaceId: 'workspace-infinite-canvas',
  workspacePath: 'C:/infinite-canvas',
  backend: 'local',
} as const;

const DOMAIN_REF = {
  moduleId: 'short-drama',
  kind: 'character',
  id: 'artifact-1',
  role: 'refine',
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

describe('infinite-canvas Canvas surface', () => {
  beforeEach(() => {
    resetAgentCanvasWorkspaceSnapshotsForTests();
    useAgentCanvasStore.getState().reset();
  });

  it('registers alongside the other first-party surfaces and disposes with them', () => {
    const { surfaces, activation } = activate();

    expect(activation.status).toBe('active');
    expect(surfaces.resolve(INFINITE_CANVAS_SURFACE_ID)).toBeDefined();

    activation.dispose();
    expect(surfaces.resolve(INFINITE_CANVAS_SURFACE_ID)).toBeUndefined();
  });

  it('claims no legacy content type, so it cannot hijack an existing panel', () => {
    const { surfaces } = activate();

    expect(surfaces.resolve(INFINITE_CANVAS_SURFACE_ID)?.legacyContentType).toBeUndefined();
  });

  it('rejects every input shape other than empty or a short-drama handoff', async () => {
    const { service } = activate();

    const rejected = [
      [1, 2],
      { documentId: 'doc-1' },
      'doc',
      // A handoff without its idempotency key would import twice on restore.
      { domainRef: DOMAIN_REF },
      // A key without a reference says nothing about what to import.
      { requestId: 'req-1' },
      // Only the short-drama module may write a domainRef (contract §5.1.2).
      { domainRef: { ...DOMAIN_REF, moduleId: 'agent-studio' }, requestId: 'req-1' },
      // Scripts and videos are not refinable on the board.
      { domainRef: { ...DOMAIN_REF, kind: 'script' }, requestId: 'req-1' },
      { domainRef: { ...DOMAIN_REF, id: '   ' }, requestId: 'req-1' },
      { domainRef: { ...DOMAIN_REF, role: 'reference' }, requestId: 'req-1' },
      { domainRef: DOMAIN_REF, requestId: 'req-1', extra: true },
    ];
    for (const [index, input] of rejected.entries()) {
      await expect(service.open({
        surfaceId: INFINITE_CANVAS_SURFACE_ID,
        source: 'capability-rail',
        workspace: LOCAL_WORKSPACE,
        sourceSessionId: 'session-1',
        input,
        idempotencyKey: `open-infinite-canvas-bad-${index}`,
      })).resolves.toMatchObject({ status: 'incompatible' });
    }
  });

  it('carries a validated short-drama handoff into the tab content, trimmed', async () => {
    const { service } = activate();

    await expect(service.open({
      surfaceId: INFINITE_CANVAS_SURFACE_ID,
      source: 'capability-rail',
      workspace: LOCAL_WORKSPACE,
      sourceSessionId: 'session-1',
      input: {
        domainRef: { ...DOMAIN_REF, id: '  artifact-1  ' },
        requestId: '  req-1  ',
      },
      idempotencyKey: 'open-infinite-canvas-handoff',
    })).resolves.toMatchObject({ status: 'opened' });

    expect(useAgentCanvasStore.getState().primaryGroup.tabs[0]?.content).toMatchObject({
      data: { domainRef: DOMAIN_REF, requestId: 'req-1' },
    });
  });

  it('opens one workspace-scoped instance keyed by the workspace id', async () => {
    const { renderers, service } = activate();

    await expect(service.open({
      surfaceId: INFINITE_CANVAS_SURFACE_ID,
      source: 'capability-rail',
      workspace: LOCAL_WORKSPACE,
      sourceSessionId: 'session-1',
      input: undefined,
      idempotencyKey: 'open-infinite-canvas-1',
    })).resolves.toMatchObject({ status: 'opened' });

    const content = useAgentCanvasStore.getState().primaryGroup.tabs[0]?.content;
    expect(content).toMatchObject({
      // K2: the opening session travels in the presentation data so the panel
      // can prefer it as the dispatch target.
      data: {
        workspacePath: LOCAL_WORKSPACE.workspacePath,
        sourceSessionId: 'session-1',
      },
      metadata: {
        canvasSurfaceId: INFINITE_CANVAS_SURFACE_ID,
        canvasSurfaceInstanceKey:
          `${INFINITE_CANVAS_SURFACE_ID}:${LOCAL_WORKSPACE.workspaceId}`,
        canvasWorkspaceId: LOCAL_WORKSPACE.workspaceId,
        duplicateCheckKey: `infinite-canvas:${LOCAL_WORKSPACE.workspaceId}`,
        sourceSessionId: 'session-1',
      },
    });
    expect(renderers.resolve(content!)?.surfaceId).toBe(INFINITE_CANVAS_SURFACE_ID);
  });

  /**
   * K3 §5.1.6: still one tab per workspace, but the second open now UPDATES
   * that tab instead of merely focusing it — 'focus' left the content
   * untouched, so a second handoff was silently swallowed.
   */
  it('updates the one workspace instance when opened twice, delivering the new payload', async () => {
    const { service } = activate();

    const first = await service.open({
      surfaceId: INFINITE_CANVAS_SURFACE_ID,
      source: 'capability-rail',
      workspace: LOCAL_WORKSPACE,
      sourceSessionId: 'session-1',
      input: undefined,
      idempotencyKey: 'open-infinite-canvas-same-1',
    });
    const second = await service.open({
      surfaceId: INFINITE_CANVAS_SURFACE_ID,
      source: 'capability-rail',
      workspace: LOCAL_WORKSPACE,
      sourceSessionId: 'session-1',
      input: { domainRef: DOMAIN_REF, requestId: 'req-2' },
      idempotencyKey: 'open-infinite-canvas-same-2',
    });

    expect(first.status).toBe('opened');
    expect(second.status).toBe('updated');
    if (first.status !== 'opened' || second.status !== 'updated') return;
    expect(second.instanceId).toBe(first.instanceId);
    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(1);
    expect(useAgentCanvasStore.getState().primaryGroup.tabs[0]?.content).toMatchObject({
      data: { domainRef: DOMAIN_REF, requestId: 'req-2' },
    });
  });

  /**
   * K3 §5.1.6, the other half of the idempotency story: a reopen that carries
   * no payload must CLEAR the previous one, not inherit it. Session restore
   * reopens the board without input, and a stale handoff surviving that would
   * make the same asset land again every time the tab came back.
   */
  it('clears a delivered handoff when the board is reopened without one', async () => {
    const { service } = activate();

    await service.open({
      surfaceId: INFINITE_CANVAS_SURFACE_ID,
      source: 'capability-rail',
      workspace: LOCAL_WORKSPACE,
      sourceSessionId: 'session-1',
      input: { domainRef: DOMAIN_REF, requestId: 'req-1' },
      idempotencyKey: 'open-infinite-canvas-handoff-1',
    });
    await service.open({
      surfaceId: INFINITE_CANVAS_SURFACE_ID,
      source: 'restore',
      workspace: LOCAL_WORKSPACE,
      sourceSessionId: 'session-1',
      input: undefined,
      idempotencyKey: 'restore-infinite-canvas',
    });

    const content = useAgentCanvasStore.getState().primaryGroup.tabs[0]?.content;
    expect(content?.data).not.toHaveProperty('domainRef');
    expect(content?.data).not.toHaveProperty('requestId');
  });

  it('is unavailable on a remote workspace, matching the media fail-closed rule', async () => {
    const { service } = activate();

    await expect(service.open({
      surfaceId: INFINITE_CANVAS_SURFACE_ID,
      source: 'capability-rail',
      workspace: {
        status: 'ready',
        workspaceId: 'workspace-remote',
        workspacePath: '/remote/project',
        backend: 'remote',
        remoteConnectionId: 'remote-1',
      },
      sourceSessionId: 'session-1',
      input: undefined,
      idempotencyKey: 'open-infinite-canvas-remote',
    })).resolves.toMatchObject({ status: 'unavailable' });
  });
});
