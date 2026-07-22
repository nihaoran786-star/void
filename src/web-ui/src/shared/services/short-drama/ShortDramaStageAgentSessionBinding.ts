import { areShortDramaWorkspacePathsEqual, normalizeShortDramaWorkspacePath } from './ShortDramaWorkspaceBinding';
import { getShortDramaNativeStageAgentName } from './ShortDramaRealStageAgentSessionResolver';
import type {
  ShortDramaManifestAdapter,
  ShortDramaStage,
  ShortDramaStageAgentSessionCandidate,
} from './ShortDramaTypes';

export const SHORT_DRAMA_STAGE_AGENT_BINDING_SCHEMA_VERSION = 1;
export const SHORT_DRAMA_STAGE_AGENT_BINDING_KEY = '.void/short-drama/sessions/stage-agents.json';

export const SHORT_DRAMA_STAGE_AGENT_BINDING_STAGES: ShortDramaStage[] = ['script', 'assets', 'storyboards', 'video', 'post'];

export type ShortDramaStageAgentBindingStatus =
  | 'unbound'
  | 'ready'
  | 'missing'
  | 'stale'
  | 'recreating'
  | 'conflict'
  | 'workspace_mismatch'
  | 'error';

export type ShortDramaStageAgentBindingSource =
  | 'main_ai_wake'
  | 'manual_stage_open'
  | 'restored_binding'
  | 'runtime_recreated';

export interface ShortDramaStageAgentBinding {
  stage: ShortDramaStage;
  agentName: 'ScriptAI' | 'AssetAI' | 'SplitAI' | 'VideoAI' | 'EditorAI';
  childSessionId?: string;
  parentSessionId?: string;
  parentToolCallId?: string;
  workspaceRoot: string;
  status: ShortDramaStageAgentBindingStatus;
  source: ShortDramaStageAgentBindingSource;
  createdAt?: number;
  updatedAt?: number;
  lastValidatedAt?: number;
  error?: {
    code: string;
    message: string;
  };
}

export interface ShortDramaStageAgentBindingDocument {
  schemaVersion: typeof SHORT_DRAMA_STAGE_AGENT_BINDING_SCHEMA_VERSION;
  workspaceRoot: string;
  updatedAt: number;
  bindings: Partial<Record<ShortDramaStage, ShortDramaStageAgentBinding>>;
}

export type ShortDramaStageAgentBindingStoreResult =
  | {
      status: 'ready';
      source: 'stage-agent-binding-store';
      workspaceRoot: string;
      projectPath: string;
      bindings: ShortDramaStageAgentBinding[];
      document: ShortDramaStageAgentBindingDocument;
    }
  | {
      status: 'unbound';
      source: 'stage-agent-binding-store';
      workspaceRoot: string;
      projectPath: string;
      bindings: ShortDramaStageAgentBinding[];
    }
  | {
      status: 'error';
      source: 'stage-agent-binding-store';
      workspaceRoot: string;
      projectPath: string;
      error: {
        code: 'binding_invalid' | 'binding_read_failed' | 'binding_write_failed';
        message: string;
        cause?: unknown;
      };
    };

export interface ShortDramaStageAgentBindingRegisterResult {
  status: 'ready' | 'unchanged' | 'error';
  source: 'stage-agent-binding-store';
  workspaceRoot: string;
  projectPath: string;
  bindings: ShortDramaStageAgentBinding[];
  changedStages: ShortDramaStage[];
  error?: {
    code: 'binding_write_failed';
    message: string;
    cause?: unknown;
  };
}

export async function readShortDramaStageAgentBindings(
  adapter: ShortDramaManifestAdapter,
  workspaceRoot: string,
): Promise<ShortDramaStageAgentBindingStoreResult> {
  const normalizedWorkspaceRoot = normalizeShortDramaWorkspacePath(workspaceRoot) ?? workspaceRoot;
  const projectPath = createShortDramaStageAgentBindingProjectPath(normalizedWorkspaceRoot);

  let raw: string | undefined;
  try {
    raw = await adapter.read(SHORT_DRAMA_STAGE_AGENT_BINDING_KEY);
  } catch (error) {
    return {
      status: 'error',
      source: 'stage-agent-binding-store',
      workspaceRoot: normalizedWorkspaceRoot,
      projectPath,
      error: {
        code: 'binding_read_failed',
        message: 'AI short drama stage agent bindings could not be read.',
        cause: error,
      },
    };
  }

  if (!raw) {
    return {
      status: 'unbound',
      source: 'stage-agent-binding-store',
      workspaceRoot: normalizedWorkspaceRoot,
      projectPath,
      bindings: createUnboundStageAgentBindings(normalizedWorkspaceRoot),
    };
  }

  try {
    const document = parseShortDramaStageAgentBindingDocument(raw, normalizedWorkspaceRoot);
    return {
      status: 'ready',
      source: 'stage-agent-binding-store',
      workspaceRoot: normalizedWorkspaceRoot,
      projectPath,
      document,
      bindings: completeShortDramaStageAgentBindings(document.bindings, normalizedWorkspaceRoot),
    };
  } catch (error) {
    return {
      status: 'error',
      source: 'stage-agent-binding-store',
      workspaceRoot: normalizedWorkspaceRoot,
      projectPath,
      error: {
        code: 'binding_invalid',
        message: 'AI short drama stage agent bindings are not valid JSON or use an unsupported schema.',
        cause: error,
      },
    };
  }
}

export async function registerShortDramaStageAgentBindingsFromSessions(
  adapter: ShortDramaManifestAdapter,
  workspaceRoot: string,
  sessions: ShortDramaStageAgentSessionCandidate[],
  existingBindings: ShortDramaStageAgentBinding[] = createUnboundStageAgentBindings(workspaceRoot),
  timestamp = Date.now(),
): Promise<ShortDramaStageAgentBindingRegisterResult> {
  const normalizedWorkspaceRoot = normalizeShortDramaWorkspacePath(workspaceRoot) ?? workspaceRoot;
  const projectPath = createShortDramaStageAgentBindingProjectPath(normalizedWorkspaceRoot);
  const nextBindings = SHORT_DRAMA_STAGE_AGENT_BINDING_STAGES.map(stage => (
    createBindingFromSessionCandidates(stage, normalizedWorkspaceRoot, sessions, existingBindings, timestamp)
  ));
  const changedStages = nextBindings
    .filter(binding => !areStageAgentBindingsEquivalent(
      binding,
      existingBindings.find(item => item.stage === binding.stage),
    ))
    .map(binding => binding.stage);

  if (changedStages.length === 0) {
    return {
      status: 'unchanged',
      source: 'stage-agent-binding-store',
      workspaceRoot: normalizedWorkspaceRoot,
      projectPath,
      bindings: nextBindings,
      changedStages,
    };
  }

  try {
    await writeShortDramaStageAgentBindings(adapter, normalizedWorkspaceRoot, nextBindings, timestamp);
    return {
      status: 'ready',
      source: 'stage-agent-binding-store',
      workspaceRoot: normalizedWorkspaceRoot,
      projectPath,
      bindings: nextBindings,
      changedStages,
    };
  } catch (error) {
    return {
      status: 'error',
      source: 'stage-agent-binding-store',
      workspaceRoot: normalizedWorkspaceRoot,
      projectPath,
      bindings: existingBindings,
      changedStages: [],
      error: {
        code: 'binding_write_failed',
        message: 'AI short drama stage agent bindings could not be saved.',
        cause: error,
      },
    };
  }
}

export function validateShortDramaStageAgentBindingsAgainstSessions(
  bindings: ShortDramaStageAgentBinding[],
  sessions: ShortDramaStageAgentSessionCandidate[],
  workspaceRoot?: string,
  timestamp = Date.now(),
): ShortDramaStageAgentBinding[] {
  return completeShortDramaStageAgentBindings(
    Object.fromEntries(bindings.map(binding => [binding.stage, binding])),
    workspaceRoot,
  ).map(binding => validateStageAgentBindingAgainstSessions(binding, sessions, workspaceRoot, timestamp));
}

export function createUnboundStageAgentBindings(workspaceRoot?: string): ShortDramaStageAgentBinding[] {
  const normalizedWorkspaceRoot = normalizeShortDramaWorkspacePath(workspaceRoot) ?? workspaceRoot ?? '';
  return SHORT_DRAMA_STAGE_AGENT_BINDING_STAGES.map(stage => ({
    stage,
    agentName: getShortDramaNativeStageAgentName(stage) as ShortDramaStageAgentBinding['agentName'],
    workspaceRoot: normalizedWorkspaceRoot,
    status: 'unbound',
    source: 'restored_binding',
  }));
}

function writeShortDramaStageAgentBindings(
  adapter: ShortDramaManifestAdapter,
  workspaceRoot: string,
  bindings: ShortDramaStageAgentBinding[],
  timestamp: number,
) {
  const document: ShortDramaStageAgentBindingDocument = {
    schemaVersion: SHORT_DRAMA_STAGE_AGENT_BINDING_SCHEMA_VERSION,
    workspaceRoot,
    updatedAt: timestamp,
    bindings: Object.fromEntries(bindings.map(binding => [binding.stage, binding])),
  };
  return adapter.write(SHORT_DRAMA_STAGE_AGENT_BINDING_KEY, JSON.stringify(document, null, 2));
}

function parseShortDramaStageAgentBindingDocument(
  raw: string,
  workspaceRoot: string,
): ShortDramaStageAgentBindingDocument {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed) || parsed.schemaVersion !== SHORT_DRAMA_STAGE_AGENT_BINDING_SCHEMA_VERSION) {
    throw new Error('Unsupported stage agent binding schema.');
  }
  if (!isRecord(parsed.bindings)) {
    throw new Error('Stage agent binding document must contain bindings.');
  }
  const parsedBindings = parsed.bindings;
  const documentWorkspaceRoot = typeof parsed.workspaceRoot === 'string'
    ? parsed.workspaceRoot
    : workspaceRoot;
  return {
    schemaVersion: SHORT_DRAMA_STAGE_AGENT_BINDING_SCHEMA_VERSION,
    workspaceRoot: documentWorkspaceRoot,
    updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    bindings: Object.fromEntries(
      SHORT_DRAMA_STAGE_AGENT_BINDING_STAGES
        .map(stage => [stage, parseStageAgentBinding(parsedBindings[stage], stage, documentWorkspaceRoot)])
        .filter((entry): entry is [ShortDramaStage, ShortDramaStageAgentBinding] => Boolean(entry[1])),
    ),
  };
}

function parseStageAgentBinding(
  value: unknown,
  stage: ShortDramaStage,
  fallbackWorkspaceRoot: string,
): ShortDramaStageAgentBinding | undefined {
  if (!isRecord(value)) return undefined;
  const agentName = value.agentName;
  const status = value.status;
  const source = value.source;
  if (
    value.stage !== stage
    || agentName !== getShortDramaNativeStageAgentName(stage)
    || !isStageAgentBindingStatus(status)
    || !isStageAgentBindingSource(source)
  ) {
    return undefined;
  }

  return {
    stage,
    agentName: agentName as ShortDramaStageAgentBinding['agentName'],
    childSessionId: stringOrUndefined(value.childSessionId),
    parentSessionId: stringOrUndefined(value.parentSessionId),
    parentToolCallId: stringOrUndefined(value.parentToolCallId),
    workspaceRoot: stringOrUndefined(value.workspaceRoot) ?? fallbackWorkspaceRoot,
    status,
    source,
    createdAt: numberOrUndefined(value.createdAt),
    updatedAt: numberOrUndefined(value.updatedAt),
    lastValidatedAt: numberOrUndefined(value.lastValidatedAt),
    error: isRecord(value.error)
      ? {
          code: stringOrUndefined(value.error.code) ?? 'binding_error',
          message: stringOrUndefined(value.error.message) ?? 'AI short drama stage agent binding is invalid.',
        }
      : undefined,
  };
}

function completeShortDramaStageAgentBindings(
  bindings: Partial<Record<ShortDramaStage, ShortDramaStageAgentBinding>>,
  workspaceRoot?: string,
): ShortDramaStageAgentBinding[] {
  const fallback = createUnboundStageAgentBindings(workspaceRoot);
  return SHORT_DRAMA_STAGE_AGENT_BINDING_STAGES.map(stage => bindings[stage] ?? fallback.find(binding => binding.stage === stage)!);
}

function createBindingFromSessionCandidates(
  stage: ShortDramaStage,
  workspaceRoot: string,
  sessions: ShortDramaStageAgentSessionCandidate[],
  existingBindings: ShortDramaStageAgentBinding[],
  timestamp: number,
): ShortDramaStageAgentBinding {
  const existing = existingBindings.find(binding => binding.stage === stage);
  const agentName = getShortDramaNativeStageAgentName(stage) as ShortDramaStageAgentBinding['agentName'];
  const candidates = sessions
    .filter(session => isRealStageAgentSessionCandidate(session))
    .filter(session => matchesNativeAgent(session, agentName))
    .filter(session => !session.workspacePath || areShortDramaWorkspacePathsEqual(session.workspacePath, workspaceRoot));

  const boundCandidate = existing?.childSessionId
    ? candidates.find(session => session.childSessionId === existing.childSessionId)
    : undefined;
  if (boundCandidate) {
    const parentSessionId = boundCandidate.parentSessionId ?? existing?.parentSessionId;
    return {
      ...createBaseBinding(stage, agentName, workspaceRoot, timestamp, existing),
      childSessionId: boundCandidate.childSessionId,
      parentSessionId,
      parentToolCallId: boundCandidate.parentToolCallId ?? existing?.parentToolCallId,
      status: parentSessionId ? 'ready' : 'missing',
      source: existing?.source ?? 'restored_binding',
      createdAt: existing?.createdAt ?? timestamp,
      error: parentSessionId
        ? undefined
        : { code: 'parent_missing', message: `${agentName} exists but is missing its parent main session.` },
    };
  }

  const recent = chooseMostRecent(candidates);

  if (recent.status === 'conflict') {
    return {
      ...createBaseBinding(stage, agentName, workspaceRoot, timestamp, existing),
      status: 'conflict',
      error: {
        code: 'stage_agent_conflict',
        message: `Multiple real ${agentName} sessions match the current short drama workspace.`,
      },
    };
  }

  if (recent.status === 'ready') {
    const previousCreatedAt = existing?.childSessionId === recent.candidate.childSessionId
      ? existing.createdAt
      : timestamp;
    return {
      ...createBaseBinding(stage, agentName, workspaceRoot, timestamp, existing),
      childSessionId: recent.candidate.childSessionId,
      parentSessionId: recent.candidate.parentSessionId,
      parentToolCallId: recent.candidate.parentToolCallId,
      status: recent.candidate.parentSessionId ? 'ready' : 'missing',
      source: 'main_ai_wake',
      createdAt: previousCreatedAt,
      error: recent.candidate.parentSessionId
        ? undefined
        : { code: 'parent_missing', message: `${agentName} exists but is missing its parent main session.` },
    };
  }

  return validateStageAgentBindingAgainstSessions(
    existing ?? createBaseBinding(stage, agentName, workspaceRoot, timestamp),
    sessions,
    workspaceRoot,
    timestamp,
  );
}

function validateStageAgentBindingAgainstSessions(
  binding: ShortDramaStageAgentBinding,
  sessions: ShortDramaStageAgentSessionCandidate[],
  workspaceRoot: string | undefined,
  timestamp: number,
): ShortDramaStageAgentBinding {
  const normalizedWorkspaceRoot = normalizeShortDramaWorkspacePath(workspaceRoot) ?? workspaceRoot ?? binding.workspaceRoot;
  if (!binding.childSessionId) {
    return {
      ...binding,
      workspaceRoot: normalizedWorkspaceRoot,
      status: binding.status === 'recreating' ? 'recreating' : 'unbound',
      lastValidatedAt: timestamp,
    };
  }

  const session = sessions.find(candidate => candidate.childSessionId === binding.childSessionId);
  if (!session) {
    return {
      ...binding,
      workspaceRoot: normalizedWorkspaceRoot,
      status: 'missing',
      lastValidatedAt: timestamp,
      error: {
        code: 'session_missing',
        message: `${binding.agentName} session data is missing from the runtime session store.`,
      },
    };
  }

  if (session.workspacePath && normalizedWorkspaceRoot && !areShortDramaWorkspacePathsEqual(session.workspacePath, normalizedWorkspaceRoot)) {
    return {
      ...binding,
      workspaceRoot: normalizedWorkspaceRoot,
      status: 'workspace_mismatch',
      lastValidatedAt: timestamp,
      error: {
        code: 'workspace_mismatch',
        message: `${binding.agentName} belongs to a different workspace.`,
      },
    };
  }

  if (!session.parentSessionId && !binding.parentSessionId) {
    return {
      ...binding,
      workspaceRoot: normalizedWorkspaceRoot,
      status: 'missing',
      lastValidatedAt: timestamp,
      error: {
        code: 'parent_missing',
        message: `${binding.agentName} exists but is missing its parent main session.`,
      },
    };
  }

  return {
    ...binding,
    childSessionId: session.childSessionId,
    parentSessionId: session.parentSessionId ?? binding.parentSessionId,
    parentToolCallId: session.parentToolCallId ?? binding.parentToolCallId,
    workspaceRoot: normalizedWorkspaceRoot,
    status: 'ready',
    lastValidatedAt: timestamp,
    error: undefined,
  };
}

function createBaseBinding(
  stage: ShortDramaStage,
  agentName: ShortDramaStageAgentBinding['agentName'],
  workspaceRoot: string,
  timestamp: number,
  existing?: ShortDramaStageAgentBinding,
): ShortDramaStageAgentBinding {
  return {
    stage,
    agentName,
    workspaceRoot,
    status: 'unbound',
    source: existing?.source ?? 'restored_binding',
    createdAt: existing?.createdAt,
    updatedAt: timestamp,
    lastValidatedAt: timestamp,
  };
}

function areStageAgentBindingsEquivalent(
  left: ShortDramaStageAgentBinding,
  right?: ShortDramaStageAgentBinding,
) {
  if (!right) {
    return false;
  }

  return left.stage === right.stage
    && left.agentName === right.agentName
    && left.childSessionId === right.childSessionId
    && left.parentSessionId === right.parentSessionId
    && left.parentToolCallId === right.parentToolCallId
    && left.status === right.status
    && left.workspaceRoot === right.workspaceRoot
    && left.error?.code === right.error?.code;
}

function chooseMostRecent(sessions: ShortDramaStageAgentSessionCandidate[]) {
  const sorted = [...sessions].sort((a, b) => getSessionTime(b) - getSessionTime(a));
  if (sorted.length === 0) return { status: 'empty' as const };
  if (sorted.length === 1) return { status: 'ready' as const, candidate: sorted[0] };
  if (getSessionTime(sorted[0]) > getSessionTime(sorted[1])) {
    return { status: 'ready' as const, candidate: sorted[0] };
  }
  return { status: 'conflict' as const };
}

export function isRealStageAgentSessionCandidate(session: ShortDramaStageAgentSessionCandidate) {
  if (session.isTransient && !session.agentBackedTransient) {
    return false;
  }
  const sessionId = normalize(session.childSessionId);
  if (sessionId.startsWith('short-drama-stage-') || sessionId.startsWith('short-drama-stage-agent:')) {
    return false;
  }
  const title = normalize(session.title);
  return !/^short drama .+ agent$/.test(title);
}

export function matchesNativeAgent(session: ShortDramaStageAgentSessionCandidate, nativeAgentName: string) {
  const normalized = normalize(nativeAgentName);
  return [
    session.subagentType,
    session.agentType,
    session.title,
  ].some(value => normalize(value).includes(normalized));
}

function getSessionTime(session: ShortDramaStageAgentSessionCandidate) {
  return session.lastActiveAt ?? session.createdAt ?? 0;
}

function createShortDramaStageAgentBindingProjectPath(workspaceRoot: string) {
  return `${workspaceRoot.replace(/[\\/]+$/, '')}/.void/short-drama`;
}

function isStageAgentBindingStatus(value: unknown): value is ShortDramaStageAgentBindingStatus {
  return value === 'unbound'
    || value === 'ready'
    || value === 'missing'
    || value === 'stale'
    || value === 'recreating'
    || value === 'conflict'
    || value === 'workspace_mismatch'
    || value === 'error';
}

function isStageAgentBindingSource(value: unknown): value is ShortDramaStageAgentBindingSource {
  return value === 'main_ai_wake'
    || value === 'manual_stage_open'
    || value === 'restored_binding'
    || value === 'runtime_recreated';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrUndefined(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberOrUndefined(value: unknown) {
  return typeof value === 'number' ? value : undefined;
}

function normalize(value?: string) {
  return value?.trim().toLowerCase() ?? '';
}
