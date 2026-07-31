import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import {
  Bot,
  Cpu,
  RotateCcw,
  Pencil,
  Plus,
  Puzzle,
  Search as SearchIcon,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, IconButton, Search, Switch, confirmDanger } from '@/component-library';
import {
  GalleryDetailModal,
  GalleryEmpty,
  GalleryGrid,
  GalleryLayout,
  GallerySkeleton,
  GalleryZone,
} from '@/app/components';
import AgentCard from './components/AgentCard';
import AgentAvatar from './components/AgentAvatar';
import CoreAgentCard, { type CoreAgentMeta } from './components/CoreAgentCard';
import CreateAgentPage from './components/CreateAgentPage';
import ReviewTeamPage, { ReviewTeamErrorBoundary } from './components/ReviewTeamPage';
import TeamAuthoringPage from './components/TeamAuthoringPage';
import TeamsCatalogView from './components/TeamsCatalogView';
import CatalogPagination from './components/CatalogPagination';
import {
  type AgentWithCapabilities,
  useAgentsStore,
} from './agentsStore';
import { useAgentsList } from './hooks/useAgentsList';
import { CAPABILITY_ACCENT } from './agentsIcons';
import { getAgentBadge, getAgentDescription, getCapabilityLabel } from './utils';
import './AgentsView.scss';
import './AgentsScene.scss';
import { useGallerySceneAutoRefresh } from '@/app/hooks/useGallerySceneAutoRefresh';
import { CORE_AGENT_IDS, isAgentInOverviewZone } from './agentVisibility';
import { SubagentAPI } from '@/infrastructure/api/service-api/SubagentAPI';
import type { ModeSkillInfo } from '@/infrastructure/config/types';
import type { SubagentInfo } from '@/infrastructure/api/service-api/SubagentAPI';
import { useNotification } from '@/shared/notification-system';
import { useCurrentWorkspace } from '@/infrastructure/contexts/WorkspaceContext';
import {
  localizeCatalogPresentation,
  resolveDefaultCatalogPresentation,
} from '@/shared/services/customization/presentationMetadata';
import {
  resolveSkillCatalogPresentation,
} from '@/shared/services/customization/skillCatalogPresentation';
import {
  customizationRuntimeCapabilityService,
  type CustomizationRuntimeCapabilityReader,
} from '@/shared/services/customization/CustomizationRuntimeCapabilityService';
import {
  buildAgentToolGroups,
  setCapabilityGroupEnabled,
} from './agentCapabilityGroups';

const UNGROUPED_SKILL_GROUP = '__ungrouped__';
const AGENT_PAGE_SIZE = 8;

const SKILL_GROUP_ORDER: Record<string, number> = {
  office: 0,
  meta: 1,
  team: 2,
  [UNGROUPED_SKILL_GROUP]: 99,
};

interface SkillGroup {
  key: string;
  label: string;
  skills: ModeSkillInfo[];
  enabledCount: number;
  totalCount: number;
}

type CapabilityTab = 'tools' | 'skills' | 'subagents';

function getConfiguredEnabledSkillKeys(skills: ModeSkillInfo[]): string[] {
  return skills.filter((skill) => skill.effectiveEnabled).map((skill) => skill.key);
}

function modeHasSkillTool(enabledTools: string[]): boolean {
  return enabledTools.includes('Skill');
}

function modeHasTaskTool(enabledTools: string[]): boolean {
  return enabledTools.includes('Task');
}

function buildDuplicateSkillNameSet(skills: ModeSkillInfo[]): Set<string> {
  const counts = new Map<string, number>();
  for (const skill of skills) {
    counts.set(skill.name, (counts.get(skill.name) ?? 0) + 1);
  }
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name),
  );
}

function formatSkillOrigin(skill: ModeSkillInfo): string {
  return `${skill.level}/${skill.sourceSlot}`;
}

function localizedSkillPresentation(
  skill: ModeSkillInfo,
  tSkills: TFunction<'scenes/skills'>,
) {
  return localizeCatalogPresentation(resolveSkillCatalogPresentation({
    id: skill.key,
    name: skill.name,
    description: skill.description,
    dirName: skill.dirName,
    isBuiltin: skill.isBuiltin,
  }), key => tSkills(key));
}

function formatSkillDisplayName(
  skill: ModeSkillInfo,
  duplicateNames: Set<string>,
  tSkills: TFunction<'scenes/skills'>,
): string {
  const presentation = localizedSkillPresentation(skill, tSkills);
  if (!duplicateNames.has(skill.name)) {
    return presentation.displayName;
  }
  return `${presentation.displayName} [${formatSkillOrigin(skill)}]`;
}

function getSkillGroupKey(skill: ModeSkillInfo): string {
  return skill.groupKey?.trim() || UNGROUPED_SKILL_GROUP;
}

function getSkillGroupLabel(groupKey: string, t: TFunction<'scenes/agents'>): string {
  switch (groupKey) {
    case 'office':
      return t('agentsOverview.skillGroups.office');
    case 'computer-use':
      return t('agentsOverview.skillGroups.computerUse');
    case 'meta':
      return t('agentsOverview.skillGroups.meta');
    case 'team':
      return t('agentsOverview.skillGroups.team');
    default:
      return t('agentsOverview.skillGroups.other');
  }
}

function getSkillTitle(
  skill: ModeSkillInfo,
  t: TFunction<'scenes/agents'>,
  tSkills: TFunction<'scenes/skills'>,
): string {
  const presentation = localizedSkillPresentation(skill, tSkills);
  return [
    presentation.description || presentation.displayName,
    `key: ${skill.key}`,
    skill.effectiveEnabled && !skill.selectedForRuntime
      ? t('agentsOverview.skillShadowed')
      : null,
  ].filter(Boolean).join('\n');
}

function subagentPresentation(
  subagent: SubagentInfo,
  t: TFunction<'scenes/agents'>,
) {
  return localizeCatalogPresentation(resolveDefaultCatalogPresentation({
    kind: 'subagent',
    id: subagent.id,
    runtimeName: subagent.name,
    runtimeDescription: subagent.description,
  }), key => t(key));
}

function buildSkillGroups(
  skills: ModeSkillInfo[],
  enabledSkillKeys: string[],
  t: TFunction<'scenes/agents'>,
): SkillGroup[] {
  const enabledSkillKeySet = new Set(enabledSkillKeys);
  const groups = new Map<string, ModeSkillInfo[]>();

  for (const skill of skills) {
    const groupKey = getSkillGroupKey(skill);
    const items = groups.get(groupKey);
    if (items) {
      items.push(skill);
    } else {
      groups.set(groupKey, [skill]);
    }
  }

  return [...groups.entries()]
    .map(([groupKey, groupSkills]) => ({
      key: groupKey,
      label: getSkillGroupLabel(groupKey, t),
      skills: [...groupSkills].sort((a, b) => {
        const aEnabled = enabledSkillKeySet.has(a.key);
        const bEnabled = enabledSkillKeySet.has(b.key);
        if (aEnabled && !bEnabled) return -1;
        if (!aEnabled && bEnabled) return 1;
        return a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
      }),
      enabledCount: groupSkills.filter((skill) => enabledSkillKeySet.has(skill.key)).length,
      totalCount: groupSkills.length,
    }))
    .sort((a, b) => {
      const orderDiff = (SKILL_GROUP_ORDER[a.key] ?? 50) - (SKILL_GROUP_ORDER[b.key] ?? 50);
      if (orderDiff !== 0) {
        return orderDiff;
      }
      return a.label.localeCompare(b.label);
    });
}

const AgentsHomeView: React.FC = () => {
  const { t } = useTranslation('scenes/agents');
  const { t: tSkills } = useTranslation('scenes/skills');
  const notification = useNotification();
  const { workspacePath } = useCurrentWorkspace();
  const [deletingAgent, setDeletingAgent] = useState(false);
  const {
    searchQuery,
    agentFilterLevel,
    agentFilterType,
    setSearchQuery,
    setAgentFilterLevel,
    setAgentFilterType,
    openCreateAgent,
    openEditAgent,
  } = useAgentsStore();
  const [selectedAgentKey, setSelectedAgentKey] = React.useState<string | null>(null);
  const [agentPage, setAgentPage] = React.useState(0);
  const [activeCapabilityTab, setActiveCapabilityTab] = React.useState<CapabilityTab>('tools');
  const [toolsEditing, setToolsEditing] = React.useState(false);
  const [skillsEditing, setSkillsEditing] = React.useState(false);
  const [subagentsEditing, setSubagentsEditing] = React.useState(false);
  const [pendingTools, setPendingTools] = React.useState<string[] | null>(null);
  const [pendingSkills, setPendingSkills] = React.useState<string[] | null>(null);
  const [pendingSubagentKeys, setPendingSubagentKeys] = React.useState<string[] | null>(null);
  const [savingTools, setSavingTools] = React.useState(false);
  const [savingSkills, setSavingSkills] = React.useState(false);
  const [savingSubagents, setSavingSubagents] = React.useState(false);

  const {
    allAgents,
    filteredAgents,
    loading,
    availableTools,
    getModeProfile,
    getModeSkills,
    getModeManageableSubagents,
    counts,
    hiddenAgentIds,
    loadAgents,
    getModeConfig,
    handleSetTools,
    handleResetTools,
    handleSetSkills,
    handleResetSkills,
    handleSetSubagentEnabled,
  } = useAgentsList({
    searchQuery,
    filterLevel: agentFilterLevel,
    filterType: agentFilterType,
    t,
  });

  useGallerySceneAutoRefresh({
    sceneId: 'agents',
    refetch: () => {
      void loadAgents();
    },
  });

  const coreAgentMeta = useMemo((): Record<string, CoreAgentMeta> => ({
    agentic: {
      role: t('coreAgentsZone.modes.agentic.role'),
    },
    Cowork: {
      role: t('coreAgentsZone.modes.cowork.role'),
    },
    Media: {
      role: t('coreAgentsZone.modes.media.role'),
    },
    ComputerUse: {
      role: t('coreAgentsZone.modes.computerUse.role'),
    },
  }), [t]);

  const coreAgents = useMemo(() => allAgents.filter((agent) => CORE_AGENT_IDS.has(agent.id)), [allAgents]);

  const visibleAgents = useMemo(
    () => filteredAgents.filter((agent) => isAgentInOverviewZone(agent, hiddenAgentIds)),
    [filteredAgents, hiddenAgentIds],
  );

  const totalAgentPages = Math.max(1, Math.ceil(visibleAgents.length / AGENT_PAGE_SIZE));
  const pagedAgents = useMemo(
    () => visibleAgents.slice(
      agentPage * AGENT_PAGE_SIZE,
      (agentPage + 1) * AGENT_PAGE_SIZE,
    ),
    [agentPage, visibleAgents],
  );

  useEffect(() => {
    setAgentPage(0);
  }, [agentFilterLevel, agentFilterType, searchQuery]);

  useEffect(() => {
    setAgentPage((page) => Math.min(page, totalAgentPages - 1));
  }, [totalAgentPages]);

  const scrollToZone = useCallback((targetId: string) => {
    document.getElementById(targetId)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, []);

  const changeAgentPage = useCallback((page: number) => {
    setAgentPage(Math.max(0, Math.min(page, totalAgentPages - 1)));
    scrollToZone('agents-zone');
  }, [scrollToZone, totalAgentPages]);

  const levelFilters = [
    { key: 'builtin', label: t('filters.builtin'), count: counts.builtin },
    { key: 'user', label: t('filters.user'), count: counts.user },
    { key: 'project', label: t('filters.project'), count: counts.project },
  ] as const;

  const typeFilters = [
    { key: 'mode', label: t('filters.mode'), count: counts.mode },
    { key: 'subagent', label: t('filters.subagent'), count: counts.subagent },
  ] as const;

  const renderSkeletons = (prefix: string) => (
    <GallerySkeleton count={8} cardHeight={138} className={`${prefix}-skeleton`} />
  );

  const selectedAgent = useMemo(
    () => allAgents.find((agent) => agent.key === selectedAgentKey) ?? null,
    [allAgents, selectedAgentKey],
  );
  const selectedAgentModeConfig = useMemo(
    () => (selectedAgent?.agentKind === 'mode' ? getModeConfig(selectedAgent.id) : null),
    [getModeConfig, selectedAgent],
  );
  const selectedAgentModeProfile = useMemo(
    () => (selectedAgent?.agentKind === 'mode' ? getModeProfile(selectedAgent.id) : null),
    [getModeProfile, selectedAgent],
  );
  const selectedAgentModeSkills = useMemo(
    () => (selectedAgent?.agentKind === 'mode' ? getModeSkills(selectedAgent.id) : []),
    [getModeSkills, selectedAgent],
  );
  const selectedAgentManageableSubagents = useMemo(
    () => (selectedAgent?.agentKind === 'mode' ? getModeManageableSubagents(selectedAgent.id) : []),
    [getModeManageableSubagents, selectedAgent],
  );
  const selectedAgentTools = useMemo(() => (
    selectedAgent?.agentKind === 'mode'
      ? (selectedAgentModeConfig?.enabled_tools ?? selectedAgent.defaultTools ?? [])
      : (selectedAgent?.defaultTools ?? [])
  ), [selectedAgent, selectedAgentModeConfig]);
  const selectedAgentHasSkillTool = selectedAgent?.agentKind === 'mode'
    ? modeHasSkillTool(selectedAgentTools)
    : false;
  const selectedAgentHasTaskTool = selectedAgent?.agentKind === 'mode'
    ? modeHasTaskTool(selectedAgentTools)
    : false;
  const selectedAgentEnabledSubagents = useMemo(
    () => selectedAgentManageableSubagents.filter((subagent) => subagent.effectiveEnabled),
    [selectedAgentManageableSubagents],
  );
  const selectedAgentDefaultEnabledSubagentKeys = useMemo(
    () => selectedAgentManageableSubagents
      .filter((subagent) => subagent.defaultEnabled)
      .map((subagent) => subagent.key),
    [selectedAgentManageableSubagents],
  );
  const selectedAgentEnabledSubagentKeys = useMemo(
    () => selectedAgentEnabledSubagents.map((subagent) => subagent.key),
    [selectedAgentEnabledSubagents],
  );
  const selectedAgentSkills = useMemo(
    () => getConfiguredEnabledSkillKeys(selectedAgentModeSkills),
    [selectedAgentModeSkills],
  );
  const toolGroupLabels = useMemo(() => ({
    core: t('agentsOverview.toolGroups.core'),
    on_demand: t('agentsOverview.toolGroups.onDemand'),
    mcp: t('agentsOverview.toolGroups.mcp'),
    integration: t('agentsOverview.toolGroups.integration'),
  }), [t]);
  const selectedAgentToolGroups = useMemo(
    () => buildAgentToolGroups(availableTools, selectedAgentTools, toolGroupLabels),
    [availableTools, selectedAgentTools, toolGroupLabels],
  );
  const editableToolGroups = useMemo(
    () => buildAgentToolGroups(
      availableTools,
      pendingTools ?? selectedAgentTools,
      toolGroupLabels,
    ),
    [availableTools, pendingTools, selectedAgentTools, toolGroupLabels],
  );
  const selectedAgentSkillItems = useMemo(
    () => selectedAgentModeSkills.filter((skill) => skill.effectiveEnabled),
    [selectedAgentModeSkills],
  );
  const selectedAgentSkillGroups = useMemo(
    () => buildSkillGroups(selectedAgentModeSkills, selectedAgentSkills, t),
    [selectedAgentModeSkills, selectedAgentSkills, t],
  );
  const editableSkillGroups = useMemo(
    () => buildSkillGroups(selectedAgentModeSkills, pendingSkills ?? selectedAgentSkills, t),
    [pendingSkills, selectedAgentModeSkills, selectedAgentSkills, t],
  );
  const selectedAgentDuplicateSkillNames = useMemo(
    () => buildDuplicateSkillNameSet(selectedAgentModeSkills),
    [selectedAgentModeSkills],
  );
  const selectedAgentProfileMemberNames = useMemo(() => {
    if (!selectedAgentModeProfile) {
      return [];
    }

    return selectedAgentModeProfile.memberModeIds.map((memberId) => (
      allAgents.find((agent) => agent.agentKind === 'mode' && agent.id === memberId)?.displayName ?? memberId
    ));
  }, [allAgents, selectedAgentModeProfile]);
  const selectedAgentUsesSharedProfile = (selectedAgentModeProfile?.memberModeIds.length ?? 0) > 1;
  const getDisplayedToolCount = useCallback((agent: AgentWithCapabilities): number => {
    if (agent.agentKind === 'mode') {
      return getModeConfig(agent.id)?.enabled_tools?.length
        ?? agent.defaultTools?.length
        ?? agent.toolCount
        ?? 0;
    }
    return agent.toolCount ?? agent.defaultTools?.length ?? 0;
  }, [getModeConfig]);
  const selectedAgentToolCount = selectedAgent ? getDisplayedToolCount(selectedAgent) : 0;
  const selectedAgentCapabilityTabs = useMemo(() => {
    const tabs: Array<{
      key: CapabilityTab;
      icon: typeof Wrench;
      label: string;
      count: string;
    }> = [];

    if (selectedAgentTools.length > 0) {
      const currentToolCount = selectedAgent?.agentKind === 'mode'
        ? (toolsEditing ? (pendingTools ?? selectedAgentTools).length : selectedAgentTools.length)
        : selectedAgentTools.length;
      const totalToolCount = selectedAgent?.agentKind === 'mode'
        ? availableTools.length
        : selectedAgentTools.length;

      tabs.push({
        key: 'tools',
        icon: Wrench,
        label: t('agentsOverview.tools'),
        count: selectedAgent?.agentKind === 'mode'
          ? `${currentToolCount}/${totalToolCount}`
          : `${currentToolCount}`,
      });
    }

    if (selectedAgent?.agentKind === 'mode' && selectedAgentHasSkillTool && selectedAgentModeSkills.length > 0) {
      tabs.push({
        key: 'skills',
        icon: Puzzle,
        label: t('agentsOverview.skills'),
        count: `${(skillsEditing ? (pendingSkills ?? selectedAgentSkills) : selectedAgentSkills).length}/${selectedAgentModeSkills.length}`,
      });
    }

    if (selectedAgent?.agentKind === 'mode' && selectedAgentHasTaskTool) {
      const currentSubagentKeys = subagentsEditing
        ? (pendingSubagentKeys ?? selectedAgentEnabledSubagentKeys)
        : selectedAgentEnabledSubagentKeys;
      tabs.push({
        key: 'subagents',
        icon: Bot,
        label: t('agentsOverview.subagents'),
        count: `${currentSubagentKeys.length}/${selectedAgentManageableSubagents.length}`,
      });
    }

    return tabs;
  }, [
    availableTools.length,
    pendingSkills,
    pendingSubagentKeys,
    pendingTools,
    selectedAgent,
    selectedAgentEnabledSubagentKeys,
    selectedAgentHasSkillTool,
    selectedAgentHasTaskTool,
    selectedAgentManageableSubagents.length,
    selectedAgentModeSkills.length,
    selectedAgentSkills,
    selectedAgentTools,
    skillsEditing,
    subagentsEditing,
    t,
    toolsEditing,
  ]);
  const currentCapabilityTab = useMemo(() => {
    if (selectedAgentCapabilityTabs.some((tab) => tab.key === activeCapabilityTab)) {
      return activeCapabilityTab;
    }
    return selectedAgentCapabilityTabs[0]?.key ?? 'tools';
  }, [activeCapabilityTab, selectedAgentCapabilityTabs]);
  const isCurrentTabEditing = currentCapabilityTab === 'tools'
    ? toolsEditing
    : currentCapabilityTab === 'skills'
      ? skillsEditing
      : subagentsEditing;
  const resetEditState = useCallback(() => {
    setToolsEditing(false);
    setSkillsEditing(false);
    setSubagentsEditing(false);
    setPendingTools(null);
    setPendingSkills(null);
    setPendingSubagentKeys(null);
    setSavingTools(false);
    setSavingSkills(false);
    setSavingSubagents(false);
  }, []);

  const togglePendingSkill = useCallback((skillKey: string) => {
    setPendingSkills((prev) => {
      const current = prev ?? selectedAgentSkills;
      return current.includes(skillKey)
        ? current.filter((key) => key !== skillKey)
        : [...current, skillKey];
    });
  }, [selectedAgentSkills]);

  const setPendingToolGroupEnabled = useCallback((toolNames: string[], enabled: boolean) => {
    setPendingTools((prev) => setCapabilityGroupEnabled(
      prev ?? selectedAgentTools,
      toolNames,
      enabled,
    ));
  }, [selectedAgentTools]);

  const setPendingSkillGroupEnabled = useCallback((skills: ModeSkillInfo[], enabled: boolean) => {
    setPendingSkills((prev) => setCapabilityGroupEnabled(
      prev ?? selectedAgentSkills,
      skills.map((skill) => skill.key),
      enabled,
    ));
  }, [selectedAgentSkills]);

  const openAgentDetails = useCallback((agent: AgentWithCapabilities) => {
    setSelectedAgentKey(agent.key);
    setActiveCapabilityTab('tools');
    resetEditState();
  }, [resetEditState]);

  const closeAgentDetails = useCallback(() => {
    setSelectedAgentKey(null);
    setActiveCapabilityTab('tools');
    resetEditState();
  }, [resetEditState]);

  useEffect(() => {
    if (!selectedAgentCapabilityTabs.some((tab) => tab.key === activeCapabilityTab)) {
      setActiveCapabilityTab(selectedAgentCapabilityTabs[0]?.key ?? 'tools');
    }
  }, [activeCapabilityTab, selectedAgentCapabilityTabs]);

  const handleDeleteCustomAgent = useCallback(async () => {
    if (!selectedAgent) return;
    if (
      selectedAgent.agentKind !== 'subagent'
      || (selectedAgent.subagentSource !== 'user' && selectedAgent.subagentSource !== 'project')
    ) {
      return;
    }
    const id = selectedAgent.id;
    const name = selectedAgent.displayName;
    const ok = await confirmDanger(
      t('agentsOverview.deleteAgent'),
      t('agentsOverview.deleteConfirm', { name }),
    );
    if (!ok) return;
    setDeletingAgent(true);
    try {
      await SubagentAPI.deleteSubagent({
        subagentKey: selectedAgent.key,
        subagentId: id,
        workspacePath: selectedAgent.subagentSource === 'project'
          ? workspacePath || undefined
          : undefined,
      });
      notification.success(t('agentsOverview.deleteSuccess', { name }));
      closeAgentDetails();
      await loadAgents();
    } catch (e) {
      notification.error(
        `${t('agentsOverview.deleteFailed')}${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setDeletingAgent(false);
    }
  }, [selectedAgent, closeAgentDetails, loadAgents, notification, t, workspacePath]);

  const canManageCustomSubagent = Boolean(
    selectedAgent
    && selectedAgent.agentKind === 'subagent'
    && (selectedAgent.subagentSource === 'user' || selectedAgent.subagentSource === 'project'),
  );

  return (
    <GalleryLayout className="void-agents-scene">
      <div className="agent-market-toolbar">
        <div className="gallery-anchor-bar">
          <button
            type="button"
            className="gallery-anchor-btn"
            onClick={() => scrollToZone('core-agents-zone')}
          >
            {t('nav.coreAgents')}
          </button>
          <button
            type="button"
            className="gallery-anchor-btn"
            onClick={() => scrollToZone('agents-zone')}
          >
            {t('nav.agents')}
          </button>
        </div>
        <Search
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={t('page.searchPlaceholder')}
          size="small"
          clearable
          prefixIcon={<SearchIcon size={14} />}
        />
      </div>

      <div className="gallery-zones">
        <GalleryZone
          id="core-agents-zone"
          title={t('coreAgentsZone.title')}
          subtitle={t('coreAgentsZone.subtitle')}
          tools={(
            <span className="gallery-zone-count">{coreAgents.length}</span>
          )}
        >
          {loading ? (
            <GallerySkeleton count={3} cardHeight={160} className="core-agent-skeleton" />
          ) : coreAgents.length === 0 ? (
            <GalleryEmpty
              icon={<Cpu size={32} strokeWidth={1.5} />}
              message={t('coreAgentsZone.empty')}
            />
          ) : (
            <div className="core-agents-grid">
              {coreAgents.map((agent, index) => (
                <CoreAgentCard
                  key={agent.key}
                  agent={agent}
                  index={index}
                  meta={coreAgentMeta[agent.id] ?? { role: agent.displayName }}
                  onOpenDetails={openAgentDetails}
                />
              ))}
            </div>
          )}
        </GalleryZone>

        <GalleryZone
          id="agents-zone"
          title={t('agentsZone.title')}
          subtitle={t('agentsZone.subtitle')}
          tools={(
            <>
              <div className="void-agents-scene__agent-filters">
                <div className="void-agents-scene__agent-filter-group">
                  <span className="void-agents-scene__agent-filter-label">
                    {t('filters.source')}
                  </span>
                  {levelFilters.map(({ key, label, count }) => (
                    <button
                      key={key}
                      type="button"
                      className={[
                        'gallery-cat-chip',
                        agentFilterLevel === key && 'gallery-cat-chip--active',
                      ].filter(Boolean).join(' ')}
                      onClick={() => setAgentFilterLevel(agentFilterLevel === key ? 'all' : key)}
                    >
                      <span>{label}</span>
                      <span className="gallery-filter-count">{count}</span>
                    </button>
                  ))}
                </div>
                <div className="void-agents-scene__agent-filter-group">
                  <span className="void-agents-scene__agent-filter-label">
                    {t('filters.kind')}
                  </span>
                  {typeFilters.map(({ key, label, count }) => (
                    <button
                      key={key}
                      type="button"
                      className={[
                        'gallery-cat-chip',
                        agentFilterType === key && 'gallery-cat-chip--active',
                      ].filter(Boolean).join(' ')}
                      onClick={() => setAgentFilterType(agentFilterType === key ? 'all' : key)}
                    >
                      <span>{label}</span>
                      <span className="gallery-filter-count">{count}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="gallery-action-btn gallery-action-btn--primary"
                onClick={openCreateAgent}
              >
                <Plus size={15} />
                <span>{t('page.newAgent')}</span>
              </button>
            </>
          )}
        >
          {loading ? renderSkeletons('agent') : null}

          {!loading && visibleAgents.length === 0 ? (
            <GalleryEmpty
              icon={<Bot size={32} strokeWidth={1.5} />}
              message={allAgents.length === 0 ? t('agentsZone.empty.noAgents') : t('agentsZone.empty.noMatch')}
            />
          ) : null}

          {!loading && visibleAgents.length > 0 ? (
            <>
              <GalleryGrid minCardWidth={280}>
                {pagedAgents.map((agent, index) => (
                  <AgentCard
                    key={agent.key}
                    agent={agent}
                    index={agentPage * AGENT_PAGE_SIZE + index}
                    onOpenDetails={openAgentDetails}
                  />
                ))}
              </GalleryGrid>
              <CatalogPagination
                currentPage={agentPage}
                totalPages={totalAgentPages}
                onPageChange={changeAgentPage}
              />
            </>
          ) : null}
        </GalleryZone>
      </div>

      <GalleryDetailModal
        isOpen={Boolean(selectedAgent)}
        onClose={closeAgentDetails}
        icon={selectedAgent ? (
          <AgentAvatar
            identity={selectedAgent.key || selectedAgent.id || selectedAgent.name}
            name={selectedAgent.displayName}
            size="detail"
          />
        ) : <Bot size={24} />}
        title={selectedAgent?.displayName ?? ''}
        badges={selectedAgent ? (
          <>
            <Badge variant={getAgentBadge(t, selectedAgent.agentKind, selectedAgent.subagentSource).variant}>
              {selectedAgent.agentKind === 'mode' ? <Cpu size={10} /> : <Bot size={10} />}
              {getAgentBadge(t, selectedAgent.agentKind, selectedAgent.subagentSource).label}
            </Badge>
            {selectedAgent.model ? <Badge variant="neutral">{selectedAgent.model}</Badge> : null}
          </>
        ) : null}
        description={selectedAgent
          ? getAgentDescription(t, selectedAgent)
          : undefined}
        meta={selectedAgent ? (
          <>
            <span>{t('agentCard.meta.tools', { count: selectedAgentToolCount })}</span>
            {selectedAgent.agentKind === 'mode' && selectedAgentHasSkillTool ? (
              <span>{t('agentCard.meta.skills', { count: selectedAgentSkills.length })}</span>
            ) : null}
            {selectedAgent.agentKind === 'mode' && selectedAgentHasTaskTool ? (
              <span>{t('agentCard.meta.subagents', { count: selectedAgentManageableSubagents.filter((subagent) => subagent.effectiveEnabled).length })}</span>
            ) : null}
          </>
        ) : null}
      >
        {selectedAgent ? (
          <>
            <div className="agent-card__cap-grid">
              {selectedAgent.capabilities.map((cap) => (
                <div key={cap.category} className="agent-card__cap-row">
                  <span
                    className="agent-card__cap-label"
                    style={{ color: CAPABILITY_ACCENT[cap.category] }}
                  >
                    {getCapabilityLabel(t, cap.category)}
                  </span>
                  <div className="agent-card__cap-bar">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span
                        key={i}
                        className="agent-card__cap-pip"
                        style={i < cap.level ? { backgroundColor: CAPABILITY_ACCENT[cap.category] } : undefined}
                      />
                    ))}
                  </div>
                  <span className="agent-card__cap-level">{cap.level}/5</span>
                </div>
              ))}
            </div>

            {selectedAgent.agentKind === 'mode' && selectedAgentUsesSharedProfile ? (
              <div className="agent-card__section">
                <div className="agent-card__section-head">
                  <div className="agent-card__section-title">
                    <span>{t('agentsOverview.sharedProfileLabel')}</span>
                  </div>
                </div>
                <div className="agent-card__chip-grid">
                  <span className="agent-card__chip">
                    {selectedAgentModeProfile?.profileLabel ?? t('agentsOverview.sharedProfileDefaultLabel')}
                  </span>
                </div>
                <p className="agent-card__section-note">
                  {t('agentsOverview.sharedProfileDescription', {
                    modes: selectedAgentProfileMemberNames.join(', '),
                  })}
                </p>
              </div>
            ) : null}

            {selectedAgentCapabilityTabs.length > 0 ? (
              <div className="agent-card__section">
                <div className="agent-card__section-head">
                  <div className="agent-card__tab-list" role="tablist" aria-label={t('agentsOverview.capabilities')}>
                    {selectedAgentCapabilityTabs.map((tab) => {
                      const TabIcon = tab.icon;
                      const isActive = tab.key === currentCapabilityTab;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          className={`agent-card__tab${isActive ? ' is-active' : ''}`}
                          onClick={() => setActiveCapabilityTab(tab.key)}
                        >
                          <TabIcon size={12} />
                          <span>{tab.label}</span>
                          {isActive ? (
                            <span className="agent-card__tab-count">{tab.count}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {selectedAgent.agentKind === 'mode' ? (
                    <div className="agent-card__section-actions">
                      {isCurrentTabEditing ? (
                        <>
                          <IconButton
                            size="small"
                            variant="ghost"
                            tooltip={
                              currentCapabilityTab === 'tools'
                                ? t('agentsOverview.toolsReset')
                                : currentCapabilityTab === 'skills'
                                  ? t('agentsOverview.reset')
                                  : t('agentsOverview.reset')
                            }
                            onClick={async () => {
                              if (currentCapabilityTab === 'tools') {
                                await handleResetTools(selectedAgent.id);
                                setToolsEditing(false);
                                setPendingTools(null);
                                return;
                              }
                              if (currentCapabilityTab === 'skills') {
                                await handleResetSkills(selectedAgent.id);
                                setSkillsEditing(false);
                                setPendingSkills(null);
                                return;
                              }
                              setSavingSubagents(true);
                              try {
                                const currentEnabledKeys = new Set(selectedAgentEnabledSubagentKeys);
                                const defaultEnabledKeys = new Set(selectedAgentDefaultEnabledSubagentKeys);
                                const changedSubagents = selectedAgentManageableSubagents.filter((subagent) =>
                                  currentEnabledKeys.has(subagent.key) !== defaultEnabledKeys.has(subagent.key));

                                if (changedSubagents.length === 0) {
                                  setSubagentsEditing(false);
                                  setPendingSubagentKeys(null);
                                  return;
                                }

                                for (const subagent of changedSubagents) {
                                  await handleSetSubagentEnabled(
                                    selectedAgent.id,
                                    subagent,
                                    defaultEnabledKeys.has(subagent.key),
                                  );
                                }
                              } finally {
                                setSavingSubagents(false);
                                setSubagentsEditing(false);
                                setPendingSubagentKeys(null);
                              }
                            }}
                          >
                            <RotateCcw size={12} />
                          </IconButton>
                          <Button
                            variant="ghost"
                            size="small"
                            onClick={() => {
                              if (currentCapabilityTab === 'tools') {
                                setToolsEditing(false);
                                setPendingTools(null);
                                return;
                              }
                              if (currentCapabilityTab === 'skills') {
                                setSkillsEditing(false);
                                setPendingSkills(null);
                                return;
                              }
                              setSubagentsEditing(false);
                              setPendingSubagentKeys(null);
                            }}
                          >
                            {t('agentsOverview.cancel')}
                          </Button>
                          <Button
                            variant="primary"
                            size="small"
                            isLoading={
                              currentCapabilityTab === 'tools'
                                ? savingTools
                                : currentCapabilityTab === 'skills'
                                  ? savingSkills
                                  : savingSubagents
                            }
                            onClick={async () => {
                              if (currentCapabilityTab === 'tools') {
                                if (!pendingTools) {
                                  setToolsEditing(false);
                                  return;
                                }
                                setSavingTools(true);
                                try {
                                  await handleSetTools(selectedAgent.id, pendingTools);
                                } finally {
                                  setSavingTools(false);
                                  setToolsEditing(false);
                                  setPendingTools(null);
                                }
                                return;
                              }

                              if (currentCapabilityTab === 'skills') {
                                if (!pendingSkills) {
                                  setSkillsEditing(false);
                                  return;
                                }
                                setSavingSkills(true);
                                try {
                                  await handleSetSkills(selectedAgent.id, pendingSkills);
                                } finally {
                                  setSavingSkills(false);
                                  setSkillsEditing(false);
                                  setPendingSkills(null);
                                }
                                return;
                              }

                              const nextEnabledKeys = new Set(
                                pendingSubagentKeys ?? selectedAgentEnabledSubagentKeys,
                              );
                              const currentEnabledKeys = new Set(selectedAgentEnabledSubagentKeys);
                              const changedSubagents = selectedAgentManageableSubagents.filter((subagent) =>
                                currentEnabledKeys.has(subagent.key) !== nextEnabledKeys.has(subagent.key));

                              if (changedSubagents.length === 0) {
                                setSubagentsEditing(false);
                                setPendingSubagentKeys(null);
                                return;
                              }

                              setSavingSubagents(true);
                              try {
                                for (const subagent of changedSubagents) {
                                  await handleSetSubagentEnabled(
                                    selectedAgent.id,
                                    subagent,
                                    nextEnabledKeys.has(subagent.key),
                                  );
                                }
                              } finally {
                                setSavingSubagents(false);
                                setSubagentsEditing(false);
                                setPendingSubagentKeys(null);
                              }
                            }}
                          >
                            {t('agentsOverview.save')}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => {
                            if (currentCapabilityTab === 'tools') {
                              setPendingTools([...selectedAgentTools]);
                              setToolsEditing(true);
                              return;
                            }
                            if (currentCapabilityTab === 'skills') {
                              setPendingSkills([...selectedAgentSkills]);
                              setSkillsEditing(true);
                              return;
                            }
                            setPendingSubagentKeys([...selectedAgentEnabledSubagentKeys]);
                            setSubagentsEditing(true);
                          }}
                        >
                          {t('manage')}
                        </Button>
                      )}
                    </div>
                  ) : null}
                </div>

                {currentCapabilityTab === 'tools' ? (
                  selectedAgent.agentKind === 'mode' && toolsEditing ? (
                    <div className="agent-card__skill-groups">
                      {editableToolGroups.map((group) => {
                        const allEnabled = group.enabledCount === group.totalCount;
                        const someEnabled = group.enabledCount > 0;
                        return (
                          <div key={group.key} className="agent-card__skill-group">
                            <div className="agent-card__skill-group-head">
                              <div className="agent-card__skill-group-title-wrap">
                                <span className="agent-card__skill-group-title">{group.label}</span>
                                <span className="agent-card__skill-group-count">
                                  {`${group.enabledCount}/${group.totalCount}`}
                                </span>
                                {group.onDemandCount > 0 ? (
                                  <span
                                    className="agent-card__skill-group-count"
                                    title={t('agentsOverview.onDemandDescription')}
                                  >
                                    {t('agentsOverview.onDemandCount', {
                                      count: group.onDemandCount,
                                    })}
                                  </span>
                                ) : null}
                              </div>
                              <div className="agent-card__skill-group-actions">
                                <Switch
                                  size="small"
                                  checked={allEnabled}
                                  onChange={(event) => setPendingToolGroupEnabled(
                                    group.tools.map((tool) => tool.name),
                                    event.target.checked,
                                  )}
                                  aria-label={
                                    allEnabled
                                      ? t('agentsOverview.disableGroup')
                                      : t('agentsOverview.enableGroup')
                                  }
                                />
                                {someEnabled && !allEnabled ? (
                                  <Button
                                    variant="ghost"
                                    size="small"
                                    onClick={() => setPendingToolGroupEnabled(
                                      group.tools.map((tool) => tool.name),
                                      false,
                                    )}
                                  >
                                    {t('agentsOverview.clearGroup')}
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                            <div className="agent-card__token-grid">
                              {group.tools.map((tool) => {
                                const isOn = (pendingTools ?? selectedAgentTools).includes(tool.name);
                                const loadMode = tool.load_mode === 'on_demand'
                                  ? t('agentsOverview.onDemandDescription')
                                  : t('agentsOverview.expandedDescription');
                                return (
                                  <button
                                    key={tool.name}
                                    type="button"
                                    className={`agent-card__token${isOn ? ' is-on' : ''}`}
                                    title={[tool.description || tool.name, loadMode].join('\n')}
                                    onClick={() => {
                                      setPendingTools((prev) => {
                                        const current = prev ?? selectedAgentTools;
                                        return isOn
                                          ? current.filter((name) => name !== tool.name)
                                          : [...current, tool.name];
                                      });
                                    }}
                                  >
                                    <span className="agent-card__token-name">{tool.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="agent-card__skill-groups">
                      {selectedAgentToolGroups
                        .filter((group) => group.enabledCount > 0)
                        .map((group) => (
                          <div key={group.key} className="agent-card__skill-group">
                            <div className="agent-card__skill-group-head">
                              <div className="agent-card__skill-group-title-wrap">
                                <span className="agent-card__skill-group-title">{group.label}</span>
                                <span className="agent-card__skill-group-count">
                                  {group.enabledCount}
                                </span>
                                {group.onDemandCount > 0 ? (
                                  <span
                                    className="agent-card__skill-group-count"
                                    title={t('agentsOverview.onDemandDescription')}
                                  >
                                    {t('agentsOverview.onDemandCount', {
                                      count: group.onDemandCount,
                                    })}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="agent-card__chip-grid">
                              {group.tools
                                .filter((tool) => selectedAgentTools.includes(tool.name))
                                .map((tool) => (
                                  <span
                                    key={tool.name}
                                    className="agent-card__chip"
                                    title={[
                                      tool.description || tool.name,
                                      tool.load_mode === 'on_demand'
                                        ? t('agentsOverview.onDemandDescription')
                                        : t('agentsOverview.expandedDescription'),
                                    ].join('\n')}
                                  >
                                    {tool.name.replace(/_/g, ' ')}
                                  </span>
                                ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  )
                ) : null}

                {currentCapabilityTab === 'skills'
                && selectedAgent.agentKind === 'mode'
                && selectedAgentHasSkillTool
                && selectedAgentModeSkills.length > 0 ? (
                  skillsEditing ? (
                    <div className="agent-card__skill-groups">
                      {editableSkillGroups.map((group) => {
                        const allEnabled = group.enabledCount === group.totalCount;
                        const someEnabled = group.enabledCount > 0;

                        return (
                          <div key={group.key} className="agent-card__skill-group">
                            <div className="agent-card__skill-group-head">
                              <div className="agent-card__skill-group-title-wrap">
                                <span className="agent-card__skill-group-title">{group.label}</span>
                                <span className="agent-card__skill-group-count">
                                  {`${group.enabledCount}/${group.totalCount}`}
                                </span>
                              </div>
                              <div
                                className="agent-card__skill-group-actions"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Switch
                                  size="small"
                                  checked={allEnabled}
                                  onChange={(e) =>
                                    setPendingSkillGroupEnabled(group.skills, e.target.checked)
                                  }
                                  aria-label={
                                    allEnabled
                                      ? t('agentsOverview.disableGroup')
                                      : t('agentsOverview.enableGroup')
                                  }
                                />
                                {someEnabled && !allEnabled ? (
                                  <Button
                                    variant="ghost"
                                    size="small"
                                    onClick={() => setPendingSkillGroupEnabled(group.skills, false)}
                                  >
                                    {t('agentsOverview.clearGroup')}
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                            <div className="agent-card__token-grid">
                              {group.skills.map((skill) => {
                                const isOn = (pendingSkills ?? selectedAgentSkills).includes(skill.key);
                                const displayName = formatSkillDisplayName(
                                  skill,
                                  selectedAgentDuplicateSkillNames,
                                  tSkills,
                                );

                                return (
                                  <button
                                    key={skill.key}
                                    type="button"
                                    className={`agent-card__token${isOn ? ' is-on' : ''}`}
                                    title={getSkillTitle(skill, t, tSkills)}
                                    onClick={() => togglePendingSkill(skill.key)}
                                  >
                                    <span className="agent-card__token-name">{displayName}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="agent-card__skill-groups">
                      {selectedAgentSkillItems.length === 0 ? (
                        <span className="agent-card__empty-inline">
                          {t('agentsOverview.noSkills')}
                        </span>
                      ) : (
                        selectedAgentSkillGroups
                          .filter((group) => group.enabledCount > 0)
                          .map((group) => (
                            <div key={group.key} className="agent-card__skill-group">
                              <div className="agent-card__skill-group-head">
                                <div className="agent-card__skill-group-title-wrap">
                                  <span className="agent-card__skill-group-title">{group.label}</span>
                                  <span className="agent-card__skill-group-count">
                                    {group.enabledCount}
                                  </span>
                                </div>
                              </div>
                              <div className="agent-card__chip-grid">
                                {group.skills
                                  .filter((skill) => skill.effectiveEnabled)
                                  .map((skill) => (
                                    <span
                                      key={skill.key}
                                      className="agent-card__chip"
                                      title={getSkillTitle(skill, t, tSkills)}
                                    >
                                      {formatSkillDisplayName(skill, selectedAgentDuplicateSkillNames, tSkills)}
                                    </span>
                                  ))}
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  )
                ) : null}

                {currentCapabilityTab === 'subagents'
                && selectedAgent.agentKind === 'mode'
                && selectedAgentHasTaskTool ? (
                  selectedAgentManageableSubagents.length === 0 ? (
                    <span className="agent-card__empty-inline">
                      {t('agentsOverview.noSubagents')}
                    </span>
                  ) : subagentsEditing ? (
                    <div className="agent-card__token-grid">
                      {selectedAgentManageableSubagents.map((subagent: SubagentInfo) => {
                        const isOn = (
                          pendingSubagentKeys ?? selectedAgentEnabledSubagentKeys
                        ).includes(subagent.key);
                        return (
                          <button
                            key={subagent.key}
                            type="button"
                            className={`agent-card__token${isOn ? ' is-on' : ''}`}
                            title={subagentPresentation(subagent, t).description}
                            onClick={() => {
                              setPendingSubagentKeys((prev) => {
                                const current = prev ?? selectedAgentEnabledSubagentKeys;
                                return isOn
                                  ? current.filter((key) => key !== subagent.key)
                                  : [...current, subagent.key];
                              });
                            }}
                          >
                            <span className="agent-card__token-name">
                              {subagentPresentation(subagent, t).displayName}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="agent-card__chip-grid">
                      {selectedAgentEnabledSubagents.length === 0 ? (
                        <span className="agent-card__empty-inline">
                          {t('agentsOverview.noSubagents')}
                        </span>
                      ) : (
                        selectedAgentEnabledSubagents.map((subagent: SubagentInfo) => (
                          <span
                            key={subagent.key}
                            className="agent-card__chip"
                            title={subagentPresentation(subagent, t).description}
                          >
                            {subagentPresentation(subagent, t).displayName}
                          </span>
                        ))
                      )}
                    </div>
                  )
                ) : null}
              </div>
            ) : null}
            {canManageCustomSubagent ? (
              <div className="agent-card__section">
                <div className="agent-card__section-head">
                  <div className="agent-card__section-title">
                    <span>{t('agentsOverview.customActions')}</span>
                  </div>
                </div>
                <div className="agent-card__section-actions" style={{ gap: 8 }}>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => {
                      const key = selectedAgent?.key;
                      const id = selectedAgent?.id;
                      closeAgentDetails();
                      if (key && id) openEditAgent(key, id);
                    }}
                  >
                    <Pencil size={12} style={{ marginRight: 6 }} />
                    {t('agentsOverview.editAgent')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    isLoading={deletingAgent}
                    onClick={() => void handleDeleteCustomAgent()}
                  >
                    <Trash2 size={12} style={{ marginRight: 6 }} />
                    {t('agentsOverview.deleteAgent')}
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </GalleryDetailModal>
    </GalleryLayout>
  );
};

export interface AgentsSceneProps {
  capabilityService?: CustomizationRuntimeCapabilityReader;
}

const AgentsScene: React.FC<AgentsSceneProps> = ({
  capabilityService = customizationRuntimeCapabilityService,
}) => {
  const { t } = useTranslation('scenes/agents');
  const runtimeCapability = capabilityService.getCapability('catalog_read');
  const {
    page,
    catalogView,
    openHome,
    setCatalogView,
  } = useAgentsStore();

  useEffect(() => {
    return () => {
      openHome();
    };
  }, [openHome]);

  if (runtimeCapability.status === 'unsupported') {
    return (
      <div className="void-agents-shell">
        <main
          className="void-agents-runtime-unsupported"
          data-testid="agents-runtime-unsupported"
        >
          <Bot size={28} aria-hidden />
          <h1>{t('runtimeUnsupported.title')}</h1>
          <p>{t('runtimeUnsupported.description')}</p>
        </main>
      </div>
    );
  }

  if (page === 'createAgent') {
    return (
      <div className="void-agents-shell">
        <div className="void-agents-scene void-agents-scene--page">
          <CreateAgentPage capabilityService={capabilityService} />
        </div>
      </div>
    );
  }

  if (page === 'reviewTeam') {
    return (
      <div className="void-agents-shell">
        <div className="void-agents-scene void-agents-scene--page">
          <ReviewTeamErrorBoundary>
            <ReviewTeamPage />
          </ReviewTeamErrorBoundary>
        </div>
      </div>
    );
  }

  if (page === 'teamAuthoring') {
    return (
      <div className="void-agents-shell">
        <div className="void-agents-scene void-agents-scene--page">
          <TeamAuthoringPage capabilityService={capabilityService} />
        </div>
      </div>
    );
  }

  return (
    <div className="void-agents-shell">
      <div
        className="agents-catalog-tabs"
        role="tablist"
        aria-label={t('catalog.tabs.ariaLabel')}
      >
        <button
          type="button"
          role="tab"
          aria-selected={catalogView === 'agents'}
          className={catalogView === 'agents' ? 'is-active' : ''}
          onClick={() => setCatalogView('agents')}
        >
          {t('catalog.tabs.agents')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={catalogView === 'teams'}
          className={catalogView === 'teams' ? 'is-active' : ''}
          onClick={() => setCatalogView('teams')}
        >
          {t('catalog.tabs.teams')}
        </button>
      </div>
      {catalogView === 'agents' ? <AgentsHomeView /> : <TeamsCatalogView />}
    </div>
  );
};

export default AgentsScene;
