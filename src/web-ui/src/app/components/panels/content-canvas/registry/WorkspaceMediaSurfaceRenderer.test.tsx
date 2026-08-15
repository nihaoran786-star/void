import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanvasWorkspaceFacts } from '@/shared/services/canvas';
import type { PanelContent } from '../types';
import { WorkspaceMediaSurfaceRenderer } from './WorkspaceMediaSurfaceRenderer';

const workspaceFactsMock = vi.hoisted(() => ({
  facts: {
    status: 'ready',
    workspaceId: 'workspace-local',
    workspacePath: 'C:/work',
    backend: 'local',
  } as CanvasWorkspaceFacts,
}));

vi.mock('./useCanvasWorkspaceFacts', () => ({
  useCanvasWorkspaceFacts: () => workspaceFactsMock.facts,
}));

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const content: PanelContent = {
  type: 'workspace-media-gallery',
  title: 'Media',
  data: { workspacePath: 'C:/work' },
  metadata: {
    canvasWorkspaceId: 'workspace-local',
    canvasWorkspacePath: 'C:/work',
  },
};

describe('WorkspaceMediaSurfaceRenderer workspace boundary', () => {
  beforeEach(() => {
    workspaceFactsMock.facts = {
      status: 'ready',
      workspaceId: 'workspace-local',
      workspacePath: 'C:/work',
      backend: 'local',
    };
  });

  it('fails closed when a typed tab belongs to another workspace', () => {
    workspaceFactsMock.facts = {
      status: 'ready',
      workspaceId: 'workspace-other',
      workspacePath: 'C:/work',
      backend: 'local',
    };

    const html = renderToStaticMarkup(
      <WorkspaceMediaSurfaceRenderer content={content} isActive />,
    );

    expect(html).toContain('data-canvas-surface-state="unavailable"');
  });

  it('fails closed for remote workspaces before loading the path-only gallery', () => {
    workspaceFactsMock.facts = {
      status: 'ready',
      workspaceId: 'workspace-remote',
      workspacePath: '/srv/app',
      backend: 'remote',
      remoteConnectionId: 'connection-remote',
      remoteHost: 'host-a',
    };

    const html = renderToStaticMarkup(
      <WorkspaceMediaSurfaceRenderer
        content={{
          ...content,
          data: { workspacePath: '/srv/app' },
          metadata: {
            canvasWorkspaceId: 'workspace-remote',
            canvasWorkspacePath: '/srv/app',
          },
        }}
        isActive
      />,
    );

    expect(html).toContain('data-canvas-surface-state="unavailable"');
  });
});
