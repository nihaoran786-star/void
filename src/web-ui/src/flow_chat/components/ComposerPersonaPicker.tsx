import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  Bot,
  Check,
  ChevronRight,
  Loader2,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  localizeCatalogPresentation,
  type AgentCatalogEntry,
  type TeamCatalogEntry,
} from '@/shared/services/customization';

export interface ComposerPersonaPickerProps {
  agents: readonly AgentCatalogEntry[];
  teams: readonly TeamCatalogEntry[];
  loading: boolean;
  status: 'ready' | 'partial' | 'empty' | 'error' | 'unsupported';
  activePersonaId?: string;
  busyId?: string;
  onSelectAgent: (entry: AgentCatalogEntry) => void;
  onSelectTeam: (entry: TeamCatalogEntry) => void;
  onOpenLibrary: () => void;
}

export const ComposerPersonaPicker: React.FC<ComposerPersonaPickerProps> = ({
  agents,
  teams,
  loading,
  status,
  activePersonaId,
  busyId,
  onSelectAgent,
  onSelectTeam,
  onOpenLibrary,
}) => {
  const { t: tCommon } = useTranslation('common');
  const { t: tAgents } = useTranslation('scenes/agents');
  const menuId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [opensLeft, setOpensLeft] = useState(false);
  const [opensUp, setOpensUp] = useState(false);

  const localize = useCallback((entry: AgentCatalogEntry | TeamCatalogEntry) =>
    localizeCatalogPresentation(entry.identity, key => tAgents(key)), [tAgents]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  const openMenu = useCallback(() => {
    clearCloseTimer();
    const rect = hostRef.current?.getBoundingClientRect();
    if (rect) {
      setOpensLeft(rect.right + 330 > window.innerWidth - 8);
      setOpensUp(rect.top + 320 > window.innerHeight - 8);
    }
    setOpen(true);
  }, [clearCloseTimer]);

  const closeMenu = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
    }, 150);
  }, [clearCloseTimer]);

  const closeImmediately = useCallback((restoreFocus = false) => {
    clearCloseTimer();
    setOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, [clearCloseTimer]);

  const focusEdgeItem = useCallback((edge: 'first' | 'last') => {
    openMenu();
    window.requestAnimationFrame(() => {
      const items = Array.from(
        hostRef.current?.querySelectorAll<HTMLElement>('[data-persona-flyout-item]') ?? [],
      );
      (edge === 'last' ? items[items.length - 1] : items[0])?.focus();
    });
  }, [openMenu]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeImmediately(true);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }
    const items = Array.from(
      hostRef.current?.querySelectorAll<HTMLElement>('[data-persona-flyout-item]') ?? [],
    );
    if (items.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const activeIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowDown'
          ? activeIndex < 0 ? 0 : (activeIndex + 1) % items.length
          : activeIndex < 0 ? items.length - 1 : (activeIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  }, [closeImmediately]);

  const renderAgent = (entry: AgentCatalogEntry) => {
    const presentation = localize(entry);
    const active = entry.identity.id === activePersonaId;
    const busy = entry.identity.id === busyId;
    return (
      <button
        key={entry.identity.id}
        type="button"
        role="menuitemradio"
        aria-checked={active}
        data-persona-flyout-item
        className="void-chat-input__persona-item"
        disabled={Boolean(busyId)}
        title={presentation.description || presentation.displayName}
        onClick={event => {
          event.stopPropagation();
          closeImmediately();
          onSelectAgent(entry);
        }}
      >
        <span className="void-chat-input__persona-item-icon">
          {busy
            ? <Loader2 size={14} className="void-chat-input__boost-submenu-spinner" aria-hidden />
            : <Bot size={14} aria-hidden />}
        </span>
        <span className="void-chat-input__persona-item-copy">
          <span className="void-chat-input__persona-item-name">{presentation.displayName}</span>
          {presentation.description ? (
            <span className="void-chat-input__persona-item-description">
              {presentation.description}
            </span>
          ) : null}
        </span>
        {active ? <Check size={14} className="void-chat-input__persona-item-check" aria-hidden /> : null}
      </button>
    );
  };

  const renderTeam = (entry: TeamCatalogEntry) => {
    const presentation = localize(entry);
    const busy = entry.identity.id === busyId;
    return (
      <button
        key={entry.identity.id}
        type="button"
        role="menuitem"
        data-persona-flyout-item
        className="void-chat-input__persona-item"
        disabled={Boolean(busyId)}
        title={presentation.description || presentation.displayName}
        onClick={event => {
          event.stopPropagation();
          closeImmediately();
          onSelectTeam(entry);
        }}
      >
        <span className="void-chat-input__persona-item-icon void-chat-input__persona-item-icon--team">
          {busy
            ? <Loader2 size={14} className="void-chat-input__boost-submenu-spinner" aria-hidden />
            : <Users size={14} aria-hidden />}
        </span>
        <span className="void-chat-input__persona-item-copy">
          <span className="void-chat-input__persona-item-name">{presentation.displayName}</span>
          {presentation.description ? (
            <span className="void-chat-input__persona-item-description">
              {presentation.description}
            </span>
          ) : null}
        </span>
        <span className="void-chat-input__persona-item-action">
          {tCommon(
            entry.identity.id === 'ai-short-drama-team'
              ? 'customization.composerPersona.open'
              : 'customization.composerPersona.summon',
          )}
        </span>
      </button>
    );
  };

  return (
    <div
      ref={hostRef}
      className="void-chat-input__boost-submenu-host"
      onMouseEnter={openMenu}
      onMouseLeave={closeMenu}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          closeImmediately();
        }
      }}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        className="void-chat-input__boost-submenu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={event => {
          event.stopPropagation();
          focusEdgeItem('first');
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
            event.preventDefault();
            event.stopPropagation();
            focusEdgeItem('first');
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopPropagation();
            focusEdgeItem('last');
          }
        }}
      >
        <span className="void-chat-input__boost-submenu-trigger-main">
          <Bot size={14} className="void-chat-input__boost-context-icon" aria-hidden />
          <span>{tCommon('customization.composerPersona.trigger')}</span>
        </span>
        <ChevronRight size={14} className="void-chat-input__boost-submenu-chevron" aria-hidden />
      </button>
      <div
        id={menuId}
        className={[
          'void-chat-input__boost-submenu-shell',
          'void-chat-input__persona-submenu-shell',
          open ? 'void-chat-input__boost-submenu-shell--open' : '',
          opensLeft ? 'void-chat-input__boost-submenu-shell--left' : '',
          opensUp ? 'void-chat-input__boost-submenu-shell--up' : '',
        ].filter(Boolean).join(' ')}
        onMouseEnter={openMenu}
        onMouseLeave={closeMenu}
      >
        <div
          className="void-chat-input__boost-submenu-panel void-chat-input__persona-panel"
          role="menu"
          aria-label={tCommon('customization.composerPersona.trigger')}
        >
          {status === 'unsupported' ? (
            <div
              className="void-chat-input__boost-submenu-empty"
              data-testid="composer-persona-runtime-unsupported"
            >
              {tCommon('customization.composerPersona.unsupportedWeb')}
            </div>
          ) : loading ? (
            <div className="void-chat-input__boost-submenu-loading">
              <Loader2 size={14} className="void-chat-input__boost-submenu-spinner" aria-hidden />
              <span>{tCommon('customization.composerPersona.loading')}</span>
            </div>
          ) : status === 'error' ? (
            <div className="void-chat-input__boost-submenu-empty">
              {tCommon('customization.composerPersona.loadFailed')}
            </div>
          ) : agents.length === 0 && teams.length === 0 ? (
            <div className="void-chat-input__boost-submenu-empty">
              {tCommon('customization.composerPersona.empty')}
            </div>
          ) : (
            <div className="void-chat-input__persona-list">
              {agents.length > 0 ? (
                <section className="void-chat-input__persona-section">
                  <div className="void-chat-input__persona-section-title">
                    {tCommon('customization.composerPersona.agents')}
                  </div>
                  {agents.map(renderAgent)}
                </section>
              ) : null}
              {teams.length > 0 ? (
                <section className="void-chat-input__persona-section">
                  <div className="void-chat-input__persona-section-title">
                    {tCommon('customization.composerPersona.teams')}
                  </div>
                  {teams.map(renderTeam)}
                </section>
              ) : null}
            </div>
          )}
          {status !== 'unsupported' ? (
            <button
              type="button"
              role="menuitem"
              data-persona-flyout-item
              className="void-chat-input__boost-submenu-manage"
              onClick={event => {
                event.stopPropagation();
                closeImmediately();
                onOpenLibrary();
              }}
            >
              {tCommon('customization.composerPersona.manage')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

ComposerPersonaPicker.displayName = 'ComposerPersonaPicker';
