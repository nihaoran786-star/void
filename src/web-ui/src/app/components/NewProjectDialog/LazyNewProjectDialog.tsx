import React, { lazy, Suspense } from 'react';
import type { NewProjectDialogProps } from './NewProjectDialog';

const NewProjectDialogContent = lazy(async () => {
  const { NewProjectDialog } = await import('./NewProjectDialog');
  return { default: NewProjectDialog };
});

/**
 * Keeps the optional project-creation form and its stylesheet out of the
 * startup entry. The existing dialog remains the sole owner of validation and
 * confirmation once the user opens it.
 */
export const LazyNewProjectDialog: React.FC<NewProjectDialogProps> = props => {
  if (!props.isOpen) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <NewProjectDialogContent {...props} />
    </Suspense>
  );
};

export default LazyNewProjectDialog;
