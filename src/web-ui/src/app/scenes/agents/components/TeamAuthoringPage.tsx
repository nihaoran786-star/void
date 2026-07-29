import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  FileText,
  Plus,
  SlidersHorizontal,
  Trash2,
  Users,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Textarea } from '@/component-library';
import { useWorkspaceManagerSync } from '@/infrastructure/hooks/useWorkspaceManagerSync';
import type {
  TeamDefinition,
  TeamDefinitionDraft,
  TeamDefinitionLevel,
  TeamDefinitionRecord,
  TeamDefinitionScenario,
  TeamMemberDraft,
  TeamWorkflowDraft,
  TeamWorkflowPhaseDraft,
  TeamWorkflowPhaseKind,
} from '@/infrastructure/config/types';
import {
  CapabilityCatalogService,
  customizationRuntimeCapabilityService,
  ExistingAgentCatalogAdapter,
  existingTeamDefinitionAdapter,
  localizeCatalogPresentation,
  organizeTeamDraft,
  resolveDefaultCatalogPresentation,
  TeamAuthoringError,
  type AgentCatalogEntry,
  type CustomizationRuntimeCapabilityReader,
  type TeamAuthoringDiagnostic,
  type TeamAuthoringGateway,
  type TeamAuthoringRoute,
  type TeamAuthoringTemplate,
} from '@/shared/services/customization';
import { useNotification } from '@/shared/notification-system';
import { useAgentsStore } from '../agentsStore';
import './TeamAuthoringPage.scss';

const ROUTES: Array<{ id: TeamAuthoringRoute; icon: LucideIcon }> = [
  { id: 'describe', icon: WandSparkles },
  { id: 'material', icon: FileText },
  { id: 'manual', icon: SlidersHorizontal },
];
const SCENARIOS: TeamDefinitionScenario[] = ['code', 'cowork', 'media'];
const PHASE_KINDS: TeamWorkflowPhaseKind[] = [
  'serial',
  'parallel',
  'decision',
  'review',
];
const agentCatalog = new CapabilityCatalogService([
  new ExistingAgentCatalogAdapter(),
]);

function splitList(value: string): string[] {
  return Array.from(new Set(
    value
      .split(/[,，、\n]/)
      .map(item => item.trim())
      .filter(Boolean),
  ));
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
    schemaVersion: existing.schemaVersion,
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

function nextMember(
  clientKey: string,
  agentId: string,
  t: (key: string) => string,
): TeamMemberDraft {
  return {
    clientKey,
    displayName: t('teamAuthoring.defaults.memberName'),
    professionalRole: t('teamAuthoring.defaults.memberRole'),
    role: 'specialist',
    instructions: t('teamAuthoring.defaults.memberInstructions'),
    outputResponsibility: t('teamAuthoring.defaults.memberOutput'),
    agentId,
    allowedSkillKeys: [],
    allowedToolNames: [],
    isReadonly: false,
  };
}

function nextPhase(
  clientKey: string,
  memberKey: string,
  t: (key: string) => string,
): TeamWorkflowPhaseDraft {
  return {
    clientKey,
    displayName: t('teamAuthoring.defaults.phaseName'),
    kind: 'serial',
    dependsOnPhaseKeys: [],
    assignedMemberKeys: [memberKey],
    expectedOutputs: [t('teamAuthoring.defaults.phaseOutput')],
    completionRule: t('teamAuthoring.defaults.phaseCompletion'),
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
  const notification = useNotification();
  const { workspacePath, hasWorkspace, isRemoteWorkspace } =
    useWorkspaceManagerSync();
  const {
    teamEditorMode,
    editingTeamDefinitionId,
    editingTeamLevel,
    openHome,
    requestCatalogRefresh,
  } = useAgentsStore();
  const isEdit = teamEditorMode === 'edit';
  const managementCapability = capabilityService.getCapability('team_management');
  const clientCounter = useRef(1);

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

  const [route, setRoute] = useState<TeamAuthoringRoute>('describe');
  const [level, setLevel] = useState<TeamDefinitionLevel>('user');
  const [sourceText, setSourceText] = useState('');
  const [draft, setDraft] = useState<TeamDefinitionDraft>(() => emptyDraft(template));
  const [existingDefinition, setExistingDefinition] =
    useState<TeamDefinition | null>(null);
  const [revision, setRevision] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<TeamAuthoringDiagnostic[]>([]);
  const [draftPrepared, setDraftPrepared] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [agentOptions, setAgentOptions] = useState<AgentCatalogEntry[]>([]);

  useEffect(() => {
    if (managementCapability.status === 'unsupported') return;
    let cancelled = false;
    void agentCatalog.list({
      kinds: ['agent'],
      workspacePath: workspacePath || undefined,
    }).then(result => {
      if (cancelled) return;
      setAgentOptions(result.entries.filter(
        (entry): entry is AgentCatalogEntry => entry.kind === 'agent',
      ));
    }).catch(() => {
      if (!cancelled) setAgentOptions([]);
    });
    return () => {
      cancelled = true;
    };
  }, [managementCapability.status, workspacePath]);

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
      setRoute('manual');
      setDraftPrepared(true);
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
  const firstDiagnostic = useCallback((field: TeamAuthoringDiagnostic['field']) => (
    diagnostics.find(item => item.field === field)
  ), [diagnostics]);
  const clearDiagnostic = (field: TeamAuthoringDiagnostic['field']) => {
    setDiagnostics(current => current.filter(item => item.field !== field));
  };

  const localizedAgentOptions = useMemo(() => {
    const entries = agentOptions.map(entry => ({
      id: entry.identity.id,
      ...localizeCatalogPresentation(entry.identity, key => t(key)),
    }));
    const existingIds = new Set(entries.map(entry => entry.id));
    for (const fallback of [
      ['agentic', t('teamAuthoring.agentFallbacks.code')],
      ['Cowork', t('teamAuthoring.agentFallbacks.cowork')],
      ['Media', t('teamAuthoring.agentFallbacks.media')],
    ] as const) {
      if (!existingIds.has(fallback[0])) {
        entries.push({
          id: fallback[0],
          displayName: fallback[1],
          description: resolveDefaultCatalogPresentation({
            kind: 'mode',
            id: fallback[0],
            runtimeName: fallback[0],
            runtimeDescription: '',
          }).description,
          aliases: [],
        });
      }
    }
    return entries;
  }, [agentOptions, t]);

  const updateDraft = (
    patch: Partial<TeamDefinitionDraft>,
    field?: TeamAuthoringDiagnostic['field'],
  ) => {
    setDraft(current => ({ ...current, ...patch }));
    if (field) clearDiagnostic(field);
  };

  const toggleScenario = (scenario: TeamDefinitionScenario) => {
    updateDraft({
      scenarioEligibility: draft.scenarioEligibility.includes(scenario)
        ? draft.scenarioEligibility.filter(value => value !== scenario)
        : SCENARIOS.filter(
          value => value === scenario || draft.scenarioEligibility.includes(value),
        ),
    }, 'scenarioEligibility');
  };

  const updateMember = (clientKey: string, patch: Partial<TeamMemberDraft>) => {
    updateDraft({
      members: draft.members.map(member => (
        member.clientKey === clientKey ? { ...member, ...patch } : member
      )),
    }, 'members');
  };

  const chooseLead = (clientKey: string) => {
    updateDraft({
      leadMemberKey: clientKey,
      members: draft.members.map(member => ({
        ...member,
        role: member.clientKey === clientKey
          ? 'lead'
          : member.role === 'lead'
            ? 'specialist'
            : member.role,
      })),
    }, 'leadMemberKey');
  };

  const addMember = () => {
    const clientKey = `member-${clientCounter.current++}`;
    const agentId = localizedAgentOptions[0]?.id ?? 'agentic';
    updateDraft({
      members: [...draft.members, nextMember(clientKey, agentId, t)],
    }, 'members');
  };

  const removeMember = (clientKey: string) => {
    if (clientKey === draft.leadMemberKey || draft.members.length <= 2) return;
    updateDraft({
      members: draft.members.filter(member => member.clientKey !== clientKey),
      workflows: draft.workflows.map(workflow => ({
        ...workflow,
        phases: workflow.phases.map(phase => ({
          ...phase,
          assignedMemberKeys: phase.assignedMemberKeys.filter(
            key => key !== clientKey,
          ),
        })),
      })),
    }, 'members');
  };

  const updateWorkflow = (
    workflowKey: string,
    patch: Partial<TeamWorkflowDraft>,
  ) => {
    updateDraft({
      workflows: draft.workflows.map(workflow => (
        workflow.clientKey === workflowKey
          ? { ...workflow, ...patch }
          : workflow
      )),
    }, 'workflows');
  };

  const updatePhase = (
    workflowKey: string,
    phaseKey: string,
    patch: Partial<TeamWorkflowPhaseDraft>,
  ) => {
    const workflow = draft.workflows.find(item => item.clientKey === workflowKey);
    if (!workflow) return;
    updateWorkflow(workflowKey, {
      phases: workflow.phases.map(phase => (
        phase.clientKey === phaseKey ? { ...phase, ...patch } : phase
      )),
    });
  };

  const addWorkflow = () => {
    const workflowKey = `workflow-${clientCounter.current++}`;
    const phaseKey = `phase-${clientCounter.current++}`;
    updateDraft({
      workflows: [...draft.workflows, {
        clientKey: workflowKey,
        displayName: t('teamAuthoring.defaults.workflowName'),
        triggerDescription: t('teamAuthoring.defaults.workflowTrigger'),
        phases: [
          nextPhase(
            phaseKey,
            draft.members.find(member => member.role !== 'lead')?.clientKey
              ?? draft.leadMemberKey,
            t,
          ),
        ],
      }],
    }, 'workflows');
  };

  const addPhase = (workflowKey: string) => {
    const workflow = draft.workflows.find(item => item.clientKey === workflowKey);
    if (!workflow) return;
    const phaseKey = `phase-${clientCounter.current++}`;
    updateWorkflow(workflowKey, {
      phases: [
        ...workflow.phases,
        nextPhase(phaseKey, draft.leadMemberKey, t),
      ],
    });
  };

  const removePhase = (workflowKey: string, phaseKey: string) => {
    const workflow = draft.workflows.find(item => item.clientKey === workflowKey);
    if (!workflow || workflow.phases.length <= 1) return;
    updateWorkflow(workflowKey, {
      phases: workflow.phases
        .filter(phase => phase.clientKey !== phaseKey)
        .map(phase => ({
          ...phase,
          dependsOnPhaseKeys: phase.dependsOnPhaseKeys.filter(
            dependency => dependency !== phaseKey,
          ),
        })),
    });
  };

  const handleOrganize = () => {
    const result = organizeTeamDraft({
      route,
      displayName: draft.displayName,
      sourceText,
      description: draft.description,
      category: draft.category,
      capabilityTags: draft.capabilityTags,
      scenarioEligibility: draft.scenarioEligibility,
      members: route === 'manual' ? draft.members : undefined,
      workflows: route === 'manual' ? draft.workflows : undefined,
      leadMemberKey: route === 'manual' ? draft.leadMemberKey : undefined,
      template,
    });
    setDiagnostics(result.diagnostics);
    if (!result.isValid) {
      const first = result.diagnostics[0];
      if (first) notification.error(diagnosticMessage(first));
      return;
    }
    setDraft(result.draft);
    setDraftPrepared(true);
    notification.success(t('teamAuthoring.messages.prepared'));
  };

  const handleSubmit = async () => {
    if (managementCapability.status === 'unsupported') {
      notification.error(t('teamAuthoring.runtimeUnsupported'));
      return;
    }
    if (!isEdit && route !== 'manual' && !draftPrepared) {
      notification.error(t('teamAuthoring.messages.prepareFirst'));
      return;
    }
    const result = organizeTeamDraft({
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
    });
    setDiagnostics(result.diagnostics);
    if (!result.isValid) {
      const first = result.diagnostics[0];
      if (first) notification.error(diagnosticMessage(first));
      return;
    }
    if (level === 'project' && (!workspacePath || isRemoteWorkspace)) {
      notification.error(
        isRemoteWorkspace
          ? errorMessage('unsupported_remote_project')
          : t('teamAuthoring.messages.noWorkspace'),
      );
      return;
    }
    if (isEdit && (!existingDefinition || !revision)) return;

    setSubmitting(true);
    try {
      let record: TeamDefinitionRecord;
      if (isEdit) {
        record = await gateway.update({
          teamDefinitionId: existingDefinition!.teamDefinitionId,
          level,
          expectedRevision: revision!,
          definition: draftToExistingDefinition(
            result.draft,
            existingDefinition!,
          ),
          workspacePath: level === 'project' ? workspacePath : undefined,
        });
      } else {
        record = await gateway.create({
          level,
          draft: result.draft,
          workspacePath: level === 'project' ? workspacePath : undefined,
        });
      }
      notification.success(t(
        isEdit
          ? 'teamAuthoring.messages.updateSuccess'
          : 'teamAuthoring.messages.createSuccess',
        { name: record.definition.displayName },
      ));
      requestCatalogRefresh();
      openHome();
    } catch (error) {
      const code = error instanceof TeamAuthoringError
        ? error.code
        : 'write_failed';
      const recoveryPath = error instanceof TeamAuthoringError
        ? error.recoveryPath
        : undefined;
      notification.error(
        recoveryPath
          ? t('teamAuthoring.messages.failedWithRecovery', {
            error: errorMessage(code),
            path: recoveryPath,
          })
          : errorMessage(code),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (managementCapability.status === 'unsupported') {
    return (
      <div className="team-authoring">
        <button type="button" className="team-authoring__back" onClick={openHome}>
          <ArrowLeft size={14} />
          {t('teamAuthoring.back')}
        </button>
        <div
          className="team-authoring__status"
          data-testid="team-authoring-runtime-unsupported"
        >
          <p>{t('teamAuthoring.runtimeUnsupported')}</p>
        </div>
      </div>
    );
  }

  if (loading || loadError) {
    return (
      <div className="team-authoring">
        <button type="button" className="team-authoring__back" onClick={openHome}>
          <ArrowLeft size={14} />
          {t('teamAuthoring.back')}
        </button>
        <div className={`team-authoring__status${loadError ? ' is-error' : ''}`}>
          {loadError ? errorMessage(loadError) : t('teamAuthoring.loading')}
        </div>
      </div>
    );
  }

  return (
    <div className="team-authoring">
      <button type="button" className="team-authoring__back" onClick={openHome}>
        <ArrowLeft size={14} />
        {t('teamAuthoring.back')}
      </button>
      <div className="team-authoring__scroll">
        <main className="team-authoring__inner">
          <header className="team-authoring__header">
            <div className="team-authoring__title-icon"><Users size={20} /></div>
            <div>
              <h1>{t(isEdit ? 'teamAuthoring.titleEdit' : 'teamAuthoring.titleCreate')}</h1>
              <p>{t(isEdit ? 'teamAuthoring.subtitleEdit' : 'teamAuthoring.subtitleCreate')}</p>
            </div>
          </header>

          {!isEdit ? (
            <div
              className="team-authoring__routes"
              role="tablist"
              aria-label={t('teamAuthoring.routeLabel')}
            >
              {ROUTES.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={route === id}
                  className={route === id ? 'is-active' : ''}
                  onClick={() => {
                    setRoute(id);
                    setDiagnostics([]);
                    setDraftPrepared(id === 'manual');
                  }}
                >
                  <Icon size={16} />
                  <span>{t(`teamAuthoring.routes.${id}`)}</span>
                </button>
              ))}
            </div>
          ) : null}

          <section className="team-authoring__section">
            <div className="team-authoring__section-head">
              <div>
                <h2>{t('teamAuthoring.basics.title')}</h2>
                <p>{t('teamAuthoring.basics.hint')}</p>
              </div>
            </div>
            <div className="team-authoring__grid team-authoring__grid--two">
              <label>
                <span>{t('teamAuthoring.basics.displayName')}</span>
                <Input
                  value={draft.displayName}
                  onChange={event => {
                    updateDraft({ displayName: event.target.value }, 'displayName');
                    if (route !== 'manual') setDraftPrepared(false);
                  }}
                  placeholder={t('teamAuthoring.basics.displayNamePlaceholder')}
                  inputSize="small"
                  error={Boolean(firstDiagnostic('displayName'))}
                />
              </label>
              <label>
                <span>{t('teamAuthoring.basics.category')}</span>
                <Input
                  value={draft.category}
                  onChange={event => updateDraft(
                    { category: event.target.value },
                    'category',
                  )}
                  placeholder={t('teamAuthoring.basics.categoryPlaceholder')}
                  inputSize="small"
                  error={Boolean(firstDiagnostic('category'))}
                />
              </label>
            </div>
            <label>
              <span>{t('teamAuthoring.basics.description')}</span>
              <Textarea
                value={draft.description}
                onChange={event => updateDraft(
                  { description: event.target.value },
                  'description',
                )}
                placeholder={t('teamAuthoring.basics.descriptionPlaceholder')}
                rows={3}
              />
            </label>
            {!isEdit && route !== 'manual' ? (
              <label>
                <span>{t(`teamAuthoring.source.${route}.label`)}</span>
                <Textarea
                  value={sourceText}
                  onChange={event => {
                    setSourceText(event.target.value);
                    setDraftPrepared(false);
                    clearDiagnostic('sourceText');
                  }}
                  placeholder={t(`teamAuthoring.source.${route}.placeholder`)}
                  rows={6}
                />
              </label>
            ) : null}
            <label>
              <span>{t('teamAuthoring.basics.tags')}</span>
              <Input
                value={draft.capabilityTags.join('、')}
                onChange={event => updateDraft({
                  capabilityTags: splitList(event.target.value),
                })}
                placeholder={t('teamAuthoring.basics.tagsPlaceholder')}
                inputSize="small"
              />
            </label>
            <fieldset className="team-authoring__scenarios">
              <legend>{t('teamAuthoring.basics.scenarios')}</legend>
              <div>
                {SCENARIOS.map(scenario => (
                  <button
                    key={scenario}
                    type="button"
                    aria-pressed={draft.scenarioEligibility.includes(scenario)}
                    className={
                      draft.scenarioEligibility.includes(scenario)
                        ? 'is-active'
                        : ''
                    }
                    onClick={() => toggleScenario(scenario)}
                  >
                    {t(`teamAuthoring.scenarios.${scenario}`)}
                  </button>
                ))}
              </div>
            </fieldset>
            {!isEdit ? (
              <div className="team-authoring__scope">
                <span>{t('teamAuthoring.scope.title')}</span>
                <div>
                  {(['user', 'project'] as TeamDefinitionLevel[]).map(nextLevel => (
                    <button
                      key={nextLevel}
                      type="button"
                      className={level === nextLevel ? 'is-active' : ''}
                      disabled={
                        nextLevel === 'project'
                        && (!hasWorkspace || isRemoteWorkspace)
                      }
                      onClick={() => setLevel(nextLevel)}
                    >
                      {t(`teamAuthoring.scope.${nextLevel}`)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {!isEdit && route !== 'manual' ? (
              <div className="team-authoring__organize">
                <p>{t('teamAuthoring.organizeHint')}</p>
                <Button variant="secondary" size="small" onClick={handleOrganize}>
                  {t('teamAuthoring.organize')}
                </Button>
              </div>
            ) : null}
          </section>

          <section className="team-authoring__section">
            <div className="team-authoring__section-head">
              <div>
                <h2>{t('teamAuthoring.members.title')}</h2>
                <p>{t('teamAuthoring.members.hint')}</p>
              </div>
              {!isEdit ? (
                <Button
                  variant="secondary"
                  size="small"
                  onClick={addMember}
                  disabled={draft.members.length >= 12}
                >
                  <Plus size={14} />
                  {t('teamAuthoring.members.add')}
                </Button>
              ) : null}
            </div>
            <div className="team-authoring__cards">
              {draft.members.map((member, index) => (
                <article key={member.clientKey} className="team-authoring__card">
                  <div className="team-authoring__card-head">
                    <strong>
                      {member.clientKey === draft.leadMemberKey
                        ? t('teamAuthoring.members.lead')
                        : t('teamAuthoring.members.member', { number: index + 1 })}
                    </strong>
                    <div>
                      {member.clientKey !== draft.leadMemberKey ? (
                        <Button
                          variant="ghost"
                          size="small"
                          onClick={() => chooseLead(member.clientKey)}
                        >
                          {t('teamAuthoring.members.makeLead')}
                        </Button>
                      ) : null}
                      {!isEdit
                        && member.clientKey !== draft.leadMemberKey
                        && draft.members.length > 2 ? (
                          <button
                            type="button"
                            className="team-authoring__icon-action"
                            aria-label={t('teamAuthoring.members.remove')}
                            onClick={() => removeMember(member.clientKey)}
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                    </div>
                  </div>
                  <div className="team-authoring__grid team-authoring__grid--two">
                    <label>
                      <span>{t('teamAuthoring.members.name')}</span>
                      <Input
                        value={member.displayName}
                        onChange={event => updateMember(member.clientKey, {
                          displayName: event.target.value,
                        })}
                        inputSize="small"
                      />
                    </label>
                    <label>
                      <span>{t('teamAuthoring.members.profession')}</span>
                      <Input
                        value={member.professionalRole}
                        onChange={event => updateMember(member.clientKey, {
                          professionalRole: event.target.value,
                        })}
                        inputSize="small"
                      />
                    </label>
                  </div>
                  <label>
                    <span>{t('teamAuthoring.members.agent')}</span>
                    <select
                      value={member.agentId ?? ''}
                      onChange={event => updateMember(member.clientKey, {
                        agentId: event.target.value,
                      })}
                    >
                      <option value="">{t('teamAuthoring.members.selectAgent')}</option>
                      {localizedAgentOptions.map(option => (
                        <option key={option.id} value={option.id}>
                          {option.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t('teamAuthoring.members.instructions')}</span>
                    <Textarea
                      value={member.instructions}
                      onChange={event => updateMember(member.clientKey, {
                        instructions: event.target.value,
                      })}
                      rows={4}
                    />
                  </label>
                  <label>
                    <span>{t('teamAuthoring.members.output')}</span>
                    <Input
                      value={member.outputResponsibility}
                      onChange={event => updateMember(member.clientKey, {
                        outputResponsibility: event.target.value,
                      })}
                      inputSize="small"
                    />
                  </label>
                  {member.clientKey !== draft.leadMemberKey ? (
                    <label>
                      <span>{t('teamAuthoring.members.role')}</span>
                      <select
                        value={member.role}
                        onChange={event => updateMember(member.clientKey, {
                          role: event.target.value as TeamMemberDraft['role'],
                        })}
                      >
                        <option value="specialist">
                          {t('teamAuthoring.memberRoles.specialist')}
                        </option>
                        <option value="quality_gate">
                          {t('teamAuthoring.memberRoles.quality_gate')}
                        </option>
                      </select>
                    </label>
                  ) : null}
                </article>
              ))}
            </div>
            {firstDiagnostic('members') ? (
              <p className="team-authoring__error">
                {diagnosticMessage(firstDiagnostic('members')!)}
              </p>
            ) : null}
          </section>

          <section className="team-authoring__section">
            <div className="team-authoring__section-head">
              <div>
                <h2>{t('teamAuthoring.workflows.title')}</h2>
                <p>{t('teamAuthoring.workflows.hint')}</p>
              </div>
              {!isEdit ? (
                <Button
                  variant="secondary"
                  size="small"
                  onClick={addWorkflow}
                  disabled={draft.workflows.length >= 8}
                >
                  <Plus size={14} />
                  {t('teamAuthoring.workflows.add')}
                </Button>
              ) : null}
            </div>
            <div className="team-authoring__cards">
              {draft.workflows.map((workflow, workflowIndex) => (
                <article key={workflow.clientKey} className="team-authoring__card">
                  <div className="team-authoring__card-head">
                    <strong>{t('teamAuthoring.workflows.workflow', {
                      number: workflowIndex + 1,
                    })}</strong>
                    {!isEdit && draft.workflows.length > 1 ? (
                      <button
                        type="button"
                        className="team-authoring__icon-action"
                        aria-label={t('teamAuthoring.workflows.remove')}
                        onClick={() => updateDraft({
                          workflows: draft.workflows.filter(
                            item => item.clientKey !== workflow.clientKey,
                          ),
                        }, 'workflows')}
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                  <div className="team-authoring__grid team-authoring__grid--two">
                    <label>
                      <span>{t('teamAuthoring.workflows.name')}</span>
                      <Input
                        value={workflow.displayName}
                        onChange={event => updateWorkflow(workflow.clientKey, {
                          displayName: event.target.value,
                        })}
                        inputSize="small"
                      />
                    </label>
                    <label>
                      <span>{t('teamAuthoring.workflows.trigger')}</span>
                      <Input
                        value={workflow.triggerDescription}
                        onChange={event => updateWorkflow(workflow.clientKey, {
                          triggerDescription: event.target.value,
                        })}
                        inputSize="small"
                      />
                    </label>
                  </div>
                  <div className="team-authoring__phase-list">
                    {workflow.phases.map((phase, phaseIndex) => (
                      <div key={phase.clientKey} className="team-authoring__phase">
                        <div className="team-authoring__card-head">
                          <strong>{t('teamAuthoring.workflows.phase', {
                            number: phaseIndex + 1,
                          })}</strong>
                          {!isEdit && workflow.phases.length > 1 ? (
                            <button
                              type="button"
                              className="team-authoring__icon-action"
                              aria-label={t('teamAuthoring.workflows.removePhase')}
                              onClick={() => removePhase(
                                workflow.clientKey,
                                phase.clientKey,
                              )}
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                        <div className="team-authoring__grid team-authoring__grid--two">
                          <label>
                            <span>{t('teamAuthoring.workflows.phaseName')}</span>
                            <Input
                              value={phase.displayName}
                              onChange={event => updatePhase(
                                workflow.clientKey,
                                phase.clientKey,
                                { displayName: event.target.value },
                              )}
                              inputSize="small"
                            />
                          </label>
                          <label>
                            <span>{t('teamAuthoring.workflows.phaseKind')}</span>
                            <select
                              value={phase.kind}
                              onChange={event => updatePhase(
                                workflow.clientKey,
                                phase.clientKey,
                                {
                                  kind: event.target.value as
                                    TeamWorkflowPhaseKind,
                                },
                              )}
                            >
                              {PHASE_KINDS.map(kind => (
                                <option key={kind} value={kind}>
                                  {t(`teamAuthoring.phaseKinds.${kind}`)}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <fieldset className="team-authoring__choices">
                          <legend>{t('teamAuthoring.workflows.assignees')}</legend>
                          <div>
                            {draft.members.map(member => {
                              const selected = phase.assignedMemberKeys
                                .includes(member.clientKey);
                              return (
                                <button
                                  key={member.clientKey}
                                  type="button"
                                  aria-pressed={selected}
                                  className={selected ? 'is-active' : ''}
                                  onClick={() => updatePhase(
                                    workflow.clientKey,
                                    phase.clientKey,
                                    {
                                      assignedMemberKeys: selected
                                        ? phase.assignedMemberKeys.filter(
                                          key => key !== member.clientKey,
                                        )
                                        : [
                                          ...phase.assignedMemberKeys,
                                          member.clientKey,
                                        ],
                                    },
                                  )}
                                >
                                  {member.displayName}
                                </button>
                              );
                            })}
                          </div>
                        </fieldset>
                        {workflow.phases.length > 1 ? (
                          <fieldset className="team-authoring__choices">
                            <legend>{t('teamAuthoring.workflows.dependencies')}</legend>
                            <div>
                              {workflow.phases
                                .filter(item => item.clientKey !== phase.clientKey)
                                .map(item => {
                                  const selected = phase.dependsOnPhaseKeys
                                    .includes(item.clientKey);
                                  return (
                                    <button
                                      key={item.clientKey}
                                      type="button"
                                      aria-pressed={selected}
                                      className={selected ? 'is-active' : ''}
                                      onClick={() => updatePhase(
                                        workflow.clientKey,
                                        phase.clientKey,
                                        {
                                          dependsOnPhaseKeys: selected
                                            ? phase.dependsOnPhaseKeys.filter(
                                              key => key !== item.clientKey,
                                            )
                                            : [
                                              ...phase.dependsOnPhaseKeys,
                                              item.clientKey,
                                            ],
                                        },
                                      )}
                                    >
                                      {item.displayName}
                                    </button>
                                  );
                                })}
                            </div>
                          </fieldset>
                        ) : null}
                        <div className="team-authoring__grid team-authoring__grid--two">
                          <label>
                            <span>{t('teamAuthoring.workflows.outputs')}</span>
                            <Input
                              value={phase.expectedOutputs.join('、')}
                              onChange={event => updatePhase(
                                workflow.clientKey,
                                phase.clientKey,
                                { expectedOutputs: splitList(event.target.value) },
                              )}
                              inputSize="small"
                            />
                          </label>
                          <label>
                            <span>{t('teamAuthoring.workflows.completion')}</span>
                            <Input
                              value={phase.completionRule}
                              onChange={event => updatePhase(
                                workflow.clientKey,
                                phase.clientKey,
                                { completionRule: event.target.value },
                              )}
                              inputSize="small"
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                    {!isEdit ? (
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => addPhase(workflow.clientKey)}
                        disabled={workflow.phases.length >= 20}
                      >
                        <Plus size={14} />
                        {t('teamAuthoring.workflows.addPhase')}
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
            {firstDiagnostic('workflows') ? (
              <p className="team-authoring__error">
                {diagnosticMessage(firstDiagnostic('workflows')!)}
              </p>
            ) : null}
          </section>

          <aside className="team-authoring__policy">
            <strong>{t('teamAuthoring.policy.title')}</strong>
            <p>{t('teamAuthoring.policy.description')}</p>
          </aside>

          <aside className="team-authoring__preview">
            <span>{t('teamAuthoring.preview.title')}</span>
            <strong>
              {draft.displayName || t('teamAuthoring.preview.unnamed')}
            </strong>
            <p>{draft.description || t('teamAuthoring.preview.empty')}</p>
            <div>
              {t('teamAuthoring.preview.summary', {
                members: draft.members.length,
                workflows: draft.workflows.length,
              })}
            </div>
            {isEdit ? (
              <small>{t('teamAuthoring.preview.editStructureLocked')}</small>
            ) : null}
          </aside>

          <div className="team-authoring__actions">
            <Button
              variant="secondary"
              size="small"
              onClick={openHome}
              disabled={submitting}
            >
              {t('teamAuthoring.actions.cancel')}
            </Button>
            <Button
              variant="primary"
              size="small"
              onClick={() => void handleSubmit()}
              disabled={submitting}
            >
              {submitting
                ? '…'
                : t(isEdit
                  ? 'teamAuthoring.actions.save'
                  : 'teamAuthoring.actions.create')}
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
};

export default TeamAuthoringPage;
