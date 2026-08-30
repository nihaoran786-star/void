/**
 * Left icon rail (visual language §8).
 *
 * A column of thin-line icon buttons floating over the board — not a toolbar
 * that takes layout space. `+` is the loudest entry and expands into the
 * create menu that used to be four separate top-bar buttons; the library,
 * undo and redo follow it.
 *
 * §8 also lists flow/structure, chat, a media entry and a bottom avatar. This
 * panel has no capability behind any of them (the generation queue already
 * has its own entry, the canvas cannot open a chat, and there is no presence
 * port here), so they are not rendered: an icon that does nothing is worse
 * than an absent one.
 */
import React from 'react';
import {
  Clapperboard,
  ImagePlus,
  Images,
  Plus,
  Redo2,
  Sparkles,
  Type,
  Undo2,
} from 'lucide-react';

import { useI18n } from '@/infrastructure/i18n';

interface InfiniteCanvasRailProps {
  onAddText: () => void;
  onAddImage: (anchor?: HTMLElement) => void;
  onAddGenerationCard: () => void;
  onAddVideoCard: () => void;
  /** The button is handed over so the library popover anchors to the rail. */
  onOpenLibrary: (anchor?: HTMLElement) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoHint: string;
  redoHint: string;
}

export const InfiniteCanvasRail: React.FC<InfiniteCanvasRailProps> = ({
  onAddText,
  onAddImage,
  onAddGenerationCard,
  onAddVideoCard,
  onOpenLibrary,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  undoHint,
  redoHint,
}) => {
  const { t } = useI18n('components');
  const [menuOpen, setMenuOpen] = React.useState(false);

  const runAndClose = React.useCallback((
    action: (anchor?: HTMLElement) => void,
    anchor?: HTMLElement,
  ) => {
    setMenuOpen(false);
    action(anchor);
  }, []);

  const CREATE_ITEMS: { action: (anchor?: HTMLElement) => void; labelKey: string; icon: React.ReactNode; testId?: string }[] = [
    {
      action: onAddGenerationCard,
      labelKey: 'infiniteCanvas.toolbar.addGenerationCard',
      icon: <Sparkles size={14} aria-hidden="true" />,
    },
    {
      action: onAddVideoCard,
      labelKey: 'infiniteCanvas.toolbar.addVideoCard',
      icon: <Clapperboard size={14} aria-hidden="true" />,
      testId: 'add-video-card',
    },
    {
      action: onAddImage,
      labelKey: 'infiniteCanvas.toolbar.addImage',
      icon: <ImagePlus size={14} aria-hidden="true" />,
    },
    {
      action: onAddText,
      labelKey: 'infiniteCanvas.toolbar.addText',
      icon: <Type size={14} aria-hidden="true" />,
    },
  ];

  return (
    <div
      className="infinite-canvas-rail"
      role="toolbar"
      aria-label={t('infiniteCanvas.rail.label')}
      data-canvas-rail="root"
    >
      <button
        type="button"
        className="infinite-canvas-rail__button infinite-canvas-rail__button--primary"
        data-canvas-rail-action="new"
        aria-label={t('infiniteCanvas.rail.create')}
        title={t('infiniteCanvas.rail.create')}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(open => !open)}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
      {menuOpen ? (
        <div className="infinite-canvas-rail__menu" data-canvas-rail-menu="create">
          {CREATE_ITEMS.map(item => (
            <button
              key={item.labelKey}
              type="button"
              className="infinite-canvas-rail__menu-item"
              {...(item.testId ? { 'data-toolbar-action': item.testId } : {})}
              // No anchor from the create menu: the menu closes with the
              // click, so its button would be detached before a popover
              // could measure it. Those surfaces float centred instead.
              onClick={() => runAndClose(item.action)}
            >
              {item.icon}
              {t(item.labelKey)}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="infinite-canvas-rail__button"
        data-canvas-rail-action="library"
        aria-label={t('infiniteCanvas.rail.library')}
        title={t('infiniteCanvas.rail.library')}
        onClick={event => onOpenLibrary(event.currentTarget)}
      >
        <Images size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="infinite-canvas-rail__button"
        data-toolbar-action="undo"
        disabled={!canUndo}
        aria-label={t('infiniteCanvas.history.undo')}
        title={undoHint}
        onClick={onUndo}
      >
        <Undo2 size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="infinite-canvas-rail__button"
        data-toolbar-action="redo"
        disabled={!canRedo}
        aria-label={t('infiniteCanvas.history.redo')}
        title={redoHint}
        onClick={onRedo}
      >
        <Redo2 size={15} aria-hidden="true" />
      </button>
    </div>
  );
};

InfiniteCanvasRail.displayName = 'InfiniteCanvasRail';
