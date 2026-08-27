/**
 * Instruction-completion layer for the five image tools (K2 W6).
 *
 * A thin, business-free component: it prefills the tool's instruction
 * template and only enables confirmation once every 【】 placeholder has been
 * replaced. The panel owns everything that happens after confirm.
 */
import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import type { ImageToolId } from '@/shared/services/infinite-canvas';
import {
  IMAGE_TOOL_DEFINITIONS,
  instructionBlockReason,
} from '@/shared/services/infinite-canvas';

export interface InfiniteCanvasToolInstructionDialogProps {
  toolId: ImageToolId;
  onConfirm: (instruction: string) => void;
  onClose: () => void;
}

export const InfiniteCanvasToolInstructionDialog: React.FC<
  InfiniteCanvasToolInstructionDialogProps
> = ({ toolId, onConfirm, onClose }) => {
  const { t } = useI18n('components');
  const definition = IMAGE_TOOL_DEFINITIONS.find(entry => entry.toolId === toolId);
  const template = definition?.instructionTemplate ?? '';
  const [draft, setDraft] = React.useState(template);

  // P5 review P16: the block is judged against THIS template's own tokens, so
  // 【】 used as ordinary punctuation never disables the button — and when the
  // button is disabled the dialog says which of the two reasons it is.
  const blocked = instructionBlockReason(draft, template);

  return (
    <div
      className="infinite-canvas-dialog"
      role="dialog"
      aria-label={t('infiniteCanvas.tools.instructionTitle')}
      data-tool-id={toolId}
    >
      <div className="infinite-canvas-dialog__header">
        <h4>
          {t('infiniteCanvas.tools.instructionTitle')}
          {definition ? ` · ${t(definition.labelKey)}` : null}
        </h4>
        <button
          type="button"
          className="infinite-canvas-dialog__close"
          onClick={onClose}
        >
          {t('infiniteCanvas.tools.cancel')}
        </button>
      </div>
      <p className="infinite-canvas-dialog__hint">
        {t('infiniteCanvas.tools.instructionHint')}
      </p>
      <textarea
        className="infinite-canvas-dialog__input"
        aria-label={t('infiniteCanvas.tools.instructionLabel')}
        value={draft}
        onChange={event => setDraft(event.target.value)}
      />
      <div className="infinite-canvas-dialog__actions">
        {blocked ? (
          <p className="infinite-canvas-dialog__blocked" data-blocked-reason={blocked}>
            {t(`infiniteCanvas.tools.blocked.${blocked}`)}
          </p>
        ) : null}
        <button
          type="button"
          className="infinite-canvas-dialog__confirm"
          disabled={Boolean(blocked)}
          onClick={() => onConfirm(draft.trim())}
        >
          {t('infiniteCanvas.tools.confirm')}
        </button>
      </div>
    </div>
  );
};

InfiniteCanvasToolInstructionDialog.displayName = 'InfiniteCanvasToolInstructionDialog';
