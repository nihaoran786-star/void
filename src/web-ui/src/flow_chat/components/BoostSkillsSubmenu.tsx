import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { ModeSkillInfo } from '@/infrastructure/config/types';

export interface BoostSkillsSubmenuProps {
  skills: readonly ModeSkillInfo[];
  loading: boolean;
  onSelectSkill: (skillName: string) => void;
  onOpenLibrary: () => void;
}

export const BoostSkillsSubmenu: React.FC<BoostSkillsSubmenuProps> = ({
  skills,
  loading,
  onSelectSkill,
  onOpenLibrary,
}) => {
  const { t } = useTranslation('components');
  const menuId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [opensLeft, setOpensLeft] = useState(false);
  const [opensUp, setOpensUp] = useState(false);

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
      setOpensLeft(rect.right + 260 > window.innerWidth - 8);
      setOpensUp(rect.top + 200 > window.innerHeight - 8);
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
        hostRef.current?.querySelectorAll<HTMLElement>('[data-skills-flyout-item]') ?? [],
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
      hostRef.current?.querySelectorAll<HTMLElement>('[data-skills-flyout-item]') ?? [],
    );
    if (items.length === 0) {
      return;
    }

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
          <Sparkles size={14} className="void-chat-input__boost-context-icon" aria-hidden />
          <span>{t('chatInput.boostSkills')}</span>
        </span>
        <ChevronRight size={14} className="void-chat-input__boost-submenu-chevron" aria-hidden />
      </button>
      <div
        id={menuId}
        className={[
          'void-chat-input__boost-submenu-shell',
          open ? 'void-chat-input__boost-submenu-shell--open' : '',
          opensLeft ? 'void-chat-input__boost-submenu-shell--left' : '',
          opensUp ? 'void-chat-input__boost-submenu-shell--up' : '',
        ].filter(Boolean).join(' ')}
        onMouseEnter={openMenu}
        onMouseLeave={closeMenu}
      >
        <div
          className="void-chat-input__boost-submenu-panel"
          role="menu"
          aria-label={t('chatInput.boostSkills')}
        >
          {loading ? (
            <div className="void-chat-input__boost-submenu-loading">
              <Loader2 size={14} className="void-chat-input__boost-submenu-spinner" aria-hidden />
              <span>{t('chatInput.boostSkillsLoading')}</span>
            </div>
          ) : skills.length === 0 ? (
            <div className="void-chat-input__boost-submenu-empty">
              {t('chatInput.boostSkillsEmpty')}
            </div>
          ) : (
            <div className="void-chat-input__boost-submenu-list">
              {skills.map(skill => (
                <button
                  key={skill.key}
                  type="button"
                  role="menuitem"
                  data-skills-flyout-item
                  className="void-chat-input__boost-submenu-item"
                  title={skill.description || skill.name}
                  onClick={event => {
                    event.stopPropagation();
                    closeImmediately();
                    onSelectSkill(skill.name);
                  }}
                >
                  <Sparkles size={12} className="void-chat-input__boost-submenu-item-icon" aria-hidden />
                  <span className="void-chat-input__boost-submenu-item-name">{skill.name}</span>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            data-skills-flyout-item
            className="void-chat-input__boost-submenu-manage"
            onClick={event => {
              event.stopPropagation();
              closeImmediately();
              onOpenLibrary();
            }}
          >
            {t('chatInput.openSkillsLibrary')}
          </button>
        </div>
      </div>
    </div>
  );
};

BoostSkillsSubmenu.displayName = 'BoostSkillsSubmenu';

export default BoostSkillsSubmenu;
