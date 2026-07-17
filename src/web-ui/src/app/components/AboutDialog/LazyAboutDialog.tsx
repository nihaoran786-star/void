import React, { lazy, Suspense } from 'react';
import type { AboutDialogProps } from './AboutDialog';

const AboutDialogContent = lazy(async () => {
  const { AboutDialog } = await import('./AboutDialog');
  return { default: AboutDialog };
});

/**
 * Keeps the optional About/update UI out of the initial application bundle.
 * Returning before the lazy boundary also avoids fetching it while closed.
 */
export const LazyAboutDialog: React.FC<AboutDialogProps> = props => {
  if (!props.isOpen) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <AboutDialogContent {...props} />
    </Suspense>
  );
};

export default LazyAboutDialog;
