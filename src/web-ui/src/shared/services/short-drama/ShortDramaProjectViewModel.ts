import { createShortDramaAssetUsageGraph } from './ShortDramaArtifactRevisionWorkflow';
import { createShortDramaFocusContextFromWorkspace } from './ShortDramaChangeRequest';
import {
  createShortDramaStageMismatchError,
  getShortDramaStageAgentRole,
} from './ShortDramaStageWorkspace';
import {
  createShortDramaArtifactIndex,
  createShortDramaMediaArtifactIndex,
  createShortDramaSearchIndex,
  createShortDramaScriptSegmentIndex,
  resolveShortDramaArtifactReference,
} from './ShortDramaArtifactIndex';
import { createShortDramaStaticProject } from './ShortDramaStaticProject';
import { createShortDramaToolPolicy } from './ShortDramaToolPolicy';
import { createShortDramaProjectAuditLog } from './ShortDramaAuditLog';
import recoveredMediaLexicon from './ShortDramaRecoveredMediaLexicon.json';
import type { WorkspaceMediaItem, WorkspaceMediaPendingGeneration } from '@/shared/services/workspace-media';
import {
  collectShortDramaArtifactAssetReferenceIds,
  listShortDramaStoryboardReferencePlans,
  summarizeShortDramaStoryboardReferencePlan,
} from './ShortDramaDependencyGraph';
import type {
  ShortDramaAgentEvent,
  ShortDramaAgentRole,
  ShortDramaAgentTaskContext,
  ShortDramaAgentTaskTargetBinding,
  ShortDramaOrchestratorDispatchOptions,
  ShortDramaOrchestratorDispatchPlan,
  ShortDramaAgentTaskRequestBatch,
  ShortDramaArtifactReviewApproval,
  ShortDramaArtifact,
  ShortDramaArtifactAttempt,
  ShortDramaArtifactCardViewModel,
  ShortDramaArtifactChatContext,
  ShortDramaArtifactRevision,
  ShortDramaArtifactStatus,
  ShortDramaAssetUsage,
  ShortDramaError,
  ShortDramaImpactAnalysis,
  ShortDramaManifest,
  ShortDramaManifestAdapter,
  ShortDramaManifestState,
  ShortDramaLegacyProjectMigrationOptions,
  ShortDramaLegacyProjectMigrationResult,
  ShortDramaMediaArtifactIndexEntry,
  ShortDramaMediaReference,
  ShortDramaMediaPreviewViewModel,
  ShortDramaMediaResolution,
  ShortDramaProductionPlan,
  ShortDramaProject,
  ShortDramaProjectStatus,
  ShortDramaRecoveryGuidance,
  ShortDramaRegenerationPlan,
  ShortDramaScriptDocumentViewModel,
  ShortDramaSubagentBinding,
  ShortDramaSubagentSessionLinkedInput,
  ShortDramaSubagentSessionLinkedResult,
  ShortDramaLibraryService,
  ShortDramaLibraryState,
  ShortDramaSource,
  ShortDramaSpecialistContextResult,
  ShortDramaSpecialistContextSection,
  ShortDramaOmittedContextEntry,
  ShortDramaStage,
  ShortDramaStageAgentRole,
  ShortDramaStageWorkspace,
  ShortDramaStageSummary,
  ShortDramaStatusSummary,
  ShortDramaToolPolicy,
  ShortDramaWorkspaceProjectInitOptions,
  ShortDramaWorkspaceProjectInitResult,
  ShortDramaWorkspaceMediaLookup,
  ShortDramaWorkspaceMediaItem,
} from './ShortDramaTypes';

const STAGES: ShortDramaStage[] = ['script', 'assets', 'storyboards', 'video', 'post'];
const SHORT_DRAMA_MANIFEST_VERSION = 1;
const SHORT_DRAMA_INDEX_VERSION = 1;
const SHORT_DRAMA_VALID_PROJECT_STATUSES: readonly ShortDramaProjectStatus[] = ['draft', 'planning', 'generating', 'review', 'ready', 'error'];
const CHINESE_EPISODE_PREFIX = '\u7b2c';
const CHINESE_EPISODE_SUFFIX = '\u96c6';
const CHINESE_HEADING_SEPARATOR = '\uff1a';
const RECOVERED_MEDIA_TYPE_CUES = recoveredMediaLexicon as Partial<
  Record<ShortDramaArtifact['type'], readonly string[]>
>;
const STATUSES: ShortDramaArtifactStatus[] = [
  'pending',
  'generating',
  'ready',
  'reviewing',
  'revising',
  'stale',
  'error',
  'unsupported',
  'needs_intervention',
];

interface ViewModelOptions {
  selectedStage?: ShortDramaStage;
  selectedEpisodeId?: string;
  source?: ShortDramaSource;
  unsupportedReason?: 'remote_workspace' | 'unsupported_runtime';
  error?: { code: 'load_failed' | 'version_incompatible' | 'manifest_missing' | 'manifest_invalid'; message: string };
}

export interface ShortDramaProjectViewModel {
  state:
    | { status: 'ready'; source: ShortDramaSource }
    | { status: 'empty'; source: ShortDramaSource; reason: 'no_project' | 'no_episodes' | 'no_artifacts' }
    | { status: 'unsupported'; source: ShortDramaSource; error: { code: string; message: string } }
    | { status: 'error'; source: ShortDramaSource; error: { code: string; message: string } };
  project?: ShortDramaProject;
  selectedStage: ShortDramaStage;
  selectedEpisode?: ShortDramaProject['episodes'][number];
  currentArtifacts: ShortDramaArtifact[];
  stageSummaries: ShortDramaStageSummary[];
  statusSummary: ShortDramaStatusSummary;
  productionPlan: ShortDramaProductionPlan;
}

export interface ShortDramaStageTimelineEpisode {
  episode: ShortDramaProject['episodes'][number];
  artifacts: ShortDramaArtifact[];
}

interface ShortDramaStageTimelineOptions {
  mediaPreviewOnly?: boolean;
  mediaEntriesByArtifactId?: ReadonlyMap<string, ShortDramaMediaArtifactIndexEntry>;
}

export type ShortDramaAssetAnchorCategoryId = 'characters' | 'locations' | 'props';

export interface ShortDramaAssetAnchorCategory {
  id: ShortDramaAssetAnchorCategoryId;
  artifactType: ShortDramaArtifact['type'];
  artifacts: ShortDramaArtifact[];
  items: ShortDramaAssetAnchorItem[];
}

export interface ShortDramaStageMediaViewModel {
  stage: ShortDramaStage;
  artifacts: Array<{
    artifact: ShortDramaArtifact;
    preview: ShortDramaMediaPreviewViewModel;
  }>;
  pendingGenerations: WorkspaceMediaPendingGeneration[];
}

export interface ShortDramaAssetAnchorItem {
  artifact: ShortDramaArtifact;
  usedBy: ShortDramaAssetUsage[];
}

export function createShortDramaProjectViewModel(
  project?: ShortDramaProject,
  options: ViewModelOptions = {},
): ShortDramaProjectViewModel {
  const source = options.source ?? 'static';
  const selectedStage = options.selectedStage ?? project?.activeStage ?? 'script';
  const productionPlan = project?.productionPlan ?? createEmptyProductionPlan();
  const base = {
    project,
    selectedStage,
    currentArtifacts: [],
    stageSummaries: createStageSummaries(project?.artifacts ?? []),
    statusSummary: createStatusSummary(project?.artifacts ?? []),
    productionPlan,
  };

  if (options.error) {
    return { ...base, state: { status: 'error', source, error: options.error } };
  }

  if (options.unsupportedReason) {
    return {
      ...base,
      state: {
        status: 'unsupported',
        source,
        error: {
          code: options.unsupportedReason,
          message: options.unsupportedReason === 'remote_workspace'
            ? 'Remote short drama manifests are not supported yet.'
            : 'This short drama runtime is not supported yet.',
        },
      },
    };
  }

  if (!project) {
    return { ...base, state: { status: 'empty', source, reason: 'no_project' } };
  }

  if (project.episodes.length === 0) {
    return { ...base, state: { status: 'empty', source, reason: 'no_episodes' } };
  }

  if (project.artifacts.length === 0) {
    return {
      ...base,
      state: { status: 'empty', source, reason: 'no_artifacts' },
      selectedEpisode: project.episodes[0],
    };
  }

  const selectedEpisode = resolveShortDramaEpisode(project, options.selectedEpisodeId)
    ?? resolveShortDramaEpisode(project, project.activeEpisodeId)
    ?? project.episodes[0];

  return {
    ...base,
    state: { status: 'ready', source },
    selectedEpisode,
    currentArtifacts: project.artifacts.filter(artifact => (
      artifact.stage === selectedStage && shortDramaEpisodeMatches(project, artifact.episodeId, selectedEpisode.id)
    )),
  };
}

export function shortDramaEpisodeIdMatches(
  project: ShortDramaProject,
  sourceEpisodeId: string | undefined,
  targetEpisodeId: string | undefined,
): boolean {
  return shortDramaEpisodeMatches(project, sourceEpisodeId, targetEpisodeId);
}

export function createShortDramaStageTimelineViewModel(
  project: ShortDramaProject,
  stage: ShortDramaStage,
  options: ShortDramaStageTimelineOptions = {},
): ShortDramaStageTimelineEpisode[] {
  return project.episodes.map(episode => ({
    episode,
    artifacts: project.artifacts
      .filter(artifact => (
        artifact.stage === stage && shortDramaEpisodeMatches(project, artifact.episodeId, episode.id)
      ))
      .filter(artifact => (
        !options.mediaPreviewOnly
        || shortDramaArtifactHasMediaPreview(artifact, options.mediaEntriesByArtifactId?.get(artifact.id))
      )),
  }));
}

export function createShortDramaAssetAnchorViewModel(project: ShortDramaProject): ShortDramaAssetAnchorCategory[] {
  const assetArtifacts = project.artifacts.filter(artifact => artifact.stage === 'assets');
  const usageByAssetId = new Map(createShortDramaAssetUsageGraph(project).map(entry => [entry.assetId, entry.usedBy]));
  const categories: Array<{ id: ShortDramaAssetAnchorCategoryId; artifactType: ShortDramaArtifact['type'] }> = [
    { id: 'characters', artifactType: 'character' },
    { id: 'locations', artifactType: 'location' },
    { id: 'props', artifactType: 'prop' },
  ];

  return categories.map(category => {
    const artifacts = assetArtifacts.filter(artifact => {
      const resolvedType = resolveShortDramaAssetAnchorType(artifact);
      if (resolvedType === category.artifactType) return true;
      if (category.id !== 'characters') return false;
      // Catch-all: unclassified types go to characters so nothing is silently dropped
      return !['character', 'location', 'prop'].includes(resolvedType);
    });
    return {
      ...category,
      artifacts,
      items: artifacts.map(artifact => ({
        artifact,
        usedBy: usageByAssetId.get(artifact.id) ?? [],
      })),
    };
  });
}

const SHORT_DRAMA_LOCATION_CJK_HINT = /(场景|内景|外景|地点|环境|背景|城市|街道|街景|房间|室内|指挥舱|船舱|空间站|基地|星球|海面|沙漠|森林|山脉|天空|太空|夜景)/i;
const SHORT_DRAMA_PROP_CJK_HINT = /(道具|物件|器物|手持|武器|怀表|手表|箱子|手提箱|盒子|信件|书信|装置|装备)/i;
const SHORT_DRAMA_CHARACTER_CJK_HINT = /(角色|人物|肖像|女主|男主|主角|配角|反派|女孩|男孩|男人|女人|少女|少年|老人|队长|士兵|警官)/i;
const SHORT_DRAMA_LOCATION_LATIN_HINTS = new Set([
  'location', 'scenery', 'interior', 'exterior', 'environment', 'landscape', 'cityscape',
]);
const SHORT_DRAMA_PROP_LATIN_HINTS = new Set([
  'prop', 'object', 'item', 'device', 'gadget', 'weapon', 'suitcase',
]);
const SHORT_DRAMA_CHARACTER_LATIN_HINTS = new Set([
  'character', 'portrait', 'girl', 'boy', 'man', 'woman', 'captain', 'soldier',
]);

export function inferShortDramaAssetAnchorType(text: string): ShortDramaArtifact['type'] | undefined {
  const latinTokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const hasLatinHint = (hints: ReadonlySet<string>) => latinTokens.some(token => hints.has(token));
  if (SHORT_DRAMA_LOCATION_CJK_HINT.test(text) || hasLatinHint(SHORT_DRAMA_LOCATION_LATIN_HINTS)) return 'location';
  if (SHORT_DRAMA_PROP_CJK_HINT.test(text) || hasLatinHint(SHORT_DRAMA_PROP_LATIN_HINTS)) return 'prop';
  if (SHORT_DRAMA_CHARACTER_CJK_HINT.test(text) || hasLatinHint(SHORT_DRAMA_CHARACTER_LATIN_HINTS)) return 'character';
  return undefined;
}

function resolveShortDramaAssetAnchorType(artifact: ShortDramaArtifact): ShortDramaArtifact['type'] {
  if (!['character', 'location', 'prop'].includes(artifact.type)) {
    return artifact.type;
  }
  const inferred = inferShortDramaAssetAnchorType([
    artifact.title,
    artifact.summary,
    artifact.prompt?.positive ?? '',
  ].join(' '));
  return inferred ?? artifact.type;
}

export function createShortDramaStageMediaViewModel(
  project: ShortDramaProject,
  stage: ShortDramaStage,
  options: {
    episodeId?: string;
    mediaEntriesByArtifactId?: ReadonlyMap<string, ShortDramaMediaArtifactIndexEntry>;
    pendingGenerations?: WorkspaceMediaPendingGeneration[];
  } = {},
): ShortDramaStageMediaViewModel {
  const artifacts = project.artifacts
    .filter(artifact => artifact.stage === stage)
    .filter(artifact => !options.episodeId || shortDramaEpisodeMatches(project, artifact.episodeId, options.episodeId));
  const readyMediaIds = new Set(
    artifacts
      .map(artifact => artifact.mediaReference)
      .filter((reference): reference is NonNullable<ShortDramaArtifact['mediaReference']> => Boolean(reference))
      .map(reference => reference.mediaItemId),
  );
  const readyArtifactIds = new Set(
    artifacts
      .filter(artifact => Boolean(artifact.mediaReference))
      .map(artifact => artifact.id),
  );
  const readyArtifactHandles = new Set(
    artifacts
      .filter(artifact => Boolean(artifact.mediaReference))
      .map(artifact => artifact.handle)
      .filter((handle): handle is string => Boolean(handle)),
  );
  const readyBatchIds = new Set(
    [...readyMediaIds]
      .map(mediaItemId => shortDramaGeneratedBatchIdFromMediaItemId(mediaItemId))
      .filter((batchId): batchId is string => Boolean(batchId)),
  );

  return {
    stage,
    artifacts: artifacts.map(artifact => ({
      artifact,
      preview: createShortDramaMediaPreviewViewModel(
        artifact,
        undefined,
        options.mediaEntriesByArtifactId?.get(artifact.id),
      ),
    })),
    pendingGenerations: (options.pendingGenerations ?? [])
      .filter(item => pendingGenerationMatchesStage(item, stage))
      .filter(item => !item.mediaItemId || !readyMediaIds.has(item.mediaItemId))
      .filter(item => !item.batchId || !readyBatchIds.has(item.batchId))
      .filter(item => !item.artifactId || !readyArtifactIds.has(item.artifactId))
      .filter(item => !item.artifactHandle || !readyArtifactHandles.has(item.artifactHandle)),
  };
}

export function createShortDramaScriptDocumentViewModel(
  project: ShortDramaProject,
  contentOverride?: string,
): ShortDramaScriptDocumentViewModel {
  const content = contentOverride ?? project.scriptDocument?.content ?? createFallbackScriptMarkdown(project);
  return {
    content,
    anchors: parseScriptEpisodeAnchors(content, project),
  };
}

export function createShortDramaArtifactChatContext(
  project: ShortDramaProject,
  artifactId: string,
  workspacePath?: string,
): ShortDramaArtifactChatContext {
  const artifact = project.artifacts.find(item => item.id === artifactId);

  if (!artifact) {
    return createChatError('artifact', artifactId, 'artifact_missing', 'Short drama artifact was not found.');
  }

  if (!artifact.subagentSessionId) {
    return {
      status: 'pending',
      scope: 'artifact',
      episodeId: artifact.episodeId,
      stage: artifact.stage,
      agentRole: artifact.agentRole,
      artifactId: artifact.id,
    };
  }

  return {
    status: 'ready',
    scope: 'artifact',
    episodeId: artifact.episodeId,
    stage: artifact.stage,
    agentRole: artifact.agentRole,
    artifactId: artifact.id,
    subagentSessionId: artifact.subagentSessionId,
    parentSessionId: artifact.parentSessionId,
    parentToolCallId: artifact.parentToolCallId,
    openRequest: {
      childSessionId: artifact.subagentSessionId,
      parentSessionId: artifact.parentSessionId,
      workspacePath,
      sessionKind: 'subagent',
      sessionTitle: artifact.title,
      agentType: artifact.agentRole,
      parentToolCallId: artifact.parentToolCallId,
      subagentType: artifact.agentRole,
      duplicateCheckKey: `short-drama-subagent:${artifact.subagentSessionId}`,
    },
  };
}

export function createShortDramaEpisodeStageChatContext(
  project: ShortDramaProject,
  episodeId: string,
  stage: ShortDramaStage,
): ShortDramaArtifactChatContext {
  const episode = resolveShortDramaEpisode(project, episodeId);
  if (!episode) {
    return createChatError('episodeStage', undefined, 'episode_missing', 'Short drama episode was not found.', episodeId, stage);
  }

  return {
    status: 'ready',
    scope: 'episodeStage',
    episodeId: episode.id,
    stage,
    agentRole: stage === 'assets' ? 'image' : stage === 'video' ? 'video' : stage === 'post' ? 'post' : 'director',
  };
}

function contextScopeForStage(stage: ShortDramaStage): NonNullable<ShortDramaAgentTaskContext['status']> extends never ? never : 'script' | 'visual' | 'storyboard' | 'video' | 'post' {
  if (stage === 'script') return 'script';
  if (stage === 'assets') return 'visual';
  if (stage === 'storyboards') return 'storyboard';
  if (stage === 'video') return 'video';
  return 'post';
}

export function createShortDramaAgentTaskContext(
  project: ShortDramaProject,
  artifactId: string,
  parentSessionIdOrOptions?: string | {
    parentSessionId?: string;
    stageAgentBindings?: ShortDramaAgentTaskTargetBinding[];
  },
): ShortDramaAgentTaskContext {
  const artifact = project.artifacts.find(item => item.id === artifactId);
  if (!artifact) {
    return {
      status: 'error',
      error: { code: 'artifact_missing', message: 'Short drama artifact was not found.' },
    };
  }
  const options = typeof parentSessionIdOrOptions === 'string'
    ? { parentSessionId: parentSessionIdOrOptions }
    : parentSessionIdOrOptions ?? {};
  const targetSessionId = resolveShortDramaAgentTaskTargetSessionId(artifact.stage, options.stageAgentBindings);

  return {
    status: 'ready',
    request: {
      artifactId: artifact.id,
      episodeId: artifact.episodeId,
      stage: artifact.stage,
      agentRole: artifact.agentRole,
      contextScope: contextScopeForStage(artifact.stage),
      inputSummary: `${artifact.title}: ${artifact.summary}`,
      parentSessionId: options.parentSessionId,
      targetSessionId,
    },
  };
}

function resolveShortDramaAgentTaskTargetSessionId(
  stage: ShortDramaStage,
  stageAgentBindings?: ShortDramaAgentTaskTargetBinding[],
): string | undefined {
  const binding = stageAgentBindings?.find(item => item.stage === stage);
  if (binding?.status !== 'ready' || !binding.childSessionId?.trim()) {
    return undefined;
  }

  return binding.childSessionId;
}

export function createShortDramaOrchestratorDispatchPlan(
  project: ShortDramaProject,
  options: ShortDramaOrchestratorDispatchOptions = {},
): ShortDramaOrchestratorDispatchPlan {
  const needsApproval = project.productionPlan.mode === 'semiAutomatic' && !options.approved;
  if (needsApproval) {
    return { status: 'needs_approval', plan: project.productionPlan, requests: [] };
  }

  const requests = project.artifacts
    .filter(artifact => artifact.status !== 'ready' && artifact.status !== 'unsupported')
    .map(artifact => createShortDramaAgentTaskContext(project, artifact.id, {
      parentSessionId: options.parentSessionId,
      stageAgentBindings: options.stageAgentBindings,
    }))
    .filter((context): context is Extract<ShortDramaAgentTaskContext, { status: 'ready' }> => context.status === 'ready')
    .map(context => context.request);

  if (requests.length === 0) {
    return {
      status: 'error',
      plan: project.productionPlan,
      requests: [],
      error: { code: 'artifact_missing', message: 'No dispatchable short drama artifacts were found.' },
    };
  }

  return { status: 'ready', plan: project.productionPlan, requests };
}

export function createShortDramaSpecialistContextPackage(
  project: ShortDramaProject,
  artifactId: string,
  stageAgentRole: ShortDramaStageAgentRole = getShortDramaStageAgentRole(
    project.artifacts.find(item => item.id === artifactId)?.stage ?? 'script',
  ),
): ShortDramaSpecialistContextResult {
  const artifact = project.artifacts.find(item => item.id === artifactId);
  if (!artifact) {
    return {
      status: 'error',
      error: { code: 'artifact_missing', message: 'Short drama artifact was not found.' },
    };
  }

  const episode = resolveShortDramaEpisode(project, artifact.episodeId);
  if (!episode) {
    return {
      status: 'error',
      error: { code: 'episode_missing', message: 'Short drama episode was not found.' },
    };
  }

  const runtimeAgentRole = agentRoleForStageAgentRole(stageAgentRole);
  const includedSections = sectionsForAgentRole(runtimeAgentRole, artifact.stage);
  const artifactIndex = createShortDramaArtifactIndex(project);
  const handlesById = new Map(artifactIndex.map(entry => [entry.id, entry.handle]));
  const activeArtifactHandle = handlesById.get(artifact.id);
  const focusedMedia = createShortDramaMediaArtifactIndex(project, { includeEmpty: true })
    .find(entry => entry.artifactId === artifact.id);
  const dependencyArtifacts = collectDependencyArtifacts(project, artifact);
  const scriptSegments = createShortDramaScriptSegmentIndex(project);
  const activeScriptSegmentId = findActiveScriptSegmentId(scriptSegments, episode.number);
  const storyboardReferencePlans = listShortDramaStoryboardReferencePlans(project, {
    episodeId: episode.id,
    scriptSegmentId: artifact.references?.scriptSegmentIds?.[0] ?? activeScriptSegmentId,
  });
  const referencedAssets = dependencyArtifacts
    .filter(item => item.stage === 'assets' && ['character', 'location', 'prop'].includes(item.type))
    .map(item => summarizeArtifactForContext(item, handlesById));
  const upstreamArtifacts = dependencyArtifacts
    .filter(item => !(item.stage === 'assets' && ['character', 'location', 'prop'].includes(item.type)))
    .map(item => summarizeArtifactForContext(item, handlesById));
  const relevantScriptSegments = [
    ...project.artifacts
      .filter(item => item.stage === 'script')
      .filter(item => shortDramaEpisodeMatches(project, item.episodeId, episode.id) || dependencyArtifacts.some(dependency => dependency.id === item.id))
      .map(item => summarizeArtifactForContext(item, handlesById)),
    ...createRelevantScriptSegmentSummaries(scriptSegments, episode.number),
  ];
  const usage = createShortDramaAssetUsageGraph(project).find(entry => entry.assetId === artifact.id);
  const relatedArtifacts = project.artifacts
    .filter(item => shortDramaEpisodeMatches(project, item.episodeId, episode.id))
    .filter(item => item.id !== artifact.id)
    .filter(item => includedSections.includes(sectionForStage(item.stage)))
    .map(item => `${item.title}: ${item.summary}`);
  const toolPolicy = createShortDramaToolPolicy({
    actorRole: runtimeAgentRole,
    stage: artifact.stage,
  });
  const resolvedToolPolicy = toolPolicy.status === 'ready'
    ? toolPolicy.policy
    : createFallbackSpecialistToolPolicy(artifact);
  const omittedContextDetails = createOmittedContextDetails(resolvedToolPolicy);

  return {
    status: 'ready',
    context: {
      projectId: project.projectId,
      artifactId: artifact.id,
      episodeId: episode.id,
      activeEpisodeId: artifact.stage === 'assets' ? undefined : episode.id,
      activeArtifactId: artifact.id,
      activeArtifactHandle,
      activeScriptSegmentId,
      focusedMedia: focusedMedia ? {
        artifactHandle: focusedMedia.artifactHandle,
        mediaKind: focusedMedia.mediaKind,
        mediaStatus: focusedMedia.mediaStatus,
        mediaItemId: focusedMedia.mediaItemId,
        previewAvailable: focusedMedia.previewAvailable,
        playable: focusedMedia.playable,
      } : undefined,
      stage: artifact.stage,
      agentRole: runtimeAgentRole,
      stageAgentRole,
      includedSections,
      omittedContext: ['full_chat_history', 'unrelated_stages', 'provider_secrets'],
      includedContext: [
        { type: 'focus', id: artifact.id, reason: 'Current right-panel artifact focus.' },
        ...(activeScriptSegmentId ? [{
          type: 'scriptSegment' as const,
          id: activeScriptSegmentId,
          reason: 'Nearest script segment for the focused episode or shot.',
        }] : []),
        ...dependencyArtifacts
          .filter(item => item.stage === 'assets' && ['character', 'location', 'prop'].includes(item.type))
          .map(item => ({
            type: 'asset' as const,
            id: item.id,
            reason: 'Referenced by the focused artifact or storyboard plan.',
          })),
        ...storyboardReferencePlans.map(plan => ({
          type: 'storyboardReferencePlan' as const,
          id: plan.id,
          reason: 'ScriptAI structured shot plan for SplitAI/VideoAI context.',
        })),
      ],
      omittedContextDetails,
      reason: `Build focused context for ${stageAgentRole} agent using the active artifact, policy read scopes, and dependency graph.`,
      policyApplied: formatShortDramaPolicyApplied(resolvedToolPolicy),
      artifactSummary: `${artifact.title}: ${artifact.summary}`,
      inputSummary: `${artifact.title}: ${artifact.summary}`,
      episodeSummary: `${episode.title}: ${episode.summary}`,
      relevantScriptSegments,
      referencedAssets,
      storyboardReferencePlans: storyboardReferencePlans.map(plan => summarizeShortDramaStoryboardReferencePlan(project, plan)),
      upstreamArtifacts,
      relatedArtifactSummaries: relatedArtifacts,
      downstreamImpactSummary: usage?.usedBy.length
        ? usage.usedBy.map(item => `${item.artifactHandle} (${item.usageType})`).join(', ')
        : undefined,
      constraints: createSpecialistConstraints(artifact),
      allowedTools: createAllowedToolsFromPolicy(resolvedToolPolicy),
      toolPolicy: resolvedToolPolicy,
      forbiddenActions: resolvedToolPolicy.forbiddenActions,
    },
  };
}

export function createShortDramaStageSpecialistContextPackage(
  project: ShortDramaProject,
  workspace: ShortDramaStageWorkspace,
): ShortDramaSpecialistContextResult {
  const artifactId = resolveStageWorkspaceArtifactId(project, workspace);
  if (!artifactId) {
    return {
      status: 'error',
      error: { code: 'artifact_missing', message: 'No artifact is available for the stage workspace focus.' },
    };
  }
  const artifact = project.artifacts.find(item => item.id === artifactId);
  if (artifact && artifact.stage !== workspace.stage) {
    return {
      status: 'error',
      error: createShortDramaStageMismatchError(workspace.stage),
    };
  }

  const result = createShortDramaSpecialistContextPackage(project, artifactId, workspace.specialistAgentRole);
  if (result.status !== 'ready') {
    return result;
  }

  const focusedMedia = workspace.activeMedia ?? result.context.focusedMedia;
  const focusContext = createShortDramaFocusContextFromWorkspace({
    ...workspace,
    activeEpisodeId: workspace.stage === 'assets'
      ? undefined
      : workspace.activeEpisodeId ?? result.context.activeEpisodeId,
    activeArtifactId: workspace.activeArtifactId ?? result.context.activeArtifactId,
    activeArtifactHandle: workspace.activeArtifactHandle ?? result.context.activeArtifactHandle,
    activeMedia: focusedMedia,
  });

  return {
    status: 'ready',
    context: {
      ...result.context,
      focusContext,
      activeEpisodeId: focusContext.activeEpisodeId,
      activeArtifactId: focusContext.activeArtifactId,
      activeArtifactHandle: focusContext.activeArtifactHandle,
      focusedMedia,
    },
  };
}

export function bindShortDramaSubagentSession(
  project: ShortDramaProject,
  binding: ShortDramaSubagentBinding,
): ShortDramaProject {
  return updateArtifact(project, binding.artifactId, artifact => ({
    ...artifact,
    subagentSessionId: binding.subagentSessionId,
    parentSessionId: binding.parentSessionId,
    parentToolCallId: binding.parentToolCallId,
  }));
}

function resolveStageWorkspaceArtifactId(
  project: ShortDramaProject,
  workspace: ShortDramaStageWorkspace,
) {
  if (workspace.activeArtifactId && project.artifacts.some(artifact => artifact.id === workspace.activeArtifactId)) {
    return workspace.activeArtifactId;
  }

  if (workspace.activeArtifactHandle) {
    const artifactIndex = createShortDramaArtifactIndex(project);
    const entry = artifactIndex.find(item => item.handle === workspace.activeArtifactHandle);
    if (entry) {
      return entry.id;
    }
  }

  const stageArtifacts = project.artifacts.filter(artifact => artifact.stage === workspace.stage);
  if (workspace.stage === 'assets') {
    return stageArtifacts[0]?.id;
  }

  return stageArtifacts.find(artifact => shortDramaEpisodeMatches(project, artifact.episodeId, workspace.activeEpisodeId))?.id
    ?? stageArtifacts[0]?.id;
}

function createFallbackSpecialistToolPolicy(artifact: ShortDramaArtifact): ShortDramaToolPolicy {
  return {
    actorRole: artifact.agentRole,
    stage: artifact.stage,
    scope: 'artifact',
    permissions: [
      {
        tool: 'readShortDramaArtifact',
        capability: 'read',
        access: 'allow',
        scope: 'artifact',
        stage: artifact.stage,
        reason: 'Fallback policy only permits reading the focused artifact.',
      },
      {
        tool: 'updateShortDramaArtifactPrompt',
        capability: 'updatePrompt',
        access: 'requiresMainAIApproval',
        scope: 'artifact',
        stage: artifact.stage,
        reason: 'Prompt changes require main AI approval when the specialist policy cannot be resolved.',
      },
      {
        tool: 'deleteShortDramaArtifact',
        capability: 'delete',
        access: 'deny',
        scope: 'artifact',
        stage: artifact.stage,
        reason: 'Deletion is never available in specialist fallback policy.',
      },
    ],
    forbiddenActions: [
      'modify_other_stage_without_main_ai_dispatch',
      'read_full_chat_history',
      'overwrite_prompt_revision_history',
      'access_raw_media_without_media_summary_tool',
      'delete_artifacts_or_media',
      'dispatch_other_specialist_agents',
      'bypass_revision_attempt_history',
    ],
  };
}

function createAllowedToolsFromPolicy(policy: ShortDramaToolPolicy): string[] {
  const tools = policy.permissions
    .filter(permission => permission.access !== 'deny')
    .map(permission => compactToolName(permission.tool))
    .filter((tool): tool is string => Boolean(tool));

  return [...new Set(tools)];
}

function compactToolName(tool: string): string | undefined {
  const names: Record<string, string> = {
    searchShortDramaProjectIndex: 'searchProjectIndex',
    listShortDramaMedia: 'listMedia',
    readShortDramaMediaArtifact: 'readMediaArtifact',
    readShortDramaArtifact: 'readArtifact',
    explainShortDramaMediaArtifactChange: 'explainMediaArtifactChange',
    explainShortDramaArtifactChange: 'explainArtifactChange',
    readShortDramaScriptSegment: 'readScriptSegment',
    updateShortDramaArtifactPrompt: 'updateArtifactPrompt',
    createShortDramaAttempt: 'createAttempt',
    requestShortDramaReview: 'requestReview',
    requestShortDramaGeneration: 'requestGeneration',
    createShortDramaDispatchPlan: 'createDispatchPlan',
  };

  return names[tool];
}

export function mapShortDramaSubagentSessionLinked(
  project: ShortDramaProject,
  event: ShortDramaSubagentSessionLinkedInput,
): ShortDramaSubagentSessionLinkedResult {
  const subagentSessionId = event.sessionId ?? event.childSessionId;
  if (!subagentSessionId || !event.parentSessionId) {
    return {
      status: 'error',
      error: { code: 'unsupported_runtime', message: 'Subagent linked event is missing session fields.' },
    };
  }

  if (event.shortDrama?.projectId && event.shortDrama.projectId !== project.projectId) {
    return { status: 'ignored', reason: 'no_matching_artifact' };
  }

  const metadataArtifactId = event.shortDrama?.artifactId ?? event.shortDrama?.activeArtifactId;
  const metadataArtifactHandle = event.shortDrama?.activeArtifactHandle;
  const metadataToolCallId = event.shortDrama?.parentToolCallId;
  const resolvedByHandle = metadataArtifactHandle
    ? resolveShortDramaArtifactReference(project, metadataArtifactHandle)
    : undefined;
  const artifact = (event.artifactId ?? metadataArtifactId)
    ? project.artifacts.find(item => item.id === (event.artifactId ?? metadataArtifactId))
    : resolvedByHandle?.status === 'ready'
      ? resolvedByHandle.artifact
      : project.artifacts.find(item => item.parentToolCallId === (event.parentToolCallId ?? metadataToolCallId));

  if (!artifact) {
    return { status: 'ignored', reason: 'no_matching_artifact' };
  }
  if (event.shortDrama?.stage && artifact.stage !== event.shortDrama.stage) {
    return { status: 'ignored', reason: 'no_matching_artifact' };
  }

  return {
    status: 'ready',
    artifactId: artifact.id,
    project: bindShortDramaSubagentSession(project, {
      artifactId: artifact.id,
      subagentSessionId,
      parentSessionId: event.parentSessionId,
      parentToolCallId: event.parentToolCallId ?? metadataToolCallId ?? artifact.parentToolCallId,
    }),
  };
}

export function createShortDramaWorkspaceMediaLookup(items: ShortDramaWorkspaceMediaItem[]) {
  const byId = new Map(items.map(item => [item.id, item]));

  return {
    resolve(artifact: ShortDramaArtifact): ShortDramaMediaResolution {
      if (!artifact.mediaReference) {
        return {
          status: 'unsupported',
          error: { code: 'not_media_artifact', message: 'This artifact does not reference media.' },
        };
      }

      const mediaItem = byId.get(artifact.mediaReference.mediaItemId);
      if (!mediaItem) {
        return {
          status: 'stale',
          error: { code: 'media_missing', message: 'Referenced media is missing from the workspace.' },
        };
      }

      return { status: 'ready', mediaItem, previewUrl: mediaItem.previewUrl };
    },
  };
}

export function createShortDramaMediaPreviewViewModel(
  artifact: ShortDramaArtifact,
  lookup?: ShortDramaWorkspaceMediaLookup,
  inventoryEntry?: ShortDramaMediaArtifactIndexEntry,
): ShortDramaMediaPreviewViewModel {
  if (inventoryEntry?.mediaStatus === 'empty') {
    return {
      status: 'empty',
      kind: inventoryEntry.mediaKind,
      label: artifact.title,
    };
  }

  const reference = artifact.mediaReference;
  if (!reference) {
    return { status: 'empty' };
  }

  if (lookup) {
    const resolution = lookup.resolve(artifact);
    if (resolution.status === 'ready') {
      const previewUrl = resolution.previewUrl
        ?? resolution.mediaItem?.previewUrl
        ?? reference.previewUrl
        ?? resolution.mediaItem?.localPath
        ?? resolution.mediaItem?.filePath
        ?? reference.localPath
        ?? reference.filePath;
      if (previewUrl) {
        const thumbnailUrl = resolution.mediaItem?.thumbnailUrl
          ?? resolution.mediaItem?.previewUrl
          ?? reference.thumbnailUrl
          ?? reference.previewUrl
          ?? resolution.mediaItem?.localPath
          ?? resolution.mediaItem?.filePath
          ?? reference.localPath
          ?? reference.filePath;
        return {
          status: 'ready',
          mediaItemId: reference.mediaItemId,
          kind: reference.kind,
          label: reference.label,
          previewUrl,
          thumbnailUrl,
          localPath: resolution.mediaItem?.localPath ?? resolution.mediaItem?.filePath ?? reference.localPath ?? reference.filePath,
          filePath: resolution.mediaItem?.filePath ?? resolution.mediaItem?.localPath ?? reference.filePath ?? reference.localPath,
          relativePath: resolution.mediaItem?.relativePath ?? reference.relativePath,
          durationMs: resolution.mediaItem?.durationMs ?? reference.durationMs,
          modifiedAt: resolution.mediaItem?.modifiedAt ?? reference.modifiedAt,
          source: reference.source,
          canPlay: reference.kind === 'video' || reference.kind === 'audio',
        };
      }
    }

    if (resolution.status === 'stale' && resolution.error) {
      return {
        status: 'missing',
        mediaItemId: reference.mediaItemId,
        kind: reference.kind,
        label: reference.label,
        canPlay: false,
        error: resolution.error,
      };
    }

    if (resolution.status === 'unsupported' && resolution.error) {
      return {
        status: 'unsupported',
        mediaItemId: reference.mediaItemId,
        kind: reference.kind,
        label: reference.label,
        canPlay: false,
        error: resolution.error,
      };
    }
  }

  const previewUrl = reference.previewUrl ?? reference.localPath ?? reference.filePath;
  if (previewUrl) {
    return {
      status: 'ready',
      mediaItemId: reference.mediaItemId,
      kind: reference.kind,
      label: reference.label,
      previewUrl,
      thumbnailUrl: reference.thumbnailUrl ?? reference.previewUrl ?? reference.localPath ?? reference.filePath,
      localPath: reference.localPath ?? reference.filePath,
      filePath: reference.filePath ?? reference.localPath,
      relativePath: reference.relativePath,
      durationMs: reference.durationMs,
      modifiedAt: reference.modifiedAt,
      source: reference.source,
      canPlay: reference.kind === 'video' || reference.kind === 'audio',
    };
  }

  if (lookup) {
    return {
      status: 'referenced',
      mediaItemId: reference.mediaItemId,
      kind: reference.kind,
      label: reference.label,
      canPlay: false,
    };
  }

  return {
    status: 'missing',
    mediaItemId: reference.mediaItemId,
    kind: reference.kind,
    label: reference.label,
    canPlay: false,
    error: { code: 'media_missing', message: 'Referenced media is missing from the workspace.' },
  };
}

export function createShortDramaProjectWithRecoveredMediaReferences(
  project: ShortDramaProject,
  mediaItems: WorkspaceMediaItem[],
): ShortDramaProject {
  if (mediaItems.length === 0) {
    return project;
  }
  const mediaItemsById = new Map(mediaItems.map(item => [item.id, item]));
  const candidateMediaItems = mediaItems
    .filter(item => (
      item.source === 'generated'
      && typeof item.generationPrompt === 'string'
      && item.generationPrompt.trim().length > 0
    ))
    .sort((left, right) => (right.sortAt || right.modifiedAt || 0) - (left.sortAt || left.modifiedAt || 0));

  const usedMediaIds = new Set(
    project.artifacts
      .map(artifact => artifact.mediaReference?.mediaItemId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
  let changed = false;
  const artifacts = project.artifacts.map(artifact => {
    if (artifact.mediaReference) {
      const mediaItem = mediaItemsById.get(artifact.mediaReference.mediaItemId);
      if (
        !mediaItem
        || typeof mediaItem.modifiedAt !== 'number'
        || mediaItem.modifiedAt === artifact.mediaReference.modifiedAt
      ) {
        return artifact;
      }
      changed = true;
      return {
        ...artifact,
        mediaReference: {
          ...artifact.mediaReference,
          modifiedAt: mediaItem.modifiedAt,
        },
      };
    }
    if (!shortDramaArtifactCanRecoverMediaReference(artifact)) {
      return artifact;
    }

    const match = selectRecoveredMediaReferenceMatch(artifact, candidateMediaItems, usedMediaIds);
    if (!match) {
      return artifact;
    }

    usedMediaIds.add(match.id);
    changed = true;
    const mediaReference: ShortDramaMediaReference = {
      mediaItemId: match.id,
      kind: match.kind,
      label: artifact.title,
      localPath: match.filePath,
      filePath: match.filePath,
      relativePath: match.relativePath,
      previewUrl: match.previewUrl ?? match.generationResultUrl,
      thumbnailUrl: match.thumbnailUrl ?? match.previewUrl ?? match.generationResultUrl,
      modifiedAt: match.modifiedAt,
      source: 'generated',
    };

    return {
      ...artifact,
      mediaReference,
      status: artifact.status === 'generating' || artifact.status === 'pending'
        ? 'ready'
        : artifact.status,
    };
  });

  return changed ? { ...project, artifacts } : project;
}

function shortDramaArtifactCanRecoverMediaReference(artifact: ShortDramaArtifact): boolean {
  const expectedKind = recoveredMediaKindForArtifact(artifact);
  return Boolean(expectedKind);
}

function selectRecoveredMediaReferenceMatch(
  artifact: ShortDramaArtifact,
  mediaItems: WorkspaceMediaItem[],
  usedMediaIds: Set<string>,
): WorkspaceMediaItem | undefined {
  const expectedKind = recoveredMediaKindForArtifact(artifact);
  if (!expectedKind) {
    return undefined;
  }
  const scored = mediaItems
    .filter(item => !usedMediaIds.has(item.id))
    .filter(item => item.kind === expectedKind)
    .filter(item => recoveredMediaMatchesArtifactType(artifact, item))
    .map(item => ({
      item,
      score: scoreRecoveredMediaReferenceMatch(artifact, item),
    }))
    .filter(match => match.score >= recoveredMediaMinimumScore(artifact))
    .sort((left, right) => (
      right.score - left.score
      || (right.item.sortAt || right.item.modifiedAt || 0) - (left.item.sortAt || left.item.modifiedAt || 0)
    ));

  return scored[0]?.item;
}

function scoreRecoveredMediaReferenceMatch(artifact: ShortDramaArtifact, item: WorkspaceMediaItem): number {
  const prompt = normalizeShortDramaMediaMatchText(item.generationPrompt ?? '');
  if (!prompt) {
    return 0;
  }

  let score = 0;
  const typeCues = recoveredMediaTypeCues(artifact.type);
  if (typeCues.some(cue => prompt.includes(cue))) {
    score += 2;
  }

  for (const token of recoveredMediaArtifactTokens(artifact)) {
    if (prompt.includes(token)) {
      score += token.length >= 4 ? 3 : 2;
    }
  }

  const role = normalizeShortDramaMediaMatchText(item.generationRole ?? '');
  const expectedRole = recoveredMediaRoleCue(artifact);
  if (expectedRole && role === expectedRole) {
    score += 2;
  }
  if (artifact.stage === 'video' && prompt.includes('分镜')) {
    score += 1;
  }
  if (artifact.stage === 'storyboards' && prompt.includes('分镜')) {
    score += 2;
  }

  return score;
}

function recoveredMediaMatchesArtifactType(
  artifact: ShortDramaArtifact,
  item: WorkspaceMediaItem,
): boolean {
  if (artifact.stage !== 'assets') {
    return true;
  }
  const prompt = normalizeShortDramaMediaMatchText(item.generationPrompt ?? '');
  return recoveredMediaTypeCues(artifact.type).some(cue => prompt.includes(cue));
}

function recoveredMediaTypeCues(
  type: ShortDramaArtifact['type'],
): readonly string[] {
  return RECOVERED_MEDIA_TYPE_CUES[type] ?? [];
}

function recoveredMediaMinimumScore(artifact: ShortDramaArtifact): number {
  if (artifact.stage === 'assets') {
    return 3;
  }
  return 5;
}

function recoveredMediaKindForArtifact(artifact: ShortDramaArtifact): WorkspaceMediaItem['kind'] | undefined {
  if (artifact.stage === 'assets' && isShortDramaAssetArtifactType(artifact.type)) {
    return 'image';
  }
  if (artifact.stage === 'storyboards' && (artifact.type === 'storyboard' || artifact.type === 'image')) {
    return 'image';
  }
  if (artifact.stage === 'video' && artifact.type === 'video') {
    return 'video';
  }
  if (artifact.stage === 'post' && (artifact.type === 'final' || artifact.type === 'video' || artifact.type === 'post')) {
    return 'video';
  }
  return undefined;
}

function recoveredMediaRoleCue(artifact: ShortDramaArtifact): string | undefined {
  if (artifact.stage === 'assets') {
    return 'asset';
  }
  if (artifact.stage === 'storyboards') {
    return 'asset';
  }
  if (artifact.stage === 'video') {
    return 'clip';
  }
  if (artifact.stage === 'post') {
    return 'final';
  }
  return undefined;
}

function recoveredMediaArtifactTokens(artifact: ShortDramaArtifact): string[] {
  const values = [
    artifact.title,
    artifact.displayName,
    artifact.summary,
    artifact.handle,
    artifact.sourceStoryboard,
  ];
  const stopWords = new Set([
    '第一集',
    '第二集',
    '第三集',
    '造型',
    '设定',
    '资产',
    '关键信物',
    '出场道具',
  ]);
  const tokens = new Set<string>();
  for (const value of values) {
    const normalized = normalizeShortDramaMediaMatchText(value);
    if (!normalized) continue;
    for (const token of normalized.split(/[|｜/、，,：:；;（）()\s]+/)) {
      if (token.length < 2 || stopWords.has(token)) continue;
      tokens.add(token);
      for (const segment of splitRecoveredMediaTokenSegments(token)) {
        if (segment.length >= 2 && !stopWords.has(segment)) {
          tokens.add(segment);
        }
      }
    }
  }
  return [...tokens].sort((left, right) => right.length - left.length);
}

function splitRecoveredMediaTokenSegments(token: string): string[] {
  if (!/[\u4e00-\u9fff]/.test(token) || token.length < 4) {
    return [];
  }
  const segments = new Set<string>();
  const maxLength = Math.min(4, token.length);
  for (let length = 2; length <= maxLength; length += 1) {
    for (let index = 0; index + length <= token.length; index += 1) {
      segments.add(token.slice(index, index + length));
    }
  }
  return [...segments];
}

function normalizeShortDramaMediaMatchText(value: string | undefined): string {
  return typeof value === 'string'
    ? value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
    : '';
}

export function selectShortDramaPostFinalPreviewArtifact(
  episodeArtifacts: ShortDramaArtifact[],
  mediaEntriesByArtifactId: ReadonlyMap<string, ShortDramaMediaArtifactIndexEntry>,
): ShortDramaArtifact | undefined {
  const postArtifacts = episodeArtifacts.filter(artifact => artifact.stage === 'post');
  const postVideoArtifacts = postArtifacts.filter(artifact => isVideoPreviewCandidate(artifact, mediaEntriesByArtifactId));

  return postVideoArtifacts.find(artifact => mediaEntriesByArtifactId.get(artifact.id)?.mediaStatus === 'ready')
    ?? postVideoArtifacts[0]
    ?? episodeArtifacts.find(artifact => mediaEntriesByArtifactId.get(artifact.id)?.mediaKind === 'video');
}

function isVideoPreviewCandidate(
  artifact: ShortDramaArtifact,
  mediaEntriesByArtifactId: ReadonlyMap<string, ShortDramaMediaArtifactIndexEntry>,
): boolean {
  const mediaEntry = mediaEntriesByArtifactId.get(artifact.id);
  return artifact.mediaReference?.kind === 'video'
    || mediaEntry?.mediaKind === 'video'
    || artifact.type === 'video';
}

export function createShortDramaArtifactCardViewModel(
  artifact: ShortDramaArtifact,
): ShortDramaArtifactCardViewModel {
  if (!artifact.mediaReference) {
    return { artifact, media: { status: 'none' } };
  }

  return {
    artifact,
    media: {
      status: 'referenced',
      mediaItemId: artifact.mediaReference.mediaItemId,
      kind: artifact.mediaReference.kind,
      label: artifact.mediaReference.label,
    },
  };
}

export function createShortDramaRecoveryGuidance(error?: ShortDramaError): ShortDramaRecoveryGuidance {
  if (!error) {
    return recoveryGuidance('noProject');
  }

  if (error.code === 'missing_workspace') {
    return recoveryGuidance('missingWorkspace');
  }
  if (error.code === 'remote_workspace' || error.code === 'unsupported_runtime') {
    return recoveryGuidance('remoteWorkspace');
  }
  if (
    error.code === 'load_failed'
    || error.code === 'version_incompatible'
    || error.code === 'manifest_missing'
    || error.code === 'manifest_invalid'
  ) {
    return recoveryGuidance('loadFailed');
  }
  if (error.code === 'save_failed') {
    return recoveryGuidance('saveFailed');
  }
  if (error.code === 'media_missing' || error.code === 'not_media_artifact') {
    return recoveryGuidance('mediaMissing');
  }

  return recoveryGuidance('loadFailed');
}

export async function writeShortDramaManifest(
  adapter: ShortDramaManifestAdapter,
  project: ShortDramaProject,
): Promise<ShortDramaManifestState> {
  if (adapter.kind === 'remote') {
    return {
      status: 'unsupported',
      source: 'manifest',
      error: { code: 'remote_workspace', message: 'Remote short drama manifests are not supported yet.' },
    };
  }

  const now = Date.now();
  const manifest: ShortDramaManifest = {
    manifestVersion: SHORT_DRAMA_MANIFEST_VERSION,
    projectId: project.projectId,
    title: project.title,
    status: project.status,
    activeStage: project.activeStage,
    activeEpisodeId: project.activeEpisodeId,
    createdAt: now,
    updatedAt: now,
    indexVersions: {
      artifact: SHORT_DRAMA_INDEX_VERSION,
      media: SHORT_DRAMA_INDEX_VERSION,
      scriptSegment: SHORT_DRAMA_INDEX_VERSION,
      search: SHORT_DRAMA_INDEX_VERSION,
    },
    project,
  };
  try {
    await adapter.write(createManifestKey(project.projectId), JSON.stringify(manifest));
    await writeShortDramaSourceFiles(adapter, project);
    await writeShortDramaDerivedIndexes(adapter, project);
    return { status: 'ready', source: 'manifest', project };
  } catch (error) {
    return {
      status: 'error',
      source: 'manifest',
      error: { code: 'save_failed', message: 'Short drama manifest could not be saved.', cause: error },
    };
  }
}

export async function initializeShortDramaWorkspaceProject(
  adapter: ShortDramaManifestAdapter,
  options: ShortDramaWorkspaceProjectInitOptions,
): Promise<ShortDramaWorkspaceProjectInitResult> {
  if (adapter.kind === 'remote') {
    return {
      status: 'unsupported',
      source: 'manifest',
      error: { code: 'remote_workspace', message: 'Remote short drama manifests are not supported yet.' },
    };
  }

  const existing = await readShortDramaManifest(adapter, options.projectId ?? 'short_drama_project');
  if (existing.status === 'ready' && !options.overwriteExisting) {
    return {
      status: 'protected',
      source: 'manifest',
      reason: 'project_exists',
      existingProjectId: existing.project.projectId,
    };
  }
  if (existing.status === 'unsupported' || existing.status === 'error') {
    return existing;
  }

  const timestamp = options.timestamp ?? Date.now();
  const project = options.kind === 'demo'
    ? createInitializedProjectAuditEvent(
        createShortDramaStaticProject({ episodeCount: options.demoEpisodeCount }),
        'Initialized demo short drama fixture.',
        timestamp,
      )
    : createInitializedProjectAuditEvent(
        createWorkspaceInitializedProject(options, timestamp),
        options.kind === 'script'
          ? 'Initialized short drama project from script content.'
          : 'Initialized empty short drama project.',
        timestamp,
      );
  const save = await writeShortDramaManifest(adapter, project);
  if (save.status === 'unsupported' || save.status === 'error') {
    return save;
  }
  if (save.status === 'empty') {
    return {
      status: 'error',
      source: 'manifest',
      error: { code: 'save_failed', message: 'Short drama project initialization did not produce a saved manifest.' },
    };
  }

  return {
    status: 'ready',
    source: 'manifest',
    action: 'initialized',
    project: save.project,
  };
}

export async function migrateShortDramaLegacyProjectPath(
  adapter: ShortDramaManifestAdapter,
  options: ShortDramaLegacyProjectMigrationOptions,
): Promise<ShortDramaLegacyProjectMigrationResult> {
  if (adapter.kind === 'remote') {
    return {
      status: 'unsupported',
      source: 'manifest',
      error: { code: 'remote_workspace', message: 'Remote short drama manifests are not supported yet.' },
    };
  }

  const existing = await readShortDramaManifest(adapter, options.projectId);
  if (existing.status === 'ready' && !options.overwriteExisting) {
    return {
      status: 'protected',
      source: 'manifest',
      reason: 'project_exists',
      existingProjectId: existing.project.projectId,
    };
  }
  if (existing.status === 'unsupported' || existing.status === 'error') {
    return existing;
  }

  let raw: string | undefined;
  try {
    raw = await adapter.read(createLegacyManifestKey(options.projectId));
  } catch (error) {
    return {
      status: 'error',
      source: 'manifest',
      error: { code: 'load_failed', message: 'Legacy short drama manifest could not be read.', cause: error },
    };
  }

  if (!raw) {
    return { status: 'empty', source: 'manifest', reason: 'legacy_project_missing' };
  }

  try {
    const parse = parseLegacyShortDramaProjectManifest(JSON.parse(raw) as unknown);
    if (parse.status === 'error') {
      return parse;
    }

    const project = createInitializedProjectAuditEvent(
      await readShortDramaLegacySourceFiles(adapter, parse.project),
      `Migrated legacy short drama project path for ${options.projectId}.`,
      options.timestamp ?? Date.now(),
    );
    const save = await writeShortDramaManifest(adapter, project);
    if (save.status === 'unsupported' || save.status === 'error') {
      return save;
    }
    if (save.status === 'empty') {
      return {
        status: 'error',
        source: 'manifest',
        error: { code: 'save_failed', message: 'Short drama project migration did not produce a saved manifest.' },
      };
    }

    return {
      status: 'ready',
      source: 'manifest',
      action: 'migrated',
      project: save.project,
    };
  } catch (error) {
    return {
      status: 'error',
      source: 'manifest',
      error: { code: 'load_failed', message: 'Legacy short drama manifest could not be parsed.', cause: error },
    };
  }
}

async function writeShortDramaSourceFiles(
  adapter: ShortDramaManifestAdapter,
  project: ShortDramaProject,
) {
  await adapter.write(createScriptDocumentKey(project.projectId), project.scriptDocument?.content ?? createFallbackScriptMarkdown(project));
  for (const artifact of project.artifacts) {
    if (isShortDramaAssetArtifact(artifact)) {
      await adapter.write(createAssetSourceKey(project.projectId, artifact.id), JSON.stringify(artifact));
    } else {
      await adapter.write(createArtifactSourceKey(project.projectId, artifact.id), JSON.stringify(artifact));
    }
    await adapter.write(createArtifactRevisionsKey(project.projectId, artifact.id), JSON.stringify(artifact.revisions));
    await adapter.write(createArtifactAttemptsKey(project.projectId, artifact.id), JSON.stringify(artifact.attempts));
  }
  await adapter.write(createAuditLogKey(project.projectId), createShortDramaAuditLogJsonl(project));
}

async function writeShortDramaDerivedIndexes(
  adapter: ShortDramaManifestAdapter,
  project: ShortDramaProject,
) {
  try {
    await adapter.write(createDerivedArtifactIndexKey(project.projectId), JSON.stringify({
      cacheVersion: SHORT_DRAMA_INDEX_VERSION,
      source: 'derived',
      projectId: project.projectId,
      generatedAt: Date.now(),
      entries: createShortDramaArtifactIndex(project),
    }));
    await adapter.write(createDerivedMediaIndexKey(project.projectId), JSON.stringify({
      cacheVersion: SHORT_DRAMA_INDEX_VERSION,
      source: 'derived',
      projectId: project.projectId,
      generatedAt: Date.now(),
      entries: createShortDramaMediaArtifactIndex(project),
    }));
    await adapter.write(createDerivedScriptSegmentIndexKey(project.projectId), JSON.stringify({
      cacheVersion: SHORT_DRAMA_INDEX_VERSION,
      source: 'derived',
      projectId: project.projectId,
      generatedAt: Date.now(),
      entries: createShortDramaScriptSegmentIndex(project),
    }));
    await adapter.write(createDerivedSearchIndexKey(project.projectId), JSON.stringify({
      cacheVersion: SHORT_DRAMA_INDEX_VERSION,
      source: 'derived',
      projectId: project.projectId,
      generatedAt: Date.now(),
      entries: createShortDramaSearchIndex(project),
    }));
  } catch {
    // Derived indexes are rebuildable caches. A cache write failure must not
    // make the manifest source of truth look unsaved.
  }
}

export async function readShortDramaManifest(
  adapter: ShortDramaManifestAdapter,
  projectId: string,
): Promise<ShortDramaManifestState> {
  if (adapter.kind === 'remote') {
    return {
      status: 'unsupported',
      source: 'manifest',
      error: { code: 'remote_workspace', message: 'Remote short drama manifests are not supported yet.' },
    };
  }

  let raw: string | undefined;
  try {
    raw = await adapter.read(createManifestKey(projectId));
  } catch (error) {
    return {
      status: 'error',
      source: 'manifest',
      error: { code: 'load_failed', message: 'Short drama manifest could not be read.', cause: error },
    };
  }

  if (!raw) {
    return { status: 'empty', source: 'manifest', reason: 'no_project' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    return {
      status: 'error',
      source: 'manifest',
      error: { code: 'manifest_invalid', message: 'Short drama manifest is not valid JSON.', cause: error },
    };
  }

  try {
    const validation = validateShortDramaManifestProject(parsed);
    if (validation.status === 'error') {
      return validation;
    }

    const project = validation.schemaKind === 'runtime-flat-v1'
      ? await readShortDramaRuntimeFlatSourceFiles(adapter, validation.project)
      : await readShortDramaSourceFiles(adapter, validation.project);
    await writeShortDramaDerivedIndexes(adapter, project);

    return {
      status: 'ready',
      source: 'manifest',
      project,
    };
  } catch (error) {
    return {
      status: 'error',
      source: 'manifest',
      error: { code: 'load_failed', message: 'Short drama manifest could not be parsed.', cause: error },
    };
  }
}

function validateShortDramaManifestProject(candidate: unknown):
  | { status: 'ready'; schemaKind: 'ui-envelope-v1' | 'runtime-flat-v1'; project: ShortDramaProject }
  | Extract<ShortDramaManifestState, { status: 'error' }> {
  const envelope = validateShortDramaManifest(candidate);
  if (envelope.status === 'ready') {
    return {
      status: 'ready',
      schemaKind: 'ui-envelope-v1',
      project: envelope.manifest.project,
    };
  }

  const runtimeFlat = validateRuntimeFlatShortDramaManifest(candidate);
  if (runtimeFlat.status === 'ready') {
    return runtimeFlat;
  }

  return envelope.error.code === 'version_incompatible' ? envelope : runtimeFlat;
}

function validateShortDramaManifest(candidate: unknown):
  | { status: 'ready'; manifest: ShortDramaManifest }
  | Extract<ShortDramaManifestState, { status: 'error' }> {
  if (!isRecord(candidate)) {
    return createManifestInvalidError('Short drama manifest must be a JSON object.');
  }

  if (candidate.manifestVersion !== SHORT_DRAMA_MANIFEST_VERSION) {
    return {
      status: 'error',
      source: 'manifest',
      error: { code: 'version_incompatible', message: 'Manifest version is not supported.' },
    };
  }

  const requiredFields = [
    'projectId',
    'title',
    'status',
    'activeStage',
    'createdAt',
    'updatedAt',
    'indexVersions',
    'project',
  ];
  const missingField = requiredFields.find(field => !(field in candidate) || candidate[field] === undefined || candidate[field] === null);
  if (missingField) {
    return createManifestInvalidError(`Short drama manifest is missing required field: ${missingField}.`);
  }

  if (typeof candidate.projectId !== 'string' || candidate.projectId.trim().length === 0) {
    return createManifestInvalidError('Short drama manifest projectId must be a non-empty string.');
  }
  if (typeof candidate.title !== 'string' || candidate.title.trim().length === 0) {
    return createManifestInvalidError('Short drama manifest title must be a non-empty string.');
  }
  if (!SHORT_DRAMA_VALID_PROJECT_STATUSES.includes(candidate.status as ShortDramaProjectStatus)) {
    return createManifestInvalidError('Short drama manifest status is not supported.');
  }
  if (!STAGES.includes(candidate.activeStage as ShortDramaStage)) {
    return createManifestInvalidError('Short drama manifest activeStage is not supported.');
  }
  if (candidate.activeEpisodeId !== undefined && typeof candidate.activeEpisodeId !== 'string') {
    return createManifestInvalidError('Short drama manifest activeEpisodeId must be a string when present.');
  }
  if (typeof candidate.createdAt !== 'number' || typeof candidate.updatedAt !== 'number') {
    return createManifestInvalidError('Short drama manifest timestamps must be numbers.');
  }
  if (!isRecord(candidate.indexVersions)) {
    return createManifestInvalidError('Short drama manifest indexVersions must be an object.');
  }
  if (!isRecord(candidate.project)) {
    return createManifestInvalidError('Short drama manifest project must be an object.');
  }
  if (candidate.project.projectId !== candidate.projectId) {
    return createManifestInvalidError('Short drama manifest projectId must match the project source identity.');
  }

  return { status: 'ready', manifest: candidate as unknown as ShortDramaManifest };
}

function validateRuntimeFlatShortDramaManifest(candidate: unknown):
  | { status: 'ready'; schemaKind: 'runtime-flat-v1'; project: ShortDramaProject }
  | Extract<ShortDramaManifestState, { status: 'error' }> {
  if (!isRecord(candidate)) {
    return createManifestInvalidError('Short drama manifest must be a JSON object.');
  }

  if (candidate.manifestVersion !== SHORT_DRAMA_MANIFEST_VERSION) {
    return {
      status: 'error',
      source: 'manifest',
      error: { code: 'version_incompatible', message: 'Manifest version is not supported.' },
    };
  }

  const requiredFields = [
    'projectId',
    'title',
    'status',
    'activeStage',
    'createdAt',
    'updatedAt',
    'episodes',
  ];
  const missingField = requiredFields.find(field => !(field in candidate) || candidate[field] === undefined || candidate[field] === null);
  if (missingField) {
    return createManifestInvalidError(`Short drama runtime manifest is missing required field: ${missingField}.`);
  }

  if (typeof candidate.projectId !== 'string' || candidate.projectId.trim().length === 0) {
    return createManifestInvalidError('Short drama runtime manifest projectId must be a non-empty string.');
  }
  if (typeof candidate.title !== 'string' || candidate.title.trim().length === 0) {
    return createManifestInvalidError('Short drama runtime manifest title must be a non-empty string.');
  }
  if (!SHORT_DRAMA_VALID_PROJECT_STATUSES.includes(candidate.status as ShortDramaProjectStatus)) {
    return createManifestInvalidError('Short drama runtime manifest status is not supported.');
  }
  if (!STAGES.includes(candidate.activeStage as ShortDramaStage)) {
    return createManifestInvalidError('Short drama runtime manifest activeStage is not supported.');
  }
  if (candidate.activeEpisodeId !== undefined && typeof candidate.activeEpisodeId !== 'string') {
    return createManifestInvalidError('Short drama runtime manifest activeEpisodeId must be a string when present.');
  }
  if (typeof candidate.createdAt !== 'number' || typeof candidate.updatedAt !== 'number') {
    return createManifestInvalidError('Short drama runtime manifest timestamps must be numbers.');
  }
  if (!Array.isArray(candidate.episodes)) {
    return createManifestInvalidError('Short drama runtime manifest episodes must be an array.');
  }

  const episodes = candidate.episodes
    .filter(isRuntimeEpisode)
    .map(episode => ({
      id: episode.id,
      number: episode.number,
      title: episode.title,
      summary: episode.summary,
      duration: typeof episode.duration === 'string' ? episode.duration : undefined,
    }));
  if (episodes.length !== candidate.episodes.length) {
    return createManifestInvalidError('Short drama runtime manifest episodes contain unsupported entries.');
  }

  const artifacts = Array.isArray(candidate.artifacts)
    ? normalizeRuntimeArtifacts(candidate.artifacts)
    : isRecord(candidate.project) && Array.isArray(candidate.project.artifacts)
      ? normalizeRuntimeArtifacts(candidate.project.artifacts)
      : [];

  return {
    status: 'ready',
    schemaKind: 'runtime-flat-v1',
    project: {
      projectId: candidate.projectId,
      title: candidate.title,
      status: candidate.status as ShortDramaProjectStatus,
      activeStage: candidate.activeStage as ShortDramaStage,
      activeEpisodeId: typeof candidate.activeEpisodeId === 'string' ? candidate.activeEpisodeId : episodes[0]?.id,
      episodes,
      artifacts,
      productionPlan: createRuntimeFlatProductionPlan(episodes),
      scriptDocument: undefined,
      storyboardReferencePlans: Array.isArray(candidate.storyboardReferencePlans)
        ? candidate.storyboardReferencePlans as ShortDramaProject['storyboardReferencePlans']
        : [],
      changeRequests: [],
    },
  };
}

function parseLegacyShortDramaProjectManifest(candidate: unknown):
  | { status: 'ready'; project: ShortDramaProject }
  | Extract<ShortDramaLegacyProjectMigrationResult, { status: 'error' }> {
  const validation = validateShortDramaManifest(candidate);
  if (validation.status === 'ready') {
    return { status: 'ready', project: validation.manifest.project };
  }

  if (isRecord(candidate) && isRecord(candidate.project)) {
    const project = candidate.project as unknown as ShortDramaProject;
    if (typeof project.projectId === 'string' && Array.isArray(project.episodes) && Array.isArray(project.artifacts)) {
      return { status: 'ready', project };
    }
  }

  return {
    status: 'error',
    source: 'manifest',
    error: { code: 'manifest_invalid', message: 'Legacy short drama manifest is not a supported project envelope.' },
  };
}

function createManifestInvalidError(message: string): Extract<ShortDramaManifestState, { status: 'error' }> {
  return {
    status: 'error',
    source: 'manifest',
    error: { code: 'manifest_invalid', message },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRuntimeEpisode(value: unknown): value is ShortDramaProject['episodes'][number] {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.number === 'number'
    && typeof value.title === 'string'
    && typeof value.summary === 'string';
}

function normalizeRuntimeArtifacts(values: unknown[]): ShortDramaArtifact[] {
  return values
    .filter(isRecord)
    .map((value, index) => normalizeRuntimeArtifact(value, index));
}

function normalizeRuntimeArtifact(value: Record<string, unknown>, index: number): ShortDramaArtifact {
  const stage = STAGES.includes(value.stage as ShortDramaStage)
    ? value.stage as ShortDramaStage
    : 'script';
  const artifactType = normalizeRuntimeArtifactType(value, stage);
  const revisions = Array.isArray(value.revisions)
    ? value.revisions as ShortDramaArtifact['revisions']
    : [];
  const attempts = Array.isArray(value.attempts)
    ? value.attempts as ShortDramaArtifact['attempts']
    : [];

  return {
    ...value,
    id: stringValue(value.id, `runtime-artifact-${index + 1}`),
    handle: stringValue(value.handle, `RUNTIME-${index + 1}`),
    displayName: stringValue(value.displayName, stringValue(value.title, `Runtime artifact ${index + 1}`)),
    episodeId: stringValue(value.episodeId, 'episode-01'),
    stage,
    type: artifactType,
    title: stringValue(value.title, stringValue(value.displayName, `Runtime artifact ${index + 1}`)),
    summary: stringValue(value.summary, ''),
    agentRole: stringValue(value.agentRole, defaultAgentRoleForStage(stage)) as ShortDramaArtifact['agentRole'],
    status: STATUSES.includes(value.status as ShortDramaArtifactStatus)
      ? value.status as ShortDramaArtifactStatus
      : 'pending',
    revisionCount: typeof value.revisionCount === 'number' ? value.revisionCount : revisions.length,
    attemptCount: typeof value.attemptCount === 'number' ? value.attemptCount : attempts.length,
    revisions,
    attempts,
  } as ShortDramaArtifact;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function normalizeRuntimeArtifactType(
  value: Record<string, unknown>,
  stage: ShortDramaStage,
): ShortDramaArtifact['type'] {
  const explicitType = stringValue(value.type, '');
  const artifactType = stringValue(value.artifactType, '');

  if (stage === 'assets') {
    if (isShortDramaAssetArtifactType(artifactType)) {
      return artifactType;
    }
    if (isShortDramaAssetArtifactType(explicitType)) {
      return explicitType;
    }
    return inferRuntimeAssetArtifactType(value) ?? 'character';
  }

  const candidate = explicitType || artifactType;
  const stageType = normalizeRuntimeStageArtifactType(stage, candidate);
  if (stageType) {
    return stageType;
  }
  if (isShortDramaArtifactType(candidate)) {
    return candidate;
  }

  return defaultArtifactTypeForStage(stage);
}

function isShortDramaArtifactType(value: string): value is ShortDramaArtifact['type'] {
  return [
    'script',
    'character',
    'location',
    'prop',
    'image',
    'storyboard',
    'video',
    'subtitle',
    'audio',
    'final',
  ].includes(value);
}

function isShortDramaAssetArtifactType(value: string): value is ShortDramaArtifact['type'] {
  return value === 'character' || value === 'location' || value === 'prop';
}

function normalizeRuntimeStageArtifactType(
  stage: ShortDramaStage,
  value: string,
): ShortDramaArtifact['type'] | undefined {
  const normalized = value.trim().toLowerCase();
  if (stage === 'storyboards' && (
    !normalized
    || ['image', 'storyboard', 'storyboard_image', 'keyframe', 'shot'].includes(normalized)
  )) {
    return 'storyboard';
  }
  if (stage === 'video' && (
    !normalized
    || ['video', 'clip', 'generated_video', 'media', 'shot_video'].includes(normalized)
  )) {
    return 'video';
  }
  if (stage === 'post') {
    if (!normalized || ['post', 'edit', 'editing'].includes(normalized)) {
      return 'post';
    }
    if (['video', 'final', 'final_video', 'master', 'movie'].includes(normalized)) {
      return 'final';
    }
    if (['subtitle', 'subtitles', 'captions'].includes(normalized)) {
      return 'subtitle';
    }
    if (['audio', 'sound', 'sfx', 'music'].includes(normalized)) {
      return 'audio';
    }
  }
  return undefined;
}

function pendingGenerationMatchesStage(
  item: WorkspaceMediaPendingGeneration,
  stage: ShortDramaStage,
): boolean {
  if (item.targetStage) {
    return item.targetStage === stage;
  }
  return false;
}

function shortDramaArtifactHasMediaPreview(
  artifact: ShortDramaArtifact,
  mediaEntry?: ShortDramaMediaArtifactIndexEntry,
): boolean {
  if (artifact.mediaReference) {
    return true;
  }
  return Boolean(mediaEntry && mediaEntry.mediaStatus !== 'empty');
}

function shortDramaGeneratedBatchIdFromMediaItemId(mediaItemId: string): string | undefined {
  const match = /^(media_batch_[^-]+)-\d+$/.exec(mediaItemId);
  return match?.[1];
}

function shortDramaEpisodeMatches(
  project: ShortDramaProject,
  artifactEpisodeId: string | undefined,
  targetEpisodeId: string | undefined,
): boolean {
  if (!artifactEpisodeId || !targetEpisodeId) {
    return false;
  }
  if (artifactEpisodeId === targetEpisodeId) {
    return true;
  }

  const artifactEpisodeNumber = shortDramaEpisodeNumberFromId(project, artifactEpisodeId);
  const targetEpisodeNumber = shortDramaEpisodeNumberFromId(project, targetEpisodeId);
  return artifactEpisodeNumber !== undefined
    && targetEpisodeNumber !== undefined
    && artifactEpisodeNumber === targetEpisodeNumber;
}

function resolveShortDramaEpisode(
  project: ShortDramaProject,
  episodeId: string | undefined,
): ShortDramaProject['episodes'][number] | undefined {
  if (!episodeId) {
    return undefined;
  }
  const exactEpisode = project.episodes.find(episode => episode.id === episodeId);
  if (exactEpisode) {
    return exactEpisode;
  }

  const episodeNumber = shortDramaEpisodeNumberFromId(project, episodeId);
  return episodeNumber === undefined
    ? undefined
    : project.episodes.find(episode => episode.number === episodeNumber);
}

function shortDramaEpisodeNumberFromId(project: ShortDramaProject, episodeId: string): number | undefined {
  const exactEpisode = project.episodes.find(episode => episode.id === episodeId);
  if (exactEpisode) {
    return exactEpisode.number;
  }

  const normalized = episodeId.trim().toLowerCase();
  const patterns = [
    /^episode[-_\s]*0*(\d+)$/i,
    /^ep[-_\s]*0*(\d+)$/i,
    /^e[-_\s]*0*(\d+)$/i,
    /^0*(\d+)$/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    if (match) {
      return Number(match[1]);
    }
  }

  return undefined;
}

function inferRuntimeAssetArtifactType(value: Record<string, unknown>): ShortDramaArtifact['type'] | undefined {
  const searchable = [
    value.handle,
    value.id,
    value.displayName,
    value.title,
    value.summary,
  ]
    .filter((item): item is string => typeof item === 'string')
    .join(' ')
    .toLowerCase();

  if (/(^|\b)(char|character)[-_]?\d*/i.test(searchable) || searchable.includes('角色')) {
    return 'character';
  }
  if (/(^|\b)(loc|location|scene)[-_]?\d*/i.test(searchable) || searchable.includes('场景') || searchable.includes('地点')) {
    return 'location';
  }
  if (/(^|\b)(prop)[-_]?\d*/i.test(searchable) || searchable.includes('道具')) {
    return 'prop';
  }
  return undefined;
}

function defaultArtifactTypeForStage(stage: ShortDramaStage): ShortDramaArtifact['type'] {
  if (stage === 'assets') return 'character';
  if (stage === 'storyboards') return 'storyboard';
  if (stage === 'video') return 'video';
  if (stage === 'post') return 'post';
  return 'script';
}

function defaultAgentRoleForStage(stage: ShortDramaStage): ShortDramaArtifact['agentRole'] {
  if (stage === 'assets' || stage === 'storyboards') return 'image';
  if (stage === 'video') return 'video';
  if (stage === 'post') return 'post';
  return 'director';
}

function createRuntimeFlatProductionPlan(
  episodes: ShortDramaProject['episodes'],
): ShortDramaProductionPlan {
  const episodeIds = episodes.map(episode => episode.id);
  const firstEpisode = episodes[0];
  const lastEpisode = episodes[episodes.length - 1];
  const episodeRange = firstEpisode && lastEpisode
    ? `Episode ${String(firstEpisode.number).padStart(2, '0')}-${String(lastEpisode.number).padStart(2, '0')}`
    : '';

  return {
    status: 'pending',
    mode: 'semiAutomatic',
    goal: 'Runtime initialized short drama project.',
    episodeRange,
    steps: STAGES.map(stage => ({
      id: `step-${stage}`,
      stage,
      episodeIds,
      status: stage === 'script' ? 'pending' : 'blocked',
      summary: `${stage} workspace scaffold.`,
    })),
  };
}

async function readShortDramaSourceFiles(
  adapter: ShortDramaManifestAdapter,
  project: ShortDramaProject,
): Promise<ShortDramaProject> {
  const scriptContent = await adapter.read(createScriptDocumentKey(project.projectId));
  const artifacts = await Promise.all(project.artifacts.map(async artifact => {
    const artifactContent = await adapter.read(isShortDramaAssetArtifact(artifact)
      ? createAssetSourceKey(project.projectId, artifact.id)
      : createArtifactSourceKey(project.projectId, artifact.id));
    const artifactSource = artifactContent
      ? JSON.parse(artifactContent) as ShortDramaArtifact
      : artifact;
    const revisionsContent = await adapter.read(createArtifactRevisionsKey(project.projectId, artifact.id));
    const attemptsContent = await adapter.read(createArtifactAttemptsKey(project.projectId, artifact.id));
    const revisions = revisionsContent
      ? JSON.parse(revisionsContent) as ShortDramaArtifact['revisions']
      : artifactSource.revisions;
    const attempts = attemptsContent
      ? JSON.parse(attemptsContent) as ShortDramaArtifact['attempts']
      : artifactSource.attempts;

    return {
      ...artifactSource,
      revisions,
      attempts,
      revisionCount: revisions.length,
      attemptCount: attempts.length,
    };
  }));

  return {
    ...project,
    scriptDocument: scriptContent === undefined
      ? project.scriptDocument
      : {
          ...project.scriptDocument,
          kind: 'markdown',
          content: scriptContent,
        },
    artifacts,
  };
}

async function readShortDramaRuntimeFlatSourceFiles(
  adapter: ShortDramaManifestAdapter,
  project: ShortDramaProject,
): Promise<ShortDramaProject> {
  const scriptContent = await adapter.read(createScriptDocumentKey(project.projectId));
  const artifactIndexContent = await adapter.read(createDerivedArtifactIndexKey(project.projectId));
  const indexedArtifacts = parseRuntimeFlatArtifactIndex(artifactIndexContent);
  const artifacts = await readShortDramaArtifactSourceFiles(
    adapter,
    project.projectId,
    mergeRuntimeFlatArtifacts(project.artifacts, indexedArtifacts),
  );

  return {
    ...project,
    scriptDocument: scriptContent === undefined
      ? project.scriptDocument
      : {
          ...project.scriptDocument,
          kind: 'markdown',
          content: scriptContent,
        },
    artifacts,
  };
}

async function readShortDramaArtifactSourceFiles(
  adapter: ShortDramaManifestAdapter,
  projectId: string,
  artifacts: ShortDramaArtifact[],
): Promise<ShortDramaArtifact[]> {
  return Promise.all(artifacts.map(async artifact => {
    const artifactContent = await adapter.read(isShortDramaAssetArtifact(artifact)
      ? createAssetSourceKey(projectId, artifact.id)
      : createArtifactSourceKey(projectId, artifact.id));
    const artifactSource = artifactContent
      ? normalizeRuntimeArtifact(JSON.parse(artifactContent) as Record<string, unknown>, 0)
      : artifact;
    const revisionsContent = await adapter.read(createArtifactRevisionsKey(projectId, artifact.id));
    const attemptsContent = await adapter.read(createArtifactAttemptsKey(projectId, artifact.id));
    const revisions = revisionsContent
      ? JSON.parse(revisionsContent) as ShortDramaArtifact['revisions']
      : artifactSource.revisions;
    const attempts = attemptsContent
      ? JSON.parse(attemptsContent) as ShortDramaArtifact['attempts']
      : artifactSource.attempts;

    return {
      ...artifactSource,
      revisions,
      attempts,
      revisionCount: revisions.length,
      attemptCount: attempts.length,
    };
  }));
}

function mergeRuntimeFlatArtifacts(
  manifestArtifacts: ShortDramaArtifact[],
  indexedArtifacts: ShortDramaArtifact[],
): ShortDramaArtifact[] {
  const merged = new Map<string, ShortDramaArtifact>();
  for (const artifact of indexedArtifacts) {
    merged.set(artifact.id, artifact);
  }
  for (const artifact of manifestArtifacts) {
    // The manifest and source files are the workspace fact source. Derived
    // indexes may be stale, so they can add missing entries but must not erase
    // or override manifest-owned asset anchors.
    merged.set(artifact.id, artifact);
  }
  return Array.from(merged.values());
}

function parseRuntimeFlatArtifactIndex(content?: string): ShortDramaArtifact[] {
  if (!content) {
    return [];
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) {
      return normalizeRuntimeArtifacts(parsed);
    }
    if (isRecord(parsed) && Array.isArray(parsed.entries)) {
      return normalizeRuntimeArtifacts(parsed.entries);
    }
    return [];
  } catch {
    return [];
  }
}

async function readShortDramaLegacySourceFiles(
  adapter: ShortDramaManifestAdapter,
  project: ShortDramaProject,
): Promise<ShortDramaProject> {
  const scriptContent = await adapter.read(createLegacyScriptDocumentKey(project.projectId));
  const artifacts = await Promise.all(project.artifacts.map(async artifact => {
    const artifactContent = await adapter.read(isShortDramaAssetArtifact(artifact)
      ? createLegacyAssetSourceKey(project.projectId, artifact.id)
      : createLegacyArtifactSourceKey(project.projectId, artifact.id));
    const artifactSource = artifactContent
      ? JSON.parse(artifactContent) as ShortDramaArtifact
      : artifact;
    const revisionsContent = await adapter.read(createLegacyArtifactRevisionsKey(project.projectId, artifact.id));
    const attemptsContent = await adapter.read(createLegacyArtifactAttemptsKey(project.projectId, artifact.id));
    const revisions = revisionsContent
      ? JSON.parse(revisionsContent) as ShortDramaArtifact['revisions']
      : artifactSource.revisions;
    const attempts = attemptsContent
      ? JSON.parse(attemptsContent) as ShortDramaArtifact['attempts']
      : artifactSource.attempts;

    return {
      ...artifactSource,
      revisions,
      attempts,
      revisionCount: revisions.length,
      attemptCount: attempts.length,
    };
  }));

  return {
    ...project,
    scriptDocument: scriptContent === undefined
      ? project.scriptDocument
      : {
          ...project.scriptDocument,
          kind: 'markdown',
          content: scriptContent,
        },
    artifacts,
  };
}

export interface ShortDramaManifestLibraryService extends ShortDramaLibraryService {
  saveProject(project: ShortDramaProject): Promise<ShortDramaManifestState>;
}

export function createShortDramaManifestLibraryService(
  adapter: ShortDramaManifestAdapter,
  projectId: string,
): ShortDramaManifestLibraryService {
  return {
    async loadProject(workspacePath?: string): Promise<ShortDramaLibraryState> {
      if (!workspacePath?.trim()) {
        return {
          status: 'unsupported',
          source: 'manifest',
          error: { code: 'missing_workspace', message: 'A workspace is required to load the short drama center.' },
        };
      }

      const manifestState = await readShortDramaManifest(adapter, projectId);
      if (manifestState.status === 'ready') {
        return {
          status: 'ready',
          source: 'manifest',
          project: manifestState.project,
          loadedAt: Date.now(),
        };
      }
      if (manifestState.status === 'empty') {
        return {
          status: 'empty',
          source: 'manifest',
          reason: manifestState.reason,
          scannedAt: Date.now(),
        };
      }
      if (manifestState.status === 'unsupported') {
        return {
          status: 'unsupported',
          source: 'manifest',
          error: manifestState.error,
        };
      }
      return {
        status: 'error',
        source: 'manifest',
        error: manifestState.error,
      };
    },
    saveProject(project: ShortDramaProject) {
      return writeShortDramaManifest(adapter, project);
    },
  };
}

export function updateShortDramaProductionMode(
  project: ShortDramaProject,
  mode: ShortDramaProductionPlan['mode'],
): ShortDramaProject {
  return {
    ...project,
    productionPlan: {
      ...project.productionPlan,
      mode,
    },
  };
}

export function applyShortDramaAgentEvent(
  project: ShortDramaProject,
  event: ShortDramaAgentEvent,
): ShortDramaProject {
  return updateArtifact(project, event.artifactId, artifact => {
    const attempts = [...artifact.attempts];
    const attemptIndex = attempts.findIndex(attempt => attempt.runId === event.runId);

    if (event.type === 'created') {
      if (attemptIndex >= 0) {
        attempts[attemptIndex] = applyAgentEventAttemptOwner({ ...attempts[attemptIndex], status: 'created' }, event);
      } else {
        attempts.push(applyAgentEventAttemptOwner({
          id: `attempt-${event.runId}`,
          runId: event.runId,
          status: 'created',
          createdAt: event.timestamp,
        }, event));
      }

      return { ...artifact, status: 'pending', attemptCount: attempts.length, attempts };
    }

    if (event.type === 'started' || event.type === 'progress') {
      if (attemptIndex >= 0) {
        attempts[attemptIndex] = applyAgentEventAttemptOwner({ ...attempts[attemptIndex], status: 'running' }, event);
      } else {
        attempts.push(applyAgentEventAttemptOwner({
          id: `attempt-${event.runId}`,
          runId: event.runId,
          status: 'running',
          createdAt: event.timestamp,
        }, event));
      }

      return { ...artifact, status: 'generating', attemptCount: attempts.length, attempts };
    }

    if (event.type === 'completed') {
      const completedRevisionId = `revision-${event.runId}`;
      // A picture that already came home by another route — typically the
      // board's own "send back" press, landing before this batch's Completed
      // event — is not a second delivery. Recording one anyway wrote a
      // duplicate revision, invented an attempt for a run the user did not
      // start, and overwrote `mediaReference` with what it already held.
      if (isShortDramaMediaAlreadyRecorded(artifact, {
        mediaItemId: event.outputMediaReference?.mediaItemId ?? event.outputMediaItemId,
        ignoreRevisionId: completedRevisionId,
        onlyOtherDeliveryPaths: true,
      })) {
        return artifact;
      }

      if (attemptIndex >= 0) {
        attempts[attemptIndex] = applyAgentEventAttemptOwner({
          ...attempts[attemptIndex],
          status: 'completed',
          completedAt: event.timestamp,
        }, event);
      } else {
        attempts.push(applyAgentEventAttemptOwner({
          id: `attempt-${event.runId}`,
          runId: event.runId,
          status: 'completed',
          createdAt: event.timestamp,
          completedAt: event.timestamp,
        }, event));
      }

      const revisionId = completedRevisionId;
      const mediaItemId = event.outputMediaReference?.mediaItemId ?? event.outputMediaItemId;
      const reviewRevision: ShortDramaArtifactRevision = {
        id: revisionId,
        version: artifact.revisions.length + 1,
        createdAt: event.timestamp,
        summary: 'Agent output is ready for review.',
        reason: createRuntimeRevisionReason(event),
        source: 'stageAgent',
        changedFields: ['status', 'attempts', 'revisions', 'mediaReference'],
        mediaItemId,
      };
      const revisions = artifact.revisions.some(revision => revision.id === revisionId)
        ? artifact.revisions.map(revision => revision.id === revisionId
            ? {
                ...revision,
                createdAt: event.timestamp,
                reason: revision.reason ?? createRuntimeRevisionReason(event),
                source: revision.source ?? 'stageAgent',
                changedFields: revision.changedFields ?? ['status', 'attempts', 'revisions', 'mediaReference'],
                mediaItemId: mediaItemId ?? revision.mediaItemId,
              }
            : revision)
        : [
            ...artifact.revisions,
            reviewRevision,
          ];

      return {
        ...artifact,
        status: 'reviewing',
        attemptCount: attempts.length,
        revisionCount: revisions.length,
        attempts,
        revisions,
        mediaReference: event.outputMediaReference ?? artifact.mediaReference,
      };
    }

    if (event.type === 'failed' || event.type === 'cancelled') {
      if (attemptIndex >= 0) {
        attempts[attemptIndex] = applyAgentEventAttemptOwner({
          ...attempts[attemptIndex],
          status: event.type,
          completedAt: event.timestamp,
          failureReason: event.failureReason,
          orchestratorCorrection: event.orchestratorCorrection,
        }, event);
      } else {
        attempts.push(applyAgentEventAttemptOwner({
          id: `attempt-${event.runId}`,
          runId: event.runId,
          status: event.type,
          createdAt: event.timestamp,
          completedAt: event.timestamp,
          failureReason: event.failureReason,
          orchestratorCorrection: event.orchestratorCorrection,
        }, event));
      }

      const failedAttempts = attempts.filter(attempt => attempt.status === 'failed' || attempt.status === 'cancelled').length;
      const status = typeof event.retryLimit === 'number' && failedAttempts > event.retryLimit
        ? 'needs_intervention'
        : 'error';

      return { ...artifact, status, failureReason: event.failureReason, attemptCount: attempts.length, attempts };
    }

    return artifact;
  });
}

function applyAgentEventAttemptOwner(
  attempt: ShortDramaArtifactAttempt,
  event: ShortDramaAgentEvent,
): ShortDramaArtifactAttempt {
  if (!event.sourceSessionId) {
    return attempt;
  }
  return {
    ...attempt,
    sourceSessionId: event.sourceSessionId,
  };
}

function createRuntimeRevisionReason(event: ShortDramaAgentEvent) {
  const actor = event.source ? `${event.source[0].toUpperCase()}${event.source.slice(1)}` : 'Runtime';
  const mediaItemId = event.outputMediaReference?.mediaItemId ?? event.outputMediaItemId;
  return mediaItemId
    ? `${actor} completed run ${event.runId} and attached media ${mediaItemId}.`
    : `${actor} completed run ${event.runId}.`;
}

/**
 * K3 §5.2: one picture, refined on the infinite canvas, coming home.
 *
 * The canvas builds the media reference (the neutral adapter owns that
 * conversion); this function only decides what the project looks like
 * afterwards.
 */
/**
 * "Is this picture already the one this asset is holding?" — the single
 * question both delivery legs ask before writing a revision.
 *
 * Two paths can deliver the same file: the board's own "send back" press and a
 * generation that carried the asset's coordinates and came home through the
 * runtime. Whichever lands first wins; the second must be a silent no-op, or
 * the asset collects a duplicate revision, a phantom attempt, and a second
 * overwrite of its `mediaReference`. Before this existed the guard was
 * one-sided — the canvas leg checked both keys, the runtime leg checked only
 * its own run id — so "sent back by hand, then the same batch completes" wrote
 * everything twice.
 *
 * Both keys are read off the NEWEST revision only. The question is "is the
 * asset already holding this?", not "has this ever appeared in this asset's
 * history" — and the difference is not academic, because the board's operation
 * id is DERIVED from the asset and the picture rather than minted per press.
 * Scanning the whole history therefore froze the asset: send picture A, send
 * picture B, change your mind and ask for A again, and the third press matched
 * the first one's row and did nothing at all.
 *
 * `ignoreRevisionId` excludes a revision the caller is itself about to write
 * or refresh, so re-delivering one event does not read as a conflict with the
 * row it created last time.
 *
 * `onlyOtherDeliveryPaths` narrows the `mediaItemId` match to revisions some
 * OTHER path wrote — the ones carrying a `sourceOperationId`. The runtime leg
 * needs it: two of its own runs may legitimately describe the same media id
 * (a re-run over the same output), and treating that as a repeat would freeze
 * the asset. A revision the board wrote can never be one of its runs.
 *
 * `revisions` is treated as ordered, oldest first, which is how every writer
 * in this module appends to it.
 */
export interface ShortDramaMediaRecordIdentity {
  mediaItemId?: string;
  sourceOperationId?: string;
  ignoreRevisionId?: string;
  onlyOtherDeliveryPaths?: boolean;
}

export function isShortDramaMediaAlreadyRecorded(
  artifact: Pick<ShortDramaArtifact, 'revisions'>,
  identity: ShortDramaMediaRecordIdentity,
): boolean {
  const candidates = identity.ignoreRevisionId === undefined
    ? artifact.revisions
    : artifact.revisions.filter(revision => revision.id !== identity.ignoreRevisionId);
  const latest = candidates[candidates.length - 1];
  if (!latest) {
    return false;
  }

  if (
    identity.sourceOperationId !== undefined
    && latest.sourceOperationId === identity.sourceOperationId
  ) {
    return true;
  }

  if (identity.mediaItemId === undefined || latest.mediaItemId !== identity.mediaItemId) {
    return false;
  }
  return identity.onlyOtherDeliveryPaths !== true || latest.sourceOperationId !== undefined;
}

export interface ShortDramaCanvasRefinement {
  artifactId: string;
  mediaReference: ShortDramaMediaReference;
  /** The board's idempotency key for this one press. */
  operationId: string;
  /** Which card it came from. Provenance only; nothing reads it back. */
  canvasNodeId: string;
  timestamp: number;
}

/**
 * The short-drama half of the return leg, and the only thing the canvas is
 * allowed to do to a project.
 *
 * It appends a revision, points the asset at the new picture, and puts the
 * asset into review. That is all. Three deliberate absences:
 *
 * 1. **No attempt is recorded.** An attempt means "a stage agent ran"; the
 *    retry counter and the `needs_intervention` threshold are computed from
 *    them. A person tidying a picture by hand is not a failed agent run, and
 *    writing one here would poison both. This is an intentional difference
 *    from the runtime path in {@link applyShortDramaAgentEvent}.
 * 2. **No approval.** The picture is proposed, not accepted — that is what
 *    `reviewing` means, and the existing approve entry point stays the only
 *    way out of it. This function does not touch that function.
 * 3. **Nothing is overwritten.** The previous picture keeps its own revision
 *    and its own file; the board never deletes media and neither does this.
 *
 * Idempotency is delegated to {@link isShortDramaMediaAlreadyRecorded}, which
 * the runtime leg uses too: if the asset's newest revision is already this
 * press or already this picture, there is nothing to do and the project is
 * returned untouched. Sending a *different* picture is not blocked, and
 * neither is going back to one the asset held earlier — both are new proposals
 * and get their own revision.
 *
 * A missing artifact returns the project unchanged rather than throwing; the
 * caller checks existence itself and has a better message for the user.
 */
export function applyShortDramaCanvasRefinement(
  project: ShortDramaProject,
  refinement: ShortDramaCanvasRefinement,
): ShortDramaProject {
  const target = project.artifacts.find(artifact => artifact.id === refinement.artifactId);
  if (!target) {
    return project;
  }
  const alreadyRecorded = isShortDramaMediaAlreadyRecorded(target, {
    sourceOperationId: refinement.operationId,
    mediaItemId: refinement.mediaReference.mediaItemId,
  });
  // The project object itself is returned, not a copy of it: a caller can then
  // tell "nothing to do" from "something changed" by identity, and skip a save
  // that would only churn the manifest's timestamps.
  if (alreadyRecorded) {
    return project;
  }

  return updateArtifact(project, refinement.artifactId, artifact => {
    const revisions: ShortDramaArtifactRevision[] = [
      ...artifact.revisions,
      {
        id: `revision-canvas-${refinement.operationId}`,
        version: artifact.revisions.length + 1,
        createdAt: refinement.timestamp,
        // The manifest stores the fact in English, the way every other
        // runtime-written revision reason does; the panel translates.
        summary: 'Refined on the infinite canvas.',
        reason: `A picture refined on the infinite canvas was attached from card ${refinement.canvasNodeId}.`,
        source: 'user',
        changedFields: ['status', 'revisions', 'mediaReference'],
        mediaItemId: refinement.mediaReference.mediaItemId,
        sourceOperationId: refinement.operationId,
        sourceCanvasNodeId: refinement.canvasNodeId,
      },
    ];

    return {
      ...artifact,
      status: 'reviewing',
      revisions,
      revisionCount: revisions.length,
      mediaReference: refinement.mediaReference,
    };
  });
}

export function approveShortDramaArtifactReview(
  project: ShortDramaProject,
  approval: ShortDramaArtifactReviewApproval,
): ShortDramaProject {
  return updateArtifact(project, approval.artifactId, artifact => {
    const existingReviewRevision = artifact.revisions.find(revision => revision.summary === 'Agent output is ready for review.');
    const revisions = existingReviewRevision
      ? artifact.revisions.map(revision => revision.id === existingReviewRevision.id
          ? { ...revision, summary: approval.summary, approvedBy: approval.approvedBy, createdAt: approval.timestamp }
          : revision)
      : [
          ...artifact.revisions,
          {
            id: `revision-approved-${approval.timestamp}`,
            version: artifact.revisions.length + 1,
            createdAt: approval.timestamp,
            summary: approval.summary,
            approvedBy: approval.approvedBy,
          },
        ];

    return {
      ...artifact,
      status: 'ready',
      revisions,
      revisionCount: revisions.length,
    };
  });
}

export function analyzeShortDramaArtifactImpact(
  project: ShortDramaProject,
  changedArtifactId: string,
): ShortDramaImpactAnalysis {
  const changedArtifact = project.artifacts.find(item => item.id === changedArtifactId);

  if (!changedArtifact) {
    return {
      status: 'error',
      changedArtifactId,
      items: [],
      error: { code: 'artifact_missing', message: 'Changed artifact was not found.' },
    };
  }

  return {
    status: 'ready',
    changedArtifactId,
    items: project.artifacts
      .filter(artifact => artifact.id !== changedArtifactId)
      .map(artifact => {
        const hasDependency = artifact.dependsOn?.includes(changedArtifactId) ?? false;
        if (!hasDependency) {
          return {
            artifactId: artifact.id,
            recommendation: 'keep' as const,
            reason: 'No direct dependency on the changed artifact.',
            estimatedMinutes: 0,
            estimatedCostLabel: '$0.00 est.',
          };
        }

        const recommendation = artifact.stage === 'video' || artifact.stage === 'storyboards'
          ? 'regenerate'
          : 'review';

        return {
          artifactId: artifact.id,
          recommendation,
          reason: `${artifact.title} depends on ${changedArtifact.title}.`,
          estimatedMinutes: artifact.stage === 'video' ? 12 : 4,
          estimatedCostLabel: artifact.stage === 'video' ? '$4.20 est.' : '$0.40 est.',
        };
      }),
  };
}

export function markShortDramaImpactedArtifacts(
  project: ShortDramaProject,
  analysis: ShortDramaImpactAnalysis,
): ShortDramaProject {
  if (analysis.status !== 'ready') {
    return project;
  }

  const recommendations = new Map(analysis.items.map(item => [item.artifactId, item.recommendation]));
  return {
    ...project,
    artifacts: project.artifacts.map(artifact => {
      const recommendation = recommendations.get(artifact.id);
      if (recommendation === 'regenerate') {
        return {
          ...artifact,
          status: 'stale',
          statusReason: 'Upstream artifact changed; regeneration is recommended.',
        };
      }
      if (recommendation === 'review') {
        return {
          ...artifact,
          status: 'reviewing',
          statusReason: 'Upstream artifact changed; review is recommended.',
        };
      }
      return artifact;
    }),
  };
}

export function confirmShortDramaRegeneration(
  project: ShortDramaProject,
  analysis: ShortDramaImpactAnalysis,
  artifactIds: string[],
): ShortDramaProject {
  if (analysis.status !== 'ready') {
    return project;
  }

  const selected = new Set(artifactIds);
  return {
    ...project,
    artifacts: project.artifacts.map(artifact => selected.has(artifact.id)
      ? {
          ...artifact,
          status: 'generating',
          attemptCount: artifact.attempts.length + 1,
          attempts: [
            ...artifact.attempts,
            { id: `attempt-regenerate-${artifact.attempts.length + 1}`, status: 'created', createdAt: Date.now() },
          ],
        }
      : artifact),
  };
}

export function createShortDramaRegenerationRequests(
  project: ShortDramaProject,
  artifactIds: string[],
): ShortDramaAgentTaskRequestBatch {
  const requests = artifactIds
    .map(artifactId => createShortDramaAgentTaskContext(project, artifactId))
    .filter((context): context is Extract<ShortDramaAgentTaskContext, { status: 'ready' }> => context.status === 'ready')
    .map(context => context.request);

  if (requests.length === 0) {
    return { status: 'empty', reason: 'no_artifacts' };
  }

  return { status: 'ready', requests };
}

export function confirmShortDramaRegenerationPlan(
  project: ShortDramaProject,
  analysis: ShortDramaImpactAnalysis,
  artifactIds: string[],
): ShortDramaRegenerationPlan {
  const nextProject = confirmShortDramaRegeneration(project, analysis, artifactIds);
  const batch = createShortDramaRegenerationRequests(nextProject, artifactIds);

  if (batch.status === 'ready') {
    return { status: 'ready', project: nextProject, requests: batch.requests };
  }
  if (batch.status === 'empty') {
    return { status: 'empty', project: nextProject, reason: batch.reason };
  }
  return { status: 'error', project: nextProject, error: batch.error };
}

function createStageSummaries(artifacts: ShortDramaArtifact[]): ShortDramaStageSummary[] {
  return STAGES.map(stage => {
    const stageArtifacts = artifacts.filter(artifact => artifact.stage === stage);
    return {
      stage,
      artifactCount: stageArtifacts.length,
      readyCount: stageArtifacts.filter(artifact => artifact.status === 'ready').length,
      runningCount: stageArtifacts.filter(artifact => artifact.status === 'generating').length,
      issueCount: stageArtifacts.filter(artifact => (
        artifact.status === 'error' || artifact.status === 'stale' || artifact.status === 'unsupported'
      )).length,
    };
  });
}

function createStatusSummary(artifacts: ShortDramaArtifact[]): ShortDramaStatusSummary {
  const byStatus = STATUSES.reduce<Record<ShortDramaArtifactStatus, number>>((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as Record<ShortDramaArtifactStatus, number>);

  artifacts.forEach(artifact => {
    byStatus[artifact.status] += 1;
  });

  return { total: artifacts.length, byStatus };
}

function createEmptyProductionPlan(): ShortDramaProductionPlan {
  return {
    status: 'pending',
    mode: 'semiAutomatic',
    goal: '',
    episodeRange: '',
    steps: [],
  };
}

function createWorkspaceInitializedProject(
  options: ShortDramaWorkspaceProjectInitOptions,
  timestamp: number,
): ShortDramaProject {
  const projectId = options.projectId?.trim() || 'short_drama_project';
  const scriptContent = options.kind === 'script' && options.scriptContent?.trim()
    ? options.scriptContent
    : '# \u7b2c1\u96c6\n\n';
  const episodes = extractInitializedScriptEpisodes(scriptContent);
  const artifacts = episodes.map(episode => createInitializedScriptArtifact(projectId, episode.id, episode.number, timestamp));

  return {
    projectId,
    title: options.title?.trim() || 'AI Short Drama',
    status: 'draft',
    activeStage: 'script',
    activeEpisodeId: episodes[0]?.id,
    episodes,
    artifacts,
    productionPlan: createInitializedProductionPlan(episodes),
    scriptDocument: {
      kind: 'markdown',
      content: scriptContent,
      updatedAt: timestamp,
    },
  };
}

function extractInitializedScriptEpisodes(scriptContent: string): ShortDramaProject['episodes'] {
  const headingMatches = [...scriptContent.matchAll(/^#{1,6}\s+(.+)$/gm)];
  const episodeNumbers = new Set<number>();

  for (const match of headingMatches) {
    const number = parseInitializedEpisodeNumber(match[1] ?? '');
    if (number !== undefined) {
      episodeNumbers.add(number);
    }
  }

  const numbers = [...episodeNumbers].sort((a, b) => a - b);
  const effectiveNumbers = numbers.length > 0 ? numbers : [1];

  return effectiveNumbers.map(number => ({
    id: `episode-${String(number).padStart(2, '0')}`,
    number,
    title: `Episode ${String(number).padStart(2, '0')}`,
    summary: 'Initialized script episode.',
  }));
}

function parseInitializedEpisodeNumber(text: string): number | undefined {
  const patterns = [
    /\u7b2c\s*(\d+)\s*\u96c6/u,
    /\bEP\s*0*(\d+)\b/iu,
    /\bEpisode\s*0*(\d+)\b/iu,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return Number.parseInt(match[1], 10);
    }
  }

  return undefined;
}

function createInitializedScriptArtifact(
  projectId: string,
  episodeId: string,
  episodeNumber: number,
  timestamp: number,
): ShortDramaArtifact {
  const episodeLabel = String(episodeNumber).padStart(2, '0');
  return {
    id: `${episodeId}-script`,
    handle: `EP${episodeLabel}-SCRIPT01`,
    displayName: `\u7b2c${episodeNumber}\u96c6 \u5267\u672c`,
    episodeId,
    stage: 'script',
    type: 'script',
    title: `Episode ${episodeLabel} script`,
    summary: 'Initialized script source.',
    agentRole: 'director',
    status: 'pending',
    revisionCount: 1,
    attemptCount: 0,
    revisions: [
      {
        id: `revision-${projectId}-${episodeId}-init`,
        version: 1,
        createdAt: timestamp,
        summary: 'Initialized workspace short drama project.',
        changedFields: ['project', 'scriptDocument'],
        reason: 'Workspace short drama project was initialized.',
        source: 'mainAI',
      },
    ],
    attempts: [],
  };
}

function createInitializedProductionPlan(episodes: ShortDramaProject['episodes']): ShortDramaProductionPlan {
  const episodeIds = episodes.map(episode => episode.id);
  const lastEpisode = episodes[episodes.length - 1];
  const episodeRange = lastEpisode
    ? `Episode 01-${String(lastEpisode.number).padStart(2, '0')}`
    : '';

  return {
    status: 'pending',
    mode: 'semiAutomatic',
    goal: 'Initialize short drama production workspace.',
    episodeRange,
    steps: STAGES.map(stage => ({
      id: `step-${stage}`,
      stage,
      episodeIds,
      status: stage === 'script' ? 'pending' : 'blocked',
      summary: `${stage} workspace scaffold.`,
    })),
  };
}

function createInitializedProjectAuditEvent(
  project: ShortDramaProject,
  reason: string,
  timestamp: number,
): ShortDramaProject {
  const targetArtifact = project.artifacts.find(artifact => artifact.stage === 'script') ?? project.artifacts[0];
  if (!targetArtifact) {
    return project;
  }

  const revision: ShortDramaArtifactRevision = {
    id: `revision-${project.projectId}-workspace-init-${timestamp}`,
    version: targetArtifact.revisions.length + 1,
    createdAt: timestamp,
    summary: reason,
    changedFields: ['project', 'manifest'],
    reason,
    source: 'mainAI',
  };

  return {
    ...project,
    artifacts: project.artifacts.map(artifact => artifact.id === targetArtifact.id
      ? {
          ...artifact,
          revisions: [...artifact.revisions, revision],
          revisionCount: artifact.revisions.length + 1,
        }
      : artifact),
  };
}

function recoveryGuidance(key: string): ShortDramaRecoveryGuidance {
  return {
    titleKey: `shortDrama.recovery.${key}.title`,
    reasonKey: `shortDrama.recovery.${key}.reason`,
    nextActionKey: `shortDrama.recovery.${key}.nextAction`,
  };
}

function sectionsForAgentRole(
  agentRole: ShortDramaArtifact['agentRole'],
  stage: ShortDramaStage,
): ShortDramaSpecialistContextSection[] {
  if (agentRole === 'director') {
    return stage === 'storyboards' ? ['story', 'storyboard'] : ['story'];
  }
  if (agentRole === 'image') {
    return ['story', 'visual'];
  }
  if (agentRole === 'video') {
    return ['storyboard', 'video'];
  }
  if (agentRole === 'post') {
    return ['video', 'post'];
  }
  return ['story'];
}

function agentRoleForStageAgentRole(stageAgentRole: ShortDramaStageAgentRole): ShortDramaAgentRole {
  if (stageAgentRole === 'asset' || stageAgentRole === 'storyboard') {
    return 'image';
  }
  if (stageAgentRole === 'video') {
    return 'video';
  }
  if (stageAgentRole === 'post') {
    return 'post';
  }
  return 'director';
}

function sectionForStage(stage: ShortDramaStage): ShortDramaSpecialistContextSection {
  if (stage === 'assets') return 'visual';
  if (stage === 'storyboards') return 'storyboard';
  if (stage === 'video') return 'video';
  if (stage === 'post') return 'post';
  return 'story';
}

function collectDependencyArtifacts(
  project: ShortDramaProject,
  artifact: ShortDramaArtifact,
): ShortDramaArtifact[] {
  const byId = new Map(project.artifacts.map(item => [item.id, item]));
  const collected = new Map<string, ShortDramaArtifact>();
  const visit = (id: string) => {
    if (collected.has(id)) {
      return;
    }

    const dependency = byId.get(id);
    if (!dependency) {
      return;
    }

    collected.set(id, dependency);
    collectArtifactReferenceDependencyIds(dependency).forEach(visit);
  };

  collectArtifactReferenceDependencyIds(artifact).forEach(visit);
  return [...collected.values()];
}

function collectArtifactReferenceDependencyIds(artifact: ShortDramaArtifact): string[] {
  return [...new Set([
    ...(artifact.dependsOn ?? []),
    ...collectShortDramaArtifactAssetReferenceIds(artifact),
    ...(artifact.references?.storyboardArtifactIds ?? []),
    ...(artifact.references?.videoArtifactIds ?? []),
  ])];
}

function summarizeArtifactForContext(
  artifact: ShortDramaArtifact,
  handlesById: Map<string, string>,
) {
  const handle = handlesById.get(artifact.id);
  return `${handle ? `${handle} ` : ''}${artifact.title}: ${artifact.summary}`;
}

function formatShortDramaPolicyApplied(policy: ShortDramaToolPolicy): string {
  const readScopes = Object.entries(policy.readScopes ?? {})
    .map(([stage, scope]) => `${stage}:${scope}`)
    .join(', ');
  const writeCapabilities = Object.entries(policy.writeCapabilities ?? {})
    .filter(([, stages]) => stages.length > 0)
    .map(([capability, stages]) => `${capability}:${stages.join('|')}`)
    .join(', ');

  return [
    `${policy.actorRole}${policy.stage ? `/${policy.stage}` : ''}`,
    `read(${readScopes || 'none'})`,
    `write(${writeCapabilities || 'none'})`,
  ].join(' ');
}

function createOmittedContextDetails(policy: ShortDramaToolPolicy): ShortDramaOmittedContextEntry[] {
  const readScopes = policy.readScopes ?? {};
  const entries: ShortDramaOmittedContextEntry[] = [
    {
      type: 'full_chat_history',
      reason: 'Specialist agents receive focused project context, not the parent chat transcript.',
    },
    {
      type: 'raw_media_payloads',
      reason: 'Media is exposed through stable ids, summaries, and previews only.',
    },
    {
      type: 'provider_secrets',
      reason: 'Provider credentials and runtime secrets are never included in specialist context.',
    },
  ];

  if (readScopes.script === 'segment' || readScopes.script === 'episode') {
    entries.push({
      type: 'full_script_document',
      reason: 'Script access is bounded by the agent read scope to avoid unrelated episode context.',
    });
  }

  if (readScopes.assets === 'referenced') {
    entries.push({
      type: 'unreferenced_assets',
      reason: 'Only assets referenced by the focused artifact or storyboard plan are included.',
    });
  }

  if (readScopes.storyboards === 'referenced') {
    entries.push({
      type: 'unreferenced_storyboards',
      reason: 'Only storyboards referenced by the focused artifact or current shot plan are included.',
    });
  } else if (readScopes.storyboards === 'episodeRelated') {
    entries.push({
      type: 'unrelated_stage_media',
      reason: 'Storyboard context is limited to the focused episode or stage-relevant summaries.',
    });
  }

  if (readScopes.video === 'statusSummary') {
    entries.push({
      type: 'raw_video_payloads',
      reason: 'Video access is limited to status summaries unless the stage requires referenced videos.',
    });
  }

  if (policy.stage === 'post') {
    entries.push({
      type: 'raw_video_payloads',
      reason: 'Post agents receive playable media references and summaries, not raw video bytes.',
    });
  }

  return entries;
}

function findActiveScriptSegmentId(
  segments: ReturnType<typeof createShortDramaScriptSegmentIndex>,
  episodeNumber: number,
) {
  return segments.find(segment => segment.episodeNumber === episodeNumber && segment.sceneNumber === undefined)?.id
    ?? segments.find(segment => segment.episodeNumber === episodeNumber)?.id;
}

function createRelevantScriptSegmentSummaries(
  segments: ReturnType<typeof createShortDramaScriptSegmentIndex>,
  episodeNumber: number,
) {
  return segments
    .filter(segment => segment.episodeNumber === episodeNumber)
    .slice(0, 6)
    .map(segment => `${segment.handle} ${segment.headingText}: ${segment.summary}`);
}

function createSpecialistConstraints(artifact: ShortDramaArtifact) {
  const base = {
    styleBible: 'Preserve the current short-drama visual style and production direction.',
    characterConsistency: 'Keep character identity, wardrobe, palette, and facial anchors stable across reused assets.',
  };

  if (artifact.stage === 'video' || artifact.stage === 'post') {
    return {
      ...base,
      aspectRatio: 'Use the project default vertical micro-drama framing unless the artifact prompt says otherwise.',
      durationTarget: artifact.mediaReference?.durationMs
        ? `${Math.round(artifact.mediaReference.durationMs / 1000)} seconds`
        : 'Match the episode beat and current shot plan.',
    };
  }

  if (artifact.stage === 'storyboards') {
    return {
      ...base,
      aspectRatio: 'Frame storyboard images for downstream video generation.',
    };
  }

  return base;
}

function createChatError(
  scope: 'artifact' | 'episodeStage',
  artifactId: string | undefined,
  code: 'artifact_missing' | 'episode_missing',
  message: string,
  episodeId = '',
  stage: ShortDramaStage = 'script',
): ShortDramaArtifactChatContext {
  return {
    status: 'error',
    scope,
    episodeId,
    stage,
    agentRole: 'orchestrator',
    artifactId,
    error: { code, message },
  };
}

function createManifestKey(projectId: string) {
  void projectId;
  return '.void/short-drama/manifest.json';
}

function createLegacyProjectRoot(projectId: string) {
  return `.void/short-drama/${encodeShortDramaStorageSegment(projectId)}`;
}

function createLegacyManifestKey(projectId: string) {
  return `${createLegacyProjectRoot(projectId)}/manifest.json`;
}

function createLegacyScriptDocumentKey(projectId: string) {
  return `${createLegacyProjectRoot(projectId)}/script.md`;
}

function createLegacyArtifactSourceKey(projectId: string, artifactId: string) {
  return `${createLegacyProjectRoot(projectId)}/artifacts/${encodeShortDramaStorageSegment(artifactId)}.json`;
}

function createLegacyAssetSourceKey(projectId: string, artifactId: string) {
  return `${createLegacyProjectRoot(projectId)}/assets/${encodeShortDramaStorageSegment(artifactId)}.json`;
}

function createLegacyArtifactRevisionsKey(projectId: string, artifactId: string) {
  return `${createLegacyProjectRoot(projectId)}/revisions/${encodeShortDramaStorageSegment(artifactId)}.json`;
}

function createLegacyArtifactAttemptsKey(projectId: string, artifactId: string) {
  return `${createLegacyProjectRoot(projectId)}/attempts/${encodeShortDramaStorageSegment(artifactId)}.json`;
}

function createScriptDocumentKey(projectId: string) {
  void projectId;
  return '.void/short-drama/script.md';
}

function createArtifactSourceKey(projectId: string, artifactId: string) {
  void projectId;
  const safeArtifactId = encodeShortDramaStorageSegment(artifactId);
  return `.void/short-drama/artifacts/${safeArtifactId}.json`;
}

function createAssetSourceKey(projectId: string, artifactId: string) {
  void projectId;
  const safeArtifactId = encodeShortDramaStorageSegment(artifactId);
  return `.void/short-drama/assets/${safeArtifactId}.json`;
}

function createArtifactRevisionsKey(projectId: string, artifactId: string) {
  void projectId;
  const safeArtifactId = encodeShortDramaStorageSegment(artifactId);
  return `.void/short-drama/revisions/${safeArtifactId}.json`;
}

function createArtifactAttemptsKey(projectId: string, artifactId: string) {
  void projectId;
  const safeArtifactId = encodeShortDramaStorageSegment(artifactId);
  return `.void/short-drama/attempts/${safeArtifactId}.json`;
}

function createAuditLogKey(projectId: string) {
  void projectId;
  return '.void/short-drama/audit-log.jsonl';
}

function createDerivedArtifactIndexKey(projectId: string) {
  void projectId;
  return '.void/short-drama/indexes/artifact-index.json';
}

function createDerivedMediaIndexKey(projectId: string) {
  void projectId;
  return '.void/short-drama/indexes/media-index.json';
}

function createDerivedScriptSegmentIndexKey(projectId: string) {
  void projectId;
  return '.void/short-drama/indexes/script-segment-index.json';
}

function createDerivedSearchIndexKey(projectId: string) {
  void projectId;
  return '.void/short-drama/indexes/search-index.json';
}

function encodeShortDramaStorageSegment(segment: string) {
  return encodeURIComponent(segment.trim() || 'default').replace(/\./g, '%2E');
}

function isShortDramaAssetArtifact(artifact: ShortDramaArtifact) {
  return artifact.stage === 'assets'
    && (artifact.type === 'character' || artifact.type === 'location' || artifact.type === 'prop');
}

function createShortDramaAuditLogJsonl(project: ShortDramaProject) {
  const audit = createShortDramaProjectAuditLog(project, { limit: Math.max(50, project.artifacts.length) });
  if (audit.status !== 'ready') {
    return '';
  }

  return audit.entries
    .map(entry => JSON.stringify(entry))
    .join('\n');
}

function createFallbackScriptMarkdown(project: ShortDramaProject): string {
  return project.episodes.map(episode => {
    const scriptArtifact = project.artifacts.find(artifact => (
      artifact.stage === 'script' && artifact.episodeId === episode.id
    ));
    const body = scriptArtifact?.summary || episode.summary || '';
    return `# ${CHINESE_EPISODE_PREFIX}${episode.number}${CHINESE_EPISODE_SUFFIX}\n\n${body}`;
  }).join('\n\n');
}

function parseScriptEpisodeAnchors(
  content: string,
  project: ShortDramaProject,
): ShortDramaScriptDocumentViewModel['anchors'] {
  return content.split(/\r?\n/).reduce<ShortDramaScriptDocumentViewModel['anchors']>((anchors, line, index) => {
    const heading = line.match(/^#{1,2}\s+(.+?)\s*$/);
    if (!heading) {
      return anchors;
    }

    const title = heading[1].trim();
    const episodeNumber = parseEpisodeNumberFromHeading(title);
    if (!episodeNumber) {
      return anchors;
    }

    const episode = project.episodes.find(item => item.number === episodeNumber);
    anchors.push({
      episodeId: episode?.id ?? `episode-${String(episodeNumber).padStart(2, '0')}`,
      episodeNumber,
      title,
      lineNumber: index + 1,
    });
    return anchors;
  }, []);
}

function parseEpisodeNumberFromHeading(title: string): number | undefined {
  const chineseMatch = new RegExp(
    `^${CHINESE_EPISODE_PREFIX}\\s*(\\d+)\\s*${CHINESE_EPISODE_SUFFIX}(?:\\s|$|[${CHINESE_HEADING_SEPARATOR}:.-])`,
  ).exec(title);
  if (chineseMatch) {
    return Number(chineseMatch[1]);
  }

  const epMatch = title.match(/^EP\s*0*(\d+)\b/i);
  if (epMatch) {
    return Number(epMatch[1]);
  }

  const episodeMatch = title.match(/^Episode\s+0*(\d+)\b/i);
  if (episodeMatch) {
    return Number(episodeMatch[1]);
  }

  return undefined;
}

function updateArtifact(
  project: ShortDramaProject,
  artifactId: string,
  update: (artifact: ShortDramaArtifact) => ShortDramaArtifact,
): ShortDramaProject {
  return {
    ...project,
    artifacts: project.artifacts.map(artifact => artifact.id === artifactId ? update(artifact) : artifact),
  };
}

export { createShortDramaStaticProject };
