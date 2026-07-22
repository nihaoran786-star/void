/**
 * Snapshot fullscreen diff viewer for all session file changes.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, XCircle, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/component-library';
import { DiffEditor } from '../../tools/editor';
import type { SnapshotFile } from '../../tools/snapshot_system/core/SnapshotStateManager';
import { createLogger } from '@/shared/utils/logger';
import './SnapshotFullscreenDiffViewer.css';

const log = createLogger('SnapshotFullscreenDiffViewer');

interface SnapshotFullscreenDiffViewerProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string;
  files: SnapshotFile[];
  onAcceptFile: (filePath: string) => Promise<void>;
  onRejectFile: (filePath: string) => Promise<void>;
  onAcceptBlock: (filePath: string, blockId: string) => Promise<void>;
  onRejectBlock: (filePath: string, blockId: string) => Promise<void>;
  loading?: boolean;
}

export const SnapshotFullscreenDiffViewer: React.FC<SnapshotFullscreenDiffViewerProps> = ({
  isOpen,
  onClose,
  files,
  onAcceptFile,
  onRejectFile,
  onAcceptBlock: _onAcceptBlock,
  onRejectBlock: _onRejectBlock,
  loading = false
}) => {
  const { t } = useTranslation('flow-chat');
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();

  // Keep the fullscreen viewer modal and return focus to its launcher.
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

  const handleDialogKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
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

  const handleFileNavigationKeyDown = useCallback((
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (files.length <= 1) {
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    setSelectedFileIndex((previous) => {
      const current = Math.min(previous, files.length - 1);
      if (event.key === 'Home') return 0;
      if (event.key === 'End') return files.length - 1;
      if (event.key === 'ArrowLeft') {
        return current > 0 ? current - 1 : files.length - 1;
      }
      return current < files.length - 1 ? current + 1 : 0;
    });
  }, [files.length]);

  // Reset selection when opening.
  useEffect(() => {
    if (isOpen && files.length > 0) {
      setSelectedFileIndex(0);
      setActionError(null);
    }
  }, [isOpen, files.length]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // File-level actions with error logging.
  const handleFileAction = useCallback(async (action: 'accept' | 'reject') => {
    const currentIndex = Math.min(selectedFileIndex, files.length - 1);
    if (currentIndex < 0) return;

    const file = files[currentIndex];
    setActionError(null);
    try {
      if (action === 'accept') {
        await onAcceptFile(file.filePath);
      } else {
        await onRejectFile(file.filePath);
      }
    } catch (error) {
      log.error(`File ${action} operation failed`, { filePath: file.filePath, action, error });
      setActionError(t(
        action === 'accept'
          ? 'snapshotSystem.errors.acceptFileFailed'
          : 'snapshotSystem.errors.rejectFileFailed',
      ));
    }
  }, [selectedFileIndex, files, onAcceptFile, onRejectFile, t]);

  // Batch actions with error logging.
  const handleBatchAction = useCallback(async (action: 'accept' | 'reject') => {
    setActionError(null);
    try {
      for (const file of files) {
        if (action === 'accept') {
          await onAcceptFile(file.filePath);
        } else {
          await onRejectFile(file.filePath);
        }
      }
    } catch (error) {
      log.error(`Batch ${action} operation failed`, { action, fileCount: files.length, error });
      setActionError(t(
        action === 'accept'
          ? 'snapshotSystem.errors.acceptSessionFailed'
          : 'snapshotSystem.errors.rejectSessionFailed',
      ));
    }
  }, [files, onAcceptFile, onRejectFile, t]);

  if (!isOpen || files.length === 0) return null;

  const safeSelectedFileIndex = Math.min(selectedFileIndex, files.length - 1);
  const currentFile = files[safeSelectedFileIndex];
  const fileName = currentFile?.filePath.split(/[/\\]/).pop() || '';

  // Aggregate change stats for the header.
  const stats = {
    totalFiles: files.length,
    totalAdditions: files.reduce((sum, file) => {
      const diff = file.modifiedContent.split('\n').length - file.originalContent.split('\n').length;
      return sum + Math.max(0, diff);
    }, 0),
    totalDeletions: files.reduce((sum, file) => {
      const diff = file.originalContent.split('\n').length - file.modifiedContent.split('\n').length;
      return sum + Math.max(0, diff);
    }, 0)
  };

  const fullscreenContent = (
    <div className="snapshot-fullscreen-overlay" onClick={handleBackdropClick}>
      <div
        ref={dialogRef}
        className="snapshot-fullscreen-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
      >
        <div className="snapshot-fullscreen-header">
          <div className="session-info">
            <div className="session-icon">
              <FileText size={20} />
            </div>
            <div className="session-details">
              <div id={titleId} className="session-title">
                {t('toolCards.snapshot.fileDiff')}
              </div>
              <div className="session-stats">
                {t('toolCards.snapshot.filesCount', { count: stats.totalFiles })}
                {stats.totalAdditions > 0 && <span className="additions">+{stats.totalAdditions}</span>}
                {stats.totalDeletions > 0 && <span className="deletions">-{stats.totalDeletions}</span>}
              </div>
            </div>
          </div>

          <div className="header-actions">
            <Tooltip content={t('toolCards.snapshot.acceptAllTooltip')}>
              <button
                type="button"
                className="header-btn batch-accept-btn"
                onClick={() => handleBatchAction('accept')}
                disabled={loading}
              >
                <CheckCircle size={16} />
                <span>{t('toolCards.snapshot.acceptAll')}</span>
              </button>
            </Tooltip>
            
            <Tooltip content={t('toolCards.snapshot.rejectAllTooltip')}>
              <button
                type="button"
                className="header-btn batch-reject-btn"
                onClick={() => handleBatchAction('reject')}
                disabled={loading}
              >
                <XCircle size={16} />
                <span>{t('toolCards.snapshot.rejectAll')}</span>
              </button>
            </Tooltip>

            <div className="header-divider" />

            <Tooltip content={t('toolCards.snapshot.close')}>
              <button
                ref={closeButtonRef}
                type="button"
                className="header-btn close-btn"
                onClick={onClose}
                aria-label={t('toolCards.snapshot.close')}
              >
                <X size={16} />
              </button>
            </Tooltip>
          </div>
        </div>

        {files.length > 1 && (
          <div
            className="file-navigation"
            aria-label={t('toolCards.snapshot.fileDiff')}
            onKeyDown={handleFileNavigationKeyDown}
          >
            <Tooltip content={t('toolCards.snapshot.prevFile')}>
              <button
                type="button"
                className="nav-btn prev-btn"
                onClick={() => setSelectedFileIndex((previous) => {
                  const current = Math.min(previous, files.length - 1);
                  return current > 0 ? current - 1 : files.length - 1;
                })}
                disabled={loading}
              >
                <ChevronLeft size={16} />
              </button>
            </Tooltip>

            <div className="file-tabs">
              {files.map((file, index) => {
                const name = file.filePath.split(/[/\\]/).pop() || '';
                return (
                  <button
                    key={file.filePath}
                    type="button"
                    className={`file-tab ${index === safeSelectedFileIndex ? 'active' : ''}`}
                    onClick={() => setSelectedFileIndex(index)}
                    title={file.filePath}
                    aria-pressed={index === safeSelectedFileIndex}
                  >
                    <span className="file-name">{name}</span>
                    <span
                      className="file-status"
                      data-status={file.fileStatus}
                      aria-hidden="true"
                    >
                      {file.fileStatus === 'pending' ? '●' : 
                       file.fileStatus === 'accepted' ? '✓' : 
                       file.fileStatus === 'rejected' ? '✗' : '◐'}
                    </span>
                  </button>
                );
              })}
            </div>

            <Tooltip content={t('toolCards.snapshot.nextFile')}>
              <button
                type="button"
                className="nav-btn next-btn"
                onClick={() => setSelectedFileIndex(prev => prev < files.length - 1 ? prev + 1 : 0)}
                disabled={loading}
              >
                <ChevronRight size={16} />
              </button>
            </Tooltip>
          </div>
        )}

        <div className="current-file-header">
          <div className="file-info">
            <div className="file-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
              </svg>
            </div>
            <div className="file-details">
              <div className="file-name">{fileName}</div>
              <div className="file-path-full">{currentFile.filePath}</div>
            </div>
          </div>

          <div className="current-file-actions">
            <Tooltip content={t('toolCards.snapshot.acceptFileTooltip')}>
              <button
                type="button"
                className="file-action-btn accept-btn"
                onClick={() => handleFileAction('accept')}
                disabled={loading}
              >
                <CheckCircle size={16} />
                <span>{t('toolCards.snapshot.acceptFile')}</span>
              </button>
            </Tooltip>
            
            <Tooltip content={t('toolCards.snapshot.rejectFileTooltip')}>
              <button
                type="button"
                className="file-action-btn reject-btn"
                onClick={() => handleFileAction('reject')}
                disabled={loading}
              >
                <XCircle size={16} />
                <span>{t('toolCards.snapshot.rejectFile')}</span>
              </button>
            </Tooltip>
          </div>
        </div>

        {actionError && (
          <div className="snapshot-fullscreen-error" role="alert">
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              aria-label={t('toolCards.snapshot.close')}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="snapshot-fullscreen-content">
          {currentFile && (
            <DiffEditor
              originalContent={currentFile.originalContent}
              modifiedContent={currentFile.modifiedContent}
              filePath={currentFile.filePath}
              readOnly={false}
              renderSideBySide={true}
              showMinimap={false}
            />
          )}
        </div>

        {loading && (
          <div className="fullscreen-loading-overlay">
            <div className="loading-spinner" />
            <span>{t('toolCards.snapshot.processing')}</span>
          </div>
        )}
      </div>
    </div>
  );

  // Render via portal to ensure topmost stacking.
  return createPortal(fullscreenContent, document.body);
};
