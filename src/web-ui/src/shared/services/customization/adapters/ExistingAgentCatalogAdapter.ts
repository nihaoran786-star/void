import { agentAPI, type ModeInfo } from '@/infrastructure/api/service-api/AgentAPI';
import {
  SubagentAPI,
  type SubagentInfo,
} from '@/infrastructure/api/service-api/SubagentAPI';
import { resolveDefaultCatalogPresentation } from '../presentationMetadata';
import {
  ALL_CUSTOMIZATION_SCENARIOS,
  LEGACY_UNVERSIONED_REVISION,
  type AgentCatalogEntry,
  type CapabilityCatalogSource,
  type CatalogLoadContext,
  type CatalogOrigin,
  type CatalogSourceError,
  type CatalogSourceSnapshot,
  type CustomizationScenario,
} from '../types';

export interface ExistingAgentCatalogDependencies {
  loadModes: () => Promise<ModeInfo[]>;
  loadSubagents: (context: CatalogLoadContext) => Promise<SubagentInfo[]>;
}

const MODE_SCENARIOS: Record<string, CustomizationScenario[]> = {
  agentic: ['code'],
  Plan: ['code'],
  debug: ['code'],
  Multitask: ['code'],
  Team: ['code'],
  Cowork: ['cowork'],
  DeepResearch: ['cowork'],
  Claw: ['cowork'],
  Media: ['media'],
};

function subagentOrigin(source: SubagentInfo['subagentSource']): CatalogOrigin {
  if (source === 'project') return 'project';
  if (source === 'user') return 'user';
  return 'builtin';
}

function subagentScenarios(subagent: SubagentInfo): CustomizationScenario[] {
  const parentIds = subagent.visibility?.allowedParentAgentIds ?? [];
  if (parentIds.length === 0) return [...ALL_CUSTOMIZATION_SCENARIOS];
  return Array.from(new Set(parentIds.flatMap(id => MODE_SCENARIOS[id] ?? [])));
}

function subagentExecutionPolicies(subagent: SubagentInfo): string[] {
  return Array.from(new Set(
    (subagent.visibility?.allowedParentAgentIds ?? [])
      .map(id => id.trim())
      .filter(Boolean),
  ));
}

export function mapModeToCatalogEntry(mode: ModeInfo): AgentCatalogEntry {
  const presentation = resolveDefaultCatalogPresentation({
    kind: 'mode',
    id: mode.id,
    runtimeName: mode.name,
    runtimeDescription: mode.description,
  });
  return {
    kind: 'agent',
    identity: {
      id: mode.id,
      revision: LEGACY_UNVERSIONED_REVISION,
      ...presentation,
    },
    source: {
      adapterId: 'existing-agents',
      recordType: 'mode',
      recordId: mode.id,
    },
    origin: 'builtin',
    scenarioEligibility: MODE_SCENARIOS[mode.id] ?? [],
    tags: ['builtin_mode'],
    availability: {
      status: 'unsupported',
      reasonCode: 'parent_persona_contract_pending',
      message: 'catalog.availability.parent_persona_contract_pending',
    },
    agentKind: 'mode',
    executionPolicyEligibility: [mode.id],
    isReadonly: mode.isReadonly,
    toolCount: mode.toolCount,
    activationSupport: 'runtime_mode_only',
  };
}

export function mapSubagentToCatalogEntry(subagent: SubagentInfo): AgentCatalogEntry {
  const promptCacheScopeKey = (
    subagent as SubagentInfo & { promptCacheScopeKey?: string }
  ).promptCacheScopeKey?.trim();
  const presentation = resolveDefaultCatalogPresentation({
    kind: 'subagent',
    id: subagent.id,
    runtimeName: subagent.name,
    runtimeDescription: subagent.description,
  });
  const isSourceQualifiedCustomPersona =
    (subagent.subagentSource === 'user' || subagent.subagentSource === 'project')
    && /^(user|project)::void::[^:]+$/.test(subagent.key);
  const canActivateAsParentPersona =
    subagent.effectiveEnabled
    && isSourceQualifiedCustomPersona
    && Boolean(promptCacheScopeKey);
  return {
    kind: 'agent',
    identity: {
      id: subagent.key,
      revision: promptCacheScopeKey
        ? { status: 'known', value: promptCacheScopeKey }
        : LEGACY_UNVERSIONED_REVISION,
      ...presentation,
      aliases: Array.from(new Set([...presentation.aliases, subagent.key])),
    },
    source: {
      adapterId: 'existing-agents',
      recordType: 'subagent',
      recordId: subagent.key,
    },
    origin: subagentOrigin(subagent.subagentSource),
    scenarioEligibility: subagentScenarios(subagent),
    tags: [subagent.isReview ? 'review' : 'agent'],
    availability: canActivateAsParentPersona
      ? { status: 'available' }
      : !subagent.effectiveEnabled
        ? { status: 'disabled', reasonCode: subagent.stateReason ?? 'disabled' }
        : isSourceQualifiedCustomPersona
          ? {
              status: 'unsupported',
              reasonCode: 'persona_revision_unavailable',
              message: 'catalog.availability.persona_revision_unavailable',
            }
          : {
              status: 'unsupported',
              reasonCode: 'parent_persona_custom_only',
              message: 'catalog.availability.parent_persona_custom_only',
    },
    agentKind: 'subagent',
    executionPolicyEligibility: subagentExecutionPolicies(subagent),
    isReadonly: subagent.isReadonly,
    toolCount: subagent.toolCount,
    activationSupport: canActivateAsParentPersona
      ? 'parent_persona'
      : 'not_yet_supported',
  };
}

export class ExistingAgentCatalogAdapter implements CapabilityCatalogSource {
  readonly sourceId = 'existing-agents';

  constructor(private readonly dependencies: ExistingAgentCatalogDependencies = {
    loadModes: () => agentAPI.getAvailableModes(),
    loadSubagents: context => SubagentAPI.listSubagents({
      workspacePath: context.workspacePath,
    }),
  }) {}

  async load(context: CatalogLoadContext): Promise<CatalogSourceSnapshot> {
    const [modes, subagents] = await Promise.allSettled([
      this.dependencies.loadModes(),
      this.dependencies.loadSubagents(context),
    ]);
    const errors: CatalogSourceError[] = [];
    if (modes.status === 'rejected') {
      errors.push({
        sourceId: this.sourceId,
        code: 'mode_catalog_load_failed',
        message: 'catalog.errors.mode_catalog_load_failed',
      });
    }
    if (subagents.status === 'rejected') {
      errors.push({
        sourceId: this.sourceId,
        code: 'subagent_catalog_load_failed',
        message: 'catalog.errors.subagent_catalog_load_failed',
      });
    }
    if (modes.status === 'rejected' && subagents.status === 'rejected') {
      throw new Error('agent_catalog_sources_failed');
    }
    const entries: AgentCatalogEntry[] = [
      ...(modes.status === 'fulfilled' ? modes.value.map(mapModeToCatalogEntry) : []),
      ...(subagents.status === 'fulfilled'
        ? subagents.value
            .filter(item => item.visibility?.showInGlobalRegistry !== false)
            .map(mapSubagentToCatalogEntry)
        : []),
    ];
    return {
      sourceId: this.sourceId,
      status: errors.length ? 'partial' : 'ready',
      entries,
      errors,
    };
  }
}
