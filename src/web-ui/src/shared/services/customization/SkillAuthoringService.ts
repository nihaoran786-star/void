import {
  AGENT_SCENARIO_PARENT_IDS,
  type AgentScenarioId,
} from './AgentAuthoringService';

export type SkillAuthoringRoute = 'describe' | 'material' | 'manual';
export type SkillScenarioId = AgentScenarioId;
export type SkillAuthoringField =
  | 'displayName'
  | 'sourceText'
  | 'description'
  | 'instructions'
  | 'scenarios'
  | 'suggestedPrompts';

export type SkillAuthoringDiagnosticCode =
  | 'display_name_required'
  | 'source_text_required'
  | 'description_required'
  | 'instructions_required'
  | 'scenario_required'
  | 'suggested_prompt_required'
  | 'too_many_suggested_prompts';

export interface SkillAuthoringDiagnostic {
  code: SkillAuthoringDiagnosticCode;
  field: SkillAuthoringField;
  severity: 'error';
}

export interface SkillAuthoringTemplate {
  describeDescriptionPrefix: string;
  describeRole: string;
  describeRulesHeading: string;
  describeRules: [string, string, string];
  materialDescriptionPrefix: string;
  materialRole: string;
  materialRulesHeading: string;
  materialRules: [string, string, string];
  materialHeading: string;
  suggestedPrompts: [string, string, string];
}

export interface SkillAuthoringInput {
  route: SkillAuthoringRoute;
  displayName: string;
  sourceText?: string;
  description?: string;
  instructions?: string;
  scenarios: SkillScenarioId[];
  suggestedPrompts?: string[];
  template?: Partial<SkillAuthoringTemplate>;
}

export interface CanonicalSkillDraft {
  displayName: string;
  description: string;
  instructions: string;
  scenarios: SkillScenarioId[];
  allowedParentAgentIds: string[];
  suggestedPrompts: string[];
  permissionPolicy: 'inherit_parent_intersection';
  authoringSource: 'deterministic_local';
}

export interface SkillAuthoringResult {
  draft: CanonicalSkillDraft;
  diagnostics: SkillAuthoringDiagnostic[];
  isValid: boolean;
}

const ORDERED_SCENARIOS: SkillScenarioId[] = ['code', 'cowork', 'media'];
const MAX_SUGGESTED_PROMPTS = 3;
const DEFAULT_TEMPLATE: SkillAuthoringTemplate = {
  describeDescriptionPrefix: 'Reusable workflow:',
  describeRole: 'Use this skill when the task matches "__NAME__".',
  describeRulesHeading: 'Working rules:',
  describeRules: [
    '1. Confirm the goal, inputs, and expected output before acting.',
    '2. Follow the described workflow and surface missing information.',
    '3. Return actionable output without claiming unperformed operations.',
  ],
  materialDescriptionPrefix: 'Reusable workflow from supplied material:',
  materialRole: 'Use this skill as "__NAME__" and treat the supplied material as authoritative.',
  materialRulesHeading: 'Working rules:',
  materialRules: [
    '1. Preserve roles, sequence, constraints, and output requirements from the material.',
    '2. Identify conflicts or missing information before execution.',
    '3. Never expand tool or write permissions beyond the active parent session.',
  ],
  materialHeading: 'Supplied material:',
  suggestedPrompts: [
    'Use __NAME__ to handle this task.',
    'Check my material and give me the next steps.',
    'Return a directly usable result with the required format.',
  ],
};

function resolveTemplate(template?: Partial<SkillAuthoringTemplate>): SkillAuthoringTemplate {
  return {
    ...DEFAULT_TEMPLATE,
    ...template,
    describeRules: template?.describeRules ?? DEFAULT_TEMPLATE.describeRules,
    materialRules: template?.materialRules ?? DEFAULT_TEMPLATE.materialRules,
    suggestedPrompts: template?.suggestedPrompts ?? DEFAULT_TEMPLATE.suggestedPrompts,
  };
}

function interpolateName(value: string, displayName: string): string {
  return value.split('__NAME__').join(displayName);
}

function normalizeScenarios(scenarios: SkillScenarioId[]): SkillScenarioId[] {
  const selected = new Set(scenarios);
  return ORDERED_SCENARIOS.filter((scenario) => selected.has(scenario));
}

function normalizePrompts(prompts: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const prompt of prompts) {
    const trimmed = prompt.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      normalized.push(trimmed);
    }
  }
  return normalized;
}

function summarizeSource(sourceText: string): string {
  const compact = sourceText.replace(/\s+/g, ' ').trim();
  return compact.length <= 72 ? compact : `${compact.slice(0, 72)}…`;
}

function buildGeneratedDraft(
  route: Exclude<SkillAuthoringRoute, 'manual'>,
  displayName: string,
  sourceText: string,
  template: SkillAuthoringTemplate,
): Pick<CanonicalSkillDraft, 'description' | 'instructions' | 'suggestedPrompts'> {
  const source = sourceText.trim();
  const isMaterial = route === 'material';
  const description = source
    ? `${isMaterial
      ? template.materialDescriptionPrefix
      : template.describeDescriptionPrefix} ${summarizeSource(source)}`
    : '';
  const instructions = source
    ? [
      interpolateName(
        isMaterial ? template.materialRole : template.describeRole,
        displayName,
      ),
      '',
      isMaterial ? template.materialRulesHeading : template.describeRulesHeading,
      ...(isMaterial ? template.materialRules : template.describeRules),
      '',
      ...(isMaterial ? [template.materialHeading, source] : [source]),
    ].join('\n')
    : '';
  const suggestedPrompts = source
    ? template.suggestedPrompts.map((prompt) => interpolateName(prompt, displayName))
    : [];
  return { description, instructions, suggestedPrompts };
}

export function organizeSkillDraft(input: SkillAuthoringInput): SkillAuthoringResult {
  const displayName = input.displayName.trim();
  const sourceText = input.sourceText?.trim() ?? '';
  const scenarios = normalizeScenarios(input.scenarios);
  const template = resolveTemplate(input.template);

  let description = input.description?.trim() ?? '';
  let instructions = input.instructions?.trim() ?? '';
  let suggestedPrompts = normalizePrompts(input.suggestedPrompts ?? []);
  if (input.route !== 'manual') {
    ({ description, instructions, suggestedPrompts } = buildGeneratedDraft(
      input.route,
      displayName,
      sourceText,
      template,
    ));
  }

  const diagnostics: SkillAuthoringDiagnostic[] = [];
  if (!displayName) {
    diagnostics.push({ code: 'display_name_required', field: 'displayName', severity: 'error' });
  }
  if (input.route !== 'manual' && !sourceText) {
    diagnostics.push({ code: 'source_text_required', field: 'sourceText', severity: 'error' });
  }
  if (!description) {
    diagnostics.push({ code: 'description_required', field: 'description', severity: 'error' });
  }
  if (!instructions) {
    diagnostics.push({ code: 'instructions_required', field: 'instructions', severity: 'error' });
  }
  if (scenarios.length === 0) {
    diagnostics.push({ code: 'scenario_required', field: 'scenarios', severity: 'error' });
  }
  if (suggestedPrompts.length === 0) {
    diagnostics.push({
      code: 'suggested_prompt_required',
      field: 'suggestedPrompts',
      severity: 'error',
    });
  } else if (suggestedPrompts.length > MAX_SUGGESTED_PROMPTS) {
    diagnostics.push({
      code: 'too_many_suggested_prompts',
      field: 'suggestedPrompts',
      severity: 'error',
    });
  }

  const allowedParentAgentIds = Array.from(
    new Set(scenarios.flatMap((scenario) => AGENT_SCENARIO_PARENT_IDS[scenario])),
  ).sort();

  return {
    draft: {
      displayName,
      description,
      instructions,
      scenarios,
      allowedParentAgentIds,
      suggestedPrompts,
      permissionPolicy: 'inherit_parent_intersection',
      authoringSource: 'deterministic_local',
    },
    diagnostics,
    isValid: diagnostics.length === 0,
  };
}

export function skillScenariosFromAllowedParentAgentIds(
  allowedParentAgentIds: readonly string[],
): SkillScenarioId[] {
  if (allowedParentAgentIds.length === 0) {
    return [...ORDERED_SCENARIOS];
  }
  const allowed = new Set(allowedParentAgentIds);
  return ORDERED_SCENARIOS.filter((scenario) =>
    AGENT_SCENARIO_PARENT_IDS[scenario].some((parentId) => allowed.has(parentId)),
  );
}
