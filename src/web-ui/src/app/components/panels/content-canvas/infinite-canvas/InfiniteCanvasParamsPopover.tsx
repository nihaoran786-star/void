/**
 * Generation parameter popover (P4 W3, plan §2.2).
 *
 * Every choice offered here comes from the front-end capability table, which
 * mirrors `agentic/media/capabilities.rs`: the popover never invents a value
 * the backend would reject. Switching the model re-clamps the whole set, so
 * an aspect ratio or resolution the new model does not support simply falls
 * back to "provider default" instead of travelling on and failing the card.
 *
 * The component is controlled: each change reports the complete next set and
 * the panel persists it onto the node. There is no local draft to get out of
 * sync with the document.
 */
import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import type {
  InfiniteCanvasGenerationMediaKind,
  InfiniteCanvasGenerationParams,
} from '@/shared/services/infinite-canvas';
import {
  defaultInfiniteCanvasModelId,
  INFINITE_CANVAS_MAX_BATCH_SIZE,
  listInfiniteCanvasModels,
  normalizeInfiniteCanvasGenerationParamsWithReport,
  resolveInfiniteCanvasModelCapability,
} from '@/shared/services/infinite-canvas';

/** Sentinel for "send nothing, let the provider decide". */
const PROVIDER_DEFAULT = '';

export interface InfiniteCanvasParamsPopoverProps {
  mediaKind: InfiniteCanvasGenerationMediaKind;
  params?: InfiniteCanvasGenerationParams;
  onChange: (params: InfiniteCanvasGenerationParams) => void;
  onClose: () => void;
}

export const InfiniteCanvasParamsPopover: React.FC<InfiniteCanvasParamsPopoverProps> = ({
  mediaKind,
  params,
  onChange,
  onClose,
}) => {
  const { t } = useI18n('components');
  const models = listInfiniteCanvasModels(mediaKind);
  const capability = resolveInfiniteCanvasModelCapability(mediaKind, params?.model);
  const isImage = capability.mediaKind === 'image';
  const selectedModelId = capability.modelId;

  /**
   * P4 review C7: what the last change could not carry over. Switching to a
   * model with a narrower allow list still drops the value — that is correct,
   * a made-up substitute would be worse — but it now says so instead of the
   * control quietly snapping back to "provider default".
   */
  const [dropped, setDropped] = React.useState<string[]>([]);

  const update = React.useCallback((
    patch: Partial<InfiniteCanvasGenerationParams>,
    model?: string,
  ) => {
    const normalized = normalizeInfiniteCanvasGenerationParamsWithReport(
      { ...params, ...patch },
      mediaKind,
      model,
    );
    setDropped(normalized.dropped);
    onChange(normalized.params);
  }, [mediaKind, onChange, params]);

  const ratios = capability.mediaKind === 'image'
    ? capability.sizes
    : capability.aspectRatios;
  const ratioValue = (capability.mediaKind === 'image' ? params?.size : params?.aspectRatio)
    ?? PROVIDER_DEFAULT;

  return (
    <aside
      className="infinite-canvas-picker infinite-canvas-picker--params"
      aria-label={t('infiniteCanvas.params.title')}
      data-media-kind={mediaKind}
    >
      <header className="infinite-canvas-picker__header">
        <h4>{t('infiniteCanvas.params.title')}</h4>
        <button
          type="button"
          className="infinite-canvas-picker__close"
          onClick={onClose}
        >
          {t('infiniteCanvas.params.close')}
        </button>
      </header>
      {dropped.length > 0 ? (
        <p
          className="infinite-canvas-picker__notice"
          role="status"
          data-params-dropped={dropped.join(',')}
        >
          {t('infiniteCanvas.params.dropped', { values: dropped.join(', ') })}
        </p>
      ) : null}
      <div className="infinite-canvas-picker__filters">
        <label className="infinite-canvas-picker__filter">
          <span>{t('infiniteCanvas.params.model')}</span>
          <select
            data-params-field="model"
            value={selectedModelId}
            onChange={event => update({}, event.target.value)}
          >
            {models.map(model => (
              <option key={model.modelId} value={model.modelId}>
                {model.modelId === defaultInfiniteCanvasModelId(mediaKind)
                  ? `${model.modelId} (${t('infiniteCanvas.params.defaultModel')})`
                  : model.modelId}
              </option>
            ))}
          </select>
        </label>
        <label className="infinite-canvas-picker__filter">
          <span>{t('infiniteCanvas.params.aspectRatio')}</span>
          <select
            data-params-field="aspectRatio"
            value={ratioValue}
            onChange={event => {
              const value = event.target.value || undefined;
              update(isImage ? { size: value } : { aspectRatio: value });
            }}
          >
            <option value={PROVIDER_DEFAULT}>{t('infiniteCanvas.params.providerDefault')}</option>
            {ratios.map(ratio => (
              <option key={ratio} value={ratio}>{ratio}</option>
            ))}
          </select>
        </label>
        {capability.resolutions.length > 0 ? (
          <label className="infinite-canvas-picker__filter">
            <span>{t('infiniteCanvas.params.resolution')}</span>
            <select
              data-params-field="resolution"
              value={params?.resolution ?? PROVIDER_DEFAULT}
              onChange={event => update({ resolution: event.target.value || undefined })}
            >
              <option value={PROVIDER_DEFAULT}>
                {t('infiniteCanvas.params.providerDefault')}
              </option>
              {capability.resolutions.map(resolution => (
                <option key={resolution} value={resolution}>{resolution}</option>
              ))}
            </select>
          </label>
        ) : null}
        {capability.mediaKind === 'image' ? (() => {
          // P4 W4: the batch selector only offers what the chosen model can
          // actually produce in one call. gpt-image-2 is pinned to 1 by the
          // Rust capability table, so the control is disabled there with the
          // reason spelled out instead of silently missing.
          const nMax = Math.min(capability.nMax, INFINITE_CANVAS_MAX_BATCH_SIZE);
          const counts = Array.from({ length: nMax }, (_unused, index) => index + 1);
          const locked = nMax <= 1;
          return (
            <label className="infinite-canvas-picker__filter">
              <span>{t('infiniteCanvas.params.count')}</span>
              <select
                data-params-field="count"
                value={String(Math.min(params?.n ?? 1, nMax))}
                disabled={locked}
                onChange={event => update({ n: Number(event.target.value) })}
              >
                {counts.map(count => (
                  <option key={count} value={String(count)}>{String(count)}</option>
                ))}
              </select>
              <small className="infinite-canvas-picker__hint" data-params-hint="count">
                {locked
                  ? t('infiniteCanvas.params.countLocked')
                  : t('infiniteCanvas.params.countBilling')}
              </small>
            </label>
          );
        })() : null}
        {capability.mediaKind === 'video' ? (
          <label className="infinite-canvas-picker__filter">
            <span>{t('infiniteCanvas.params.duration')}</span>
            <select
              data-params-field="duration"
              value={params?.duration === undefined ? PROVIDER_DEFAULT : String(params.duration)}
              onChange={event => update({
                duration: event.target.value ? Number(event.target.value) : undefined,
              })}
            >
              <option value={PROVIDER_DEFAULT}>
                {t('infiniteCanvas.params.providerDefault')}
              </option>
              {capability.durations.map(duration => (
                <option key={duration} value={String(duration)}>{`${duration}s`}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </aside>
  );
};

InfiniteCanvasParamsPopover.displayName = 'InfiniteCanvasParamsPopover';
