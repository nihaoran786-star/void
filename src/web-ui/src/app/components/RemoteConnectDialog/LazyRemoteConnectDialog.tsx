import React from 'react';
import {
  RemoteConnectDialog as RemoteConnectDialogContent,
  type RemoteConnectDialogProps,
} from './RemoteConnectDialog';

/**
 * Keeps the optional connection UI unmounted until it is opened. The module is
 * imported eagerly because a failed dynamic import is cached by React.lazy and
 * would otherwise turn this optional dialog into an application-level error.
 */
export const LazyRemoteConnectDialog: React.FC<
  RemoteConnectDialogProps
> = props => {
  if (!props.isOpen) {
    return null;
  }

  return <RemoteConnectDialogContent {...props} />;
};

export default LazyRemoteConnectDialog;
