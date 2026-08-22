/**
 * Read-only picker over the Workspace Media library (M4).
 *
 * The picker only references media: choosing an item hands the caller a
 * `mediaRef` relative path. No file is copied and nothing in the Media domain
 * is written.
 */
import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import type {
  WorkspaceMediaItem,
  WorkspaceMediaLibraryService,
} from '@/shared/services/workspace-media/WorkspaceMediaTypes';
import type { InfiniteCanvasMediaRef } from './InfiniteCanvasNodes';

type PickerState =
  | { phase: 'scanning' }
  | { phase: 'ready'; images: WorkspaceMediaItem[] }
  | { phase: 'empty' }
  | { phase: 'error' };

export interface InfiniteCanvasImagePickerProps {
  workspacePath: string;
  mediaLibrary: WorkspaceMediaLibraryService;
  onPick: (mediaRef: InfiniteCanvasMediaRef) => void;
  onClose: () => void;
}

export const InfiniteCanvasImagePicker: React.FC<InfiniteCanvasImagePickerProps> = ({
  workspacePath,
  mediaLibrary,
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
    <aside
      className="infinite-canvas-picker"
      aria-label={t('infiniteCanvas.imagePicker.title')}
    >
      <header className="infinite-canvas-picker__header">
        <h4>{t('infiniteCanvas.imagePicker.title')}</h4>
        <button
          type="button"
          className="infinite-canvas-picker__close"
          onClick={onClose}
        >
          {t('infiniteCanvas.imagePicker.close')}
        </button>
      </header>
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
        <ul className="infinite-canvas-picker__list">
          {state.images.map(item => (
            <li key={item.id}>
              <button
                type="button"
                className="infinite-canvas-picker__item"
                onClick={() => onPick({
                  workspacePath,
                  relativePath: item.relativePath,
                })}
              >
                {item.thumbnailUrl ? (
                  <img
                    className="infinite-canvas-picker__thumbnail"
                    src={item.thumbnailUrl}
                    alt=""
                    draggable={false}
                  />
                ) : null}
                <span className="infinite-canvas-picker__item-name">
                  {item.fileName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
};

InfiniteCanvasImagePicker.displayName = 'InfiniteCanvasImagePicker';
