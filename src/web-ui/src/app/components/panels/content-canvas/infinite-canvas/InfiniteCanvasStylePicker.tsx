/**
 * Style preset picker (M4): a tile grid over the read-only StylePresetCatalog,
 * filterable by family and category. Choosing a preset only reports its ID;
 * the node keeps a reference, never a copy.
 *
 * Owner feedback 2026-08-26: tightened to the same anchored compact popover
 * the parameter surface uses. The family dropdown and the category row now
 * share one filter line, the tiles are smaller and denser, and there is no
 * close button — pressing outside or Escape closes it.
 *
 * P5 slice W6: the 161 cinematic / animation-2d presets now carry a real
 * thumbnail. Two rules hold the surface together:
 *
 * 1. The popover does not grow. Adding pictures must not turn a compact
 *    anchored surface into a page (visual language §7.1: width 320, capped
 *    height, internal scroll).
 * 2. There is no half-finished tile. The 156 midjourney / mg-motion presets
 *    have no upstream image and never will, and a thumbnail can also fail to
 *    load; both cases render the same finished swatch tile, never an empty
 *    frame and never the browser's broken-image glyph.
 *
 * Thumbnails are static assets under `public/`, referenced by plain relative
 * URL. They are deliberately NOT routed through the workspace media preview
 * resolver or `convertFileSrc`: those exist for workspace files, and mixing
 * the two resolution schemes is exactly the mistake this project has already
 * paid for twice.
 */
import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import type { StylePreset, StylePresetCatalog, StylePresetFamily } from '@/shared/services/style-preset';
import { stylePresetCatalog } from '@/shared/services/style-preset';
import { InfiniteCanvasPopover } from './InfiniteCanvasPopover';
import { infiniteCanvasStyleSwatch } from './infiniteCanvasStyleSwatch';

const FAMILIES: readonly { family: StylePresetFamily; labelKey: string }[] = [
  { family: 'cinematic', labelKey: 'infiniteCanvas.stylePicker.families.cinematic' },
  { family: 'animation-2d', labelKey: 'infiniteCanvas.stylePicker.families.animation2d' },
  { family: 'midjourney', labelKey: 'infiniteCanvas.stylePicker.families.midjourney' },
  { family: 'mg-motion', labelKey: 'infiniteCanvas.stylePicker.families.mgMotion' },
];

const ALL_CATEGORIES = '';

/** §7 after owner feedback: a compact anchored popover, not a page. */
const STYLE_POPOVER_WIDTH = 320;

interface StyleTileProps {
  preset: StylePreset;
  selected: boolean;
  onPick: (presetId: string) => void;
}

/**
 * One grid tile.
 *
 * `failed` is local to the tile so a single 404 degrades that tile alone;
 * remounting the grid (a filter change) legitimately retries, because a
 * missing file and a transient decode failure are indistinguishable here.
 */
const StyleTile: React.FC<StyleTileProps> = ({ preset, selected, onPick }) => {
  const [failed, setFailed] = React.useState(false);
  const swatch = React.useMemo(
    () => infiniteCanvasStyleSwatch(preset.presetId, preset.name),
    [preset.presetId, preset.name],
  );
  /**
   * P5 review P17: `thumbnailRef` is stored relative
   * (`style-presets/…/x.webp`), so a browser resolves it against whatever the
   * current route happens to be and 404s from any nested path. These files
   * live under `public/`, which is served from the root, so the leading slash
   * is the only correct form.
   */
  const thumbnailSrc = preset.thumbnailRef
    ? (preset.thumbnailRef.startsWith('/') ? preset.thumbnailRef : `/${preset.thumbnailRef}`)
    : undefined;
  const showThumbnail = Boolean(thumbnailSrc) && !failed;

  return (
    <button
      type="button"
      className="infinite-canvas-picker__item"
      data-canvas-style-preset={preset.presetId}
      data-selected={selected ? 'true' : undefined}
      onClick={() => onPick(preset.presetId)}
    >
      {showThumbnail ? (
        <img
          className="infinite-canvas-picker__thumbnail"
          src={thumbnailSrc}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="infinite-canvas-picker__swatch"
          style={{ '--swatch-hue': swatch.hue } as React.CSSProperties}
          data-canvas-style-swatch="true"
          aria-hidden="true"
        >
          {swatch.label}
        </span>
      )}
      <span className="infinite-canvas-picker__item-name">{preset.name}</span>
      <span className="infinite-canvas-picker__item-meta">{preset.category}</span>
    </button>
  );
};

StyleTile.displayName = 'InfiniteCanvasStyleTile';

interface InfiniteCanvasStylePickerProps {
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
              <StyleTile
                preset={preset}
                selected={preset.presetId === currentPresetId}
                onPick={onPick}
              />
            </li>
          ))}
        </ul>
      )}
    </InfiniteCanvasPopover>
  );
};

InfiniteCanvasStylePicker.displayName = 'InfiniteCanvasStylePicker';
