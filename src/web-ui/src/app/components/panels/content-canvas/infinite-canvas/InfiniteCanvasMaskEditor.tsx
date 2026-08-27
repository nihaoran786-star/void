/**
 * P5 W3/W4: the mask brush — "circle the bit you want changed".
 *
 * A full-panel editing state (not a popup): the card's picture fills the
 * board, the user paints semi-transparent red over the region to change,
 * writes one sentence, and confirms. The panel then burns the marks into a
 * copy of the picture, writes that copy to the scratch directory and submits
 * it as the reference of an ordinary derived generation. The original card is
 * never touched.
 *
 * Deliberate properties:
 *
 * - **The mark layer is a canvas at the picture's NATURAL pixel size.** Pointer
 *   coordinates and the brush diameter are scaled into that space
 *   (`infiniteCanvasImageRaster.ts`), so the composite carries full-resolution
 *   marks.
 * - **The red is a functional constant**, not a theme colour: it is what lets a
 *   general image model find the region. Everything else in here goes through
 *   `--canvas-*` tokens and reads in both themes.
 * - **This editor's undo stack is its own.** It holds `ImageData` snapshots of
 *   the mark layer, is capped at `CANVAS_MARK_UNDO_LIMIT`, and never touches
 *   `infiniteCanvasHistory.ts`. While the editor is open, Ctrl+Z means "undo my
 *   last stroke" and can never reach back onto the board — the panel suspends
 *   its own shortcut listener for exactly as long as an editor is mounted.
 * - **Nothing is thrown away by accident.** Escape and a press outside go
 *   through the shared dismiss contract, but with marks on the layer they open
 *   a discard confirmation first. There is no "Close" button (owner decision).
 * - Copy for this lane says "marked area", never "precise mask": the model's
 *   obedience to a red mark is probabilistic, and the UI must not promise more.
 */
import React from 'react';
import { Brush, Eraser, RotateCcw, RotateCw, Square, Trash2 } from 'lucide-react';

import { useI18n } from '@/infrastructure/i18n';
import type { MaskImageToolId } from '@/shared/services/infinite-canvas';
import {
  instructionBlockReason,
  maskPrefillKey,
} from '@/shared/services/infinite-canvas';
import {
  CANVAS_BRUSH_DEFAULT,
  CANVAS_BRUSH_MAX,
  CANVAS_BRUSH_MIN,
  CANVAS_MARK_ERASE,
  CANVAS_MARK_FILL,
  CANVAS_MARK_STROKE,
  CANVAS_MARK_STROKE_WIDTH,
  canvasMarkUndoLimit,
  CanvasTooLargeError,
  compositeMarkLayer,
  exportCanvasPngBase64,
  loadCanvasImageBitmap,
  rectFromCorners,
  toNaturalLength,
  toNaturalPoint,
} from './infiniteCanvasImageRaster';
import { useInfiniteCanvasDismiss } from './useInfiniteCanvasDismiss';
import type {
  InfiniteCanvasImagePreviewResolver,
  InfiniteCanvasMediaRef,
} from './InfiniteCanvasNodes';

export type InfiniteCanvasMaskTool = 'brush' | 'rect' | 'eraser';

/**
 * One step of the editor's own history: the pixels of the mark layer, plus
 * whether that layer counted as marked. The flag travels WITH the pixels — see
 * the `marked` state below for why keeping them apart was a bug.
 */
interface MarkLayerSnapshot {
  image: ImageData | undefined;
  marked: boolean;
}

export interface InfiniteCanvasMaskEditorProps {
  toolId: MaskImageToolId;
  mediaRef: InfiniteCanvasMediaRef;
  /** Always the forceDataUrl resolver: the export lane needs a data URL. */
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
  /** Bare base64 PNG of the composite, plus the sentence the user wrote. */
  onConfirm: (payload: { base64Png: string; instruction: string }) => void;
  onClose: () => void;
}

export const InfiniteCanvasMaskEditor: React.FC<InfiniteCanvasMaskEditorProps> = ({
  toolId,
  mediaRef,
  resolvePreviewUrl,
  onConfirm,
  onClose,
}) => {
  const { t } = useI18n('components');
  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>(undefined);
  const [bitmap, setBitmap] = React.useState<ImageBitmap | undefined>(undefined);
  const [failed, setFailed] = React.useState(false);
  /** Export-time failure, kept apart from a decode failure (review P11). */
  const [exportError, setExportError] =
    React.useState<'too-large' | 'failed' | undefined>(undefined);
  const [tool, setTool] = React.useState<InfiniteCanvasMaskTool>('brush');
  const [brushSize, setBrushSize] = React.useState(CANVAS_BRUSH_DEFAULT);
  /**
   * "Does the mark layer currently carry marks?" — a property OF THE LAYER,
   * never a running tally.
   *
   * P5 review C5: this used to be a stroke counter that `clearMarks` reset to
   * zero and `undo` merely decremented. "Paint → clear → undo" therefore put
   * the marks back on screen while the counter stayed at 0, which greyed out
   * the confirm button, disabled clearing, and made Escape throw the painting
   * away without asking. Every entry on the undo/redo stacks now carries the
   * flag that belonged to the layer it snapshots, so restoring a layer
   * restores this flag with it and the two can no longer disagree.
   */
  const [marked, setMarked] = React.useState(false);
  const [undoDepth, setUndoDepth] = React.useState(0);
  const [redoDepth, setRedoDepth] = React.useState(0);
  const [discarding, setDiscarding] = React.useState(false);
  /**
   * Prefilled with the tool's placeholder template, then owned by the user.
   * `t` is read through a ref: it is not a stable identity, and depending on
   * it directly would re-run the prefill on every render and wipe what the
   * user typed.
   */
  const translate = React.useRef(t);
  translate.current = t;
  const [instruction, setInstruction] = React.useState(() => t(maskPrefillKey(toolId)));

  const maskCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const contextRef = React.useRef<CanvasRenderingContext2D | null>(null);
  const undoStackRef = React.useRef<MarkLayerSnapshot[]>([]);
  const redoStackRef = React.useRef<MarkLayerSnapshot[]>([]);
  const strokeRef = React.useRef<{
    from: { x: number; y: number };
    last: { x: number; y: number };
    baseline?: ImageData;
  } | null>(null);

  React.useEffect(() => {
    setInstruction(translate.current(maskPrefillKey(toolId)));
  }, [toolId]);

  // Decoding is the one lane: data URL → createImageBitmap. Never an <img>.
  React.useEffect(() => {
    let cancelled = false;
    setBitmap(undefined);
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
        const decoded = await loadCanvasImageBitmap(url);
        if (cancelled) return;
        setBitmap(decoded);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mediaRef, resolvePreviewUrl]);

  const naturalWidth = bitmap?.width ?? 0;
  const naturalHeight = bitmap?.height ?? 0;
  const ready = Boolean(bitmap) && naturalWidth > 0 && naturalHeight > 0;

  // The mark layer is created at natural size once the picture is decoded.
  React.useEffect(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas || !ready) return;
    canvas.width = naturalWidth;
    canvas.height = naturalHeight;
    contextRef.current = canvas.getContext('2d');
    undoStackRef.current = [];
    redoStackRef.current = [];
    setUndoDepth(0);
    setRedoDepth(0);
    setMarked(false);
  }, [naturalHeight, naturalWidth, ready]);

  /**
   * P5 review P10: depth is a MEMORY budget, not a constant. Each entry is a
   * full-resolution RGBA `ImageData`, so a 4096² picture that would have kept
   * ~2 GB alive at thirty steps keeps a handful of steps instead.
   */
  const undoLimit = React.useMemo(
    () => canvasMarkUndoLimit({ width: naturalWidth, height: naturalHeight }),
    [naturalHeight, naturalWidth],
  );

  const snapshot = React.useCallback((): ImageData | undefined => {
    const context = contextRef.current;
    const canvas = maskCanvasRef.current;
    if (!context || !canvas) return undefined;
    try {
      return context.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      return undefined;
    }
  }, []);

  const restore = React.useCallback((image: ImageData | undefined) => {
    const context = contextRef.current;
    const canvas = maskCanvasRef.current;
    if (!context || !canvas) return;
    if (image) {
      context.putImageData(image, 0, 0);
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  /**
   * The layer exactly as it stands right now, flag included. `markedRef`
   * mirrors the state so a snapshot taken inside an event handler reads the
   * value the layer has at that instant, not the one the last render closed
   * over.
   */
  const markedRef = React.useRef(false);
  markedRef.current = marked;
  const captureNow = React.useCallback((): MarkLayerSnapshot => (
    { image: snapshot(), marked: markedRef.current }
  ), [snapshot]);

  /** Pushes the pre-change state; the stack is capped, oldest entry drops. */
  const pushUndo = React.useCallback((entry: MarkLayerSnapshot) => {
    const next = [...undoStackRef.current, entry];
    undoStackRef.current = next.length > undoLimit
      ? next.slice(next.length - undoLimit)
      : next;
    redoStackRef.current = [];
    setUndoDepth(undoStackRef.current.length);
    setRedoDepth(0);
  }, [undoLimit]);

  const undo = React.useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const entry = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, captureNow()];
    restore(entry.image);
    setUndoDepth(undoStackRef.current.length);
    setRedoDepth(redoStackRef.current.length);
    setMarked(entry.marked);
  }, [captureNow, restore]);

  const redo = React.useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const entry = stack[stack.length - 1];
    redoStackRef.current = stack.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, captureNow()];
    restore(entry.image);
    setUndoDepth(undoStackRef.current.length);
    setRedoDepth(redoStackRef.current.length);
    setMarked(entry.marked);
  }, [captureNow, restore]);

  const clearMarks = React.useCallback(() => {
    if (!marked) return;
    pushUndo(captureNow());
    restore(undefined);
    setMarked(false);
  }, [captureNow, marked, pushUndo, restore]);

  /**
   * Ctrl+Z / Ctrl+Shift+Z (and Ctrl+Y) inside the editor. Registered in the
   * CAPTURE phase and stopped there: the panel's board-level history listener
   * is already suspended while an editor is open, and this makes the isolation
   * hold even if something else were listening.
   */
  React.useEffect(() => {
    const ownerDocument = maskCanvasRef.current?.ownerDocument
      ?? (typeof document === 'undefined' ? undefined : document);
    if (!ownerDocument) return undefined;
    const onKeyDown = (event: Event) => {
      const keyboard = event as KeyboardEvent;
      if (!keyboard.ctrlKey && !keyboard.metaKey) return;
      const key = keyboard.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      keyboard.preventDefault();
      keyboard.stopPropagation();
      if (key === 'y' || keyboard.shiftKey) redo();
      else undo();
    };
    ownerDocument.addEventListener('keydown', onKeyDown, true);
    return () => ownerDocument.removeEventListener('keydown', onKeyDown, true);
  }, [redo, undo]);

  // —— Painting ————————————————————————————————————————————————————————————

  const naturalFromEvent = React.useCallback((event: React.MouseEvent) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const box = canvas.getBoundingClientRect();
    return toNaturalPoint(
      { clientX: event.clientX, clientY: event.clientY },
      { left: box.left, top: box.top, width: box.width, height: box.height },
      { width: canvas.width, height: canvas.height },
    );
  }, []);

  const naturalBrush = React.useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return brushSize;
    const box = canvas.getBoundingClientRect();
    return Math.max(1, toNaturalLength(brushSize, box.width || canvas.width, canvas.width));
  }, [brushSize]);

  const paintSegment = React.useCallback((
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => {
    const context = contextRef.current;
    if (!context) return;
    const erasing = tool === 'eraser';
    context.save();
    // The eraser removes marks from the layer itself; it never draws over the
    // picture, so the source pixels stay untouched by construction.
    //
    // P5 review C4: under `destination-out` it is the SOURCE ALPHA that decides
    // how much of the destination goes. Painting the eraser in the translucent
    // mark colour removed only 55% per pass and left a pink ghost that the
    // composite then burnt into the picture. The eraser is therefore fully
    // opaque, and `globalAlpha` is pinned to 1 so no ambient value can dilute
    // it again.
    context.globalAlpha = 1;
    context.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
    context.strokeStyle = erasing ? CANVAS_MARK_ERASE : CANVAS_MARK_FILL;
    context.fillStyle = erasing ? CANVAS_MARK_ERASE : CANVAS_MARK_FILL;
    context.lineWidth = naturalBrush();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
  }, [naturalBrush, tool]);

  const paintRect = React.useCallback((
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => {
    const context = contextRef.current;
    if (!context) return;
    const rect = rectFromCorners(from, to);
    context.save();
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = CANVAS_MARK_FILL;
    context.strokeStyle = CANVAS_MARK_STROKE;
    context.lineWidth = CANVAS_MARK_STROKE_WIDTH;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    context.strokeRect(rect.x, rect.y, rect.width, rect.height);
    context.restore();
  }, []);

  const onCanvasMouseDown = React.useCallback((event: React.MouseEvent) => {
    if (!ready) return;
    event.preventDefault();
    const point = naturalFromEvent(event);
    const before = captureNow();
    pushUndo(before);
    strokeRef.current = { from: point, last: point, baseline: before.image };
    // The eraser takes marks away: after an erase stroke the layer may well be
    // blank again, so "marked" is re-read from the pixels once the stroke ends
    // rather than assumed here.
    if (tool !== 'eraser') setMarked(true);
    if (tool === 'rect') paintRect(point, point);
    else paintSegment(point, point);
  }, [captureNow, naturalFromEvent, paintRect, paintSegment, pushUndo, ready, tool]);

  const onCanvasMouseMove = React.useCallback((event: React.MouseEvent) => {
    const stroke = strokeRef.current;
    if (!stroke) return;
    const point = naturalFromEvent(event);
    if (tool === 'rect') {
      // A dragged rectangle is redrawn from the pre-stroke snapshot every
      // frame, so the preview never accumulates onto itself.
      restore(stroke.baseline);
      paintRect(stroke.from, point);
    } else {
      paintSegment(stroke.last, point);
    }
    stroke.last = point;
  }, [naturalFromEvent, paintRect, paintSegment, restore, tool]);

  const endStroke = React.useCallback(() => {
    const stroke = strokeRef.current;
    strokeRef.current = null;
    if (!stroke || tool !== 'eraser') return;
    // Only the eraser can turn "marked" back off, and only the pixels can say
    // so. Where the pixels cannot be read (no 2d context in the environment)
    // the flag is left as it was: erring towards "there is still something
    // here" costs one extra confirmation, erring the other way loses work.
    const image = snapshot();
    if (!image) return;
    const { data } = image;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] !== 0) return;
    }
    setMarked(false);
  }, [snapshot, tool]);

  // —— Dismissal ————————————————————————————————————————————————————————————

  const requestClose = React.useCallback(() => {
    if (marked && !discarding) {
      setDiscarding(true);
      return;
    }
    onClose();
  }, [discarding, marked, onClose]);

  const surfaceRef = useInfiniteCanvasDismiss<HTMLDivElement>({ onDismiss: requestClose });

  // —— Confirmation ————————————————————————————————————————————————————————

  // P5 review P16: judged against the prefilled template's OWN tokens, so 【】
  // typed as ordinary punctuation cannot silently disable the button — and
  // whatever does disable it is named on screen next to it.
  const prefill = t(maskPrefillKey(toolId));
  const blocked: 'marks' | 'empty' | 'placeholder' | undefined = !marked
    ? 'marks'
    : instructionBlockReason(instruction, prefill);
  const canConfirm = ready && !blocked;

  const confirm = React.useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (!bitmap || !canvas || !canConfirm) return;
    try {
      const composite = compositeMarkLayer(bitmap, canvas);
      onConfirm({
        base64Png: exportCanvasPngBase64(composite),
        instruction: instruction.trim(),
      });
    } catch (error) {
      // P5 review P11: "the picture is past what this browser can rasterise"
      // is not "the picture could not be opened", and the editor is the only
      // place that still knows which one happened. The marks are kept either
      // way — this is a report, not a dismissal.
      setExportError(error instanceof CanvasTooLargeError ? 'too-large' : 'failed');
    }
  }, [bitmap, canConfirm, instruction, onConfirm]);

  const toolButton = (
    value: InfiniteCanvasMaskTool,
    labelKey: string,
    icon: React.ReactNode,
  ) => (
    <button
      type="button"
      className="infinite-canvas-mask__tool"
      data-mask-tool={value}
      data-active={tool === value ? 'true' : undefined}
      aria-pressed={tool === value}
      aria-label={t(labelKey)}
      title={t(labelKey)}
      onClick={() => setTool(value)}
    >
      {icon}
    </button>
  );

  return (
    <div
      className="infinite-canvas-mask"
      data-canvas-editor="mask"
      data-tool-id={toolId}
      // Coordinate-system lesson: the picture and its mark layer stay
      // invisible until the picture has decoded, so the stage can never flash
      // at the wrong size first. P5 review C6: that rule now applies to the
      // FRAME only. It used to hide the whole surface, and because `ready`
      // stays false forever when decoding fails, the role="alert" below was
      // hidden exactly when it had something to say.
      data-ready={ready ? 'true' : 'false'}
      data-state={failed ? 'failed' : ready ? 'ready' : 'loading'}
      role="dialog"
      aria-label={t('infiniteCanvas.mask.title')}
      ref={surfaceRef}
    >
      <div className="infinite-canvas-mask__backdrop" aria-hidden="true" />
      <div className="infinite-canvas-mask__bar" role="toolbar" aria-label={t('infiniteCanvas.mask.toolsLabel')}>
        {toolButton('brush', 'infiniteCanvas.mask.tool.brush', <Brush size={14} aria-hidden="true" />)}
        {toolButton('rect', 'infiniteCanvas.mask.tool.rect', <Square size={14} aria-hidden="true" />)}
        {toolButton('eraser', 'infiniteCanvas.mask.tool.eraser', <Eraser size={14} aria-hidden="true" />)}
        <span className="infinite-canvas-mask__divider" aria-hidden="true" />
        <label className="infinite-canvas-mask__size">
          <span className="infinite-canvas-mask__size-label">
            {t('infiniteCanvas.mask.brushSize')}
          </span>
          <input
            type="range"
            data-mask-control="brush-size"
            min={CANVAS_BRUSH_MIN}
            max={CANVAS_BRUSH_MAX}
            step={1}
            value={brushSize}
            aria-label={t('infiniteCanvas.mask.brushSize')}
            onChange={event => setBrushSize(Number(event.target.value))}
          />
          <span className="infinite-canvas-mask__size-value">{brushSize}</span>
        </label>
        <span className="infinite-canvas-mask__divider" aria-hidden="true" />
        <button
          type="button"
          className="infinite-canvas-mask__tool"
          data-mask-action="undo"
          disabled={undoDepth === 0}
          aria-label={t('infiniteCanvas.mask.undo')}
          title={t('infiniteCanvas.mask.undo')}
          onClick={undo}
        >
          <RotateCcw size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="infinite-canvas-mask__tool"
          data-mask-action="redo"
          disabled={redoDepth === 0}
          aria-label={t('infiniteCanvas.mask.redo')}
          title={t('infiniteCanvas.mask.redo')}
          onClick={redo}
        >
          <RotateCw size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="infinite-canvas-mask__tool"
          data-mask-action="clear"
          disabled={!marked}
          aria-label={t('infiniteCanvas.mask.clear')}
          title={t('infiniteCanvas.mask.clear')}
          onClick={clearMarks}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="infinite-canvas-mask__stage">
        {failed ? (
          <p className="infinite-canvas-mask__placeholder" role="alert">
            {t('infiniteCanvas.mask.unavailable')}
          </p>
        ) : (
          <>
            {ready ? null : (
              // A big picture takes a visible moment to decode; saying so beats
              // an empty rectangle.
              <p
                className="infinite-canvas-mask__placeholder"
                data-mask-state="loading"
                role="status"
              >
                {t('infiniteCanvas.mask.loading')}
              </p>
            )}
            <div className="infinite-canvas-mask__frame">
              {previewUrl ? (
                <img
                  className="infinite-canvas-mask__image"
                  src={previewUrl}
                  alt=""
                  draggable={false}
                />
              ) : null}
              <canvas
                className="infinite-canvas-mask__layer"
                data-mask-surface="layer"
                ref={maskCanvasRef}
                onMouseDown={onCanvasMouseDown}
                onMouseMove={onCanvasMouseMove}
                onMouseUp={endStroke}
                onMouseLeave={endStroke}
              />
            </div>
          </>
        )}
      </div>
      <div className="infinite-canvas-mask__prompt">
        <p className="infinite-canvas-mask__hint">{t('infiniteCanvas.mask.hint')}</p>
        <textarea
          className="infinite-canvas-mask__input"
          data-mask-control="instruction"
          aria-label={t('infiniteCanvas.mask.instructionLabel')}
          value={instruction}
          onChange={event => setInstruction(event.target.value)}
        />
        {exportError ? (
          <p
            className="infinite-canvas-mask__blocked"
            data-mask-export-error={exportError}
            role="alert"
          >
            {t(`infiniteCanvas.mask.export.${exportError}`)}
          </p>
        ) : blocked && ready ? (
          <p className="infinite-canvas-mask__blocked" data-blocked-reason={blocked}>
            {t(`infiniteCanvas.mask.blocked.${blocked}`)}
          </p>
        ) : null}
        <button
          type="button"
          className="infinite-canvas-mask__confirm"
          data-mask-action="confirm"
          disabled={!canConfirm}
          onClick={confirm}
        >
          {t('infiniteCanvas.mask.confirm')}
        </button>
      </div>
      {discarding ? (
        // Same dialog shell the deletion and re-spend confirmations use, so a
        // one-second slip cannot throw away a careful bit of painting.
        <div
          className="infinite-canvas-dialog infinite-canvas-dialog--confirm"
          role="dialog"
          aria-label={t('infiniteCanvas.mask.discardTitle')}
          data-canvas-confirm="mask-discard"
        >
          <div className="infinite-canvas-dialog__header">
            <h4>{t('infiniteCanvas.mask.discardTitle')}</h4>
            <button
              type="button"
              className="infinite-canvas-dialog__close"
              data-canvas-confirm-action="cancel"
              onClick={() => setDiscarding(false)}
            >
              {t('infiniteCanvas.mask.discardCancel')}
            </button>
          </div>
          <p className="infinite-canvas-dialog__hint infinite-canvas-dialog__hint--strong">
            {t('infiniteCanvas.mask.discardBody')}
          </p>
          <div className="infinite-canvas-dialog__actions">
            <button
              type="button"
              className="infinite-canvas-dialog__confirm"
              data-canvas-confirm-action="confirm"
              onClick={onClose}
            >
              {t('infiniteCanvas.mask.discardConfirm')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

InfiniteCanvasMaskEditor.displayName = 'InfiniteCanvasMaskEditor';
