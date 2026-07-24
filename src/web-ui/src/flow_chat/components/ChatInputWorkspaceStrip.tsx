/**
 * Workspace label + Git branch (left) and optional usage report control (right).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Check, ChevronDown, FolderOpen, FolderPlus, GitBranch } from 'lucide-react';
import { Tooltip, IconButton } from '@/component-library';
import { useGitState } from '@/tools/git/hooks/useGitState';
import './ChatInputWorkspaceStrip.scss';

export interface ChatInputWorkspaceStripProps {
  /** Repo root for git status; may come from session when global workspace is unset. */
  repositoryPath: string;
  /** Resolved display name (workspace title or folder basename). */
  workspaceLabel: string;
  /** Session usage report (/usage) — icon on the right when visible. */
  usageReport?: {
    visible: boolean;
    onOpen: () => void;
  };
  workspacePicker?: {
    ariaLabel: string;
    options: Array<{
      id: string;
      label: string;
    }>;
    selectedId?: string;
    onSelect: (workspaceId: string) => void;
    createLabel?: string;
    onCreate?: () => void;
  };
}

export const ChatInputWorkspaceStrip: React.FC<ChatInputWorkspaceStripProps> = ({
  repositoryPath,
  workspaceLabel,
  usageReport,
  workspacePicker,
}) => {
  const { t } = useTranslation('flow-chat');
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
  const workspacePickerRef = useRef<HTMLDivElement>(null);
  const trimmedPath = repositoryPath.trim();
  const label = workspaceLabel.trim();

  const { currentBranch, isRepository } = useGitState({
    repositoryPath: trimmedPath,
    layers: ['basic'],
    isActive: true,
  });

  const showUsage = usageReport?.visible && !!usageReport.onOpen;

  useEffect(() => {
    if (!workspacePickerOpen) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!workspacePickerRef.current?.contains(event.target as Node)) {
        setWorkspacePickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => document.removeEventListener('pointerdown', handleOutsidePointer);
  }, [workspacePickerOpen]);

  const branchTooltipContent = useMemo(
    () =>
      isRepository && currentBranch?.trim()
        ? currentBranch.trim()
        : t('workspaceStrip.branchTooltipUnavailable'),
    [currentBranch, isRepository, t],
  );

  if (!label && !showUsage) {
    return null;
  }

  const branchLabel =
    isRepository && currentBranch?.trim()
      ? currentBranch.trim()
      : '—';

  const workspaceTooltipContent = trimmedPath || label;

  const split = !!label && showUsage;
  const usageOnly = !label && showUsage;

  return (
    <div
      className={[
        'void-chat-input-workspace-strip',
        split && 'void-chat-input-workspace-strip--split',
        usageOnly && 'void-chat-input-workspace-strip--usage-only',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="chat-input-workspace-strip"
    >
      {label ? (
        <div className="void-chat-input-workspace-strip__main">
          {workspacePicker ? (
            <div
              className="void-chat-input-workspace-strip__picker"
              ref={workspacePickerRef}
            >
              <button
                type="button"
                className="void-chat-input-workspace-strip__chip void-chat-input-workspace-strip__chip--workspace void-chat-input-workspace-strip__picker-trigger"
                aria-label={workspacePicker.ariaLabel}
                aria-haspopup="dialog"
                aria-expanded={workspacePickerOpen}
                onClick={() => setWorkspacePickerOpen(open => !open)}
              >
                <FolderOpen size={12} strokeWidth={1.5} aria-hidden />
                <span className="void-chat-input-workspace-strip__workspace">{label}</span>
                <ChevronDown size={11} strokeWidth={1.5} aria-hidden />
              </button>
              {workspacePickerOpen ? (
                <div
                  className="void-chat-input-workspace-strip__picker-menu"
                  role="dialog"
                  aria-label={workspacePicker.ariaLabel}
                >
                  {workspacePicker.onCreate && workspacePicker.createLabel ? (
                    <>
                      <button
                        type="button"
                        className="void-chat-input-workspace-strip__picker-option void-chat-input-workspace-strip__picker-create"
                        onClick={() => {
                          workspacePicker.onCreate?.();
                          setWorkspacePickerOpen(false);
                        }}
                      >
                        <FolderPlus size={12} strokeWidth={1.5} aria-hidden />
                        <span>{workspacePicker.createLabel}</span>
                      </button>
                      {workspacePicker.options.length > 0 ? (
                        <span
                          className="void-chat-input-workspace-strip__picker-divider"
                          aria-hidden
                        />
                      ) : null}
                    </>
                  ) : null}
                  <div
                    className="void-chat-input-workspace-strip__picker-options"
                    role="listbox"
                    aria-label={workspacePicker.ariaLabel}
                  >
                    {workspacePicker.options.map(option => (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={option.id === workspacePicker.selectedId}
                        className="void-chat-input-workspace-strip__picker-option"
                        onClick={() => {
                          workspacePicker.onSelect(option.id);
                          setWorkspacePickerOpen(false);
                        }}
                      >
                        <FolderOpen size={12} strokeWidth={1.5} aria-hidden />
                        <span>{option.label}</span>
                        {option.id === workspacePicker.selectedId ? (
                          <Check size={12} strokeWidth={1.5} aria-hidden />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <Tooltip content={workspaceTooltipContent} placement="top">
                <span className="void-chat-input-workspace-strip__chip void-chat-input-workspace-strip__chip--workspace">
                  <span className="void-chat-input-workspace-strip__workspace">{label}</span>
                </span>
              </Tooltip>
              <span className="void-chat-input-workspace-strip__sep" aria-hidden>
                {' / '}
              </span>
              <Tooltip content={branchTooltipContent} placement="top">
                <span className="void-chat-input-workspace-strip__chip void-chat-input-workspace-strip__chip--branch">
                  <GitBranch
                    className="void-chat-input-workspace-strip__branch-icon"
                    size={11}
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span className="void-chat-input-workspace-strip__branch">{branchLabel}</span>
                </span>
              </Tooltip>
            </>
          )}
        </div>
      ) : null}

      {showUsage ? (
        <div className="void-chat-input-workspace-strip__usage">
          <Tooltip content={t('usage.runtime.tooltip')}>
            <IconButton
              className="void-chat-input-workspace-strip__usage-btn"
              variant="ghost"
              size="xs"
              type="button"
              aria-label={t('usage.runtime.open')}
              onClick={e => {
                e.stopPropagation();
                usageReport.onOpen();
              }}
            >
              <Activity size={14} strokeWidth={2} aria-hidden />
            </IconButton>
          </Tooltip>
        </div>
      ) : null}
    </div>
  );
};

ChatInputWorkspaceStrip.displayName = 'ChatInputWorkspaceStrip';
