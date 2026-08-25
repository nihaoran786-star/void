/**
 * Deletion confirmation for the Infinite Canvas panel (P4 W6, plan §2.5).
 *
 * A business-free shell over the existing `infinite-canvas-dialog` styles. The
 * panel decides whether a confirmation is needed at all (see
 * `classifyDeletionTargets`); this component only states the counts and the
 * one thing the user most needs to know: the image files are not deleted.
 *
 * The counts also ride on data attributes so behaviour tests can pin them
 * without asserting on copy.
 */
import React from 'react';

import { useI18n } from '@/infrastructure/i18n';
import type { InfiniteCanvasDeletionSummary } from './infiniteCanvasPanelModel';

export interface InfiniteCanvasConfirmDialogProps {
  summary: InfiniteCanvasDeletionSummary;
  onConfirm: () => void;
  onCancel: () => void;
}

export const InfiniteCanvasConfirmDialog: React.FC<InfiniteCanvasConfirmDialogProps> = ({
  summary,
  onConfirm,
  onCancel,
}) => {
  const { t } = useI18n('components');
  const count = summary.nodeIds.length;

  return (
    <div
      className="infinite-canvas-dialog infinite-canvas-dialog--confirm"
      role="dialog"
      aria-label={t('infiniteCanvas.delete.title')}
      data-canvas-confirm="delete"
      data-delete-count={count}
      data-delete-media-count={summary.mediaCount}
      data-delete-pending-count={summary.pendingCount}
    >
      <div className="infinite-canvas-dialog__header">
        <h4>{t('infiniteCanvas.delete.title')}</h4>
        <button
          type="button"
          className="infinite-canvas-dialog__close"
          data-canvas-confirm-action="cancel"
          onClick={onCancel}
        >
          {t('infiniteCanvas.delete.cancel')}
        </button>
      </div>
      <p className="infinite-canvas-dialog__hint">
        {t('infiniteCanvas.delete.summary', { count })}
      </p>
      {summary.mediaCount > 0 ? (
        <p className="infinite-canvas-dialog__hint">
          {t('infiniteCanvas.delete.withMedia', { count: summary.mediaCount })}
        </p>
      ) : null}
      {summary.pendingCount > 0 ? (
        <p className="infinite-canvas-dialog__hint">
          {t('infiniteCanvas.delete.withPending', { count: summary.pendingCount })}
        </p>
      ) : null}
      <p className="infinite-canvas-dialog__hint infinite-canvas-dialog__hint--strong">
        {t('infiniteCanvas.delete.filesKept')}
      </p>
      <div className="infinite-canvas-dialog__actions">
        <button
          type="button"
          className="infinite-canvas-dialog__confirm"
          data-canvas-confirm-action="confirm"
          onClick={onConfirm}
        >
          {t('infiniteCanvas.delete.confirm')}
        </button>
      </div>
    </div>
  );
};

InfiniteCanvasConfirmDialog.displayName = 'InfiniteCanvasConfirmDialog';
