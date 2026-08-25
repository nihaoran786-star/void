/**
 * Style preset picker (M4): text-card list over the read-only
 * StylePresetCatalog, filterable by family and category. Choosing a preset
 * only reports its ID; the node keeps a reference, never a copy (phase 1
 * ships no thumbnails, per the K0-1 option-A decision).
 */
import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import type { StylePresetCatalog, StylePresetFamily } from '@/shared/services/style-preset';
import { stylePresetCatalog } from '@/shared/services/style-preset';

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

export interface InfiniteCanvasStylePickerProps {
  currentPresetId?: string;
  catalog?: StylePresetCatalog;
  onPick: (presetId: string | undefined) => void;
  onClose: () => void;
}

export const InfiniteCanvasStylePicker: React.FC<InfiniteCanvasStylePickerProps> = ({
  currentPresetId,
  catalog = stylePresetCatalog,
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
    <aside
      className="infinite-canvas-picker infinite-canvas-picker--style"
      aria-label={t('infiniteCanvas.stylePicker.title')}
    >
      <header className="infinite-canvas-picker__header">
        <h4>{t('infiniteCanvas.stylePicker.title')}</h4>
        <button
          type="button"
          className="infinite-canvas-picker__close"
          onClick={onClose}
        >
          {t('infiniteCanvas.stylePicker.close')}
        </button>
      </header>
      <div className="infinite-canvas-picker__filters">
        <label className="infinite-canvas-picker__filter">
          <span>{t('infiniteCanvas.stylePicker.familyLabel')}</span>
          <select
            value={family}
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
      </div>
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
        <ul className="infinite-canvas-picker__list">
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
    </aside>
  );
};

InfiniteCanvasStylePicker.displayName = 'InfiniteCanvasStylePicker';
