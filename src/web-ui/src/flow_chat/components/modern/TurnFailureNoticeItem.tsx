import React, { useId, useMemo, useState } from 'react';
import { AlertTriangle, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { copyTextToClipboard } from '@/shared/utils/textSelection';
import type { DialogTurn } from '../../types/flow-chat';
import './TurnFailureNoticeItem.scss';

interface TurnFailureNoticeItemProps {
  error: string;
  errorDetail: NonNullable<DialogTurn['errorDetail']>;
}

export const TurnFailureNoticeItem: React.FC<TurnFailureNoticeItemProps> = ({
  error,
  errorDetail,
}) => {
  const { t } = useTranslation('flow-chat');
  const titleId = useId();
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const diagnostics = useMemo(
    () => `${error}\n${JSON.stringify(errorDetail, null, 2)}`,
    [error, errorDetail],
  );

  const copyDiagnostics = async () => {
    try {
      const copied = await copyTextToClipboard(diagnostics);
      setCopyStatus(copied ? 'copied' : 'failed');
    } catch {
      setCopyStatus('failed');
    }
  };

  return (
    <section className="turn-failure-notice" role="alert" aria-labelledby={titleId}>
      <div className="turn-failure-notice__summary">
        <AlertTriangle size={16} aria-hidden="true" />
        <div>
          <strong id={titleId}>{t('turnFailureNotice.title')}</strong>
          <p>{error}</p>
        </div>
      </div>
      <details>
        <summary>{t('turnFailureNotice.showDiagnostics')}</summary>
        <pre>{JSON.stringify(errorDetail, null, 2)}</pre>
        <button type="button" onClick={() => void copyDiagnostics()}>
          <Copy size={14} aria-hidden="true" />
          {copyStatus === 'copied'
            ? t('turnFailureNotice.copied')
            : copyStatus === 'failed'
              ? t('turnFailureNotice.copyFailed')
              : t('turnFailureNotice.copyDiagnostics')}
        </button>
      </details>
    </section>
  );
};
