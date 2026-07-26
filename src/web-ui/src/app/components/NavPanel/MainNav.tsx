/**
 * MainNav — default workspace navigation sidebar.
 *
 * Layout (top to bottom):
 *   1. Classic: workspace search header
 *   2. Top: New sessions (Minimal search slot) | Assistant | Extensions
 *   3. Assistant sessions, Workspace
 *   4. Bottom: MiniApp
 *
 * When a scene-nav transition is active (`isDeparting=true`), items receive
 * positional CSS classes for the split-open animation effect.
 */

import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, FolderOpen, FolderPlus, History, Check, User, Users, Puzzle, Cable, Blocks, ChevronDown, Search, CalendarClock } from 'lucide-react';
import { Tooltip } from '@/component-library';
import { useApp } from '../../hooks/useApp';
import { useSceneManager } from '../../hooks/useSceneManager';
import { useI18n } from '@/infrastructure/i18n/hooks/useI18n';
import type { SceneTabId } from '../SceneBar/types';
import SectionHeader from './components/SectionHeader';
import MiniAppEntry from './components/MiniAppEntry';
import { SessionCreateLauncher } from './components/SessionCreateLauncher';
import WorkspaceListSection from './sections/workspaces/WorkspaceListSection';
import SessionsSection from './sections/sessions/DeferredSessionsSection';
import { useSceneStore } from '../../stores/sceneStore';
import { useMyAgentStore } from '../../scenes/my-agent/myAgentStore';
import { useMiniAppCatalogSync } from '../../scenes/miniapps/hooks/useMiniAppCatalogSync';
import {
  beginNewSessionDraft,
  selectNewSessionDraftWorkspace,
} from '@/flow_chat/services/NewSessionDraftService';
import { workspaceManager } from '@/infrastructure/services/business/workspaceManager';
import { useWorkspaceContext } from '@/infrastructure/contexts/WorkspaceContext';
import { createLogger } from '@/shared/utils/logger';
import { WorkspaceKind, isRemoteWorkspace } from '@/shared/types';
import { getRecentWorkspaceLineParts } from '@/shared/utils/recentWorkspaceDisplay';
import { computeFixedPopoverPosition } from '@/shared/utils/fixedPopoverViewport';
import { useSSHRemoteContext, SSHConnectionDialog, RemoteFileBrowser } from '@/features/ssh-remote';
import { useSessionModeStore } from '../../stores/sessionModeStore';
import { useSettingsStore } from '../../scenes/settings/settingsStore';
import { useShortcut } from '@/infrastructure/hooks/useShortcut';
import { ALL_SHORTCUTS } from '@/shared/constants/shortcuts';
import {
  readWorkspacePresentation,
} from '@/app/presentation/workspacePresentation';

import './NavPanel.scss';

const NavSearchDialog = React.lazy(() => import('./NavSearchDialog'));

const NAV_TOGGLE_SEARCH_DEF = ALL_SHORTCUTS.find((d) => d.id === 'nav.toggleSearch')!;

const log = createLogger('MainNav');

interface MainNavProps {
  isDeparting?: boolean;
  anchorNavSceneId?: SceneTabId | null;
}

const MainNav: React.FC<MainNavProps> = ({
  isDeparting: _isDeparting = false,
  anchorNavSceneId: _anchorNavSceneId = null,
}) => {
  const sshRemote = useSSHRemoteContext();
  const [isSSHConnectionDialogOpen, setIsSSHConnectionDialogOpen] = useState(false);

  useEffect(() => {
    if (sshRemote.showFileBrowser) {
      setIsSSHConnectionDialogOpen(false);
    }
  }, [sshRemote.showFileBrowser]);

  const { switchLeftPanelTab } = useApp();
  const { openScene } = useSceneManager();
  const activeTabId = useSceneStore(s => s.activeTabId);
  const settingsActiveTab = useSettingsStore(s => s.activeTab);
  const setSettingsActiveTab = useSettingsStore(s => s.setActiveTab);
  const setSelectedAssistantWorkspaceId = useMyAgentStore((s) => s.setSelectedAssistantWorkspaceId);
  const { t } = useI18n('common');
  const {
    currentWorkspace,
    loading: workspaceLoading,
    recentWorkspaces,
    openedWorkspacesList,
    assistantWorkspacesList,
    switchWorkspace,
    setActiveWorkspace,
  } = useWorkspaceContext();

  useMiniAppCatalogSync({
    enabled: !workspaceLoading,
    initialLoad: 'idle',
  });

  const activeMiniAppId = useMemo(
    () => (typeof activeTabId === 'string' && activeTabId.startsWith('miniapp:') ? activeTabId.slice('miniapp:'.length) : null),
    [activeTabId]
  );

  // Section expand state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(['assistant-sessions', 'workspace'])
  );

  const workspaceMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);
  const workspaceMenuCloseTimerRef = useRef<number | undefined>(undefined);
  const workspaceMenuInitialFocusRef = useRef<'first' | 'last'>('first');
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [workspaceMenuClosing, setWorkspaceMenuClosing] = useState(false);
  const [workspaceMenuPos, setWorkspaceMenuPos] = useState({ top: 0, left: 0 });
  const [isExtensionsOpen, setIsExtensionsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const workspacePresentation = useMemo(readWorkspacePresentation, []);

  const toggleSection = useCallback((id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const closeWorkspaceMenu = useCallback((restoreFocus = false) => {
    if (workspaceMenuCloseTimerRef.current !== undefined) {
      window.clearTimeout(workspaceMenuCloseTimerRef.current);
    }
    setWorkspaceMenuClosing(true);
    workspaceMenuCloseTimerRef.current = window.setTimeout(() => {
      setWorkspaceMenuOpen(false);
      setWorkspaceMenuClosing(false);
      workspaceMenuCloseTimerRef.current = undefined;
      if (restoreFocus) {
        window.requestAnimationFrame(() => workspaceMenuButtonRef.current?.focus());
      }
    }, 150);
  }, []);

  useEffect(() => () => {
    if (workspaceMenuCloseTimerRef.current !== undefined) {
      window.clearTimeout(workspaceMenuCloseTimerRef.current);
    }
  }, []);

  const updateWorkspaceMenuPos = useCallback(() => {
    const btn = workspaceMenuButtonRef.current;
    if (!btn || !workspaceMenuOpen) return;
    const rect = btn.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 6;
    const fallbackWidth = 300;
    const fallbackHeight = 420;

    const apply = () => {
      const menuEl = workspaceMenuRef.current;
      const w = menuEl?.offsetWidth ?? fallbackWidth;
      const h = menuEl?.offsetHeight ?? fallbackHeight;
      setWorkspaceMenuPos(computeFixedPopoverPosition(rect, w, h, gap, viewportPadding));
    };

    apply();
    requestAnimationFrame(apply);
  }, [workspaceMenuOpen]);

  const openWorkspaceMenu = useCallback(async (initialFocus: 'first' | 'last' = 'first') => {
    try {
      await workspaceManager.cleanupInvalidWorkspaces();
    } catch (error) {
      log.warn('Failed to cleanup invalid workspaces before opening workspace menu', { error });
    }
    const rect = workspaceMenuButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (workspaceMenuCloseTimerRef.current !== undefined) {
      window.clearTimeout(workspaceMenuCloseTimerRef.current);
      workspaceMenuCloseTimerRef.current = undefined;
    }
    workspaceMenuInitialFocusRef.current = initialFocus;
    setWorkspaceMenuPos(computeFixedPopoverPosition(rect, 300, 420, 6, 8));
    setWorkspaceMenuOpen(true);
    setWorkspaceMenuClosing(false);
  }, []);

  const toggleWorkspaceMenu = useCallback(() => {
    if (workspaceMenuOpen) { closeWorkspaceMenu(true); return; }
    void openWorkspaceMenu();
  }, [closeWorkspaceMenu, openWorkspaceMenu, workspaceMenuOpen]);

  const handleWorkspaceMenuTriggerKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    event.preventDefault();
    void openWorkspaceMenu(event.key === 'ArrowUp' ? 'last' : 'first');
  }, [openWorkspaceMenu]);

  const markWorkspaceMenuItem = useCallback((target: HTMLButtonElement | null) => {
    const items = workspaceMenuRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]',
    ) ?? [];
    items.forEach(item => item.removeAttribute('data-keyboard-focus'));
    target?.setAttribute('data-keyboard-focus', 'true');
  }, []);

  const focusWorkspaceMenuItem = useCallback((target: HTMLButtonElement | null) => {
    markWorkspaceMenuItem(target);
    target?.focus();
  }, [markWorkspaceMenuItem]);

  const handleWorkspaceMenuFocusCapture = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const target = event.target;
    if (
      target instanceof HTMLButtonElement
      && target.getAttribute('role') === 'menuitem'
    ) {
      markWorkspaceMenuItem(target);
    }
  }, [markWorkspaceMenuItem]);

  const handleWorkspaceMenuKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
    );
    if (items.length === 0) {
      return;
    }

    if (event.key === 'Tab') {
      closeWorkspaceMenu();
      return;
    }

    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | undefined;
    if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = items.length - 1;
    } else if (event.key === 'ArrowDown') {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    } else if (event.key === 'ArrowUp') {
      nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
    }

    if (nextIndex !== undefined) {
      event.preventDefault();
      focusWorkspaceMenuItem(items[nextIndex] ?? null);
    }
  }, [closeWorkspaceMenu, focusWorkspaceMenuItem]);

  const selectedSessionMode = useSessionModeStore(s => s.mode);
  const isNewSessionDraft = useSessionModeStore(s => s.draftStatus !== 'idle');
  const setSessionMode = useSessionModeStore(s => s.setMode);
  const isAssistantWorkspaceActive = currentWorkspace?.workspaceKind === WorkspaceKind.Assistant;

  const defaultAssistantWorkspace = useMemo(
    () => assistantWorkspacesList.find(w => !w.assistantId) ?? assistantWorkspacesList[0] ?? null,
    [assistantWorkspacesList]
  );

  const toggleNavSearch = useCallback(() => {
    setSearchOpen((v) => !v);
  }, []);

  useShortcut(
    NAV_TOGGLE_SEARCH_DEF.id,
    NAV_TOGGLE_SEARCH_DEF.config,
    toggleNavSearch,
    { priority: 5, description: NAV_TOGGLE_SEARCH_DEF.descriptionKey }
  );

  // Secondary binding (not listed separately in keyboard settings — same action as Mod+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        !e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.key.toLowerCase() !== 'f'
      ) {
        return;
      }
      e.preventDefault();
      toggleNavSearch();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleNavSearch]);

  const handleCreateTask = useCallback(() => {
    setSessionMode('code');
    beginNewSessionDraft('code', null);
    openScene('session');
    switchLeftPanelTab('sessions');
  }, [
    openScene,
    setSessionMode,
    switchLeftPanelTab,
  ]);

  const handleOpenProject = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, title: t('header.selectProjectDirectory') });
      if (selected && typeof selected === 'string') {
        await workspaceManager.openWorkspace(selected);
      }
    } catch (err) {
      log.error('Failed to open project', err);
    }
  }, [t]);

  const handleNewProject = useCallback(() => {
    window.dispatchEvent(new Event('nav:new-project'));
  }, []);

  const handleSwitchWorkspace = useCallback(async (workspaceId: string) => {
    const targetWorkspace = recentWorkspaces.find(item => item.id === workspaceId);
    if (!targetWorkspace) return;
    closeWorkspaceMenu();
    await switchWorkspace(targetWorkspace);
  }, [closeWorkspaceMenu, recentWorkspaces, switchWorkspace]);

  const handleOpenRemoteSSH = useCallback(() => {
    closeWorkspaceMenu();
    setIsSSHConnectionDialogOpen(true);
  }, [closeWorkspaceMenu]);

  const handleSelectRemoteWorkspace = useCallback(async (path: string) => {
    try {
      await sshRemote.openWorkspace(path);
      sshRemote.setShowFileBrowser(false);
      setIsSSHConnectionDialogOpen(false);
    } catch (err) {
      log.error('Failed to open remote workspace', err);
    }
  }, [sshRemote]);

  useEffect(() => {
    if (!workspaceMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (workspaceMenuButtonRef.current?.contains(target)) return;
      if (workspaceMenuRef.current?.contains(target)) return;
      closeWorkspaceMenu();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeWorkspaceMenu(true);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closeWorkspaceMenu, workspaceMenuOpen]);

  useEffect(() => {
    if (!workspaceMenuOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const items = Array.from(
        workspaceMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
      );
      const target = workspaceMenuInitialFocusRef.current === 'last'
        ? items[items.length - 1]
        : items[0];
      focusWorkspaceMenuItem(target ?? null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusWorkspaceMenuItem, workspaceMenuOpen]);

  useEffect(() => {
    if (!workspaceMenuOpen) return;

    updateWorkspaceMenuPos();

    const handleViewportChange = () => updateWorkspaceMenuPos();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [workspaceMenuOpen, updateWorkspaceMenuPos]);

  const handleOpenAssistant = useCallback(() => {
    const targetAssistantWorkspace =
      isAssistantWorkspaceActive && currentWorkspace?.workspaceKind === WorkspaceKind.Assistant
        ? currentWorkspace
        : defaultAssistantWorkspace;

    if (targetAssistantWorkspace?.id) {
      setSelectedAssistantWorkspaceId(targetAssistantWorkspace.id);
    }
    if (!isAssistantWorkspaceActive && targetAssistantWorkspace) {
      void setActiveWorkspace(targetAssistantWorkspace.id).catch(error => {
        log.warn('Failed to activate default assistant workspace', { error });
      });
    }
    switchLeftPanelTab('profile');
    openScene('assistant');
  }, [
    currentWorkspace,
    defaultAssistantWorkspace,
    isAssistantWorkspaceActive,
    openScene,
    setActiveWorkspace,
    setSelectedAssistantWorkspaceId,
    switchLeftPanelTab,
  ]);

  const handleOpenAgents = useCallback(() => {
    openScene('agents');
  }, [openScene]);

  const handleOpenSkills = useCallback(() => {
    openScene('skills');
  }, [openScene]);

  const handleOpenConnectors = useCallback(() => {
    setSettingsActiveTab('mcp-tools');
    openScene('settings');
  }, [openScene, setSettingsActiveTab]);

  const handleOpenAutomation = useCallback(() => {
    openScene('automation');
  }, [openScene]);

  const isAgentsActive = activeTabId === 'agents';
  const isSkillsActive = activeTabId === 'skills';
  const isConnectorsActive = activeTabId === 'settings' && settingsActiveTab === 'mcp-tools';
  const isAutomationActive = activeTabId === 'automation';

  useEffect(() => {
    if (isAgentsActive || isSkillsActive || isConnectorsActive) {
      setIsExtensionsOpen(true);
    }
  }, [isAgentsActive, isSkillsActive, isConnectorsActive]);

  const workspaceMenuPortal = workspaceMenuOpen ? createPortal(
    <div
      ref={workspaceMenuRef}
      id="void-workspace-menu"
      className={[
        'void-nav-panel__workspace-menu',
        workspaceMenuClosing ? 'is-closing' : '',
      ].filter(Boolean).join(' ')}
      role="menu"
      onKeyDown={handleWorkspaceMenuKeyDown}
      onFocusCapture={handleWorkspaceMenuFocusCapture}
      style={{ top: workspaceMenuPos.top, left: workspaceMenuPos.left }}
    >
      <button
        type="button"
        className="void-nav-panel__workspace-menu-item"
        role="menuitem"
        onClick={() => { closeWorkspaceMenu(); void handleOpenProject(); }}
      >
        <FolderOpen size={13} />
        <span>{t('header.openProject')}</span>
      </button>
      <button
        type="button"
        className="void-nav-panel__workspace-menu-item"
        role="menuitem"
        onClick={() => { closeWorkspaceMenu(); handleNewProject(); }}
      >
        <FolderPlus size={13} />
        <span>{t('header.newProject')}</span>
      </button>
      <button
        type="button"
        className="void-nav-panel__workspace-menu-item"
        role="menuitem"
        onClick={handleOpenRemoteSSH}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0-6v6" />
        </svg>
        <span>{t('ssh.remote.connect')}</span>
      </button>
      <div className="void-nav-panel__workspace-menu-divider" role="separator" />
      <div className="void-nav-panel__workspace-menu-section-title">
        <History size={12} aria-hidden="true" />
        <span>{t('header.recentWorkspaces')}</span>
      </div>
      {recentWorkspaces.length === 0 ? (
        <div className="void-nav-panel__workspace-menu-empty">
          <span>{t('header.noRecentWorkspaces')}</span>
        </div>
      ) : (
        <div className="void-nav-panel__workspace-menu-workspaces">
          {recentWorkspaces.map((workspace) => {
            const { hostPrefix, folderLabel, tooltip } = getRecentWorkspaceLineParts(workspace);
            return (
            <button
              key={workspace.id}
              type="button"
              className="void-nav-panel__workspace-menu-item void-nav-panel__workspace-menu-item--workspace"
              role="menuitem"
              title={tooltip}
              onClick={() => { void handleSwitchWorkspace(workspace.id); }}
            >
              <FolderOpen size={13} aria-hidden="true" />
              <span className="void-nav-panel__workspace-menu-item-main">
                {hostPrefix ? (
                  <>
                    <span className="void-nav-panel__workspace-menu-item-host">{hostPrefix}</span>
                    <span className="void-nav-panel__workspace-menu-item-host-sep" aria-hidden>
                      ·
                    </span>
                  </>
                ) : null}
                <span className="void-nav-panel__workspace-menu-item-name">{folderLabel}</span>
              </span>
              {workspace.id === currentWorkspace?.id ? <Check size={12} aria-hidden="true" /> : null}
            </button>
            );
          })}
        </div>
      )}
    </div>,
    document.body
  ) : null;

  const assistantTooltip = t('nav.items.persona');
  const automationTooltip = t('nav.items.automation');
  const addWorkspaceTooltip = t('nav.tooltips.addWorkspace');
  const isAssistantActive = activeTabId === 'assistant';
  const agentsTooltip = t('nav.tooltips.agents');
  const skillsTooltip = t('nav.tooltips.skills');
  const connectorsTooltip = t('nav.tooltips.connectors');
  const extensionsLabel = t('nav.sections.extensions');
  const searchTrigger = (
    <Tooltip content={t('nav.search.triggerTooltip')} placement="right" followCursor>
      <button
        type="button"
        className="void-nav-panel__search-trigger"
        onClick={() => setSearchOpen(true)}
        aria-label={t('nav.search.triggerTooltip')}
      >
        <span className="void-nav-panel__search-trigger__icon" aria-hidden="true">
          <span className="void-nav-panel__search-trigger__icon-inner">
            <Search size={13} />
          </span>
        </span>
        {workspacePresentation === 'classic' ? (
          <span className="void-nav-panel__search-trigger__label">
            {t('nav.search.triggerPlaceholder')}
          </span>
        ) : null}
      </button>
    </Tooltip>
  );

  return (
    <>
      {/* ── Workspace search ───────────────────────── */}
      {workspacePresentation === 'classic' ? (
        <div className="void-nav-panel__brand-header">
          <div className="void-nav-panel__brand-search">
            {searchTrigger}
          </div>
        </div>
      ) : null}

      {/* ── Top action strip ────────────────────────── */}
      <div className="void-nav-panel__top-actions">
        <SessionCreateLauncher
          presentation={workspacePresentation}
          selectedMode={selectedSessionMode}
          groupLabel={t('nav.sessions.newTask')}
          modeLabels={{
            code: {
              create: t('nav.sessions.newCodeSession'),
              mode: t('nav.sessions.modeCode'),
              short: t('nav.sessions.newCodeSessionShort'),
            },
            cowork: {
              create: t('nav.sessions.newCoworkSession'),
              mode: t('nav.sessions.modeCowork'),
              short: t('nav.sessions.newCoworkSessionShort'),
            },
            media: {
              create: t('nav.sessions.newMediaSession'),
              mode: t('nav.sessions.modeMedia'),
              short: t('nav.sessions.newMediaSessionShort'),
            },
          }}
          onSelectMode={setSessionMode}
          onCreate={handleCreateTask}
          searchTrigger={workspacePresentation === 'minimal' ? searchTrigger : undefined}
        />

        <Tooltip content={assistantTooltip} placement="right" followCursor>
          <button
            type="button"
            className={`void-nav-panel__top-action-btn${isAssistantActive ? ' is-active' : ''}`}
            onClick={handleOpenAssistant}
            aria-label={assistantTooltip}
          >
            <span className="void-nav-panel__top-action-icon-slot" aria-hidden="true">
              <User size={15} />
            </span>
            <span>{t('nav.items.persona')}</span>
          </button>
        </Tooltip>

        <Tooltip content={automationTooltip} placement="right" followCursor>
          <button
            type="button"
            className={`void-nav-panel__top-action-btn${isAutomationActive ? ' is-active' : ''}`}
            onClick={handleOpenAutomation}
            aria-label={automationTooltip}
          >
            <span className="void-nav-panel__top-action-icon-slot" aria-hidden="true">
              <CalendarClock size={15} />
            </span>
            <span>{t('nav.items.automation')}</span>
          </button>
        </Tooltip>

        <div className="void-nav-panel__top-action-expand">
          <Tooltip content={extensionsLabel} placement="right" followCursor>
            <button
              type="button"
              className={[
                'void-nav-panel__top-action-btn',
                'void-nav-panel__top-action-btn--expand',
                isExtensionsOpen ? 'is-open' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setIsExtensionsOpen(v => !v)}
              aria-expanded={isExtensionsOpen}
              aria-controls="void-nav-panel-extensions"
              aria-label={extensionsLabel}
            >
              <span className="void-nav-panel__top-action-expand-icons" aria-hidden="true">
                <Blocks size={15} className="void-nav-panel__top-action-expand-icon-default" />
                <ChevronDown
                  size={15}
                  className={[
                    'void-nav-panel__top-action-expand-icon-chevron',
                    isExtensionsOpen ? 'is-open' : '',
                  ].filter(Boolean).join(' ')}
                />
              </span>
              <span>{extensionsLabel}</span>
            </button>
          </Tooltip>

          <div
            id="void-nav-panel-extensions"
            className={`void-nav-panel__top-action-sublist${isExtensionsOpen ? ' is-open' : ''}`}
            aria-hidden={!isExtensionsOpen}
          >
            <Tooltip content={agentsTooltip} placement="right" followCursor>
              <button
                type="button"
                className={[
                  'void-nav-panel__top-action-btn',
                  'void-nav-panel__top-action-btn--sub',
                  isAgentsActive ? 'is-active' : '',
                ].filter(Boolean).join(' ')}
                onClick={handleOpenAgents}
                aria-label={agentsTooltip}
                tabIndex={isExtensionsOpen ? 0 : -1}
              >
                <span className="void-nav-panel__top-action-icon-slot" aria-hidden="true">
                  <Users size={15} />
                </span>
                <span>{t('nav.items.agents')}</span>
              </button>
            </Tooltip>

            <Tooltip content={skillsTooltip} placement="right" followCursor>
              <button
                type="button"
                className={[
                  'void-nav-panel__top-action-btn',
                  'void-nav-panel__top-action-btn--sub',
                  isSkillsActive ? 'is-active' : '',
                ].filter(Boolean).join(' ')}
                onClick={handleOpenSkills}
                aria-label={skillsTooltip}
                tabIndex={isExtensionsOpen ? 0 : -1}
              >
                <span className="void-nav-panel__top-action-icon-slot" aria-hidden="true">
                  <Puzzle size={15} />
                </span>
                <span>{t('nav.items.skills')}</span>
              </button>
            </Tooltip>

            <Tooltip content={connectorsTooltip} placement="right" followCursor>
              <button
                type="button"
                className={[
                  'void-nav-panel__top-action-btn',
                  'void-nav-panel__top-action-btn--sub',
                  isConnectorsActive ? 'is-active' : '',
                ].filter(Boolean).join(' ')}
                onClick={handleOpenConnectors}
                aria-label={connectorsTooltip}
                tabIndex={isExtensionsOpen ? 0 : -1}
              >
                <span className="void-nav-panel__top-action-icon-slot" aria-hidden="true">
                  <Cable size={15} />
                </span>
                <span>{t('nav.items.connectors')}</span>
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* ── Sections ────────────────────────────────── */}
      <div className="void-nav-panel__sections">

        {/* Assistant sessions */}
        <div className="void-nav-panel__section">
          <SectionHeader
            label={t('nav.sections.assistantSessions')}
            collapsible
            isOpen={expandedSections.has('assistant-sessions')}
            controlsId="void-nav-panel-assistant-sessions"
            onToggle={() => toggleSection('assistant-sessions')}
          />
          <div
            id="void-nav-panel-assistant-sessions"
            className={`void-nav-panel__collapsible${expandedSections.has('assistant-sessions') ? '' : ' is-collapsed'}`}
            aria-hidden={!expandedSections.has('assistant-sessions')}
            {...(!expandedSections.has('assistant-sessions') ? { inert: '' } : {})}
          >
            <div className="void-nav-panel__collapsible-inner">
              <div className="void-nav-panel__items void-nav-panel__items--session-blocks">
                {assistantWorkspacesList.map(workspace => {
                  const assistantDisplayName =
                    workspace.workspaceKind === WorkspaceKind.Assistant
                      ? workspace.identity?.name?.trim() || workspace.name
                      : workspace.name;
                  return (
                    <SessionsSection
                      key={workspace.id}
                      workspaceId={workspace.id}
                      workspacePath={workspace.rootPath}
                      remoteConnectionId={isRemoteWorkspace(workspace) ? workspace.connectionId : null}
                      isActiveWorkspace={!isNewSessionDraft && workspace.id === currentWorkspace?.id}
                      assistantLabel={assistantDisplayName}
                      isVisible={expandedSections.has('assistant-sessions')}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Workspace */}
        <div className="void-nav-panel__section">
          <SectionHeader
            label={t('nav.sections.workspace')}
            collapsible
            isOpen={expandedSections.has('workspace')}
            controlsId="void-nav-panel-workspaces"
            onToggle={() => toggleSection('workspace')}
            actions={
              <div className="void-nav-panel__workspace-action-wrap">
                <Tooltip content={addWorkspaceTooltip} placement="right" followCursor disabled={workspaceMenuOpen}>
                  <button
                    ref={workspaceMenuButtonRef}
                    type="button"
                    className={`void-nav-panel__section-action${workspaceMenuOpen ? ' is-active' : ''}`}
                    aria-label={addWorkspaceTooltip}
                    aria-controls="void-workspace-menu"
                    aria-expanded={workspaceMenuOpen}
                    aria-haspopup="menu"
                    onClick={toggleWorkspaceMenu}
                    onKeyDown={handleWorkspaceMenuTriggerKeyDown}
                  >
                    <Plus size="var(--void-nav-row-action-icon-size)" />
                  </button>
                </Tooltip>
              </div>
            }
          />
          <div
            id="void-nav-panel-workspaces"
            className={`void-nav-panel__collapsible${expandedSections.has('workspace') ? '' : ' is-collapsed'}`}
            aria-hidden={!expandedSections.has('workspace')}
            {...(!expandedSections.has('workspace') ? { inert: '' } : {})}
          >
            <div className="void-nav-panel__collapsible-inner">
              <div className="void-nav-panel__items">
                <WorkspaceListSection
                  variant="projects"
                  suppressActive={isNewSessionDraft}
                  onWorkspaceActivate={
                    isNewSessionDraft
                      ? selectNewSessionDraftWorkspace
                      : undefined
                  }
                />
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ── Bottom: MiniApp ───────────────────────── */}
      <div className="void-nav-panel__bottom-bar">
        <div className="void-nav-panel__miniapp-footer">
          <MiniAppEntry
            isActive={activeTabId === 'miniapps' || !!activeMiniAppId}
            activeMiniAppId={activeMiniAppId}
            onOpenMiniApps={() => openScene('miniapps')}
            onOpenMiniApp={(appId) => openScene(`miniapp:${appId}`)}
          />
        </div>
      </div>

      {workspaceMenuPortal}

      {/* SSH Remote Dialogs */}
      <SSHConnectionDialog
        open={isSSHConnectionDialogOpen}
        onClose={() => setIsSSHConnectionDialogOpen(false)}
      />
      {sshRemote.showFileBrowser && sshRemote.connectionId && (
        <RemoteFileBrowser
          connectionId={sshRemote.connectionId}
          initialPath={sshRemote.remoteFileBrowserInitialPath}
          homePath={sshRemote.remoteFileBrowserInitialPath}
          selectDirectoriesOnly
          onSelect={handleSelectRemoteWorkspace}
          onCancel={() => {
            const hasActiveRemoteWorkspace =
              Boolean(sshRemote.remoteWorkspace) ||
              openedWorkspacesList.some(workspace =>
                isRemoteWorkspace(workspace) &&
                workspace.connectionId === sshRemote.connectionId
              );
            sshRemote.setShowFileBrowser(false);
            if (!hasActiveRemoteWorkspace) {
              void sshRemote.disconnect();
            }
          }}
        />
      )}
      {searchOpen ? (
        <React.Suspense fallback={null}>
          <NavSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
        </React.Suspense>
      ) : null}
    </>
  );
};

export default MainNav;
