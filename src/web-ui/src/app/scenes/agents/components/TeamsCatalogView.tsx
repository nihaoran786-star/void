import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  PackagePlus,
  RefreshCcw,
  Users,
} from 'lucide-react';
import { Button, confirmDanger } from '@/component-library';
import {
  DirectoryTopBar,
  GalleryEmpty,
  GalleryGrid,
  GalleryLayout,
  GallerySkeleton,
  GalleryZone,
} from '@/app/components';
import {
  customizationRuntimeCapabilityService,
  desktopTeamPackagePicker,
  existingTeamDefinitionAdapter,
  localizeCatalogPresentation,
  TeamAuthoringError,
  type CustomizationRuntimeCapabilityReader,
  type TeamAuthoringGateway,
  type TeamCatalogEntry,
  type TeamPackagePicker,
} from '@/shared/services/customization';
import type { TeamDefinitionLevel } from '@/infrastructure/config/types';
import { useWorkspaceManagerSync } from '@/infrastructure/hooks/useWorkspaceManagerSync';
import { useNotification } from '@/shared/notification-system';
import { useAgentsStore } from '../agentsStore';
import { useTeamCatalog, type UseTeamCatalogResult } from '../hooks/useTeamCatalog';
import TeamCatalogCard from './TeamCatalogCard';
import TeamCatalogDetail from './TeamCatalogDetail';
import CatalogPagination from '@/app/components/CatalogPagination/CatalogPagination';
import './TeamsCatalogView.scss';
import {
  canDispatchCustomizationTarget,
  CustomizationTaskDispatchError,
  customizationTaskDispatchService,
  type CustomizationTaskDispatcher,
} from '@/app/services/CustomizationTaskDispatchService';
import { useSessionModeStore } from '@/app/stores/sessionModeStore';

const TEAM_PAGE_SIZE = 8;

interface TeamsCatalogViewContentProps {
  catalog: UseTeamCatalogResult;
  onOpenReviewTeam: () => void;
  onCreateTeam?: () => void;
  onEditTeam?: (team: TeamCatalogEntry) => void;
  onInstallTeam?: (level: TeamDefinitionLevel) => Promise<void>;
  onDeleteTeam?: (team: TeamCatalogEntry) => Promise<void>;
  onDispatchTeam?: (team: TeamCatalogEntry) => Promise<boolean>;
  managementSupported?: boolean;
  projectScopeAvailable?: boolean;
  installing?: boolean;
  deleting?: boolean;
  dispatchingTeamId?: string | null;
  /** Which catalog the shared directory top bar shows as selected. */
  catalogView?: 'agents' | 'teams';
  onCatalogViewChange?: (view: 'agents' | 'teams') => void;
}

export const TeamsCatalogViewContent: React.FC<TeamsCatalogViewContentProps> = ({
  catalog,
  onOpenReviewTeam,
  onCreateTeam = () => undefined,
  onEditTeam = () => undefined,
  onInstallTeam = async () => undefined,
  onDeleteTeam = async () => undefined,
  onDispatchTeam = async () => false,
  managementSupported = false,
  projectScopeAvailable = false,
  installing = false,
  deleting = false,
  dispatchingTeamId = null,
  catalogView = 'teams',
  onCatalogViewChange = () => undefined,
}) => {
  const { t } = useTranslation('scenes/agents');
  const [selectedTeam, setSelectedTeam] = useState<TeamCatalogEntry | null>(null);
  const [installLevel, setInstallLevel] =
    useState<TeamDefinitionLevel>('user');
  const [teamPage, setTeamPage] = useState(0);
  const hasEntries = catalog.entries.length > 0;
  const totalTeamPages = Math.max(1, Math.ceil(catalog.entries.length / TEAM_PAGE_SIZE));
  const pagedTeams = useMemo(
    () => catalog.entries.slice(
      teamPage * TEAM_PAGE_SIZE,
      (teamPage + 1) * TEAM_PAGE_SIZE,
    ),
    [catalog.entries, teamPage],
  );

  useEffect(() => {
    setTeamPage((page) => Math.min(page, totalTeamPages - 1));
  }, [totalTeamPages]);

  const changeTeamPage = useCallback((page: number) => {
    setTeamPage(Math.max(0, Math.min(page, totalTeamPages - 1)));
    document.getElementById('teams-catalog-zone')
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [totalTeamPages]);

  return (
    <GalleryLayout className="void-agents-scene teams-catalog-view">
      <DirectoryTopBar
        title={t('catalog.tabs.teams')}
        count={catalog.entries.length}
        mission={t('missions.teams')}
        groups={[
          {
            id: 'catalog',
            label: t('catalog.tabs.ariaLabel'),
            mode: 'tabs',
            chips: [
              {
                id: 'agents',
                label: t('catalog.tabs.agents'),
                active: catalogView === 'agents',
                onSelect: () => onCatalogViewChange('agents'),
              },
              {
                id: 'teams',
                label: t('catalog.tabs.teams'),
                active: catalogView === 'teams',
                onSelect: () => onCatalogViewChange('teams'),
              },
            ],
          },
        ]}
        utilities={(
          <>
            <select
              className="team-catalog-scope"
              aria-label={t('catalog.management.installScope')}
              value={installLevel}
              disabled={!managementSupported}
              onChange={event => setInstallLevel(
                event.target.value as TeamDefinitionLevel,
              )}
            >
              <option value="user">{t('catalog.management.userScope')}</option>
              <option value="project" disabled={!projectScopeAvailable}>
                {t('catalog.management.projectScope')}
              </option>
            </select>
            <button
              type="button"
              className="directory-topbar__utility"
              disabled={!managementSupported || installing}
              onClick={() => void onInstallTeam(installLevel)}
              aria-label={t('catalog.management.install')}
              title={t('catalog.management.install')}
            >
              <PackagePlus size={15} aria-hidden="true" />
            </button>
          </>
        )}
        primary={{
          label: t('catalog.management.create'),
          onClick: onCreateTeam,
          disabled: !managementSupported,
        }}
      />
      <div className="gallery-zones">
        <GalleryZone
          id="teams-catalog-zone"
          title={t('catalog.zone.title')}
          subtitle={t('catalog.zone.subtitle')}
          tools={<span className="gallery-zone-count">{catalog.entries.length}</span>}
        >
          {catalog.status === 'loading' ? (
            <GallerySkeleton count={8} cardHeight={168} className="team-catalog-skeleton" />
          ) : null}

          {catalog.status === 'partial' ? (
            <div className="team-catalog-status team-catalog-status--warning" role="status">
              <AlertTriangle size={15} />
              <span>{t('catalog.states.partial')}</span>
              <Button variant="ghost" size="small" onClick={() => void catalog.reload()}>
                {t('catalog.actions.retry')}
              </Button>
            </div>
          ) : null}

          {catalog.status === 'error' ? (
            <GalleryEmpty
              icon={<AlertTriangle size={32} strokeWidth={1.5} />}
              message={t('catalog.states.error')}
              action={(
                <Button variant="secondary" size="small" onClick={() => void catalog.reload()}>
                  <RefreshCcw size={14} />
                  {t('catalog.actions.reload')}
                </Button>
              )}
            />
          ) : null}

          {catalog.status === 'empty' ? (
            <GalleryEmpty
              icon={<Users size={32} strokeWidth={1.5} />}
              message={t('catalog.states.empty')}
            />
          ) : null}

          {catalog.status !== 'loading' && catalog.status !== 'error' && hasEntries ? (
            <>
              <GalleryGrid minCardWidth={280}>
                {pagedTeams.map((team, index) => (
                  <TeamCatalogCard
                    key={`${team.source.adapterId}:${team.identity.id}`}
                    team={team}
                    index={teamPage * TEAM_PAGE_SIZE + index}
                    onOpen={setSelectedTeam}
                    onDispatch={
                      canDispatchCustomizationTarget(team)
                        ? currentTeam => { void onDispatchTeam(currentTeam); }
                        : undefined
                    }
                    dispatching={team.identity.id === dispatchingTeamId}
                  />
                ))}
              </GalleryGrid>
              <CatalogPagination
                currentPage={teamPage}
                totalPages={totalTeamPages}
                onPageChange={changeTeamPage}
              />
            </>
          ) : null}
        </GalleryZone>
      </div>
      <TeamCatalogDetail
        team={selectedTeam}
        onClose={() => setSelectedTeam(null)}
        onOpenReviewTeam={() => {
          setSelectedTeam(null);
          onOpenReviewTeam();
        }}
        onEdit={team => {
          setSelectedTeam(null);
          onEditTeam(team);
        }}
        onDelete={team => {
          void onDeleteTeam(team).then(() => setSelectedTeam(null));
        }}
        onDispatch={team => {
          void onDispatchTeam(team).then((dispatched) => {
            if (dispatched) setSelectedTeam(null);
          });
        }}
        deleting={deleting}
        dispatching={selectedTeam?.identity.id === dispatchingTeamId}
      />
    </GalleryLayout>
  );
};

export interface TeamsCatalogViewProps {
  gateway?: TeamAuthoringGateway;
  packagePicker?: TeamPackagePicker;
  capabilityService?: CustomizationRuntimeCapabilityReader;
  taskDispatcher?: CustomizationTaskDispatcher;
}

const TeamsCatalogView: React.FC<TeamsCatalogViewProps> = ({
  gateway = existingTeamDefinitionAdapter,
  packagePicker = desktopTeamPackagePicker,
  capabilityService = customizationRuntimeCapabilityService,
  taskDispatcher = customizationTaskDispatchService,
}) => {
  const { t } = useTranslation('scenes/agents');
  const notification = useNotification();
  const { workspacePath, hasWorkspace, isRemoteWorkspace } =
    useWorkspaceManagerSync();
  const preferredScenario = useSessionModeStore(state => state.mode);
  const catalog = useTeamCatalog();
  const {
    catalogView,
    setCatalogView,
    openReviewTeam,
    openCreateTeam,
    openEditTeam,
    requestCatalogRefresh,
  } = useAgentsStore();
  const [installing, setInstalling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dispatchingTeamId, setDispatchingTeamId] = useState<string | null>(null);
  const managementCapability = capabilityService.getCapability('team_management');
  const packageCapability = capabilityService.getCapability(
    'team_package_install',
  );

  const installTeam = async (level: TeamDefinitionLevel) => {
    if (
      managementCapability.status === 'unsupported'
      || packageCapability.status === 'unsupported'
    ) {
      notification.error(t('catalog.management.unsupported'));
      return;
    }
    if (level === 'project' && (!workspacePath || isRemoteWorkspace)) {
      notification.error(
        isRemoteWorkspace
          ? t('teamAuthoring.errors.unsupported_remote_project')
          : t('teamAuthoring.messages.noWorkspace'),
      );
      return;
    }
    setInstalling(true);
    try {
      const sourcePath = await packagePicker.pickPackage();
      if (!sourcePath) return;
      const record = await gateway.install({
        sourcePath,
        level,
        workspacePath: level === 'project' ? workspacePath : undefined,
      });
      notification.success(t('catalog.management.installSuccess', {
        name: record.definition.displayName,
      }));
      requestCatalogRefresh();
    } catch (error) {
      const code = error instanceof TeamAuthoringError
        ? error.code
        : 'install_failed';
      notification.error(t(`teamAuthoring.errors.${code}`));
    } finally {
      setInstalling(false);
    }
  };

  const deleteTeam = async (team: TeamCatalogEntry) => {
    if (managementCapability.status === 'unsupported') {
      notification.error(t('catalog.management.unsupported'));
      return;
    }
    if (!team.definitionLevel) return;
    const presentation = localizeCatalogPresentation(
      team.identity,
      key => t(key),
    );
    const confirmed = await confirmDanger(
      t('catalog.management.deleteTitle'),
      t('catalog.management.deleteConfirm', {
        name: presentation.displayName,
      }),
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      await gateway.delete({
        teamDefinitionId: team.identity.id,
        level: team.definitionLevel,
        workspacePath: team.definitionLevel === 'project'
          ? workspacePath || undefined
          : undefined,
      });
      notification.success(t('catalog.management.deleteSuccess', {
        name: presentation.displayName,
      }));
      requestCatalogRefresh();
    } catch (error) {
      const code = error instanceof TeamAuthoringError
        ? error.code
        : 'delete_failed';
      notification.error(t(`teamAuthoring.errors.${code}`));
    } finally {
      setDeleting(false);
    }
  };

  const dispatchTeam = async (team: TeamCatalogEntry) => {
    setDispatchingTeamId(team.identity.id);
    try {
      await taskDispatcher.dispatch({
        target: team,
        preferredScenario,
      });
      return true;
    } catch (error) {
      const code = error instanceof CustomizationTaskDispatchError
        ? error.code
        : 'draft_open_failed';
      notification.error(t(`catalog.dispatch.errors.${code}`));
      return false;
    } finally {
      setDispatchingTeamId(null);
    }
  };

  return (
    <TeamsCatalogViewContent
      catalog={catalog}
      catalogView={catalogView}
      onCatalogViewChange={setCatalogView}
      onOpenReviewTeam={openReviewTeam}
      onCreateTeam={openCreateTeam}
      onEditTeam={team => {
        if (team.definitionLevel) {
          openEditTeam(team.identity.id, team.definitionLevel);
        }
      }}
      onInstallTeam={installTeam}
      onDeleteTeam={deleteTeam}
      onDispatchTeam={dispatchTeam}
      managementSupported={managementCapability.status === 'supported'}
      projectScopeAvailable={hasWorkspace && !isRemoteWorkspace}
      installing={installing}
      deleting={deleting}
      dispatchingTeamId={dispatchingTeamId}
    />
  );
};

export default TeamsCatalogView;
