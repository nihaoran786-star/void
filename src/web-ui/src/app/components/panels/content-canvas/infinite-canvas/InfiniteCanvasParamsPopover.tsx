/**
 * Generation parameter popover (P4 W3, plan §2.2), reshaped to the reference
 * screenshots in visual language §7.3-D.
 *
 * What changed in this round, one owner note at a time:
 *
 * - The MODEL list left this surface. §7.3-A splits the two: the model name in
 *   the generator's bottom bar opens {@link InfiniteCanvasModelPopover}, the
 *   parameter summary pill opens this one, and the panel keeps them mutually
 *   exclusive.
 * - Values are laid out as EQUAL-WIDTH segmented cells in a grid, not a flow of
 *   pills of different lengths wrapping into each other.
 * - Each ratio cell draws a little rectangle of that ratio, computed from the
 *   ratio itself, above its label. `auto` sorts to the front.
 * - Unsupported values are SHOWN, greyed and unclickable, with the reason in
 *   their title — reversing the earlier "hide what the model cannot do", which
 *   read as the feature not existing at all.
 *
 * Every cell still comes from the front-end capability table (the mirror of
 * `agentic/media/capabilities.rs`) via `infiniteCanvasParamOptions`: the
 * popover never invents a value the backend would reject, and picking one
 * re-clamps the whole set through the shared normalizer.
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
  INFINITE_CANVAS_MAX_BATCH_SIZE,
  normalizeInfiniteCanvasGenerationParamsWithReport,
  resolveInfiniteCanvasModelCapability,
} from '@/shared/services/infinite-canvas';
import {
  allowsValue,
  infiniteCanvasCountCells,
  infiniteCanvasDurationCells,
  infiniteCanvasRatioCells,
  infiniteCanvasRatioGlyph,
  infiniteCanvasResolutionCells,
  type InfiniteCanvasParamCell,
} from './infiniteCanvasParamOptions';
import { InfiniteCanvasPopover } from './InfiniteCanvasPopover';

/** Sentinel for "send nothing, let the provider decide". */
const PROVIDER_DEFAULT = '';

/** §7.1 keeps every canvas popover in the 260–320px band. */
const PARAMS_POPOVER_WIDTH = 300;

/** Side of the square each ratio preview is fitted into, in CSS pixels. */
const RATIO_GLYPH_BOX = 20;

interface ParamCellView extends InfiniteCanvasParamCell {
  /** The current model cannot produce this; shown, greyed, not clickable. */
  unavailable?: boolean;
}

/**
 * The ratio preview §7.3-D calls the most telling detail of the reference
 * shot: a rectangle of exactly this ratio, so `21:9` reads as a wide bar and
 * `9:16` as a tall one at a glance. Adaptive values have no shape and get a
 * dashed square instead.
 */
const RatioGlyph: React.FC<{ ratio: string }> = ({ ratio }) => {
  const shape = infiniteCanvasRatioGlyph(ratio, RATIO_GLYPH_BOX);
  const width = shape?.width ?? RATIO_GLYPH_BOX * 0.8;
  const height = shape?.height ?? RATIO_GLYPH_BOX * 0.8;
  return (
    <svg
      className="infinite-canvas-params__glyph"
      viewBox={`0 0 ${RATIO_GLYPH_BOX} ${RATIO_GLYPH_BOX}`}
      width={RATIO_GLYPH_BOX}
      height={RATIO_GLYPH_BOX}
      aria-hidden="true"
      data-ratio-glyph={ratio || 'default'}
      data-ratio-shape={shape ? 'exact' : 'adaptive'}
    >
      <rect
        x={(RATIO_GLYPH_BOX - width) / 2}
        y={(RATIO_GLYPH_BOX - height) / 2}
        width={width}
        height={height}
        rx={1.5}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeDasharray={shape ? undefined : '2 2'}
      />
    </svg>
  );
};

RatioGlyph.displayName = 'InfiniteCanvasRatioGlyph';

/**
 * One group: a small grey caption over a grid of equal-width cells. `variant`
 * only widens the grid track for the ratio group, which carries a glyph as well
 * as a label.
 */
const ParamGroup: React.FC<{
  field: string;
  label: string;
  value: string;
  cells: readonly ParamCellView[];
  variant?: 'ratio';
  /** The model pins this field to a single value; the whole row is read-only. */
  locked?: boolean;
  hint?: string;
  unavailableTitle: (cell: ParamCellView) => string;
  onPick: (value: string) => void;
}> = ({ field, label, value, cells, variant, locked, hint, unavailableTitle, onPick }) => (
  <div className="infinite-canvas-params__group">
    <span className="infinite-canvas-params__label">{label}</span>
    <div
      className={`infinite-canvas-params__options${
        variant === 'ratio' ? ' infinite-canvas-params__options--ratio' : ''
      }`}
      data-params-field={field}
      data-params-value={value}
      data-params-locked={locked ? 'true' : undefined}
      role="group"
      aria-label={label}
    >
      {cells.map(cell => {
        const disabled = Boolean(locked || cell.unavailable);
        return (
          <button
            key={cell.value}
            type="button"
            className="infinite-canvas-params__option"
            data-params-option={cell.value}
            data-selected={cell.value === value ? 'true' : undefined}
            data-params-unavailable={cell.unavailable ? 'true' : undefined}
            aria-pressed={cell.value === value}
            aria-disabled={disabled}
            disabled={disabled}
            title={cell.unavailable ? unavailableTitle(cell) : undefined}
            onClick={() => onPick(cell.value)}
          >
            {variant === 'ratio' ? <RatioGlyph ratio={cell.value} /> : null}
            <span className="infinite-canvas-params__option-label">{cell.label}</span>
          </button>
        );
      })}
    </div>
    {hint ? (
      <small className="infinite-canvas-params__hint" data-params-hint={field}>{hint}</small>
    ) : null}
  </div>
);

ParamGroup.displayName = 'InfiniteCanvasParamGroup';

interface InfiniteCanvasParamsPopoverProps {
  mediaKind: InfiniteCanvasGenerationMediaKind;
  params?: InfiniteCanvasGenerationParams;
  /** The control that opened it: the generator's parameter pill, usually. */
  anchor?: HTMLElement | null;
  onChange: (params: InfiniteCanvasGenerationParams) => void;
  onClose: () => void;
}

export const InfiniteCanvasParamsPopover: React.FC<InfiniteCanvasParamsPopoverProps> = ({
  mediaKind,
  params,
  anchor,
  onChange,
  onClose,
}) => {
  const { t } = useI18n('components');
  const capability = resolveInfiniteCanvasModelCapability(mediaKind, params?.model);
  const isImage = capability.mediaKind === 'image';
  const modelId = capability.modelId;

  /**
   * P4 review C7: what the last change could not carry over. Switching to a
   * model with a narrower allow list still drops the value — that is correct,
   * a made-up substitute would be worse — but it now says so instead of the
   * control quietly snapping back to "provider default".
   */
  const [dropped, setDropped] = React.useState<string[]>([]);

  const update = React.useCallback((patch: Partial<InfiniteCanvasGenerationParams>) => {
    const normalized = normalizeInfiniteCanvasGenerationParamsWithReport(
      { ...params, ...patch },
      mediaKind,
    );
    setDropped(normalized.dropped);
    onChange(normalized.params);
  }, [mediaKind, onChange, params]);

  const providerDefaultCell: ParamCellView = {
    value: PROVIDER_DEFAULT,
    label: t('infiniteCanvas.params.providerDefault'),
  };
  const unavailableTitle = React.useCallback(
    (cell: ParamCellView) => t('infiniteCanvas.params.unsupported', {
      model: modelId,
      value: cell.label,
    }),
    [modelId, t],
  );

  const supportedRatios = isImage ? capability.sizes : capability.aspectRatios;
  const ratioCells: ParamCellView[] = [
    providerDefaultCell,
    ...infiniteCanvasRatioCells(mediaKind).map(cell => ({
      ...cell,
      unavailable: !allowsValue(supportedRatios, cell.value),
    })),
  ];
  const storedRatio = (isImage ? params?.size : params?.aspectRatio) ?? PROVIDER_DEFAULT;
  // The stored value carries the MODEL's spelling (`1k`); the cell carries the
  // shared one (`1K`). Match on the cell whose value folds to the same string.
  const cellValueFor = (cells: readonly ParamCellView[], stored: string): string =>
    cells.find(cell => cell.value.toLowerCase() === stored.toLowerCase())?.value
      ?? PROVIDER_DEFAULT;

  const resolutionCells: ParamCellView[] = [
    providerDefaultCell,
    ...infiniteCanvasResolutionCells(mediaKind).map(cell => ({
      ...cell,
      unavailable: !allowsValue(capability.resolutions, cell.value),
    })),
  ];

  const durationCells: ParamCellView[] = [
    providerDefaultCell,
    ...infiniteCanvasDurationCells(mediaKind).map(cell => ({
      ...cell,
      unavailable: capability.mediaKind !== 'video'
        || !capability.durations.includes(Number(cell.value)),
    })),
  ];

  const nMax = isImage
    ? Math.min(capability.nMax, INFINITE_CANVAS_MAX_BATCH_SIZE)
    : 1;
  const countCells: ParamCellView[] = infiniteCanvasCountCells(mediaKind).map(cell => ({
    ...cell,
    unavailable: Number(cell.value) > nMax,
  }));

  return (
    <InfiniteCanvasPopover
      kind="params"
      className="infinite-canvas-picker--params"
      anchor={anchor}
      width={PARAMS_POPOVER_WIDTH}
      label={t('infiniteCanvas.params.title')}
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
      <div className="infinite-canvas-params" data-media-kind={mediaKind}>
        <ParamGroup
          field="aspectRatio"
          variant="ratio"
          label={t('infiniteCanvas.params.aspectRatio')}
          value={cellValueFor(ratioCells, storedRatio)}
          cells={ratioCells}
          unavailableTitle={unavailableTitle}
          onPick={raw => {
            const value = raw || undefined;
            update(isImage ? { size: value } : { aspectRatio: value });
          }}
        />
        <ParamGroup
          field="resolution"
          label={t('infiniteCanvas.params.resolution')}
          value={cellValueFor(resolutionCells, params?.resolution ?? PROVIDER_DEFAULT)}
          cells={resolutionCells}
          hint={capability.resolutions.length === 0
            ? t('infiniteCanvas.params.resolutionLocked', { model: modelId })
            : undefined}
          locked={capability.resolutions.length === 0}
          unavailableTitle={unavailableTitle}
          onPick={raw => update({ resolution: raw || undefined })}
        />
        {mediaKind === 'video' ? (
          <ParamGroup
            field="duration"
            label={t('infiniteCanvas.params.duration')}
            value={params?.duration === undefined ? PROVIDER_DEFAULT : String(params.duration)}
            cells={durationCells}
            unavailableTitle={unavailableTitle}
            onPick={raw => update({ duration: raw ? Number(raw) : undefined })}
          />
        ) : null}
        {mediaKind === 'image' ? (
          // P4 W4: the batch cells stay visible on a model pinned to one image
          // (gpt-image-2 has `n_max = 1` in the Rust table); they are greyed and
          // the reason is written under the row.
          <ParamGroup
            field="count"
            label={t('infiniteCanvas.params.count')}
            value={String(Math.min(params?.n ?? 1, nMax))}
            cells={countCells}
            hint={nMax <= 1
              ? t('infiniteCanvas.params.countLocked')
              : t('infiniteCanvas.params.countBilling')}
            unavailableTitle={unavailableTitle}
            onPick={value => update({ n: Number(value) })}
          />
        ) : null}
      </div>
    </InfiniteCanvasPopover>
  );
};

InfiniteCanvasParamsPopover.displayName = 'InfiniteCanvasParamsPopover';
