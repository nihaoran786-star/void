import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import { areCanvasWorkspacePathsEquivalent } from '@/shared/services/canvas';
import type { ShortDramaArtifact } from '@/shared/services/short-drama/ShortDramaTypes';
import { CanvasStoreModeContext } from '../stores';
/**
 * K3: the container owns the wiring, so the panel keeps knowing nothing about
 * canvas surfaces.
 *
 * The provider is imported eagerly — it is a context and a small button, and a
 * second lazy boundary around it would buy nothing while adding a suspense
 * step in front of the panel. What is genuinely worth deferring is the module
 * that reaches the canvas surface service, and that one is still loaded on
 * first press, inside the callback below.
 */
import { ShortDramaCanvasHandoffProvider } from '../short-drama/ShortDramaCanvasHandoffContext';
import type { ShortDramaCanvasHandoffResult } from '../short-drama/shortDramaCanvasHandoff';
import type { CanvasSurfaceRendererProps } from './CanvasSurfaceRendererRegistry';
import { useCanvasWorkspaceFacts } from './useCanvasWorkspaceFacts';

interface ShortDramaSurfaceInput {
  workspacePath: string;
  sourceSessionId: string;
  staticFixtureEpisodeCount?: number;
}

const ShortDramaCenterPanel = React.lazy(() => (
  import('../short-drama/ShortDramaCenterPanel').then(module => ({
    default: module.ShortDramaCenterPanel,
  }))
));

export const ShortDramaCanvasSurfaceRenderer: React.FC<CanvasSurfaceRendererProps> = ({
  content,
  isActive,
}) => {
  const { t } = useI18n('components');
  const workspace = useCanvasWorkspaceFacts();
  const hostId = React.useContext(CanvasStoreModeContext);
  const input = content.data as Partial<ShortDramaSurfaceInput> | undefined;
  const workspacePath = input?.workspacePath?.trim();
  const sourceSessionId = input?.sourceSessionId?.trim();
  const staticFixtureEpisodeCount = input?.staticFixtureEpisodeCount;
  const sendArtifactToCanvas = React.useCallback(async (
    artifact: ShortDramaArtifact,
  ): Promise<ShortDramaCanvasHandoffResult> => {
    if (!sourceSessionId) return { status: 'refused', reason: 'canvas-unavailable' };
    const { sendShortDramaArtifactToCanvas } = await import(
      '../short-drama/shortDramaCanvasHandoff'
    );
    return await sendShortDramaArtifactToCanvas(artifact, {
      workspace,
      hostId,
      sourceSessionId,
    });
  }, [hostId, sourceSessionId, workspace]);
  const recordedWorkspaceId = content.metadata?.canvasWorkspaceId;
  const recordedWorkspacePath = content.metadata?.canvasWorkspacePath;
  const recordedSourceSessionId = content.metadata?.sourceSessionId;
  const canvasSourceSessionId = content.metadata?.canvasSourceSessionId;
  const hasTypedRoutingFacts = recordedWorkspaceId !== undefined
    || recordedWorkspacePath !== undefined
    || canvasSourceSessionId !== undefined;
  const typedRoutingFactsMatch = !hasTypedRoutingFacts || (
    workspace.status === 'ready'
    && typeof workspacePath === 'string'
    && recordedWorkspaceId === workspace.workspaceId
    && typeof recordedWorkspacePath === 'string'
    && areCanvasWorkspacePathsEquivalent(
      workspacePath,
      recordedWorkspacePath,
      workspace.backend,
    )
    && canvasSourceSessionId === sourceSessionId
  );
  if (
    !workspacePath
    || !sourceSessionId
    || workspace.status !== 'ready'
    || workspace.backend === 'remote'
    || !typedRoutingFactsMatch
    || !areCanvasWorkspacePathsEquivalent(
      workspacePath,
      workspace.workspacePath,
      workspace.backend,
    )
    || recordedSourceSessionId !== sourceSessionId
    || (
      staticFixtureEpisodeCount !== undefined
      && (
        !Number.isInteger(staticFixtureEpisodeCount)
        || staticFixtureEpisodeCount < 0
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
          {t('shortDrama.loading')}
        </div>
      )}
    >
      <ShortDramaCanvasHandoffProvider send={sendArtifactToCanvas}>
        <ShortDramaCenterPanel
          workspacePath={workspacePath}
          sourceSessionId={sourceSessionId}
          staticFixtureEpisodeCount={staticFixtureEpisodeCount}
          isActive={isActive}
        />
      </ShortDramaCanvasHandoffProvider>
    </React.Suspense>
  );
};
