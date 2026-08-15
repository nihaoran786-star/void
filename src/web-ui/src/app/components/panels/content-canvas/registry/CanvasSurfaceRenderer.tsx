import React from 'react';

import type { PanelContent } from '../types';
import { CanvasSurfaceErrorBoundary } from './CanvasSurfaceErrorBoundary';
import {
  CanvasSurfaceRendererRegistry,
  canvasSurfaceRendererRegistry,
  type CanvasSurfaceRendererProps,
} from './CanvasSurfaceRendererRegistry';
import { ensureFirstPartyCanvasSurfacesRegistered } from './firstPartyCanvasSurfaces';

ensureFirstPartyCanvasSurfacesRegistered();

export interface CanvasSurfaceRendererHostProps extends CanvasSurfaceRendererProps {
  registry?: CanvasSurfaceRendererRegistry;
  unavailableFallback?: React.ReactNode;
  errorFallback?: React.ReactNode;
  onRendererError?: (error: Error, info: React.ErrorInfo) => void;
}

function resolveInstanceKey(content: PanelContent): string {
  return String(
    content.metadata?.canvasSurfaceInstanceKey
      ?? [
        content.metadata?.canvasSurfaceId ?? content.type,
        content.metadata?.canvasWorkspaceId
          ?? content.metadata?.canvasWorkspacePath
          ?? content.data?.workspacePath
          ?? 'unscoped',
      ].join(':'),
  );
}

export const CanvasSurfaceRenderer: React.FC<CanvasSurfaceRendererHostProps> = ({
  content,
  isActive,
  registry = canvasSurfaceRendererRegistry,
  unavailableFallback = null,
  errorFallback = unavailableFallback,
  onRendererError,
}) => {
  const definition = registry.resolve(content);
  if (!definition) {
    return <>{unavailableFallback}</>;
  }

  const { Renderer } = definition;
  return (
    <CanvasSurfaceErrorBoundary
      instanceKey={resolveInstanceKey(content)}
      fallback={errorFallback}
      onError={onRendererError}
    >
      <Renderer content={content} isActive={isActive} />
    </CanvasSurfaceErrorBoundary>
  );
};
