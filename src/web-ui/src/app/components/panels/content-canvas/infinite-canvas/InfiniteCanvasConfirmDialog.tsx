/**
 * The Infinite Canvas panel's confirmation dialogs (P4 W6, plan §2.5).
 *
 * One business-free shell over the existing `infinite-canvas-dialog` styles —
 * title, a stack of short lines, cancel, confirm — plus the two dialogs the
 * board actually asks for. The panel decides whether a confirmation is needed
 * at all (see `classifyDeletionTargets`); nothing here has an opinion.
 *
 * There used to be two hand-written copies of this markup, one here and one
 * inline in the panel, which is why the retry dialog quietly lost the deletion
 * dialog's structure. Same DOM, written once.
 *
 * The identifying `data-canvas-confirm` value and the counts ride on data
 * attributes so behaviour tests can pin them without asserting on copy.
 */
import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import type { InfiniteCanvasDeletionSummary } from './infiniteCanvasPanelViewTypes';

/** One line of the dialog body, in the order it is rendered. */
interface ConfirmDialogLine {
  text: string;
  /** The one line the user most needs to read. */
  strong?: boolean;
}

interface InfiniteCanvasConfirmDialogProps {
  /** Value for `data-canvas-confirm`; how tests and styles find the dialog. */
  variant: 'delete' | 'retry-cancelled';
  title: string;
  body: readonly ConfirmDialogLine[];
  cancelLabel: string;
  confirmLabel: string;
  /** Extra `data-*` attributes this particular dialog carries. */
  dataAttributes?: Record<string, string | number>;
  onConfirm: () => void;
  onCancel: () => void;
}

const InfiniteCanvasConfirmDialog: React.FC<InfiniteCanvasConfirmDialogProps> = ({
  variant,
  title,
  body,
  cancelLabel,
  confirmLabel,
  dataAttributes,
  onConfirm,
  onCancel,
}) => (
  <div
    className="infinite-canvas-dialog infinite-canvas-dialog--confirm"
    role="dialog"
    aria-label={title}
    data-canvas-confirm={variant}
    {...dataAttributes}
  >
    <div className="infinite-canvas-dialog__header">
      <h4>{title}</h4>
      <button
        type="button"
        className="infinite-canvas-dialog__close"
        data-canvas-confirm-action="cancel"
        onClick={onCancel}
      >
        {cancelLabel}
      </button>
    </div>
    {body.map(line => (
      <p
        key={line.text}
        className={line.strong
          ? 'infinite-canvas-dialog__hint infinite-canvas-dialog__hint--strong'
          : 'infinite-canvas-dialog__hint'}
      >
        {line.text}
      </p>
    ))}
    <div className="infinite-canvas-dialog__actions">
      <button
        type="button"
        className="infinite-canvas-dialog__confirm"
        data-canvas-confirm-action="confirm"
        onClick={onConfirm}
      >
        {confirmLabel}
      </button>
    </div>
  </div>
);

InfiniteCanvasConfirmDialog.displayName = 'InfiniteCanvasConfirmDialog';

interface InfiniteCanvasDeleteConfirmDialogProps {
  summary: InfiniteCanvasDeletionSummary;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * "Delete these cards?" — states the counts and the one thing the user most
 * needs to know: the image files are not deleted.
 */
export const InfiniteCanvasDeleteConfirmDialog: React.FC<
  InfiniteCanvasDeleteConfirmDialogProps
> = ({ summary, onConfirm, onCancel }) => {
  const { t } = useI18n('components');
  const count = summary.nodeIds.length;

  return (
    <InfiniteCanvasConfirmDialog
      variant="delete"
      title={t('infiniteCanvas.delete.title')}
      body={[
        { text: t('infiniteCanvas.delete.summary', { count }) },
        ...(summary.mediaCount > 0
          ? [{ text: t('infiniteCanvas.delete.withMedia', { count: summary.mediaCount }) }]
          : []),
        ...(summary.pendingCount > 0
          ? [{ text: t('infiniteCanvas.delete.withPending', { count: summary.pendingCount }) }]
          : []),
        { text: t('infiniteCanvas.delete.filesKept'), strong: true },
      ]}
      cancelLabel={t('infiniteCanvas.delete.cancel')}
      confirmLabel={t('infiniteCanvas.delete.confirm')}
      dataAttributes={{
        'data-delete-count': count,
        'data-delete-media-count': summary.mediaCount,
        'data-delete-pending-count': summary.pendingCount,
      }}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
};

InfiniteCanvasDeleteConfirmDialog.displayName = 'InfiniteCanvasDeleteConfirmDialog';

interface InfiniteCanvasRetryCancelledDialogProps {
  nodeId: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** "Send this cancelled task again?" — the one confirmation before a re-send. */
export const InfiniteCanvasRetryCancelledDialog: React.FC<
  InfiniteCanvasRetryCancelledDialogProps
> = ({ nodeId, onConfirm, onCancel }) => {
  const { t } = useI18n('components');

  return (
    <InfiniteCanvasConfirmDialog
      variant="retry-cancelled"
      title={t('infiniteCanvas.tasks.retryCancelled.title')}
      body={[
        { text: t('infiniteCanvas.tasks.retryCancelled.body'), strong: true },
        { text: t('infiniteCanvas.tasks.retryCancelled.detail') },
      ]}
      cancelLabel={t('infiniteCanvas.tasks.retryCancelled.cancel')}
      confirmLabel={t('infiniteCanvas.tasks.retryCancelled.confirm')}
      dataAttributes={{ 'data-canvas-confirm-node': nodeId }}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
};

InfiniteCanvasRetryCancelledDialog.displayName = 'InfiniteCanvasRetryCancelledDialog';
