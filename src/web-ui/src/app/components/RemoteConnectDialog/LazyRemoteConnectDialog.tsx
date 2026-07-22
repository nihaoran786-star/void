import React, { lazy, Suspense } from 'react';
import type { RemoteConnectDialogProps } from './RemoteConnectDialog';

const RemoteConnectDialogContent = lazy(async () => {
  const { RemoteConnectDialog } = await import('./RemoteConnectDialog');
  return { default: RemoteConnectDialog };
});

/**
 * Defers the optional network/bot connection UI, QR renderer and stylesheet
 * until the user explicitly opens Remote Connect.
 */
export const LazyRemoteConnectDialog: React.FC<
  RemoteConnectDialogProps
> = props => {
  if (!props.isOpen) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <RemoteConnectDialogContent {...props} />
    </Suspense>
  );
};

export default LazyRemoteConnectDialog;
