import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import { areCanvasWorkspacePathsEquivalent } from '@/shared/services/canvas';
import type { CanvasSurfaceRendererProps } from './CanvasSurfaceRendererRegistry';
import { useCanvasWorkspaceFacts } from './useCanvasWorkspaceFacts';

interface InfiniteCanvasSurfaceInput {
  workspacePath: string;
}

/**
 * The reactflow-based panel is code-split into its own chunk so @xyflow/react
 * never enters the entry bundle (hard performance-budget gate). A failed
 * dynamic import resolves to an explicit typed failure component instead of
 * throwing a raw chunk error, matching the P0-A typed-error pattern; render
 * crashes are still caught by the instance-level CanvasSurfaceErrorBoundary
 * applied by the CanvasSurfaceRenderer host.
 */
const InfiniteCanvasModuleLoadFailure: React.FC = () => {
  const { t } = useI18n('components');
  return (
    <div
      className="void-flexible-panel__unknown-content"
      data-canvas-surface-state="error"
      data-error-kind="module-load-failed"
      role="alert"
    >
      <h3>{t('infiniteCanvas.title')}</h3>
      <p>{t('infiniteCanvas.loadFailed')}</p>
    </div>
  );
};

type InfiniteCanvasPanelComponent = React.ComponentType<{
  workspaceId: string;
  workspacePath: string;
  isActive: boolean;
}>;

const InfiniteCanvasPanel = React.lazy<InfiniteCanvasPanelComponent>(() => (
  import('../infinite-canvas/InfiniteCanvasPanel')
    .then(module => ({
      default: module.InfiniteCanvasPanel as InfiniteCanvasPanelComponent,
    }))
    .catch(() => ({
      default: InfiniteCanvasModuleLoadFailure as InfiniteCanvasPanelComponent,
    }))
));

export const InfiniteCanvasSurfaceRenderer: React.FC<CanvasSurfaceRendererProps> = ({
  content,
  isActive,
}) => {
  const { t } = useI18n('components');
  const workspace = useCanvasWorkspaceFacts();
  const input = content.data as Partial<InfiniteCanvasSurfaceInput> | undefined;
  const recordedWorkspacePath = input?.workspacePath?.trim();
  const recordedWorkspaceId = content.metadata?.canvasWorkspaceId;

  if (
    workspace.status !== 'ready'
    || workspace.backend === 'remote'
    || (
      typeof recordedWorkspaceId === 'string'
      && recordedWorkspaceId !== workspace.workspaceId
    )
    || (
      recordedWorkspacePath !== undefined
      && recordedWorkspacePath !== ''
      && !areCanvasWorkspacePathsEquivalent(
        recordedWorkspacePath,
        workspace.workspacePath,
        workspace.backend,
      )
    )
  ) {
    return (
      <div
        className="void-flexible-panel__unknown-content"
        data-canvas-surface-state="unavailable"
      >
        <h3>{t('infiniteCanvas.title')}</h3>
        <p>{t('infiniteCanvas.unavailable')}</p>
      </div>
    );
  }

  return (
    <React.Suspense
      fallback={(
        <div
          className="void-flexible-panel__loading"
          data-canvas-surface-state="loading"
          role="status"
        >
          <p>{t('infiniteCanvas.skeleton')}</p>
        </div>
      )}
    >
      <InfiniteCanvasPanel
        workspaceId={workspace.workspaceId}
        workspacePath={workspace.workspacePath}
        isActive={isActive}
      />
    </React.Suspense>
  );
};

InfiniteCanvasSurfaceRenderer.displayName = 'InfiniteCanvasSurfaceRenderer';
