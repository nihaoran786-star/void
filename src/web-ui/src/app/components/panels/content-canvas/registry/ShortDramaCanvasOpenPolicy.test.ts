import { describe, expect, it } from 'vitest';

import type { CanvasSurfaceDefinitionContext } from '@/shared/services/canvas';
import { createShortDramaCanvasOpenPolicy } from './ShortDramaCanvasOpenPolicy';

const context: CanvasSurfaceDefinitionContext = {
  workspace: {
    status: 'ready',
    workspaceId: 'workspace-a',
    workspacePath: 'C:/work',
    backend: 'local',
  },
  input: {},
  source: 'capability-rail',
  sourceSessionId: 'session-a',
};

describe('ShortDramaCanvasOpenPolicy', () => {
  it('allows a typed local Media session without mutating Canvas presentation', async () => {
    const policy = createShortDramaCanvasOpenPolicy({
      readActiveSessionId: () => 'session-a',
      readSession: () => ({
        sessionId: 'session-a',
        workspaceId: 'workspace-a',
        workspacePath: 'c:\\work\\',
        mode: 'media',
        sessionKind: 'normal',
        activePersonaBinding: {
          kind: 'team_lead',
          teamDefinitionId: 'team.short-drama',
        },
      }),
    });

    await expect(policy(context)).resolves.toEqual({ status: 'ready' });
  });

  it.each([
    {
      name: 'missing source session',
      context: { ...context, sourceSessionId: undefined },
      session: undefined,
      reason: 'source_session_required',
    },
    {
      name: 'unknown source session',
      context,
      session: undefined,
      reason: 'source_session_unavailable',
    },
    {
      name: 'ordinary chat session',
      context,
      session: {
        sessionId: 'session-a',
        workspaceId: 'workspace-a',
        workspacePath: 'C:/work',
        mode: 'agent',
        sessionKind: 'normal',
      },
      reason: 'media_session_required',
    },
    {
      name: 'subagent session',
      context,
      session: {
        sessionId: 'session-a',
        workspaceId: 'workspace-a',
        workspacePath: 'C:/work',
        mode: 'media',
        sessionKind: 'subagent',
      },
      reason: 'media_session_required',
    },
    {
      name: 'other workspace id',
      context,
      session: {
        sessionId: 'session-a',
        workspaceId: 'workspace-b',
        workspacePath: 'C:/work',
        mode: 'media',
        sessionKind: 'normal',
      },
      reason: 'session_workspace_mismatch',
    },
    {
      name: 'other workspace path',
      context,
      session: {
        sessionId: 'session-a',
        workspaceId: 'workspace-a',
        workspacePath: 'C:/other',
        mode: 'media',
        sessionKind: 'normal',
      },
      reason: 'session_workspace_mismatch',
    },
  ])('fails closed for $name', async ({ context: testContext, session, reason }) => {
    const policy = createShortDramaCanvasOpenPolicy({
      readActiveSessionId: () => 'session-a',
      readSession: () => session,
    });

    await expect(policy(testContext)).resolves.toEqual({
      status: 'restricted',
      reason,
    });
  });

  it('rejects a no-longer-active source session', async () => {
    const policy = createShortDramaCanvasOpenPolicy({
      readActiveSessionId: () => 'session-b',
      readSession: () => ({
        sessionId: 'session-a',
        workspaceId: 'workspace-a',
        workspacePath: 'C:/work',
        mode: 'media',
        sessionKind: 'normal',
        activePersonaBinding: {
          kind: 'team_lead',
          teamDefinitionId: 'team.short-drama',
        },
      }),
    });

    await expect(policy(context)).resolves.toEqual({
      status: 'unavailable',
      reason: 'source_session_inactive',
    });
  });
});
