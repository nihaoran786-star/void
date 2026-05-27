import React, { useEffect, useRef, useState } from 'react';
import { ImageIcon, Video, Clock3, CheckCircle2, AlertTriangle, Upload, AudioLines, ListChecks, CornerUpLeft, Eye } from 'lucide-react';
import type { ToolCardProps } from '../types/flow-chat';
import { CompactToolCard, CompactToolCardHeader } from './CompactToolCard';
import { getMediaToolViewModel, type MediaAssetViewModel } from './mediaResult';
import {
  canUseMediaAssetAsImageReference,
  dispatchMediaReference,
  openMediaPreview,
} from './mediaAssetInteractions';
import './MediaGenerationToolCard.scss';

const COLLAPSED_PREVIEW_LIMIT = 6;
const EXPANDED_INITIAL_LIMIT = 24;
const EXPANDED_PAGE_SIZE = 24;

interface LazyMediaThumbnailProps {
  asset: MediaAssetViewModel;
  alt: string;
}

const LazyMediaThumbnail: React.FC<LazyMediaThumbnailProps> = ({ asset, alt }) => {
  const ref = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [activeUrl, setActiveUrl] = useState(asset.previewUrl || asset.url);
  const [hasFailed, setHasFailed] = useState(false);
  const src = isVisible && !hasFailed ? activeUrl : undefined;

  useEffect(() => {
    setActiveUrl(asset.previewUrl || asset.url);
    setHasFailed(false);
  }, [asset.previewUrl, asset.url]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) {
        setIsVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '240px' });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleLoadError = () => {
    if (asset.previewUrl && activeUrl !== asset.url) {
      setActiveUrl(asset.url);
      return;
    }
    setHasFailed(true);
  };

  if (asset.kind === 'video') {
    return (
      <video
        ref={ref as React.RefObject<HTMLVideoElement>}
        src={src}
        muted
        preload={isVisible ? 'metadata' : 'none'}
        onError={handleLoadError}
      />
    );
  }

  if (asset.kind === 'audio') {
    return (
      <div className="media-generation-card__audio-asset">
        <AudioLines size={22} />
        <span>Audio</span>
      </div>
    );
  }

  return (
    <img
      ref={ref as React.RefObject<HTMLImageElement>}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={handleLoadError}
    />
  );
};

export const MediaGenerationToolCard: React.FC<ToolCardProps> = ({ toolItem, config }) => {
  const model = getMediaToolViewModel(toolItem);
  const hasAssets = Boolean(model?.assets.length);
  const isWorking = model?.status === 'polling';
  const isFailed = model?.status === 'failed' || model?.status === 'timeout' || model?.status === 'error';
  const [isExpanded, setIsExpanded] = useState(isFailed);
  const [visibleAssetLimit, setVisibleAssetLimit] = useState(EXPANDED_INITIAL_LIMIT);
  useEffect(() => {
    setVisibleAssetLimit(EXPANDED_INITIAL_LIMIT);
    if (isFailed) {
      setIsExpanded(true);
    }
  }, [isFailed, model?.batchId, model?.status]);
  const kind = model?.kind ?? (toolItem.toolName === 'GenerateVideo' ? 'video' : toolItem.toolName === 'UploadMediaImage' ? 'upload' : toolItem.toolName === 'GenerateSpeech' || toolItem.toolName === 'TranscribeAudio' ? 'audio' : 'image');
  const Icon = kind === 'video'
    ? Video
    : kind === 'upload'
      ? Upload
      : kind === 'audio'
        ? AudioLines
        : toolItem.toolName === 'GetMediaTaskStatus'
          ? ListChecks
          : ImageIcon;
  const status = isWorking ? 'running' : isFailed ? 'error' : 'completed';
  const total = model?.totalCount ?? model?.taskIds.length ?? 0;
  const completed = model?.completedCount ?? 0;
  const summary = isWorking
    ? `生成中 ${completed}/${total || model?.taskIds.length || 1}`
    : isFailed
      ? `生成未完成 ${completed}/${total || 1}`
      : `生成完成 ${completed || model?.assets.length || 1}/${total || model?.assets.length || 1}`;
  const assets = model?.assets ?? [];
  const collapsedAssets = assets.slice(0, COLLAPSED_PREVIEW_LIMIT);
  const visibleAssets = assets.slice(0, visibleAssetLimit);
  const hiddenCollapsedCount = Math.max(assets.length - COLLAPSED_PREVIEW_LIMIT, 0);
  const hiddenExpandedCount = Math.max(assets.length - visibleAssetLimit, 0);

  return (
    <div className="media-generation-card-shell">
      <CompactToolCard
        status={status}
        isExpanded={isExpanded}
        clickable
        onClick={() => setIsExpanded(value => !value)}
        className="media-generation-card"
        header={(
          <CompactToolCardHeader
            icon={<Icon size={15} />}
            expandable
            isExpanded={isExpanded}
            action={config.displayName}
            content={summary}
            rightStatusIcon={isWorking ? <Clock3 size={14} /> : isFailed ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
          />
        )}
        expandedContent={(
          <div className="media-generation-card__body">
            {isWorking && (
              <div className="media-generation-card__generating" aria-label="Media generation in progress">
                <div className="media-generation-card__loader" aria-hidden="true" />
                <span>G</span><span>e</span><span>n</span><span>e</span><span>r</span><span>a</span><span>t</span><span>i</span><span>n</span><span>g</span>
                <small>每 {model?.pollIntervalSeconds ?? 5} 秒查询一次</small>
              </div>
            )}

            {model?.errorMessage && (
              <div className="media-generation-card__error">{model.errorMessage}</div>
            )}

            {assets.length ? (
              <>
                <div className={`media-generation-card__grid media-generation-card__grid--${kind}`}>
                  {visibleAssets.map((asset, index) => (
                    <div
                      key={`${asset.taskId ?? asset.url}-${index}`}
                      className="media-generation-card__asset"
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        openMediaPreview(asset);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          openMediaPreview(asset);
                        }
                      }}
                      title="在应用内预览"
                    >
                      <span className="media-generation-card__badge">#{asset.itemIndex ?? index + 1}</span>
                      <span className="media-generation-card__asset-preview-hint">
                        <Eye size={13} />
                        预览
                      </span>
                      <LazyMediaThumbnail asset={asset} alt={`Generated media ${asset.itemIndex ?? index + 1}`} />
                      <span className="media-generation-card__asset-actions">
                        <span className="media-generation-card__asset-action" aria-hidden="true">
                          <Eye size={12} />
                          打开
                        </span>
                        {canUseMediaAssetAsImageReference(asset) && (
                          <button
                            type="button"
                            className="media-generation-card__asset-action"
                            onClick={(event) => {
                              event.stopPropagation();
                              dispatchMediaReference(asset);
                            }}
                          >
                            <CornerUpLeft size={12} />
                            引用
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                {hiddenExpandedCount > 0 && (
                  <button
                    type="button"
                    className="media-generation-card__load-more"
                    onClick={(event) => {
                      event.stopPropagation();
                      setVisibleAssetLimit(limit => Math.min(limit + EXPANDED_PAGE_SIZE, assets.length));
                    }}
                  >
                    显示更多 {Math.min(EXPANDED_PAGE_SIZE, hiddenExpandedCount)} 张
                  </button>
                )}
              </>
            ) : model?.items.some(item => item.resultPath || item.errorMessage) ? (
              <div className="media-generation-card__items">
                {model.items.map(item => (
                  <div key={`${item.itemIndex}-${item.taskId ?? item.resultPath ?? item.errorMessage ?? item.status}`} className={`media-generation-card__item media-generation-card__item--${item.errorMessage ? 'error' : item.status}`}>
                    <span className="media-generation-card__item-index">#{item.itemIndex}</span>
                    <span className="media-generation-card__item-main">
                      {item.resultPath ?? item.resultUrl ?? item.errorMessage ?? item.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="media-generation-card__tasks">
                {(model?.taskIds ?? []).map(taskId => (
                  <span key={taskId}>{taskId}</span>
                ))}
              </div>
            )}

            {model?.items.some(item => item.errorMessage) && assets.length > 0 && (
              <div className="media-generation-card__items">
                {model.items.filter(item => item.errorMessage).map(item => (
                  <div key={`${item.itemIndex}-${item.errorMessage}`} className="media-generation-card__item media-generation-card__item--error">
                    <span className="media-generation-card__item-index">#{item.itemIndex}</span>
                    <span className="media-generation-card__item-main">{item.errorMessage}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      />
      {!isExpanded && hasAssets && (
        <div className="media-generation-card__preview-strip" aria-label="生成媒体缩略图预览">
          {collapsedAssets.map((asset, index) => (
            <button
              key={`${asset.taskId ?? asset.url}-${index}`}
              type="button"
              className="media-generation-card__preview-asset"
              onClick={(event) => {
                event.stopPropagation();
                openMediaPreview(asset);
              }}
              title="在应用内预览"
            >
              <span className="media-generation-card__badge">#{asset.itemIndex ?? index + 1}</span>
              <LazyMediaThumbnail asset={asset} alt={`Generated media ${asset.itemIndex ?? index + 1}`} />
            </button>
          ))}
          {hiddenCollapsedCount > 0 && (
            <button
              type="button"
              className="media-generation-card__preview-more"
              onClick={(event) => {
                event.stopPropagation();
                setIsExpanded(true);
              }}
              aria-label={`展开查看剩余 ${hiddenCollapsedCount} 张媒体`}
            >
              +{hiddenCollapsedCount}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
