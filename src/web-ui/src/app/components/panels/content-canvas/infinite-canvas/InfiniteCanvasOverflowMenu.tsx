/**
 * The card pill's "more (…)" drawer (visual language §4).
 *
 * §4 caps the pill at "about ten" icons and says the rest go behind the
 * overflow entry. The pill had grown to thirteen, so the three lowest-traffic
 * entries moved in here — outpainting (`expand`), reverse-prompt and
 * image-to-video — together with the card-scoped entries the pill has never
 * had an icon for (show in folder, copy, duplicate, delete). One press now
 * reaches all of them, where before "more" only re-opened the right-click
 * menu.
 *
 * Nothing here is a second implementation: every entry reports an action and
 * the panel routes it to the exact handler its shortcut or its context-menu
 * item already calls. §7's rule holds too — an entry this card cannot run is
 * absent, not greyed out.
 *
 * The surface itself is the shared `InfiniteCanvasPopover`: same compact
 * anchored box, same panel-relative placement maths, same
 * `useInfiniteCanvasDismiss` contract (outside press or Escape, no close
 * button), and the same "stay invisible until measured" rule.
 */
import React from 'react';

import {
  Copy,
  CopyPlus,
  Film,
  FolderOpen,
  Frame,
  ScanText,
  Trash2,
} from 'lucide-react';

import { useI18n } from '@/infrastructure/i18n';

import { InfiniteCanvasPopover } from './InfiniteCanvasPopover';
import { INFINITE_CANVAS_POPOVER_WIDTH } from './infiniteCanvasPopoverPlacement';

export type InfiniteCanvasOverflowAction =
  | 'expand'
  | 'reverse-prompt'
  | 'derive-video'
  | 'reveal'
  | 'copy'
  | 'duplicate'
  | 'delete';

/** What this particular card can actually run (§7: hide, do not grey out). */
export interface InfiniteCanvasOverflowAvailability {
  /** Image card carrying a picture: outpainting can act on it. */
  expand: boolean;
  reversePrompt: boolean;
  deriveVideo: boolean;
  reveal: boolean;
}

interface OverflowItem {
  action: InfiniteCanvasOverflowAction;
  labelKey: string;
  icon: React.ReactNode;
  /** Which availability flag gates the entry; always shown when absent. */
  gate?: keyof InfiniteCanvasOverflowAvailability;
  /** Starts a new hairline-separated block. */
  startsGroup?: boolean;
}

const ITEMS: readonly OverflowItem[] = [
  // Demoted from the pill. `Frame` rather than lucide's `Expand`: the
  // four-arrows-out glyph is the universal full-screen mark and sat two icons
  // away from the real full-screen entry. Outpainting draws a bigger frame
  // around the picture, so a frame is what it shows.
  {
    action: 'expand',
    labelKey: 'infiniteCanvas.tools.expand',
    icon: <Frame size={13} aria-hidden="true" />,
    gate: 'expand',
  },
  {
    action: 'reverse-prompt',
    labelKey: 'infiniteCanvas.reversePrompt.button',
    icon: <ScanText size={13} aria-hidden="true" />,
    gate: 'reversePrompt',
  },
  // `Film` rather than `Play`: play is what the video card's own label and
  // its transport bar mean, and on an image card it read as "play this
  // picture" instead of "make a video from it".
  {
    action: 'derive-video',
    labelKey: 'infiniteCanvas.video.deriveFromImage',
    icon: <Film size={13} aria-hidden="true" />,
    gate: 'deriveVideo',
  },
  // Card-scoped entries: previously only reachable through the right-click
  // menu, which is still there and still identical.
  {
    action: 'reveal',
    labelKey: 'infiniteCanvas.menu.reveal',
    icon: <FolderOpen size={13} aria-hidden="true" />,
    gate: 'reveal',
    startsGroup: true,
  },
  {
    action: 'copy',
    labelKey: 'infiniteCanvas.menu.copy',
    icon: <Copy size={13} aria-hidden="true" />,
  },
  {
    action: 'duplicate',
    labelKey: 'infiniteCanvas.menu.duplicate',
    icon: <CopyPlus size={13} aria-hidden="true" />,
  },
  {
    action: 'delete',
    labelKey: 'infiniteCanvas.menu.delete',
    icon: <Trash2 size={13} aria-hidden="true" />,
  },
];

interface InfiniteCanvasOverflowMenuProps {
  /** The pill's "more" button; the surface anchors to it and it never dismisses. */
  anchor: HTMLElement | null;
  available: InfiniteCanvasOverflowAvailability;
  /** True while this card's reverse-prompt call is in flight. */
  reversePromptPending?: boolean;
  onAction: (action: InfiniteCanvasOverflowAction) => void;
  onDismiss: () => void;
}

export const InfiniteCanvasOverflowMenu: React.FC<InfiniteCanvasOverflowMenuProps> = ({
  anchor,
  available,
  reversePromptPending,
  onAction,
  onDismiss,
}) => {
  const { t } = useI18n('components');
  const items = ITEMS.filter(item => (item.gate ? available[item.gate] : true));

  return (
    <InfiniteCanvasPopover
      kind="card-overflow"
      className="infinite-canvas-picker--overflow"
      anchor={anchor}
      width={INFINITE_CANVAS_POPOVER_WIDTH.overflow}
      label={t('infiniteCanvas.menu.more')}
      onDismiss={onDismiss}
    >
      <div className="infinite-canvas-overflow" role="menu">
        {items.map((item, index) => {
          // The hairline only earns its place when both sides are populated.
          const divider = item.startsGroup && index > 0;
          const pending = item.action === 'reverse-prompt' && reversePromptPending;
          return (
            <React.Fragment key={item.action}>
              {divider ? (
                <span className="infinite-canvas-overflow__divider" aria-hidden="true" />
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="infinite-canvas-overflow__item"
                data-node-action={item.action}
                data-canvas-overflow-action={item.action}
                data-tool-id={item.action === 'expand' ? 'expand' : undefined}
                data-pending={pending ? 'true' : undefined}
                disabled={pending || undefined}
                aria-busy={pending || undefined}
                onClick={() => onAction(item.action)}
              >
                <span className="infinite-canvas-overflow__icon">{item.icon}</span>
                <span className="infinite-canvas-overflow__label">{t(item.labelKey)}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </InfiniteCanvasPopover>
  );
};

InfiniteCanvasOverflowMenu.displayName = 'InfiniteCanvasOverflowMenu';
