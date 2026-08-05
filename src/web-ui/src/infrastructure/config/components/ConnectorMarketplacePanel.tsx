import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  FolderOpen,
  Globe2,
  LayoutGrid,
  ListTree,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Button, Input, Modal, Search, ToolProcessingDots } from '@/component-library';
import { useI18n } from '@/infrastructure/i18n';
import {
  buildConnectorInstallPlan,
  listConnectorMarketplaceEntries,
  type ConnectorFieldValues,
  type ConnectorMarketplaceCategory,
  type ConnectorMarketplaceEntry,
} from '@/shared/services/customization';
import {
  McpConnectorInstallError,
  mcpConnectorInstaller,
  type McpConnectorInstallResult,
} from '../services/McpConnectorInstaller';
import ConnectorCatalogAvatar from './ConnectorCatalogAvatar';
import './ConnectorMarketplacePanel.scss';

type InstallPhase = 'idle' | 'installing' | 'success' | 'error';

interface ConnectorInstallViewState {
  phase: InstallPhase;
  message?: string;
}

export interface ConnectorMarketplaceInstaller {
  install(plan: ReturnType<typeof buildConnectorInstallPlan>): Promise<McpConnectorInstallResult>;
}

export interface ConnectorMarketplacePanelProps {
  installedIds: ReadonlySet<string>;
  onInstalled: () => void | Promise<void>;
  installer?: ConnectorMarketplaceInstaller;
}

const MARKET_PAGE_SIZE = 8;

const MARKET_CATEGORIES: readonly ConnectorMarketplaceCategory[] = [
  'all',
  'knowledge',
  'reasoning',
  'files',
  'development',
  'productivity',
  'browser',
];

const MARKET_CATEGORY_ICONS: Record<ConnectorMarketplaceCategory, LucideIcon> = {
  all: LayoutGrid,
  knowledge: Brain,
  reasoning: ListTree,
  files: FolderOpen,
  development: Code2,
  productivity: Zap,
  browser: Globe2,
};

const ConnectorMarketplacePanel: React.FC<ConnectorMarketplacePanelProps> = ({
  installedIds,
  onInstalled,
  installer = mcpConnectorInstaller,
}) => {
  const { t } = useI18n('settings/mcp');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ConnectorMarketplaceCategory>('all');
  const [page, setPage] = useState(0);
  const [formEntry, setFormEntry] = useState<ConnectorMarketplaceEntry | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [installStates, setInstallStates] = useState<Record<string, ConnectorInstallViewState>>({});
  const [refreshWarnings, setRefreshWarnings] = useState<Record<string, string>>({});

  const entries = useMemo(() => listConnectorMarketplaceEntries({
    search,
    category,
    resolveText: t,
  }), [category, search, t]);
  const totalPages = Math.max(1, Math.ceil(entries.length / MARKET_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pagedEntries = entries.slice(
    currentPage * MARKET_PAGE_SIZE,
    (currentPage + 1) * MARKET_PAGE_SIZE,
  );

  const updateSearch = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  const updateCategory = (value: ConnectorMarketplaceCategory) => {
    setCategory(value);
    setPage(0);
  };

  const errorMessage = (error: unknown): string => {
    if (!(error instanceof McpConnectorInstallError)) {
      return error instanceof Error ? error.message : t('catalog.market.errors.unknown');
    }
    const keys: Record<McpConnectorInstallError['code'], string> = {
      invalid_config: 'catalog.market.errors.invalidConfig',
      already_installed: 'catalog.market.errors.alreadyInstalled',
      runtime_unavailable: 'catalog.market.errors.runtimeUnavailable',
      save_failed: 'catalog.market.errors.saveFailed',
      initialize_failed: 'catalog.market.errors.initializeFailed',
      verification_failed: 'catalog.market.errors.verificationFailed',
      rollback_failed: 'catalog.market.errors.rollbackFailed',
    };
    return t(keys[error.code], {
      command: error.message.match(/"([^"]+)"/)?.[1] ?? '',
      detail: error.message,
    });
  };

  const runInstall = async (
    entry: ConnectorMarketplaceEntry,
    values: ConnectorFieldValues = {},
  ) => {
    if (installedIds.has(entry.id) || installStates[entry.id]?.phase === 'installing') return;
    setInstallStates(current => ({
      ...current,
      [entry.id]: { phase: 'installing' },
    }));
    setRefreshWarnings(current => {
      const next = { ...current };
      delete next[entry.id];
      return next;
    });
    try {
      await installer.install(buildConnectorInstallPlan(entry, values));
    } catch (error) {
      setInstallStates(current => ({
        ...current,
        [entry.id]: { phase: 'error', message: errorMessage(error) },
      }));
      return;
    }

    setInstallStates(current => ({
      ...current,
      [entry.id]: { phase: 'success', message: t('catalog.market.status.installed') },
    }));
    setFormEntry(null);
    setFieldValues({});
    setFieldErrors({});
    try {
      await onInstalled();
    } catch {
      setRefreshWarnings(current => ({
        ...current,
        [entry.id]: t('catalog.market.status.refreshWarning'),
      }));
    }
  };

  const beginInstall = (entry: ConnectorMarketplaceEntry) => {
    if (entry.fields.length === 0) {
      void runInstall(entry);
      return;
    }
    setFormEntry(entry);
    setFieldValues({});
    setFieldErrors({});
  };

  const submitForm = () => {
    if (!formEntry) return;
    const nextErrors: Record<string, string> = {};
    formEntry.fields.forEach((field) => {
      if (!fieldValues[field.id]?.trim()) {
        nextErrors[field.id] = t('catalog.market.fields.required');
      }
    });
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    void runInstall(formEntry, fieldValues);
  };

  return (
    <div className="void-connector-market">
      <div className="void-connector-market__toolbar">
        <Search
          value={search}
          onChange={updateSearch}
          onClear={() => updateSearch('')}
          placeholder={t('catalog.market.searchPlaceholder')}
          inputAriaLabel={t('catalog.market.searchPlaceholder')}
          size="small"
          clearable
        />
        <div
          className="void-connector-market__categories"
          role="group"
          aria-label={t('catalog.market.categoryLabel')}
        >
          {MARKET_CATEGORIES.map((item) => {
            const CategoryIcon = MARKET_CATEGORY_ICONS[item];
            return (
              <button
                key={item}
                type="button"
                className={`void-connector-market__category ${category === item ? 'is-active' : ''}`}
                aria-pressed={category === item}
                onClick={() => updateCategory(item)}
              >
                <CategoryIcon size={14} strokeWidth={1.8} aria-hidden="true" />
                <span>{t(`catalog.market.categories.${item}`)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {pagedEntries.length === 0 ? (
        <div className="void-connector-market__empty">
          {t('catalog.market.empty')}
        </div>
      ) : (
        <div className="void-connector-market__grid" aria-live="polite">
          {pagedEntries.map((entry) => {
            const isInstalled = installedIds.has(entry.id)
              || installStates[entry.id]?.phase === 'success';
            const state = installStates[entry.id] ?? { phase: 'idle' as const };
            const refreshWarning = refreshWarnings[entry.id];
            const isInstalling = state.phase === 'installing';
            return (
              <article
                key={entry.id}
                className="void-connector-market__card"
                aria-busy={isInstalling || undefined}
              >
                <div className="void-connector-market__identity">
                  <ConnectorCatalogAvatar
                    identity={entry.id}
                    name={t(entry.nameKey)}
                    transport={entry.kind === 'local-command'
                      ? entry.runtimeCommand
                      : entry.transport}
                    className="void-connector-market__avatar"
                  />
                  <div className="void-connector-market__copy">
                    <strong>{t(entry.nameKey)}</strong>
                    <span>{t(entry.descriptionKey)}</span>
                  </div>
                </div>
                <div className="void-connector-market__meta" aria-label={entry.id}>
                  <code>{entry.id}</code>
                  <span>{entry.kind === 'local-command'
                    ? t('catalog.market.types.localCommand', {
                      command: entry.runtimeCommand,
                    })
                    : t('catalog.market.types.remoteHttps')}</span>
                </div>
                <Button
                  variant={isInstalled ? 'secondary' : 'primary'}
                  size="small"
                  disabled={isInstalled || isInstalling}
                  onClick={() => beginInstall(entry)}
                  aria-label={isInstalled
                    ? t('catalog.market.actions.installedLabel', { name: t(entry.nameKey) })
                    : t('catalog.market.actions.installLabel', { name: t(entry.nameKey) })}
                >
                  {isInstalling ? <ToolProcessingDots size={14} /> : isInstalled ? (
                    <Check size={14} />
                  ) : (
                    <Download size={14} />
                  )}
                  {isInstalling
                    ? t('catalog.market.actions.installing')
                    : isInstalled
                      ? t('catalog.market.actions.installed')
                      : t('catalog.market.actions.install')}
                </Button>
                {state.phase === 'error' && (
                  <div className="void-connector-market__status is-error" role="alert">
                    <AlertTriangle size={14} aria-hidden="true" />
                    <span>{state.message}</span>
                  </div>
                )}
                {refreshWarning && (
                  <div
                    className="void-connector-market__status is-warning"
                    role="status"
                    aria-live="polite"
                  >
                    <AlertTriangle size={14} aria-hidden="true" />
                    <span>{refreshWarning}</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="void-connector-market__pagination">
          <button
            type="button"
            onClick={() => setPage(value => Math.max(0, value - 1))}
            disabled={currentPage === 0}
            aria-label={t('catalog.market.pagination.previous')}
          >
            <ChevronLeft size={14} />
          </button>
          <span>{t('catalog.market.pagination.position', {
            current: currentPage + 1,
            total: totalPages,
          })}</span>
          <button
            type="button"
            onClick={() => setPage(value => Math.min(totalPages - 1, value + 1))}
            disabled={currentPage >= totalPages - 1}
            aria-label={t('catalog.market.pagination.next')}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      <Modal
        isOpen={!!formEntry}
        onClose={() => {
          if (formEntry && installStates[formEntry.id]?.phase === 'installing') return;
          setFormEntry(null);
          setFieldErrors({});
        }}
        title={formEntry ? t('catalog.market.configureTitle', { name: t(formEntry.nameKey) }) : ''}
        size="small"
        closeOnOverlayClick={!formEntry || installStates[formEntry.id]?.phase !== 'installing'}
        showCloseButton={!formEntry || installStates[formEntry.id]?.phase !== 'installing'}
      >
        {formEntry && (
          <div className="void-connector-market__form">
            <p>{t('catalog.market.configureDescription')}</p>
            <div className="void-connector-market__permission">
              <strong>{t('catalog.market.permissions.title')}</strong>
              {formEntry.kind === 'local-command' ? (
                <>
                  <span>{t('catalog.market.permissions.localCommand', {
                    command: formEntry.runtimeCommand,
                  })}</span>
                  <span>{t('catalog.market.permissions.scopedPath')}</span>
                </>
              ) : (
                <span>{t('catalog.market.permissions.remoteHttps', {
                  url: formEntry.template.url,
                })}</span>
              )}
            </div>
            {formEntry.fields.map(field => (
              <Input
                key={field.id}
                value={fieldValues[field.id] ?? ''}
                onChange={event => {
                  setFieldValues(current => ({ ...current, [field.id]: event.target.value }));
                  setFieldErrors(current => ({ ...current, [field.id]: '' }));
                }}
                label={t(field.labelKey)}
                placeholder={t(field.placeholderKey)}
                hint={t(field.hintKey)}
                error={!!fieldErrors[field.id]}
                errorMessage={fieldErrors[field.id]}
                disabled={installStates[formEntry.id]?.phase === 'installing'}
                autoFocus
              />
            ))}
            {installStates[formEntry.id]?.phase === 'error' && (
              <div className="void-connector-market__form-error" role="alert">
                <AlertTriangle size={14} aria-hidden="true" />
                {installStates[formEntry.id]?.message}
              </div>
            )}
            <div className="void-connector-market__form-actions">
              <Button
                variant="secondary"
                onClick={() => setFormEntry(null)}
                disabled={installStates[formEntry.id]?.phase === 'installing'}
              >
                {t('actions.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={submitForm}
                disabled={installStates[formEntry.id]?.phase === 'installing'}
              >
                {installStates[formEntry.id]?.phase === 'installing'
                  ? <ToolProcessingDots size={14} />
                  : <Download size={14} />}
                {installStates[formEntry.id]?.phase === 'installing'
                  ? t('catalog.market.actions.installing')
                  : t('catalog.market.actions.install')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ConnectorMarketplacePanel;
