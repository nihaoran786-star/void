/**
 * P5 W2: the crop editor — "keep this bit of the picture".
 *
 * A full-panel editing state, same shell as the mask editor. Drag a frame over
 * the picture, confirm, and the panel writes the cut PNG into
 * `media/input/canvas-crops/` and grows a derived card that points at it. The
 * original card and its file are not touched, nothing is submitted anywhere,
 * and no quota is spent — cropping is a purely local operation and the copy
 * says so.
 *
 * Two lessons from earlier phases are honoured here on purpose:
 *
 * - **Nothing is shown before it has been measured.** The crop frame's
 *   geometry comes from the picture's natural size, which is only known after
 *   `createImageBitmap` resolves; until then the whole surface stays
 *   invisible rather than snapping from a guessed box to the real one.
 * - **The frame is positioned in PERCENTAGES of the picture**, so pan, zoom and
 *   window resizes cannot desynchronise it from the image underneath, and no
 *   layout measurement enters the render path at all. The rectangle itself is
 *   kept in natural pixels, which is what the crop needs.
 */
import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import {
  CANVAS_CROP_MIN_SIZE,
  clampCropRect,
  cropBitmap,
  exportCanvasPngBase64,
  isCropRectUsable,
  loadCanvasImageBitmap,
  toNaturalPoint,
  type CanvasRect,
} from './infiniteCanvasImageRaster';
import { useInfiniteCanvasDismiss } from './useInfiniteCanvasDismiss';
import type {
  InfiniteCanvasImagePreviewResolver,
  InfiniteCanvasMediaRef,
} from './InfiniteCanvasNodes';

/** Corner handles, in render order. */
const CROP_HANDLES = ['nw', 'ne', 'sw', 'se'] as const;

type CropHandle = typeof CROP_HANDLES[number];

export interface InfiniteCanvasCropEditorProps {
  mediaRef: InfiniteCanvasMediaRef;
  /** Always the forceDataUrl resolver: the export lane needs a data URL. */
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
  /** Bare base64 PNG of the cut region, plus the rectangle that produced it. */
  onConfirm: (payload: { base64Png: string; rect: CanvasRect }) => void;
  onClose: () => void;
}

/** The frame the editor opens with: centred, 80% of each axis. */
function initialCropRect(width: number, height: number): CanvasRect {
  const cropWidth = Math.max(1, Math.round(width * 0.8));
  const cropHeight = Math.max(1, Math.round(height * 0.8));
  return {
    x: Math.round((width - cropWidth) / 2),
    y: Math.round((height - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight,
  };
}

export const InfiniteCanvasCropEditor: React.FC<InfiniteCanvasCropEditorProps> = ({
  mediaRef,
  resolvePreviewUrl,
  onConfirm,
  onClose,
}) => {
  const { t } = useI18n('components');
  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>(undefined);
  const [bitmap, setBitmap] = React.useState<ImageBitmap | undefined>(undefined);
  const [failed, setFailed] = React.useState(false);
  const [rect, setRect] = React.useState<CanvasRect | undefined>(undefined);
  const [moved, setMoved] = React.useState(false);
  const [discarding, setDiscarding] = React.useState(false);

  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{
    handle: CropHandle | 'move';
    origin: { x: number; y: number };
    start: CanvasRect;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setBitmap(undefined);
    setRect(undefined);
    setMoved(false);
    setFailed(false);
    void (async () => {
      try {
        const url = await resolvePreviewUrl(mediaRef, 'image');
        if (cancelled) return;
        if (!url) {
          setFailed(true);
          return;
        }
        setPreviewUrl(url);
        // The one decode lane (see infiniteCanvasImageRaster): never <img>.
        const decoded = await loadCanvasImageBitmap(url);
        if (cancelled) return;
        setBitmap(decoded);
        setRect(initialCropRect(decoded.width, decoded.height));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mediaRef, resolvePreviewUrl]);

  const natural = React.useMemo(
    () => ({ width: bitmap?.width ?? 0, height: bitmap?.height ?? 0 }),
    [bitmap],
  );
  const ready = Boolean(bitmap) && rect !== undefined && natural.width > 0;

  const pointOf = React.useCallback((event: React.MouseEvent) => {
    const frame = frameRef.current;
    if (!frame) return { x: 0, y: 0 };
    const box = frame.getBoundingClientRect();
    return toNaturalPoint(
      { clientX: event.clientX, clientY: event.clientY },
      { left: box.left, top: box.top, width: box.width, height: box.height },
      natural,
    );
  }, [natural]);

  const beginDrag = React.useCallback((
    event: React.MouseEvent,
    handle: CropHandle | 'move',
  ) => {
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { handle, origin: pointOf(event), start: rect };
  }, [pointOf, rect]);

  const onFrameMouseMove = React.useCallback((event: React.MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = pointOf(event);
    const dx = point.x - drag.origin.x;
    const dy = point.y - drag.origin.y;
    const start = drag.start;
    let next: CanvasRect;
    if (drag.handle === 'move') {
      next = { ...start, x: start.x + dx, y: start.y + dy };
    } else {
      const west = drag.handle === 'nw' || drag.handle === 'sw';
      const north = drag.handle === 'nw' || drag.handle === 'ne';
      const left = west ? start.x + dx : start.x;
      const top = north ? start.y + dy : start.y;
      const width = west ? start.width - dx : start.width + dx;
      const height = north ? start.height - dy : start.height + dy;
      // A handle dragged past the opposite edge flips the rectangle rather
      // than collapsing it, which is what every crop tool does.
      next = {
        x: width < 0 ? left + width : left,
        y: height < 0 ? top + height : top,
        width: Math.abs(width),
        height: Math.abs(height),
      };
    }
    setRect(clampCropRect(next, natural));
    setMoved(true);
  }, [natural, pointOf]);

  const endDrag = React.useCallback(() => {
    dragRef.current = null;
  }, []);

  const requestClose = React.useCallback(() => {
    if (moved && !discarding) {
      setDiscarding(true);
      return;
    }
    onClose();
  }, [discarding, moved, onClose]);

  const surfaceRef = useInfiniteCanvasDismiss<HTMLDivElement>({ onDismiss: requestClose });

  const canConfirm = ready && isCropRectUsable(rect, CANVAS_CROP_MIN_SIZE);

  const confirm = React.useCallback(() => {
    if (!bitmap || !rect || !canConfirm) return;
    try {
      const clamped = clampCropRect(rect, natural);
      const cut = cropBitmap(bitmap, clamped);
      onConfirm({ base64Png: exportCanvasPngBase64(cut), rect: clamped });
    } catch {
      setFailed(true);
    }
  }, [bitmap, canConfirm, natural, onConfirm, rect]);

  const percent = (value: number, total: number) => (
    total > 0 ? `${(value / total) * 100}%` : '0%'
  );

  return (
    <div
      className="infinite-canvas-crop"
      data-canvas-editor="crop"
      // Measure-before-show: the frame's geometry is derived from the natural
      // size, so the surface stays invisible until that number exists.
      data-ready={ready ? 'true' : 'false'}
      role="dialog"
      aria-label={t('infiniteCanvas.crop.title')}
      ref={surfaceRef}
    >
      <div className="infinite-canvas-crop__backdrop" aria-hidden="true" />
      <div className="infinite-canvas-crop__bar">
        <span className="infinite-canvas-crop__hint">{t('infiniteCanvas.crop.hint')}</span>
        <span className="infinite-canvas-crop__spacer" />
        <span className="infinite-canvas-crop__size" data-crop-size="true">
          {rect ? `${rect.width} × ${rect.height}` : ''}
        </span>
        <button
          type="button"
          className="infinite-canvas-crop__confirm"
          data-crop-action="confirm"
          disabled={!canConfirm}
          onClick={confirm}
        >
          {t('infiniteCanvas.crop.confirm')}
        </button>
      </div>
      <div className="infinite-canvas-crop__stage">
        {failed ? (
          <p className="infinite-canvas-crop__placeholder" role="alert">
            {t('infiniteCanvas.crop.unavailable')}
          </p>
        ) : (
          <div
            className="infinite-canvas-crop__frame"
            ref={frameRef}
            onMouseMove={onFrameMouseMove}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
          >
            {previewUrl ? (
              <img
                className="infinite-canvas-crop__image"
                src={previewUrl}
                alt=""
                draggable={false}
              />
            ) : null}
            {rect ? (
              <div
                className="infinite-canvas-crop__rect"
                data-crop-rect="true"
                data-crop-x={rect.x}
                data-crop-y={rect.y}
                data-crop-width={rect.width}
                data-crop-height={rect.height}
                style={{
                  left: percent(rect.x, natural.width),
                  top: percent(rect.y, natural.height),
                  width: percent(rect.width, natural.width),
                  height: percent(rect.height, natural.height),
                }}
                onMouseDown={event => beginDrag(event, 'move')}
              >
                {/* Rule-of-thirds guides; decoration only, no pointer surface. */}
                <span className="infinite-canvas-crop__thirds" aria-hidden="true" />
                {CROP_HANDLES.map(handle => (
                  <span
                    key={handle}
                    className="infinite-canvas-crop__handle"
                    data-crop-handle={handle}
                    onMouseDown={event => beginDrag(event, handle)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
      {discarding ? (
        <div
          className="infinite-canvas-dialog infinite-canvas-dialog--confirm"
          role="dialog"
          aria-label={t('infiniteCanvas.crop.discardTitle')}
          data-canvas-confirm="crop-discard"
        >
          <div className="infinite-canvas-dialog__header">
            <h4>{t('infiniteCanvas.crop.discardTitle')}</h4>
            <button
              type="button"
              className="infinite-canvas-dialog__close"
              data-canvas-confirm-action="cancel"
              onClick={() => setDiscarding(false)}
            >
              {t('infiniteCanvas.crop.discardCancel')}
            </button>
          </div>
          <p className="infinite-canvas-dialog__hint infinite-canvas-dialog__hint--strong">
            {t('infiniteCanvas.crop.discardBody')}
          </p>
          <div className="infinite-canvas-dialog__actions">
            <button
              type="button"
              className="infinite-canvas-dialog__confirm"
              data-canvas-confirm-action="confirm"
              onClick={onClose}
            >
              {t('infiniteCanvas.crop.discardConfirm')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

InfiniteCanvasCropEditor.displayName = 'InfiniteCanvasCropEditor';
