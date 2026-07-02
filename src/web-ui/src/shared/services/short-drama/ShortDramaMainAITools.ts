import {
  listShortDramaMediaArtifacts,
  locateShortDramaArtifact,
  readShortDramaScriptSegment,
  readShortDramaArtifact,
  resolveShortDramaArtifactReference,
  searchShortDramaIndex,
  searchShortDramaArtifacts,
  searchShortDramaScriptSegments,
  validateShortDramaDerivedIndexIntegrity,
} from './ShortDramaArtifactIndex';
import {
  createShortDramaArtifactChangeExplanation,
  createShortDramaProjectAuditLog,
  type ShortDramaProjectAuditLogQuery,
} from './ShortDramaAuditLog';
import { optimizeShortDramaFocusedArtifact } from './ShortDramaArtifactOptimizationWorkflow';
import {
  applyShortDramaChatIntakeRoute,
  routeShortDramaChatIntake,
} from './ShortDramaChatIntake';
import {
  createShortDramaAssetUsageGraph,
  previewShortDramaArtifactPromptImpact,
  updateShortDramaArtifactPrompt,
} from './ShortDramaArtifactRevisionWorkflow';
import {
  createShortDramaChangeRequest,
  listShortDramaChangeRequests,
  resolveShortDramaChangeRequest,
} from './ShortDramaChangeRequest';
import {
  applyShortDramaStoryboardReferencePlans,
  createShortDramaStoryboardReferencePlansFromBreakdown,
} from './ShortDramaStoryboardReferencePlan';
import {
  createShortDramaDependencyGraph,
  listShortDramaStoryboardReferencePlans,
  summarizeShortDramaStoryboardReferencePlan,
} from './ShortDramaDependencyGraph';
import {
  createShortDramaSpecialistContextPackage,
  createShortDramaStageSpecialistContextPackage,
} from './ShortDramaProjectViewModel';
import {
  applyShortDramaReviewDecision,
  createShortDramaMainAIDispatchPlan,
  reviewShortDramaStageOutput,
  reviewShortDramaArtifactOutput,
} from './ShortDramaOrchestratorScaffold';
import {
  createShortDramaStageWorkspaces,
  updateShortDramaStageWorkspaceFocus,
} from './ShortDramaStageWorkspace';
import type { ShortDramaStageAgentBinding } from './ShortDramaStageAgentSessionBinding';
import { resolveShortDramaNaturalLanguageTarget } from './ShortDramaTargetResolver';
import {
  authorizeShortDramaToolUse,
  type ShortDramaToolAuthorizationRequest,
  authorizeShortDramaAgentWrite,
  createShortDramaToolPolicy,
} from './ShortDramaToolPolicy';
import type {
  ShortDramaArtifactReviewInput,
  ShortDramaFocusedArtifactOptimizationInput,
  ShortDramaArtifactPromptUpdateInput,
  ShortDramaArtifactReadOptions,
  ShortDramaArtifactSearchQuery,
  ShortDramaChatIntakeInput,
  ShortDramaChatIntakeRouteResult,
  ShortDramaChangeRequestInput,
  ShortDramaChangeRequestQuery,
  ShortDramaChangeRequestResolutionInput,
  ShortDramaArtifactType,
  ShortDramaAgentWriteCapability,
  ShortDramaAssetUsageEntry,
  ShortDramaMainAIDispatchPlanInput,
  ShortDramaMediaArtifactIndexEntry,
  ShortDramaMediaInventoryQuery,
  ShortDramaNaturalLanguageTargetInput,
  ShortDramaProject,
  ShortDramaStageAgentSessionCandidate,
  ShortDramaReviewDecisionInput,
  ShortDramaStageReviewInput,
  ShortDramaSearchIndexQuery,
  ShortDramaScriptSegmentReadOptions,
  ShortDramaScriptSegmentSearchQuery,
  ShortDramaStageWorkspace,
  ShortDramaStageWorkspaceFocusInput,
  ShortDramaStageWorkspacePanelState,
  ShortDramaToolPolicyInput,
} from './ShortDramaTypes';

const SOURCE = 'short-drama-main-ai-tools' as const;

type ShortDramaMediaArtifactPromptUpdateInput = Omit<ShortDramaArtifactPromptUpdateInput, 'idOrHandle'> & {
  mediaItemId: string;
};

type ShortDramaMediaArtifactReadOptions = Omit<ShortDramaArtifactReadOptions, 'idOrHandle'> & {
  mediaItemId: string;
};

type ShortDramaProjectAwarenessOptions = {
  activeStage?: ShortDramaProject['activeStage'];
  activeEpisodeId?: string;
  activeArtifactIdOrHandle?: string;
  panelState?: ShortDramaStageWorkspacePanelState;
  stageAgentSessions?: ShortDramaStageAgentSessionCandidate[];
  stageAgentBindings?: ShortDramaStageAgentBinding[];
  parentSessionId?: string;
  workspacePath?: string;
};

export function createShortDramaMainAITools(project: ShortDramaProject) {
  return {
    getProjectAwareness(options: ShortDramaProjectAwarenessOptions = {}) {
      return createProjectAwarenessSnapshot(project, options);
    },

    getShortDramaProjectAwareness(options: ShortDramaProjectAwarenessOptions = {}) {
      return createProjectAwarenessSnapshot(project, options);
    },

    searchArtifacts(query: ShortDramaArtifactSearchQuery) {
      return withToolSource(searchShortDramaArtifacts(project, query));
    },

    searchShortDramaArtifacts(query: ShortDramaArtifactSearchQuery) {
      return withToolSource(searchShortDramaArtifacts(project, query));
    },

    searchProjectIndex(query: ShortDramaSearchIndexQuery) {
      return withToolSource(searchShortDramaIndex(project, query));
    },

    searchShortDramaProjectIndex(query: ShortDramaSearchIndexQuery) {
      return withToolSource(searchShortDramaIndex(project, query));
    },

    resolveNaturalLanguageTarget(input: ShortDramaNaturalLanguageTargetInput) {
      return withToolSource(resolveShortDramaNaturalLanguageTarget(project, input));
    },

    resolveShortDramaNaturalLanguageTarget(input: ShortDramaNaturalLanguageTargetInput) {
      return withToolSource(resolveShortDramaNaturalLanguageTarget(project, input));
    },

    focusNaturalLanguageTarget(
      input: ShortDramaNaturalLanguageTargetInput,
      options: { panelState?: ShortDramaStageWorkspacePanelState } = {},
    ) {
      const resolved = resolveShortDramaNaturalLanguageTarget(project, input);
      if (resolved.status !== 'ready') {
        return withToolSource(resolved);
      }

      if (resolved.candidates.length !== 1) {
        return {
          status: 'conflict' as const,
          source: SOURCE,
          error: {
            code: 'artifact_location_ambiguous',
            message: 'Short drama natural language target matched multiple candidates.',
          },
          matches: resolved.candidates,
        };
      }

      const located = locateArtifactForMainAI(project, resolved.candidates[0].sourceId);
      if (located.status !== 'ready') {
        return withToolSource(located);
      }

      return focusLocatedArtifactForMainAI(project, located, options.panelState ?? 'open');
    },

    focusShortDramaNaturalLanguageTarget(
      input: ShortDramaNaturalLanguageTargetInput,
      options: { panelState?: ShortDramaStageWorkspacePanelState } = {},
    ) {
      const resolved = resolveShortDramaNaturalLanguageTarget(project, input);
      if (resolved.status !== 'ready') {
        return withToolSource(resolved);
      }

      if (resolved.candidates.length !== 1) {
        return {
          status: 'conflict' as const,
          source: SOURCE,
          error: {
            code: 'artifact_location_ambiguous',
            message: 'Short drama natural language target matched multiple candidates.',
          },
          matches: resolved.candidates,
        };
      }

      const located = locateArtifactForMainAI(project, resolved.candidates[0].sourceId);
      if (located.status !== 'ready') {
        return withToolSource(located);
      }

      return focusLocatedArtifactForMainAI(project, located, options.panelState ?? 'open');
    },

    optimizeNaturalLanguageTarget(
      target: ShortDramaNaturalLanguageTargetInput,
      input: ShortDramaFocusedArtifactOptimizationInput,
    ) {
      const focused = this.focusNaturalLanguageTarget(target, { panelState: 'open' });
      if (focused.status !== 'ready') {
        return focused;
      }

      return this.optimizeFocusedArtifact(focused.workspace, input);
    },

    optimizeShortDramaNaturalLanguageTarget(
      target: ShortDramaNaturalLanguageTargetInput,
      input: ShortDramaFocusedArtifactOptimizationInput,
    ) {
      const focused = this.focusShortDramaNaturalLanguageTarget(target, { panelState: 'open' });
      if (focused.status !== 'ready') {
        return focused;
      }

      return this.optimizeFocusedArtifact(focused.workspace, input);
    },

    validateProjectIntegrity() {
      return withToolSource(validateShortDramaDerivedIndexIntegrity(project));
    },

    validateShortDramaProjectIntegrity() {
      return withToolSource(validateShortDramaDerivedIndexIntegrity(project));
    },

    routeChatIntake(input: ShortDramaChatIntakeInput) {
      return withToolSource(routeShortDramaChatIntake(project, input));
    },

    routeShortDramaChatIntake(input: ShortDramaChatIntakeInput) {
      return withToolSource(routeShortDramaChatIntake(project, input));
    },

    applyChatIntakeRoute(route: ShortDramaChatIntakeRouteResult) {
      return withToolSource(applyShortDramaChatIntakeRoute(project, route));
    },

    listMedia(query: ShortDramaMediaInventoryQuery = {}) {
      return withToolSource(listShortDramaMediaArtifacts(project, query));
    },

    listShortDramaMedia(query: ShortDramaMediaInventoryQuery = {}) {
      return withToolSource(listShortDramaMediaArtifacts(project, query));
    },

    readArtifact(options: ShortDramaArtifactReadOptions) {
      return withToolSource(readShortDramaArtifact(project, options));
    },

    readShortDramaArtifact(options: ShortDramaArtifactReadOptions) {
      return withToolSource(readShortDramaArtifact(project, options));
    },

    readMediaArtifact(options: ShortDramaMediaArtifactReadOptions) {
      return readMediaArtifactForMainAI(project, options);
    },

    readShortDramaMediaArtifact(options: ShortDramaMediaArtifactReadOptions) {
      return readMediaArtifactForMainAI(project, options);
    },

    searchScriptSegments(query: ShortDramaScriptSegmentSearchQuery) {
      return withToolSource(searchShortDramaScriptSegments(project, query));
    },

    searchShortDramaScriptSegments(query: ShortDramaScriptSegmentSearchQuery) {
      return withToolSource(searchShortDramaScriptSegments(project, query));
    },

    readScriptSegment(idOrHandle: string, options: ShortDramaScriptSegmentReadOptions = {}) {
      return withToolSource(readShortDramaScriptSegment(project, idOrHandle, options));
    },

    readShortDramaScriptSegment(idOrHandle: string, options: ShortDramaScriptSegmentReadOptions = {}) {
      return withToolSource(readShortDramaScriptSegment(project, idOrHandle, options));
    },

    locateArtifact(input: string | ShortDramaArtifactSearchQuery) {
      if (typeof input === 'string') {
        return withToolSource(locateShortDramaArtifact(project, input));
      }

      const search = searchShortDramaArtifacts(project, { ...input, limit: input.limit ?? 8 });
      if (search.status !== 'ready') {
        return withToolSource(search);
      }

      if (search.results.length === 1) {
        return withToolSource(locateShortDramaArtifact(project, search.results[0].id));
      }

      return {
        status: 'conflict' as const,
        source: SOURCE,
        error: {
          code: 'artifact_location_ambiguous',
          message: 'Short drama artifact location matched multiple candidates.',
        },
        matches: search.results,
      };
    },

    locateShortDramaArtifact(input: string | ShortDramaArtifactSearchQuery) {
      if (typeof input === 'string') {
        return withToolSource(locateShortDramaArtifact(project, input));
      }

      const search = searchShortDramaArtifacts(project, { ...input, limit: input.limit ?? 8 });
      if (search.status !== 'ready') {
        return withToolSource(search);
      }

      if (search.results.length === 1) {
        return withToolSource(locateShortDramaArtifact(project, search.results[0].id));
      }

      return {
        status: 'conflict' as const,
        source: SOURCE,
        error: {
          code: 'artifact_location_ambiguous',
          message: 'Short drama artifact location matched multiple candidates.',
        },
        matches: search.results,
      };
    },

    focusArtifact(
      input: string | ShortDramaArtifactSearchQuery,
      options: { panelState?: ShortDramaStageWorkspacePanelState } = {},
    ) {
      const located = locateArtifactForMainAI(project, input);
      if (located.status !== 'ready') {
        return withToolSource(located);
      }

      return focusLocatedArtifactForMainAI(project, located, options.panelState ?? 'open');
    },

    previewImpact(idOrHandle: string) {
      const resolved = resolveShortDramaArtifactReference(project, idOrHandle);
      if (resolved.status !== 'ready') {
        return withToolSource(resolved);
      }

      return withToolSource(previewShortDramaArtifactPromptImpact(project, resolved.artifact.id));
    },

    previewShortDramaImpact(idOrHandle: string) {
      const resolved = resolveShortDramaArtifactReference(project, idOrHandle);
      if (resolved.status !== 'ready') {
        return withToolSource(resolved);
      }

      return withToolSource(previewShortDramaArtifactPromptImpact(project, resolved.artifact.id));
    },

    updateArtifactPrompt(input: ShortDramaArtifactPromptUpdateInput) {
      return withToolSource(updateShortDramaArtifactPrompt(project, input));
    },

    updateShortDramaArtifactPrompt(input: ShortDramaArtifactPromptUpdateInput) {
      return withToolSource(updateShortDramaArtifactPrompt(project, input));
    },

    updateMediaArtifactPrompt(input: ShortDramaMediaArtifactPromptUpdateInput) {
      return updateMediaArtifactPromptForMainAI(project, input);
    },

    updateShortDramaMediaArtifactPrompt(input: ShortDramaMediaArtifactPromptUpdateInput) {
      return updateMediaArtifactPromptForMainAI(project, input);
    },

    optimizeFocusedArtifact(
      workspace: ShortDramaStageWorkspace,
      input: ShortDramaFocusedArtifactOptimizationInput,
    ) {
      return withToolSource(optimizeShortDramaFocusedArtifact(project, workspace, input));
    },

    explainArtifactChange(idOrHandle: string) {
      return withToolSource(createShortDramaArtifactChangeExplanation(project, idOrHandle));
    },

    explainShortDramaArtifactChange(idOrHandle: string) {
      return withToolSource(createShortDramaArtifactChangeExplanation(project, idOrHandle));
    },

    explainMediaArtifactChange(mediaItemId: string) {
      return explainMediaArtifactChangeForMainAI(project, mediaItemId);
    },

    explainShortDramaMediaArtifactChange(mediaItemId: string) {
      return explainMediaArtifactChangeForMainAI(project, mediaItemId);
    },

    listShortDramaProjectAuditLog(query: ShortDramaProjectAuditLogQuery = {}) {
      return withToolSource(createShortDramaProjectAuditLog(project, query));
    },

    createDispatchPlan(input: ShortDramaMainAIDispatchPlanInput) {
      return withToolSource(createShortDramaMainAIDispatchPlan(project, input));
    },

    createShortDramaDispatchPlan(input: ShortDramaMainAIDispatchPlanInput) {
      return withToolSource(createShortDramaMainAIDispatchPlan(project, input));
    },

    reviewArtifactOutput(input: ShortDramaArtifactReviewInput) {
      return withToolSource(reviewShortDramaArtifactOutput(project, input));
    },

    reviewShortDramaArtifactOutput(input: ShortDramaArtifactReviewInput) {
      return withToolSource(reviewShortDramaArtifactOutput(project, input));
    },

    reviewShortDramaStageOutput(input: ShortDramaStageReviewInput) {
      return withToolSource(reviewShortDramaStageOutput(project, input));
    },

    requestShortDramaStageReview(input: ShortDramaStageReviewInput) {
      return withToolSource(reviewShortDramaStageOutput(project, input));
    },

    createShortDramaAttempt(input: {
      artifactId: string;
      userInstruction: string;
      source: 'mainAI' | 'stageAgent' | 'user';
      timestamp?: number;
    }) {
      return createShortDramaAttemptForMainAI(project, input);
    },

    requestShortDramaReview(input: ShortDramaArtifactReviewInput) {
      return withToolSource(reviewShortDramaArtifactOutput(project, input));
    },

    requestShortDramaGeneration(input: {
      artifactId: string;
      userInstruction: string;
      timestamp?: number;
    }) {
      return createShortDramaGenerationRequestForMainAI(project, input);
    },

    applyReviewDecision(input: ShortDramaReviewDecisionInput) {
      return withToolSource(applyShortDramaReviewDecision(project, input));
    },

    listAssetUsage(options: {
      assetType?: Extract<ShortDramaArtifactType, 'character' | 'location' | 'prop'>;
      assetIdOrHandle?: string;
    } = {}) {
      return {
        status: 'ready' as const,
        source: SOURCE,
        entries: createShortDramaAssetUsageGraph(project)
          .filter(entry => options.assetType ? entry.assetType === options.assetType : true)
          .filter(entry => options.assetIdOrHandle ? assetMatches(entry, options.assetIdOrHandle) : true),
      };
    },

    listShortDramaAssetUsage(options: {
      assetType?: Extract<ShortDramaArtifactType, 'character' | 'location' | 'prop'>;
      assetIdOrHandle?: string;
    } = {}) {
      return {
        status: 'ready' as const,
        source: SOURCE,
        entries: createShortDramaAssetUsageGraph(project)
          .filter(entry => options.assetType ? entry.assetType === options.assetType : true)
          .filter(entry => options.assetIdOrHandle ? assetMatches(entry, options.assetIdOrHandle) : true),
      };
    },

    listShortDramaDependencyGraph() {
      return {
        status: 'ready' as const,
        source: SOURCE,
        graph: createShortDramaDependencyGraph(project),
      };
    },

    listShortDramaStoryboardReferencePlans(query: {
      episodeId?: string;
      sceneId?: string;
      shotId?: string;
      scriptSegmentId?: string;
    } = {}) {
      const plans = listShortDramaStoryboardReferencePlans(project, query);
      return {
        status: 'ready' as const,
        source: SOURCE,
        query,
        plans,
        summaries: plans.map(plan => summarizeShortDramaStoryboardReferencePlan(project, plan)),
      };
    },

    createShortDramaStoryboardReferencePlansFromBreakdown() {
      return createShortDramaStoryboardReferencePlansFromBreakdown(project);
    },

    applyShortDramaStoryboardReferencePlansFromBreakdown() {
      const built = createShortDramaStoryboardReferencePlansFromBreakdown(project);
      if (built.status !== 'ready') {
        return built;
      }

      return applyShortDramaStoryboardReferencePlans(project, built.plans);
    },

    requestShortDramaChange(input: ShortDramaChangeRequestInput) {
      return withToolSource(createShortDramaChangeRequest(project, input));
    },

    listShortDramaChangeRequests(query: ShortDramaChangeRequestQuery = {}) {
      return withToolSource(listShortDramaChangeRequests(project, query));
    },

    resolveShortDramaChangeRequest(input: ShortDramaChangeRequestResolutionInput) {
      return withToolSource(resolveShortDramaChangeRequest(project, input));
    },

    getSpecialistContext(idOrHandle: string) {
      const resolved = resolveShortDramaArtifactReference(project, idOrHandle);
      if (resolved.status !== 'ready') {
        return withToolSource(resolved);
      }

      return withToolSource(createShortDramaSpecialistContextPackage(project, resolved.artifact.id));
    },

    getStageSpecialistContext(workspace: ShortDramaStageWorkspace) {
      return withToolSource(createShortDramaStageSpecialistContextPackage(project, workspace));
    },

    listStageWorkspaces(options: {
      selectedStage?: ShortDramaProject['activeStage'];
      activeEpisodeId?: string;
      panelState?: ShortDramaStageWorkspacePanelState;
    } = {}) {
      return {
        status: 'ready' as const,
        source: SOURCE,
        workspaces: createShortDramaStageWorkspaces(project, options),
      };
    },

    setStageFocus(workspace: ShortDramaStageWorkspace, input: ShortDramaStageWorkspaceFocusInput) {
      return withToolSource(updateShortDramaStageWorkspaceFocus(project, workspace, input));
    },

    setShortDramaStageFocus(workspace: ShortDramaStageWorkspace, input: ShortDramaStageWorkspaceFocusInput) {
      return withToolSource(updateShortDramaStageWorkspaceFocus(project, workspace, input));
    },

    getToolPolicy(input: ShortDramaToolPolicyInput) {
      return withToolSource(createShortDramaToolPolicy(input));
    },

    authorizeShortDramaToolUse(
      input: ShortDramaToolPolicyInput,
      request: ShortDramaToolAuthorizationRequest,
    ) {
      return withToolSource(authorizeShortDramaToolUse(input, request));
    },

    authorizeShortDramaAgentWrite(
      input: ShortDramaToolPolicyInput,
      capability: ShortDramaAgentWriteCapability,
      targetStage: ShortDramaProject['activeStage'],
    ) {
      return withToolSource(authorizeShortDramaAgentWrite(input, capability, targetStage));
    },

    listToolCatalog(input: ShortDramaToolPolicyInput) {
      const policy = createShortDramaToolPolicy(input);
      if (policy.status !== 'ready') {
        return withToolSource(policy);
      }

      const toolNames = new Set(policy.policy.permissions.map(permission => permission.tool));
      return {
        status: 'ready' as const,
        source: SOURCE,
        actorRole: policy.policy.actorRole,
        stage: policy.policy.stage,
        scope: policy.policy.scope,
        forbiddenActions: policy.policy.forbiddenActions,
        recommendedOrder: recommendedToolOrderForPolicy(policy.policy.actorRole).filter(tool => toolNames.has(tool)),
        tools: policy.policy.permissions.map(permission => ({
          name: permission.tool,
          capability: permission.capability,
          access: permission.access,
          scope: permission.scope,
          stage: permission.stage,
          reason: permission.reason,
        })),
      };
    },
  };
}

const MAIN_AI_RECOMMENDED_TOOL_ORDER = [
  'getShortDramaProjectAwareness',
  'validateShortDramaProjectIntegrity',
  'routeShortDramaChatIntake',
  'resolveShortDramaNaturalLanguageTarget',
  'focusShortDramaNaturalLanguageTarget',
  'searchShortDramaProjectIndex',
  'listShortDramaMedia',
  'readShortDramaArtifact',
  'listShortDramaChangeRequests',
  'readShortDramaMediaArtifact',
  'listShortDramaStoryboardReferencePlans',
  'setShortDramaStageFocus',
  'listShortDramaProjectAuditLog',
  'explainShortDramaArtifactChange',
  'explainShortDramaMediaArtifactChange',
  'optimizeShortDramaNaturalLanguageTarget',
  'previewShortDramaImpact',
  'updateShortDramaArtifactPrompt',
  'updateShortDramaMediaArtifactPrompt',
  'createShortDramaDispatchPlan',
  'reviewShortDramaStageOutput',
];

const SPECIALIST_RECOMMENDED_TOOL_ORDER = [
  'searchShortDramaProjectIndex',
  'listShortDramaMedia',
  'readShortDramaMediaArtifact',
  'readShortDramaArtifact',
  'explainShortDramaMediaArtifactChange',
  'explainShortDramaArtifactChange',
  'readShortDramaScriptSegment',
  'updateShortDramaArtifactPrompt',
  'createShortDramaAttempt',
  'requestShortDramaReview',
  'listShortDramaChangeRequests',
  'requestShortDramaChange',
  'resolveShortDramaChangeRequest',
  'requestShortDramaGeneration',
];

function recommendedToolOrderForPolicy(actorRole: ShortDramaToolPolicyInput['actorRole']) {
  return actorRole === 'orchestrator'
    ? MAIN_AI_RECOMMENDED_TOOL_ORDER
    : SPECIALIST_RECOMMENDED_TOOL_ORDER;
}

function createProjectAwarenessSnapshot(
  project: ShortDramaProject,
  options: ShortDramaProjectAwarenessOptions,
) {
  const activeStage = options.activeStage ?? project.activeStage;
  const activeEpisodeId = options.activeEpisodeId ?? project.activeEpisodeId;
  const activeEpisode = project.episodes.find(episode => episode.id === activeEpisodeId);
  const workspaces = createShortDramaStageWorkspaces(project, {
    selectedStage: activeStage,
    activeEpisodeId,
    activeArtifactIdOrHandle: options.activeArtifactIdOrHandle,
    panelState: options.panelState ?? 'collapsed',
    stageAgentSessions: options.stageAgentSessions,
    stageAgentBindings: options.stageAgentBindings,
    parentSessionId: options.parentSessionId,
    workspacePath: options.workspacePath,
  });
  const workspace = workspaces.find(item => item.stage === activeStage);
  const mediaInventory = listShortDramaMediaArtifacts(project, { includeEmpty: true });
  const mediaResults = mediaInventory.status === 'ready' ? mediaInventory.results : [];

  return {
    status: 'ready' as const,
    source: SOURCE,
    projectId: project.projectId,
    title: project.title,
    projectStatus: project.status,
    activeStage,
    activeEpisodeId,
    episodes: {
      total: project.episodes.length,
      activeEpisodeNumber: activeEpisode?.number,
    },
    media: summarizeMediaInventory(mediaResults),
    stageSummaries: createAwarenessStageSummaries(project, mediaResults),
    stageAgents: createAwarenessStageAgents(workspaces),
    workspace,
    contextBudget: {
      strategy: 'summary-first' as const,
      estimatedTokenClass: 'low' as const,
      maxRecommendedReadItems: 8,
      rawPayloadsIncluded: false,
    },
    omittedSections: [
      'fullScriptDocument',
      'rawMediaPayloads',
      'fullRevisionHistory',
      'fullAttemptHistory',
    ],
    availableTools: MAIN_AI_RECOMMENDED_TOOL_ORDER,
    nextReads: createAwarenessNextReads(activeStage, activeEpisode?.number, workspace?.activeArtifactHandle),
  };
}

function createAwarenessStageAgents(workspaces: ShortDramaStageWorkspace[]) {
  return workspaces.map(workspace => {
    const resolution = workspace.stageAgentSessionResolution;
    if (resolution?.status === 'ready') {
      return {
        stage: workspace.stage,
        agentName: resolution.nativeAgentName,
        status: 'ready' as const,
        childSessionId: resolution.childSessionId,
        parentSessionId: resolution.parentSessionId,
        parentToolCallId: resolution.parentToolCallId,
        matchedBy: resolution.matchedBy,
        bindingStatus: workspace.stageAgentBindingStatus,
      };
    }

    if (resolution?.status === 'conflict') {
      return {
        stage: workspace.stage,
        agentName: resolution.nativeAgentName,
        status: 'conflict' as const,
        candidateCount: resolution.candidates.length,
        error: resolution.error,
        bindingStatus: workspace.stageAgentBindingStatus,
      };
    }

    return {
      stage: workspace.stage,
      agentName: resolution?.nativeAgentName,
      status: 'pending' as const,
      reason: resolution?.status === 'pending' ? resolution.reason : 'session_missing',
      bindingStatus: workspace.stageAgentBindingStatus ?? (resolution?.status === 'pending' ? resolution.bindingStatus : undefined),
    };
  });
}

function summarizeMediaInventory(mediaResults: ShortDramaMediaArtifactIndexEntry[]) {
  return {
    total: mediaResults.length,
    ready: mediaResults.filter(item => item.mediaStatus === 'ready' || item.mediaStatus === 'referencedMissingPreview').length,
    empty: mediaResults.filter(item => item.mediaStatus === 'empty').length,
    error: mediaResults.filter(item => item.mediaStatus === 'error').length,
    unsupported: mediaResults.filter(item => item.mediaStatus === 'unsupported').length,
    playable: mediaResults.filter(item => item.playable).length,
    previewAvailable: mediaResults.filter(item => item.previewAvailable).length,
    indexOutline: createMediaIndexOutline(mediaResults),
  };
}

function createMediaIndexOutline(mediaResults: ShortDramaMediaArtifactIndexEntry[]) {
  const stages: ShortDramaProject['activeStage'][] = ['assets', 'storyboards', 'video', 'post'];

  return {
    source: 'media-artifact-index' as const,
    includesEmptySlots: true,
    nextTool: 'listMedia' as const,
    byStage: stages
      .map(stage => {
        const stageMedia = mediaResults.filter(item => item.stage === stage);
        return {
          stage,
          total: stageMedia.length,
          ready: stageMedia.filter(item => item.mediaStatus === 'ready' || item.mediaStatus === 'referencedMissingPreview').length,
          empty: stageMedia.filter(item => item.mediaStatus === 'empty').length,
          error: stageMedia.filter(item => item.mediaStatus === 'error').length,
          unsupported: stageMedia.filter(item => item.mediaStatus === 'unsupported').length,
          playable: stageMedia.filter(item => item.playable).length,
          previewAvailable: stageMedia.filter(item => item.previewAvailable).length,
          sampleHandles: firstUnique(stageMedia.map(item => item.artifactHandle), 5),
        };
      })
      .filter(stage => stage.total > 0),
    attention: {
      playableHandles: firstUnique(mediaResults.filter(item => item.playable).map(item => item.artifactHandle), 8),
      emptySlotHandles: firstUnique(mediaResults.filter(item => item.mediaStatus === 'empty').map(item => item.artifactHandle), 8),
      missingPreviewHandles: firstUnique(mediaResults
        .filter(item => item.mediaStatus !== 'empty' && !item.previewAvailable)
        .map(item => item.artifactHandle), 8),
    },
    recommendedQueries: [
      { includeEmpty: true },
      { includeEmpty: true, mediaStatus: 'empty' as const },
      { playable: true },
    ],
  };
}

function firstUnique<T>(items: T[], limit: number) {
  return [...new Set(items)].slice(0, limit);
}

function createAwarenessStageSummaries(
  project: ShortDramaProject,
  mediaResults: ShortDramaMediaArtifactIndexEntry[],
) {
  const stages: ShortDramaProject['activeStage'][] = ['script', 'assets', 'storyboards', 'video', 'post'];

  return stages.map(stage => {
    const artifacts = project.artifacts.filter(artifact => artifact.stage === stage);
    const stageMedia = mediaResults.filter(item => item.stage === stage);

    return {
      stage,
      total: artifacts.length,
      ready: artifacts.filter(artifact => artifact.status === 'ready').length,
      running: artifacts.filter(artifact => artifact.status === 'generating' || artifact.status === 'reviewing' || artifact.status === 'revising').length,
      issues: artifacts.filter(artifact => artifact.status === 'error' || artifact.status === 'needs_intervention' || artifact.status === 'stale').length,
      media: stageMedia.length,
      playableMedia: stageMedia.filter(item => item.playable).length,
      emptyMedia: stageMedia.filter(item => item.mediaStatus === 'empty').length,
    };
  });
}

function createAwarenessNextReads(
  activeStage: ShortDramaProject['activeStage'],
  activeEpisodeNumber?: number,
  activeArtifactHandle?: string,
) {
  return [
    {
      tool: 'listShortDramaMedia' as const,
      reason: 'Audit right-panel media, playable previews, missing previews, and empty confirmation slots before changing outputs.',
      query: {
        includeEmpty: true,
        stage: activeStage === 'script' ? undefined : activeStage,
        episodeNumber: activeStage === 'assets' ? undefined : activeEpisodeNumber,
      },
    },
    {
      tool: 'searchShortDramaProjectIndex' as const,
      reason: 'Use structured filters when the user describes an episode, stage, scene, asset, image, video, or post-production output.',
      query: {
        stage: activeStage,
        episodeNumber: activeStage === 'assets' ? undefined : activeEpisodeNumber,
        limit: 8,
      },
    },
    {
      tool: 'readShortDramaArtifact' as const,
      reason: 'Read the focused artifact only after search or focus returns one stable id or handle.',
      query: {
        idOrHandle: activeArtifactHandle,
        includeMediaMetadata: true,
      },
    },
    {
      tool: 'setShortDramaStageFocus' as const,
      reason: 'Synchronize the right-panel focus after the target artifact is resolved.',
      query: {
        stage: activeStage,
        episodeNumber: activeEpisodeNumber,
      },
    },
  ];
}

function assetMatches(entry: ShortDramaAssetUsageEntry, idOrHandle: string) {
  const normalized = idOrHandle.trim().toLowerCase();
  return entry.assetId.toLowerCase() === normalized
    || entry.assetHandle.toLowerCase() === normalized
    || entry.displayName.toLowerCase().includes(normalized);
}

function readMediaArtifactForMainAI(
  project: ShortDramaProject,
  options: ShortDramaMediaArtifactReadOptions,
) {
  const located = locateArtifactForMainAI(project, {
    mediaItemId: options.mediaItemId,
    limit: 2,
  });
  if (located.status !== 'ready') {
    return withToolSource(located);
  }

  return withToolSource(readShortDramaArtifact(project, {
    idOrHandle: located.artifactId,
    includeRevisionSummary: options.includeRevisionSummary,
    includeMediaMetadata: options.includeMediaMetadata,
    tokenBudget: options.tokenBudget,
  }));
}

function updateMediaArtifactPromptForMainAI(
  project: ShortDramaProject,
  input: ShortDramaMediaArtifactPromptUpdateInput,
) {
  const located = locateArtifactForMainAI(project, {
    mediaItemId: input.mediaItemId,
    limit: 2,
  });
  if (located.status !== 'ready') {
    return withToolSource(located);
  }

  const { mediaItemId: _mediaItemId, ...promptUpdate } = input;
  return withToolSource(updateShortDramaArtifactPrompt(project, {
    ...promptUpdate,
    idOrHandle: located.artifactId,
  }));
}

function explainMediaArtifactChangeForMainAI(
  project: ShortDramaProject,
  mediaItemId: string,
) {
  const located = locateArtifactForMainAI(project, {
    mediaItemId,
    limit: 2,
  });
  if (located.status !== 'ready') {
    return withToolSource(located);
  }

  return withToolSource(createShortDramaArtifactChangeExplanation(project, located.artifactId));
}

function createShortDramaAttemptForMainAI(
  project: ShortDramaProject,
  input: {
    artifactId: string;
    userInstruction: string;
    source: 'mainAI' | 'stageAgent' | 'user';
    timestamp?: number;
  },
) {
  const artifact = project.artifacts.find(item => item.id === input.artifactId);
  if (!artifact) {
    return {
      status: 'not_found' as const,
      source: SOURCE,
      error: {
        code: 'artifact_missing' as const,
        message: 'Short drama artifact was not found.',
      },
    };
  }

  const timestamp = input.timestamp ?? Date.now();
  const attemptId = `attempt-${artifact.id}-${timestamp}`;
  const nextProject = {
    ...project,
    artifacts: project.artifacts.map(item => item.id === artifact.id
      ? {
          ...item,
          status: 'generating' as const,
          statusReason: input.userInstruction,
          attemptCount: item.attemptCount + 1,
          attempts: [
            ...item.attempts,
            {
              id: attemptId,
              status: 'created' as const,
              createdAt: timestamp,
              inputInstruction: input.userInstruction,
            },
          ],
        }
      : item),
  };

  return {
    status: 'ready' as const,
    source: SOURCE,
    project: nextProject,
    artifactId: artifact.id,
    attemptId,
  };
}

function createShortDramaGenerationRequestForMainAI(
  project: ShortDramaProject,
  input: {
    artifactId: string;
    userInstruction: string;
    timestamp?: number;
  },
) {
  const artifact = project.artifacts.find(item => item.id === input.artifactId);
  if (!artifact) {
    return {
      status: 'not_found' as const,
      source: SOURCE,
      error: {
        code: 'artifact_missing' as const,
        message: 'Short drama artifact was not found.',
      },
    };
  }

  return {
    status: 'needs_approval' as const,
    source: SOURCE,
    request: {
      artifactId: artifact.id,
      artifactHandle: artifact.handle,
      stage: artifact.stage,
      episodeId: artifact.episodeId,
      userInstruction: input.userInstruction,
      requestedAt: input.timestamp ?? Date.now(),
      requiresMainAIApproval: true,
      reason: 'Specialist generation requests must be approved by the main AI before dispatch.',
    },
  };
}

function locateArtifactForMainAI(project: ShortDramaProject, input: string | ShortDramaArtifactSearchQuery) {
  if (typeof input === 'string') {
    return locateShortDramaArtifact(project, input);
  }

  const search = searchShortDramaArtifacts(project, { ...input, limit: input.limit ?? 8 });
  if (search.status !== 'ready') {
    return search;
  }

  if (search.results.length === 1) {
    return locateShortDramaArtifact(project, search.results[0].id);
  }

  return {
    status: 'conflict' as const,
    source: 'artifact-index' as const,
    error: {
      code: 'artifact_location_ambiguous',
      message: 'Short drama artifact location matched multiple candidates.',
    },
    matches: search.results,
  };
}

function focusLocatedArtifactForMainAI(
  project: ShortDramaProject,
  located: Extract<ReturnType<typeof locateArtifactForMainAI>, { status: 'ready' }>,
  panelState: ShortDramaStageWorkspacePanelState,
) {
  const workspace = createShortDramaStageWorkspaces(project, {
    selectedStage: located.stage,
    activeEpisodeId: located.episodeId,
    panelState,
  }).find(item => item.stage === located.stage);
  if (!workspace) {
    return {
      status: 'error' as const,
      source: SOURCE,
      error: {
        code: 'artifact_location_ambiguous',
        message: 'Short drama stage workspace could not be created for this artifact.',
      },
    };
  }

  const focused = updateShortDramaStageWorkspaceFocus(project, workspace, {
    stage: located.stage,
    artifactIdOrHandle: located.artifactId,
    source: 'mainAI',
  });
  if (focused.status !== 'ready') {
    return withToolSource(focused);
  }

  return {
    status: 'ready' as const,
    source: SOURCE,
    artifactId: located.artifactId,
    handle: located.handle,
    stage: located.stage,
    episodeId: located.episodeId,
    scrollTargetId: located.scrollTargetId,
    workspace: focused.workspace,
  };
}

function withToolSource<T extends object>(result: T): Omit<T, 'source'> & { source: typeof SOURCE } {
  return {
    ...result,
    source: SOURCE,
  };
}
