/**
 * Welcome panel shown in the empty chat state.
 * Layout mirrors WelcomeScene: centered container, left-aligned content.
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipboardList,
  Code2,
  FolderOpen,
  FolderPlus,
  ChevronDown,
  Check,
  GitBranch,
  Images,
} from 'lucide-react';
import { gitAPI } from '../../infrastructure/api';
import type { GitWorkState } from '../../infrastructure/api/service-api/StartchatAgentAPI';
import { useApp } from '../../app/hooks/useApp';
import { createLogger } from '@/shared/utils/logger';
import { useWorkspaceContext } from '@/infrastructure/contexts/WorkspaceContext';
import type { WorkspaceInfo } from '@/shared/types';
import SessionModeExampleCards from './SessionModeExampleCards';
import { useAgentIdentityDocument } from '@/app/scenes/my-agent/useAgentIdentityDocument';
import { useSessionModeStore } from '@/app/stores/sessionModeStore';
import type { SessionMode } from '@/app/stores/sessionModeStore';
import { useNotification } from '@/shared/notification-system';
import './WelcomePanel.css';

const log = createLogger('WelcomePanel');
const CREATION_MODES: SessionMode[] = ['code', 'cowork', 'media'];

interface WelcomePanelProps {
  onQuickAction?: (command: string) => void;
  className?: string;
  sessionMode?: string;
  workspacePath?: string;
}

export const WelcomePanel: React.FC<WelcomePanelProps> = ({
  onQuickAction,
  className = '',
  sessionMode,
  workspacePath = '',
}) => {
  const { t } = useTranslation('flow-chat');
  const { t: tCommon } = useTranslation('common');
  const [gitState, setGitState] = useState<GitWorkState | null>(null);
  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);
  const [isSelectingWorkspace, setIsSelectingWorkspace] = useState(false);
  const workspaceDropdownRef = useRef<HTMLDivElement>(null);
  const workspaceTriggerRef = useRef<HTMLButtonElement>(null);
  const creationModeRefs = useRef<Record<SessionMode, HTMLButtonElement | null>>({
    code: null,
    cowork: null,
    media: null,
  });
  const workspaceMenuId = React.useId();
  const notification = useNotification();

  const { switchLeftPanelTab } = useApp();
  const {
    hasWorkspace,
    currentWorkspace,
    openedWorkspacesList,
    openWorkspace,
    switchWorkspace,
  } = useWorkspaceContext();
  const sessionModeLower = (sessionMode || '').toLowerCase();
  const draftMode = useSessionModeStore(state => state.mode);
  const draftStatus = useSessionModeStore(state => state.draftStatus);
  const setDraftMode = useSessionModeStore(state => state.setMode);
  const isDraft = !sessionMode && draftStatus !== 'idle';
  const effectiveMode = isDraft ? draftMode : sessionModeLower;
  const isCoworkSession = effectiveMode === 'cowork';
  const isClawSession = sessionModeLower === 'claw';
  const isMediaSession = effectiveMode === 'media';
  const needsWorkspace = !isDraft && !isClawSession && !hasWorkspace;
  const showCreationModes = isDraft;

  const { document: identityDoc } = useAgentIdentityDocument(isClawSession ? workspacePath : '');
  const assistantName = isClawSession ? (identityDoc.name || '') : '';

  const promptSubtitleKey = isCoworkSession
    ? 'welcome.promptSubtitleCowork'
    : isMediaSession
      ? 'welcome.promptSubtitleMedia'
      : isClawSession
        ? 'welcome.promptSubtitleClaw'
        : 'welcome.promptSubtitle';

  const otherWorkspaces = useMemo(
    () => openedWorkspacesList.filter(ws => ws.id !== currentWorkspace?.id),
    [openedWorkspacesList, currentWorkspace?.id],
  );

  const handleGitClick = useCallback(() => {
    switchLeftPanelTab('git');
  }, [switchLeftPanelTab]);

  const isGitClean = useMemo(
    () => !!gitState && gitState.unstagedFiles === 0 && gitState.stagedFiles === 0 && gitState.unpushedCommits === 0,
    [gitState],
  );

  const buildGitNarrative = useCallback((): React.ReactNode => {
    if (!gitState) return null;
    const parts: { key: string; label: string; suffix: string }[] = [];
    if (gitState.unstagedFiles > 0)
      parts.push({ key: 'unstaged', label: t('welcome.gitUnstaged', { count: gitState.unstagedFiles }), suffix: t('welcome.waitingToStage') });
    if (gitState.stagedFiles > 0)
      parts.push({ key: 'staged', label: t('welcome.gitStaged', { count: gitState.stagedFiles }), suffix: t('welcome.stagedReady') });
    if (gitState.unpushedCommits > 0)
      parts.push({ key: 'unpushed', label: t('welcome.gitUnpushed', { count: gitState.unpushedCommits }), suffix: t('welcome.toPush') });
    if (parts.length === 0) return null;
    return (
      <>
        {t('welcome.currentlyHas')}
        {parts.map(({ key, label, suffix }, i) => (
          <React.Fragment key={key}>
            {i > 0 && t('welcome.commaSeparator')}
            <button type="button" className="welcome-panel__inline-btn" onClick={handleGitClick}>
              {label}
            </button>
            {' '}{suffix}
          </React.Fragment>
        ))}
        {t('welcome.period')}
      </>
    );
  }, [gitState, handleGitClick, t]);

  const loadGitState = useCallback(async (workspacePath: string) => {
    try {
      const isGitRepo = await gitAPI.isGitRepository(workspacePath);
      if (!isGitRepo) { setGitState(null); return; }
      const s = await gitAPI.getStatus(workspacePath);
      setGitState({
        currentBranch: s.current_branch,
        unstagedFiles: s.unstaged.length + s.untracked.length,
        stagedFiles: s.staged.length,
        unpushedCommits: s.ahead,
        aheadBehind: { ahead: s.ahead, behind: s.behind },
        modifiedFiles: [],
      });
    } catch (err) {
      log.warn('Failed to load git state', err);
      setGitState(null);
    }
  }, []);

  useEffect(() => {
    if (isCoworkSession || isClawSession || isMediaSession || !currentWorkspace?.rootPath) { setGitState(null); return; }
    void loadGitState(currentWorkspace.rootPath);
  }, [currentWorkspace?.rootPath, isCoworkSession, isClawSession, isMediaSession, loadGitState]);

  const closeWorkspaceDropdown = useCallback((restoreFocus = true) => {
    setWorkspaceDropdownOpen(false);
    if (restoreFocus) {
      queueMicrotask(() => workspaceTriggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!workspaceDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (workspaceDropdownRef.current && !workspaceDropdownRef.current.contains(e.target as Node)) {
        closeWorkspaceDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [closeWorkspaceDropdown, workspaceDropdownOpen]);

  useEffect(() => {
    if (!workspaceDropdownOpen) return;
    workspaceDropdownRef.current
      ?.querySelector<HTMLButtonElement>(
        '[role="menuitem"]:not([aria-disabled="true"]):not(:disabled)',
      )
      ?.focus();
  }, [workspaceDropdownOpen]);

  const handleSwitchWorkspace = useCallback(async (ws: WorkspaceInfo) => {
    try {
      closeWorkspaceDropdown();
      await switchWorkspace(ws);
    } catch (err) {
      log.warn('Failed to switch workspace', err);
      notification.error(t('welcome.workspaceSwitchFailed'));
    }
  }, [closeWorkspaceDropdown, notification, switchWorkspace, t]);

  const handleOpenOtherFolder = useCallback(async () => {
    try {
      closeWorkspaceDropdown();
      setIsSelectingWorkspace(true);
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') await openWorkspace(selected);
    } catch (err) {
      log.warn('Failed to open workspace folder', err);
      notification.error(t('welcome.workspaceOpenFailed'));
    } finally {
      setIsSelectingWorkspace(false);
    }
  }, [closeWorkspaceDropdown, notification, openWorkspace, t]);

  const handleCreateWorkspace = useCallback(() => {
    closeWorkspaceDropdown();
    window.dispatchEvent(new Event('nav:new-project'));
  }, [closeWorkspaceDropdown]);

  const handleCreationModeKeyDown = useCallback((
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentMode: SessionMode,
  ) => {
    const currentIndex = CREATION_MODES.indexOf(currentMode);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % CREATION_MODES.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + CREATION_MODES.length) % CREATION_MODES.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = CREATION_MODES.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextMode = CREATION_MODES[nextIndex];
    setDraftMode(nextMode);
    creationModeRefs.current[nextMode]?.focus();
  }, [setDraftMode]);

  const handleWorkspaceMenuKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeWorkspaceDropdown();
      return;
    }

    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not([aria-disabled="true"]):not(:disabled)',
      ),
    );
    if (items.length === 0) return;
    const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown') nextIndex = (activeIndex + 1) % items.length;
    if (event.key === 'ArrowUp') nextIndex = (activeIndex - 1 + items.length) % items.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    items[nextIndex]?.focus();
  }, [closeWorkspaceDropdown]);

  const handleQuickActionClick = useCallback((cmd: string) => {
    onQuickAction?.(cmd);
  }, [onQuickAction]);

  return (
    <div className={`welcome-panel${needsWorkspace ? ' welcome-panel--needs-workspace' : ''}${className ? ` ${className}` : ''}`}>
      <div className="welcome-panel__content">
        <div className="welcome-panel__greeting">
          <div className="welcome-panel__greeting-inner">
            <div className="welcome-panel__greeting-text">
              <h1 className="welcome-panel__heading">{t('welcome.promptTitle')}</h1>
              {showCreationModes ? (
                <div
                  className="welcome-panel__creation-modes"
                  role="radiogroup"
                  aria-label={t('welcome.creationModesLabel')}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={draftMode === 'code'}
                    tabIndex={draftMode === 'code' ? 0 : -1}
                    ref={element => { creationModeRefs.current.code = element; }}
                    className={`welcome-panel__creation-mode${draftMode === 'code' ? ' is-active' : ''}`}
                    onClick={() => setDraftMode('code')}
                    onKeyDown={event => handleCreationModeKeyDown(event, 'code')}
                  >
                    <Code2 size={13} strokeWidth={1.5} aria-hidden />
                    <span>{t('welcome.creationModeCode')}</span>
                  </button>
                  <span className="welcome-panel__creation-mode-divider" aria-hidden />
                  <button
                    type="button"
                    role="radio"
                    aria-checked={draftMode === 'cowork'}
                    tabIndex={draftMode === 'cowork' ? 0 : -1}
                    ref={element => { creationModeRefs.current.cowork = element; }}
                    className={`welcome-panel__creation-mode${draftMode === 'cowork' ? ' is-active' : ''}`}
                    onClick={() => setDraftMode('cowork')}
                    onKeyDown={event => handleCreationModeKeyDown(event, 'cowork')}
                  >
                    <ClipboardList size={13} strokeWidth={1.5} aria-hidden />
                    <span>{t('welcome.creationModeCowork')}</span>
                  </button>
                  <span className="welcome-panel__creation-mode-divider" aria-hidden />
                  <button
                    type="button"
                    role="radio"
                    aria-checked={draftMode === 'media'}
                    tabIndex={draftMode === 'media' ? 0 : -1}
                    ref={element => { creationModeRefs.current.media = element; }}
                    className={`welcome-panel__creation-mode${draftMode === 'media' ? ' is-active' : ''}`}
                    onClick={() => setDraftMode('media')}
                    onKeyDown={event => handleCreationModeKeyDown(event, 'media')}
                  >
                    <Images size={13} strokeWidth={1.5} aria-hidden />
                    <span>{t('welcome.creationModeMedia')}</span>
                  </button>
                </div>
              ) : (
                <p className="welcome-panel__tagline">
                  {isClawSession && assistantName
                    ? t('welcome.promptSubtitleNamedClaw', { name: assistantName })
                    : t(promptSubtitleKey)}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="welcome-panel__divider" />

        {/* Narrative: workspace + git in natural language */}
        <div className="welcome-panel__narrative">
          <p className="welcome-panel__narrative-text">
            {isClawSession ? (
              t('welcome.narrativeClaw')
            ) : !hasWorkspace ? (
              <>
                {t('welcome.noWorkspaceHint')}
                <button
                  type="button"
                  className="welcome-panel__inline-btn welcome-panel__inline-btn--interactive"
                  onClick={() => { void handleOpenOtherFolder(); }}
                  disabled={isSelectingWorkspace}
                >
                  {t('welcome.openOne')}
                </button>
                {' '}{t('welcome.toStart')}
              </>
            ) : (
              <>
                <span className="welcome-panel__narrative-sentence">
                  <span className="welcome-panel__narrative-sentence__text">
                    {isCoworkSession ? t('welcome.workingInCowork') : t('welcome.workingIn')}
                  </span>
                  <span className="welcome-panel__context-row">
                    <span className="welcome-panel__workspace-anchor" ref={workspaceDropdownRef}>
                      <button
                        ref={workspaceTriggerRef}
                        type="button"
                        className={`welcome-panel__inline-btn welcome-panel__inline-btn--interactive${workspaceDropdownOpen ? ' welcome-panel__inline-btn--active' : ''}`}
                        aria-expanded={workspaceDropdownOpen}
                        aria-haspopup="menu"
                        aria-controls={workspaceMenuId}
                        onClick={() => {
                          if (workspaceDropdownOpen) closeWorkspaceDropdown();
                          else setWorkspaceDropdownOpen(true);
                        }}
                        disabled={isSelectingWorkspace}
                        title={currentWorkspace?.rootPath}
                      >
                        <FolderOpen size={13} className="welcome-panel__inline-icon" />
                        {currentWorkspace?.name || t('welcome.workspace')}
                        <ChevronDown
                          size={11}
                          className={`welcome-panel__inline-chevron${workspaceDropdownOpen ? ' welcome-panel__inline-chevron--open' : ''}`}
                        />
                      </button>
                      {workspaceDropdownOpen && (
                        <div
                          id={workspaceMenuId}
                          className="welcome-panel__dropdown"
                          role="menu"
                          aria-label={t('welcome.workspaceMenuLabel')}
                          onKeyDown={handleWorkspaceMenuKeyDown}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="welcome-panel__dropdown-item welcome-panel__dropdown-item--accent"
                            onClick={() => { void handleCreateWorkspace(); }}
                          >
                            <FolderPlus size={12} />
                            <span className="welcome-panel__dropdown-name">{tCommon('header.newProject')}</span>
                          </button>
                          {(hasWorkspace || otherWorkspaces.length > 0) && (
                            <div className="welcome-panel__dropdown-sep" role="separator" />
                          )}
                          {hasWorkspace && currentWorkspace && (
                            <div
                              className="welcome-panel__dropdown-current"
                              role="menuitem"
                              aria-disabled="true"
                              tabIndex={-1}
                            >
                              <Check size={11} />
                              <FolderOpen size={12} />
                              <span className="welcome-panel__dropdown-name">{currentWorkspace.name}</span>
                            </div>
                          )}
                          {otherWorkspaces.length > 0 && (
                            <>
                              {hasWorkspace && currentWorkspace && (
                                <div className="welcome-panel__dropdown-sep" role="separator" />
                              )}
                              {otherWorkspaces.map(ws => (
                                <button
                                  key={ws.id}
                                  type="button"
                                  role="menuitem"
                                  className="welcome-panel__dropdown-item"
                                  onClick={() => { void handleSwitchWorkspace(ws); }}
                                  title={ws.rootPath}
                                >
                                  <FolderOpen size={12} />
                                  <span className="welcome-panel__dropdown-name">{ws.name}</span>
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                    </span>
                    {!isCoworkSession && gitState && (
                      <>
                        <span className="welcome-panel__context-sep">/</span>
                        <button type="button" className="welcome-panel__inline-btn" onClick={handleGitClick}>
                          <GitBranch size={13} className="welcome-panel__inline-icon" />
                          {gitState.currentBranch}
                        </button>
                      </>
                    )}
                  </span>
                  <span className="welcome-panel__narrative-sentence__text">
                    {!isCoworkSession && gitState ? t('welcome.project') : t('welcome.projectCowork')}
                  </span>
                </span>
                {!isCoworkSession && gitState ? (
                  <span className="welcome-panel__narrative-git">
                    {isGitClean
                      ? <span className="welcome-panel__narrative-clean">{t('welcome.gitClean')}</span>
                      : buildGitNarrative()}
                  </span>
                ) : null}
              </>
            )}
          </p>
        </div>

        {showCreationModes && (
          <div className="welcome-panel__examples">
            <SessionModeExampleCards
              mode={draftMode}
              onSelectPrompt={handleQuickActionClick}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default WelcomePanel;
