import React, { lazy, Suspense } from 'react';
import type { WorkspaceManagerProps } from './WorkspaceManager';

const WorkspaceManagerContent = lazy(
  () => import('./WorkspaceManager'),
);

/**
 * Keeps the optional workspace-status dialog and its classic stylesheet out of
 * the initial application bundle. The existing context-backed component still
 * owns every scan, close, and switch operation after the dialog is opened.
 */
const LazyWorkspaceManager: React.FC<WorkspaceManagerProps> = props => {
  if (!props.isVisible) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <WorkspaceManagerContent {...props} />
    </Suspense>
  );
};

export default LazyWorkspaceManager;
