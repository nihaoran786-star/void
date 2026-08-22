/**
 * useAgentHubDirectory — the AGENT page's aggregation layer.
 *
 * Presentation only. Every list comes from the hook or service that already
 * owns it (assistants from `WorkspaceContext`, agents from `useAgentsList`,
 * teams from `useTeamCatalog`, skills from `useInstalledSkills`, connectors
 * from the read-only `useMcpServerCatalog` selector over `MCPAPI`). Nothing
 * here scans the file system, reads a market, or evaluates a permission —
 * it only projects what those owners return into one row shape.
 *
 * Every section carries its own explicit state: an empty array never stands in
 * for "still loading" or "failed".
 */

import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { MCPServerInfo } from '@/infrastructure/api/service-api/MCPAPI';
import type { SubagentInfo } from '@/infrastructure/api/service-api/SubagentAPI';
import type { AgentProfileConfigItem, ModeSkillInfo, SkillInfo } from '@/infrastructure/config/types';
import type { ToolInfo } from '@/shared/types/agent-api';
import {
  getCatalogStatusGroup,
  useMcpServerCatalog,
} from '@/infrastructure/config/components/mcpServerCatalog';
import { useWorkspaceContext } from '@/infrastructure/contexts/WorkspaceContext';
import { WorkspaceKind, type WorkspaceInfo } from '@/shared/types';
import {
  localizeCatalogPresentation,
  presentationForInstalledSkill,
  type TeamCatalogEntry,
} from '@/shared/services/customization';
import { useSessionModeStore } from '@/app/stores/sessionModeStore';
import type { AgentWithCapabilities } from '../agents/agentsStore';
import { useAgentsList } from '../agents/hooks/useAgentsList';
import { useTeamCatalog } from '../agents/hooks/useTeamCatalog';
import { getAgentDescription } from '../agents/utils';
import { useInstalledSkills } from '../skills/hooks/useInstalledSkills';

export const AGENT_HUB_ROW_TYPES = [
  'assistant',
  'agent',
  'team',
  'skill',
  'connector',
] as const;

export type AgentHubRowType = (typeof AGENT_HUB_ROW_TYPES)[number];

/** Text + colour are two channels for the same fact; never colour alone. */
export type AgentHubStatusTone = 'success' | 'warning' | 'muted';

export interface AgentHubStatus {
  /** Key under the `status.*` group of the `scenes/agent-hub` namespace. */
  key: string;
  tone: AgentHubStatusTone;
}

export interface AgentHubAvatarProps {
  identity: string;
  name: string;
  /** Connector transport, used to pick the deterministic glyph. */
  transport?: string;
  /** Team member identities behind the lead orb (already capped). */
  memberIdentities?: string[];
  /** Members beyond the visible orbs. */
  overflowCount?: number;
}

export interface AgentHubRow {
  id: string;
  type: AgentHubRowType;
  name: string;
  /** One muted line: the role or the purpose, never a second sentence. */
  line: string;
  status: AgentHubStatus;
  avatarProps: AgentHubAvatarProps;
  /** Free-text haystack for the in-page filter. */
  searchText: string;
}

export type AgentHubSectionStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface AgentHubSection {
  type: AgentHubRowType;
  status: AgentHubSectionStatus;
  rows: AgentHubRow[];
  /** Present only when `status === 'error'`. */
  error?: string;
  /**
   * Present only when the owning hook exposes a reload, so the failed section
   * can offer an inline retry instead of leaving the user stuck.
   */
  retry?: () => void;
}

/**
 * Equipment wiring for the agent detail modal. Passed through verbatim from the
 * single `useAgentsList` call this directory already makes; no second fetch.
 */
export interface AgentCapabilities {
  availableTools: ToolInfo[];
  getModeConfig: (agentId: string) => AgentProfileConfigItem | null;
  getModeSkills: (agentId: string) => ModeSkillInfo[];
  getModeManageableSubagents: (agentId: string) => SubagentInfo[];
  handleSetTools: (agentId: string, toolNames: string[]) => Promise<void>;
  handleResetTools: (agentId: string) => Promise<void>;
  handleSetSkills: (agentId: string, enabledSkillKeys: string[]) => Promise<void>;
  handleResetSkills: (agentId: string) => Promise<void>;
  handleSetSubagentEnabled: (
    agentId: string,
    subagent: Pick<SubagentInfo, 'key' | 'id'>,
    enabled: boolean,
  ) => Promise<void>;
}

export interface AgentHubDirectory {
  sections: Record<AgentHubRowType, AgentHubSection>;
  counts: Record<AgentHubRowType, number>;
  total: number;
  /** Underlying records, keyed by row id, for behaviour wiring. */
  assistantsById: Record<string, WorkspaceInfo>;
  agentsById: Record<string, AgentWithCapabilities>;
  teamsById: Record<string, TeamCatalogEntry>;
  skillsById: Record<string, SkillInfo>;
  connectorsById: Record<string, MCPServerInfo>;
  /** Equipment wiring for the agent detail modal. */
  agentCapabilities: AgentCapabilities;
}

const MAX_TEAM_ORBS = 2;

const SCENARIO_EXECUTION_POLICIES = {
  code: ['agentic', 'Plan', 'debug', 'Multitask', 'Team'],
  cowork: ['Cowork', 'DeepResearch', 'Claw'],
  media: ['Media'],
} as const;

function sectionFrom(
  type: AgentHubRowType,
  loading: boolean,
  error: string | null | undefined,
  rows: AgentHubRow[],
  retry?: () => void,
): AgentHubSection {
  if (error) {
    return { type, status: 'error', rows: [], error, ...(retry ? { retry } : {}) };
  }
  if (loading) {
    return { type, status: 'loading', rows: [] };
  }
  return { type, status: rows.length > 0 ? 'ready' : 'empty', rows };
}

function connectorStatus(server: MCPServerInfo): AgentHubStatus {
  switch (getCatalogStatusGroup(server.status)) {
    case 'connected':
      return { key: 'connected', tone: 'success' };
    case 'attention':
      return { key: 'needsAttention', tone: 'warning' };
    case 'transitioning':
      return { key: 'connecting', tone: 'muted' };
    case 'stopped':
    default:
      return { key: 'idle', tone: 'muted' };
  }
}

export function useAgentHubDirectory(): AgentHubDirectory {
  const { t: tAgents } = useTranslation('scenes/agents');
  const { t: tSkills } = useTranslation('scenes/skills');

  const {
    assistantWorkspacesList,
    activeWorkspaceId,
    loading: assistantsLoading,
    error: assistantsError,
  } = useWorkspaceContext();

  const preferredScenario = useSessionModeStore(state => state.mode);
  const {
    allAgents,
    loading: agentsLoading,
    hiddenAgentIds,
    availableTools,
    getModeConfig,
    getModeSkills,
    getModeManageableSubagents,
    handleSetTools,
    handleResetTools,
    handleSetSkills,
    handleResetSkills,
    handleSetSubagentEnabled,
  } = useAgentsList({
    searchQuery: '',
    filterLevel: 'all',
    filterType: 'all',
    executionPolicies: SCENARIO_EXECUTION_POLICIES[preferredScenario],
    t: tAgents,
  });

  const teamCatalog = useTeamCatalog();

  const {
    skills,
    loading: skillsLoading,
    error: skillsError,
  } = useInstalledSkills({ searchQuery: '', activeFilter: 'all' });

  const connectors = useMcpServerCatalog();

  const assistants = useMemo(() => {
    const rows: AgentHubRow[] = [];
    const byId: Record<string, WorkspaceInfo> = {};

    for (const workspace of assistantWorkspacesList) {
      const name = workspace.workspaceKind === WorkspaceKind.Assistant
        ? workspace.identity?.name?.trim() || workspace.name
        : workspace.name;
      const line = workspace.description?.trim()
        || workspace.identity?.vibe?.trim()
        || workspace.rootPath;
      const id = `assistant:${workspace.id}`;
      byId[id] = workspace;
      rows.push({
        id,
        type: 'assistant',
        name,
        line,
        status: workspace.id === activeWorkspaceId
          ? { key: 'running', tone: 'success' }
          : { key: 'idle', tone: 'muted' },
        avatarProps: { identity: workspace.id, name },
        searchText: `${name} ${line} ${workspace.rootPath}`.toLowerCase(),
      });
    }

    return { rows, byId };
  }, [activeWorkspaceId, assistantWorkspacesList]);

  const agents = useMemo(() => {
    const rows: AgentHubRow[] = [];
    const byId: Record<string, AgentWithCapabilities> = {};

    for (const agent of allAgents) {
      if (hiddenAgentIds.has(agent.id)) continue;
      const id = `agent:${agent.key}`;
      byId[id] = agent;
      const line = getAgentDescription(tAgents, agent);
      const available = agent.catalogEntry.availability.status === 'available';
      rows.push({
        id,
        type: 'agent',
        name: agent.displayName,
        line,
        status: !available
          ? { key: 'needsAttention', tone: 'warning' }
          : agent.effectiveEnabled === false
            ? { key: 'disabled', tone: 'muted' }
            : { key: 'enabled', tone: 'muted' },
        avatarProps: {
          identity: agent.key || agent.id || agent.name,
          name: agent.displayName,
        },
        searchText: [agent.displayName, line, agent.name, agent.id, agent.key, ...agent.aliases]
          .join(' ')
          .toLowerCase(),
      });
    }

    return { rows, byId };
  }, [allAgents, hiddenAgentIds, tAgents]);

  const teams = useMemo(() => {
    const rows: AgentHubRow[] = [];
    const byId: Record<string, TeamCatalogEntry> = {};

    for (const team of teamCatalog.entries) {
      const presentation = localizeCatalogPresentation(team.identity, key => tAgents(key));
      const lead = localizeCatalogPresentation(team.lead.identity, key => tAgents(key));
      const id = `team:${team.source.adapterId}:${team.identity.id}`;
      byId[id] = team;
      const line = presentation.description || lead.displayName;
      const memberIdentities = team.members
        .slice(0, MAX_TEAM_ORBS)
        .map(member => `team-member:${member.identity.id}`);
      rows.push({
        id,
        type: 'team',
        name: presentation.displayName,
        line,
        status: team.availability.status === 'available'
          ? { key: 'ready', tone: 'muted' }
          : { key: 'needsAttention', tone: 'warning' },
        avatarProps: {
          identity: `team:${team.source.adapterId}:${team.identity.id}`,
          name: presentation.displayName,
          memberIdentities,
          overflowCount: Math.max(0, team.members.length - MAX_TEAM_ORBS),
        },
        searchText: `${presentation.displayName} ${line} ${team.identity.id}`.toLowerCase(),
      });
    }

    return { rows, byId };
  }, [tAgents, teamCatalog.entries]);

  const skillRows = useMemo(() => {
    const rows: AgentHubRow[] = [];
    const byId: Record<string, SkillInfo> = {};

    for (const skill of skills) {
      const presentation = localizeCatalogPresentation(
        presentationForInstalledSkill(skill),
        key => tSkills(key),
      );
      const id = `skill:${skill.key}`;
      byId[id] = skill;
      const line = presentation.description || skill.path;
      rows.push({
        id,
        type: 'skill',
        name: presentation.displayName,
        line,
        status: skill.isShadowed
          ? { key: 'needsAttention', tone: 'warning' }
          : { key: 'enabled', tone: 'muted' },
        avatarProps: { identity: skill.key, name: presentation.displayName },
        searchText: `${presentation.displayName} ${line} ${skill.key}`.toLowerCase(),
      });
    }

    return { rows, byId };
  }, [skills, tSkills]);

  const connectorRows = useMemo(() => {
    const rows: AgentHubRow[] = [];
    const byId: Record<string, MCPServerInfo> = {};

    for (const server of connectors.servers) {
      const id = `connector:${server.id}`;
      byId[id] = server;
      const line = server.url || server.command || server.transport;
      rows.push({
        id,
        type: 'connector',
        name: server.name,
        line,
        status: connectorStatus(server),
        avatarProps: {
          identity: server.id,
          name: server.name,
          transport: server.transport,
        },
        searchText: `${server.name} ${line} ${server.transport}`.toLowerCase(),
      });
    }

    return { rows, byId };
  }, [connectors.servers]);

  const teamsLoading = teamCatalog.status === 'loading';
  const teamsError = teamCatalog.status === 'error'
    ? (teamCatalog.errors[0]?.message ?? 'team_catalog_error')
    : null;

  const teamsReload = teamCatalog.reload;
  const connectorsReload = connectors.reload;
  const retryTeams = useCallback(() => { void teamsReload(); }, [teamsReload]);
  const retryConnectors = useCallback(() => { void connectorsReload(); }, [connectorsReload]);

  const sections = useMemo<Record<AgentHubRowType, AgentHubSection>>(() => ({
    assistant: sectionFrom('assistant', assistantsLoading, assistantsError, assistants.rows),
    agent: sectionFrom('agent', agentsLoading, null, agents.rows),
    team: sectionFrom('team', teamsLoading, teamsError, teams.rows, retryTeams),
    skill: sectionFrom('skill', skillsLoading, skillsError, skillRows.rows),
    connector: sectionFrom(
      'connector',
      connectors.loading,
      connectors.error,
      connectorRows.rows,
      retryConnectors,
    ),
  }), [
    agents.rows,
    agentsLoading,
    assistants.rows,
    assistantsError,
    assistantsLoading,
    connectorRows.rows,
    connectors.error,
    connectors.loading,
    retryConnectors,
    retryTeams,
    skillRows.rows,
    skillsError,
    skillsLoading,
    teams.rows,
    teamsError,
    teamsLoading,
  ]);

  const counts = useMemo<Record<AgentHubRowType, number>>(() => ({
    assistant: sections.assistant.rows.length,
    agent: sections.agent.rows.length,
    team: sections.team.rows.length,
    skill: sections.skill.rows.length,
    connector: sections.connector.rows.length,
  }), [sections]);

  const total = AGENT_HUB_ROW_TYPES.reduce((sum, type) => sum + counts[type], 0);

  return {
    sections,
    counts,
    total,
    assistantsById: assistants.byId,
    agentsById: agents.byId,
    teamsById: teams.byId,
    skillsById: skillRows.byId,
    connectorsById: connectorRows.byId,
    agentCapabilities: {
      availableTools,
      getModeConfig,
      getModeSkills,
      getModeManageableSubagents,
      handleSetTools,
      handleResetTools,
      handleSetSkills,
      handleResetSkills,
      handleSetSubagentEnabled,
    },
  };
}
