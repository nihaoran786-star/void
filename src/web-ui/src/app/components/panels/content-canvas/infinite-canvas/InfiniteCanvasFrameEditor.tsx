/**
 * The frame editor — one box, two directions (visual language §7.4.1).
 *
 * Owner, 2026-08-28: expanding and cropping are technically the same thing; the
 * frame just goes outside the picture instead of inside it. This component
 * replaces the two that had grown for that one gesture
 * (`InfiniteCanvasCropEditor` and `InfiniteCanvasExpandEditor`). Handles,
 * dragging, clamping, the read-out and the keyboard are one implementation;
 * `direction` is the whole of the difference:
 *
 * - `inward` = **crop**: the box lives inside the picture; what is in it is
 *   kept. The cut PNG is written locally into `media/input/canvas-crops/` by
 *   the panel and grows a derived card. Nothing is submitted, nothing is
 *   charged.
 * - `outward` = **expand**: the box lives outside the picture; the gap between
 *   the two is what the model is asked to fill. The panel composites the
 *   picture onto a transparent canvas, writes it to scratch, and submits it
 *   through the existing generation gateway.
 *
 * Only the geometry and the interaction merged. **Both submit paths are exactly
 * what they were** — the payload carries the rectangle, the insets and the
 * resulting size, and the panel routes each direction down the lane it already
 * had.
 *
 * The rendering is one shape for both, which is what makes one set of grips
 * possible: a STAGE (whichever of picture and frame is larger), the picture
 * placed on it in percentages, and the box placed on it in percentages, with
 * the eight grips riding the box. The stage takes its size from its own
 * `aspect-ratio` against viewport caps and reads no layout measurement, so pan,
 * zoom and window resizes can never desynchronise the box from the picture.
 * Pointer deltas are scaled into natural pixels once per drag, from the
 * picture's box at mousedown.
 *
 * Everything around the stage is §7.4's shared shell: blurred plate, one
 * floating pill whose leftmost item is the `×`, and — outward only — the
 * board's own generator underneath. Closing never asks (§7.4.2).
 */
import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import type { CanvasExpandInsets } from '@/shared/services/infinite-canvas';
import {
  CanvasTooLargeError,
  cropBitmap,
  expandBitmap,
  exportCanvasPngBase64,
  loadCanvasImageBitmap,
  type CanvasRect,
  type CanvasSize,
} from './infiniteCanvasImageRaster';
import {
  CANVAS_FRAME_HANDLES,
  CANVAS_FRAME_KEY_STEP,
  CANVAS_FRAME_KEY_STEP_COARSE,
  canvasFrameLayout,
  canvasFrameReadout,
  canvasFrameSize,
  canvasFrameToRect,
  clampCanvasFrameEdges,
  dragCanvasFrameEdges,
  initialCanvasFrameEdges,
  isCanvasFrameConfirmable,
  moveCanvasFrameEdges,
  type CanvasFrameDirection,
  type CanvasFrameEdges,
  type CanvasFrameGrip,
  type CanvasFrameHandle,
} from './infiniteCanvasFrameGeometry';
import { InfiniteCanvasMediaStage } from './InfiniteCanvasMediaStage';
import {
  InfiniteCanvasGenerator,
  type InfiniteCanvasEditorGeneratorProps,
} from './InfiniteCanvasGenerator';
import type {
  InfiniteCanvasImagePreviewResolver,
  InfiniteCanvasMediaRef,
} from './InfiniteCanvasNodes';

/** What each direction is called in the i18n bundle and in `data-*`. */
const LANE: Record<CanvasFrameDirection, 'crop' | 'expand'> = {
  inward: 'crop',
  outward: 'expand',
};

/** Which way each arrow key pushes, in client pixels. */
const ARROW_DELTAS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export interface InfiniteCanvasFrameEditorConfirmPayload {
  /** Bare base64 PNG: the cut for inward, the composite for outward. */
  base64Png: string;
  /**
   * What the user typed underneath, trimmed; `''` when they typed nothing.
   *
   * §7.4.4 (owner 2026-08-28: "然后下面再打字"): the outward lane keeps the
   * shared input's writing area, so the user may describe what should appear
   * in the room they just made. It is optional — an empty sentence still
   * sends, and the lane falls back to "continue the existing scene".
   */
  prompt: string;
  /** The box in natural pixels, relative to the picture's origin. */
  rect: CanvasRect;
  /** The same box as outward insets; all zeros unless it was dragged out. */
  insets: CanvasExpandInsets;
  /** The size of the picture that was produced. */
  size: CanvasSize;
}

export interface InfiniteCanvasFrameEditorProps {
  /** `inward` crops, `outward` expands. The whole of the difference. */
  direction: CanvasFrameDirection;
  mediaRef: InfiniteCanvasMediaRef;
  /** Always the forceDataUrl resolver: the export lane needs a data URL. */
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
  /**
   * The shared board generator. Outward mounts it whole — writing area
   * included (§7.4.4) — and sends from its round button; inward has no prompt
   * at all and passes none, which is why inward is the one surface whose
   * primary action is still in the pill (§7.2.1, unchanged by §7.4).
   */
  generator?: InfiniteCanvasEditorGeneratorProps;
  onConfirm: (payload: InfiniteCanvasFrameEditorConfirmPayload) => void;
  onClose: () => void;
}

interface FrameDrag {
  grip: CanvasFrameGrip;
  originX: number;
  originY: number;
  start: CanvasFrameEdges;
  /** Natural pixels per client pixel, frozen at mousedown. */
  scaleX: number;
  scaleY: number;
}

export const InfiniteCanvasFrameEditor: React.FC<InfiniteCanvasFrameEditorProps> = ({
  direction,
  mediaRef,
  resolvePreviewUrl,
  generator,
  onConfirm,
  onClose,
}) => {
  const { t } = useI18n('components');
  const lane = LANE[direction];
  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>(undefined);
  const [bitmap, setBitmap] = React.useState<ImageBitmap | undefined>(undefined);
  const [failed, setFailed] = React.useState(false);
  /** Export-time failure, kept apart from a decode failure (review P11). */
  const [exportError, setExportError] =
    React.useState<'too-large' | 'failed' | undefined>(undefined);
  const [edges, setEdges] = React.useState<CanvasFrameEdges | undefined>(undefined);

  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const dragRef = React.useRef<FrameDrag | null>(null);
  /**
   * Mirrors `dragRef` as state purely so the window listeners below can be
   * subscribed for exactly as long as a drag lasts.
   */
  const [dragging, setDragging] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setBitmap(undefined);
    setEdges(undefined);
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
        setEdges(initialCanvasFrameEdges(direction, decoded));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [direction, mediaRef, resolvePreviewUrl]);

  const natural = React.useMemo(
    () => ({ width: bitmap?.width ?? 0, height: bitmap?.height ?? 0 }),
    [bitmap],
  );
  const ready = Boolean(bitmap) && edges !== undefined && natural.width > 0;

  /** One place where a client delta becomes natural pixels and a new box. */
  const applyDelta = React.useCallback((drag: FrameDrag, dx: number, dy: number) => {
    const naturalDx = dx * drag.scaleX;
    const naturalDy = dy * drag.scaleY;
    const next = drag.grip === 'move'
      ? moveCanvasFrameEdges(drag.start, naturalDx, naturalDy)
      : dragCanvasFrameEdges(drag.start, drag.grip, naturalDx, naturalDy);
    setEdges(clampCanvasFrameEdges(direction, next, natural));
  }, [direction, natural]);

  const beginDrag = React.useCallback((
    event: React.MouseEvent,
    grip: CanvasFrameGrip,
  ) => {
    if (!ready || !edges) return;
    // Panning the box only means something inside the picture; an outward
    // frame that no longer contains it is not an expansion of anything.
    if (grip === 'move' && direction !== 'inward') return;
    event.preventDefault();
    event.stopPropagation();
    // One measurement, at mousedown, of the PICTURE's box. Freezing it keeps
    // the drag linear even though dragging outwards shrinks the picture on
    // screen (the stage is capped against the viewport).
    const box = imageRef.current?.getBoundingClientRect();
    dragRef.current = {
      grip,
      originX: event.clientX,
      originY: event.clientY,
      start: edges,
      scaleX: box && box.width > 0 ? natural.width / box.width : 1,
      scaleY: box && box.height > 0 ? natural.height / box.height : 1,
    };
    setDragging(true);
  }, [direction, edges, natural, ready]);

  const onStageMouseMove = React.useCallback((event: React.MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    applyDelta(drag, event.clientX - drag.originX, event.clientY - drag.originY);
  }, [applyDelta]);

  const endDrag = React.useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  /**
   * A drag is followed on the WINDOW, not on the stage (§7.4.4).
   *
   * The grips sit ON the box's border, so the very first outward pixel of the
   * gesture leaves the stage element. While the stage owned the listeners that
   * ended the drag on the spot: the owner reported the frame "wouldn't move",
   * and this is why. Deltas stay measured against the same frozen origin, so
   * following them further out is the same arithmetic, just not cut short.
   * The stage's own React handlers stay as they are — a second, identical
   * `applyDelta` from the same frozen start is a no-op.
   */
  React.useEffect(() => {
    if (!dragging) return undefined;
    const view = imageRef.current?.ownerDocument?.defaultView;
    if (!view) return undefined;
    const onMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      applyDelta(drag, event.clientX - drag.originX, event.clientY - drag.originY);
    };
    view.addEventListener('mousemove', onMove);
    view.addEventListener('mouseup', endDrag);
    return () => {
      view.removeEventListener('mousemove', onMove);
      view.removeEventListener('mouseup', endDrag);
    };
  }, [applyDelta, dragging, endDrag]);

  /**
   * The grips are buttons, so they are reachable and nudgeable from the
   * keyboard: one press moves that edge by a pixel, Shift moves it by ten.
   * Same expression as the pointer path, same single clamp.
   */
  const onHandleKeyDown = React.useCallback((
    event: React.KeyboardEvent,
    handle: CanvasFrameHandle,
  ) => {
    const delta = ARROW_DELTAS[event.key];
    if (!delta || !edges) return;
    event.preventDefault();
    event.stopPropagation();
    const box = imageRef.current?.getBoundingClientRect();
    const step = event.shiftKey ? CANVAS_FRAME_KEY_STEP_COARSE : CANVAS_FRAME_KEY_STEP;
    applyDelta(
      {
        grip: handle,
        originX: 0,
        originY: 0,
        start: edges,
        scaleX: box && box.width > 0 ? natural.width / box.width : 1,
        scaleY: box && box.height > 0 ? natural.height / box.height : 1,
      },
      delta[0] * step,
      delta[1] * step,
    );
  }, [applyDelta, edges, natural]);

  const canConfirm = ready && !!edges && isCanvasFrameConfirmable(direction, edges, natural);

  /**
   * The two submit paths are untouched by the merge: the payload carries the
   * rectangle AND the insets AND the size, and the panel routes each direction
   * down the lane it already had.
   */
  const confirm = React.useCallback((prompt = '') => {
    if (!bitmap || !edges || !canConfirm) return;
    try {
      const clamped = clampCanvasFrameEdges(direction, edges, natural);
      const rect = canvasFrameToRect(clamped, natural);
      const produced = direction === 'inward'
        ? cropBitmap(bitmap, rect)
        : expandBitmap(bitmap, clamped);
      onConfirm({
        base64Png: exportCanvasPngBase64(produced),
        prompt: prompt.trim(),
        rect,
        insets: direction === 'inward'
          ? { left: 0, top: 0, right: 0, bottom: 0 }
          : clamped,
        size: canvasFrameSize(direction, clamped, natural),
      });
    } catch (error) {
      // Review P11: "too big to rasterise" reads nothing like "could not be
      // opened", and only this catch still knows the difference.
      setExportError(error instanceof CanvasTooLargeError ? 'too-large' : 'failed');
    }
  }, [bitmap, canConfirm, direction, edges, natural, onConfirm]);

  const layout = React.useMemo(
    () => canvasFrameLayout(direction, edges ?? { left: 0, top: 0, right: 0, bottom: 0 }, natural),
    [direction, edges, natural],
  );
  const readout = ready && edges ? canvasFrameReadout(direction, edges, natural) : '';

  const exportNote = exportError ? (
    <p
      className="infinite-canvas-editor__note"
      data-canvas-frame-export-error={exportError}
      role="alert"
    >
      {t(`infiniteCanvas.${lane}.export.${exportError}`)}
    </p>
  ) : null;

  return (
    <InfiniteCanvasMediaStage
      scene={lane}
      className={`infinite-canvas-frame infinite-canvas-${lane}`}
      label={t(`infiniteCanvas.${lane}.title`)}
      closeLabel={t(`infiniteCanvas.${lane}.back`)}
      ready={ready}
      state={failed ? 'failed' : ready ? 'ready' : 'loading'}
      dataAttributes={{
        'data-canvas-editor': lane,
        'data-canvas-frame-direction': direction,
      }}
      pill={(
        <>
          <span className="infinite-canvas-frame__readout" data-canvas-frame-readout="true">
            {readout}
          </span>
          {direction === 'outward' ? (
            <>
              <span className="infinite-canvas-editor__divider" aria-hidden="true" />
              {/* The one line of prose §7.2.1 allows, and it is an instruction. */}
              <span className="infinite-canvas-frame__hint" data-canvas-frame-hint="true">
                {t('infiniteCanvas.expand.hint')}
              </span>
            </>
          ) : (
            /*
              Cropping asks for no sentence, so it mounts no generator and has
              no round send button to confirm from. It stays the one surface
              whose primary action lives in the pill; expanding confirms from
              the generator's send button, exactly as the mask lane does.
            */
            <button
              type="button"
              className="infinite-canvas-editor__text infinite-canvas-editor__primary"
              data-canvas-frame-action="confirm"
              disabled={!canConfirm}
              onClick={() => confirm()}
            >
              {t('infiniteCanvas.crop.confirm')}
            </button>
          )}
        </>
      )}
      dockNote={direction === 'inward' ? exportNote : null}
      placeholder={failed ? (
        <p className="infinite-canvas-frame__placeholder" role="alert">
          {t(`infiniteCanvas.${lane}.unavailable`)}
        </p>
      ) : ready ? null : (
        <p
          className="infinite-canvas-frame__placeholder"
          data-canvas-frame-state="loading"
          role="status"
        >
          {t(`infiniteCanvas.${lane}.loading`)}
        </p>
      )}
      footer={direction === 'outward' && generator && !failed ? (
        <>
          {/*
            §7.4.4 — the writing area is BACK. The owner's words were "然后
            下面再打字": the frame says how much room to make, and the sentence
            underneath says what should appear in it. It is optional, so it
            never gates the send button; only an undragged frame does.
          */}
          <InfiniteCanvasGenerator
            {...generator}
            surface="editor"
            references={[]}
            resolvePreviewUrl={resolvePreviewUrl}
            // Opens empty: this sentence is about the room being ADDED, not the
            // sentence that made the picture in the first place.
            target={{ ...generator.target, prompt: '' }}
            placeholder={t('infiniteCanvas.expand.promptPlaceholder')}
            note={ready && !canConfirm ? t('infiniteCanvas.expand.blocked.frame') : undefined}
            noteReason={ready && !canConfirm ? 'frame' : undefined}
            canSubmit={canConfirm}
            onSubmit={prompt => confirm(prompt)}
          />
          {exportNote}
        </>
      ) : null}
      onClose={onClose}
    >
      {failed ? null : (
        <div
          className="infinite-canvas-frame__stage"
          data-canvas-frame-stage="true"
          data-canvas-frame-width={layout.stage.width}
          data-canvas-frame-height={layout.stage.height}
          style={{
            '--frame-ratio': `${layout.stage.width} / ${layout.stage.height}`,
          } as React.CSSProperties}
          onMouseMove={onStageMouseMove}
          onMouseUp={endDrag}
        >
          {/*
            §7.4.4: the room between the box and the picture is what will be
            painted, so it is pressed down a shade — one glance says which part
            is not there yet. It is laid UNDER the picture rather than over it,
            which is why the picture reads at full strength and the shading
            stops exactly at its edge without a second cut-out rectangle.
          */}
          {direction === 'outward' && edges ? (
            <span
              className="infinite-canvas-frame__veil"
              data-canvas-frame-veil="true"
              aria-hidden="true"
              style={{
                left: `${layout.frame.left}%`,
                top: `${layout.frame.top}%`,
                width: `${layout.frame.width}%`,
                height: `${layout.frame.height}%`,
              }}
            />
          ) : null}
          {previewUrl ? (
            <img
              className="infinite-canvas-frame__image"
              ref={imageRef}
              src={previewUrl}
              alt=""
              draggable={false}
              style={{
                left: `${layout.image.left}%`,
                top: `${layout.image.top}%`,
                width: `${layout.image.width}%`,
                height: `${layout.image.height}%`,
              }}
            />
          ) : null}
          {edges ? (() => {
            const rect = canvasFrameToRect(edges, natural);
            return (
              <div
                className="infinite-canvas-frame__box"
                data-canvas-frame-box="true"
                data-canvas-frame-x={rect.x}
                data-canvas-frame-y={rect.y}
                data-canvas-frame-box-width={rect.width}
                data-canvas-frame-box-height={rect.height}
                style={{
                  left: `${layout.frame.left}%`,
                  top: `${layout.frame.top}%`,
                  width: `${layout.frame.width}%`,
                  height: `${layout.frame.height}%`,
                }}
                onMouseDown={event => beginDrag(event, 'move')}
              >
                {direction === 'inward' ? (
                  // Rule-of-thirds guides; decoration only, no pointer surface.
                  <span className="infinite-canvas-frame__thirds" aria-hidden="true" />
                ) : null}
                {CANVAS_FRAME_HANDLES.map(handle => (
                  <button
                    key={handle}
                    type="button"
                    className="infinite-canvas-frame__handle"
                    data-canvas-frame-handle={handle}
                    aria-label={t('infiniteCanvas.frame.handle')}
                    onMouseDown={event => beginDrag(event, handle)}
                    onKeyDown={event => onHandleKeyDown(event, handle)}
                  />
                ))}
              </div>
            );
          })() : null}
        </div>
      )}
    </InfiniteCanvasMediaStage>
  );
};

InfiniteCanvasFrameEditor.displayName = 'InfiniteCanvasFrameEditor';
