/**
 * The three surfaces a card's own toolbar opens: the "more (…)" drawer, the
 * question that guards the billed reverse-prompt call, and the "replace or
 * append" choice that comes back from it.
 *
 * A dumb renderer. Which entries the drawer may show, whether a call is in
 * flight, and what each press does are all settled in the panel and arrive
 * here already decided — in particular, NOTHING in this file starts a paid
 * call: the confirm button reports the press and the panel does the spending.
 */
import React from 'react';

import {
  InfiniteCanvasOverflowMenu,
  type InfiniteCanvasOverflowAction,
  type InfiniteCanvasOverflowAvailability,
} from './InfiniteCanvasOverflowMenu';
import { InfiniteCanvasPopover } from './InfiniteCanvasPopover';
import { INFINITE_CANVAS_POPOVER_WIDTH } from './infiniteCanvasPopoverPlacement';

export interface InfiniteCanvasMenusProps {
  t: (key: string) => string;

  /** §4: the open "more" drawer, or null. */
  overflow: { nodeId: string; anchor: HTMLElement | null } | null;
  /** Which of the drawer's entries this card can actually run. */
  overflowAvailable: InfiniteCanvasOverflowAvailability;
  overflowReversePromptPending: boolean;
  onOverflowAction: (action: InfiniteCanvasOverflowAction) => void;
  onDismissOverflow: () => void;

  /** The card waiting on the owner's "yes, spend it" before any call is made. */
  reversePromptSpend: { nodeId: string; anchor: HTMLElement | null } | null;
  onConfirmReversePromptSpend: () => void;
  onCancelReversePromptSpend: () => void;

  /** The reversed prompt waiting on "replace or append". */
  reversePromptChoice: { anchor: HTMLElement | null; prompt: string } | null;
  onApplyReversePrompt: (mode: 'replace' | 'append') => void;
  onDismissReversePromptChoice: () => void;
}

export const InfiniteCanvasMenus: React.FC<InfiniteCanvasMenusProps> = ({
  t,
  overflow,
  overflowAvailable,
  overflowReversePromptPending,
  onOverflowAction,
  onDismissOverflow,
  reversePromptSpend,
  onConfirmReversePromptSpend,
  onCancelReversePromptSpend,
  reversePromptChoice,
  onApplyReversePrompt,
  onDismissReversePromptChoice,
}) => (
  <>
    {/*
      §4: the "more (…)" drawer. Same compact anchored surface and same
      dismissal contract as every other canvas popover; it just happens to
      hold menu items.
    */}
    {overflow ? (
      <InfiniteCanvasOverflowMenu
        anchor={overflow.anchor}
        available={overflowAvailable}
        reversePromptPending={overflowReversePromptPending}
        onDismiss={onDismissOverflow}
        onAction={onOverflowAction}
      />
    ) : null}
    {/*
      P5 W7: the prompt box was not empty, so the reversed prompt waits for
      one word from the owner. Anchored to the button that produced it and
      dismissed like every other canvas surface (outside press / Escape),
      which is also how "neither, forget it" is expressed — there is no
      cancel button, per the visual language.
    */}
    {/*
      Owner approval 2026-08-27: reverse-prompt is billed, so the press opens
      this compact confirmation instead of calling anything. §7.1's anchored
      surface, two words of copy, one confirm and one way out — dismissing it
      by any route (outside press, Escape, "not now") calls nothing at all.
    */}
    {reversePromptSpend ? (
      <InfiniteCanvasPopover
        kind="reverse-prompt-spend"
        className="infinite-canvas-picker--reverse-prompt"
        anchor={reversePromptSpend.anchor}
        width={INFINITE_CANVAS_POPOVER_WIDTH.reversePrompt}
        label={t('infiniteCanvas.reversePrompt.spend.title')}
        onDismiss={onCancelReversePromptSpend}
      >
        <p className="infinite-canvas-picker__state">
          {t('infiniteCanvas.reversePrompt.spend.body')}
        </p>
        <div className="infinite-canvas-reverse-prompt__actions">
          <button
            type="button"
            className="infinite-canvas-picker__pill"
            data-canvas-reverse-prompt-action="spend-cancel"
            onClick={onCancelReversePromptSpend}
          >
            {t('infiniteCanvas.reversePrompt.spend.cancel')}
          </button>
          <button
            type="button"
            className="infinite-canvas-picker__pill"
            data-canvas-reverse-prompt-action="spend-confirm"
            data-canvas-reverse-prompt-node={reversePromptSpend.nodeId}
            onClick={onConfirmReversePromptSpend}
          >
            {t('infiniteCanvas.reversePrompt.spend.confirm')}
          </button>
        </div>
      </InfiniteCanvasPopover>
    ) : null}
    {reversePromptChoice ? (
      <InfiniteCanvasPopover
        kind="reverse-prompt"
        className="infinite-canvas-picker--reverse-prompt"
        anchor={reversePromptChoice.anchor}
        width={INFINITE_CANVAS_POPOVER_WIDTH.reversePrompt}
        label={t('infiniteCanvas.reversePrompt.choiceTitle')}
        onDismiss={onDismissReversePromptChoice}
      >
        <p className="infinite-canvas-picker__state">
          {t('infiniteCanvas.reversePrompt.choiceHint')}
        </p>
        <p
          className="infinite-canvas-reverse-prompt__preview"
          data-canvas-reverse-prompt="preview"
        >
          {reversePromptChoice.prompt}
        </p>
        <div className="infinite-canvas-reverse-prompt__actions">
          <button
            type="button"
            className="infinite-canvas-picker__pill"
            data-canvas-reverse-prompt-action="replace"
            onClick={() => onApplyReversePrompt('replace')}
          >
            {t('infiniteCanvas.reversePrompt.replace')}
          </button>
          <button
            type="button"
            className="infinite-canvas-picker__pill"
            data-canvas-reverse-prompt-action="append"
            onClick={() => onApplyReversePrompt('append')}
          >
            {t('infiniteCanvas.reversePrompt.append')}
          </button>
        </div>
      </InfiniteCanvasPopover>
    ) : null}
  </>
);

InfiniteCanvasMenus.displayName = 'InfiniteCanvasMenus';
