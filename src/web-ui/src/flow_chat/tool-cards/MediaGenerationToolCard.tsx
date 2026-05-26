import React, { useState } from 'react';
import { ImageIcon, Video, Clock3, CheckCircle2, AlertTriangle, Upload, AudioLines, ListChecks, CornerUpLeft, Eye } from 'lucide-react';
import type { ToolCardProps } from '../types/flow-chat';
import { CompactToolCard, CompactToolCardHeader } from './CompactToolCard';
import { getMediaToolViewModel } from './mediaResult';
import {
  canUseMediaAssetAsImageReference,
  dispatchMediaReference,
  openMediaPreview,
} from './mediaAssetInteractions';
import './MediaGenerationToolCard.scss';

export const MediaGenerationToolCard: React.FC<ToolCardProps> = ({ toolItem, config }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const model = getMediaToolViewModel(toolItem);
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
  const isWorking = model?.status === 'polling';
  const isFailed = model?.status === 'failed' || model?.status === 'timeout' || model?.status === 'error';
  const status = isWorking ? 'running' : isFailed ? 'error' : 'completed';
  const total = model?.totalCount ?? model?.taskIds.length ?? 0;
  const completed = model?.completedCount ?? 0;
  const summary = isWorking
    ? `生成中 ${completed}/${total || model?.taskIds.length || 1}`
    : isFailed
      ? `生成未完成 ${completed}/${total || 1}`
      : `生成完成 ${completed || model?.assets.length || 1}/${total || model?.assets.length || 1}`;

  return (
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

          {model?.assets.length ? (
            <div className={`media-generation-card__grid media-generation-card__grid--${kind}`}>
              {model.assets.map((asset, index) => (
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
                  {asset.kind === 'video' ? (
                    <video src={asset.url} muted preload="metadata" />
                  ) : asset.kind === 'audio' ? (
                    <div className="media-generation-card__audio-asset">
                      <AudioLines size={22} />
                      <span>Audio</span>
                    </div>
                  ) : (
                    <img src={asset.url} alt={`Generated media ${asset.itemIndex ?? index + 1}`} loading="lazy" />
                  )}
                  <span className="media-generation-card__asset-actions">
                    <span className="media-generation-card__asset-action" aria-hidden="true">
                      <Eye size={12} />
                      打开
                    </span>
                    <button
                      type="button"
                      disabled={!canUseMediaAssetAsImageReference(asset)}
                      className={`media-generation-card__asset-action ${canUseMediaAssetAsImageReference(asset) ? '' : 'is-disabled'}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (canUseMediaAssetAsImageReference(asset)) {
                          dispatchMediaReference(asset);
                        }
                      }}
                    >
                      <CornerUpLeft size={12} />
                      引用
                    </button>
                  </span>
                </div>
              ))}
            </div>
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

          {model?.items.some(item => item.errorMessage) && model.assets.length > 0 && (
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
  );
};
