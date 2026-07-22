import React, { lazy, Suspense } from 'react';
import type { UpdateInstallProgressModalProps } from './UpdateInstallProgressModal';

const UpdateInstallProgressModalContent = lazy(async () => {
  const { UpdateInstallProgressModal } = await import(
    './UpdateInstallProgressModal'
  );
  return { default: UpdateInstallProgressModal };
});

/**
 * Defers update result/progress presentation while keeping install state in
 * the existing update store and controller.
 */
export const LazyUpdateInstallProgressModal: React.FC<
  UpdateInstallProgressModalProps
> = props => {
  if (!props.isOpen) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <UpdateInstallProgressModalContent {...props} />
    </Suspense>
  );
};

export default LazyUpdateInstallProgressModal;
