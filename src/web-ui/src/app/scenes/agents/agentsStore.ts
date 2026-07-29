/**
 * Agents scene state management
 */
import { create } from 'zustand';
import type { SubagentInfo } from '@/infrastructure/api/service-api/SubagentAPI';
import type { TeamDefinitionLevel } from '@/infrastructure/config/types';

export const CAPABILITY_CATEGORIES = ['coding', 'docs', 'analysis', 'testing', 'creative', 'ops'] as const;
export type CapabilityCategory = (typeof CAPABILITY_CATEGORIES)[number];

/** 'mode' = primary agent mode (e.g. Agentic/Plan/Debug); 'subagent' = sub-agent */
export type AgentKind = 'mode' | 'subagent';

export interface AgentCapability {
  category: CapabilityCategory;
  level: number;
}

export interface AgentWithCapabilities extends SubagentInfo {
  capabilities: AgentCapability[];
  /** Localized presentation only. Runtime operations continue to use id/key/name. */
  displayName: string;
  displayDescription: string;
  aliases: string[];
  iconKey?: string;
  /** Distinguishes primary agent mode from sub-agent */
  agentKind?: AgentKind;
  visibleSubagentCount?: number;
}

export const CAPABILITY_COLORS: Record<CapabilityCategory, string> = {
  coding: '#60a5fa',
  docs: '#6eb88c',
  analysis: '#8b5cf6',
  testing: '#c9944d',
  creative: '#e879a0',
  ops: '#5ea3a3',
};

export type AgentsScenePage =
  | 'home'
  | 'createAgent'
  | 'teamAuthoring'
  | 'reviewTeam';
export type AgentEditorMode = 'create' | 'edit';
export type TeamEditorMode = 'create' | 'edit';
export type AgentFilterLevel = 'all' | 'builtin' | 'user' | 'project';
export type AgentFilterType = 'all' | 'mode' | 'subagent';
export type AgentCatalogView = 'agents' | 'teams';

interface AgentsStoreState {
  page: AgentsScenePage;
  agentEditorMode: AgentEditorMode;
  editingAgentKey: string | null;
  editingAgentId: string | null;
  teamEditorMode: TeamEditorMode;
  editingTeamDefinitionId: string | null;
  editingTeamLevel: TeamDefinitionLevel | null;
  searchQuery: string;
  agentFilterLevel: AgentFilterLevel;
  agentFilterType: AgentFilterType;
  catalogView: AgentCatalogView;
  catalogRefreshRevision: number;
  setPage: (page: AgentsScenePage) => void;
  setSearchQuery: (query: string) => void;
  setAgentFilterLevel: (filter: AgentFilterLevel) => void;
  setAgentFilterType: (filter: AgentFilterType) => void;
  setCatalogView: (view: AgentCatalogView) => void;
  openHome: () => void;
  openCreateAgent: () => void;
  openEditAgent: (agentKey: string, agentId?: string) => void;
  openCreateTeam: () => void;
  openEditTeam: (
    teamDefinitionId: string,
    level: TeamDefinitionLevel,
  ) => void;
  openReviewTeam: () => void;
  requestCatalogRefresh: () => void;
}

export const useAgentsStore = create<AgentsStoreState>((set) => ({
  page: 'home',
  agentEditorMode: 'create',
  editingAgentKey: null,
  editingAgentId: null,
  teamEditorMode: 'create',
  editingTeamDefinitionId: null,
  editingTeamLevel: null,
  searchQuery: '',
  agentFilterLevel: 'all',
  agentFilterType: 'all',
  catalogView: 'agents',
  catalogRefreshRevision: 0,
  setPage: (page) => set({ page }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setAgentFilterLevel: (filter) => set({ agentFilterLevel: filter }),
  setAgentFilterType: (filter) => set({ agentFilterType: filter }),
  setCatalogView: (catalogView) => set({ catalogView }),
  openHome: () => set({
    page: 'home',
    agentEditorMode: 'create',
    editingAgentKey: null,
    editingAgentId: null,
    teamEditorMode: 'create',
    editingTeamDefinitionId: null,
    editingTeamLevel: null,
  }),
  openCreateAgent: () => set({
    page: 'createAgent',
    agentEditorMode: 'create',
    editingAgentKey: null,
    editingAgentId: null,
    teamEditorMode: 'create',
    editingTeamDefinitionId: null,
    editingTeamLevel: null,
  }),
  openEditAgent: (agentKey: string, agentId?: string) => set({
    page: 'createAgent',
    agentEditorMode: 'edit',
    editingAgentKey: agentId ? agentKey : null,
    editingAgentId: agentId ?? agentKey,
    teamEditorMode: 'create',
    editingTeamDefinitionId: null,
    editingTeamLevel: null,
  }),
  openCreateTeam: () => set({
    page: 'teamAuthoring',
    agentEditorMode: 'create',
    editingAgentKey: null,
    editingAgentId: null,
    teamEditorMode: 'create',
    editingTeamDefinitionId: null,
    editingTeamLevel: null,
    catalogView: 'teams',
  }),
  openEditTeam: (editingTeamDefinitionId, editingTeamLevel) => set({
    page: 'teamAuthoring',
    agentEditorMode: 'create',
    editingAgentKey: null,
    editingAgentId: null,
    teamEditorMode: 'edit',
    editingTeamDefinitionId,
    editingTeamLevel,
    catalogView: 'teams',
  }),
  openReviewTeam: () => set({
    page: 'reviewTeam',
    agentEditorMode: 'create',
    editingAgentKey: null,
    editingAgentId: null,
    teamEditorMode: 'create',
    editingTeamDefinitionId: null,
    editingTeamLevel: null,
  }),
  requestCatalogRefresh: () => set((state) => ({
    catalogRefreshRevision: state.catalogRefreshRevision + 1,
  })),
}));
