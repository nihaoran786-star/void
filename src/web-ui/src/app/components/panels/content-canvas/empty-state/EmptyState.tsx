/**
 * EmptyState component.
 * Empty state display.
 */

import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Tooltip } from '@/component-library';
import { WorkspaceMediaEntry } from '../workspace-media';
import './EmptyState.scss';

export interface EmptyStateProps {
  onClose?: () => void;
  workspacePath?: string;
  onOpenWorkspaceMedia?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onClose, workspacePath, onOpenWorkspaceMedia }) => {
  const { t } = useTranslation('components');

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onClose?.();
  }, [onClose]);

  return (
    <div className="canvas-empty-state">
      {(onClose || onOpenWorkspaceMedia) && (
        <div className="canvas-empty-state__toolbar">
          {onOpenWorkspaceMedia && (
            <WorkspaceMediaEntry workspacePath={workspacePath} onOpen={onOpenWorkspaceMedia} />
          )}
          {onClose && (
            <Tooltip content={t('tabs.close')}>
              <button
                className="canvas-empty-state__close-btn"
                onClick={handleClose}
              >
                <X size={14} />
              </button>
            </Tooltip>
          )}
        </div>
      )}
      <div className="canvas-empty-state__content">
        {/* Message */}
        <div className="canvas-empty-state__message">
          <p>{t('canvas.noContentOpen')}</p>
        </div>
      </div>
    </div>
  );
};

EmptyState.displayName = 'EmptyState';

export default EmptyState;
