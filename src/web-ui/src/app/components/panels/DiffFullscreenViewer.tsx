import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, XCircle, FileText } from 'lucide-react';
import { Tooltip } from '@/component-library';
import { useI18n } from '@/infrastructure/i18n';
import { DiffEditor } from '../../../tools/editor';
import './DiffFullscreenViewer.css';

interface DiffFullscreenViewerProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  onAcceptFile: () => void;
  onRejectFile: () => void;
  onAcceptBlock: (blockId: string) => void;
  onRejectBlock: (blockId: string) => void;
  loading?: boolean;
}

export const DiffFullscreenViewer: React.FC<DiffFullscreenViewerProps> = ({
  isOpen,
  onClose,
  filePath,
  originalContent,
  modifiedContent,
  onAcceptFile,
  onRejectFile,
  onAcceptBlock: _onAcceptBlock,
  onRejectBlock: _onRejectBlock,
  loading = false
}) => {
  const { t } = useI18n('components');
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();

  // Keep keyboard focus inside the fullscreen viewer and restore its launcher.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousBodyOverflow;
      const returnTarget = returnFocusRef.current;
      returnFocusRef.current = null;
      if (returnTarget?.isConnected) {
        window.requestAnimationFrame(() => returnTarget.focus());
      }
    };
  }, [isOpen]);

  const handleDialogKeyDown = useCallback((
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    const dialog = dialogRef.current;
    if (!dialog || !dialog.contains(event.target as Node)) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }

    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    )).filter(element => element.getClientRects().length > 0);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }, [onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!isOpen) return null;

  const fileName = filePath.split(/[/\\]/).pop() || filePath;

  const fullscreenContent = (
    <div className="diff-fullscreen-overlay" onClick={handleBackdropClick}>
      <div
        ref={dialogRef}
        className="diff-fullscreen-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
      >
        {/* Top toolbar */}
        <div className="diff-fullscreen-header">
          <div className="file-info">
            <div className="file-icon">
              <FileText size={16} aria-hidden="true" />
            </div>
            <div className="file-details">
              <div id={titleId} className="file-name">{fileName}</div>
              <div className="file-path-full">{filePath}</div>
            </div>
          </div>

          <div className="header-actions">
            <Tooltip content={t('diffFullscreen.acceptFileTooltip')}>
              <button
                type="button"
                className="header-btn accept-btn"
                onClick={onAcceptFile}
                disabled={loading}
              >
                <CheckCircle size={16} />
                <span>{t('diffFullscreen.acceptFile')}</span>
              </button>
            </Tooltip>
            
            <Tooltip content={t('diffFullscreen.rejectFileTooltip')}>
              <button
                type="button"
                className="header-btn reject-btn"
                onClick={onRejectFile}
                disabled={loading}
              >
                <XCircle size={16} />
                <span>{t('diffFullscreen.rejectFile')}</span>
              </button>
            </Tooltip>

            <div className="header-divider" />

            <Tooltip content={t('tooltip.close')}>
              <button
                ref={closeButtonRef}
                type="button"
                className="header-btn close-btn"
                onClick={onClose}
                aria-label={t('tooltip.close')}
              >
                <X size={16} />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Diff content */}
        <div className="diff-fullscreen-content">
          <DiffEditor
            originalContent={originalContent}
            modifiedContent={modifiedContent}
            filePath={filePath}
            readOnly={false}
            renderSideBySide={true}
            showMinimap={false}
          />
        </div>

        {/* Loading overlay */}
        {loading && (
          <div
            className="fullscreen-loading-overlay"
            role="status"
            aria-live="polite"
          >
            <div className="loading-spinner" />
            <span>{t('diffFullscreen.processing')}</span>
          </div>
        )}
      </div>
    </div>
  );

  // Render via portal to body for top-level stacking.
  return createPortal(fullscreenContent, document.body);
};
