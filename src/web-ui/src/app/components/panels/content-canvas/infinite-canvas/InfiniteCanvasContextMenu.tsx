/**
 * Right-click menu for the Infinite Canvas panel (P4 W7, plan §2.5).
 *
 * Three states in one component, branched on `kind`:
 *
 * - `node`    — the card under the cursor: view / save a copy / show in folder
 *               (media only), generation parameters (generation cards only),
 *               copy, duplicate, delete.
 * - `selection` — two or more selected cards: copy, duplicate, delete.
 * - `pane`    — empty canvas: new text / image / video card at the click
 *               position, and paste.
 *
 * The component is business-free: it renders the items its state allows and
 * reports the chosen action. Every action it can report is also reachable from
 * a keyboard shortcut or a toolbar button, and both routes call the same panel
 * handler — the menu is never a second implementation.
 */
import React from 'react';

import { useI18n } from '@/infrastructure/i18n';

export type InfiniteCanvasContextMenuAction =
  | 'view'
  | 'save-as'
  | 'reveal'
  | 'params'
  | 'copy'
  | 'duplicate'
  | 'delete'
  | 'add-text'
  | 'add-image-card'
  | 'add-video-card'
  | 'paste';

export interface InfiniteCanvasContextMenuState {
  kind: 'node' | 'selection' | 'pane';
  /** Panel-relative pixel position of the click. */
  x: number;
  /** Panel-relative pixel position of the click. */
  y: number;
  /** Canvas coordinates of the click; where a new card lands. */
  flowPosition: { x: number; y: number };
  /** `node` state only. */
  nodeId?: string;
  /** `node` state: the card holds an image or a video. */
  hasMedia?: boolean;
  /** `node` state: the card can generate (image or video card). */
  canGenerate?: boolean;
  /** `selection` state: how many cards are selected. */
  selectionCount?: number;
}

export interface InfiniteCanvasContextMenuProps {
  state: InfiniteCanvasContextMenuState;
  /** False when the app clipboard is empty; the paste item is then disabled. */
  canPaste: boolean;
  onAction: (action: InfiniteCanvasContextMenuAction) => void;
  onClose: () => void;
}

interface MenuItem {
  action: InfiniteCanvasContextMenuAction;
  labelKey: string;
  disabled?: boolean;
}

function itemsFor(
  state: InfiniteCanvasContextMenuState,
  canPaste: boolean,
): MenuItem[] {
  if (state.kind === 'pane') {
    return [
      { action: 'add-text', labelKey: 'infiniteCanvas.toolbar.addText' },
      { action: 'add-image-card', labelKey: 'infiniteCanvas.toolbar.addGenerationCard' },
      { action: 'add-video-card', labelKey: 'infiniteCanvas.toolbar.addVideoCard' },
      { action: 'paste', labelKey: 'infiniteCanvas.menu.paste', disabled: !canPaste },
    ];
  }
  if (state.kind === 'selection') {
    return [
      { action: 'copy', labelKey: 'infiniteCanvas.menu.copySelection' },
      { action: 'duplicate', labelKey: 'infiniteCanvas.menu.duplicate' },
      { action: 'delete', labelKey: 'infiniteCanvas.menu.deleteSelection' },
    ];
  }
  return [
    // The three media entries only exist once the card actually has a file.
    ...(state.hasMedia
      ? ([
          { action: 'view', labelKey: 'infiniteCanvas.viewer.open' },
          { action: 'save-as', labelKey: 'infiniteCanvas.viewer.saveAs' },
          { action: 'reveal', labelKey: 'infiniteCanvas.menu.reveal' },
        ] satisfies MenuItem[])
      : []),
    ...(state.canGenerate
      ? ([{ action: 'params', labelKey: 'infiniteCanvas.params.title' }] satisfies MenuItem[])
      : []),
    { action: 'copy', labelKey: 'infiniteCanvas.menu.copy' },
    { action: 'duplicate', labelKey: 'infiniteCanvas.menu.duplicate' },
    { action: 'delete', labelKey: 'infiniteCanvas.menu.delete' },
  ];
}

export const InfiniteCanvasContextMenu: React.FC<InfiniteCanvasContextMenuProps> = ({
  state,
  canPaste,
  onAction,
  onClose,
}) => {
  const { t } = useI18n('components');
  const items = itemsFor(state, canPaste);

  // Escape closes; the panel closes it on any outside pointer press.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="infinite-canvas-menu"
      role="menu"
      data-canvas-menu={state.kind}
      style={{ left: `${state.x}px`, top: `${state.y}px` }}
      onContextMenu={event => event.preventDefault()}
    >
      {items.map(item => (
        <button
          key={item.action}
          type="button"
          role="menuitem"
          className="infinite-canvas-menu__item"
          data-canvas-menu-action={item.action}
          disabled={item.disabled}
          onClick={() => onAction(item.action)}
        >
          {t(item.labelKey)}
        </button>
      ))}
    </div>
  );
};

InfiniteCanvasContextMenu.displayName = 'InfiniteCanvasContextMenu';
