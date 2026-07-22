/**
 * SettingsNav — scene-specific left-side navigation for the Settings scene.
 *
 * Layout:
 *   ┌──────────────────────┐
 *   │  Settings            │  header: title
 *   ├──────────────────────┤
 *   │  Search…             │  filter config tabs
 *   ├──────────────────────┤
 *   │  Category / results  │
 *   └──────────────────────┘
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { i18n as I18nApi } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Search as SearchIcon, X } from 'lucide-react';
import { Search, Badge } from '@/component-library';
import { useSettingsStore } from './settingsStore';
import { SETTINGS_CATEGORIES } from './settingsConfig';
import type { ConfigTab } from './settingsConfig';
import { SETTINGS_TAB_SEARCH_CONTENT } from './settingsTabSearchContent';
import './SettingsNav.scss';

const SEARCH_DEBOUNCE_MS = 150;
type SettingsT = (key: string, options?: Record<string, unknown>) => unknown;

export interface SettingsSearchRow {
  tabId: ConfigTab;
  categoryId: string;
  categoryLabel: string;
  tabLabel: string;
  description: string;
  haystack: string;
}

function resolveTabPageContentHaystack(i18n: I18nApi, tabId: ConfigTab): string {
  const phrases = SETTINGS_TAB_SEARCH_CONTENT[tabId];
  if (!phrases?.length) return '';
  const lang = i18n.language;
  const parts: string[] = [];
  for (const { ns, key } of phrases) {
    const tNs = i18n.getFixedT(lang, ns);
    const text = tNs(key, { defaultValue: '' });
    if (typeof text === 'string' && text.trim()) {
      parts.push(text);
    }
  }
  return parts.join(' ');
}

function translateString(t: SettingsT, key: string, defaultValue: string): string {
  const value = t(key, { defaultValue });
  return typeof value === 'string' ? value : defaultValue;
}

function readSearchAliases(t: SettingsT, tabId: ConfigTab): string[] {
  const aliases = t(`configCenter.searchAliases.${tabId}`, {
    defaultValue: [],
    returnObjects: true,
  });
  return Array.isArray(aliases)
    ? aliases.filter((alias): alias is string => typeof alias === 'string')
    : [];
}

function buildSettingsSearchIndex(
  t: SettingsT,
  i18n: I18nApi
): SettingsSearchRow[] {
  const rows: SettingsSearchRow[] = [];
  for (const cat of SETTINGS_CATEGORIES) {
    const categoryLabel = translateString(t, cat.nameKey, cat.id);
    for (const tabDef of cat.tabs) {
      const tabLabel = translateString(t, tabDef.labelKey, tabDef.id);
      const description = tabDef.descriptionKey
        ? translateString(t, tabDef.descriptionKey, '')
        : '';
      const kw = (tabDef.keywords ?? []).join(' ');
      const aliases = readSearchAliases(t, tabDef.id).join(' ');
      const pageContent = resolveTabPageContentHaystack(i18n, tabDef.id);
      const haystack = [categoryLabel, tabLabel, description, kw, aliases, tabDef.id, pageContent]
        .join(' ')
        .toLowerCase();
      rows.push({
        tabId: tabDef.id,
        categoryId: cat.id,
        categoryLabel,
        tabLabel,
        description,
        haystack,
      });
    }
  }
  return rows;
}

function useSettingsSearch(
  t: (key: string, options?: Record<string, unknown>) => string,
  i18n: I18nApi,
  debouncedQuery: string
): SettingsSearchRow[] {
  const index = useMemo(
    () => buildSettingsSearchIndex(t, i18n),
    [t, i18n]
  );

  return useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return [];
    return index.filter((row) => row.haystack.includes(q));
  }, [index, debouncedQuery]);
}

function highlightFirstMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const qi = q.toLowerCase();
  const idx = lower.indexOf(qi);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="void-settings-nav__search-highlight">
        {text.slice(idx, idx + qi.length)}
      </mark>
      {text.slice(idx + qi.length)}
    </>
  );
}

function useSettingsNav() {
  const { t, i18n } = useTranslation('settings');
  const activeTab = useSettingsStore((s) => s.activeTab);
  const setActiveTab = useSettingsStore((s) => s.setActiveTab);
  const searchQuery = useSettingsStore((s) => s.searchQuery);
  const setSearchQuery = useSettingsStore((s) => s.setSearchQuery);

  const [draftQuery, setDraftQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const [isCompactSearchOpen, setIsCompactSearchOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isCompactSearchOpen) return;

    const frameId = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isCompactSearchOpen]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearchQuery(draftQuery);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [draftQuery, setSearchQuery]);

  const results = useSettingsSearch(t, i18n, searchQuery);
  const isSearchMode = draftQuery.trim().length > 0;

  useEffect(() => {
    setHighlightedIndex((prev) => {
      if (results.length === 0) return -1;
      if (prev >= results.length) return results.length - 1;
      return prev;
    });
  }, [results.length]);

  /** Sync store / highlight when library Search clears via button or Escape (after onChange). */
  const handleSearchComponentClear = useCallback(() => {
    setSearchQuery('');
    setHighlightedIndex(-1);
  }, [setSearchQuery]);

  const resetSearch = useCallback(() => {
    setDraftQuery('');
    setSearchQuery('');
    setHighlightedIndex(-1);
  }, [setSearchQuery]);

  const focusSearchInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, []);

  const closeCompactSearch = useCallback(() => {
    resetSearch();
    setIsCompactSearchOpen(false);
    window.requestAnimationFrame(() => {
      searchTriggerRef.current?.focus();
    });
  }, [resetSearch]);

  const handleCompactSearchToggle = useCallback(() => {
    if (isCompactSearchOpen) {
      closeCompactSearch();
      return;
    }
    setIsCompactSearchOpen(true);
  }, [closeCompactSearch, isCompactSearchOpen]);

  const resetAndRefocusVisibleSearch = useCallback(() => {
    resetSearch();
    focusSearchInput();
  }, [focusSearchInput, resetSearch]);

  const activateTab = useCallback(
    (tab: ConfigTab) => {
      setActiveTab(tab);
      if (isCompactSearchOpen) {
        closeCompactSearch();
      } else {
        resetAndRefocusVisibleSearch();
      }
    },
    [
      closeCompactSearch,
      isCompactSearchOpen,
      resetAndRefocusVisibleSearch,
      setActiveTab,
    ]
  );

  const handleTabClick = useCallback(
    (tab: ConfigTab) => {
      setActiveTab(tab);
    },
    [setActiveTab]
  );

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (draftQuery.length > 0) {
          resetAndRefocusVisibleSearch();
        } else if (isCompactSearchOpen) {
          closeCompactSearch();
        } else {
          resetAndRefocusVisibleSearch();
        }
        return;
      }
      if (e.key === 'ArrowDown' && results.length > 0) {
        e.preventDefault();
        setHighlightedIndex(0);
        queueMicrotask(() => resultsRef.current?.focus());
        return;
      }
      if (e.key === 'Enter' && results.length === 1) {
        e.preventDefault();
        activateTab(results[0].tabId);
      }
    },
    [
      activateTab,
      closeCompactSearch,
      draftQuery.length,
      isCompactSearchOpen,
      resetAndRefocusVisibleSearch,
      results,
      resultsRef,
    ]
  );

  const handleResultsKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isSearchMode || results.length === 0) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        resetAndRefocusVisibleSearch();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, results.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) => {
          if (i <= 0) {
            searchInputRef.current?.focus();
            return -1;
          }
          return i - 1;
        });
        return;
      }
      if (e.key === 'Enter' && highlightedIndex >= 0 && highlightedIndex < results.length) {
        e.preventDefault();
        activateTab(results[highlightedIndex].tabId);
      }
    },
    [
      activateTab,
      highlightedIndex,
      isSearchMode,
      resetAndRefocusVisibleSearch,
      results,
    ]
  );

  const displayQuery = searchQuery.trim();

  return {
    t,
    activeTab,
    handleTabClick,
    draftQuery,
    setDraftQuery,
    searchInputRef,
    searchTriggerRef,
    isCompactSearchOpen,
    handleCompactSearchToggle,
    resultsRef,
    results,
    isSearchMode,
    displayQuery,
    highlightedIndex,
    setHighlightedIndex,
    handleSearchComponentClear,
    activateTab,
    handleSearchKeyDown,
    handleResultsKeyDown,
  };
}

const SettingsNav: React.FC = () => {
  const {
    t,
    activeTab,
    handleTabClick,
    draftQuery,
    setDraftQuery,
    searchInputRef,
    searchTriggerRef,
    isCompactSearchOpen,
    handleCompactSearchToggle,
    resultsRef,
    results,
    isSearchMode,
    displayQuery,
    highlightedIndex,
    setHighlightedIndex,
    handleSearchComponentClear,
    activateTab,
    handleSearchKeyDown,
    handleResultsKeyDown,
  } = useSettingsNav();
  const searchLabel = t('configCenter.searchPlaceholder');

  return (
    <div
      className={[
        'void-settings-nav',
        isCompactSearchOpen && 'is-compact-search-open',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="void-settings-nav__header">
        <span className="void-settings-nav__title">
          {t('configCenter.title', { defaultValue: t('title', { defaultValue: 'Settings' }) })}
        </span>
        <button
          ref={searchTriggerRef}
          type="button"
          className="void-settings-nav__search-trigger"
          aria-label={searchLabel}
          title={searchLabel}
          aria-expanded={isCompactSearchOpen}
          aria-controls="settings-nav-search"
          onClick={handleCompactSearchToggle}
        >
          {isCompactSearchOpen
            ? <X size={14} aria-hidden="true" />
            : <SearchIcon size={14} aria-hidden="true" />}
        </button>
      </div>

      <div id="settings-nav-search" className="void-settings-nav__search">
        <Search
          ref={searchInputRef}
          className="void-settings-nav__search-field"
          size="small"
          value={draftQuery}
          onChange={setDraftQuery}
          onClear={handleSearchComponentClear}
          onKeyDown={handleSearchKeyDown}
          enterToSearch={false}
          placeholder={searchLabel}
          inputAriaLabel={searchLabel}
          ariaControls="settings-nav-results"
          ariaExpanded={isSearchMode}
          clearable
        />
      </div>

      <div
        ref={resultsRef}
        id="settings-nav-results"
        className="void-settings-nav__sections"
        role={isSearchMode ? 'listbox' : undefined}
        tabIndex={isSearchMode && results.length > 0 ? 0 : undefined}
        onKeyDown={handleResultsKeyDown}
        aria-activedescendant={
          isSearchMode && highlightedIndex >= 0
            ? `settings-nav-result-${results[highlightedIndex]?.tabId}`
            : undefined
        }
      >
        {isSearchMode ? (
          <>
            {results.length === 0 ? (
              <div className="void-settings-nav__search-empty" role="status">
                {t('configCenter.searchNoResults')}
              </div>
            ) : (
              <div className="void-settings-nav__search-results">
                {results.map((row, index) => {
                  const line = `${row.categoryLabel} › ${row.tabLabel}`;
                  const active = activeTab === row.tabId;
                  const highlighted = highlightedIndex === index;
                  return (
                    <button
                      key={row.tabId}
                      type="button"
                      id={`settings-nav-result-${row.tabId}`}
                      role="option"
                      aria-selected={active}
                      className={[
                        'void-settings-nav__search-result-item',
                        active && 'is-active',
                        highlighted && 'is-highlighted',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => activateTab(row.tabId)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                    >
                      <span className="void-settings-nav__search-result-line">
                        {highlightFirstMatch(line, displayQuery)}
                      </span>
                      {row.description ? (
                        <span className="void-settings-nav__search-result-desc">
                          {highlightFirstMatch(row.description, displayQuery)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          SETTINGS_CATEGORIES.map((category) => (
            <div key={category.id} className="void-settings-nav__category">
              <div className="void-settings-nav__category-header">
                <span className="void-settings-nav__category-label">
                  {t(category.nameKey, { defaultValue: category.id })}
                </span>
              </div>

              <div className="void-settings-nav__items">
                {category.tabs.map((tabDef) => (
                  <button
                    key={tabDef.id}
                    type="button"
                    className={[
                      'void-settings-nav__item',
                      activeTab === tabDef.id && 'is-active',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => handleTabClick(tabDef.id)}
                  >
                    <span className="void-settings-nav__item-label">
                      {t(tabDef.labelKey, { defaultValue: tabDef.id })}
                    </span>
                    {tabDef.beta ? (
                      <Badge variant="warning" className="void-settings-nav__item-beta">
                        {t('configCenter.beta')}
                      </Badge>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SettingsNav;
