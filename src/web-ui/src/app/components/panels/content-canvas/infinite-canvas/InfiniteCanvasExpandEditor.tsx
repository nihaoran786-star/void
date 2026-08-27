/**
 * P6: the expand (outpainting) editor — "drag the frame out, that is the new
 * picture".
 *
 * Third of the board-filling editors, and deliberately the same surface as the
 * other two (§6.4 / §7.2.1): the picture FLOATS over §5.1's blurred plate, one
 * floating pill sits above it, and the board's OWN generator stands below.
 * What is new is only the middle: the picture no longer fills the stage, it
 * sits inside a draggable OUTER FRAME, and the gap between the two is the room
 * the model is asked to fill.
 *
 * Before this, outpainting was a line of prose in the "more" drawer
 * ("expand the canvas towards <direction>"), and the model guessed how far.
 * Now the drag IS the request.
 *
 * Rules that are load-bearing here:
 *
 * - **The frame only ever grows outwards.** It can never be smaller than the
 *   original: outpainting must leave the source pixels untouched, and a frame
 *   dragged inwards would silently become a crop. `clampExpandInsets` is the
 *   single place that says so.
 * - **There is an upper bound** (`CANVAS_EXPAND_MAX_RATIO`). The composite is
 *   rasterised in the browser and written through a 32 MB ceiling; an unbounded
 *   frame would turn a two-second drag into a typed `invalid_input`.
 * - **Nothing is shown before it has been measured.** The frame's geometry
 *   comes from the picture's natural size, known only after `createImageBitmap`
 *   resolves. Until then the stage is invisible — but the pill is not, because
 *   `data-ready` never becomes true when a picture fails to decode and a
 *   surface with no visible way out is not a surface.
 * - **The stage is sized from the RATIO, not from a measurement.** Its width is
 *   a `min()` of the viewport caps against its own aspect ratio, so pan, zoom
 *   and window resizes cannot desynchronise the frame from the picture, and no
 *   layout read enters the render path. Pointer deltas are scaled into natural
 *   pixels once per drag, from the picture's box at mousedown.
 * - **No prompt.** §6.4's last line: the frame already carries the whole
 *   request, so the shared generator mounts with its writing area collapsed and
 *   only the bottom row — model, parameters, count, round send — remains. The
 *   send button IS the confirm.
 */
import React from 'react';
import { X } from 'lucide-react';

import { useI18n } from '@/infrastructure/i18n';
import type { CanvasExpandInsets } from '@/shared/services/infinite-canvas';
import {
  CANVAS_EXPAND_NO_INSETS,
  CanvasTooLargeError,
  clampExpandInsets,
  expandBitmap,
  expandedCanvasSize,
  exportCanvasPngBase64,
  formatCanvasAspectRatio,
  isCanvasExpanded,
  loadCanvasImageBitmap,
} from './infiniteCanvasImageRaster';
import {
  EDITOR_INSIDE_SELECTORS,
  useInfiniteCanvasDismiss,
} from './useInfiniteCanvasDismiss';
import {
  InfiniteCanvasGenerator,
  type InfiniteCanvasEditorGeneratorProps,
} from './InfiniteCanvasGenerator';
import type {
  InfiniteCanvasImagePreviewResolver,
  InfiniteCanvasMediaRef,
} from './InfiniteCanvasNodes';

/**
 * The eight grips of the outer frame: four corners and four edge midpoints,
 * exactly as the owner's reference shot shows them. They are short white angle
 * marks, not a solid rectangle — the frame is a hint about where the new canvas
 * ends, not a window frame drawn over the work.
 */
const EXPAND_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

type ExpandHandle = typeof EXPAND_HANDLES[number];

export interface InfiniteCanvasExpandEditorProps {
  mediaRef: InfiniteCanvasMediaRef;
  /** Always the forceDataUrl resolver: the export lane needs a data URL. */
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
  /** The shared board generator, mounted here with its prompt area collapsed. */
  generator: InfiniteCanvasEditorGeneratorProps;
  /** Bare base64 PNG of the composite, plus the frame that produced it. */
  onConfirm: (payload: {
    base64Png: string;
    insets: CanvasExpandInsets;
    size: { width: number; height: number };
  }) => void;
  onClose: () => void;
}

interface ExpandDrag {
  handle: ExpandHandle;
  originX: number;
  originY: number;
  start: CanvasExpandInsets;
  /** Natural pixels per client pixel, frozen at mousedown (see the header). */
  scaleX: number;
  scaleY: number;
}

export const InfiniteCanvasExpandEditor: React.FC<InfiniteCanvasExpandEditorProps> = ({
  mediaRef,
  resolvePreviewUrl,
  generator,
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
  const [insets, setInsets] = React.useState<CanvasExpandInsets>(CANVAS_EXPAND_NO_INSETS);
  const [discarding, setDiscarding] = React.useState(false);

  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const dragRef = React.useRef<ExpandDrag | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setBitmap(undefined);
    setInsets(CANVAS_EXPAND_NO_INSETS);
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
  const ready = Boolean(bitmap) && natural.width > 0;
  const size = React.useMemo(
    () => expandedCanvasSize(natural, insets),
    [insets, natural],
  );
  const expanded = isCanvasExpanded(insets);

  const beginDrag = React.useCallback((
    event: React.MouseEvent,
    handle: ExpandHandle,
  ) => {
    if (!ready) return;
    event.preventDefault();
    event.stopPropagation();
    // One measurement, at mousedown, of the PICTURE's box — not the stage's.
    // Freezing it keeps the drag linear even though dragging out shrinks the
    // picture on screen (the stage is capped against the viewport).
    const box = imageRef.current?.getBoundingClientRect();
    dragRef.current = {
      handle,
      originX: event.clientX,
      originY: event.clientY,
      start: insets,
      scaleX: box && box.width > 0 ? natural.width / box.width : 1,
      scaleY: box && box.height > 0 ? natural.height / box.height : 1,
    };
  }, [insets, natural, ready]);

  const onStageMouseMove = React.useCallback((event: React.MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.originX) * drag.scaleX;
    const dy = (event.clientY - drag.originY) * drag.scaleY;
    const next = { ...drag.start };
    // Outwards is positive on every side, so west and north read the delta
    // backwards. `clampExpandInsets` then refuses anything below zero, which is
    // what makes "the frame can never be smaller than the picture" true.
    if (drag.handle.includes('w')) next.left = drag.start.left - dx;
    if (drag.handle.includes('e')) next.right = drag.start.right + dx;
    if (drag.handle.includes('n')) next.top = drag.start.top - dy;
    if (drag.handle.includes('s')) next.bottom = drag.start.bottom + dy;
    setInsets(clampExpandInsets(next, natural));
  }, [natural]);

  const endDrag = React.useCallback(() => {
    dragRef.current = null;
  }, []);

  const requestClose = React.useCallback(() => {
    if (expanded && !discarding) {
      setDiscarding(true);
      return;
    }
    onClose();
  }, [discarding, expanded, onClose]);

  /**
   * §5.1's rule: the SURFACE is the picture and its frame, everything around
   * them is backdrop. Pressing the blurred board leaves — through
   * `requestClose`, so a frame that was dragged out still raises the discard
   * question. The pill and the generator are declared "inside" because they are
   * controls; the popovers the generator opens mount as siblings of this
   * editor, which is what `EDITOR_INSIDE_SELECTORS` is for.
   */
  const dockRef = React.useRef<HTMLDivElement | null>(null);
  const promptRef = React.useRef<HTMLDivElement | null>(null);
  const surfaceRef = useInfiniteCanvasDismiss<HTMLDivElement>({
    onDismiss: requestClose,
    inside: [dockRef, promptRef],
    insideSelectors: EDITOR_INSIDE_SELECTORS,
  });

  const canConfirm = ready && expanded;

  const confirm = React.useCallback(() => {
    if (!bitmap || !canConfirm) return;
    try {
      const clamped = clampExpandInsets(insets, natural);
      const composite = expandBitmap(bitmap, clamped);
      onConfirm({
        base64Png: exportCanvasPngBase64(composite),
        insets: clamped,
        size: expandedCanvasSize(natural, clamped),
      });
    } catch (error) {
      // Review P11: "too big to rasterise" reads nothing like "could not be
      // opened", and only this catch still knows the difference.
      setExportError(error instanceof CanvasTooLargeError ? 'too-large' : 'failed');
    }
  }, [bitmap, canConfirm, insets, natural, onConfirm]);

  const percent = (value: number, total: number) => (
    total > 0 ? `${(value / total) * 100}%` : '0%'
  );

  return (
    <div
      className="infinite-canvas-expand"
      data-canvas-editor="expand"
      // Measure-before-show, scoped to the STAGE only: the pill and the
      // failure message must survive a picture that never decodes.
      data-ready={ready ? 'true' : 'false'}
      data-state={failed ? 'failed' : ready ? 'ready' : 'loading'}
      role="dialog"
      aria-label={t('infiniteCanvas.expand.title')}
      ref={surfaceRef}
    >
      <div className="infinite-canvas-editor__backdrop" aria-hidden="true" />
      <div className="infinite-canvas-editor__float">
        {/*
          §7.2.1's pill: `×` first, cut off by a hairline, then what this
          surface has to say. There is no aspect-ratio PRESET here — the ratio
          is whatever frame the user drags — so the pill REPORTS it rather than
          offering a control that would do nothing.
        */}
        <div className="infinite-canvas-editor__dock" ref={dockRef}>
          <div
            className="infinite-canvas-editor__pill"
            role="toolbar"
            aria-label={t('infiniteCanvas.expand.title')}
          >
            <button
              type="button"
              data-expand-action="back"
              aria-label={t('infiniteCanvas.expand.back')}
              title={t('infiniteCanvas.expand.back')}
              onClick={requestClose}
            >
              <X size={14} aria-hidden="true" />
            </button>
            <span className="infinite-canvas-editor__divider" aria-hidden="true" />
            <span
              className="infinite-canvas-expand__ratio"
              data-expand-ratio="true"
              title={t('infiniteCanvas.params.aspectRatio')}
              aria-label={t('infiniteCanvas.params.aspectRatio')}
            >
              {ready ? formatCanvasAspectRatio(size) : ''}
            </span>
            <span className="infinite-canvas-editor__divider" aria-hidden="true" />
            {/* The one line of prose §7.2.1 allows, and it is an instruction. */}
            <span className="infinite-canvas-expand__hint" data-expand-hint="true">
              {t('infiniteCanvas.expand.hint')}
            </span>
          </div>
        </div>
        {failed ? (
          <p className="infinite-canvas-expand__placeholder" role="alert">
            {t('infiniteCanvas.expand.unavailable')}
          </p>
        ) : (
          <>
            {ready ? null : (
              <p
                className="infinite-canvas-expand__placeholder"
                data-expand-state="loading"
                role="status"
              >
                {t('infiniteCanvas.expand.loading')}
              </p>
            )}
            {/*
              The stage IS the target canvas: it carries the expanded ratio, the
              picture sits inside it in percentages of it, and the eight grips
              ride its edges. One element, no measurement, nothing to
              desynchronise.
            */}
            <div
              className="infinite-canvas-expand__stage"
              data-expand-stage="true"
              data-expand-left={insets.left}
              data-expand-top={insets.top}
              data-expand-right={insets.right}
              data-expand-bottom={insets.bottom}
              data-expand-width={size.width}
              data-expand-height={size.height}
              style={{
                '--expand-ratio': `${size.width} / ${size.height}`,
              } as React.CSSProperties}
              onMouseMove={onStageMouseMove}
              onMouseUp={endDrag}
              onMouseLeave={endDrag}
            >
              {previewUrl ? (
                <img
                  className="infinite-canvas-expand__image"
                  ref={imageRef}
                  src={previewUrl}
                  alt=""
                  draggable={false}
                  style={{
                    left: percent(insets.left, size.width),
                    top: percent(insets.top, size.height),
                    width: percent(natural.width, size.width),
                    height: percent(natural.height, size.height),
                  }}
                />
              ) : null}
              {EXPAND_HANDLES.map(handle => (
                <span
                  key={handle}
                  className="infinite-canvas-expand__handle"
                  data-expand-handle={handle}
                  onMouseDown={event => beginDrag(event, handle)}
                />
              ))}
            </div>
            {/*
              §6.4: the board's own input box, in its editor surface, with the
              writing area collapsed — this lane asks for no sentence. Sending
              from it IS confirming.
            */}
            <div className="infinite-canvas-editor__input" ref={promptRef}>
              <InfiniteCanvasGenerator
                {...generator}
                surface="editor"
                collapsePrompt
                references={[]}
                resolvePreviewUrl={resolvePreviewUrl}
                note={ready && !expanded ? t('infiniteCanvas.expand.blocked.frame') : undefined}
                noteReason={ready && !expanded ? 'frame' : undefined}
                canSubmit={canConfirm}
                onSubmit={confirm}
              />
              {exportError ? (
                <p
                  className="infinite-canvas-editor__note"
                  data-expand-export-error={exportError}
                  role="alert"
                >
                  {t(`infiniteCanvas.expand.export.${exportError}`)}
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>
      {discarding ? (
        <div
          className="infinite-canvas-dialog infinite-canvas-dialog--confirm"
          role="dialog"
          aria-label={t('infiniteCanvas.expand.discardTitle')}
          data-canvas-confirm="expand-discard"
        >
          <div className="infinite-canvas-dialog__header">
            <h4>{t('infiniteCanvas.expand.discardTitle')}</h4>
            <button
              type="button"
              className="infinite-canvas-dialog__close"
              data-canvas-confirm-action="cancel"
              onClick={() => setDiscarding(false)}
            >
              {t('infiniteCanvas.expand.discardCancel')}
            </button>
          </div>
          <p className="infinite-canvas-dialog__hint infinite-canvas-dialog__hint--strong">
            {t('infiniteCanvas.expand.discardBody')}
          </p>
          <div className="infinite-canvas-dialog__actions">
            <button
              type="button"
              className="infinite-canvas-dialog__confirm"
              data-canvas-confirm-action="confirm"
              onClick={onClose}
            >
              {t('infiniteCanvas.expand.discardConfirm')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

InfiniteCanvasExpandEditor.displayName = 'InfiniteCanvasExpandEditor';
