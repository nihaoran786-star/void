import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Session } from '@/flow_chat/types/flow-chat';
import type { SessionActivePersonaBinding } from '@/shared/types/session-history';
import {
  ComposerPersonaService,
  customizationRuntimeCapabilityService,
  reusableTeamActivationService,
  ReusableTeamActivationError,
  scenarioFromLegacyAgentType,
  type AgentCatalogEntry,
  type ComposerPersonaCatalog,
  type CustomizationRuntimeCapabilityReader,
  type PersonaTurnSnapshotDescriptor,
  type ReusableTeamActivator,
  type TeamCatalogEntry,
} from '@/shared/services/customization';

const defaultComposerPersonaService = new ComposerPersonaService();

const persistComposerPersona: NonNullable<
  UseComposerPersonaSelectionOptions['persistPersona']
> = async (sessionId, state) => {
  const { FlowChatManager } = await import('@/flow_chat/services/FlowChatManager');
  await FlowChatManager.getInstance().updateChatSessionPersona(sessionId, state);
};

export interface ComposerTeamActions {
  launchDeepReview: () => Promise<void>;
  openShortDrama: () => void | Promise<void>;
}

export interface DeferredComposerPersonaSelection {
  target: AgentCatalogEntry | TeamCatalogEntry | null;
  onChange(target: AgentCatalogEntry | TeamCatalogEntry | null): void;
}

export interface UseComposerPersonaSelectionOptions {
  session?: Session;
  workspacePath?: string;
  currentAgentType?: string;
  enabled: boolean;
  /** Unpersisted selection used before a real parent session exists. */
  deferredSelection?: DeferredComposerPersonaSelection;
  service?: ComposerPersonaService;
  teamActivationService?: ReusableTeamActivator;
  capabilityService?: CustomizationRuntimeCapabilityReader;
  persistPersona?: (
    sessionId: string,
    state: {
      scenario: 'code' | 'cowork' | 'media';
      executionPolicy: string;
      activePersonaBinding: SessionActivePersonaBinding | null;
    },
  ) => Promise<void>;
}

const EMPTY_CATALOG: ComposerPersonaCatalog = {
  status: 'empty',
  agents: [],
  teams: [],
  errors: [],
};

export function useComposerPersonaSelection({
  session,
  workspacePath,
  currentAgentType,
  enabled,
  deferredSelection,
  service = defaultComposerPersonaService,
  teamActivationService = reusableTeamActivationService,
  capabilityService = customizationRuntimeCapabilityService,
  persistPersona = persistComposerPersona,
}: UseComposerPersonaSelectionOptions) {
  const requestIdRef = useRef(0);
  const personaPersistencePendingRef = useRef(false);
  const [catalog, setCatalog] = useState<ComposerPersonaCatalog>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string>();
  const [personaPersistencePending, setPersonaPersistencePending] = useState(false);
  const [catalogError, setCatalogError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const catalogCapability = capabilityService.getCapability('catalog_read');
  const activationCapability =
    capabilityService.getCapability('persona_activation');
  const runtimeUnsupported =
    catalogCapability.status === 'unsupported'
    || activationCapability.status === 'unsupported';

  const sessionId = session?.sessionId;
  const sessionKind = session?.sessionKind;
  const legacyAgentType = session?.mode ?? session?.config.agentType;
  const scenario = session?.scenario
    ?? scenarioFromLegacyAgentType(currentAgentType ?? legacyAgentType);
  const executionPolicy =
    currentAgentType?.trim()
    || session?.mode?.trim()
    || session?.executionPolicy?.trim()
    || session?.config.agentType?.trim()
    || 'agentic';
  const normalizedWorkspacePath =
    workspacePath?.trim().replace(/\\/g, '/') || undefined;
  const activePersonaKind = session?.activePersonaBinding?.kind;
  const activePersonaId = session?.activePersonaBinding?.personaId;
  const activePersonaRevisionStatus =
    session?.activePersonaBinding?.personaRevision.status;
  const activePersonaRevisionValue =
    session?.activePersonaBinding?.personaRevision.status === 'known'
      ? session.activePersonaBinding.personaRevision.value
      : undefined;
  const activeTeamDefinitionId =
    session?.activePersonaBinding?.teamDefinitionId;
  const activeTeamInstanceId = session?.activePersonaBinding?.teamInstanceId;
  const deferredTarget = deferredSelection?.target ?? null;
  const changeDeferredTarget = deferredSelection?.onChange;
  const hasDeferredSelection = Boolean(deferredSelection);

  const activePersonaBinding = useMemo<SessionActivePersonaBinding | null>(() => {
    if (!activePersonaKind || !activePersonaId || !activePersonaRevisionStatus) {
      return null;
    }
    return {
      kind: activePersonaKind,
      personaId: activePersonaId,
      personaRevision: activePersonaRevisionStatus === 'known'
        ? {
            status: 'known',
            value: activePersonaRevisionValue ?? '',
          }
        : { status: 'legacy_unversioned' },
      ...(activeTeamDefinitionId
        ? { teamDefinitionId: activeTeamDefinitionId }
        : {}),
      ...(activeTeamInstanceId ? { teamInstanceId: activeTeamInstanceId } : {}),
    };
  }, [
    activePersonaId,
    activePersonaKind,
    activePersonaRevisionStatus,
    activePersonaRevisionValue,
    activeTeamDefinitionId,
    activeTeamInstanceId,
  ]);

  const reload = useCallback(async () => {
    if (!enabled || (!sessionId && !hasDeferredSelection) || runtimeUnsupported) {
      setCatalog(EMPTY_CATALOG);
      setLoading(false);
      setCatalogError(undefined);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setCatalogError(undefined);
    try {
      const next = await service.list({
        scenario,
        executionPolicy,
        workspacePath: normalizedWorkspacePath,
      });
      if (requestId === requestIdRef.current) {
        setCatalog(next);
      }
    } catch {
      if (requestId === requestIdRef.current) {
        setCatalog(EMPTY_CATALOG);
        setCatalogError('load_failed');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [
    enabled,
    hasDeferredSelection,
    executionPolicy,
    normalizedWorkspacePath,
    runtimeUnsupported,
    scenario,
    service,
    sessionId,
  ]);

  useEffect(() => {
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  const selectAgent = useCallback(async (entry: AgentCatalogEntry) => {
    if (runtimeUnsupported) {
      setActionError('server_runtime_deferred');
      throw new Error('server_runtime_deferred');
    }
    if (!enabled || (!hasDeferredSelection && (!sessionId || sessionKind !== 'normal'))) {
      setActionError('parent_session_required');
      return;
    }
    if (changeDeferredTarget) {
      setBusyId(entry.identity.id);
      setActionError(undefined);
      try {
        service.createAgentBinding(entry, scenario);
        changeDeferredTarget(entry);
      } catch {
        setActionError('activation_failed');
        throw new Error('activation_failed');
      } finally {
        setBusyId(undefined);
      }
      return;
    }
    if (!sessionId) {
      throw new Error('parent_session_required');
    }
    if (personaPersistencePendingRef.current) {
      setActionError('persona_persistence_pending');
      throw new Error('persona_persistence_pending');
    }
    personaPersistencePendingRef.current = true;
    setPersonaPersistencePending(true);
    setBusyId(entry.identity.id);
    setActionError(undefined);
    try {
      const binding = service.createAgentBinding(entry, scenario);
      await persistPersona(sessionId, {
        scenario,
        executionPolicy,
        activePersonaBinding: binding,
      });
    } catch {
      setActionError('activation_failed');
      throw new Error('activation_failed');
    } finally {
      personaPersistencePendingRef.current = false;
      setPersonaPersistencePending(false);
      setBusyId(undefined);
    }
  }, [
    enabled,
    changeDeferredTarget,
    hasDeferredSelection,
    executionPolicy,
    persistPersona,
    scenario,
    service,
    sessionId,
    sessionKind,
    runtimeUnsupported,
  ]);

  const clearAgent = useCallback(async () => {
    if (runtimeUnsupported) {
      setActionError('server_runtime_deferred');
      throw new Error('server_runtime_deferred');
    }
    if (!enabled || (!hasDeferredSelection && (!sessionId || sessionKind !== 'normal'))) {
      setActionError('parent_session_required');
      return;
    }
    if (changeDeferredTarget) {
      setActionError(undefined);
      changeDeferredTarget(null);
      return;
    }
    if (!sessionId) {
      throw new Error('parent_session_required');
    }
    if (personaPersistencePendingRef.current) {
      setActionError('persona_persistence_pending');
      throw new Error('persona_persistence_pending');
    }
    personaPersistencePendingRef.current = true;
    setPersonaPersistencePending(true);
    setBusyId('scenario-default');
    setActionError(undefined);
    try {
      await persistPersona(sessionId, {
        scenario,
        executionPolicy,
        activePersonaBinding: null,
      });
    } catch {
      setActionError('clear_failed');
      throw new Error('clear_failed');
    } finally {
      personaPersistencePendingRef.current = false;
      setPersonaPersistencePending(false);
      setBusyId(undefined);
    }
  }, [
    enabled,
    changeDeferredTarget,
    hasDeferredSelection,
    executionPolicy,
    persistPersona,
    scenario,
    sessionId,
    sessionKind,
    runtimeUnsupported,
  ]);

  const runTeamAction = useCallback(async (
    entry: TeamCatalogEntry,
    actions: ComposerTeamActions,
  ) => {
    if (runtimeUnsupported) {
      setActionError('server_runtime_deferred');
      throw new Error('server_runtime_deferred');
    }
    if (!enabled || (!hasDeferredSelection && (!sessionId || sessionKind !== 'normal'))) {
      setActionError('parent_session_required');
      throw new Error('parent_session_required');
    }
    if (changeDeferredTarget) {
      setBusyId(entry.identity.id);
      setActionError(undefined);
      try {
        if (!service.isReusableTeam(entry, scenario)) {
          service.resolveTeamAction(entry, scenario);
        }
        changeDeferredTarget(entry);
      } catch {
        setActionError('team_action_failed');
        throw new Error('team_action_failed');
      } finally {
        setBusyId(undefined);
      }
      return;
    }
    if (!sessionId) {
      throw new Error('parent_session_required');
    }
    if (service.isReusableTeam(entry, scenario)) {
      if (personaPersistencePendingRef.current) {
        setActionError('persona_persistence_pending');
        throw new Error('persona_persistence_pending');
      }
      personaPersistencePendingRef.current = true;
      setPersonaPersistencePending(true);
      setBusyId(entry.identity.id);
      setActionError(undefined);
      try {
        await teamActivationService.activate({
          entry,
          parentSessionId: sessionId,
          scenario,
          executionPolicy,
          persistPersona,
        });
      } catch (error) {
        const code = error instanceof ReusableTeamActivationError
          ? error.code
          : 'team_activation_failed';
        setActionError(code);
        throw new Error(code);
      } finally {
        personaPersistencePendingRef.current = false;
        setPersonaPersistencePending(false);
        setBusyId(undefined);
      }
      return;
    }
    setBusyId(entry.identity.id);
    setActionError(undefined);
    try {
      const action = service.resolveTeamAction(entry, scenario);
      if (action === 'launch_deep_review') {
        await actions.launchDeepReview();
      } else {
        await actions.openShortDrama();
      }
    } catch {
      setActionError('team_action_failed');
      throw new Error('team_action_failed');
    } finally {
      setBusyId(undefined);
    }
  }, [
    enabled,
    changeDeferredTarget,
    hasDeferredSelection,
    executionPolicy,
    persistPersona,
    runtimeUnsupported,
    scenario,
    service,
    sessionId,
    sessionKind,
    teamActivationService,
  ]);

  const activeAgent = useMemo(() => {
    if (deferredTarget?.kind === 'agent') {
      return deferredTarget;
    }
    if (
      activePersonaBinding?.kind !== 'agent'
      || activePersonaBinding.personaRevision.status !== 'known'
    ) {
      return undefined;
    }
    const activeRevision = activePersonaBinding.personaRevision.value;
    return catalog.agents.find(entry =>
      entry.identity.id === activePersonaBinding.personaId
      && entry.identity.revision.status === 'known'
      && entry.identity.revision.value === activeRevision,
    );
  }, [activePersonaBinding, catalog.agents, deferredTarget]);

  const activeTeam = useMemo(() => {
    if (deferredTarget?.kind === 'team') {
      return deferredTarget;
    }
    if (
      activePersonaBinding?.kind !== 'team_lead'
      || !activePersonaBinding.teamDefinitionId
      || activePersonaBinding.personaRevision.status !== 'known'
    ) {
      return undefined;
    }
    const activeRevision = activePersonaBinding.personaRevision.value;
    return catalog.teams.find(entry =>
      entry.identity.id === activePersonaBinding.teamDefinitionId
      && entry.lead.identity.id === activePersonaBinding.personaId
      && entry.lead.identity.revision.status === 'known'
      && entry.lead.identity.revision.value === activeRevision,
    );
  }, [activePersonaBinding, catalog.teams, deferredTarget]);

  const personaSessionState = useMemo<
    PersonaTurnSnapshotDescriptor | undefined
  >(
    () => !runtimeUnsupported && enabled && sessionId && sessionKind === 'normal'
      ? {
          sessionId,
          sessionKind,
          status: activePersonaBinding ? 'selected' : 'scenario_default',
          scenario,
          executionPolicy,
          activePersonaBinding,
        }
      : undefined,
    [
      activePersonaBinding,
      enabled,
      executionPolicy,
      scenario,
      sessionId,
      sessionKind,
      runtimeUnsupported,
    ],
  );

  const isPersonaPersistencePending = useCallback(
    () => personaPersistencePendingRef.current,
    [],
  );

  return {
    enabled: enabled && (hasDeferredSelection || sessionKind === 'normal'),
    loading,
    status: runtimeUnsupported
      ? 'unsupported' as const
      : catalogError
        ? 'error' as const
        : catalog.status,
    error: catalogError ?? actionError,
    catalogError,
    actionError,
    agents: catalog.agents,
    teams: catalog.teams,
    activeAgent,
    activeTeam,
    activePersonaBinding,
    busyId,
    personaPersistencePending,
    isPersonaPersistencePending,
    personaSessionState,
    reload,
    selectAgent,
    clearAgent,
    runTeamAction,
  };
}
