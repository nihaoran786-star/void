import React from 'react';
import { Copy, X } from 'lucide-react';
import { useI18n } from '@/infrastructure/i18n';
import { resolveWorkspaceMediaPreviewUrl } from '@/shared/services/workspace-media';
import type { MediaPreviewOpenRequest } from './MediaPreviewService';
import './MediaPreviewOverlay.scss';

interface MediaPreviewOverlayContentProps {
  request: MediaPreviewOpenRequest;
  sequence: number;
  className?: string;
  onClose: () => void;
}

const MEDIA_PREVIEW_FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'video[controls]',
  'audio[controls]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const MediaPreviewOverlayContent: React.FC<MediaPreviewOverlayContentProps> = ({
  request,
  sequence,
  className,
  onClose,
}) => {
  const { t } = useI18n('flow-chat');
  const [activeUrl, setActiveUrl] = React.useState(request.url);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return;
      }

      const dialog = dialogRef.current;
      const focusableElements = dialog
        ? Array.from(dialog.querySelectorAll<HTMLElement>(MEDIA_PREVIEW_FOCUSABLE_SELECTOR))
        : [];
      if (!dialog || focusableElements.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }

      const activeElement = document.activeElement;
      const activeIndex = activeElement instanceof HTMLElement
        ? focusableElements.indexOf(activeElement)
        : -1;
      const nextIndex = activeIndex < 0
        ? (event.shiftKey ? focusableElements.length - 1 : 0)
        : (
          activeIndex
          + (event.shiftKey ? -1 : 1)
          + focusableElements.length
        ) % focusableElements.length;

      event.preventDefault();
      focusableElements[nextIndex]?.focus();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const copyValue = request.localPath || request.remoteUrl || request.url;
  const title = request.title || 'Media Preview';
  const handleMediaError = () => {
    if (request.remoteUrl && request.remoteUrl !== activeUrl) {
      setActiveUrl(request.remoteUrl);
      return;
    }

    if (!request.localPath) {
      return;
    }

    const extension = request.localPath.split(/[\\/]/).pop()?.split('.').pop() || '';
    const fallbackSourceUrl = activeUrl;
    void resolveWorkspaceMediaPreviewUrl({
      filePath: request.localPath,
      extension,
      kind: request.kind,
    }).then((localDataUrl) => {
      if (localDataUrl && localDataUrl !== fallbackSourceUrl) {
        setActiveUrl((currentUrl) => (
          currentUrl === fallbackSourceUrl ? localDataUrl : currentUrl
        ));
      }
    }).catch(() => {
      // The overlay already shows the browser's native failed-media state.
    });
  };

  return (
    <div
      ref={dialogRef}
      className={['media-preview-overlay', className].filter(Boolean).join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      data-preview-sequence={sequence}
    >
      <div className="media-preview-overlay__backdrop" onClick={onClose} />
      <section className="media-preview-overlay__panel">
        <header className="media-preview-overlay__header">
          <div className="media-preview-overlay__title">
            <span>{title}</span>
            {request.localPath && <small>{request.localPath}</small>}
          </div>
          <div className="media-preview-overlay__actions">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(copyValue);
              }}
              title={t('mediaPreview.copy')}
              aria-label={t('mediaPreview.copy')}
            >
              <Copy size={16} />
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              title={t('mediaPreview.close')}
              aria-label={t('mediaPreview.close')}
            >
              <X size={16} />
            </button>
          </div>
        </header>
        <div className="media-preview-overlay__body">
          {request.kind === 'video' ? (
            <video
              className="media-preview-overlay__media"
              src={activeUrl}
              controls
              autoPlay
              onError={handleMediaError}
            />
          ) : request.kind === 'audio' ? (
            <audio src={activeUrl} controls autoPlay onError={handleMediaError} />
          ) : (
            <img
              className="media-preview-overlay__media"
              src={activeUrl}
              alt={title}
              onError={handleMediaError}
            />
          )}
        </div>
      </section>
    </div>
  );
};
