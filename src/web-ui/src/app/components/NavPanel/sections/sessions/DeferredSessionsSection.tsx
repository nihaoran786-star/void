import React, { Suspense, lazy, useEffect, useState } from 'react';

import { useDocumentVisibilityState } from '@/app/hooks/useDocumentVisibilityState';
import type { SessionsSectionProps } from './SessionsSection';

const SessionsSection = lazy(() => import('./SessionsSection'));

/**
 * Defers the session-list implementation until its accordion is first opened,
 * then retains the mounted instance so local expansion/edit state is preserved.
 */
const DeferredSessionsSection: React.FC<SessionsSectionProps> = props => {
  const isStructurallyVisible = props.isVisible !== false;
  const isDocumentVisible = useDocumentVisibilityState();
  const isPresentationActive = isStructurallyVisible && isDocumentVisible;
  const [hasPresented, setHasPresented] = useState(isPresentationActive);
  const shouldPresent = hasPresented || isPresentationActive;

  useEffect(() => {
    if (isPresentationActive) {
      setHasPresented(true);
    }
  }, [isPresentationActive]);

  if (!shouldPresent) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <SessionsSection {...props} isVisible={isPresentationActive} />
    </Suspense>
  );
};

export default DeferredSessionsSection;
