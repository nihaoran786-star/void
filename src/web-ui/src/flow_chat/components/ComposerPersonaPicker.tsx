import React, {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Bot, Check, ChevronRight } from 'lucide-react';
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
  activeTeamId?: string;
  busyId?: string;
  onSelectAgent: (entry: AgentCatalogEntry) => void;
  onSelectTeam: (entry: TeamCatalogEntry) => void;
  onOpenLibrary: () => void;
}

/**
 * One unified, quiet persona selector: a single popover with a pinned search
 * input over two flat text-first sections (agents, teams). No avatars, no
 * hover flyout, no animation — presentation only; the selection callbacks and
 * binding rules are untouched.
 */
export const ComposerPersonaPicker: React.FC<ComposerPersonaPickerProps> = ({
  agents,
  teams,
  loading,
  status,
  activePersonaId,
  activeTeamId,
  busyId,
  onSelectAgent,
  onSelectTeam,
  onOpenLibrary,
}) => {
  const { t: tFlow } = useTranslation('flow-chat');
  const { t: tCommon } = useTranslation('common');
  const { t: tAgents } = useTranslation('scenes/agents');
  const menuId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [opensLeft, setOpensLeft] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  const [query, setQuery] = useState('');

  const localize = useCallback((entry: AgentCatalogEntry | TeamCatalogEntry) =>
    localizeCatalogPresentation(entry.identity, key => tAgents(key)), [tAgents]);

  const openMenu = useCallback(() => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (rect) {
      setOpensLeft(rect.right + 330 > window.innerWidth - 8);
      setOpensUp(rect.top + 360 > window.innerHeight - 8);
    }
    setOpen(true);
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    setQuery('');
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  const toggleMenu = useCallback(() => {
    if (open) {
      closeMenu();
    } else {
      openMenu();
    }
  }, [closeMenu, open, openMenu]);

  const matchesQuery = useCallback((entry: AgentCatalogEntry | TeamCatalogEntry) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    const presentation = localize(entry);
    return [
      presentation.displayName,
      presentation.description,
      entry.identity.id,
      ...entry.identity.aliases,
    ].some(text => text.toLowerCase().includes(needle));
  }, [localize, query]);

  const visibleAgents = useMemo(
    () => agents.filter(matchesQuery),
    [agents, matchesQuery],
  );
  const visibleTeams = useMemo(
    () => teams.filter(matchesQuery),
    [teams, matchesQuery],
  );
  const hasEntries = agents.length > 0 || teams.length > 0;
  const hasVisibleEntries = visibleAgents.length > 0 || visibleTeams.length > 0;

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }
    // Keep plain text editing keys inside the search field.
    if (
      event.target === searchRef.current
      && (event.key === 'Home' || event.key === 'End')
    ) {
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
  }, [closeMenu]);

  const renderAgent = (entry: AgentCatalogEntry) => {
    const presentation = localize(entry);
    const active = !activeTeamId && entry.identity.id === activePersonaId;
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
          closeMenu();
          onSelectAgent(entry);
        }}
      >
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
    const active = entry.identity.id === activeTeamId;
    const memberCount = entry.members.length + 1;
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
          closeMenu();
          onSelectTeam(entry);
        }}
      >
        <span className="void-chat-input__persona-item-copy">
          <span className="void-chat-input__persona-item-name">
            {presentation.displayName}
            <span className="void-chat-input__persona-item-count">
              {' · '}
              {tFlow('teamWorkspace.members.count', { count: memberCount })}
            </span>
          </span>
          {presentation.description ? (
            <span className="void-chat-input__persona-item-description">
              {presentation.description}
            </span>
          ) : null}
        </span>
        {active ? (
          <Check size={14} className="void-chat-input__persona-item-check" aria-hidden />
        ) : null}
      </button>
    );
  };

  return (
    <div
      ref={hostRef}
      className="void-chat-input__boost-submenu-host"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          closeMenu();
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
          toggleMenu();
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
            event.preventDefault();
            event.stopPropagation();
            openMenu();
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
      >
        <div
          className="void-chat-input__boost-submenu-panel void-chat-input__persona-panel"
          role="menu"
          aria-label={tCommon('customization.composerPersona.trigger')}
        >
          {status !== 'unsupported' && !loading && status !== 'error' && hasEntries ? (
            <div className="void-chat-input__persona-search">
              <input
                ref={searchRef}
                type="text"
                className="void-chat-input__persona-search-input"
                value={query}
                placeholder={tCommon('customization.composerPersona.searchPlaceholder')}
                aria-label={tCommon('customization.composerPersona.searchPlaceholder')}
                onClick={event => event.stopPropagation()}
                onChange={event => setQuery(event.target.value)}
              />
            </div>
          ) : null}
          {status === 'unsupported' ? (
            <div
              className="void-chat-input__boost-submenu-empty"
              data-testid="composer-persona-runtime-unsupported"
            >
              {tCommon('customization.composerPersona.unsupportedWeb')}
            </div>
          ) : loading ? (
            <div className="void-chat-input__boost-submenu-loading">
              <span>{tCommon('customization.composerPersona.loading')}</span>
            </div>
          ) : status === 'error' ? (
            <div className="void-chat-input__boost-submenu-empty">
              {tCommon('customization.composerPersona.loadFailed')}
            </div>
          ) : !hasEntries ? (
            <div className="void-chat-input__boost-submenu-empty">
              {tCommon('customization.composerPersona.empty')}
            </div>
          ) : !hasVisibleEntries ? (
            <div className="void-chat-input__boost-submenu-empty">
              {tCommon('customization.composerPersona.noMatches')}
            </div>
          ) : (
            <div className="void-chat-input__persona-list">
              {visibleAgents.length > 0 ? (
                <section className="void-chat-input__persona-section">
                  <div className="void-chat-input__persona-section-title">
                    {tCommon('customization.composerPersona.agents')}
                  </div>
                  {visibleAgents.map(renderAgent)}
                </section>
              ) : null}
              {visibleTeams.length > 0 ? (
                <section className="void-chat-input__persona-section">
                  <div className="void-chat-input__persona-section-title">
                    {tCommon('customization.composerPersona.teams')}
                  </div>
                  {visibleTeams.map(renderTeam)}
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
                closeMenu();
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
