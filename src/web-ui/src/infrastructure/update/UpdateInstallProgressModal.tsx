/**
 * Full-screen style modal showing download progress for in-app updates.
 */

import React, { useMemo } from 'react';
import { Modal, Alert, Button } from '@/component-library';
import { useI18n } from '@/infrastructure/i18n';
import type { UpdateDownloadProgressPayload } from './installUpdateWithProgress';
import { formatUpdateInstallError } from './updateErrorMessage';
import './UpdateInstallProgressModal.scss';

export interface UpdateInstallProgressModalProps {
  isOpen: boolean;
  error: string | null;
  installed?: boolean;
  progress: UpdateDownloadProgressPayload;
  onCloseError?: () => void;
  onCloseInstalled?: () => void;
  onRestart?: () => void;
  overlayClassName?: string;
}

export const UpdateInstallProgressModal: React.FC<UpdateInstallProgressModalProps> = ({
  isOpen,
  error,
  installed,
  progress,
  onCloseError,
  onCloseInstalled,
  onRestart,
  overlayClassName,
}) => {
  const { t } = useI18n('common');
  const { downloaded, total } = progress;
  const pct =
    total != null && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null;

  const errorMessage = useMemo(
    () => (error ? formatUpdateInstallError(error, t) : null),
    [error, t]
  );
  let title = t('update.downloadingTitle');
  if (error) {
    title = t('update.downloadFailedTitle');
  } else if (installed) {
    title = t('update.installedTitle');
  }

  let onClose = () => {};
  if (error) {
    onClose = onCloseError ?? (() => {});
  } else if (installed) {
    onClose = onCloseInstalled ?? (() => {});
  }

  let body: React.ReactNode = null;
  if (errorMessage) {
    body = (
      <Alert
        type="error"
        message={errorMessage}
        showIcon
        className="void-update-progress__alert"
      />
    );
  } else if (installed) {
    body = (
      <>
        <Alert
          type="success"
          message={t('update.installedMessage')}
          showIcon
          className="void-update-progress__alert"
        />
        <div className="void-update-progress__actions">
          <Button variant="secondary" size="medium" onClick={onCloseInstalled}>
            {t('update.restartLater')}
          </Button>
          <Button variant="primary" size="medium" onClick={onRestart}>
            {t('update.restartNow')}
          </Button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <div
          className="void-update-progress__bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct ?? undefined}
          aria-label={t('update.downloadingTitle')}
        >
          <div
            className={
              pct != null
                ? 'void-update-progress__fill'
                : 'void-update-progress__fill void-update-progress__fill--indeterminate'
            }
            style={pct != null ? { width: `${pct}%` } : undefined}
          />
        </div>
        <p className="void-update-progress__hint">
          {pct != null
            ? t('update.progressPercent', { percent: String(pct) })
            : t('update.progressUnknown')}
        </p>
        <p className="void-update-progress__restart">{t('update.restartHint')}</p>
      </>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      showCloseButton={!!error || !!installed}
      size="small"
      overlayClassName={overlayClassName}
    >
      <div className="void-update-progress">
        {body}
      </div>
    </Modal>
  );
};
