import React from 'react';
import { ArrowUp, RotateCcw } from 'lucide-react';

import { IconButton, Tooltip } from '@/component-library';
import { isComposerActionAllowed } from '../utils/composerSubmissionGuard';

export type ComposerActionButtonMode =
  | 'send'
  | 'cancel'
  | 'retry'
  | 'split'
  | 'confirm';

export interface ComposerActionButtonProps {
  available: boolean;
  mode: ComposerActionButtonMode;
  hasDraft: boolean;
  hasQueuedInput: boolean;
  customizationPersistencePending: boolean;
  sendLabel: string;
  retryLabel: string;
  cancelLabel: string;
  onPrimaryAction: () => void;
  onCancel: () => void;
}

export const ComposerActionButton: React.FC<ComposerActionButtonProps> = ({
  available,
  mode,
  hasDraft,
  hasQueuedInput,
  customizationPersistencePending,
  sendLabel,
  retryLabel,
  cancelLabel,
  onPrimaryAction,
  onCancel,
}) => {
  if (!available) {
    return (
      <IconButton
        className="void-chat-input__send-button"
        aria-label={sendLabel}
        disabled
        size="small"
      >
        <ArrowUp size={11} />
      </IconButton>
    );
  }

  if (mode === 'cancel') {
    return (
      <Tooltip content={cancelLabel}>
        <button
          type="button"
          aria-label={cancelLabel}
          className="void-chat-input__send-button void-chat-input__send-button--breathing"
          onClick={onPrimaryAction}
          data-testid="chat-input-cancel-btn"
        >
          <div className="void-chat-input__breathing-circle" />
          {hasQueuedInput && <span className="void-chat-input__queued-badge">1</span>}
        </button>
      </Tooltip>
    );
  }

  if (mode === 'retry') {
    return (
      <IconButton
        className="void-chat-input__send-button void-chat-input__send-button--retry"
        aria-label={retryLabel}
        onClick={onPrimaryAction}
        disabled={!isComposerActionAllowed(
          customizationPersistencePending,
          'retry',
        )}
        tooltip={retryLabel}
        size="small"
      >
        <RotateCcw size={11} />
      </IconButton>
    );
  }

  if (mode === 'split') {
    return (
      <div className="void-chat-input__split-actions">
        <Tooltip content={cancelLabel}>
          <button
            type="button"
            aria-label={cancelLabel}
            className="void-chat-input__send-button void-chat-input__send-button--breathing"
            onClick={onCancel}
            data-testid="chat-input-cancel-btn"
          >
            <div className="void-chat-input__breathing-circle" />
          </button>
        </Tooltip>
        <IconButton
          className="void-chat-input__send-button"
          aria-label={sendLabel}
          onClick={onPrimaryAction}
          disabled={
            !hasDraft
            || !isComposerActionAllowed(
              customizationPersistencePending,
              'split_submit',
            )
          }
          data-testid="chat-input-send-btn"
          tooltip={sendLabel}
          size="small"
        >
          <ArrowUp size={11} />
        </IconButton>
      </div>
    );
  }

  return (
    <IconButton
      className="void-chat-input__send-button"
      aria-label={sendLabel}
      onClick={onPrimaryAction}
      disabled={
        !hasDraft
        || !isComposerActionAllowed(
          customizationPersistencePending,
          'submit',
        )
      }
      data-testid="chat-input-send-btn"
      tooltip={sendLabel}
      size="small"
    >
      <ArrowUp size={11} />
    </IconButton>
  );
};
