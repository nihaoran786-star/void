import React, { lazy, Suspense } from 'react';
import type { UpdateAvailableDialogProps } from './UpdateAvailableDialog';

const UpdateAvailableDialogContent = lazy(async () => {
  const { UpdateAvailableDialog } = await import('./UpdateAvailableDialog');
  return { default: UpdateAvailableDialog };
});

/**
 * Keeps the update prompt UI and its styles out of the startup graph until an
 * actual update is ready to be shown.
 */
export const LazyUpdateAvailableDialog: React.FC<
  UpdateAvailableDialogProps
> = props => {
  if (!props.isOpen || !props.data?.updateAvailable) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <UpdateAvailableDialogContent {...props} />
    </Suspense>
  );
};

export default LazyUpdateAvailableDialog;
