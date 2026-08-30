/**
 * Read-only picker over the Workspace Media library (M4).
 *
 * The picker only references media: choosing an item hands the caller a
 * `mediaRef` relative path. No file is copied and nothing in the Media domain
 * is written.
 *
 * Owner bug report 2026-08-26 — every tile was a broken-image icon. Cause:
 * `WorkspaceMediaLibrary` fills `item.thumbnailUrl` from `convertFileSrc`,
 * i.e. an `http://asset.localhost/...` URL, and this app does NOT enable
 * Tauri's asset protocol, so the webview refuses every one of them. The tiles
 * now load through `resolvePreviewUrl` — the same forceDataUrl lane the cards
 * and the full-screen viewer use — and `thumbnailUrl` is ignored here.
 *
 * Second half of the same report: every tile read `image-001.png`, because
 * each generation batch names its first file that. The label is now
 * "batch / file" (from the item's generated identity, or the containing
 * folder) so two batches are told apart at a glance.
 *
 * Also tightened to the shared compact anchored popover: no close button,
 * press outside or Escape to close.
 */
import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import type {
  WorkspaceMediaItem,
  WorkspaceMediaLibraryService,
} from '@/shared/services/workspace-media/WorkspaceMediaTypes';
import type {
  InfiniteCanvasImagePreviewResolver,
  InfiniteCanvasMediaRef,
} from './InfiniteCanvasNodes';
import { InfiniteCanvasPopover } from './InfiniteCanvasPopover';
import { workspaceMediaTileLabel } from './infiniteCanvasMediaLabels';

/** §7 after owner feedback: a compact anchored popover, not a page. */
const LIBRARY_POPOVER_WIDTH = 320;

type PickerState =
  | { phase: 'scanning' }
  | { phase: 'ready'; images: WorkspaceMediaItem[] }
  | { phase: 'empty' }
  | { phase: 'error' };

/** One tile. Resolves its own data-url preview, like the canvas cards do. */
const PickerTile: React.FC<{
  item: WorkspaceMediaItem;
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
  workspacePath: string;
  onPick: (mediaRef: InfiniteCanvasMediaRef) => void;
}> = ({ item, resolvePreviewUrl, workspacePath, onPick }) => {
  const [url, setUrl] = React.useState<string | undefined>(undefined);
  const label = workspaceMediaTileLabel(item);
  const { relativePath } = item;

  React.useEffect(() => {
    let cancelled = false;
    setUrl(undefined);
    void resolvePreviewUrl({ workspacePath, relativePath }, 'image')
      .then(resolved => {
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [relativePath, resolvePreviewUrl, workspacePath]);

  return (
    <button
      type="button"
      className="infinite-canvas-picker__item"
      data-canvas-library-item={relativePath}
      title={relativePath}
      onClick={() => onPick({ workspacePath, relativePath })}
    >
      {url ? (
        <img
          className="infinite-canvas-picker__thumbnail"
          src={url}
          alt=""
          draggable={false}
        />
      ) : (
        // §7: the grid stays a grid — a file whose preview has not landed (or
        // cannot be read) gets a flat block rather than a broken-image icon.
        <span className="infinite-canvas-picker__swatch" aria-hidden="true" />
      )}
      <span className="infinite-canvas-picker__item-name">{label}</span>
    </button>
  );
};

PickerTile.displayName = 'InfiniteCanvasImagePickerTile';

interface InfiniteCanvasImagePickerProps {
  workspacePath: string;
  mediaLibrary: WorkspaceMediaLibraryService;
  /** The forceDataUrl lane; the same resolver the cards and viewer use. */
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
  /** The control that opened it, for anchoring and press-outside handling. */
  anchor?: HTMLElement | null;
  onPick: (mediaRef: InfiniteCanvasMediaRef) => void;
  onClose: () => void;
}

export const InfiniteCanvasImagePicker: React.FC<InfiniteCanvasImagePickerProps> = ({
  workspacePath,
  mediaLibrary,
  resolvePreviewUrl,
  anchor,
  onPick,
  onClose,
}) => {
  const { t } = useI18n('components');
  const [state, setState] = React.useState<PickerState>({ phase: 'scanning' });

  React.useEffect(() => {
    let cancelled = false;
    setState({ phase: 'scanning' });
    void mediaLibrary.scanLibrary(workspacePath).then(library => {
      if (cancelled) return;
      if (library.status === 'ready') {
        const images = library.items.filter(item => item.kind === 'image');
        setState(images.length > 0 ? { phase: 'ready', images } : { phase: 'empty' });
      } else if (library.status === 'empty') {
        setState({ phase: 'empty' });
      } else {
        setState({ phase: 'error' });
      }
    }).catch(() => {
      if (!cancelled) setState({ phase: 'error' });
    });
    return () => {
      cancelled = true;
    };
  }, [mediaLibrary, workspacePath]);

  return (
    <InfiniteCanvasPopover
      kind="library"
      className="infinite-canvas-picker--library"
      anchor={anchor}
      width={LIBRARY_POPOVER_WIDTH}
      label={t('infiniteCanvas.imagePicker.title')}
      onDismiss={onClose}
    >
      <div className="infinite-canvas-picker__header">
        <h4>{t('infiniteCanvas.imagePicker.title')}</h4>
      </div>
      {state.phase === 'scanning' && (
        <p className="infinite-canvas-picker__state" data-state="scanning">
          {t('infiniteCanvas.imagePicker.loading')}
        </p>
      )}
      {state.phase === 'empty' && (
        <p className="infinite-canvas-picker__state" data-state="empty">
          {t('infiniteCanvas.imagePicker.empty')}
        </p>
      )}
      {state.phase === 'error' && (
        <p className="infinite-canvas-picker__state" data-state="error">
          {t('infiniteCanvas.imagePicker.error')}
        </p>
      )}
      {state.phase === 'ready' && (
        <ul className="infinite-canvas-picker__list infinite-canvas-picker__list--dense">
          {state.images.map(item => (
            <li key={item.id}>
              <PickerTile
                item={item}
                workspacePath={workspacePath}
                resolvePreviewUrl={resolvePreviewUrl}
                onPick={onPick}
              />
            </li>
          ))}
        </ul>
      )}
    </InfiniteCanvasPopover>
  );
};

InfiniteCanvasImagePicker.displayName = 'InfiniteCanvasImagePicker';
