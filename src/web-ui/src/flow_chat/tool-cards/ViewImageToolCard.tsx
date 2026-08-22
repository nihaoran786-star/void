import React, { useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, Maximize2 } from 'lucide-react';
import { useI18n } from '@/infrastructure/i18n';
import { openMediaPreviewPanel } from '@/shared/services/preview/MediaPreviewService';
import type { ToolCardProps } from '../types/flow-chat';
import { CompactToolCard, CompactToolCardHeader } from './CompactToolCard';
import { notifyToolCardHeightChanged } from './useToolCardHeightContract';
import './ViewImageToolCard.scss';

type PreviewState = 'unavailable' | 'loading' | 'ready' | 'failed';

function getResultError(result: unknown): string | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return undefined;
  }

  const error = (result as Record<string, unknown>).error;
  return typeof error === 'string' && error.trim() ? error.trim() : undefined;
}

export const ViewImageToolCard: React.FC<ToolCardProps> = ({ toolItem, config }) => {
  const { t } = useI18n('flow-chat');
  const attachment = toolItem.previewImageAttachments?.[0];
  const source = useMemo(
    () => attachment
      ? `data:${attachment.mimeType};base64,${attachment.dataBase64}`
      : undefined,
    [attachment],
  );
  const [previewState, setPreviewState] = useState<PreviewState>(
    source ? 'loading' : 'unavailable',
  );
  const imagePath = typeof toolItem.toolCall?.input?.image_path === 'string'
    ? toolItem.toolCall.input.image_path
    : '';
  const title = imagePath.split(/[\\/]/).pop() || t('toolCards.viewImage.previewTitle');
  const toolError = getResultError(toolItem.toolResult?.result)
    ?? (toolItem.toolResult?.success === false
      ? toolItem.toolResult.error || t('toolCards.default.failed')
      : undefined);

  useEffect(() => {
    setPreviewState(source ? 'loading' : 'unavailable');
  }, [source]);

  const openPreview = () => {
    if (!source || previewState !== 'ready') {
      return;
    }
    openMediaPreviewPanel({
      kind: 'image',
      url: source,
      title,
    });
  };

  const statusText = toolError
    || (previewState === 'failed'
      ? t('toolCards.viewImage.loadFailed')
      : previewState === 'unavailable'
        ? t('toolCards.viewImage.unavailable')
        : previewState === 'loading'
          ? t('toolCards.viewImage.loading')
          : t('toolCards.viewImage.openPreview'));

  return (
    <div className="view-image-tool-card">
      <CompactToolCard
        status={toolItem.status}
        className="view-image-tool-card__header"
        header={(
          <CompactToolCardHeader
            icon={<ImageIcon size={16} />}
            action={config.displayName}
            content={title}
          />
        )}
      />
      <button
        type="button"
        className={`view-image-tool-card__preview view-image-tool-card__preview--${previewState}`}
        disabled={previewState !== 'ready'}
        onClick={openPreview}
        aria-label={statusText}
      >
        {source && previewState !== 'failed' ? (
          <img
            src={source}
            alt={t('toolCards.viewImage.imageAlt', { name: title })}
            decoding="async"
            onLoad={() => {
              setPreviewState('ready');
              // The preview box is `min-height: 112px` until the bitmap decodes
              // and then grows to as much as 520px. That is a post-mount height
              // change the list can only see as an unsignalled delta, so ask it
              // to re-measure. See FLOWCHAT_SCROLL_STABILITY.md section G.
              notifyToolCardHeightChanged();
            }}
            onError={() => {
              setPreviewState('failed');
              notifyToolCardHeightChanged();
            }}
          />
        ) : (
          <ImageIcon size={28} aria-hidden="true" />
        )}
      </button>
      <span className="view-image-tool-card__status">
        {!toolError && previewState === 'ready' && <Maximize2 size={13} aria-hidden="true" />}
        {statusText}
      </span>
    </div>
  );
};
