import React, { useState, useCallback } from 'react';
import {
  Settings,
  Info,
  MoreVertical,
  PictureInPicture2,
  SquareTerminal,
  Terminal,
  Smartphone,
  Globe,
  ExternalLink,
  BarChart3,
  Activity,
  ChevronUp,
} from 'lucide-react';
import { Tooltip, Modal } from '@/component-library';
import { useI18n } from '@/infrastructure/i18n/hooks/useI18n';
import { useSceneManager } from '../../../hooks/useSceneManager';
import { useNavSceneStore } from '../../../stores/navSceneStore';
import { useSceneStore } from '../../../stores/sceneStore';
import { useCanvasStore } from '@/app/components/panels/content-canvas/stores';
import { useToolbarModeContext } from '@/flow_chat/components/toolbar-mode/ToolbarModeContext';
import { useCurrentWorkspace } from '@/infrastructure/contexts/WorkspaceContext';
import { useNotification } from '@/shared/notification-system';
import NotificationButton from '../../TitleBar/NotificationButton';
import { AboutDialog } from '../../AboutDialog';
import { RemoteConnectDialog } from '../../RemoteConnectDialog';
import {
  RemoteConnectDisclaimerContent,
} from '../../RemoteConnectDialog/RemoteConnectDisclaimer';
import {
  getRemoteConnectDisclaimerAgreed,
  setRemoteConnectDisclaimerAgreed,
} from '../../RemoteConnectDialog/remoteConnectDisclaimerStorage';

const PersistentFooterActions: React.FC = () => {
  const { t } = useI18n('common');
  const { openScene } = useSceneManager();
  const activeTabId = useSceneStore((s) => s.activeTabId);
  const showSceneNav = useNavSceneStore((s) => s.showSceneNav);
  const navSceneId = useNavSceneStore((s) => s.navSceneId);
  const openNavScene = useNavSceneStore((s) => s.openNavScene);
  const closeNavScene = useNavSceneStore((s) => s.closeNavScene);

  // Check if a browser panel is the active tab in the AuxPane canvas
  const isBrowserPanelActiveInCanvas = useCanvasStore((s) => {
    const activeTab = s.primaryGroup.tabs.find((t) => t.id === s.primaryGroup.activeTabId);
    return activeTab?.content.type === 'browser';
  });
  const { enableToolbarMode } = useToolbarModeContext();
  const { hasWorkspace } = useCurrentWorkspace();
  const { warning } = useNotification();

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showRemoteConnect, setShowRemoteConnect] = useState(false);
  const [showRemoteDisclaimer, setShowRemoteDisclaimer] = useState(false);
  const [hasAgreedRemoteDisclaimer, setHasAgreedRemoteDisclaimer] = useState<boolean>(() => getRemoteConnectDisclaimerAgreed());

  const closeMenu = useCallback(() => {
    setMenuClosing(true);
    setTimeout(() => {
      setMenuOpen(false);
      setMenuClosing(false);
    }, 150);
  }, []);

  const toggleMenu = () => {
    if (menuOpen) {
      closeMenu();
    } else {
      setMenuOpen(true);
    }
  };

  const handleOpenSettings = () => {
    closeMenu();
    openScene('settings');
  };

  const handleOpenShell = useCallback(() => {
    if (showSceneNav && navSceneId === 'shell') {
      closeNavScene();
      return;
    }
    openNavScene('shell');
  }, [closeNavScene, navSceneId, openNavScene, showSceneNav]);

  const handleOpenBrowser = useCallback(() => {
    if (activeTabId === 'session') {
      // Open browser as a panel in the AuxPane (right side of chat)
      window.dispatchEvent(new CustomEvent('agent-create-tab', {
        detail: {
          type: 'browser',
          title: t('scenes.browser'),
          checkDuplicate: true,
          duplicateCheckKey: 'browser-panel',
          replaceExisting: false,
        },
      }));
    } else {
      openScene('browser');
    }
  }, [activeTabId, openScene, t]);

  const handleOpenShellFromMenu = useCallback(() => {
    closeMenu();
    handleOpenShell();
  }, [closeMenu, handleOpenShell]);

  const handleOpenBrowserFromMenu = useCallback(() => {
    closeMenu();
    handleOpenBrowser();
  }, [closeMenu, handleOpenBrowser]);

  const handleOpenInsights = useCallback(() => {
    closeMenu();
    openScene('insights');
  }, [closeMenu, openScene]);

  const handleShowWorkspaceStatus = useCallback(() => {
    closeMenu();
    window.dispatchEvent(new Event('nav:workspace-status'));
  }, [closeMenu]);

  const handleShowAbout = () => {
    closeMenu();
    setShowAbout(true);
  };

  const handleFloatingMode = () => {
    closeMenu();
    enableToolbarMode();
  };

  const handleRemoteConnect = useCallback(async () => {
    if (!hasWorkspace) {
      warning(t('header.remoteConnectRequiresWorkspace'));
      return;
    }

    closeMenu();

    if (hasAgreedRemoteDisclaimer || getRemoteConnectDisclaimerAgreed()) {
      setHasAgreedRemoteDisclaimer(true);
      setShowRemoteConnect(true);
      return;
    }

    setShowRemoteDisclaimer(true);
  }, [hasWorkspace, warning, t, closeMenu, hasAgreedRemoteDisclaimer]);

  const handleAgreeDisclaimer = useCallback(() => {
    setRemoteConnectDisclaimerAgreed();
    setHasAgreedRemoteDisclaimer(true);
    setShowRemoteDisclaimer(false);
    setShowRemoteConnect(true);
  }, []);

  const isBrowserActive =
    activeTabId === 'browser' || (activeTabId === 'session' && isBrowserPanelActiveInCanvas);

  return (
    <>
      <div className="void-nav-panel__footer">
        <div className="void-nav-panel__footer-left">
          <div className="void-nav-panel__footer-more-wrap">
            <Tooltip content={t('nav.moreOptions')} placement="right" followCursor disabled={menuOpen}>
              <button
                type="button"
                className={`void-nav-panel__footer-btn void-nav-panel__footer-btn--icon${menuOpen ? ' is-active' : ''}`}
                aria-label={t('nav.moreOptions')}
                aria-expanded={menuOpen}
                onClick={toggleMenu}
              >
                {menuOpen ? (
                  <MoreVertical size={15} aria-hidden="true" />
                ) : (
                  <span className="void-nav-panel__footer-btn-icon-swap" aria-hidden="true">
                    <MoreVertical size={15} className="void-nav-panel__footer-btn-icon-swap-default" />
                    <ChevronUp size={15} className="void-nav-panel__footer-btn-icon-swap-hover" />
                  </span>
                )}
              </button>
            </Tooltip>

            {menuOpen && (
              <>
                <div
                  className="void-nav-panel__footer-backdrop"
                  onClick={closeMenu}
                />
                <div
                  className={`void-nav-panel__footer-menu${menuClosing ? ' is-closing' : ''}`}
                  role="menu"
                >
                  <Tooltip
                    content={t('header.remoteConnectRequiresWorkspace')}
                    placement="right"
                    disabled={hasWorkspace}
                  >
                    <button
                      type="button"
                      className={`void-nav-panel__footer-menu-item${!hasWorkspace ? ' is-disabled' : ''}`}
                      role="menuitem"
                      data-testid="remote-connect-menu-item"
                      aria-disabled={!hasWorkspace}
                      onClick={handleRemoteConnect}
                    >
                      <Smartphone size={14} />
                      <span>{t('header.remoteConnect')}</span>
                    </button>
                  </Tooltip>
                  <button
                    type="button"
                    className="void-nav-panel__footer-menu-item void-nav-panel__footer-menu-item--minimal-only"
                    role="menuitem"
                    data-testid="minimal-footer-shell-menu-item"
                    onClick={handleOpenShellFromMenu}
                  >
                    <SquareTerminal size={14} />
                    <span>{t('scenes.shell')}</span>
                  </button>
                  <button
                    type="button"
                    className="void-nav-panel__footer-menu-item void-nav-panel__footer-menu-item--minimal-only"
                    role="menuitem"
                    data-testid="minimal-footer-browser-menu-item"
                    onClick={handleOpenBrowserFromMenu}
                  >
                    <Globe size={14} />
                    <span>{t('scenes.browser')}</span>
                  </button>
                  <div className="void-nav-panel__footer-menu-divider" />
                  <button
                    type="button"
                    className="void-nav-panel__footer-menu-item"
                    role="menuitem"
                    data-testid="workspace-status-menu-item"
                    onClick={handleShowWorkspaceStatus}
                  >
                    <Activity size={14} />
                    <span>{t('nav.workspaceStatus')}</span>
                  </button>
                  <button
                    type="button"
                    className="void-nav-panel__footer-menu-item"
                    role="menuitem"
                    onClick={handleFloatingMode}
                  >
                    <PictureInPicture2 size={14} />
                    <span>{t('header.switchToToolbar')}</span>
                  </button>
                  <div className="void-nav-panel__footer-menu-divider" />
                  <button
                    type="button"
                    className="void-nav-panel__footer-menu-item"
                    role="menuitem"
                    onClick={handleOpenInsights}
                  >
                    <BarChart3 size={14} />
                    <span>{t('scenes.insights')}</span>
                  </button>
                  <button
                    type="button"
                    className="void-nav-panel__footer-menu-item"
                    role="menuitem"
                    onClick={handleOpenSettings}
                  >
                    <Settings size={14} />
                    <span>{t('tabs.settings')}</span>
                  </button>
                  <button
                    type="button"
                    className="void-nav-panel__footer-menu-item"
                    role="menuitem"
                    data-testid="about-menu-item"
                    onClick={handleShowAbout}
                  >
                    <Info size={14} />
                    <span>{t('header.about')}</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <Tooltip content={t('scenes.shell')} placement="right">
            <button
              type="button"
              className={`void-nav-panel__footer-btn void-nav-panel__footer-btn--icon void-nav-panel__footer-quick-action${showSceneNav && navSceneId === 'shell' ? ' is-active' : ''}`}
              aria-label={t('scenes.shell')}
              aria-pressed={showSceneNav && navSceneId === 'shell'}
              onClick={handleOpenShell}
            >
              <span className="void-nav-panel__footer-btn-icon-swap" aria-hidden="true">
                <SquareTerminal size={15} className="void-nav-panel__footer-btn-icon-swap-default" />
                <Terminal size={15} className="void-nav-panel__footer-btn-icon-swap-hover" />
              </span>
            </button>
          </Tooltip>

          <Tooltip content={t('scenes.browser')} placement="right">
            <button
              type="button"
              className={`void-nav-panel__footer-btn void-nav-panel__footer-btn--icon void-nav-panel__footer-quick-action${isBrowserActive ? ' is-active' : ''}`}
              aria-label={t('scenes.browser')}
              aria-pressed={isBrowserActive}
              onClick={handleOpenBrowser}
            >
              <span className="void-nav-panel__footer-btn-icon-swap" aria-hidden="true">
                <Globe size={15} className="void-nav-panel__footer-btn-icon-swap-default" />
                <ExternalLink size={15} className="void-nav-panel__footer-btn-icon-swap-hover" />
              </span>
            </button>
          </Tooltip>
        </div>

        <div className="void-nav-panel__footer-right">
          <NotificationButton className="void-nav-panel__footer-btn" navFooterHoverIconSwap />
        </div>
      </div>
      <AboutDialog
        isOpen={showAbout}
        onClose={() => setShowAbout(false)}
      />
      <RemoteConnectDialog
        isOpen={showRemoteConnect}
        onClose={() => setShowRemoteConnect(false)}
      />
      <Modal
        isOpen={showRemoteDisclaimer}
        onClose={() => setShowRemoteDisclaimer(false)}
        title={t('remoteConnect.disclaimerTitle')}
        showCloseButton
        size="large"
        contentInset
      >
        <RemoteConnectDisclaimerContent
          agreed={hasAgreedRemoteDisclaimer}
          onClose={() => setShowRemoteDisclaimer(false)}
          onAgree={handleAgreeDisclaimer}
        />
      </Modal>
    </>
  );
};

export default PersistentFooterActions;
