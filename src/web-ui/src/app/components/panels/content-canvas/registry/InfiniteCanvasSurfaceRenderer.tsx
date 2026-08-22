import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import type { CanvasSurfaceRendererProps } from './CanvasSurfaceRendererRegistry';
import { useCanvasWorkspaceFacts } from './useCanvasWorkspaceFacts';

/**
 * Minimal M2 shell for the Infinite Canvas surface.
 *
 * It renders an explicit loading skeleton only: the real panel (reactflow,
 * lazily code-split so it never enters the entry chunk) arrives in M3 and will
 * be mounted inside the Suspense boundary below. The instance-level
 * CanvasSurfaceErrorBoundary is applied by the CanvasSurfaceRenderer host,
 * matching every other first-party surface.
 */
export const InfiniteCanvasSurfaceRenderer: React.FC<CanvasSurfaceRendererProps> = () => {
  const { t } = useI18n('components');
  const workspace = useCanvasWorkspaceFacts();
  const ready = workspace.status === 'ready' && workspace.backend !== 'remote';

  if (!ready) {
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
    <React.Suspense fallback={<div className="void-flexible-panel__loading" />}>
      {/* M3 replaces this skeleton with the lazily imported canvas panel. */}
      <div
        className="void-flexible-panel__loading"
        data-canvas-surface-state="loading"
        role="status"
      >
        <p>{t('infiniteCanvas.skeleton')}</p>
      </div>
    </React.Suspense>
  );
};

InfiniteCanvasSurfaceRenderer.displayName = 'InfiniteCanvasSurfaceRenderer';
