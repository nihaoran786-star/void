/**
 * The model list popover (visual language §7.3-A and §7.3-C).
 *
 * §7.3-A splits what used to be one crowded surface in two: pressing the MODEL
 * NAME in the generator's bottom bar opens this list, pressing the parameter
 * summary pill opens {@link InfiniteCanvasParamsPopover}. They are mutually
 * exclusive — the panel closes one when it opens the other — so neither has to
 * host the other's controls.
 *
 * §7.3-C describes the row: one model per line, the model name on top and a row
 * of very small outlined capability chips under it (resolution, duration span,
 * a speaker when the model has sound). Those chips come from
 * `infiniteCanvasModelChips`, which reads the capability table and nothing
 * else. The current model is highlighted; the list scrolls inside the surface.
 *
 * Choosing a model re-clamps the whole parameter set through the shared
 * normalizer, exactly as the parameter popover does, so a switch can never
 * carry a value the new model would reject.
 */
import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import type {
  InfiniteCanvasGenerationMediaKind,
  InfiniteCanvasGenerationParams,
} from '@/shared/services/infinite-canvas';
import {
  defaultInfiniteCanvasModelId,
  listInfiniteCanvasModels,
  normalizeInfiniteCanvasGenerationParamsWithReport,
  resolveInfiniteCanvasModelCapability,
} from '@/shared/services/infinite-canvas';
import { infiniteCanvasModelChips } from './infiniteCanvasModelChips';
import { InfiniteCanvasPopover } from './InfiniteCanvasPopover';

/** §7.1 keeps every canvas popover in the 260–320px band. */
const MODEL_POPOVER_WIDTH = 300;

const ModelIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path
      d="M8 2.2 13.4 5.4v5.2L8 13.8 2.6 10.6V5.4Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinejoin="round"
    />
    <path d="M8 8.1 13.4 5.4M8 8.1 2.6 5.4M8 8.1v5.7" fill="none" stroke="currentColor" strokeWidth="0.9" />
  </svg>
);

ModelIcon.displayName = 'InfiniteCanvasModelIcon';

const SpeakerIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
    <path
      d="M3.4 6.2h2.1L8.4 4v8L5.5 9.8H3.4Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinejoin="round"
    />
    <path d="M10.6 6a2.8 2.8 0 0 1 0 4" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
  </svg>
);

SpeakerIcon.displayName = 'InfiniteCanvasSpeakerIcon';

export interface InfiniteCanvasModelPopoverProps {
  mediaKind: InfiniteCanvasGenerationMediaKind;
  params?: InfiniteCanvasGenerationParams;
  /** The model name in the generator's bottom bar. */
  anchor?: HTMLElement | null;
  onChange: (params: InfiniteCanvasGenerationParams) => void;
  onClose: () => void;
}

export const InfiniteCanvasModelPopover: React.FC<InfiniteCanvasModelPopoverProps> = ({
  mediaKind,
  params,
  anchor,
  onChange,
  onClose,
}) => {
  const { t } = useI18n('components');
  const models = listInfiniteCanvasModels(mediaKind);
  const selectedModelId = resolveInfiniteCanvasModelCapability(mediaKind, params?.model).modelId;
  const defaultModelId = defaultInfiniteCanvasModelId(mediaKind);

  /**
   * P4 review C7, carried over from the parameter popover: a switch to a
   * narrower model still DROPS what it cannot keep, but says so. The list stays
   * open after a pick so that sentence is read where the switch happened.
   */
  const [dropped, setDropped] = React.useState<string[]>([]);

  const pick = React.useCallback((modelId: string) => {
    const normalized = normalizeInfiniteCanvasGenerationParamsWithReport(params, mediaKind, modelId);
    setDropped(normalized.dropped);
    onChange(normalized.params);
  }, [mediaKind, onChange, params]);

  return (
    <InfiniteCanvasPopover
      kind="model"
      className="infinite-canvas-picker--models"
      anchor={anchor}
      width={MODEL_POPOVER_WIDTH}
      label={t('infiniteCanvas.params.model')}
      onDismiss={onClose}
    >
      {dropped.length > 0 ? (
        <p
          className="infinite-canvas-picker__notice"
          role="status"
          data-params-dropped={dropped.join(',')}
        >
          {t('infiniteCanvas.params.dropped', { values: dropped.join(', ') })}
        </p>
      ) : null}
      <div
        className="infinite-canvas-models"
        data-params-field="model"
        data-params-value={selectedModelId}
        role="listbox"
        aria-label={t('infiniteCanvas.params.model')}
      >
        {models.map(model => {
          const chips = infiniteCanvasModelChips(model);
          const selected = model.modelId === selectedModelId;
          return (
            <button
              key={model.modelId}
              type="button"
              role="option"
              className="infinite-canvas-models__item"
              data-params-option={model.modelId}
              data-selected={selected ? 'true' : undefined}
              aria-selected={selected}
              onClick={() => pick(model.modelId)}
            >
              <span className="infinite-canvas-models__icon" aria-hidden="true">
                <ModelIcon />
              </span>
              <span className="infinite-canvas-models__body">
                <span className="infinite-canvas-models__name">
                  {model.modelId}
                  {model.modelId === defaultModelId ? (
                    <small className="infinite-canvas-models__default">
                      {t('infiniteCanvas.params.defaultModel')}
                    </small>
                  ) : null}
                </span>
                <span className="infinite-canvas-models__chips" data-model-chips={model.modelId}>
                  {chips.resolution ? (
                    <span className="infinite-canvas-models__chip" data-model-chip="resolution">
                      {chips.resolution}
                    </span>
                  ) : null}
                  {chips.duration ? (
                    <span className="infinite-canvas-models__chip" data-model-chip="duration">
                      {chips.duration}
                    </span>
                  ) : null}
                  {chips.hasAudio ? (
                    <span
                      className="infinite-canvas-models__chip infinite-canvas-models__chip--icon"
                      data-model-chip="audio"
                      role="img"
                      aria-label={t('infiniteCanvas.params.hasAudio')}
                      title={t('infiniteCanvas.params.hasAudio')}
                    >
                      <SpeakerIcon />
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </InfiniteCanvasPopover>
  );
};

InfiniteCanvasModelPopover.displayName = 'InfiniteCanvasModelPopover';
