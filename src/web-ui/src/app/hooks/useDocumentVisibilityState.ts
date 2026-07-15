import { useSyncExternalStore } from 'react';

const subscribe = (onStoreChange: () => void) => {
  if (typeof document === 'undefined') {
    return () => undefined;
  }

  document.addEventListener('visibilitychange', onStoreChange);
  return () => document.removeEventListener('visibilitychange', onStoreChange);
};

const getSnapshot = () => (
  typeof document === 'undefined' || document.visibilityState === 'visible'
);

/** Returns whether presentation work may run in the current document. */
export const useDocumentVisibilityState = () => (
  useSyncExternalStore(subscribe, getSnapshot, () => true)
);
