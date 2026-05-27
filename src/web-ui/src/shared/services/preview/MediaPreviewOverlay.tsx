import React from 'react';
import { Copy, X } from 'lucide-react';
import { MEDIA_PREVIEW_EVENT, type MediaPreviewOpenRequest } from './MediaPreviewService';
import './MediaPreviewOverlay.scss';

export const MediaPreviewOverlay: React.FC = () => {
  const [preview, setPreview] = React.useState<MediaPreviewOpenRequest | null>(null);
  const [activeUrl, setActiveUrl] = React.useState('');

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
    if (!preview) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreview(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [preview]);

  if (!preview) {
    return null;
  }

  const copyValue = preview.localPath || preview.remoteUrl || preview.url;
  const title = preview.title || 'Media Preview';
  const handleMediaError = () => {
    if (preview.remoteUrl && preview.remoteUrl !== activeUrl) {
      setActiveUrl(preview.remoteUrl);
    }
  };

  return (
    <div className="media-preview-overlay" role="dialog" aria-modal="true" aria-label={title}>
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
              title="复制路径或 URL"
              aria-label="复制路径或 URL"
            >
              <Copy size={16} />
            </button>
            <button type="button" onClick={() => setPreview(null)} title="关闭" aria-label="关闭">
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
