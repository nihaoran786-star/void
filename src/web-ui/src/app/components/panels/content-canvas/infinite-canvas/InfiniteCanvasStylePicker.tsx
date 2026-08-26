/**
 * Style preset picker (M4): text-card list over the read-only
 * StylePresetCatalog, filterable by family and category. Choosing a preset
 * only reports its ID; the node keeps a reference, never a copy (phase 1
 * ships no thumbnails, per the K0-1 option-A decision).
 *
 * Owner feedback 2026-08-26: tightened to the same anchored compact popover
 * the parameter surface uses. The family dropdown and the category row now
 * share one filter line, the tiles are smaller and denser, and there is no
 * close button — pressing outside or Escape closes it.
 */
import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import type { StylePresetCatalog, StylePresetFamily } from '@/shared/services/style-preset';
import { stylePresetCatalog } from '@/shared/services/style-preset';
import { InfiniteCanvasPopover } from './InfiniteCanvasPopover';

const FAMILIES: readonly { family: StylePresetFamily; labelKey: string }[] = [
  { family: 'cinematic', labelKey: 'infiniteCanvas.stylePicker.families.cinematic' },
  { family: 'animation-2d', labelKey: 'infiniteCanvas.stylePicker.families.animation2d' },
  { family: 'midjourney', labelKey: 'infiniteCanvas.stylePicker.families.midjourney' },
  { family: 'mg-motion', labelKey: 'infiniteCanvas.stylePicker.families.mgMotion' },
];

const ALL_CATEGORIES = '';

/** Stable pseudo-random hue per preset id; presentation only. */
function swatchHue(presetId: string): number {
  let hash = 0;
  for (let index = 0; index < presetId.length; index += 1) {
    hash = (hash * 31 + presetId.charCodeAt(index)) % 360;
  }
  return hash;
}

/** §7 after owner feedback: a compact anchored popover, not a page. */
const STYLE_POPOVER_WIDTH = 320;

export interface InfiniteCanvasStylePickerProps {
  currentPresetId?: string;
  catalog?: StylePresetCatalog;
  /** The control that opened it, for anchoring and press-outside handling. */
  anchor?: HTMLElement | null;
  onPick: (presetId: string | undefined) => void;
  onClose: () => void;
}

export const InfiniteCanvasStylePicker: React.FC<InfiniteCanvasStylePickerProps> = ({
  currentPresetId,
  catalog = stylePresetCatalog,
  anchor,
  onPick,
  onClose,
}) => {
  const { t } = useI18n('components');
  const [family, setFamily] = React.useState<StylePresetFamily>(
    () => (currentPresetId && catalog.getById(currentPresetId)?.family) || 'cinematic',
  );
  const [category, setCategory] = React.useState<string>(ALL_CATEGORIES);

  const categories = React.useMemo(
    () => catalog.listCategories(family),
    [catalog, family],
  );
  const presets = React.useMemo(
    () => (category === ALL_CATEGORIES
      ? catalog.listByFamily(family)
      : catalog.listByCategory(family, category)),
    [catalog, category, family],
  );

  return (
    <InfiniteCanvasPopover
      kind="style"
      className="infinite-canvas-picker--style"
      anchor={anchor}
      width={STYLE_POPOVER_WIDTH}
      label={t('infiniteCanvas.stylePicker.title')}
      onDismiss={onClose}
    >
      {/*
        Owner feedback 2026-08-26: the family dropdown and the category row are
        one compact filter line now, not two stacked blocks with a title bar
        between them.
      */}
      <div className="infinite-canvas-picker__filter-row">
        <label className="infinite-canvas-picker__filter">
          <span className="infinite-canvas-picker__visually-hidden">
            {t('infiniteCanvas.stylePicker.familyLabel')}
          </span>
          <select
            value={family}
            data-canvas-style-filter="family"
            onChange={event => {
              setFamily(event.target.value as StylePresetFamily);
              setCategory(ALL_CATEGORIES);
            }}
          >
            {FAMILIES.map(option => (
              <option key={option.family} value={option.family}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <div
          className="infinite-canvas-picker__pills"
          role="group"
          aria-label={t('infiniteCanvas.stylePicker.categoryLabel')}
        >
          <button
            type="button"
            className="infinite-canvas-picker__pill"
            data-active={category === ALL_CATEGORIES ? 'true' : undefined}
            aria-pressed={category === ALL_CATEGORIES}
            onClick={() => setCategory(ALL_CATEGORIES)}
          >
            {t('infiniteCanvas.stylePicker.allCategories')}
          </button>
          {categories.map(entry => (
            <button
              key={entry}
              type="button"
              className="infinite-canvas-picker__pill"
              data-active={category === entry ? 'true' : undefined}
              aria-pressed={category === entry}
              onClick={() => setCategory(entry)}
            >
              {entry}
            </button>
          ))}
        </div>
      </div>
      {currentPresetId ? (
        <button
          type="button"
          className="infinite-canvas-picker__clear"
          onClick={() => onPick(undefined)}
        >
          {t('infiniteCanvas.stylePicker.clear')}
        </button>
      ) : null}
      {presets.length === 0 ? (
        <p className="infinite-canvas-picker__state" data-state="empty">
          {t('infiniteCanvas.stylePicker.empty')}
        </p>
      ) : (
        <ul className="infinite-canvas-picker__list infinite-canvas-picker__list--dense">
          {presets.map(preset => (
            <li key={preset.presetId}>
              <button
                type="button"
                className="infinite-canvas-picker__item"
                data-selected={preset.presetId === currentPresetId ? 'true' : undefined}
                onClick={() => onPick(preset.presetId)}
              >
                {/*
                  §7: the grid wants a tile. There are no preset thumbnails
                  (K0-1 option A), so the tile is a flat colour block keyed off
                  the preset id — stable per preset, and never mistaken for a
                  real picture.
                */}
                <span
                  className="infinite-canvas-picker__swatch"
                  style={{ '--swatch-hue': swatchHue(preset.presetId) } as React.CSSProperties}
                  aria-hidden="true"
                />
                <span className="infinite-canvas-picker__item-name">{preset.name}</span>
                <span className="infinite-canvas-picker__item-meta">{preset.category}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </InfiniteCanvasPopover>
  );
};

InfiniteCanvasStylePicker.displayName = 'InfiniteCanvasStylePicker';
