/**
 * Workspace label + Git branch (left) and optional usage report control (right).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Check,
  ChevronDown,
  FolderOpen,
  FolderPlus,
  GitBranch,
  ShieldCheck,
  ShieldQuestion,
  Zap,
} from 'lucide-react';
import { Tooltip, IconButton } from '@/component-library';
import { useGitState } from '@/tools/git/hooks/useGitState';
import type { ToolPermissionMode } from '@/infrastructure/config/types';
import './ChatInputWorkspaceStrip.scss';

export type ChatInputPermissionMode = ToolPermissionMode | 'acp';

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
  permissionControl?: {
    mode: ChatInputPermissionMode;
    status?: 'loading' | 'ready' | 'failed';
    saving: boolean;
    onChange?: (mode: ToolPermissionMode) => void;
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
  permissionControl,
  workspacePicker,
}) => {
  const { t } = useTranslation('flow-chat');
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false);
  const workspacePickerRef = useRef<HTMLDivElement>(null);
  const permissionMenuRef = useRef<HTMLDivElement>(null);
  const permissionTriggerRef = useRef<HTMLButtonElement>(null);
  const permissionOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const trimmedPath = repositoryPath.trim();
  const label = workspaceLabel.trim();

  const { currentBranch, isRepository } = useGitState({
    repositoryPath: trimmedPath,
    layers: ['basic'],
    isActive: true,
  });

  const showUsage = usageReport?.visible && !!usageReport.onOpen;
  const showPermission = !!permissionControl;

  useEffect(() => {
    if (!workspacePickerOpen && !permissionMenuOpen) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!workspacePickerRef.current?.contains(event.target as Node)) {
        setWorkspacePickerOpen(false);
      }
      if (!permissionMenuRef.current?.contains(event.target as Node)) {
        setPermissionMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => document.removeEventListener('pointerdown', handleOutsidePointer);
  }, [permissionMenuOpen, workspacePickerOpen]);

  useEffect(() => {
    if (!permissionMenuOpen) return;
    const selectedIndex = ['ask', 'auto', 'full_access'].indexOf(
      permissionControl?.mode ?? 'ask',
    );
    permissionOptionRefs.current[Math.max(0, selectedIndex)]?.focus();
  }, [permissionControl?.mode, permissionMenuOpen]);

  const branchTooltipContent = useMemo(
    () =>
      isRepository && currentBranch?.trim()
        ? currentBranch.trim()
        : t('workspaceStrip.branchTooltipUnavailable'),
    [currentBranch, isRepository, t],
  );

  if (!label && !showUsage && !showPermission) {
    return null;
  }

  const branchLabel =
    isRepository && currentBranch?.trim()
      ? currentBranch.trim()
      : '—';

  const workspaceTooltipContent = trimmedPath || label;

  const split = !!label && (showUsage || showPermission);
  const controlsOnly = !label && (showUsage || showPermission);
  const permissionCopy = permissionControl
    ? {
        ask: {
          label: t('chatInput.permissionMode.ask.label'),
          description: t('chatInput.permissionMode.ask.description'),
        },
        auto: {
          label: t('chatInput.permissionMode.auto.label'),
          description: t('chatInput.permissionMode.auto.description'),
        },
        full_access: {
          label: t('chatInput.permissionMode.fullAccess.label'),
          description: t('chatInput.permissionMode.fullAccess.description'),
        },
        acp: {
          label: t('chatInput.permissionMode.acp.label'),
          description: t('chatInput.permissionMode.acp.description'),
        },
      }
    : null;
  const PermissionIcon = permissionControl?.mode === 'auto'
    ? Zap
    : permissionControl?.mode === 'full_access'
      ? ShieldCheck
      : ShieldQuestion;
  const permissionStatus = permissionControl?.status ?? 'ready';
  const permissionDisabled = permissionControl
    ? permissionControl.saving
      || permissionStatus !== 'ready'
      || permissionControl.mode === 'acp'
    : true;
  const focusPermissionOption = (index: number) => {
    const options = permissionOptionRefs.current.filter(
      (option): option is HTMLButtonElement => option !== null,
    );
    if (options.length === 0) return;
    options[(index + options.length) % options.length]?.focus();
  };
  const handlePermissionMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const options = permissionOptionRefs.current.filter(
      (option): option is HTMLButtonElement => option !== null,
    );
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusPermissionOption(currentIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusPermissionOption(currentIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusPermissionOption(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusPermissionOption(options.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setPermissionMenuOpen(false);
      permissionTriggerRef.current?.focus();
    }
  };

  return (
    <div
      className={[
        'void-chat-input-workspace-strip',
        split && 'void-chat-input-workspace-strip--split',
        controlsOnly && 'void-chat-input-workspace-strip--controls-only',
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

      {showUsage || (permissionControl && permissionCopy) ? (
        <div className="void-chat-input-workspace-strip__controls">
          {permissionControl && permissionCopy ? (
            <div className="void-chat-input-workspace-strip__permission" ref={permissionMenuRef}>
              <Tooltip
                content={permissionStatus === 'failed'
                  ? t('chatInput.permissionMode.loadFailed')
                  : permissionStatus === 'loading'
                    ? t('chatInput.permissionMode.loading')
                    : t('chatInput.permissionMode.current', {
                        mode: permissionCopy[permissionControl.mode].label,
                      })}
              >
                <button
                  ref={permissionTriggerRef}
                  type="button"
                  className={`void-chat-input-workspace-strip__permission-trigger void-chat-input-workspace-strip__permission-trigger--${permissionControl.mode}`}
                  aria-label={t('chatInput.permissionMode.current', {
                    mode: permissionCopy[permissionControl.mode].label,
                  })}
                  aria-haspopup="menu"
                  aria-expanded={permissionMenuOpen}
                  disabled={permissionDisabled}
                  data-permission-mode={permissionControl.mode}
                  data-testid="chat-input-permission-trigger"
                  onClick={() => {
                    if (permissionControl.mode !== 'acp') {
                      setPermissionMenuOpen(open => !open);
                    }
                  }}
                  onKeyDown={event => {
                    if (
                      !permissionDisabled
                      && ['ArrowDown', 'Enter', ' '].includes(event.key)
                    ) {
                      event.preventDefault();
                      setPermissionMenuOpen(true);
                    }
                  }}
                >
                  <PermissionIcon size={12} strokeWidth={1.8} aria-hidden />
                  <span>{permissionCopy[permissionControl.mode].label}</span>
                  <ChevronDown size={10} strokeWidth={1.6} aria-hidden />
                </button>
              </Tooltip>
              {permissionMenuOpen && permissionControl.mode !== 'acp' ? (
                <div
                  className="void-chat-input-workspace-strip__permission-menu"
                  role="menu"
                  aria-label={t('chatInput.permissionMode.menuLabel')}
                  data-testid="chat-input-permission-menu"
                  onKeyDown={handlePermissionMenuKeyDown}
                >
                  {(['ask', 'auto', 'full_access'] as const).map(mode => {
                    const selected = permissionControl.mode === mode;
                    return (
                      <button
                        ref={element => {
                          permissionOptionRefs.current[
                            ['ask', 'auto', 'full_access'].indexOf(mode)
                          ] = element;
                        }}
                        key={mode}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        className="void-chat-input-workspace-strip__permission-option"
                        data-testid={`chat-input-permission-option-${mode}`}
                        onClick={() => {
                          setPermissionMenuOpen(false);
                          permissionTriggerRef.current?.focus();
                          if (!selected) permissionControl.onChange?.(mode);
                        }}
                      >
                        <span>
                          <strong>{permissionCopy[mode].label}</strong>
                          <small>{permissionCopy[mode].description}</small>
                        </span>
                        {selected ? <Check size={12} strokeWidth={2} aria-hidden /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
          {showUsage ? (
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
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

ChatInputWorkspaceStrip.displayName = 'ChatInputWorkspaceStrip';
