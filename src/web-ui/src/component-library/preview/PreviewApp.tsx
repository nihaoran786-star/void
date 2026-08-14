/**
 * Component preview app
 */

import React, { useMemo, useState } from 'react';
import { componentRegistry } from '../components/registry';
import type { ComponentCategory } from '../types';
import { FullPageLayout, LargeCardLayout, GridLayout, DemoLayout, ColumnLayout } from './layouts';
import { Select } from '@components/Select';
import type { SelectOption } from '@components/Select';
import { useI18n } from '@/infrastructure/i18n';
import { builtinThemes, themeService } from '@/infrastructure/theme';
import type { ThemeConfig, ThemeId } from '@/infrastructure/theme';
import { flowChatDynamicCategory } from './FlowChatDynamicCategory';
import './preview.css';

const previewRegistry = [...componentRegistry, flowChatDynamicCategory];

const getInitialCategory = (): string => {
  const requestedCategory = new URLSearchParams(window.location.search).get('category');
  if (requestedCategory && previewRegistry.some((category) => category.id === requestedCategory)) {
    return requestedCategory;
  }
  return previewRegistry[0]?.id || '';
};

export const PreviewApp: React.FC = () => {
  const { t } = useI18n('components');
  const [themeId, setThemeId] = useState<ThemeId>('void-light');
  const themes = builtinThemes;
  const themeType = themes.find((theme) => theme.id === themeId)?.type ?? 'light';
  const loading = false;
  const [selectedCategory, setSelectedCategory] = useState<string>(getInitialCategory);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    const url = new URL(window.location.href);
    url.searchParams.set('category', categoryId);
    window.history.replaceState(null, '', url);
  };

  const currentCategory = previewRegistry.find(
    (cat) => cat.id === selectedCategory
  );
  const themeTypeLabel = themeType === 'light'
    ? t('componentLibrary.previewApp.themeTypeLight')
    : t('componentLibrary.previewApp.themeTypeDark');
  const themeOptions = useMemo<SelectOption[]>(
    () =>
      themes.map((theme) => ({
        label: theme.name,
        value: theme.id,
        description: theme.type === 'light'
          ? t('componentLibrary.previewApp.themeDescriptionLight')
          : t('componentLibrary.previewApp.themeDescriptionDark'),
      })),
    [t, themes]
  );

  return (
    <div className="preview-app">
      <header className="preview-header">
        <div className="preview-logo">
          <h1>{t('componentLibrary.previewApp.title')}</h1>
          <span className="preview-version">v0.2.8</span>
        </div>
        <div className="preview-header-actions">
          <label className="preview-theme-selector">
            <span className="preview-theme-selector__label">
              {t('componentLibrary.previewApp.themeLabel')}
            </span>
            <div className="preview-theme-selector__control">
              <Select
                className="preview-theme-selector__select-component"
                size="small"
                value={themeId ?? ''}
                options={themeOptions}
                onChange={(value) => {
                  if (Array.isArray(value)) {
                    return;
                  }
                  const nextTheme = themes.find((theme) => theme.id === value);
                  if (!nextTheme) return;
                  setThemeId(value as ThemeId);
                  (themeService as unknown as { injectCSSVariables: (theme: ThemeConfig) => void })
                    .injectCSSVariables(nextTheme);
                  document.documentElement.dataset.theme = String(nextTheme.id);
                  document.documentElement.dataset.themeType = nextTheme.type;
                }}
                disabled={loading || themes.length === 0}
                placement="bottom"
              />
              <span className={`preview-theme-selector__badge preview-theme-selector__badge--${themeType}`}>
                {themeTypeLabel}
              </span>
            </div>
          </label>
        </div>
      </header>

      <div className="preview-container">
        <aside className={`preview-sidebar ${isSidebarCollapsed ? 'preview-sidebar--collapsed' : ''}`}>
          <div className="preview-sidebar-header">
            {!isSidebarCollapsed && (
              <span className="preview-sidebar-title">
                {t('componentLibrary.previewApp.sidebarTitle')}
              </span>
            )}
            <button
              type="button"
              className="preview-sidebar-toggle"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              aria-label={isSidebarCollapsed
                ? t('componentLibrary.previewApp.expandSidebar')
                : t('componentLibrary.previewApp.collapseSidebar')}
              title={isSidebarCollapsed
                ? t('componentLibrary.previewApp.expandSidebar')
                : t('componentLibrary.previewApp.collapseSidebar')}
            >
              <span className={`preview-sidebar-toggle__icon ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M9 2.5L4.5 7L9 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
          </div>
          <nav className="preview-nav">
            {previewRegistry.map((category: ComponentCategory) => (
              <div key={category.id} className="category-section">
                <button
                  className={`category-button ${
                    selectedCategory === category.id ? 'active' : ''
                  }`}
                  onClick={() => handleCategorySelect(category.id)}
                  title={category.name}
                >
                  <span className="category-button__dot" />
                  <span className="category-name">
                    {isSidebarCollapsed ? category.name.slice(0, 2) : category.name}
                  </span>
                  {!isSidebarCollapsed && (
                    <span className="component-count">
                      {category.components.length}
                    </span>
                  )}
                </button>
              </div>
            ))}
          </nav>
        </aside>

        <main className={`preview-main ${currentCategory?.layoutType === 'full-page' ? 'preview-main--full' : ''}`}>
          {currentCategory ? (
            <>
              {currentCategory.layoutType !== 'full-page' && (
                <div className="component-header">
                  <h2 className="component-title">{currentCategory.name}</h2>
                  <p className="component-description">
                    {currentCategory.description}
                  </p>
                </div>
              )}

              {currentCategory.layoutType === 'full-page' ? (
                <FullPageLayout components={currentCategory.components} />
              ) : currentCategory.layoutType === 'large-card' ? (
                <LargeCardLayout components={currentCategory.components} />
              ) : currentCategory.layoutType === 'demo' ? (
                <DemoLayout
                  components={currentCategory.components}
                  containerWidthControl={currentCategory.id === 'flowchat-dynamic-ui'}
                />
              ) : currentCategory.layoutType === 'column' ? (
                <ColumnLayout components={currentCategory.components} />
              ) : currentCategory.layoutType === 'grid-2' ? (
                <GridLayout components={currentCategory.components} columns={2} />
              ) : currentCategory.layoutType === 'grid-4' ? (
                <GridLayout components={currentCategory.components} columns={4} />
              ) : (
                <GridLayout components={currentCategory.components} columns={3} />
              )}
            </>
          ) : (
            <div className="empty-state">
              <p>{t('componentLibrary.previewApp.emptyState')}</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
