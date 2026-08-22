/**
 * Team authoring — one screen, three steps.
 *
 * ① name + one-line goal · ② pick members from a text-first searchable list
 * (first pick leads; tap another member's "make lead" action to switch)
 * ③ one primary save button.
 *
 * The page owns presentation only. Every authoring rule — canonical member and
 * workflow rebuilds, source-qualified raw agent ids, fail-closed rosters —
 * still lives in TeamAuthoringService; editing an existing team reuses this
 * same screen prefilled and never mints runtime ids in the frontend, so the
 * roster stays locked there and only the name, goal and lead can move.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '@/component-library';
import { useWorkspaceManagerSync } from '@/infrastructure/hooks/useWorkspaceManagerSync';
import type {
  TeamDefinition,
  TeamDefinitionDraft,
  TeamDefinitionLevel,
  TeamMemberDraft,
} from '@/infrastructure/config/types';
import {
  CapabilityCatalogService,
  customizationRuntimeCapabilityService,
  ExistingAgentCatalogAdapter,
  createTeamDraftFromRoster,
  DEFAULT_TEAM_MEMBER_DELEGATION_POLICY,
  existingTeamDefinitionAdapter,
  localizeCatalogPresentation,
  organizeTeamDraft,
  TeamAuthoringError,
  type AgentCatalogEntry,
  type CustomizationRuntimeCapabilityReader,
  type TeamAuthoringDiagnostic,
  type TeamAuthoringGateway,
  type TeamAuthoringTemplate,
} from '@/shared/services/customization';
import { useAgentsStore } from '../agentsStore';
import AgentAvatar from './AgentAvatar';
import './TeamAuthoringPage.scss';

const MAX_MEMBERS = 12;
const MIN_MEMBERS = 2;

const agentCatalog = new CapabilityCatalogService([
  new ExistingAgentCatalogAdapter(),
]);

/** One row of the ordered member strip, shared by create and edit. */
interface RosterSlot {
  key: string;
  agentId: string;
  displayName: string;
  isLead: boolean;
}

function definitionToDraft(definition: TeamDefinition): TeamDefinitionDraft {
  return {
    displayName: definition.displayName,
    description: definition.description,
    emblem: definition.emblem,
    accent: definition.accent,
    category: definition.category,
    capabilityTags: [...definition.capabilityTags],
    scenarioEligibility: [...definition.scenarioEligibility],
    leadMemberKey: definition.leadMemberId,
    members: definition.members.map(member => ({
      clientKey: member.memberId,
      displayName: member.displayName,
      professionalRole: member.professionalRole,
      role: member.role,
      instructions: member.instructions,
      outputResponsibility: member.outputResponsibility,
      agentId: member.agentId,
      allowedSkillKeys: [...member.allowedSkillKeys],
      allowedToolNames: [...member.allowedToolNames],
      isReadonly: member.isReadonly,
      delegationPolicy: member.delegationPolicy ?? { kind: 'disabled' },
    })),
    workflows: definition.workflows.map(workflow => ({
      clientKey: workflow.workflowId,
      displayName: workflow.displayName,
      triggerDescription: workflow.triggerDescription,
      phases: workflow.phases.map(phase => ({
        clientKey: phase.phaseId,
        displayName: phase.displayName,
        kind: phase.kind,
        dependsOnPhaseKeys: [...phase.dependsOnPhaseIds],
        assignedMemberKeys: [...phase.assignedMemberIds],
        expectedOutputs: [...phase.expectedOutputs],
        completionRule: phase.completionRule,
      })),
    })),
  };
}

function draftToExistingDefinition(
  draft: TeamDefinitionDraft,
  existing: TeamDefinition,
): TeamDefinition {
  return {
    schemaVersion: existing.schemaVersion === 2
      || draft.members.some(member => member.delegationPolicy?.kind === 'bounded')
      ? 2
      : 1,
    teamDefinitionId: existing.teamDefinitionId,
    displayName: draft.displayName,
    description: draft.description,
    emblem: draft.emblem,
    accent: draft.accent,
    category: draft.category,
    capabilityTags: draft.capabilityTags,
    scenarioEligibility: draft.scenarioEligibility,
    leadMemberId: draft.leadMemberKey,
    members: draft.members.map(member => ({
      memberId: member.clientKey,
      displayName: member.displayName,
      professionalRole: member.professionalRole,
      role: member.role,
      instructions: member.instructions,
      outputResponsibility: member.outputResponsibility,
      agentId: member.agentId,
      allowedSkillKeys: member.allowedSkillKeys,
      allowedToolNames: member.allowedToolNames,
      permissionPolicy: 'inherit_parent_intersection',
      isReadonly: member.isReadonly,
      delegationPolicy: member.delegationPolicy,
    })),
    workflows: draft.workflows.map(workflow => ({
      workflowId: workflow.clientKey,
      displayName: workflow.displayName,
      triggerDescription: workflow.triggerDescription,
      phases: workflow.phases.map(phase => ({
        phaseId: phase.clientKey,
        displayName: phase.displayName,
        kind: phase.kind,
        dependsOnPhaseIds: phase.dependsOnPhaseKeys,
        assignedMemberIds: phase.assignedMemberKeys,
        expectedOutputs: phase.expectedOutputs,
        completionRule: phase.completionRule,
      })),
    })),
    collaborationPolicy: existing.collaborationPolicy,
    permissionPolicy: existing.permissionPolicy,
    origin: existing.origin,
  };
}

function emptyDraft(template: TeamAuthoringTemplate): TeamDefinitionDraft {
  const generated = organizeTeamDraft({
    route: 'describe',
    displayName: '',
    sourceText: 'seed',
    scenarioEligibility: ['code'],
    template,
  }).draft;
  return {
    ...generated,
    displayName: '',
    description: '',
  };
}

export interface TeamAuthoringPageProps {
  gateway?: TeamAuthoringGateway;
  capabilityService?: CustomizationRuntimeCapabilityReader;
}

const TeamAuthoringPage: React.FC<TeamAuthoringPageProps> = ({
  gateway = existingTeamDefinitionAdapter,
  capabilityService = customizationRuntimeCapabilityService,
}) => {
  const { t } = useTranslation('scenes/agents');
  const { workspacePath, hasWorkspace, isRemoteWorkspace } =
    useWorkspaceManagerSync();
  const {
    teamEditorMode,
    editingTeamDefinitionId,
    editingTeamLevel,
    openHome,
    openCreateAgent,
    requestCatalogRefresh,
  } = useAgentsStore();
  const isEdit = teamEditorMode === 'edit';
  const managementCapability = capabilityService.getCapability('team_management');

  const template = useMemo<TeamAuthoringTemplate>(() => ({
    defaultCategory: t('teamAuthoring.template.defaultCategory'),
    describeDescriptionPrefix: t('teamAuthoring.template.describeDescriptionPrefix'),
    materialDescriptionPrefix: t('teamAuthoring.template.materialDescriptionPrefix'),
    leadDisplayName: t('teamAuthoring.template.leadDisplayName'),
    leadProfessionalRole: t('teamAuthoring.template.leadProfessionalRole'),
    specialistDisplayName: t('teamAuthoring.template.specialistDisplayName'),
    specialistProfessionalRole: t('teamAuthoring.template.specialistProfessionalRole'),
    describeLeadInstructions: t('teamAuthoring.template.describeLeadInstructions'),
    materialLeadInstructions: t('teamAuthoring.template.materialLeadInstructions'),
    leadOutputResponsibility: t('teamAuthoring.template.leadOutputResponsibility'),
    describeSpecialistInstructions: t('teamAuthoring.template.describeSpecialistInstructions'),
    materialSpecialistInstructions: t('teamAuthoring.template.materialSpecialistInstructions'),
    specialistOutputResponsibility: t('teamAuthoring.template.specialistOutputResponsibility'),
    workflowDisplayName: t('teamAuthoring.template.workflowDisplayName'),
    describeWorkflowTrigger: t('teamAuthoring.template.describeWorkflowTrigger'),
    materialWorkflowTrigger: t('teamAuthoring.template.materialWorkflowTrigger'),
    specialistPhaseDisplayName: t('teamAuthoring.template.specialistPhaseDisplayName'),
    specialistExpectedOutput: t('teamAuthoring.template.specialistExpectedOutput'),
    specialistCompletionRule: t('teamAuthoring.template.specialistCompletionRule'),
    leadPhaseDisplayName: t('teamAuthoring.template.leadPhaseDisplayName'),
    leadExpectedOutput: t('teamAuthoring.template.leadExpectedOutput'),
    leadCompletionRule: t('teamAuthoring.template.leadCompletionRule'),
  }), [t]);

  const [level, setLevel] = useState<TeamDefinitionLevel>('user');
  const [draft, setDraft] = useState<TeamDefinitionDraft>(() => emptyDraft(template));
  const [existingDefinition, setExistingDefinition] =
    useState<TeamDefinition | null>(null);
  const [revision, setRevision] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<TeamAuthoringDiagnostic[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [agentOptions, setAgentOptions] = useState<AgentCatalogEntry[]>([]);
  const [agentCatalogStatus, setAgentCatalogStatus] = useState<
    'loading' | 'ready' | 'empty' | 'partial' | 'error'
  >('loading');
  const [agentCatalogRetryKey, setAgentCatalogRetryKey] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [leadAgentId, setLeadAgentId] = useState('');

  useEffect(() => {
    if (managementCapability.status === 'unsupported') return;
    let cancelled = false;
    setAgentCatalogStatus('loading');
    void agentCatalog.list({
      kinds: ['agent'],
      workspacePath: workspacePath || undefined,
    }).then(result => {
      if (cancelled) return;
      if (result.errors.some(error => error.code === 'subagent_catalog_load_failed')) {
        setAgentCatalogStatus('error');
        return;
      }
      setAgentOptions(result.entries.filter(
        (entry): entry is AgentCatalogEntry => entry.kind === 'agent',
      ));
      setAgentCatalogStatus(result.status);
    }).catch(() => {
      if (!cancelled) {
        setAgentCatalogStatus('error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [agentCatalogRetryKey, managementCapability.status, workspacePath]);

  useEffect(() => {
    if (
      managementCapability.status === 'unsupported'
      || !isEdit
      || !editingTeamDefinitionId
      || !editingTeamLevel
    ) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void gateway.get({
      teamDefinitionId: editingTeamDefinitionId,
      level: editingTeamLevel,
      workspacePath: editingTeamLevel === 'project'
        ? workspacePath || undefined
        : undefined,
    }).then(record => {
      if (cancelled) return;
      setLevel(record.level);
      setExistingDefinition(record.definition);
      setRevision(record.revision);
      setDraft(definitionToDraft(record.definition));
    }).catch(error => {
      if (cancelled) return;
      setLoadError(
        error instanceof TeamAuthoringError
          ? error.code
          : 'read_failed',
      );
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    editingTeamDefinitionId,
    editingTeamLevel,
    gateway,
    isEdit,
    managementCapability.status,
    workspacePath,
  ]);

  useEffect(() => {
    if ((!hasWorkspace || isRemoteWorkspace) && level === 'project' && !isEdit) {
      setLevel('user');
    }
  }, [hasWorkspace, isEdit, isRemoteWorkspace, level]);

  const errorMessage = useCallback((code: string) => (
    t(`teamAuthoring.errors.${code}`)
  ), [t]);
  const diagnosticMessage = useCallback((item: TeamAuthoringDiagnostic) => (
    t(`teamAuthoring.diagnostics.${item.code}`)
  ), [t]);

  const availableAgents = useMemo(() => agentOptions
    .filter(entry => (
      entry.agentKind === 'subagent'
      && (entry.origin === 'user' || entry.origin === 'project')
      && (entry.origin !== 'project' || (hasWorkspace && !isRemoteWorkspace))
      && entry.availability.status === 'available'
      && entry.activationSupport === 'parent_persona'
    ))
    .map(entry => ({
      id: entry.identity.id,
      origin: entry.origin,
      scenarios: entry.scenarioEligibility,
      isReadonly: entry.isReadonly,
      ...localizeCatalogPresentation(entry.identity, key => t(key)),
    })), [agentOptions, hasWorkspace, isRemoteWorkspace, t]);

  const visibleAgents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return availableAgents;
    return availableAgents.filter(agent => [
      agent.displayName,
      agent.description,
      agent.id,
      ...agent.aliases,
    ].some(value => value.toLocaleLowerCase().includes(query)));
  }, [availableAgents, search]);

  const selectedAgents = useMemo(() => selectedAgentIds
    .map(id => availableAgents.find(agent => agent.id === id))
    .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent)), [
      availableAgents,
      selectedAgentIds,
    ]);
  const requiresProjectScope = selectedAgents.some(
    agent => agent.origin === 'project',
  );

  const rosterDraftResult = useMemo(() => createTeamDraftFromRoster({
    displayName: draft.displayName,
    goal: draft.description,
    leadAgentId,
    selectedAgents: selectedAgents.map(agent => ({
      agentId: agent.id,
      displayName: agent.displayName,
      description: agent.description,
      scenarioEligibility: agent.scenarios,
      isReadonly: agent.isReadonly,
      delegationPolicy: agent.isReadonly
        ? { kind: 'disabled' }
        : { ...DEFAULT_TEAM_MEMBER_DELEGATION_POLICY },
    })),
    template,
  }), [
    draft.description,
    draft.displayName,
    leadAgentId,
    selectedAgents,
    template,
  ]);

  /** The ordered strip: catalog picks when creating, saved members when editing. */
  const slots = useMemo<RosterSlot[]>(() => (isEdit
    ? draft.members.map(member => ({
      key: member.clientKey,
      agentId: member.agentId ?? member.clientKey,
      displayName: member.displayName,
      isLead: member.clientKey === draft.leadMemberKey,
    }))
    : selectedAgents.map(agent => ({
      key: agent.id,
      agentId: agent.id,
      displayName: agent.displayName,
      isLead: agent.id === leadAgentId,
    }))
  ), [draft.leadMemberKey, draft.members, isEdit, leadAgentId, selectedAgents]);

  const updateDraft = (
    patch: Partial<TeamDefinitionDraft>,
    field?: TeamAuthoringDiagnostic['field'],
  ) => {
    setDraft(current => ({ ...current, ...patch }));
    setSaveError(null);
    if (field) {
      setDiagnostics(current => current.filter(item => item.field !== field));
    }
  };

  const toggleAgent = (agentId: string) => {
    setSaveError(null);
    setDiagnostics([]);
    setSelectedAgentIds(current => {
      if (current.includes(agentId)) {
        const next = current.filter(id => id !== agentId);
        if (leadAgentId === agentId) setLeadAgentId(next[0] ?? '');
        return next;
      }
      if (current.length >= MAX_MEMBERS) return current;
      if (availableAgents.find(agent => agent.id === agentId)?.origin === 'project') {
        setLevel('project');
      }
      if (current.length === 0) setLeadAgentId(agentId);
      return [...current, agentId];
    });
  };

  /** Edit mode keeps every stable id; only the lead role moves. */
  const chooseSavedLead = (memberKey: string) => {
    setSaveError(null);
    updateDraft({
      leadMemberKey: memberKey,
      members: draft.members.map((member): TeamMemberDraft => ({
        ...member,
        role: member.clientKey === memberKey
          ? 'lead'
          : member.role === 'lead'
            ? 'specialist'
            : member.role,
      })),
    }, 'leadMemberKey');
  };

  const makeLead = (key: string) => {
    if (isEdit) {
      chooseSavedLead(key);
      return;
    }
    setSaveError(null);
    setLeadAgentId(key);
  };

  const submit = async () => {
    setSaveError(null);
    if (isEdit && (!existingDefinition || !revision)) return;

    const result = isEdit
      ? organizeTeamDraft({
        route: 'manual',
        displayName: draft.displayName,
        description: draft.description,
        category: draft.category,
        capabilityTags: draft.capabilityTags,
        scenarioEligibility: draft.scenarioEligibility,
        leadMemberKey: draft.leadMemberKey,
        members: draft.members,
        workflows: draft.workflows,
        template,
      })
      : rosterDraftResult;
    setDiagnostics(result.diagnostics);
    if (!result.isValid) return;

    if (level === 'project' && (!workspacePath || isRemoteWorkspace)) {
      setSaveError(isRemoteWorkspace
        ? errorMessage('unsupported_remote_project')
        : t('teamAuthoring.messages.noWorkspace'));
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        await gateway.update({
          teamDefinitionId: existingDefinition!.teamDefinitionId,
          level,
          expectedRevision: revision!,
          definition: draftToExistingDefinition(result.draft, existingDefinition!),
          workspacePath: level === 'project' ? workspacePath : undefined,
        });
      } else {
        await gateway.create({
          level,
          draft: result.draft,
          workspacePath: level === 'project' ? workspacePath : undefined,
        });
      }
      requestCatalogRefresh();
      openHome();
    } catch (error) {
      const code = error instanceof TeamAuthoringError
        ? error.code
        : 'write_failed';
      const recoveryPath = error instanceof TeamAuthoringError
        ? error.recoveryPath
        : undefined;
      setSaveError(recoveryPath
        ? t('teamAuthoring.messages.failedWithRecovery', {
          error: errorMessage(code),
          path: recoveryPath,
        })
        : errorMessage(code));
    } finally {
      setSubmitting(false);
    }
  };

  const backButton = (
    <button type="button" className="team-authoring__back" onClick={openHome}>
      <ArrowLeft size={14} />
      {t('teamAuthoring.back')}
    </button>
  );

  if (managementCapability.status === 'unsupported') {
    return (
      <div className="team-authoring">
        {backButton}
        <p
          className="agent-surface__state is-error"
          data-testid="team-authoring-runtime-unsupported"
        >
          {t('teamAuthoring.runtimeUnsupported')}
        </p>
      </div>
    );
  }

  if (loading || loadError) {
    return (
      <div className="team-authoring">
        {backButton}
        <p className={`agent-surface__state${loadError ? ' is-error' : ''}`}>
          {loadError ? errorMessage(loadError) : t('teamAuthoring.loading')}
        </p>
      </div>
    );
  }

  const firstDiagnostic = diagnostics[0];
  const belowMinimum = !isEdit && slots.length < MIN_MEMBERS;
  const incompatibleRoster = !isEdit
    && slots.length >= MIN_MEMBERS
    && rosterDraftResult.draft.scenarioEligibility.length === 0;
  const catalogIsEmpty = agentCatalogStatus !== 'loading'
    && agentCatalogStatus !== 'error'
    && availableAgents.length === 0;

  return (
    <div className="team-authoring">
      {backButton}
      <div className="team-authoring__scroll">
        <main className="team-authoring__inner" data-testid="team-authoring">
          <h1 className="team-authoring__title">
            {t(isEdit ? 'teamAuthoring.titleEdit' : 'teamAuthoring.titleCreate')}
          </h1>
          <p className="team-authoring__mission">
            {t(isEdit
              ? 'teamAuthoring.subtitleEdit'
              : 'teamAuthoring.roster.subtitle')}
          </p>

          <section className="team-authoring__step">
            <h2 className="agent-surface__section-label">
              {t('teamAuthoring.steps.identity')}
            </h2>
            <label className="team-authoring__field">
              <span>{t('teamAuthoring.basics.displayName')}</span>
              <Input
                value={draft.displayName}
                onChange={event => updateDraft(
                  { displayName: event.target.value },
                  'displayName',
                )}
                placeholder={t('teamAuthoring.roster.namePlaceholder')}
                inputSize="small"
              />
            </label>
            <label className="team-authoring__field">
              <span>{t('teamAuthoring.roster.goal')}</span>
              <Input
                value={draft.description}
                onChange={event => updateDraft(
                  { description: event.target.value },
                  'description',
                )}
                placeholder={t('teamAuthoring.roster.goalPlaceholder')}
                inputSize="small"
              />
            </label>
          </section>

          <section className="team-authoring__step">
            <h2 className="agent-surface__section-label">
              {t('teamAuthoring.steps.members')}
            </h2>

            {slots.length > 0 ? (
              <ol className="team-authoring__slots">
                {slots.map(slot => (
                  <li
                    key={slot.key}
                    className={`team-authoring__slot${slot.isLead ? ' is-lead' : ''}`}
                  >
                    <AgentAvatar
                      identity={slot.agentId}
                      name={slot.displayName}
                      className="team-authoring__avatar"
                    />
                    <span className="team-authoring__slot-name">
                      {slot.displayName}
                    </span>
                    {slot.isLead ? (
                      <span className="team-authoring__lead-tag">
                        {t('teamAuthoring.roster.lead')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="agent-surface__action team-authoring__slot-action"
                        onClick={() => makeLead(slot.key)}
                        aria-label={t('teamAuthoring.roster.makeLeadAria', {
                          name: slot.displayName,
                        })}
                      >
                        {t('teamAuthoring.members.makeLead')}
                      </button>
                    )}
                    {!isEdit && !slot.isLead ? (
                      <button
                        type="button"
                        className="agent-surface__action team-authoring__slot-action"
                        onClick={() => toggleAgent(slot.key)}
                        aria-label={t('teamAuthoring.roster.removeAria', {
                          name: slot.displayName,
                        })}
                      >
                        {t('teamAuthoring.roster.removeAction')}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : null}

            {belowMinimum ? (
              <p className="agent-surface__state" data-testid="team-authoring-minimum">
                {t('teamAuthoring.roster.minimum')}
              </p>
            ) : null}
            {incompatibleRoster ? (
              <p className="agent-surface__state is-error" role="alert">
                {t('teamAuthoring.roster.noCommonRoom')}
              </p>
            ) : null}

            {isEdit ? (
              <p className="agent-surface__state">
                {t('teamAuthoring.preview.editStructureLocked')}
              </p>
            ) : (
              <>
                <input
                  type="search"
                  className="team-authoring__search"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder={t('teamAuthoring.roster.searchPlaceholder')}
                  aria-label={t('teamAuthoring.roster.searchLabel')}
                />
                {agentCatalogStatus === 'loading' ? (
                  <p className="agent-surface__state" aria-live="polite">
                    {t('teamAuthoring.roster.loadingAgents')}
                  </p>
                ) : agentCatalogStatus === 'error' ? (
                  <p className="agent-surface__state is-error" role="alert">
                    {t('teamAuthoring.roster.loadFailed')}
                    {' '}
                    <button
                      type="button"
                      className="agent-surface__action"
                      onClick={() => setAgentCatalogRetryKey(value => value + 1)}
                    >
                      {t('teamAuthoring.roster.retry')}
                    </button>
                  </p>
                ) : catalogIsEmpty ? (
                  <p className="agent-surface__state">
                    {t('teamAuthoring.roster.emptyAgents')}
                    {' '}
                    <button
                      type="button"
                      className="agent-surface__action"
                      onClick={openCreateAgent}
                    >
                      {t('teamAuthoring.roster.createAgentFirst')}
                    </button>
                  </p>
                ) : visibleAgents.length === 0 ? (
                  <p className="agent-surface__state">
                    {t('teamAuthoring.roster.noSearchResult')}
                  </p>
                ) : (
                  <ul className="team-authoring__picks">
                    {visibleAgents.map(agent => {
                      const selected = selectedAgentIds.includes(agent.id);
                      const limitReached = !selected
                        && selectedAgentIds.length >= MAX_MEMBERS;
                      return (
                        <li key={agent.id}>
                          <button
                            type="button"
                            className={`team-authoring__pick${selected ? ' is-selected' : ''}`}
                            role="checkbox"
                            aria-checked={selected}
                            disabled={limitReached}
                            onClick={() => toggleAgent(agent.id)}
                          >
                            <span
                              className="team-authoring__pick-box"
                              aria-hidden="true"
                            />
                            <span className="agent-surface__row-copy">
                              <strong>{agent.displayName}</strong>
                              <small>
                                {agent.description
                                  || t('teamAuthoring.roster.customAgent')}
                              </small>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </section>

          <section className="team-authoring__step">
            <h2 className="agent-surface__section-label">
              {t('teamAuthoring.steps.save')}
            </h2>
            <div className="team-authoring__scope" aria-label={t('teamAuthoring.scope.title')}>
              {(['user', 'project'] as TeamDefinitionLevel[]).map(nextLevel => (
                <button
                  key={nextLevel}
                  type="button"
                  className={`agent-surface__action${level === nextLevel ? ' is-active' : ''}`}
                  aria-pressed={level === nextLevel}
                  disabled={
                    isEdit
                    || (nextLevel === 'project' && (!hasWorkspace || isRemoteWorkspace))
                    || (nextLevel === 'user' && requiresProjectScope)
                  }
                  onClick={() => setLevel(nextLevel)}
                >
                  {t(`teamAuthoring.scope.${nextLevel}`)}
                </button>
              ))}
            </div>

            {firstDiagnostic ? (
              <p
                className="agent-surface__state is-error"
                role="alert"
                data-testid="team-authoring-diagnostic"
              >
                {diagnosticMessage(firstDiagnostic)}
              </p>
            ) : null}
            {saveError ? (
              <p
                className="agent-surface__state is-error"
                role="alert"
                data-testid="team-authoring-save-error"
              >
                {saveError}
                {' '}
                <button
                  type="button"
                  className="agent-surface__action"
                  onClick={() => void submit()}
                >
                  {t('teamAuthoring.actions.retry')}
                </button>
              </p>
            ) : null}

            <div className="team-authoring__actions">
              <button
                type="button"
                className="agent-surface__action"
                onClick={openHome}
                disabled={submitting}
              >
                {t('teamAuthoring.actions.cancel')}
              </button>
              <Button
                variant="primary"
                size="small"
                data-testid="team-authoring-submit"
                onClick={() => void submit()}
                disabled={submitting || (!isEdit && agentCatalogStatus === 'loading')}
              >
                {submitting
                  ? '…'
                  : t(isEdit
                    ? 'teamAuthoring.actions.save'
                    : 'teamAuthoring.actions.create')}
              </Button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default TeamAuthoringPage;
