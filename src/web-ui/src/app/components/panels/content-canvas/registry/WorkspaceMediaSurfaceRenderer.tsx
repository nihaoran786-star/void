import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import { areCanvasWorkspacePathsEquivalent } from '@/shared/services/canvas';
import type { CanvasSurfaceRendererProps } from './CanvasSurfaceRendererRegistry';
import { useCanvasWorkspaceFacts } from './useCanvasWorkspaceFacts';

interface WorkspaceMediaSurfaceInput {
  workspacePath: string;
}

const WorkspaceMediaGallery = React.lazy(() => (
  import('../workspace-media/WorkspaceMediaGallery').then(module => ({
    default: module.WorkspaceMediaGallery,
  }))
));

export const WorkspaceMediaSurfaceRenderer: React.FC<CanvasSurfaceRendererProps> = ({
  content,
  isActive,
}) => {
  const { t } = useI18n('components');
  const workspace = useCanvasWorkspaceFacts();
  const input = content.data as Partial<WorkspaceMediaSurfaceInput> | undefined;
  const workspacePath = input?.workspacePath?.trim();
  const recordedWorkspacePath = content.metadata?.canvasWorkspacePath;
  const recordedWorkspaceId = content.metadata?.canvasWorkspaceId;
  if (
    !workspacePath
    || workspace.status !== 'ready'
    || workspace.backend === 'remote'
    || (
      typeof recordedWorkspaceId === 'string'
      && recordedWorkspaceId !== workspace.workspaceId
    )
    || !areCanvasWorkspacePathsEquivalent(
      workspacePath,
      workspace.workspacePath,
      workspace.backend,
    )
    || (
      typeof recordedWorkspacePath === 'string'
      && !areCanvasWorkspacePathsEquivalent(
        workspacePath,
        recordedWorkspacePath,
        workspace.backend,
      )
    )
  ) {
    return (
      <div className="void-flexible-panel__unknown-content" data-canvas-surface-state="unavailable">
        <h3>{t('flexiblePanel.unknownContent.title')}</h3>
        <p>{t('flexiblePanel.unknownContent.description')}</p>
      </div>
    );
  }

  return (
    <React.Suspense
      fallback={(
        <div className="void-flexible-panel__loading">
          {t('workspaceMedia.states.scanning')}
        </div>
      )}
    >
      <WorkspaceMediaGallery workspacePath={workspacePath} isActive={isActive} />
    </React.Suspense>
  );
};
