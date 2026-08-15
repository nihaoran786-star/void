// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanvasWorkspaceFacts } from '@/shared/services/canvas';
import type { PanelContent } from '../types';
import { ShortDramaCanvasSurfaceRenderer } from './ShortDramaCanvasSurfaceRenderer';

const workspaceFactsMock = vi.hoisted(() => ({
  facts: {
    status: 'ready',
    workspaceId: 'workspace-short-drama',
    workspacePath: 'C:/short-drama',
    backend: 'local',
  } as CanvasWorkspaceFacts,
}));

vi.mock('./useCanvasWorkspaceFacts', () => ({
  useCanvasWorkspaceFacts: () => workspaceFactsMock.facts,
}));

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../short-drama/ShortDramaCenterPanel', () => ({
  ShortDramaCenterPanel: ({
    workspacePath,
    sourceSessionId,
    staticFixtureEpisodeCount,
    isActive,
  }: {
    workspacePath?: string;
    sourceSessionId?: string;
    staticFixtureEpisodeCount?: number;
    isActive?: boolean;
  }) => (
    <div
      data-testid="short-drama-panel"
      data-workspace-path={workspacePath}
      data-source-session-id={sourceSessionId}
      data-fixture-episode-count={staticFixtureEpisodeCount}
      data-is-active={String(isActive)}
    />
  ),
}));

const content: PanelContent = {
  type: 'short-drama-center',
  title: 'AI Short Drama',
  data: {
    workspacePath: 'C:/short-drama',
    sourceSessionId: 'media-session-1',
  },
  metadata: {
    canvasWorkspaceId: 'workspace-short-drama',
    canvasWorkspacePath: 'C:/short-drama',
    canvasSourceSessionId: 'media-session-1',
    sourceSessionId: 'media-session-1',
  },
};

describe('ShortDramaCanvasSurfaceRenderer workspace boundary', () => {
  beforeEach(() => {
    workspaceFactsMock.facts = {
      status: 'ready',
      workspaceId: 'workspace-short-drama',
      workspacePath: 'C:/short-drama',
      backend: 'local',
    };
  });

  it('fails closed when the typed surface belongs to another workspace', () => {
    workspaceFactsMock.facts = {
      status: 'ready',
      workspaceId: 'workspace-other',
      workspacePath: 'C:/short-drama',
      backend: 'local',
    };

    const html = renderToStaticMarkup(
      <ShortDramaCanvasSurfaceRenderer content={content} isActive />,
    );

    expect(html).toContain('data-canvas-surface-state="unavailable"');
  });

  it('fails closed for remote workspaces before loading the path-only domain panel', () => {
    workspaceFactsMock.facts = {
      status: 'ready',
      workspaceId: 'workspace-short-drama',
      workspacePath: '/srv/short-drama',
      backend: 'remote',
      remoteConnectionId: 'remote-a',
    };

    const html = renderToStaticMarkup(
      <ShortDramaCanvasSurfaceRenderer
        content={{
          ...content,
          data: {
            workspacePath: '/srv/short-drama',
            sourceSessionId: 'media-session-1',
          },
          metadata: {
            ...content.metadata,
            canvasWorkspacePath: '/srv/short-drama',
          },
        }}
        isActive
      />,
    );

    expect(html).toContain('data-canvas-surface-state="unavailable"');
  });

  it('loads the domain panel with validated workspace and source-session facts', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <ShortDramaCanvasSurfaceRenderer
            content={{
              ...content,
              data: {
                ...content.data,
                staticFixtureEpisodeCount: 3,
              },
            }}
            isActive={false}
          />,
        );
        await vi.dynamicImportSettled();
      });

      const panel = container.querySelector('[data-testid="short-drama-panel"]');
      expect(panel?.getAttribute('data-workspace-path')).toBe('C:/short-drama');
      expect(panel?.getAttribute('data-source-session-id')).toBe('media-session-1');
      expect(panel?.getAttribute('data-fixture-episode-count')).toBe('3');
      expect(panel?.getAttribute('data-is-active')).toBe('false');
    } finally {
      act(() => root.unmount());
    }
  });

  it('renders a local legacy snapshot when its path and session facts agree', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <ShortDramaCanvasSurfaceRenderer
            content={{
              type: 'short-drama-center',
              title: 'AI Short Drama',
              data: {
                workspacePath: 'C:/short-drama',
                sourceSessionId: 'media-session-legacy',
              },
              metadata: {
                duplicateCheckKey: 'short-drama:C:/short-drama',
                sourceSessionId: 'media-session-legacy',
                contentRole: 'short-drama-center',
              },
            }}
            isActive
          />,
        );
        await vi.dynamicImportSettled();
      });

      const panel = container.querySelector('[data-testid="short-drama-panel"]');
      expect(panel?.getAttribute('data-workspace-path')).toBe('C:/short-drama');
      expect(panel?.getAttribute('data-source-session-id')).toBe('media-session-legacy');
    } finally {
      act(() => root.unmount());
    }
  });
});
