import type {
  TeamDefinitionDraft,
  TeamDefinitionScenario,
  TeamMemberDraft,
  TeamWorkflowDraft,
  TeamWorkflowPhaseDraft,
  TeamWorkflowPhaseKind,
} from '@/infrastructure/config/types';

export type TeamAuthoringRoute = 'describe' | 'material' | 'manual';
export type TeamAuthoringField =
  | 'displayName'
  | 'sourceText'
  | 'description'
  | 'category'
  | 'scenarioEligibility'
  | 'leadMemberKey'
  | 'members'
  | 'workflows';

export type TeamAuthoringDiagnosticCode =
  | 'display_name_required'
  | 'source_text_required'
  | 'description_required'
  | 'category_required'
  | 'scenario_required'
  | 'member_count_out_of_range'
  | 'member_key_required'
  | 'duplicate_member_key'
  | 'member_display_name_required'
  | 'member_professional_role_required'
  | 'member_instructions_required'
  | 'member_output_required'
  | 'member_agent_reference_required'
  | 'lead_member_required'
  | 'lead_member_not_found'
  | 'lead_member_must_have_lead_role'
  | 'lead_member_must_appear_once'
  | 'workflow_count_out_of_range'
  | 'workflow_key_required'
  | 'duplicate_workflow_key'
  | 'workflow_display_name_required'
  | 'workflow_trigger_required'
  | 'phase_count_out_of_range'
  | 'phase_key_required'
  | 'duplicate_phase_key'
  | 'phase_display_name_required'
  | 'invalid_phase_kind'
  | 'phase_member_required'
  | 'phase_member_not_found'
  | 'phase_dependency_not_found'
  | 'phase_self_dependency'
  | 'workflow_cycle'
  | 'phase_output_required'
  | 'phase_completion_rule_required';

export interface TeamAuthoringDiagnostic {
  code: TeamAuthoringDiagnosticCode;
  field: TeamAuthoringField;
  path: string;
  severity: 'error';
}

export interface TeamAuthoringTemplate {
  defaultCategory: string;
  describeDescriptionPrefix: string;
  materialDescriptionPrefix: string;
  leadDisplayName: string;
  leadProfessionalRole: string;
  specialistDisplayName: string;
  specialistProfessionalRole: string;
  describeLeadInstructions: string;
  materialLeadInstructions: string;
  leadOutputResponsibility: string;
  describeSpecialistInstructions: string;
  materialSpecialistInstructions: string;
  specialistOutputResponsibility: string;
  workflowDisplayName: string;
  describeWorkflowTrigger: string;
  materialWorkflowTrigger: string;
  specialistPhaseDisplayName: string;
  specialistExpectedOutput: string;
  specialistCompletionRule: string;
  leadPhaseDisplayName: string;
  leadExpectedOutput: string;
  leadCompletionRule: string;
}

export interface TeamAuthoringInput {
  route: TeamAuthoringRoute;
  displayName: string;
  sourceText?: string;
  description?: string;
  emblem?: string;
  accent?: string;
  category?: string;
  capabilityTags?: string[];
  scenarioEligibility: TeamDefinitionScenario[];
  leadMemberKey?: string;
  members?: TeamMemberDraft[];
  workflows?: TeamWorkflowDraft[];
  template?: Partial<TeamAuthoringTemplate>;
}

export interface TeamAuthoringResult {
  draft: TeamDefinitionDraft;
  diagnostics: TeamAuthoringDiagnostic[];
  isValid: boolean;
}

export type TeamDescriptionAuthoringInput = Omit<TeamAuthoringInput, 'route'>;
export type TeamMaterialAuthoringInput = Omit<TeamAuthoringInput, 'route'>;
export type TeamManualAuthoringInput = Omit<TeamAuthoringInput, 'route'>;

const ORDERED_SCENARIOS: TeamDefinitionScenario[] = ['code', 'cowork', 'media'];
const VALID_PHASE_KINDS = new Set<TeamWorkflowPhaseKind>([
  'serial',
  'parallel',
  'decision',
  'review',
]);
const MIN_MEMBERS = 2;
const MAX_MEMBERS = 12;
const MAX_WORKFLOWS = 8;
const MAX_PHASES_PER_WORKFLOW = 20;

const DEFAULT_TEMPLATE: TeamAuthoringTemplate = {
  defaultCategory: 'General team',
  describeDescriptionPrefix: 'Collaboration team created from the goal: ',
  materialDescriptionPrefix: 'Collaboration team created from the material: ',
  leadDisplayName: 'Team lead',
  leadProfessionalRole: 'Coordination and delivery lead',
  specialistDisplayName: 'Domain specialist',
  specialistProfessionalRole: 'Professional execution and analysis',
  describeLeadInstructions:
    'Break down the described goal, coordinate members, and consolidate the result.',
  materialLeadInstructions:
    'Treat the supplied material as authoritative, coordinate members, and consolidate the result.',
  leadOutputResponsibility:
    'Verify phase dependencies, integrate member conclusions, and deliver the final result.',
  describeSpecialistInstructions:
    'Independently complete the professional analysis and execution required by the described goal.',
  materialSpecialistInstructions:
    'Independently complete the assigned professional work using the supplied material.',
  specialistOutputResponsibility:
    'Submit professional output that the lead can verify and consolidate.',
  workflowDisplayName: 'Standard collaboration workflow',
  describeWorkflowTrigger: 'Use when the task matches the described team goal.',
  materialWorkflowTrigger: 'Use when the task must follow the supplied material.',
  specialistPhaseDisplayName: 'Professional execution',
  specialistExpectedOutput: 'Professional execution result',
  specialistCompletionRule:
    'The specialist submits a complete and verifiable professional result.',
  leadPhaseDisplayName: 'Lead review and consolidation',
  leadExpectedOutput: 'Final team result',
  leadCompletionRule:
    'The lead confirms dependent phases are complete and delivers the final result.',
};

function resolveTemplate(
  template?: Partial<TeamAuthoringTemplate>,
): TeamAuthoringTemplate {
  return { ...DEFAULT_TEMPLATE, ...template };
}

function normalizeOptional(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeStrings(values: readonly string[] = []): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function normalizeScenarios(
  scenarios: readonly TeamDefinitionScenario[],
): TeamDefinitionScenario[] {
  const selected = new Set(scenarios);
  return ORDERED_SCENARIOS.filter(scenario => selected.has(scenario));
}

function summarizeSource(sourceText: string): string {
  const compact = sourceText.replace(/\s+/g, ' ').trim();
  return compact.length <= 120 ? compact : `${compact.slice(0, 120)}…`;
}

function defaultAgentId(
  scenarios: readonly TeamDefinitionScenario[],
): string {
  if (scenarios.includes('code')) return 'agentic';
  if (scenarios.includes('cowork')) return 'Cowork';
  if (scenarios.includes('media')) return 'Media';
  return 'agentic';
}

function generatedMembers(
  route: Exclude<TeamAuthoringRoute, 'manual'>,
  sourceText: string,
  scenarios: readonly TeamDefinitionScenario[],
  template: TeamAuthoringTemplate,
): TeamMemberDraft[] {
  const sourceSection = sourceText ? `\n\n${sourceText}` : '';
  return [
    {
      clientKey: 'lead',
      displayName: template.leadDisplayName,
      professionalRole: template.leadProfessionalRole,
      role: 'lead',
      instructions: `${
        route === 'material'
          ? template.materialLeadInstructions
          : template.describeLeadInstructions
      }${sourceSection}`,
      outputResponsibility: template.leadOutputResponsibility,
      agentId: defaultAgentId(scenarios),
      allowedSkillKeys: [],
      allowedToolNames: [],
      isReadonly: false,
    },
    {
      clientKey: 'specialist',
      displayName: template.specialistDisplayName,
      professionalRole: template.specialistProfessionalRole,
      role: 'specialist',
      instructions: `${
        route === 'material'
          ? template.materialSpecialistInstructions
          : template.describeSpecialistInstructions
      }${sourceSection}`,
      outputResponsibility: template.specialistOutputResponsibility,
      agentId: defaultAgentId(scenarios),
      allowedSkillKeys: [],
      allowedToolNames: [],
      isReadonly: false,
    },
  ];
}

function generatedWorkflow(
  route: Exclude<TeamAuthoringRoute, 'manual'>,
  template: TeamAuthoringTemplate,
): TeamWorkflowDraft {
  return {
    clientKey: 'default-workflow',
    displayName: template.workflowDisplayName,
    triggerDescription: route === 'material'
      ? template.materialWorkflowTrigger
      : template.describeWorkflowTrigger,
    phases: [
      {
        clientKey: 'specialist-work',
        displayName: template.specialistPhaseDisplayName,
        kind: 'serial',
        dependsOnPhaseKeys: [],
        assignedMemberKeys: ['specialist'],
        expectedOutputs: [template.specialistExpectedOutput],
        completionRule: template.specialistCompletionRule,
      },
      {
        clientKey: 'lead-review',
        displayName: template.leadPhaseDisplayName,
        kind: 'review',
        dependsOnPhaseKeys: ['specialist-work'],
        assignedMemberKeys: ['lead'],
        expectedOutputs: [template.leadExpectedOutput],
        completionRule: template.leadCompletionRule,
      },
    ],
  };
}

function normalizeMember(member: TeamMemberDraft): TeamMemberDraft {
  return {
    clientKey: member.clientKey.trim(),
    displayName: member.displayName.trim(),
    professionalRole: member.professionalRole.trim(),
    role: member.role,
    instructions: member.instructions.trim(),
    outputResponsibility: member.outputResponsibility.trim(),
    agentId: normalizeOptional(member.agentId),
    allowedSkillKeys: normalizeStrings(member.allowedSkillKeys),
    allowedToolNames: normalizeStrings(member.allowedToolNames),
    isReadonly: member.isReadonly,
  };
}

function normalizePhase(phase: TeamWorkflowPhaseDraft): TeamWorkflowPhaseDraft {
  return {
    clientKey: phase.clientKey.trim(),
    displayName: phase.displayName.trim(),
    kind: phase.kind,
    dependsOnPhaseKeys: normalizeStrings(phase.dependsOnPhaseKeys),
    assignedMemberKeys: normalizeStrings(phase.assignedMemberKeys),
    expectedOutputs: normalizeStrings(phase.expectedOutputs),
    completionRule: phase.completionRule.trim(),
  };
}

function normalizeWorkflow(workflow: TeamWorkflowDraft): TeamWorkflowDraft {
  return {
    clientKey: workflow.clientKey.trim(),
    displayName: workflow.displayName.trim(),
    triggerDescription: workflow.triggerDescription.trim(),
    phases: workflow.phases.map(normalizePhase),
  };
}

function addDiagnostic(
  diagnostics: TeamAuthoringDiagnostic[],
  code: TeamAuthoringDiagnosticCode,
  field: TeamAuthoringField,
  path: string,
): void {
  diagnostics.push({ code, field, path, severity: 'error' });
}

function validateMembers(
  members: readonly TeamMemberDraft[],
  leadMemberKey: string,
  diagnostics: TeamAuthoringDiagnostic[],
): void {
  if (members.length < MIN_MEMBERS || members.length > MAX_MEMBERS) {
    addDiagnostic(
      diagnostics,
      'member_count_out_of_range',
      'members',
      'members',
    );
  }

  const memberKeys = new Set<string>();
  for (const [index, member] of members.entries()) {
    const path = `members[${index}]`;
    if (!member.clientKey) {
      addDiagnostic(diagnostics, 'member_key_required', 'members', `${path}.clientKey`);
    } else if (memberKeys.has(member.clientKey)) {
      addDiagnostic(diagnostics, 'duplicate_member_key', 'members', `${path}.clientKey`);
    } else {
      memberKeys.add(member.clientKey);
    }
    if (!member.displayName) {
      addDiagnostic(
        diagnostics,
        'member_display_name_required',
        'members',
        `${path}.displayName`,
      );
    }
    if (!member.professionalRole) {
      addDiagnostic(
        diagnostics,
        'member_professional_role_required',
        'members',
        `${path}.professionalRole`,
      );
    }
    if (!member.instructions) {
      addDiagnostic(
        diagnostics,
        'member_instructions_required',
        'members',
        `${path}.instructions`,
      );
    }
    if (!member.outputResponsibility) {
      addDiagnostic(
        diagnostics,
        'member_output_required',
        'members',
        `${path}.outputResponsibility`,
      );
    }
    if (!member.agentId) {
      addDiagnostic(
        diagnostics,
        'member_agent_reference_required',
        'members',
        `${path}.agentId`,
      );
    }
  }

  if (!leadMemberKey) {
    addDiagnostic(
      diagnostics,
      'lead_member_required',
      'leadMemberKey',
      'leadMemberKey',
    );
    return;
  }
  const leadMatches = members.filter(member => member.clientKey === leadMemberKey);
  if (leadMatches.length === 0) {
    addDiagnostic(
      diagnostics,
      'lead_member_not_found',
      'leadMemberKey',
      'leadMemberKey',
    );
  } else if (leadMatches.length > 1) {
    addDiagnostic(
      diagnostics,
      'lead_member_must_appear_once',
      'leadMemberKey',
      'leadMemberKey',
    );
  } else if (leadMatches[0]?.role !== 'lead') {
    addDiagnostic(
      diagnostics,
      'lead_member_must_have_lead_role',
      'leadMemberKey',
      'leadMemberKey',
    );
  }
  if (members.filter(member => member.role === 'lead').length !== 1) {
    addDiagnostic(
      diagnostics,
      'lead_member_must_appear_once',
      'members',
      'members',
    );
  }
}

function workflowHasCycle(phases: readonly TeamWorkflowPhaseDraft[]): boolean {
  const phasesByKey = new Map(phases.map(phase => [phase.clientKey, phase]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (phaseKey: string): boolean => {
    if (visiting.has(phaseKey)) return true;
    if (visited.has(phaseKey)) return false;
    const phase = phasesByKey.get(phaseKey);
    if (!phase) return false;
    visiting.add(phaseKey);
    for (const dependency of phase.dependsOnPhaseKeys) {
      if (visit(dependency)) return true;
    }
    visiting.delete(phaseKey);
    visited.add(phaseKey);
    return false;
  };
  return phases.some(phase => visit(phase.clientKey));
}

function validateWorkflows(
  workflows: readonly TeamWorkflowDraft[],
  members: readonly TeamMemberDraft[],
  diagnostics: TeamAuthoringDiagnostic[],
): void {
  if (workflows.length === 0 || workflows.length > MAX_WORKFLOWS) {
    addDiagnostic(
      diagnostics,
      'workflow_count_out_of_range',
      'workflows',
      'workflows',
    );
  }
  const workflowKeys = new Set<string>();
  const memberKeys = new Set(members.map(member => member.clientKey));
  for (const [workflowIndex, workflow] of workflows.entries()) {
    const workflowPath = `workflows[${workflowIndex}]`;
    if (!workflow.clientKey) {
      addDiagnostic(
        diagnostics,
        'workflow_key_required',
        'workflows',
        `${workflowPath}.clientKey`,
      );
    } else if (workflowKeys.has(workflow.clientKey)) {
      addDiagnostic(
        diagnostics,
        'duplicate_workflow_key',
        'workflows',
        `${workflowPath}.clientKey`,
      );
    } else {
      workflowKeys.add(workflow.clientKey);
    }
    if (!workflow.displayName) {
      addDiagnostic(
        diagnostics,
        'workflow_display_name_required',
        'workflows',
        `${workflowPath}.displayName`,
      );
    }
    if (!workflow.triggerDescription) {
      addDiagnostic(
        diagnostics,
        'workflow_trigger_required',
        'workflows',
        `${workflowPath}.triggerDescription`,
      );
    }
    if (
      workflow.phases.length === 0
      || workflow.phases.length > MAX_PHASES_PER_WORKFLOW
    ) {
      addDiagnostic(
        diagnostics,
        'phase_count_out_of_range',
        'workflows',
        `${workflowPath}.phases`,
      );
    }

    const phaseKeys = new Set<string>();
    for (const [phaseIndex, phase] of workflow.phases.entries()) {
      const phasePath = `${workflowPath}.phases[${phaseIndex}]`;
      if (!phase.clientKey) {
        addDiagnostic(
          diagnostics,
          'phase_key_required',
          'workflows',
          `${phasePath}.clientKey`,
        );
      } else if (phaseKeys.has(phase.clientKey)) {
        addDiagnostic(
          diagnostics,
          'duplicate_phase_key',
          'workflows',
          `${phasePath}.clientKey`,
        );
      } else {
        phaseKeys.add(phase.clientKey);
      }
      if (!phase.displayName) {
        addDiagnostic(
          diagnostics,
          'phase_display_name_required',
          'workflows',
          `${phasePath}.displayName`,
        );
      }
      if (!VALID_PHASE_KINDS.has(phase.kind)) {
        addDiagnostic(
          diagnostics,
          'invalid_phase_kind',
          'workflows',
          `${phasePath}.kind`,
        );
      }
      if (phase.assignedMemberKeys.length === 0) {
        addDiagnostic(
          diagnostics,
          'phase_member_required',
          'workflows',
          `${phasePath}.assignedMemberKeys`,
        );
      }
      for (const memberKey of phase.assignedMemberKeys) {
        if (!memberKeys.has(memberKey)) {
          addDiagnostic(
            diagnostics,
            'phase_member_not_found',
            'workflows',
            `${phasePath}.assignedMemberKeys`,
          );
        }
      }
      if (phase.expectedOutputs.length === 0) {
        addDiagnostic(
          diagnostics,
          'phase_output_required',
          'workflows',
          `${phasePath}.expectedOutputs`,
        );
      }
      if (!phase.completionRule) {
        addDiagnostic(
          diagnostics,
          'phase_completion_rule_required',
          'workflows',
          `${phasePath}.completionRule`,
        );
      }
    }

    for (const [phaseIndex, phase] of workflow.phases.entries()) {
      const phasePath = `${workflowPath}.phases[${phaseIndex}]`;
      for (const dependency of phase.dependsOnPhaseKeys) {
        if (dependency === phase.clientKey) {
          addDiagnostic(
            diagnostics,
            'phase_self_dependency',
            'workflows',
            `${phasePath}.dependsOnPhaseKeys`,
          );
        } else if (!phaseKeys.has(dependency)) {
          addDiagnostic(
            diagnostics,
            'phase_dependency_not_found',
            'workflows',
            `${phasePath}.dependsOnPhaseKeys`,
          );
        }
      }
    }
    if (workflowHasCycle(workflow.phases)) {
      addDiagnostic(
        diagnostics,
        'workflow_cycle',
        'workflows',
        `${workflowPath}.phases`,
      );
    }
  }
}

export function organizeTeamDraft(
  input: TeamAuthoringInput,
): TeamAuthoringResult {
  const displayName = input.displayName.trim();
  const sourceText = input.sourceText?.trim() ?? '';
  const scenarios = normalizeScenarios(input.scenarioEligibility);
  const template = resolveTemplate(input.template);
  const generatedRoute = input.route === 'describe' || input.route === 'material'
    ? input.route
    : null;

  const members = generatedRoute && (input.members?.length ?? 0) === 0
    ? generatedMembers(generatedRoute, sourceText, scenarios, template)
    : (input.members ?? []).map(normalizeMember);
  const inferredLead = members.find(member => member.role === 'lead')?.clientKey ?? '';
  const leadMemberKey = input.leadMemberKey?.trim()
    || (generatedRoute ? 'lead' : inferredLead);
  const workflows = generatedRoute && (input.workflows?.length ?? 0) === 0
    ? [generatedWorkflow(generatedRoute, template)]
    : (input.workflows ?? []).map(normalizeWorkflow);
  const description = input.description?.trim()
    || (sourceText && generatedRoute
      ? `${generatedRoute === 'material'
        ? template.materialDescriptionPrefix
        : template.describeDescriptionPrefix}${summarizeSource(sourceText)}`
      : '');

  const draft: TeamDefinitionDraft = {
    displayName,
    description,
    emblem: normalizeOptional(input.emblem),
    accent: normalizeOptional(input.accent),
    category: input.category?.trim()
      || (generatedRoute ? template.defaultCategory : ''),
    capabilityTags: normalizeStrings(input.capabilityTags),
    scenarioEligibility: scenarios,
    leadMemberKey,
    members,
    workflows,
  };

  const diagnostics: TeamAuthoringDiagnostic[] = [];
  if (!displayName) {
    addDiagnostic(diagnostics, 'display_name_required', 'displayName', 'displayName');
  }
  if (generatedRoute && !sourceText) {
    addDiagnostic(diagnostics, 'source_text_required', 'sourceText', 'sourceText');
  }
  if (!description) {
    addDiagnostic(diagnostics, 'description_required', 'description', 'description');
  }
  if (!draft.category) {
    addDiagnostic(diagnostics, 'category_required', 'category', 'category');
  }
  if (scenarios.length === 0) {
    addDiagnostic(
      diagnostics,
      'scenario_required',
      'scenarioEligibility',
      'scenarioEligibility',
    );
  }
  validateMembers(members, leadMemberKey, diagnostics);
  validateWorkflows(workflows, members, diagnostics);

  return {
    draft,
    diagnostics,
    isValid: diagnostics.length === 0,
  };
}

export function createTeamDraftFromDescription(
  input: TeamDescriptionAuthoringInput,
): TeamAuthoringResult {
  return organizeTeamDraft({ ...input, route: 'describe' });
}

export function createTeamDraftFromMaterial(
  input: TeamMaterialAuthoringInput,
): TeamAuthoringResult {
  return organizeTeamDraft({ ...input, route: 'material' });
}

export function createManualTeamDraft(
  input: TeamManualAuthoringInput,
): TeamAuthoringResult {
  return organizeTeamDraft({ ...input, route: 'manual' });
}
