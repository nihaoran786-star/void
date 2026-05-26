import React from 'react';
import { ImageIcon, Video, Clock3, CheckCircle2, AlertTriangle, Upload, AudioLines, ListChecks } from 'lucide-react';
import type { ToolCardProps } from '../types/flow-chat';
import { CompactToolCard, CompactToolCardHeader } from './CompactToolCard';
import { getMediaToolViewModel } from './mediaResult';
import './MediaGenerationToolCard.scss';

export const MediaGenerationToolCard: React.FC<ToolCardProps> = ({ toolItem, config }) => {
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
      isExpanded
      className="media-generation-card"
      header={(
        <CompactToolCardHeader
          icon={<Icon size={15} />}
          action={config.displayName}
          content={summary}
          rightStatusIcon={isWorking ? <Clock3 size={14} /> : isFailed ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
        />
      )}
      expandedContent={(
        <div className="media-generation-card__body">
          {isWorking && (
            <div className="media-generation-card__status">
              后台正在每 {model?.pollIntervalSeconds ?? 5} 秒查询一次，完成后会更新这里，并写入下一轮 AI 上下文。
            </div>
          )}

          {model?.errorMessage && (
            <div className="media-generation-card__error">{model.errorMessage}</div>
          )}

          {model?.assets.length ? (
            <div className={`media-generation-card__grid media-generation-card__grid--${kind}`}>
              {model.assets.map((asset, index) => (
                <a
                  key={`${asset.taskId ?? asset.url}-${index}`}
                  className="media-generation-card__asset"
                  href={asset.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="media-generation-card__badge">#{asset.itemIndex ?? index + 1}</span>
                  {asset.kind === 'video' ? (
                    <video src={asset.url} controls preload="metadata" />
                  ) : (
                    <img src={asset.url} alt={`Generated media ${asset.itemIndex ?? index + 1}`} loading="lazy" />
                  )}
                </a>
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
