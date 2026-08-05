import type {
  SessionActivePersonaBinding,
  SessionCustomizationScenario,
  SessionKind,
  SessionPersonaRevision,
} from '@/shared/types/session-history';
import type { PersonaTurnSnapshot } from '@/flow_chat/types/flow-chat';

export type CapabilityKind = 'agent' | 'team' | 'skill' | 'connector';
export type CustomizationScenario = SessionCustomizationScenario;
export type CatalogOrigin = 'builtin' | 'user' | 'project' | 'installed' | 'fixed_runtime';

export type CatalogRevision = SessionPersonaRevision;
export type ActivePersonaBinding = SessionActivePersonaBinding;

export type ActivePersonaSelectionStatus =
  | 'scenario_default'
  | 'selected'
  | 'child_session_ignored';

export type ActivePersonaStateSource =
  | 'legacy_projection'
  | 'persisted'
  | 'selection';

export interface ActivePersonaSessionState {
  sessionId: string;
  status: ActivePersonaSelectionStatus;
  source: ActivePersonaStateSource;
  scenario: CustomizationScenario;
  executionPolicy: string;
  activePersonaBinding: ActivePersonaBinding | null;
}

export interface PersonaSessionDescriptor {
  sessionId: string;
  sessionKind?: import('@/shared/types/session-history').SessionKind;
  mode?: string;
  agentType?: string;
}

export interface PersistedPersonaSessionDescriptor extends PersonaSessionDescriptor {
  customMetadata?: import('@/shared/types/session-history').SessionCustomMetadata;
}

export interface PersonaTurnSnapshotDescriptor {
  sessionId: string;
  sessionKind?: SessionKind;
  status: ActivePersonaSelectionStatus;
  scenario: CustomizationScenario;
  executionPolicy: string;
  activePersonaBinding: ActivePersonaBinding | null;
}

export type { PersonaTurnSnapshot };

export interface CatalogIdentity {
  /** Immutable runtime identity. Never localize or infer this value from displayName. */
  id: string;
  revision: CatalogRevision;
  displayName: string;
  description: string;
  /** Locale keys are presentation metadata; runtime identity never depends on them. */
  displayNameKey?: string;
  descriptionKey?: string;
  /** Search-only names. Activation must always use id. */
  aliases: string[];
}

export interface CatalogSourceReference {
  adapterId: string;
  recordType:
    | 'mode'
    | 'subagent'
    | 'skill'
    | 'fixed_team'
    | 'team_definition'
    | 'connector';
  /** Stable source-local identity used to keep same-ID records distinct. */
  recordId: string;
}

export interface CapabilityAvailability {
  status: 'available' | 'disabled' | 'unsupported' | 'unavailable';
  reasonCode?: string;
  message?: string;
}

interface CapabilityCatalogEntryBase {
  kind: CapabilityKind;
  identity: CatalogIdentity;
  source: CatalogSourceReference;
  origin: CatalogOrigin;
  scenarioEligibility: CustomizationScenario[];
  tags: string[];
  availability: CapabilityAvailability;
}

export interface AgentCatalogEntry extends CapabilityCatalogEntryBase {
  kind: 'agent';
  agentKind: 'mode' | 'subagent';
  /** Exact execution policies in which this Agent may run. Empty means all policies. */
  executionPolicyEligibility: string[];
  isReadonly: boolean;
  toolCount: number;
  activationSupport:
    | 'runtime_mode_only'
    | 'parent_persona'
    | 'not_yet_supported';
}

export interface TeamCatalogMember {
  identity: CatalogIdentity;
  role: 'lead' | 'specialist' | 'quality_gate';
  isReadonly: boolean;
}

export interface TeamCatalogEntry extends CapabilityCatalogEntryBase {
  kind: 'team';
  leadBinding:
    | 'child_orchestrator'
    | 'parent_persona_compatibility'
    | 'parent_persona'
    | 'definition_only';
  lead: TeamCatalogMember;
  members: TeamCatalogMember[];
  activationSupport:
    | 'existing_flow_only'
    | 'parent_persona'
    | 'definition_only';
  managementSupport:
    | 'readonly_fixed'
    | 'authorable'
    | 'installed_readonly';
  definitionLevel?: 'user' | 'project';
  workflowCount?: number;
}

export interface SkillCatalogEntry extends CapabilityCatalogEntryBase {
  kind: 'skill';
  level: 'user' | 'project';
  sourceSlot: string;
  isBuiltin: boolean;
  isAuthorable: boolean;
  isShadowed: boolean;
  shadowedByKey?: string;
}

export interface ConnectorCatalogEntry extends CapabilityCatalogEntryBase {
  kind: 'connector';
}

export type CapabilityCatalogEntry =
  | AgentCatalogEntry
  | TeamCatalogEntry
  | SkillCatalogEntry
  | ConnectorCatalogEntry;

export interface CatalogSourceError {
  sourceId: string;
  code: string;
  message: string;
}

export interface CatalogSourceSnapshot {
  sourceId: string;
  status: 'ready' | 'partial';
  entries: CapabilityCatalogEntry[];
  errors: CatalogSourceError[];
}

export interface CapabilityCatalogSource {
  readonly sourceId: string;
  load(context: CatalogLoadContext): Promise<CatalogSourceSnapshot>;
}

export interface CatalogLoadContext {
  workspacePath?: string;
}

export interface CapabilityCatalogQuery extends CatalogLoadContext {
  kinds?: CapabilityKind[];
  scenario?: CustomizationScenario;
  executionPolicy?: string;
  search?: string;
}

export interface CatalogSourceState {
  sourceId: string;
  status: 'ready' | 'partial' | 'error';
  entryCount: number;
  error?: CatalogSourceError;
}

export interface CapabilityCatalogResult {
  status: 'ready' | 'partial' | 'empty' | 'error';
  entries: CapabilityCatalogEntry[];
  sources: CatalogSourceState[];
  errors: CatalogSourceError[];
}

export const LEGACY_UNVERSIONED_REVISION: CatalogRevision = {
  status: 'legacy_unversioned',
};

export const ALL_CUSTOMIZATION_SCENARIOS: CustomizationScenario[] = [
  'code',
  'cowork',
  'media',
];
