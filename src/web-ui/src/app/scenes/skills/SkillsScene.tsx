import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Filter,
  FolderOpen,
  Pencil,
  Package,
  Puzzle,
  ShieldAlert,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, ConfirmDialog, Input, Modal, Search, Select } from '@/component-library';
import {
  DirectoryTopBar,
  GalleryDetailModal,
  type DirectoryChipGroup,
} from '@/app/components';
import CatalogPagination from '@/app/components/CatalogPagination';
import type { SkillInfo, SkillLevel, SkillMarketItem } from '@/infrastructure/config/types';
import { workspaceAPI } from '@/infrastructure/api';
import { workspaceManager } from '@/infrastructure/services/business/workspaceManager';
import { useNotification } from '@/shared/notification-system';
import { isRemoteWorkspace } from '@/shared/types';
import { createLogger } from '@/shared/utils/logger';
import { useInstalledSkills } from './hooks/useInstalledSkills';
import { useSkillMarket } from './hooks/useSkillMarket';
import SkillCard, { type SkillCardAction } from './components/SkillCard';
import SkillCatalogAvatar from './components/SkillCatalogAvatar';
import SkillAuthoringPage from './components/SkillAuthoringPage';
import SkillsSuiteView from './components/SkillsSuiteView';
import './SkillsScene.scss';
import { useSkillsSceneStore, type InstalledFilter } from './skillsSceneStore';
import { useGallerySceneAutoRefresh } from '@/app/hooks/useGallerySceneAutoRefresh';
import {
  isMarketSkillInstalled,
  localizeCatalogPresentation,
  presentationForInstalledSkill,
  presentationForMarketSkill,
} from '@/shared/services/customization';
import {
  customizationRuntimeCapabilityService,
  type CustomizationRuntimeCapabilityReader,
} from '@/shared/services/customization/CustomizationRuntimeCapabilityService';

const log = createLogger('SkillsScene');

type SkillTab = 'installed' | 'discover';

const SKILLS_PAGE_SIZE = 20;

interface CategoryInfo {
  id: InstalledFilter;
  labelKey: string;
  descKey: string;
}

const CATEGORIES: CategoryInfo[] = [
  { id: 'all', labelKey: 'filters.all', descKey: 'categories.all' },
  { id: 'builtin', labelKey: 'filters.builtin', descKey: 'categories.builtin' },
  { id: 'user', labelKey: 'filters.user', descKey: 'categories.user' },
  { id: 'project', labelKey: 'filters.project', descKey: 'categories.project' },
  { id: 'suite', labelKey: 'filters.suite', descKey: 'categories.suite' },
];

interface SupportedSkillsSceneProps {
  canManage: boolean;
  capabilityService: CustomizationRuntimeCapabilityReader;
}

const SupportedSkillsScene: React.FC<SupportedSkillsSceneProps> = ({
  canManage,
  capabilityService,
}) => {
  const { t } = useTranslation('scenes/skills');
  const notification = useNotification();
  const {
    searchDraft,
    marketQuery,
    installedFilter,
    hideDuplicates,
    isAddFormOpen,
    setSearchDraft,
    submitMarketQuery,
    setInstalledFilter,
    setHideDuplicates,
    setAddFormOpen,
    toggleAddForm,
  } = useSkillsSceneStore();

  const [activeTab, setActiveTab] = useState<SkillTab>('installed');
  const [deleteTarget, setDeleteTarget] = useState<SkillInfo | null>(null);
  const [installedListPage, setInstalledListPage] = useState(0);
  const [installedSearch, setInstalledSearch] = useState('');
  const [authoringTarget, setAuthoringTarget] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; skillKey: string }
    | null
  >(null);
  const [selectedDetail, setSelectedDetail] = useState<
    | { type: 'installed'; skill: SkillInfo }
    | { type: 'market'; skill: SkillMarketItem }
    | null
  >(null);

  const installed = useInstalledSkills({
    searchQuery: installedSearch,
    activeFilter: installedFilter,
  });

  const installedSkillNames = useMemo(
    () => new Set(installed.skills.map((skill) => skill.name)),
    [installed.skills],
  );

  const market = useSkillMarket({
    searchQuery: marketQuery,
    installedSkillNames,
    pageSize: SKILLS_PAGE_SIZE,
    onInstalledChanged: async () => {
      await installed.loadSkills(true);
    },
  });

  const refetchSkillsScene = useCallback(async () => {
    await Promise.all([installed.loadSkills(true), market.refresh()]);
  }, [installed, market]);

  useGallerySceneAutoRefresh({
    sceneId: 'skills',
    refetch: refetchSkillsScene,
  });

  const canRevealSkillPath = !isRemoteWorkspace(workspaceManager.getState().currentWorkspace);

  const handleRevealSkillPath = useCallback(
    async (path: string) => {
      if (!canRevealSkillPath || !path.trim()) {
        return;
      }
      try {
        await workspaceAPI.revealInExplorer(path);
      } catch (error) {
        log.error('Failed to reveal skill path in explorer', { path, error });
        notification.error(t('messages.revealPathFailed', { error: String(error) }));
      }
    },
    [canRevealSkillPath, notification, t],
  );

  const handleAddSkill = async () => {
    const added = await installed.handleAdd();
    if (added) {
      setAddFormOpen(false);
      await market.refresh();
    }
  };

  const selectedInstalledSkill = selectedDetail?.type === 'installed' ? selectedDetail.skill : null;
  const selectedMarketSkill = selectedDetail?.type === 'market' ? selectedDetail.skill : null;
  const selectedInstalledPresentation = selectedInstalledSkill
    ? localizeCatalogPresentation(
        presentationForInstalledSkill(selectedInstalledSkill),
        key => t(key),
      )
    : null;
  const selectedMarketPresentation = selectedMarketSkill
    ? localizeCatalogPresentation(
        presentationForMarketSkill(selectedMarketSkill),
        key => t(key),
      )
    : null;
  const selectedSkillIdentity = selectedInstalledSkill?.key
    ?? selectedMarketSkill?.installId
    ?? selectedMarketSkill?.name
    ?? 'skill';
  const selectedSkillName = selectedInstalledPresentation?.displayName
    ?? selectedMarketPresentation?.displayName
    ?? '';
  const installedFiltered = useMemo(() => {
    const list = hideDuplicates
      ? installed.filteredSkills.filter((s) => !s.isShadowed)
      : installed.filteredSkills;
    return list;
  }, [hideDuplicates, installed.filteredSkills]);

  const installedTotalPages = Math.max(
    1,
    Math.ceil(installedFiltered.length / SKILLS_PAGE_SIZE),
  );
  const currentInstalledPage = Math.min(installedListPage, installedTotalPages - 1);
  const pagedInstalledSkills = installedFiltered.slice(
    currentInstalledPage * SKILLS_PAGE_SIZE,
    (currentInstalledPage + 1) * SKILLS_PAGE_SIZE,
  );

  const isInstalledTab = activeTab === 'installed';
  const isSuiteFilter = isInstalledTab && installedFilter === 'suite';
  const topbarCount = !isInstalledTab
    ? market.totalLoaded
    : isSuiteFilter
      ? (installed.counts.suite ?? 0)
      : installedFiltered.length;

  useEffect(() => {
    setInstalledListPage(0);
  }, [installedFilter, installedSearch, hideDuplicates]);

  useEffect(() => {
    setInstalledListPage((p) => Math.min(p, Math.max(0, installedTotalPages - 1)));
  }, [installedTotalPages]);

  useEffect(() => {
    if (canManage) return;
    setAddFormOpen(false);
    setDeleteTarget(null);
    if (installedFilter === 'suite') {
      setInstalledFilter('all');
    }
  }, [canManage, installedFilter, setAddFormOpen, setInstalledFilter]);

  const handleCatalogTabKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }
    const tabs = Array.from(
      event.currentTarget.closest('[role="tablist"]')
        ?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [],
    );
    if (tabs.length === 0) {
      return;
    }
    event.preventDefault();
    const currentIndex = Math.max(0, tabs.indexOf(event.currentTarget));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    setActiveTab(nextIndex === 0 ? 'installed' : 'discover');
    tabs[nextIndex]?.focus();
  }, [setActiveTab]);

  const topbarGroups: DirectoryChipGroup[] = [
    {
      id: 'catalog',
      label: t('nav.title'),
      mode: 'tabs',
      onChipKeyDown: handleCatalogTabKeyDown,
      chips: [
        {
          id: 'installed',
          label: t('filters.installed'),
          active: isInstalledTab,
          onSelect: () => setActiveTab('installed'),
        },
        {
          id: 'market',
          label: t('filters.market'),
          active: !isInstalledTab,
          onSelect: () => setActiveTab('discover'),
        },
      ],
    },
    ...(isInstalledTab ? [{
      id: 'level',
      label: t('installed.titleAll'),
      mode: 'filters' as const,
      chips: CATEGORIES
        .filter(category => canManage || category.id !== 'suite')
        .map(category => ({
          id: category.id,
          label: t(category.labelKey),
          title: t(category.descKey),
          active: installedFilter === category.id,
          empty: installed.counts[category.id] === 0,
          onSelect: () => setInstalledFilter(category.id),
        })),
    }] : []),
  ];

  if (authoringTarget) {
    return (
      <div className="void-skills-scene" data-customization-market="skills">
        <SkillAuthoringPage
          mode={authoringTarget.mode}
          skillKey={authoringTarget.mode === 'edit' ? authoringTarget.skillKey : undefined}
          onBack={() => setAuthoringTarget(null)}
          onSaved={() => {
            setAuthoringTarget(null);
            void Promise.all([
              installed.loadSkills(true),
              market.refresh(),
            ]);
          }}
          capabilityService={capabilityService}
        />
      </div>
    );
  }

  return (
    <div className="void-skills-scene" data-customization-market="skills">
      <DirectoryTopBar
        title={t('page.title')}
        count={topbarCount}
        mission={t('page.mission')}
        groups={topbarGroups}
        search={!isSuiteFilter && (isInstalledTab ? (
          <Search
            value={installedSearch}
            onChange={setInstalledSearch}
            onClear={() => setInstalledSearch('')}
            placeholder={t('toolbar.searchPlaceholder')}
            size="small"
            clearable
          />
        ) : (
          <Search
            value={searchDraft}
            onChange={setSearchDraft}
            onSearch={submitMarketQuery}
            onClear={submitMarketQuery}
            placeholder={t('market.searchPlaceholder')}
            size="small"
            clearable
            enterToSearch
          />
        ))}
        utilities={isInstalledTab && !isSuiteFilter ? (
          <>
            <button
              type="button"
              className={`directory-topbar__utility${hideDuplicates ? ' is-active' : ''}`}
              onClick={() => setHideDuplicates(!hideDuplicates)}
              aria-pressed={hideDuplicates}
              aria-label={t('toolbar.hideDuplicates')}
              title={t('toolbar.hideDuplicates')}
            >
              <Filter size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="directory-topbar__utility"
              onClick={toggleAddForm}
              disabled={!canManage}
              aria-expanded={isAddFormOpen}
              aria-haspopup="dialog"
              aria-label={t('toolbar.importTooltip')}
              title={t('toolbar.importTooltip')}
            >
              <FolderOpen size={15} aria-hidden="true" />
            </button>
          </>
        ) : null}
        primary={{
          label: t('toolbar.createTooltip'),
          onClick: () => setAuthoringTarget({ mode: 'create' }),
          disabled: !canManage,
        }}
      />
      {!canManage && (
        <div className="skills-runtime-readonly" role="status">
          {t('runtimeReadOnly')}
        </div>
      )}

      <div className="skills-page">

        {activeTab === 'installed' && (
          <div className="skills-installed">
            <div className="skills-main">
              {installedFilter === 'suite' ? (
                <SkillsSuiteView />
              ) : (
                <>
                  {installed.loading && (
                    <div className="skills-main__loading" aria-busy="true" aria-label={t('list.loading')}>
                      {Array.from({ length: SKILLS_PAGE_SIZE }).map((_, i) => (
                        <div
                          key={`ins-sk-${i}`}
                          className="skills-card-skeleton"
                          style={{ '--card-index': i } as React.CSSProperties}
                        />
                      ))}
                    </div>
                  )}

                  {!installed.loading && installed.error && (
                    <div className="skills-main__empty skills-main__empty--error" role="alert">
                      <Package size={28} strokeWidth={1.2} />
                      <span>{installed.error}</span>
                      <button
                        type="button"
                        className="skills-main__retry"
                        onClick={() => void installed.loadSkills(true)}
                      >
                        {t('list.retry')}
                      </button>
                    </div>
                  )}

                  {!installed.loading && !installed.error && installedFiltered.length === 0 && (
                    <div className="skills-main__empty">
                      <Package size={28} strokeWidth={1.2} />
                      <span>
                        {installed.skills.length === 0
                          ? t('list.empty.noSkills')
                          : t('list.empty.noMatch')}
                      </span>
                    </div>
                  )}

                  {!installed.loading && !installed.error && (
                    <>
                      <div className="skills-main__grid">
                        {pagedInstalledSkills.map((skill, index) => {
                          const presentation = localizeCatalogPresentation(
                            presentationForInstalledSkill(skill),
                            key => t(key),
                          );
                          const installedActions: SkillCardAction[] = [];
                          if (canManage
                            && skill.isAuthorable
                            && (skill.level !== 'project' || !installed.isRemoteWorkspace)) {
                            installedActions.push({
                              id: 'edit',
                              icon: <Pencil size={13} />,
                              ariaLabel: t('list.item.editTooltip'),
                              title: t('list.item.editTooltip'),
                              onClick: () => setAuthoringTarget({
                                mode: 'edit',
                                skillKey: skill.key,
                              }),
                            });
                          }
                          if (canManage && !skill.isBuiltin) {
                            installedActions.push({
                              id: 'delete',
                              icon: <Trash2 size={13} />,
                              ariaLabel: t('list.item.deleteTooltip'),
                              title: t('list.item.deleteTooltip'),
                              tone: 'danger' as const,
                              onClick: () => setDeleteTarget(skill),
                            });
                          }
                          return (
                            <SkillCard
                              key={skill.key}
                              name={presentation.displayName}
                              description={presentation.description}
                              index={index}
                              accentSeed={skill.key}
                              state={skill.isShadowed ? 'shadowed' : 'active'}
                              status={{
                                label: skill.isShadowed
                                  ? t('list.item.statusShadowed')
                                  : t('list.item.statusActive'),
                                tone: skill.isShadowed ? 'muted' : 'success',
                                detail: skill.isBuiltin
                                  ? t('list.item.builtin')
                                  : skill.level === 'project'
                                    ? t('list.item.project')
                                    : t('list.item.user'),
                                title: skill.isShadowed
                                  ? t('list.item.shadowedTooltip')
                                  : undefined,
                              }}
                              actions={installedActions}
                              detailLabel={t('list.item.detail')}
                              onOpenDetails={() => setSelectedDetail({ type: 'installed', skill })}
                            />
                          );
                        })}
                      </div>

                      <CatalogPagination
                        currentPage={currentInstalledPage}
                        totalPages={installedTotalPages}
                        onPageChange={setInstalledListPage}
                      />
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'discover' && (
          <div className="skills-discover">
            <div className="skills-discover__content">
              {market.marketLoading && (
                <div className="skills-discover__grid" aria-busy="true" aria-label={t('list.loading')}>
                  {Array.from({ length: SKILLS_PAGE_SIZE }).map((_, i) => (
                    <div
                      key={`mkt-sk-${i}`}
                      className="skills-discover__skeleton-card"
                      style={{ '--card-index': i } as React.CSSProperties}
                    />
                  ))}
                </div>
              )}

              {!market.marketLoading && market.marketError && (
                <div className="skills-discover__empty skills-discover__empty--error" role="alert">
                  <Package size={28} strokeWidth={1.5} />
                  <span>{market.marketError}</span>
                  <button
                    type="button"
                    className="skills-main__retry"
                    onClick={() => void market.refresh()}
                  >
                    {t('market.retry')}
                  </button>
                </div>
              )}

              {!market.marketLoading && !market.marketError && market.loadingMore && (
                <div className="skills-discover__grid" aria-busy="true" aria-label={t('list.loading')}>
                  {Array.from({ length: SKILLS_PAGE_SIZE }).map((_, i) => (
                    <div
                      key={`mkt-page-sk-${i}`}
                      className="skills-discover__skeleton-card"
                      style={{ '--card-index': i } as React.CSSProperties}
                    />
                  ))}
                </div>
              )}

              {!market.marketLoading && !market.marketError && !market.loadingMore && market.marketSkills.length === 0 && (
                <div className="skills-discover__empty">
                  <Package size={28} strokeWidth={1.5} />
                  <span>{marketQuery ? t('market.empty.noMatch') : t('market.empty.noSkills')}</span>
                </div>
              )}

              {!market.marketLoading && !market.marketError && !market.loadingMore && market.marketSkills.length > 0 && (
                <>
                  {marketQuery && (
                    <div className="skills-discover__results-info">
                      <span>
                        {t('market.resultsInfo', { query: marketQuery, count: market.totalLoaded })}
                      </span>
                    </div>
                  )}

                  <div className="skills-discover__grid">
                    {market.marketSkills.map((skill, index) => {
                      const isInstalled = isMarketSkillInstalled(installedSkillNames, skill);
                      const isDownloading = market.downloadingPackage === skill.installId;
                      const presentation = localizeCatalogPresentation(
                        presentationForMarketSkill(skill),
                        key => t(key),
                      );
                      return (
                        <SkillCard
                          key={skill.installId}
                          name={presentation.displayName}
                          description={presentation.description}
                          index={index}
                          accentSeed={skill.installId}
                          iconKind="market"
                          badges={isInstalled ? (
                            <Badge variant="success">
                              <CheckCircle2 size={11} />
                              {t('market.item.installed')}
                            </Badge>
                          ) : null}
                          meta={(
                            <span className="void-skills-scene__market-meta">
                              <TrendingUp size={12} />
                              {skill.installs ?? 0}
                            </span>
                          )}
                          actions={[
                            {
                              id: 'download',
                              icon: isInstalled ? <CheckCircle2 size={13} /> : <Download size={13} />,
                              ariaLabel: isInstalled ? t('market.item.installed') : t('market.item.downloadProject'),
                              title: isDownloading
                                ? t('market.item.downloading')
                                : (isInstalled ? t('market.item.installedTooltip') : t('market.item.downloadProject')),
                              disabled:
                                !canManage
                                || isDownloading
                                || !market.hasWorkspace
                                || market.isRemoteWorkspace
                                || isInstalled,
                              tone: isInstalled ? 'success' : 'primary',
                              onClick: () => void market.handleDownload(skill, 'project'),
                            },
                          ]}
                          detailLabel={t('list.item.detail')}
                          onOpenDetails={() => setSelectedDetail({ type: 'market', skill })}
                        />
                      );
                    })}
                  </div>

                  {(market.totalPages > 1 || market.hasMore) && (
                    <CatalogPagination
                      currentPage={market.currentPage}
                      totalPages={market.hasMore
                        ? market.currentPage + 2
                        : market.totalPages}
                      onPageChange={(page) => {
                        if (page > market.currentPage) {
                          void market.goToNextPage();
                        } else {
                          market.goToPrevPage();
                        }
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <GalleryDetailModal
        isOpen={Boolean(selectedDetail)}
        onClose={() => setSelectedDetail(null)}
        icon={<SkillCatalogAvatar
          identity={selectedSkillIdentity}
          name={selectedSkillName}
          size="detail"
        />}
        title={selectedInstalledPresentation?.displayName ?? selectedMarketPresentation?.displayName ?? ''}
        badges={selectedInstalledSkill ? (
          <>
            {selectedInstalledSkill.isShadowed && (
              <span title={t('list.item.shadowedTooltip')}>
                <Badge variant="warning">
                  <ShieldAlert size={11} />
                  {t('list.item.shadowed')}
                </Badge>
              </span>
            )}
            <Badge variant={selectedInstalledSkill.isBuiltin ? 'accent' : 'success'}>
              {selectedInstalledSkill.isBuiltin ? t('list.item.builtin') : t('list.item.userInstalled')}
            </Badge>
            <Badge variant={selectedInstalledSkill.level === 'user' ? 'info' : 'purple'}>
              {selectedInstalledSkill.level === 'user' ? t('list.item.user') : t('list.item.project')}
            </Badge>
          </>
        ) : selectedMarketSkill && isMarketSkillInstalled(installedSkillNames, selectedMarketSkill) ? (
          <Badge variant="success">
            <CheckCircle2 size={11} />
            {t('market.item.installed')}
          </Badge>
        ) : null}
        description={selectedInstalledPresentation?.description ?? selectedMarketPresentation?.description}
        meta={selectedMarketSkill ? (
          <span className="void-skills-scene__market-meta">
            <TrendingUp size={12} />
            {selectedMarketSkill.installs ?? 0}
          </span>
        ) : null}
        actions={canManage && selectedInstalledSkill && !selectedInstalledSkill.isBuiltin ? (
          <>
            {selectedInstalledSkill.isAuthorable
              && (selectedInstalledSkill.level !== 'project' || !installed.isRemoteWorkspace) && (
              <Button
                variant="primary"
                size="small"
                onClick={() => {
                  setAuthoringTarget({
                    mode: 'edit',
                    skillKey: selectedInstalledSkill.key,
                  });
                  setSelectedDetail(null);
                }}
              >
                <Pencil size={14} />
                {t('list.item.edit')}
              </Button>
            )}
            <Button
              variant="danger"
              size="small"
              onClick={() => {
                setDeleteTarget(selectedInstalledSkill);
                setSelectedDetail(null);
              }}
            >
              <Trash2 size={14} />
              {t('deleteModal.delete')}
            </Button>
          </>
        ) : canManage && selectedMarketSkill ? (
          <>
            {isMarketSkillInstalled(installedSkillNames, selectedMarketSkill) ? (
              <Button variant="secondary" size="small" disabled>
                {t('market.item.installed')}
              </Button>
            ) : (
              <>
                {!market.isRemoteWorkspace && (
                  <Button
                    variant="primary"
                    size="small"
                    onClick={() => void market.handleDownload(selectedMarketSkill, 'project')}
                    disabled={market.downloadingPackage === selectedMarketSkill.installId || !market.hasWorkspace}
                  >
                    {t('market.item.downloadProject')}
                  </Button>
                )}
                <Button
                  variant={market.isRemoteWorkspace ? 'primary' : 'secondary'}
                  size="small"
                  onClick={() => void market.handleDownload(selectedMarketSkill, 'user')}
                  disabled={market.downloadingPackage === selectedMarketSkill.installId}
                >
                  {t('market.item.downloadUser')}
                </Button>
              </>
            )}
          </>
        ) : null}
      >
        {selectedInstalledSkill ? (
          <>
            {selectedInstalledSkill.isShadowed && (
              <div className="void-skills-scene__detail-row">
                <span className="void-skills-scene__detail-label">{t('list.item.shadowedLabel')}</span>
                <span className="void-skills-scene__detail-value">
                  {t('list.item.shadowedDetail', { key: selectedInstalledSkill.shadowedByKey ?? '' })}
                </span>
              </div>
            )}
            <div className="void-skills-scene__detail-row">
              <span className="void-skills-scene__detail-label">{t('list.item.pathLabel')}</span>
              {canRevealSkillPath ? (
                <button
                  type="button"
                  className="void-skills-scene__detail-path-btn"
                  title={t('list.item.openPathInExplorer')}
                  onClick={() => void handleRevealSkillPath(selectedInstalledSkill.path)}
                >
                  {selectedInstalledSkill.path}
                </button>
              ) : (
                <code className="void-skills-scene__detail-value">{selectedInstalledSkill.path}</code>
              )}
            </div>
          </>
        ) : null}

        {selectedMarketSkill?.source ? (
          <div className="void-skills-scene__detail-row">
            <span className="void-skills-scene__detail-label">{t('market.item.sourceLabel')}</span>
            <span className="void-skills-scene__detail-value">{selectedMarketSkill.source}</span>
          </div>
        ) : null}

        {selectedMarketSkill ? (
          <div className="void-skills-scene__detail-row">
            <span className="void-skills-scene__detail-label">{t('market.detail.installsLabel')}</span>
            <span className="void-skills-scene__detail-value">{selectedMarketSkill.installs ?? 0}</span>
          </div>
        ) : null}

        {selectedMarketSkill?.url ? (
          <div className="void-skills-scene__detail-row">
            <span className="void-skills-scene__detail-label">{t('market.detail.linkLabel')}</span>
            <a
              href={selectedMarketSkill.url}
              target="_blank"
              rel="noreferrer"
              className="void-skills-scene__detail-link"
            >
              {selectedMarketSkill.url}
            </a>
          </div>
        ) : null}
      </GalleryDetailModal>

      <Modal
        isOpen={canManage && isAddFormOpen}
        onClose={() => {
          installed.resetForm();
          setAddFormOpen(false);
        }}
        title={t('form.title')}
        size="small"
      >
        <div className="void-skills-scene__modal-form">
          <Select
            label={t('form.level.label')}
            options={[
              { label: t('form.level.user'), value: 'user' },
              {
                label: `${t('form.level.project')}${installed.hasWorkspace && !installed.isRemoteWorkspace ? '' : t('form.level.projectDisabled')}`,
                value: 'project',
                disabled: !installed.hasWorkspace || installed.isRemoteWorkspace,
              },
            ]}
            value={installed.formLevel}
            onChange={(value) => installed.setFormLevel(value as SkillLevel)}
            size="medium"
          />

          {installed.formLevel === 'project' && installed.hasWorkspace ? (
            <div className="void-skills-scene__form-hint">
              {t('form.level.selectedProjectPath', { path: installed.workspacePath })}
            </div>
          ) : null}

          <div className="void-skills-scene__path-input">
            <Input
              label={t('form.path.label')}
              placeholder={t('form.path.placeholder')}
              value={installed.formPath}
              onChange={(e) => installed.setFormPath(e.target.value)}
              variant="outlined"
            />
            <button
              type="button"
              className="gallery-action-btn"
              onClick={installed.handleBrowse}
              aria-label={t('form.path.browseTooltip')}
            >
              <FolderOpen size={15} />
            </button>
          </div>
          <div className="void-skills-scene__path-hint">
            {t('form.path.hint')}
          </div>

          {installed.isValidating ? (
            <div className="void-skills-scene__validating">{t('form.validating')}</div>
          ) : null}

          {installed.validationResult ? (
            <div
              className={[
                'void-skills-scene__validation',
                installed.validationResult.valid ? 'is-valid' : 'is-invalid',
              ].filter(Boolean).join(' ')}
            >
              {installed.validationResult.valid ? (
                <>
                  <div className="void-skills-scene__validation-name">
                    {installed.validationResult.name}
                  </div>
                  <div className="void-skills-scene__validation-desc">
                    {installed.validationResult.description}
                  </div>
                </>
              ) : (
                <div className="void-skills-scene__validation-error">
                  {installed.validationResult.error}
                </div>
              )}
            </div>
          ) : null}

          <div className="void-skills-scene__modal-form-actions">
            <Button
              variant="secondary"
              size="small"
              onClick={() => {
                installed.resetForm();
                setAddFormOpen(false);
              }}
            >
              {t('form.actions.cancel')}
            </Button>
            <Button
              variant="primary"
              size="small"
              onClick={handleAddSkill}
              disabled={!installed.validationResult?.valid || installed.isAdding}
            >
              {installed.isAdding ? t('form.actions.adding') : t('form.actions.add')}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) {
            return;
          }
          const deleted = await installed.handleDelete(deleteTarget);
          if (deleted) {
            setDeleteTarget(null);
          }
        }}
        title={t('deleteModal.title')}
        message={t('deleteModal.message', { name: deleteTarget?.name ?? '' })}
        type="warning"
        confirmDanger
        confirmText={t('deleteModal.delete')}
        cancelText={t('deleteModal.cancel')}
      />
    </div>
  );
};

export interface SkillsSceneProps {
  capabilityService?: CustomizationRuntimeCapabilityReader;
}

const SkillsScene: React.FC<SkillsSceneProps> = ({
  capabilityService = customizationRuntimeCapabilityService,
}) => {
  const { t } = useTranslation('scenes/skills');
  const catalogCapability = capabilityService.getCapability('catalog_read');
  const managementCapability = capabilityService.getCapability('skill_management');

  if (catalogCapability.status === 'unsupported') {
    return (
      <div className="void-skills-scene" data-customization-market="skills">
        <main
          className="void-skills-runtime-unsupported"
          data-testid="skills-runtime-unsupported"
        >
          <Puzzle size={28} aria-hidden />
          <h1>{t('runtimeUnsupported.title')}</h1>
          <p>{t('runtimeUnsupported.description')}</p>
        </main>
      </div>
    );
  }

  return (
    <SupportedSkillsScene
      canManage={managementCapability.status === 'supported'}
      capabilityService={capabilityService}
    />
  );
};

export default SkillsScene;
