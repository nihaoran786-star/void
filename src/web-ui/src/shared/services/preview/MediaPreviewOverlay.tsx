import React from 'react';
import { Copy, X } from 'lucide-react';
import { useI18n } from '@/infrastructure/i18n';
import { resolveWorkspaceMediaPreviewUrl } from '@/shared/services/workspace-media';
import { MEDIA_PREVIEW_EVENT, type MediaPreviewOpenRequest } from './MediaPreviewService';
import './MediaPreviewOverlay.scss';

interface MediaPreviewOverlayProps {
  className?: string;
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

export const MediaPreviewOverlay: React.FC<MediaPreviewOverlayProps> = ({ className }) => {
  const { t } = useI18n('flow-chat');
  const [preview, setPreview] = React.useState<MediaPreviewOpenRequest | null>(null);
  const [activeUrl, setActiveUrl] = React.useState('');
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const previouslyFocusedElementRef = React.useRef<HTMLElement | null>(null);
  const isOpen = preview !== null;

  React.useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<MediaPreviewOpenRequest>).detail;
      if (detail?.url) {
        setPreview(detail);
        setActiveUrl(detail.url);
      }
    };
    window.addEventListener(MEDIA_PREVIEW_EVENT, handleOpen);
    return () => window.removeEventListener(MEDIA_PREVIEW_EVENT, handleOpen);
  }, []);

  React.useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPreview(null);
        return;
      }

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
      const previouslyFocusedElement = previouslyFocusedElementRef.current;
      previouslyFocusedElementRef.current = null;
      if (previouslyFocusedElement?.isConnected) {
        previouslyFocusedElement.focus();
      }
    };
  }, [isOpen]);

  if (!preview) {
    return null;
  }

  const copyValue = preview.localPath || preview.remoteUrl || preview.url;
  const title = preview.title || 'Media Preview';
  const handleMediaError = () => {
    if (preview.remoteUrl && preview.remoteUrl !== activeUrl) {
      setActiveUrl(preview.remoteUrl);
      return;
    }

    if (!preview.localPath) {
      return;
    }

    const extension = preview.localPath.split(/[\\/]/).pop()?.split('.').pop() || '';
    const fallbackSourceUrl = activeUrl;
    void resolveWorkspaceMediaPreviewUrl({
      filePath: preview.localPath,
      extension,
      kind: preview.kind,
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
    >
      <div className="media-preview-overlay__backdrop" onClick={() => setPreview(null)} />
      <section className="media-preview-overlay__panel">
        <header className="media-preview-overlay__header">
          <div className="media-preview-overlay__title">
            <span>{title}</span>
            {preview.localPath && <small>{preview.localPath}</small>}
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
              onClick={() => setPreview(null)}
              title={t('mediaPreview.close')}
              aria-label={t('mediaPreview.close')}
            >
              <X size={16} />
            </button>
          </div>
        </header>
        <div className="media-preview-overlay__body">
          {preview.kind === 'video' ? (
            <video
              className="media-preview-overlay__media"
              src={activeUrl}
              controls
              autoPlay
              onError={handleMediaError}
            />
          ) : preview.kind === 'audio' ? (
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
