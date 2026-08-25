/**
 * Generation parameter popover (P4 W3, plan §2.2), reworked for the visual
 * language §7: one dark rounded surface, a one-line title, compact groups and
 * values as small pill buttons. Values a model cannot produce are not offered
 * at all rather than stacked up greyed out.
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

interface ParamOption {
  value: string;
  label: string;
}

/** One compact group: a small label and a dense row of value pills. */
const ParamGroup: React.FC<{
  field: string;
  label: string;
  value: string;
  options: readonly ParamOption[];
  /** The model pins this field to a single value; the row is read-only. */
  locked?: boolean;
  hint?: string;
  onPick: (value: string) => void;
}> = ({ field, label, value, options, locked, hint, onPick }) => (
  <div className="infinite-canvas-params__group">
    <span className="infinite-canvas-params__label">{label}</span>
    <div
      className="infinite-canvas-params__options"
      data-params-field={field}
      data-params-value={value}
      data-params-locked={locked ? 'true' : undefined}
      role="group"
      aria-label={label}
    >
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          className="infinite-canvas-params__option"
          data-params-option={option.value}
          data-selected={option.value === value ? 'true' : undefined}
          aria-pressed={option.value === value}
          disabled={locked}
          onClick={() => onPick(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
    {hint ? (
      <small className="infinite-canvas-params__hint" data-params-hint={field}>{hint}</small>
    ) : null}
  </div>
);

ParamGroup.displayName = 'InfiniteCanvasParamGroup';

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
  const providerDefaultOption: ParamOption = {
    value: PROVIDER_DEFAULT,
    label: t('infiniteCanvas.params.providerDefault'),
  };
  const nMax = capability.mediaKind === 'image'
    ? Math.min(capability.nMax, INFINITE_CANVAS_MAX_BATCH_SIZE)
    : 1;

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
      <div className="infinite-canvas-params">
        <ParamGroup
          field="model"
          label={t('infiniteCanvas.params.model')}
          value={selectedModelId}
          options={models.map(model => ({
            value: model.modelId,
            label: model.modelId === defaultInfiniteCanvasModelId(mediaKind)
              ? `${model.modelId} (${t('infiniteCanvas.params.defaultModel')})`
              : model.modelId,
          }))}
          onPick={value => update({}, value)}
        />
        <ParamGroup
          field="aspectRatio"
          label={t('infiniteCanvas.params.aspectRatio')}
          value={ratioValue}
          options={[
            providerDefaultOption,
            ...ratios.map(ratio => ({ value: ratio, label: ratio })),
          ]}
          onPick={raw => {
            const value = raw || undefined;
            update(isImage ? { size: value } : { aspectRatio: value });
          }}
        />
        {capability.resolutions.length > 0 ? (
          <ParamGroup
            field="resolution"
            label={t('infiniteCanvas.params.resolution')}
            value={params?.resolution ?? PROVIDER_DEFAULT}
            options={[
              providerDefaultOption,
              ...capability.resolutions.map(resolution => ({
                value: resolution,
                label: resolution,
              })),
            ]}
            onPick={raw => update({ resolution: raw || undefined })}
          />
        ) : null}
        {capability.mediaKind === 'image' ? (
          // P4 W4: the batch selector only offers what the chosen model can
          // actually produce in one call. gpt-image-2 is pinned to 1 by the
          // Rust capability table, so the row is read-only there with the
          // reason spelled out instead of silently missing.
          <ParamGroup
            field="count"
            label={t('infiniteCanvas.params.count')}
            value={String(Math.min(params?.n ?? 1, nMax))}
            options={Array.from({ length: nMax }, (_unused, index) => ({
              value: String(index + 1),
              label: String(index + 1),
            }))}
            locked={nMax <= 1}
            hint={nMax <= 1
              ? t('infiniteCanvas.params.countLocked')
              : t('infiniteCanvas.params.countBilling')}
            onPick={value => update({ n: Number(value) })}
          />
        ) : null}
        {capability.mediaKind === 'video' ? (
          <ParamGroup
            field="duration"
            label={t('infiniteCanvas.params.duration')}
            value={params?.duration === undefined ? PROVIDER_DEFAULT : String(params.duration)}
            options={[
              providerDefaultOption,
              ...capability.durations.map(duration => ({
                value: String(duration),
                label: `${duration}s`,
              })),
            ]}
            onPick={raw => update({ duration: raw ? Number(raw) : undefined })}
          />
        ) : null}
      </div>
    </aside>
  );
};

InfiniteCanvasParamsPopover.displayName = 'InfiniteCanvasParamsPopover';
