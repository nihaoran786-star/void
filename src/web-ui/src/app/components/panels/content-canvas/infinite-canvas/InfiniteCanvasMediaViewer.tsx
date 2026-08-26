/**
 * Full-screen media viewer for the Infinite Canvas panel (P4 W1).
 *
 * A projection-only overlay: it renders one card's media large, lets the user
 * zoom/pan, walk the other media cards of the same canvas, and hands the
 * "save a copy" request back to the panel. It owns no document state and
 * never touches persistence.
 *
 * The media URL comes from the very same resolver the cards use
 * (`resolveInfiniteCanvasMediaPreviewUrl`, data-URL lane) — this app does not
 * enable Tauri's asset protocol, so streaming URLs would be refused by the
 * webview. Videos load with `preload="metadata"` and never autoplay.
 *
 * Owner feedback 2026-08-26: the enlarged media floats over a BLURRED canvas,
 * and pressing anywhere on that blurred area closes it. Pressing the media
 * itself (or the chrome, or the step arrows) does not. There is no close
 * button — dismissal is the shared `useInfiniteCanvasDismiss` contract, the
 * same one the pickers use, so Escape closes here too.
 */
import React from 'react';
import { ChevronLeft, ChevronRight, Download, Minus, Plus } from 'lucide-react';

import { useI18n } from '@/infrastructure/i18n';
import type {
  InfiniteCanvasImagePreviewResolver,
  InfiniteCanvasMediaRef,
} from './InfiniteCanvasNodes';
import { useInfiniteCanvasDismiss } from './useInfiniteCanvasDismiss';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(3))));
}

function fileNameOf(relativePath: string): string {
  return relativePath.split(/[\\/]/).pop() || relativePath;
}

export interface InfiniteCanvasViewerItem {
  nodeId: string;
  mediaRef: InfiniteCanvasMediaRef;
  mediaKind: 'image' | 'video';
}

export interface InfiniteCanvasMediaViewerProps {
  /** Every media-bearing card of the canvas, in document order. */
  items: readonly InfiniteCanvasViewerItem[];
  activeNodeId: string;
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
  onNavigate: (nodeId: string) => void;
  onClose: () => void;
  onSaveAs: (item: InfiniteCanvasViewerItem) => void;
}

export const InfiniteCanvasMediaViewer: React.FC<InfiniteCanvasMediaViewerProps> = ({
  items,
  activeNodeId,
  resolvePreviewUrl,
  onNavigate,
  onClose,
  onSaveAs,
}) => {
  const { t } = useI18n('components');
  const index = items.findIndex(item => item.nodeId === activeNodeId);
  const item = index >= 0 ? items[index] : undefined;

  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>(undefined);
  const [failed, setFailed] = React.useState(false);
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const dragOrigin = React.useRef<{ x: number; y: number } | null>(null);

  /**
   * The media frame is the one region that does NOT close the viewer. The
   * chrome and the step arrows are declared "inside" too: they are controls,
   * not backdrop, and pressing a control must not dismiss what it acts on.
   */
  const chromeRef = React.useRef<HTMLDivElement | null>(null);
  const stepsRef = React.useRef<HTMLDivElement | null>(null);
  const frameRef = useInfiniteCanvasDismiss<HTMLDivElement>({
    onDismiss: onClose,
    inside: [chromeRef, stepsRef],
  });

  const mediaRef = item?.mediaRef;
  const mediaKind = item?.mediaKind;

  React.useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [activeNodeId]);

  React.useEffect(() => {
    if (!mediaRef || !mediaKind) return undefined;
    let cancelled = false;
    setPreviewUrl(undefined);
    setFailed(false);
    void resolvePreviewUrl(mediaRef, mediaKind).then(url => {
      if (cancelled) return;
      if (url) setPreviewUrl(url);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [mediaKind, mediaRef, resolvePreviewUrl]);

  const step = React.useCallback((delta: number) => {
    setZoom(current => clampZoom(current + delta));
  }, []);

  const reset = React.useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const goRelative = React.useCallback((delta: number) => {
    if (items.length < 2 || index < 0) return;
    const next = (index + delta + items.length) % items.length;
    onNavigate(items[next].nodeId);
  }, [index, items, onNavigate]);

  // Arrows walk the canvas's other media cards. The listener sits on the
  // document because the overlay may not hold focus (the user can open it by
  // clicking the card image). Escape is not handled here — that belongs to the
  // shared dismiss contract above, so there is one Escape path, not two.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goRelative(-1);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goRelative(1);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [goRelative]);

  if (!item) return null;

  const zoomPercent = `${Math.round(zoom * 100)}%`;
  const fileName = fileNameOf(item.mediaRef.relativePath);

  return (
    <div
      className="infinite-canvas-viewer"
      data-canvas-viewer="open"
      data-media-kind={item.mediaKind}
      role="dialog"
      aria-modal="true"
      aria-label={t('infiniteCanvas.viewer.title')}
    >
      {/*
        The blurred plate the media floats on. It carries no click handler of
        its own: pressing it is "outside the media", which the shared dismiss
        contract already means as close.
      */}
      <div
        className="infinite-canvas-viewer__backdrop"
        data-viewer-action="backdrop"
        role="presentation"
      />
      <div className="infinite-canvas-viewer__chrome" ref={chromeRef}>
        <span className="infinite-canvas-viewer__name" title={fileName}>{fileName}</span>
        <span className="infinite-canvas-viewer__counter" data-viewer-counter>
          {`${index + 1} / ${items.length}`}
        </span>
        <span className="infinite-canvas-viewer__spacer" />
        {item.mediaKind === 'image' ? (
          <>
            <button
              type="button"
              className="infinite-canvas-viewer__button"
              data-viewer-action="zoom-out"
              aria-label={t('infiniteCanvas.viewer.zoomOut')}
              disabled={zoom <= MIN_ZOOM}
              onClick={() => step(-ZOOM_STEP)}
            >
              <Minus size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="infinite-canvas-viewer__button infinite-canvas-viewer__button--zoom"
              data-viewer-action="reset"
              aria-label={t('infiniteCanvas.viewer.resetZoom')}
              onClick={reset}
            >
              {zoomPercent}
            </button>
            <button
              type="button"
              className="infinite-canvas-viewer__button"
              data-viewer-action="zoom-in"
              aria-label={t('infiniteCanvas.viewer.zoomIn')}
              disabled={zoom >= MAX_ZOOM}
              onClick={() => step(ZOOM_STEP)}
            >
              <Plus size={13} aria-hidden="true" />
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="infinite-canvas-viewer__button"
          data-viewer-action="save"
          onClick={() => onSaveAs(item)}
        >
          <Download size={13} aria-hidden="true" />
          {t('infiniteCanvas.viewer.saveAs')}
        </button>
        {/*
          Owner feedback 2026-08-26: no close button. Press the blurred area
          or Escape.
        */}
      </div>
      {items.length > 1 ? (
        <div className="infinite-canvas-viewer__steps" ref={stepsRef}>
          <button
            type="button"
            className="infinite-canvas-viewer__step infinite-canvas-viewer__step--prev"
            data-viewer-action="prev"
            aria-label={t('infiniteCanvas.viewer.previous')}
            onClick={() => goRelative(-1)}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="infinite-canvas-viewer__step infinite-canvas-viewer__step--next"
            data-viewer-action="next"
            aria-label={t('infiniteCanvas.viewer.next')}
            onClick={() => goRelative(1)}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <div
        className="infinite-canvas-viewer__stage"
        data-viewer-stage
        role="presentation"
        onWheel={event => {
          if (item.mediaKind !== 'image') return;
          step(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
        }}
        onPointerDown={event => {
          if (item.mediaKind !== 'image') return;
          dragOrigin.current = {
            x: event.clientX - offset.x,
            y: event.clientY - offset.y,
          };
        }}
        onPointerMove={event => {
          const origin = dragOrigin.current;
          if (!origin) return;
          setOffset({ x: event.clientX - origin.x, y: event.clientY - origin.y });
        }}
        onPointerUp={() => {
          dragOrigin.current = null;
        }}
        onPointerLeave={() => {
          dragOrigin.current = null;
        }}
      >
        {/*
          The one region a press does NOT close from. Everything else in the
          overlay is backdrop.
        */}
        <div
          className="infinite-canvas-viewer__frame"
          data-viewer-frame="media"
          ref={frameRef}
        >
          {previewUrl ? (
            item.mediaKind === 'video' ? (
              // Generated clip: no caption track exists for it, and it never
              // autoplays — the user presses play.
              <video
                className="infinite-canvas-viewer__video"
                data-viewer-media="video"
                src={previewUrl}
                controls
                preload="metadata"
                aria-label={fileName}
              />
            ) : (
              <img
                className="infinite-canvas-viewer__image"
                data-viewer-media="image"
                src={previewUrl}
                alt={fileName}
                draggable={false}
                style={{
                  transform:
                    `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                }}
              />
            )
          ) : (
            <p
              className="infinite-canvas-viewer__placeholder"
              data-state={failed ? 'unavailable' : 'loading'}
            >
              {failed
                ? t('infiniteCanvas.viewer.previewUnavailable')
                : t('infiniteCanvas.viewer.previewLoading')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

InfiniteCanvasMediaViewer.displayName = 'InfiniteCanvasMediaViewer';
