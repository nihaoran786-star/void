import React from 'react';
import { MEDIA_PREVIEW_EVENT, type MediaPreviewOpenRequest } from './MediaPreviewService';

interface MediaPreviewOverlayProps {
  className?: string;
}

interface PreviewState {
  request: MediaPreviewOpenRequest;
  sequence: number;
}

const MediaPreviewOverlayContent = React.lazy(async () => {
  const module = await import('./MediaPreviewOverlayContent');
  return { default: module.MediaPreviewOverlayContent };
});

export const MediaPreviewOverlay: React.FC<MediaPreviewOverlayProps> = ({ className }) => {
  const [preview, setPreview] = React.useState<PreviewState | null>(null);
  const sequenceRef = React.useRef(0);
  const isOpenRef = React.useRef(false);
  const previouslyFocusedElementRef = React.useRef<HTMLElement | null>(null);

  const restoreFocus = React.useCallback(() => {
    const previouslyFocusedElement = previouslyFocusedElementRef.current;
    previouslyFocusedElementRef.current = null;
    if (previouslyFocusedElement?.isConnected) {
      previouslyFocusedElement.focus();
    }
  }, []);

  const closePreview = React.useCallback(() => {
    isOpenRef.current = false;
    setPreview(null);
    restoreFocus();
  }, [restoreFocus]);

  React.useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<MediaPreviewOpenRequest>).detail;
      if (detail?.url) {
        if (!isOpenRef.current) {
          previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
          isOpenRef.current = true;
        }

        sequenceRef.current += 1;
        setPreview({
          request: detail,
          sequence: sequenceRef.current,
        });
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpenRef.current) {
        event.preventDefault();
        closePreview();
      }
    };

    window.addEventListener(MEDIA_PREVIEW_EVENT, handleOpen);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener(MEDIA_PREVIEW_EVENT, handleOpen);
      window.removeEventListener('keydown', handleKeyDown);
      isOpenRef.current = false;
      restoreFocus();
    };
  }, [closePreview, restoreFocus]);

  if (!preview) {
    return null;
  }

  return (
    <React.Suspense fallback={null}>
      <MediaPreviewOverlayContent
        key={preview.sequence}
        request={preview.request}
        sequence={preview.sequence}
        className={className}
        onClose={closePreview}
      />
    </React.Suspense>
  );
};
