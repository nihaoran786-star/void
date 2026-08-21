/**
 * AGENT — the single page for every AI worker, team and piece of equipment.
 *
 * Typography-first minimal grouped list: a large page head, one mission line,
 * text tabs with a hairline underline, then grouped rows. It aggregates the
 * existing assistant / agent / team / skill / connector surfaces; it owns no
 * runtime, no persistence and no catalog logic of its own — every action here
 * calls the service that already implements it.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Bot,
  Info,
  MessageSquarePlus,
  Pencil,
  Plus,
  Search,
  Send,
  Settings2,
} from 'lucide-react';
import { Badge, Button } from '@/component-library';
import { GalleryDetailModal } from '@/app/components';
import CatalogPagination from '@/app/components/CatalogPagination/CatalogPagination';
import { useNotification } from '@/shared/notification-system';
import { useWorkspaceContext } from '@/infrastructure/contexts/WorkspaceContext';
import { isRemoteWorkspace } from '@/shared/types';
import { flowChatManager } from '@/flow_chat/services/FlowChatManager';
import { openMainSession } from '@/flow_chat/services/openBtwSession';
import {
  canDispatchCustomizationTarget,
  CustomizationTaskDispatchError,
  customizationTaskDispatchService,
  type CustomizationTaskDispatcher,
} from '@/app/services/CustomizationTaskDispatchService';
import { useSceneStore } from '@/app/stores/sceneStore';
import { useSessionModeStore } from '@/app/stores/sessionModeStore';
import { createLogger } from '@/shared/utils/logger';
import McpToolsConfig from '@/infrastructure/config/components/McpToolsConfig';
import AgentAvatar from '../agents/components/AgentAvatar';
import AgentEquipmentPanel from '../agents/components/AgentEquipmentPanel';
import CreateAgentPage from '../agents/components/CreateAgentPage';
import ReviewTeamPage, { ReviewTeamErrorBoundary } from '../agents/components/ReviewTeamPage';
import TeamAuthoringPage from '../agents/components/TeamAuthoringPage';
import TeamCatalogDetail from '../agents/components/TeamCatalogDetail';
import { useAgentsStore } from '../agents/agentsStore';
import { getAgentBadge, getAgentDescription } from '../agents/utils';
import { useMyAgentStore } from '../my-agent/myAgentStore';
import SkillCatalogAvatar from '../skills/components/SkillCatalogAvatar';
import SkillAuthoringPage from '../skills/components/SkillAuthoringPage';
import AgentHubRowItem, { type AgentHubRowAction } from './AgentHubRowItem';
import {
  AGENT_HUB_ROW_TYPES,
  useAgentHubDirectory,
  type AgentHubRow,
  type AgentHubRowType,
  type AgentHubSection,
} from './useAgentHubDirectory';
import './AgentHubScene.scss';

const log = createLogger('AgentHubScene');

type AgentHubTab = 'all' | AgentHubRowType;

const TABS: readonly AgentHubTab[] = ['all', ...AGENT_HUB_ROW_TYPES];

/**
 * Full-page views hosted inside the AGENT scene. 'home' renders the directory;
 * any other value replaces the directory with that page, each of which carries
 * its own back-to-directory entry. P2 / P3 add pages to this union.
 */
export type AgentHubPage =
  | 'home'
  | 'connectors'
  | 'skillAuthoring'
  | 'createAgent'
  | 'teamAuthoring'
  | 'reviewTeam';

/** i18n key under `scenes/agent-hub` for each hosted page's heading. */
const HOSTED_PAGE_TITLES: Record<Exclude<AgentHubPage, 'home'>, string> = {
  connectors: 'hosted.connectors.title',
  skillAuthoring: 'hosted.skillAuthoring.title',
  createAgent: 'hosted.createAgent.title',
  teamAuthoring: 'hosted.teamAuthoring.title',
  reviewTeam: 'hosted.reviewTeam.title',
};

/** Rows shown per group on the "all" tab before it defers to the type tab. */
const GROUP_PREVIEW_LIMIT = 5;
/** Rows per page on a single-type tab. */
const TYPE_PAGE_SIZE = 12;

export interface AgentHubSceneProps {
  taskDispatcher?: CustomizationTaskDispatcher;
}

const AgentHubScene: React.FC<AgentHubSceneProps> = ({
  taskDispatcher = customizationTaskDispatchService,
}) => {
  const { t } = useTranslation('scenes/agent-hub');
  const { t: tAgents } = useTranslation('scenes/agents');
  const notification = useNotification();
  const directory = useAgentHubDirectory();

  const openScene = useSceneStore(state => state.openScene);
  const preferredScenario = useSessionModeStore(state => state.mode);
  const setSelectedAssistantWorkspaceId = useMyAgentStore(
    state => state.setSelectedAssistantWorkspaceId,
  );
  const {
    createAssistantWorkspace,
    setActiveWorkspace,
  } = useWorkspaceContext();
  const {
    page: agentsPage,
    openHome,
    openCreateAgent,
    openCreateTeam,
    openEditTeam,
    openReviewTeam,
  } = useAgentsStore();

  const [activeTab, setActiveTab] = useState<AgentHubTab>('all');
  const [hubPage, setHubPage] = useState<AgentHubPage>('home');
  const [skillAuthoringMode, setSkillAuthoringMode] = useState<'create' | 'edit'>('create');
  const [skillAuthoringKey, setSkillAuthoringKey] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<AgentHubRow | null>(null);
  const [detailTeamId, setDetailTeamId] = useState<string | null>(null);
  const [dispatchingRowId, setDispatchingRowId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const normalizedQuery = query.trim().toLowerCase();

  const filteredSections = useMemo(() => {
    const result = {} as Record<AgentHubRowType, AgentHubSection>;
    for (const type of AGENT_HUB_ROW_TYPES) {
      const section = directory.sections[type];
      if (!normalizedQuery) {
        result[type] = section;
        continue;
      }
      const rows = section.rows.filter(row => row.searchText.includes(normalizedQuery));
      result[type] = {
        ...section,
        rows,
        status: section.status === 'ready' && rows.length === 0 ? 'empty' : section.status,
      };
    }
    return result;
  }, [directory.sections, normalizedQuery]);

  useEffect(() => {
    setPage(0);
  }, [activeTab, normalizedQuery]);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  // The agents store owns the create/authoring/review pages; the hosted page
  // follows it so entering any of those pages switches the hub to it and
  // returning to the roster (agentsStore.openHome) switches back.
  useEffect(() => {
    if (agentsPage === 'createAgent' || agentsPage === 'teamAuthoring' || agentsPage === 'reviewTeam') {
      setHubPage(agentsPage);
    }
  }, [agentsPage]);

  // ── Behaviour: everything below delegates to the owning service ───────────

  const openAssistantConfig = useCallback((rowId: string) => {
    const workspace = directory.assistantsById[rowId];
    if (!workspace) return;
    setSelectedAssistantWorkspaceId(workspace.id);
    void setActiveWorkspace(workspace.id).catch(error => {
      log.warn('Failed to activate assistant workspace', { error });
    });
    openScene('profile');
  }, [directory.assistantsById, openScene, setActiveWorkspace, setSelectedAssistantWorkspaceId]);

  const startAssistantSession = useCallback(async (rowId: string) => {
    const workspace = directory.assistantsById[rowId];
    if (!workspace) return;
    try {
      const sessionId = await flowChatManager.createChatSession(
        {
          workspacePath: workspace.rootPath,
          ...(isRemoteWorkspace(workspace) && workspace.connectionId
            ? { remoteConnectionId: workspace.connectionId }
            : {}),
          ...(isRemoteWorkspace(workspace) && workspace.sshHost
            ? { remoteSshHost: workspace.sshHost }
            : {}),
        },
        'Claw',
      );
      await openMainSession(sessionId, {
        workspaceId: workspace.id,
        activateWorkspace: setActiveWorkspace,
      });
    } catch (error) {
      log.error('Failed to start assistant session', error);
      notification.error(t('errors.newSessionFailed'));
    }
  }, [directory.assistantsById, notification, setActiveWorkspace, t]);

  const dispatchRow = useCallback(async (row: AgentHubRow) => {
    const target = row.type === 'agent'
      ? directory.agentsById[row.id]?.catalogEntry
      : directory.teamsById[row.id];
    if (!target || !canDispatchCustomizationTarget(target)) {
      notification.error(tAgents('catalog.dispatch.errors.target_not_dispatchable'));
      return;
    }
    setDispatchingRowId(row.id);
    try {
      await taskDispatcher.dispatch({ target, preferredScenario });
      setDetailRow(null);
      setDetailTeamId(null);
    } catch (error) {
      const code = error instanceof CustomizationTaskDispatchError
        ? error.code
        : 'draft_open_failed';
      notification.error(tAgents(`catalog.dispatch.errors.${code}`));
    } finally {
      setDispatchingRowId(null);
    }
  }, [
    directory.agentsById,
    directory.teamsById,
    notification,
    preferredScenario,
    tAgents,
    taskDispatcher,
  ]);

  const openRow = useCallback((row: AgentHubRow) => {
    switch (row.type) {
      case 'assistant':
        openAssistantConfig(row.id);
        return;
      case 'team':
        setDetailTeamId(row.id);
        return;
      case 'connector':
        setHubPage('connectors');
        return;
      case 'agent':
      case 'skill':
      default:
        setDetailRow(row);
    }
  }, [openAssistantConfig]);

  const skillKeyForRow = useCallback((row: AgentHubRow): string | null => {
    const skill = directory.skillsById[row.id];
    if (skill?.key) return skill.key;
    return row.id.startsWith('skill:') ? row.id.slice('skill:'.length) : null;
  }, [directory.skillsById]);

  const openSkillAuthoring = useCallback((mode: 'create' | 'edit', skillKey?: string | null) => {
    setSkillAuthoringMode(mode);
    setSkillAuthoringKey(skillKey ?? null);
    setHubPage('skillAuthoring');
  }, []);

  const actionsFor = useCallback((row: AgentHubRow): AgentHubRowAction[] => {
    switch (row.type) {
      case 'assistant':
        return [
          {
            key: 'new-session',
            Icon: MessageSquarePlus,
            label: t('actions.newSession'),
            onSelect: () => { void startAssistantSession(row.id); },
          },
          {
            key: 'configure',
            Icon: Settings2,
            label: t('actions.configure'),
            onSelect: () => openAssistantConfig(row.id),
          },
        ];
      case 'agent':
      case 'team':
        return [
          {
            key: 'dispatch',
            Icon: Send,
            label: t('actions.dispatch'),
            onSelect: () => { void dispatchRow(row); },
          },
          {
            key: 'details',
            Icon: Info,
            label: t('actions.details'),
            onSelect: () => openRow(row),
          },
        ];
      case 'skill':
        return [
          {
            key: 'details',
            Icon: Info,
            label: t('actions.details'),
            onSelect: () => setDetailRow(row),
          },
          {
            key: 'edit',
            Icon: Pencil,
            label: t('actions.edit'),
            onSelect: () => openSkillAuthoring('edit', skillKeyForRow(row)),
          },
        ];
      case 'connector':
      default:
        return [
          {
            key: 'details',
            Icon: Info,
            label: t('actions.details'),
            onSelect: () => setHubPage('connectors'),
          },
        ];
    }
  }, [dispatchRow, openAssistantConfig, openRow, openSkillAuthoring, skillKeyForRow, startAssistantSession, t]);

  // ── '+' menu: each item enters the existing creation flow ────────────────

  const createItems = useMemo(() => ([
    {
      key: 'assistant',
      label: t('create.assistant'),
      onSelect: () => {
        void createAssistantWorkspace()
          .then(workspace => {
            setSelectedAssistantWorkspaceId(workspace.id);
            openScene('profile');
          })
          .catch(error => {
            log.error('Failed to create assistant workspace', error);
            notification.error(t('errors.createAssistantFailed'));
          });
      },
    },
    {
      key: 'agent',
      label: t('create.agent'),
      onSelect: () => {
        openCreateAgent();
      },
    },
    {
      key: 'team',
      label: t('create.team'),
      onSelect: () => {
        openCreateTeam();
      },
    },
    {
      key: 'skill',
      label: t('create.skill'),
      onSelect: () => openSkillAuthoring('create'),
    },
    {
      key: 'connector',
      label: t('create.connector'),
      onSelect: () => setHubPage('connectors'),
    },
  ]), [
    createAssistantWorkspace,
    notification,
    openCreateAgent,
    openCreateTeam,
    openScene,
    openSkillAuthoring,
    setSelectedAssistantWorkspaceId,
    t,
  ]);

  // ── Tabs: roving tabstop ─────────────────────────────────────────────────

  const handleTabKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = TABS.indexOf(activeTab);
    const next = event.key === 'ArrowRight'
      ? TABS[(index + 1) % TABS.length]
      : TABS[(index - 1 + TABS.length) % TABS.length];
    setActiveTab(next);
    tabRefs.current[next]?.focus();
  }, [activeTab]);

  const renderRows = (rows: AgentHubRow[]): React.ReactNode => rows.map(row => (
    <AgentHubRowItem
      key={row.id}
      row={row}
      statusLabel={t(`status.${row.status.key}`)}
      actions={actionsFor(row)}
      onOpen={() => openRow(row)}
    />
  ));

  const renderSectionState = (section: AgentHubSection): React.ReactNode => {
    if (section.status === 'loading') {
      return (
        <p className="agent-hub-group__state" role="status" aria-busy="true">
          {t('states.loading')}
        </p>
      );
    }
    if (section.status === 'error') {
      return (
        <p className="agent-hub-group__state is-error" role="alert">
          {t('states.error')}
        </p>
      );
    }
    if (section.status === 'empty') {
      return (
        <p className="agent-hub-group__state">
          {normalizedQuery ? t('states.noMatch') : t('states.empty')}
        </p>
      );
    }
    return null;
  };

  const renderGroup = (type: AgentHubRowType): React.ReactNode => {
    const section = filteredSections[type];
    const visible = section.rows.slice(0, GROUP_PREVIEW_LIMIT);
    return (
      <section
        key={type}
        className="agent-hub-group"
        aria-label={t(`groups.${type}`)}
        data-testid={`agent-hub-group-${type}`}
      >
        <header className="agent-hub-group__head">
          <h2 className="agent-hub-group__label">
            {`${t(`groups.${type}`)} · ${section.rows.length}`}
          </h2>
          {section.rows.length > GROUP_PREVIEW_LIMIT ? (
            <button
              type="button"
              className="agent-hub-group__more"
              onClick={() => setActiveTab(type)}
            >
              {t('actions.viewAll')}
            </button>
          ) : null}
        </header>
        {renderSectionState(section) ?? (
          <div className="agent-hub-group__rows">{renderRows(visible)}</div>
        )}
      </section>
    );
  };

  const renderTypeTab = (type: AgentHubRowType): React.ReactNode => {
    const section = filteredSections[type];
    const totalPages = Math.max(1, Math.ceil(section.rows.length / TYPE_PAGE_SIZE));
    const safePage = Math.min(page, totalPages - 1);
    const visible = section.rows.slice(
      safePage * TYPE_PAGE_SIZE,
      (safePage + 1) * TYPE_PAGE_SIZE,
    );
    return (
      <section
        className="agent-hub-group"
        aria-label={t(`groups.${type}`)}
        data-testid={`agent-hub-group-${type}`}
      >
        <header className="agent-hub-group__head">
          <h2 className="agent-hub-group__label">
            {`${t(`groups.${type}`)} · ${section.rows.length}`}
          </h2>
        </header>
        {renderSectionState(section) ?? (
          <>
            <div className="agent-hub-group__rows">{renderRows(visible)}</div>
            <CatalogPagination
              currentPage={safePage}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </section>
    );
  };

  const renderHostedPage = (page: AgentHubPage): React.ReactNode => {
    switch (page) {
      case 'connectors':
        return <McpToolsConfig />;
      case 'skillAuthoring':
        return (
          <SkillAuthoringPage
            mode={skillAuthoringMode}
            skillKey={skillAuthoringKey ?? undefined}
            onBack={() => setHubPage('home')}
            onSaved={() => setHubPage('home')}
          />
        );
      case 'createAgent':
        return <CreateAgentPage />;
      case 'teamAuthoring':
        return <TeamAuthoringPage />;
      case 'reviewTeam':
        return (
          <ReviewTeamErrorBoundary>
            <ReviewTeamPage />
          </ReviewTeamErrorBoundary>
        );
      default:
        return null;
    }
  };

  const detailAgent = detailRow?.type === 'agent'
    ? directory.agentsById[detailRow.id]
    : undefined;
  const detailSkill = detailRow?.type === 'skill'
    ? directory.skillsById[detailRow.id]
    : undefined;
  const detailTeam = detailTeamId ? directory.teamsById[detailTeamId] ?? null : null;

  return (
    <main className="void-agent-hub" data-testid="agent-hub-scene">
      {hubPage === 'home' ? (
        <div className="void-agent-hub__inner">
          <header className="agent-hub-head">
            <div className="agent-hub-head__line">
              <h1 className="agent-hub-head__title">AGENT</h1>
              <span className="agent-hub-head__count">{directory.total}</span>
              <div className="agent-hub-head__tools">
                {searchOpen ? (
                  <input
                    ref={searchInputRef}
                    type="search"
                    className="agent-hub-head__search"
                    value={query}
                    aria-label={t('actions.search')}
                    placeholder={t('search.placeholder')}
                    onChange={event => setQuery(event.target.value)}
                    onBlur={() => { if (!query) setSearchOpen(false); }}
                  />
                ) : null}
                <button
                  type="button"
                  className="agent-hub-head__tool"
                  aria-label={t('actions.search')}
                  title={t('actions.search')}
                  aria-expanded={searchOpen}
                  onClick={() => setSearchOpen(open => !open)}
                >
                  <Search size={15} aria-hidden="true" />
                </button>
                <div className="agent-hub-head__create">
                  <button
                    type="button"
                    className="agent-hub-head__tool"
                    aria-label={t('actions.create')}
                    title={t('actions.create')}
                    aria-haspopup="menu"
                    aria-expanded={createMenuOpen}
                    onClick={() => setCreateMenuOpen(open => !open)}
                  >
                    <Plus size={15} aria-hidden="true" />
                  </button>
                  {createMenuOpen ? (
                    <div className="agent-hub-head__menu" role="menu">
                      {createItems.map(item => (
                        <button
                          key={item.key}
                          type="button"
                          role="menuitem"
                          className="agent-hub-head__menu-item"
                          onClick={() => {
                            setCreateMenuOpen(false);
                            item.onSelect();
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <p className="agent-hub-head__mission">{t('page.mission')}</p>
          </header>

          <div className="agent-hub-tabs" role="tablist" aria-label={t('tabs.ariaLabel')}>
            {TABS.map(tab => (
              <button
                key={tab}
                type="button"
                role="tab"
                ref={element => { tabRefs.current[tab] = element; }}
                className={`agent-hub-tabs__tab${tab === activeTab ? ' is-active' : ''}`}
                aria-selected={tab === activeTab}
                tabIndex={tab === activeTab ? 0 : -1}
                onClick={() => setActiveTab(tab)}
                onKeyDown={handleTabKeyDown}
              >
                {tab === 'all' ? t('tabs.all') : t(`tabs.${tab}`)}
              </button>
            ))}
          </div>

          <div className="agent-hub-body">
            {activeTab === 'all'
              ? AGENT_HUB_ROW_TYPES.map(renderGroup)
              : renderTypeTab(activeTab)}
          </div>
        </div>
      ) : (
        <div className="void-agent-hub__hosted">
          <header className="agent-hub-hosted-head">
            <button
              type="button"
              className="agent-hub-hosted-head__back"
              onClick={() => {
                setHubPage('home');
                openHome();
              }}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              {t('hosted.backToDirectory')}
            </button>
            <h2 className="agent-hub-hosted-head__title">
              {t(HOSTED_PAGE_TITLES[hubPage])}
            </h2>
          </header>
          <div className="void-agent-hub__hosted-page">
            {renderHostedPage(hubPage)}
          </div>
        </div>
      )}

      <GalleryDetailModal
        isOpen={Boolean(detailAgent)}
        onClose={() => setDetailRow(null)}
        icon={detailAgent ? (
          <AgentAvatar
            identity={detailAgent.key || detailAgent.id || detailAgent.name}
            name={detailAgent.displayName}
            size="detail"
            state="active"
          />
        ) : <Bot size={24} />}
        title={detailAgent?.displayName ?? ''}
        badges={detailAgent ? (
          <Badge variant={getAgentBadge(tAgents, detailAgent.agentKind, detailAgent.subagentSource).variant}>
            {getAgentBadge(tAgents, detailAgent.agentKind, detailAgent.subagentSource).label}
          </Badge>
        ) : null}
        description={detailAgent ? getAgentDescription(tAgents, detailAgent) : undefined}
        children={detailAgent ? (
          <AgentEquipmentPanel
            agent={detailAgent}
            availableTools={directory.agentCapabilities.availableTools}
            modeConfig={directory.agentCapabilities.getModeConfig(detailAgent.id)}
            modeSkills={directory.agentCapabilities.getModeSkills(detailAgent.id)}
            manageableSubagents={directory.agentCapabilities.getModeManageableSubagents(detailAgent.id)}
            onSetTools={directory.agentCapabilities.handleSetTools}
            onResetTools={directory.agentCapabilities.handleResetTools}
            onSetSkills={directory.agentCapabilities.handleSetSkills}
            onResetSkills={directory.agentCapabilities.handleResetSkills}
            onSetSubagentEnabled={directory.agentCapabilities.handleSetSubagentEnabled}
          />
        ) : null}
        actions={detailAgent && detailRow ? (
          <Button
            variant="primary"
            size="small"
            disabled={!canDispatchCustomizationTarget(detailAgent.catalogEntry)}
            isLoading={dispatchingRowId === detailRow.id}
            onClick={() => { void dispatchRow(detailRow); }}
          >
            <Send size={14} />
            {t('actions.dispatch')}
          </Button>
        ) : null}
      />

      <GalleryDetailModal
        isOpen={Boolean(detailSkill)}
        onClose={() => setDetailRow(null)}
        icon={detailSkill && detailRow ? (
          <SkillCatalogAvatar
            identity={detailSkill.key}
            name={detailRow.name}
            size="detail"
          />
        ) : null}
        title={detailRow?.type === 'skill' ? detailRow.name : ''}
        description={detailRow?.type === 'skill' ? detailRow.line : undefined}
        actions={detailSkill ? (
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setDetailRow(null);
              openSkillAuthoring('edit', detailSkill.key);
            }}
          >
            <Pencil size={14} />
            {t('actions.edit')}
          </Button>
        ) : null}
      />

      <TeamCatalogDetail
        team={detailTeam}
        onClose={() => setDetailTeamId(null)}
        onOpenReviewTeam={() => {
          setDetailTeamId(null);
          openReviewTeam();
        }}
        onEdit={team => {
          setDetailTeamId(null);
          if (team.definitionLevel) {
            openEditTeam(team.identity.id, team.definitionLevel);
          }
        }}
        onDelete={() => {
          setDetailTeamId(null);
        }}
        onDispatch={() => {
          const row = detailTeamId
            ? filteredSections.team.rows.find(item => item.id === detailTeamId)
            : undefined;
          if (row) void dispatchRow(row);
        }}
        dispatching={Boolean(detailTeamId) && dispatchingRowId === detailTeamId}
      />
    </main>
  );
};

export default AgentHubScene;
