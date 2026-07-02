export type ShortDramaStage = 'script' | 'assets' | 'storyboards' | 'video' | 'post';

export type ShortDramaSection = ShortDramaStage;

export type ShortDramaArtifactStatus =
  | 'pending'
  | 'generating'
  | 'ready'
  | 'reviewing'
  | 'revising'
  | 'stale'
  | 'error'
  | 'unsupported'
  | 'needs_intervention';

export type ShortDramaProjectStatus = 'draft' | 'planning' | 'generating' | 'review' | 'ready' | 'error';

export type ShortDramaAgentRole = 'orchestrator' | 'director' | 'image' | 'video' | 'post';

export type ShortDramaStageAgentRole = 'director' | 'asset' | 'storyboard' | 'video' | 'post';

export type ShortDramaToolPermissionCapability =
  | 'validate'
  | 'intake'
  | 'search'
  | 'read'
  | 'locate'
  | 'explain'
  | 'listUsage'
  | 'setFocus'
  | 'updatePrompt'
  | 'createAttempt'
  | 'requestGeneration'
  | 'requestChange'
  | 'review'
  | 'dispatch'
  | 'delete';

export type ShortDramaToolPermissionAccess = 'allow' | 'requiresMainAIApproval' | 'deny';

export type ShortDramaToolPermissionScope = 'project' | 'stage' | 'artifact' | 'asset';

export interface ShortDramaToolPermission {
  tool: string;
  capability: ShortDramaToolPermissionCapability;
  access: ShortDramaToolPermissionAccess;
  scope: ShortDramaToolPermissionScope;
  stage?: ShortDramaStage;
  reason: string;
}

export type ShortDramaToolForbiddenAction =
  | 'modify_other_stage_without_main_ai_dispatch'
  | 'read_full_chat_history'
  | 'overwrite_prompt_revision_history'
  | 'access_raw_media_without_media_summary_tool'
  | 'delete_artifacts_or_media'
  | 'dispatch_other_specialist_agents'
  | 'bypass_revision_attempt_history';

export interface ShortDramaToolPolicy {
  actorRole: ShortDramaAgentRole;
  stage?: ShortDramaStage;
  scope: ShortDramaToolPermissionScope;
  permissions: ShortDramaToolPermission[];
  forbiddenActions: ShortDramaToolForbiddenAction[];
  readScopes?: ShortDramaAgentReadScopes;
  writeCapabilities?: ShortDramaAgentWriteCapabilities;
}

export interface ShortDramaToolPolicyInput {
  actorRole: ShortDramaAgentRole;
  stage?: ShortDramaStage;
}

export type ShortDramaToolPolicyResult =
  | { status: 'ready'; source: 'short-drama-tool-policy'; policy: ShortDramaToolPolicy }
  | { status: 'error'; source: 'short-drama-tool-policy'; error: ShortDramaError };

export type ShortDramaScriptReadScope = 'segment' | 'episode' | 'full';
export type ShortDramaAssetReadScope = 'referenced' | 'episodeRelated' | 'allSummary';
export type ShortDramaStoryboardReadScope = 'referenced' | 'episodeRelated';
export type ShortDramaVideoReadScope = 'statusSummary' | 'referenced';
export type ShortDramaPostReadScope = 'statusSummary';

export interface ShortDramaAgentReadScopes {
  script?: ShortDramaScriptReadScope;
  assets?: ShortDramaAssetReadScope;
  storyboards?: ShortDramaStoryboardReadScope;
  video?: ShortDramaVideoReadScope;
  post?: ShortDramaPostReadScope;
}

export type ShortDramaAgentWriteCapability =
  | 'createArtifact'
  | 'updatePrompt'
  | 'attachMedia'
  | 'markDownstreamStale'
  | 'requestChange';

export type ShortDramaAgentWriteCapabilities = Record<ShortDramaAgentWriteCapability, ShortDramaStage[]>;

export interface ShortDramaAgentPolicyAccessResult {
  status: 'allow' | 'request_required' | 'deny';
  source: 'short-drama-tool-policy';
  reason: string;
  stage?: ShortDramaStage;
  capability?: ShortDramaAgentWriteCapability;
}

export type ShortDramaArtifactType =
  | 'script'
  | 'scene-list'
  | 'character'
  | 'location'
  | 'prop'
  | 'image'
  | 'storyboard'
  | 'video'
  | 'post'
  | 'final'
  | 'voice'
  | 'music'
  | 'sfx'
  | 'subtitle'
  | 'audio'
  | 'color';

export type ShortDramaSource = 'static' | 'manifest' | 'agent-event';

export interface ShortDramaError {
  code:
    | 'missing_workspace'
    | 'unsupported_runtime'
    | 'remote_workspace'
    | 'load_failed'
    | 'save_failed'
    | 'version_incompatible'
    | 'manifest_missing'
    | 'manifest_invalid'
    | 'artifact_missing'
    | 'episode_missing'
    | 'stage_mismatch'
    | 'stage_agent_conflict'
    | 'workspace_mismatch'
    | 'change_request_missing'
    | 'handle_conflict'
    | 'media_missing'
    | 'not_media_artifact';
  message: string;
  cause?: unknown;
}

export type ShortDramaLibraryState =
  | { status: 'idle'; source?: ShortDramaSource }
  | { status: 'scanning'; source?: ShortDramaSource }
  | { status: 'ready'; source: ShortDramaSource; project: ShortDramaProject; loadedAt: number }
  | { status: 'empty'; source: ShortDramaSource; reason: 'no_project' | 'no_episodes' | 'no_artifacts'; scannedAt?: number }
  | {
      status: 'mismatch';
      source: ShortDramaSource;
      binding: {
        status: 'mismatch' | 'no_workspace' | 'no_project' | 'ready' | 'error';
        source: string;
        uiWorkspacePath?: string;
        toolWorkspaceRoot?: string;
        projectPath?: string;
        normalizedUiWorkspacePath?: string;
        normalizedToolWorkspaceRoot?: string;
        normalizedProjectPath?: string;
        error?: { code: string; message: string };
      };
      error: ShortDramaError;
    }
  | { status: 'unsupported'; source: ShortDramaSource; error: ShortDramaError }
  | { status: 'error'; source: ShortDramaSource; error: ShortDramaError };

export interface ShortDramaEpisode {
  id: string;
  number: number;
  title: string;
  summary: string;
  duration?: string;
}

export interface ShortDramaArtifactRevision {
  id: string;
  version: number;
  createdAt: number;
  summary: string;
  mediaItemId?: string;
  approvedBy?: ShortDramaAgentRole;
  previousRevisionId?: string;
  changedFields?: string[];
  reason?: string;
  userInstruction?: string;
  source?: 'mainAI' | 'stageAgent' | 'user';
  downstreamImpact?: ShortDramaImpactItem[];
}

export interface ShortDramaArtifactAttempt {
  id: string;
  runId?: string;
  sourceSessionId?: string;
  status: 'created' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  completedAt?: number;
  failureReason?: string;
  orchestratorCorrection?: string;
  revisionId?: string;
  inputInstruction?: string;
  outputRef?: string;
  costLabel?: string;
  durationMs?: number;
}

export interface ShortDramaMediaReference {
  mediaItemId: string;
  kind: 'image' | 'video' | 'audio';
  label?: string;
  localPath?: string;
  filePath?: string;
  relativePath?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  durationMs?: number;
  source?: 'generated' | 'imported' | 'external' | 'artifact-reference';
}

export interface ShortDramaArtifactPrompt {
  positive?: string;
  negative?: string;
  style?: string;
  motion?: string;
  references?: string[];
}

export interface ShortDramaArtifactReferences {
  storyboardReferencePlanIds?: string[];
  scriptSegmentIds?: string[];
  characterAssetIds?: string[];
  locationAssetIds?: string[];
  propAssetIds?: string[];
  referenceSnapshots?: ShortDramaArtifactReferenceSnapshot[];
  storyboardArtifactIds?: string[];
  videoArtifactIds?: string[];
}

export interface ShortDramaArtifactReferenceSnapshot {
  storyboardReferencePlanId: string;
  scriptSegmentId: string;
  episodeId: string;
  sceneId: string;
  shotId: string;
  characterNames?: string[];
  locationNames?: string[];
  propNames?: string[];
  characterAssetIds?: string[];
  locationAssetIds?: string[];
  propAssetIds?: string[];
  unresolvedCharacterNames?: string[];
  unresolvedLocationNames?: string[];
  unresolvedPropNames?: string[];
  requiredBeats?: string[];
  visualNotes?: string[];
  actionNotes?: string[];
  emotionNotes?: string[];
  cameraIntent?: string[];
}

export interface ShortDramaArtifact {
  id: string;
  handle?: string;
  previousHandles?: string[];
  displayName?: string;
  episodeId: string;
  stage: ShortDramaStage;
  type: ShortDramaArtifactType;
  title: string;
  summary: string;
  prompt?: ShortDramaArtifactPrompt;
  sourceStoryboard?: string;
  agentRole: ShortDramaAgentRole;
  status: ShortDramaArtifactStatus;
  statusReason?: string;
  failureReason?: string;
  revisionCount: number;
  attemptCount: number;
  revisions: ShortDramaArtifactRevision[];
  attempts: ShortDramaArtifactAttempt[];
  subagentSessionId?: string;
  parentSessionId?: string;
  parentToolCallId?: string;
  mediaReference?: ShortDramaMediaReference;
  dependsOn?: string[];
  references?: ShortDramaArtifactReferences;
}

export interface ShortDramaScriptBreakdownShot {
  id: string;
  episodeId: string;
  sceneId: string;
  shotId: string;
  scriptSegmentId: string;
  characterNames: string[];
  locationNames: string[];
  propNames: string[];
  requiredBeats: string[];
  visualNotes: string[];
  actionNotes?: string[];
  emotionNotes?: string[];
  cameraIntent?: string[];
}

export interface ShortDramaScriptBreakdownScene {
  id: string;
  episodeId: string;
  sceneId: string;
  title: string;
  summary: string;
  characterNames: string[];
  locationNames: string[];
  propNames: string[];
  shots: ShortDramaScriptBreakdownShot[];
}

export interface ShortDramaScriptBreakdownEpisode {
  episodeId: string;
  episodeNumber: number;
  scenes: ShortDramaScriptBreakdownScene[];
}

export interface ShortDramaStoryboardReferencePlan {
  id: string;
  episodeId: string;
  sceneId: string;
  shotId: string;
  scriptSegmentId: string;
  characterNames?: string[];
  locationNames?: string[];
  propNames?: string[];
  characterAssetIds: string[];
  locationAssetIds: string[];
  propAssetIds: string[];
  unresolvedCharacterNames?: string[];
  unresolvedLocationNames?: string[];
  unresolvedPropNames?: string[];
  requiredBeats: string[];
  visualNotes: string[];
  actionNotes?: string[];
  emotionNotes?: string[];
  cameraIntent?: string[];
}

export type ShortDramaArtifactHandleResolutionSource = 'id' | 'handle' | 'previousHandle';

export interface ShortDramaArtifactIndexEntry {
  id: string;
  handle: string;
  previousHandles: string[];
  displayName: string;
  stage: ShortDramaStage;
  artifactType: ShortDramaArtifactType;
  episodeId?: string;
  episodeNumber?: number;
  sceneNumber?: number;
  shotNumber?: number;
  shotNumbers?: number[];
  title: string;
  summary: string;
  status: ShortDramaArtifactStatus;
  mediaKind?: ShortDramaMediaReference['kind'];
  mediaItemId?: string;
  hasMediaPreview: boolean;
  hasPlayableMedia: boolean;
  mediaDurationMs?: number;
  dependsOn: string[];
  updatedAt?: number;
}

export interface ShortDramaArtifactMediaMetadata {
  mediaItemId?: string;
  kind: ShortDramaMediaReference['kind'];
  label?: string;
  mediaStatus?: ShortDramaMediaInventoryStatus;
  previewAvailable: boolean;
  thumbnailAvailable: boolean;
  playable: boolean;
  durationMs?: number;
  source: 'artifact-reference' | 'media-inventory';
}

export type ShortDramaMediaInventoryStatus = 'ready' | 'referencedMissingPreview' | 'empty' | 'unsupported' | 'error';

export interface ShortDramaMediaArtifactIndexEntry {
  artifactId: string;
  artifactHandle: string;
  displayName: string;
  stage: ShortDramaStage;
  artifactType: ShortDramaArtifactType;
  episodeId?: string;
  episodeNumber?: number;
  sceneNumber?: number;
  shotNumber?: number;
  shotNumbers?: number[];
  status: ShortDramaArtifactStatus;
  mediaItemId?: string;
  mediaKind: ShortDramaMediaReference['kind'];
  mediaStatus: ShortDramaMediaInventoryStatus;
  mediaLabel?: string;
  previewAvailable: boolean;
  thumbnailAvailable: boolean;
  playable: boolean;
  durationMs?: number;
  scrollTargetId: string;
}

export interface ShortDramaMediaInventoryQuery {
  stage?: ShortDramaStage;
  episodeNumber?: number;
  sceneNumber?: number;
  shotNumber?: number;
  shotNumbers?: number[];
  artifactType?: ShortDramaArtifactType;
  status?: ShortDramaArtifactStatus;
  mediaKind?: ShortDramaMediaReference['kind'];
  mediaItemId?: string;
  mediaStatus?: ShortDramaMediaInventoryStatus;
  includeEmpty?: boolean;
  previewAvailable?: boolean;
  thumbnailAvailable?: boolean;
  playable?: boolean;
  limit?: number;
}

export type ShortDramaMediaInventoryResult =
  | {
      status: 'ready';
      source: 'media-artifact-index';
      query: ShortDramaMediaInventoryQuery;
      results: ShortDramaMediaArtifactIndexEntry[];
    }
  | {
      status: 'empty';
      source: 'media-artifact-index';
      query: ShortDramaMediaInventoryQuery;
      reason: 'no_matches';
    };

export interface ShortDramaScriptSegment {
  id: string;
  handle: string;
  headingText: string;
  headingLevel: number;
  episodeNumber?: number;
  sceneNumber?: number;
  startOffset: number;
  endOffset: number;
  summary: string;
  linkedArtifactIds: string[];
}

export interface ShortDramaScriptSegmentSearchQuery {
  text?: string;
  episodeNumber?: number;
  sceneNumber?: number;
  handle?: string;
  limit?: number;
}

export type ShortDramaScriptSegmentSearchResult =
  | {
      status: 'ready';
      source: 'script-segment-index';
      query: ShortDramaScriptSegmentSearchQuery;
      results: ShortDramaScriptSegment[];
    }
  | { status: 'empty'; source: 'script-segment-index'; query: ShortDramaScriptSegmentSearchQuery; reason: 'no_matches' };

export interface ShortDramaScriptSegmentReadOptions {
  tokenBudget?: number;
}

export type ShortDramaScriptSegmentReadResult =
  | {
      status: 'ready';
      source: 'script-segment-index';
      segment: ShortDramaScriptSegment;
      omittedContext: string[];
    }
  | { status: 'not_found'; source: 'script-segment-index'; error: { code: 'script_segment_missing'; message: string } };

export type ShortDramaSearchEntryKind = 'artifact' | 'media' | 'scriptSegment';

export interface ShortDramaSearchEntry {
  id: string;
  kind: ShortDramaSearchEntryKind;
  sourceId: string;
  handle: string;
  title: string;
  stage?: ShortDramaStage;
  artifactType?: ShortDramaArtifactType;
  episodeId?: string;
  episodeNumber?: number;
  sceneNumber?: number;
  shotNumber?: number;
  shotNumbers?: number[];
  text: string;
  tags: string[];
  status?: ShortDramaArtifactStatus;
  mediaKind?: ShortDramaMediaReference['kind'];
  mediaStatus?: ShortDramaMediaInventoryStatus;
  hasMedia: boolean;
  hasMediaPreview: boolean;
  hasPlayableMedia: boolean;
  usedAssetIds: string[];
  updatedAt?: number;
}

export interface ShortDramaSearchIndexQuery {
  text?: string;
  kind?: ShortDramaSearchEntryKind;
  stage?: ShortDramaStage;
  episodeNumber?: number;
  sceneNumber?: number;
  shotNumber?: number;
  artifactType?: ShortDramaArtifactType;
  status?: ShortDramaArtifactStatus;
  mediaKind?: ShortDramaMediaReference['kind'];
  mediaStatus?: ShortDramaMediaInventoryStatus;
  includeEmptyMedia?: boolean;
  hasMedia?: boolean;
  hasMediaPreview?: boolean;
  hasPlayableMedia?: boolean;
  limit?: number;
}

export type ShortDramaSearchIndexResult =
  | { status: 'ready'; source: 'short-drama-search-index'; query: ShortDramaSearchIndexQuery; results: ShortDramaSearchEntry[] }
  | { status: 'empty'; source: 'short-drama-search-index'; query: ShortDramaSearchIndexQuery; reason: 'no_matches' };

export interface ShortDramaNaturalLanguageTargetInput {
  text: string;
  workspace?: ShortDramaStageWorkspace;
  limit?: number;
}

export type ShortDramaNaturalLanguageTargetResult =
  | {
      status: 'ready';
      source: 'short-drama-target-resolver';
      query: ShortDramaSearchIndexQuery;
      candidates: ShortDramaSearchEntry[];
      focusedArtifactId?: string;
    }
  | {
      status: 'needs_context';
      source: 'short-drama-target-resolver';
      reason: 'deictic_reference_without_focus';
      query: ShortDramaSearchIndexQuery;
    }
  | {
      status: 'empty';
      source: 'short-drama-target-resolver';
      reason: 'no_matches';
      query: ShortDramaSearchIndexQuery;
    };

export type ShortDramaDerivedIndexIntegrityIssueCode =
  | 'episode_missing'
  | 'dependency_missing'
  | 'media_preview_missing'
  | 'media_playback_missing'
  | 'handle_conflict';

export interface ShortDramaDerivedIndexIntegrityIssue {
  severity: 'warning' | 'error';
  code: ShortDramaDerivedIndexIntegrityIssueCode;
  artifactId?: string;
  relatedId?: string;
  message: string;
}

export interface ShortDramaDerivedIndexIntegritySummary {
  artifactCount: number;
  mediaCount: number;
  scriptSegmentCount: number;
  issueCount: number;
}

export type ShortDramaDerivedIndexIntegrityResult =
  | {
      status: 'ready';
      source: 'short-drama-derived-index-integrity';
      summary: ShortDramaDerivedIndexIntegritySummary;
      issues: [];
    }
  | {
      status: 'issues';
      source: 'short-drama-derived-index-integrity';
      summary: ShortDramaDerivedIndexIntegritySummary;
      issues: ShortDramaDerivedIndexIntegrityIssue[];
    };

export type ShortDramaArtifactResolveResult =
  | {
      status: 'ready';
      source: ShortDramaArtifactHandleResolutionSource;
      artifact: ShortDramaArtifact;
      entry: ShortDramaArtifactIndexEntry;
    }
  | { status: 'not_found'; source: 'artifact-index'; error: { code: 'artifact_missing'; message: string } }
  | { status: 'conflict'; source: 'artifact-index'; error: { code: 'handle_conflict'; message: string }; matches: ShortDramaArtifactIndexEntry[] };

export interface ShortDramaArtifactSearchQuery {
  text?: string;
  stage?: ShortDramaStage;
  episodeNumber?: number;
  sceneNumber?: number;
  shotNumber?: number;
  artifactType?: ShortDramaArtifactType;
  status?: ShortDramaArtifactStatus;
  mediaKind?: ShortDramaMediaReference['kind'];
  mediaItemId?: string;
  hasMedia?: boolean;
  hasMediaPreview?: boolean;
  hasPlayableMedia?: boolean;
  handle?: string;
  limit?: number;
}

export type ShortDramaArtifactSearchResult =
  | { status: 'ready'; source: 'artifact-index'; query: ShortDramaArtifactSearchQuery; results: ShortDramaArtifactIndexEntry[] }
  | { status: 'empty'; source: 'artifact-index'; query: ShortDramaArtifactSearchQuery; reason: 'no_matches' }
  | { status: 'error'; source: 'artifact-index'; query: ShortDramaArtifactSearchQuery; error: { code: string; message: string } };

export interface ShortDramaArtifactReadOptions {
  idOrHandle: string;
  includeRevisionSummary?: boolean;
  includeMediaMetadata?: boolean;
  tokenBudget?: number;
}

export type ShortDramaArtifactReadResult =
  | {
      status: 'ready';
      source: 'artifact-index';
      artifactId: string;
      entry: ShortDramaArtifactIndexEntry;
      summary: string;
      media?: ShortDramaArtifactMediaMetadata;
      revisionSummary?: string[];
      omittedContext: string[];
    }
  | Extract<ShortDramaArtifactResolveResult, { status: 'not_found' | 'conflict' }>;

export type ShortDramaArtifactLocateResult =
  | {
      status: 'ready';
      source: 'artifact-index';
      artifactId: string;
      handle: string;
      stage: ShortDramaStage;
      episodeId?: string;
      scrollTargetId: string;
    }
  | Extract<ShortDramaArtifactResolveResult, { status: 'not_found' | 'conflict' }>;

export type ShortDramaStageWorkspacePanelState = 'collapsed' | 'open' | 'pinned';
export type ShortDramaStageWorkspaceFocusSource = 'initial' | 'userClick' | 'scroll' | 'mainAI' | 'stageAgent';

export interface ShortDramaStageAgentSessionCandidate {
  childSessionId: string;
  parentSessionId?: string;
  parentToolCallId?: string;
  subagentType?: string;
  agentType?: string;
  title?: string;
  workspacePath?: string;
  createdAt?: number;
  lastActiveAt?: number;
  isTransient?: boolean;
  agentBackedTransient?: boolean;
}

export type ShortDramaStageAgentSessionMatchedBy =
  | 'artifactBinding'
  | 'stageBinding'
  | 'persistentStageBinding'
  | 'parentSessionAgentName'
  | 'recentAgentName';

export type ShortDramaStageAgentSessionResolution =
  | {
      status: 'ready';
      source: 'short-drama-real-stage-agent-resolver';
      stage: ShortDramaStage;
      nativeAgentName: string;
      childSessionId: string;
      parentSessionId: string;
      parentToolCallId?: string;
      matchedBy: ShortDramaStageAgentSessionMatchedBy;
      candidate: ShortDramaStageAgentSessionCandidate;
    }
  | {
      status: 'pending';
      source: 'short-drama-real-stage-agent-resolver';
      stage: ShortDramaStage;
      nativeAgentName: string;
      reason: 'session_missing' | 'parent_missing';
      bindingStatus?: 'unbound' | 'ready' | 'missing' | 'stale' | 'recreating' | 'conflict' | 'workspace_mismatch' | 'error';
    }
  | {
      status: 'conflict';
      source: 'short-drama-real-stage-agent-resolver';
      stage: ShortDramaStage;
      nativeAgentName: string;
      candidates: ShortDramaStageAgentSessionCandidate[];
      error: { code: 'stage_agent_conflict'; message: string };
    };

export interface ShortDramaStageWorkspace {
  projectId: string;
  stage: ShortDramaStage;
  activeEpisodeId?: string;
  activeArtifactId?: string;
  activeArtifactHandle?: string;
  activeMedia?: {
    artifactHandle: string;
    mediaKind: ShortDramaMediaReference['kind'];
    mediaStatus: ShortDramaMediaInventoryStatus;
    mediaItemId?: string;
    previewAvailable: boolean;
    playable: boolean;
  };
  specialistAgentRole: ShortDramaStageAgentRole;
  specialistSessionId?: string;
  parentSessionId?: string;
  parentToolCallId?: string;
  stageAgentSessionResolution?: ShortDramaStageAgentSessionResolution;
  stageAgentBindingStatus?: 'unbound' | 'ready' | 'missing' | 'stale' | 'recreating' | 'conflict' | 'workspace_mismatch' | 'error';
  panelState: ShortDramaStageWorkspacePanelState;
  lastFocusSource: ShortDramaStageWorkspaceFocusSource;
}

export type ShortDramaStageAgentContextResult =
  | {
      status: 'ready';
      source: 'stage-workspace';
      workspace: ShortDramaStageWorkspace;
      openRequest: ShortDramaOpenSubagentRequest;
    }
  | { status: 'pending'; source: 'stage-workspace'; workspace: ShortDramaStageWorkspace; reason: 'session_missing' | 'parent_missing' }
  | { status: 'unsupported'; source: 'stage-workspace'; workspace: ShortDramaStageWorkspace; error: ShortDramaError };

export interface ShortDramaStageWorkspaceFocusInput {
  stage: ShortDramaStage;
  episodeId?: string;
  artifactIdOrHandle?: string;
  source: ShortDramaStageWorkspaceFocusSource;
}

export interface ShortDramaFocusContext {
  activeStage: ShortDramaStage;
  activeEpisodeId?: string;
  activeArtifactId?: string;
  activeArtifactHandle?: string;
  activeMediaItemId?: string;
  selectionSource: ShortDramaStageWorkspaceFocusSource | 'right-panel' | 'runtimeTool' | 'changeRequest';
}

export type ShortDramaStageWorkspaceFocusResult =
  | { status: 'ready'; source: 'stage-workspace'; workspace: ShortDramaStageWorkspace }
  | Extract<ShortDramaArtifactResolveResult, { status: 'not_found' | 'conflict' }>
  | { status: 'error'; source: 'stage-workspace'; error: { code: 'episode_missing' | 'stage_mismatch'; message: string } };

export interface ShortDramaProductionPlanStep {
  id: string;
  stage: ShortDramaStage;
  episodeIds: string[];
  status: 'pending' | 'ready' | 'running' | 'blocked' | 'done' | 'unsupported' | 'error';
  summary: string;
  estimatedMinutes?: number;
  estimatedCostLabel?: string;
}

export interface ShortDramaProductionPlan {
  status: 'pending' | 'ready' | 'unsupported' | 'error';
  mode: 'semiAutomatic' | 'automatic';
  goal: string;
  episodeRange: string;
  estimatedMinutes?: number;
  estimatedCostLabel?: string;
  steps: ShortDramaProductionPlanStep[];
  error?: ShortDramaError;
}

export interface ShortDramaScriptDocument {
  kind: 'markdown';
  content: string;
  filePath?: string;
  updatedAt?: number;
}

export interface ShortDramaProject {
  projectId: string;
  title: string;
  status: ShortDramaProjectStatus;
  activeStage: ShortDramaStage;
  activeEpisodeId?: string;
  episodes: ShortDramaEpisode[];
  artifacts: ShortDramaArtifact[];
  productionPlan: ShortDramaProductionPlan;
  scriptDocument?: ShortDramaScriptDocument;
  scriptBreakdown?: ShortDramaScriptBreakdownEpisode[];
  storyboardReferencePlans?: ShortDramaStoryboardReferencePlan[];
  changeRequests?: ShortDramaChangeRequest[];
}

export interface ShortDramaManifestIndexVersions {
  artifact: number;
  media: number;
  scriptSegment: number;
  search: number;
}

export interface ShortDramaScriptEpisodeAnchor {
  episodeId: string;
  episodeNumber: number;
  title: string;
  lineNumber: number;
}

export interface ShortDramaScriptDocumentViewModel {
  content: string;
  anchors: ShortDramaScriptEpisodeAnchor[];
}

export interface ShortDramaLibraryService {
  loadProject(workspacePath?: string): Promise<ShortDramaLibraryState>;
}

export interface ShortDramaStageSummary {
  stage: ShortDramaStage;
  artifactCount: number;
  readyCount: number;
  runningCount: number;
  issueCount: number;
}

export interface ShortDramaStatusSummary {
  total: number;
  byStatus: Record<ShortDramaArtifactStatus, number>;
}

export type ShortDramaArtifactCardMediaViewModel =
  | { status: 'referenced'; mediaItemId: string; kind: ShortDramaMediaReference['kind']; label?: string }
  | { status: 'none' };

export type ShortDramaMediaPreviewViewModel =
  | {
      status: 'ready';
      mediaItemId: string;
      kind: ShortDramaMediaReference['kind'];
      label?: string;
      previewUrl: string;
      thumbnailUrl?: string;
      localPath?: string;
      filePath?: string;
      relativePath?: string;
      durationMs?: number;
      source?: ShortDramaMediaReference['source'];
      canPlay: boolean;
    }
  | {
      status: 'missing';
      mediaItemId: string;
      kind: ShortDramaMediaReference['kind'];
      label?: string;
      canPlay: false;
      error: ShortDramaError;
    }
  | {
      status: 'unsupported';
      mediaItemId: string;
      kind: ShortDramaMediaReference['kind'];
      label?: string;
      canPlay: false;
      error: ShortDramaError;
    }
  | {
      status: 'referenced';
      mediaItemId: string;
      kind: ShortDramaMediaReference['kind'];
      label?: string;
      canPlay: false;
    }
  | { status: 'empty'; kind?: ShortDramaMediaReference['kind']; label?: string };

export interface ShortDramaArtifactCardViewModel {
  artifact: ShortDramaArtifact;
  media: ShortDramaArtifactCardMediaViewModel;
}

export interface ShortDramaOpenSubagentRequest {
  panelContentType?: 'btw-session';
  childSessionId: string;
  parentSessionId?: string;
  workspacePath?: string;
  sessionKind: 'subagent';
  sessionTitle: string;
  agentType?: string;
  parentToolCallId?: string;
  subagentType?: string;
  duplicateCheckKey: string;
  targetGroup?: 'primary' | 'secondary';
  enableSplitView?: boolean;
  replaceExisting?: boolean;
}

export interface ShortDramaArtifactChatContext {
  status: 'ready' | 'pending' | 'unsupported' | 'error';
  scope: 'artifact' | 'episodeStage';
  episodeId: string;
  stage: ShortDramaStage;
  agentRole: ShortDramaAgentRole;
  artifactId?: string;
  subagentSessionId?: string;
  parentSessionId?: string;
  parentToolCallId?: string;
  openRequest?: ShortDramaOpenSubagentRequest;
  error?: ShortDramaError;
}

export interface ShortDramaWorkspaceMediaItem {
  id: string;
  kind: 'image' | 'video' | 'audio';
  localPath?: string;
  filePath?: string;
  relativePath?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  durationMs?: number;
}

export interface ShortDramaMediaResolution {
  status: 'ready' | 'stale' | 'unsupported';
  mediaItem?: ShortDramaWorkspaceMediaItem;
  previewUrl?: string;
  error?: ShortDramaError;
}

export interface ShortDramaWorkspaceMediaLookup {
  resolve(artifact: ShortDramaArtifact): ShortDramaMediaResolution;
}

export interface ShortDramaManifest {
  manifestVersion: 1;
  projectId: string;
  title: string;
  status: ShortDramaProjectStatus;
  activeStage: ShortDramaStage;
  activeEpisodeId?: string;
  createdAt: number;
  updatedAt: number;
  indexVersions: ShortDramaManifestIndexVersions;
  project: ShortDramaProject;
}

export interface ShortDramaManifestAdapter {
  kind: 'local' | 'remote';
  read(key: string): Promise<string | undefined>;
  write(key: string, value: string): Promise<void>;
}

export type ShortDramaManifestState =
  | { status: 'ready'; source: 'manifest'; project: ShortDramaProject }
  | { status: 'empty'; source: 'manifest'; reason: 'no_project' }
  | { status: 'unsupported'; source: 'manifest'; error: ShortDramaError }
  | { status: 'error'; source: 'manifest'; error: ShortDramaError };

export type ShortDramaWorkspaceProjectInitKind = 'empty' | 'script' | 'demo';

export interface ShortDramaWorkspaceProjectInitOptions {
  kind: ShortDramaWorkspaceProjectInitKind;
  projectId?: string;
  title?: string;
  scriptContent?: string;
  demoEpisodeCount?: number;
  overwriteExisting?: boolean;
  timestamp?: number;
}

export type ShortDramaWorkspaceProjectInitResult =
  | { status: 'ready'; source: 'manifest'; action: 'initialized'; project: ShortDramaProject }
  | { status: 'protected'; source: 'manifest'; reason: 'project_exists'; existingProjectId: string }
  | { status: 'unsupported'; source: 'manifest'; error: ShortDramaError }
  | { status: 'error'; source: 'manifest'; error: ShortDramaError };

export interface ShortDramaLegacyProjectMigrationOptions {
  projectId: string;
  overwriteExisting?: boolean;
  timestamp?: number;
}

export type ShortDramaLegacyProjectMigrationResult =
  | { status: 'ready'; source: 'manifest'; action: 'migrated'; project: ShortDramaProject }
  | { status: 'empty'; source: 'manifest'; reason: 'legacy_project_missing' }
  | { status: 'protected'; source: 'manifest'; reason: 'project_exists'; existingProjectId: string }
  | { status: 'unsupported'; source: 'manifest'; error: ShortDramaError }
  | { status: 'error'; source: 'manifest'; error: ShortDramaError };

export type ShortDramaAgentEventType = 'created' | 'started' | 'progress' | 'completed' | 'failed' | 'cancelled';

export interface ShortDramaAgentEvent {
  type: ShortDramaAgentEventType;
  artifactId: string;
  runId: string;
  timestamp: number;
  source?: 'subagent' | 'tool' | 'runtime' | 'user';
  sourceSessionId?: string;
  outputMediaItemId?: string;
  outputMediaReference?: ShortDramaMediaReference;
  failureReason?: string;
  orchestratorCorrection?: string;
  retryLimit?: number;
}

export interface ShortDramaArtifactStatusEvent {
  eventId: string;
  source: 'subagent' | 'tool' | 'runtime' | 'user';
  projectId: string;
  artifactId: string;
  attemptId?: string;
  status: ShortDramaArtifactStatus;
  mediaReference?: ShortDramaMediaReference;
  error?: ShortDramaError;
  occurredAt: number;
}

export interface ShortDramaAgentTaskRequest {
  artifactId: string;
  episodeId: string;
  stage: ShortDramaStage;
  agentRole: ShortDramaAgentRole;
  contextScope: 'script' | 'visual' | 'storyboard' | 'video' | 'post';
  inputSummary: string;
  parentSessionId?: string;
  targetSessionId?: string;
}

export interface ShortDramaAgentTaskTargetBinding {
  stage: ShortDramaStage;
  childSessionId?: string;
  status?: 'unbound' | 'ready' | 'missing' | 'stale' | 'recreating' | 'conflict' | 'workspace_mismatch' | 'error';
}

export interface ShortDramaAgentTaskDispatchRecord {
  artifactId: string;
  stage: ShortDramaStage;
  targetSessionId: string;
  source: 'persistent-session';
  messageId?: string;
}

export type ShortDramaAgentTaskContext =
  | { status: 'ready'; request: ShortDramaAgentTaskRequest }
  | { status: 'error'; error: ShortDramaError };

export type ShortDramaAgentTaskRequestBatch =
  | { status: 'ready'; requests: ShortDramaAgentTaskRequest[] }
  | { status: 'empty'; reason: 'no_artifacts' }
  | { status: 'error'; error: ShortDramaError };

export type ShortDramaRegenerationPlan =
  | { status: 'ready'; project: ShortDramaProject; requests: ShortDramaAgentTaskRequest[] }
  | { status: 'empty'; project: ShortDramaProject; reason: 'no_artifacts' }
  | { status: 'error'; project: ShortDramaProject; error: ShortDramaError };

export interface ShortDramaChangeRequestInput {
  actorRole: ShortDramaAgentRole;
  stage?: ShortDramaStage;
  targetStage: ShortDramaStage;
  targetArtifactIdOrHandle?: string;
  reason: string;
  suggestion: string;
  focus?: ShortDramaFocusContext;
  timestamp?: number;
}

export interface ShortDramaChangeRequest {
  id: string;
  sourceStage?: ShortDramaStage;
  targetStage: ShortDramaStage;
  requestedByRole: ShortDramaAgentRole;
  targetArtifactId?: string;
  targetArtifactHandle?: string;
  reason: string;
  suggestion: string;
  focus?: ShortDramaFocusContext;
  status: 'open' | 'resolved' | 'rejected';
  createdAt: number;
  resolution?: string;
  updatedAt?: number;
  updatedBy?: string;
}

export type ShortDramaChangeRequestResult =
  | { status: 'ready'; source: 'short-drama-change-request'; request: ShortDramaChangeRequest }
  | { status: 'denied'; source: 'short-drama-change-request'; authorization: ShortDramaAgentPolicyAccessResult }
  | { status: 'error'; source: 'short-drama-change-request'; error: ShortDramaError };

export interface ShortDramaChangeRequestQuery {
  targetStage?: ShortDramaStage;
  status?: ShortDramaChangeRequest['status'];
  requestedByRole?: ShortDramaAgentRole;
  targetArtifactIdOrHandle?: string;
}

export type ShortDramaChangeRequestListResult =
  | {
      status: 'ready';
      source: 'short-drama-change-request';
      query: ShortDramaChangeRequestQuery;
      requests: ShortDramaChangeRequest[];
    }
  | {
      status: 'empty';
      source: 'short-drama-change-request';
      query: ShortDramaChangeRequestQuery;
      reason: 'no_change_requests';
      requests: [];
    };

export interface ShortDramaChangeRequestResolutionInput {
  idOrHandle: string;
  status: Extract<ShortDramaChangeRequest['status'], 'resolved' | 'rejected'>;
  resolution: string;
  updatedBy: string;
  timestamp?: number;
}

export interface ShortDramaChangeRequestAuditEntry {
  type: 'changeRequestResolved' | 'changeRequestRejected';
  requestId: string;
  actor: string;
  timestamp: number;
  targetStage: ShortDramaStage;
  targetArtifactId?: string;
  targetArtifactHandle?: string;
  resolution: string;
}

export interface ShortDramaDownstreamStaleCandidate {
  artifactId: string;
  stage: ShortDramaStage;
  recommendedStatus: 'stale' | 'reviewing';
  reason: string;
}

export type ShortDramaChangeRequestResolutionResult =
  | {
      status: 'ready';
      source: 'short-drama-change-request';
      request: ShortDramaChangeRequest;
      project: ShortDramaProject;
      audit: ShortDramaChangeRequestAuditEntry;
      downstreamStaleCandidates: ShortDramaDownstreamStaleCandidate[];
    }
  | {
      status: 'not_found';
      source: 'short-drama-change-request';
      error: ShortDramaError;
    };

export interface ShortDramaOrchestratorDispatchOptions {
  parentSessionId?: string;
  approved?: boolean;
  stageAgentBindings?: ShortDramaAgentTaskTargetBinding[];
}

export type ShortDramaOrchestratorDispatchPlan =
  | { status: 'ready'; plan: ShortDramaProductionPlan; requests: ShortDramaAgentTaskRequest[] }
  | { status: 'needs_approval'; plan: ShortDramaProductionPlan; requests: [] }
  | { status: 'error'; plan: ShortDramaProductionPlan; requests: []; error: ShortDramaError };

export type ShortDramaSpecialistContextSection = 'story' | 'visual' | 'storyboard' | 'video' | 'post';
export type ShortDramaOmittedContext =
  | 'full_chat_history'
  | 'unrelated_stages'
  | 'provider_secrets'
  | 'raw_media_payloads'
  | 'full_script_document'
  | 'unreferenced_assets'
  | 'unrelated_episodes'
  | 'unrelated_stage_media'
  | 'unreferenced_storyboards'
  | 'raw_video_payloads';

export interface ShortDramaIncludedContextEntry {
  type: 'artifact' | 'scriptSegment' | 'asset' | 'storyboardReferencePlan' | 'media' | 'focus';
  id: string;
  reason: string;
}

export interface ShortDramaOmittedContextEntry {
  type: ShortDramaOmittedContext;
  reason: string;
}

export interface ShortDramaSpecialistContextPackage {
  projectId: string;
  artifactId: string;
  episodeId: string;
  focusContext?: ShortDramaFocusContext;
  activeEpisodeId?: string;
  activeArtifactId?: string;
  activeArtifactHandle?: string;
  activeScriptSegmentId?: string;
  focusedMedia?: {
    artifactHandle: string;
    mediaKind: ShortDramaMediaReference['kind'];
    mediaStatus: ShortDramaMediaInventoryStatus;
    mediaItemId?: string;
    previewAvailable: boolean;
    playable: boolean;
  };
  stage: ShortDramaStage;
  agentRole: ShortDramaAgentRole;
  stageAgentRole: ShortDramaStageAgentRole;
  includedSections: ShortDramaSpecialistContextSection[];
  omittedContext: ShortDramaOmittedContext[];
  includedContext?: ShortDramaIncludedContextEntry[];
  omittedContextDetails?: ShortDramaOmittedContextEntry[];
  reason?: string;
  policyApplied?: string;
  artifactSummary: string;
  inputSummary: string;
  episodeSummary: string;
  relevantScriptSegments: string[];
  referencedAssets: string[];
  storyboardReferencePlans?: string[];
  upstreamArtifacts: string[];
  relatedArtifactSummaries: string[];
  downstreamImpactSummary?: string;
  constraints: {
    styleBible: string;
    characterConsistency: string;
    aspectRatio?: string;
    durationTarget?: string;
  };
  allowedTools: string[];
  toolPolicy: ShortDramaToolPolicy;
  forbiddenActions: ShortDramaToolForbiddenAction[];
}

export type ShortDramaSpecialistContextResult =
  | { status: 'ready'; context: ShortDramaSpecialistContextPackage }
  | { status: 'error'; error: ShortDramaError };

export interface ShortDramaRecoveryGuidance {
  titleKey: string;
  reasonKey: string;
  nextActionKey: string;
}

export type ShortDramaAgentTaskDispatchResult =
  | { status: 'ready'; requests: ShortDramaAgentTaskRequest[]; dispatchedTasks?: ShortDramaAgentTaskDispatchRecord[] }
  | { status: 'unsupported'; error: ShortDramaError }
  | { status: 'error'; error: ShortDramaError };

export interface ShortDramaSubagentBinding {
  artifactId: string;
  subagentSessionId: string;
  parentSessionId: string;
  parentToolCallId?: string;
}

export interface ShortDramaSubagentSessionMetadata {
  projectId: string;
  stage: ShortDramaStage;
  artifactId?: string;
  activeEpisodeId?: string;
  activeArtifactId?: string;
  activeArtifactHandle?: string;
  parentToolCallId?: string;
  source: 'mainAI-dispatch';
}

export interface ShortDramaSubagentSessionLinkedInput {
  sessionId?: string;
  childSessionId?: string;
  parentSessionId?: string;
  parentToolCallId?: string;
  agentType?: string;
  artifactId?: string;
  shortDrama?: ShortDramaSubagentSessionMetadata;
}

export type ShortDramaSubagentSessionLinkedResult =
  | { status: 'ready'; project: ShortDramaProject; artifactId: string }
  | { status: 'ignored'; reason: 'no_matching_artifact' }
  | { status: 'error'; error: ShortDramaError };

export interface ShortDramaArtifactReviewApproval {
  artifactId: string;
  approvedBy: ShortDramaAgentRole;
  summary: string;
  timestamp: number;
}

export interface ShortDramaImpactItem {
  artifactId: string;
  recommendation: 'keep' | 'review' | 'regenerate';
  reason: string;
  estimatedMinutes: number;
  estimatedCostLabel: string;
}

export interface ShortDramaImpactAnalysis {
  status: 'ready' | 'error';
  changedArtifactId: string;
  items: ShortDramaImpactItem[];
  error?: ShortDramaError;
}

export interface ShortDramaArtifactPromptPatch {
  title?: string;
  summary?: string;
  prompt?: Partial<ShortDramaArtifactPrompt>;
  mediaReference?: ShortDramaMediaReference;
}

export interface ShortDramaArtifactPromptUpdateInput {
  idOrHandle: string;
  patch: ShortDramaArtifactPromptPatch;
  reason: string;
  userInstruction: string;
  source: 'mainAI' | 'stageAgent' | 'user';
  timestamp?: number;
  markDownstream?: boolean;
}

export type ShortDramaArtifactPromptUpdateResult =
  | {
      status: 'ready';
      source: 'artifact-revision';
      project: ShortDramaProject;
      artifactId: string;
      revisionId: string;
      impact: ShortDramaImpactAnalysis;
    }
  | Extract<ShortDramaArtifactResolveResult, { status: 'not_found' | 'conflict' }>
  | { status: 'error'; source: 'artifact-revision'; error: { code: string; message: string } };

export interface ShortDramaAssetUsage {
  assetId: string;
  assetHandle: string;
  artifactId: string;
  artifactHandle: string;
  usageType: 'visual_reference' | 'prompt_reference' | 'continuity_requirement';
  confidence: number;
}

export interface ShortDramaAssetUsageEntry {
  assetId: string;
  assetHandle: string;
  assetType: Extract<ShortDramaArtifactType, 'character' | 'location' | 'prop'>;
  displayName: string;
  usedBy: ShortDramaAssetUsage[];
}

export interface ShortDramaMainAIDispatchPlanInput {
  userGoal: string;
  approved?: boolean;
  parentSessionId?: string;
  targetStage?: ShortDramaStage;
  targetArtifactIds?: string[];
  stageAgentBindings?: Array<{
    stage: ShortDramaStage;
    agentName: string;
    childSessionId?: string;
    parentSessionId?: string;
    status: 'unbound' | 'ready' | 'missing' | 'stale' | 'recreating' | 'conflict' | 'workspace_mismatch' | 'error';
  }>;
}

export interface ShortDramaDispatchContextPackage {
  source: 'short-drama-orchestrator-scaffold';
  projectId: string;
  stage: ShortDramaStage;
  userGoal: string;
  artifactCount: number;
  targetHandles: string[];
  targetMediaItemIds: string[];
  omittedSections: Array<'fullScriptDocument' | 'rawMediaPayloads' | 'fullRevisionHistory' | 'unrelatedStages'>;
}

export interface ShortDramaMainAIDispatchTask {
  taskId: string;
  stage: ShortDramaStage;
  targetArtifactIds: string[];
  specialistRole: ShortDramaStageAgentRole;
  specialistSessionId?: string;
  persistentSessionId?: string;
  dispatchTarget?: {
    status: 'ready' | 'pending';
    source: 'stage-agent-binding' | 'artifact-binding' | 'unbound';
    childSessionId?: string;
    parentSessionId?: string;
    agentName?: string;
    bindingStatus?: 'unbound' | 'ready' | 'missing' | 'stale' | 'recreating' | 'conflict' | 'workspace_mismatch' | 'error';
  };
  instruction: string;
  userGoal: string;
  contextPackage: ShortDramaDispatchContextPackage;
  requiresApproval: boolean;
  requiredInputs: string[];
  expectedOutputs: string[];
  status: 'ready' | 'blocked';
  blockedReason?: string;
}

export interface ShortDramaMainAIDispatchPlan {
  planId: string;
  projectId: string;
  userGoal: string;
  mode: ShortDramaProductionPlan['mode'];
  tasks: ShortDramaMainAIDispatchTask[];
}

export type ShortDramaMainAIDispatchPlanResult =
  | { status: 'ready'; source: 'short-drama-orchestrator-scaffold'; plan: ShortDramaMainAIDispatchPlan }
  | { status: 'needs_approval'; source: 'short-drama-orchestrator-scaffold'; plan: ShortDramaMainAIDispatchPlan }
  | { status: 'empty'; source: 'short-drama-orchestrator-scaffold'; plan: ShortDramaMainAIDispatchPlan; reason: 'no_dispatchable_artifacts' }
  | { status: 'error'; source: 'short-drama-orchestrator-scaffold'; error: ShortDramaError };

export type ShortDramaReviewSeverity = 'pass' | 'minor' | 'major' | 'blocked';

export interface ShortDramaArtifactReviewInput {
  artifactId: string;
  finding: string;
  severity: ShortDramaReviewSeverity;
  retryBudget: number;
  timestamp?: number;
}

export interface ShortDramaReviewResult {
  reviewId: string;
  artifactId?: string;
  stage?: ShortDramaStage;
  status: 'pass' | 'needsCorrection' | 'needsUserReview' | 'blocked';
  findings: string[];
  correctionInstruction?: string;
  retryBudgetRemaining: number;
  userDecisionRequired: boolean;
}

export type ShortDramaArtifactReviewResult =
  | {
      status: ShortDramaReviewResult['status'];
      source: 'short-drama-orchestrator-scaffold';
      project: ShortDramaProject;
      review: ShortDramaReviewResult;
    }
  | { status: 'error'; source: 'short-drama-orchestrator-scaffold'; error: ShortDramaError };

export interface ShortDramaStageReviewInput {
  stage: ShortDramaStage;
  finding: string;
  severity: ShortDramaReviewSeverity;
  retryBudget: number;
  timestamp?: number;
}

export type ShortDramaStageReviewResult =
  | {
      status: ShortDramaReviewResult['status'];
      source: 'short-drama-orchestrator-scaffold';
      project: ShortDramaProject;
      review: ShortDramaReviewResult;
      affectedArtifactIds: string[];
    }
  | { status: 'empty'; source: 'short-drama-orchestrator-scaffold'; reason: 'stage_has_no_artifacts' }
  | { status: 'error'; source: 'short-drama-orchestrator-scaffold'; error: ShortDramaError };

export interface ShortDramaReviewDecisionInput {
  artifactId: string;
  decision: 'keep' | 'revise' | 'regenerate';
  reason: string;
  timestamp?: number;
}

export type ShortDramaReviewDecisionResult =
  | { status: 'ready'; source: 'short-drama-orchestrator-scaffold'; project: ShortDramaProject; artifactId: string }
  | { status: 'error'; source: 'short-drama-orchestrator-scaffold'; error: ShortDramaError };

export type ShortDramaChatIntakeKind = 'scriptDocument' | 'assetMedia' | 'videoMedia' | 'postMedia';

export interface ShortDramaChatIntakeInput {
  fileName?: string;
  mimeType?: string;
  text?: string;
  userInstruction?: string;
  sizeBytes?: number;
}

export type ShortDramaChatIntakeManifestAction =
  | 'updateScriptDocument'
  | 'createArtifactDraft'
  | 'attachMediaReference';

export type ShortDramaChatIntakeOmittedContext = 'rawAttachmentContent' | 'rawMediaBytes';

export type ShortDramaChatIntakeRecommendedManifestPatch =
  | {
      action: 'updateScriptDocument';
      scriptDocument: ShortDramaScriptDocument;
    }
  | {
      action: 'createArtifactDraft';
      artifactDraft: {
        stage: ShortDramaStage;
        type: ShortDramaArtifactType;
        title: string;
        summary: string;
        status: ShortDramaArtifactStatus;
        mediaReference?: ShortDramaMediaReference;
      };
    }
  | {
      action: 'attachMediaReference';
      targetStage: ShortDramaStage;
      artifactType: ShortDramaArtifactType;
      mediaReference: ShortDramaMediaReference;
    };

export interface ShortDramaChatIntakeRoute {
  kind: ShortDramaChatIntakeKind;
  targetStage: ShortDramaStage;
  artifactType?: ShortDramaArtifactType;
  manifestAction: ShortDramaChatIntakeManifestAction;
  targetPath: string;
  recommendedManifestPatch: ShortDramaChatIntakeRecommendedManifestPatch;
  confidence: number;
  reason: string;
  summary: string;
  omittedContext: ShortDramaChatIntakeOmittedContext[];
}

export type ShortDramaChatIntakeRouteResult =
  | { status: 'ready'; source: 'short-drama-chat-intake'; route: ShortDramaChatIntakeRoute }
  | { status: 'unsupported'; source: 'short-drama-chat-intake'; error: ShortDramaError; omittedContext: ShortDramaChatIntakeOmittedContext[] };

export type ShortDramaChatIntakeApplyResult =
  | {
      status: 'ready';
      source: 'short-drama-chat-intake';
      project: ShortDramaProject;
      artifactId?: string;
    }
  | {
      status: 'unsupported';
      source: 'short-drama-chat-intake';
      error: ShortDramaError;
    }
  | {
      status: 'error';
      source: 'short-drama-chat-intake';
      error: ShortDramaError;
    };

export interface ShortDramaFocusedArtifactOptimizationInput {
  userInstruction: string;
  reason: string;
  source: 'mainAI' | 'stageAgent' | 'user';
  patch?: ShortDramaArtifactPromptPatch;
  timestamp?: number;
  markDownstream?: boolean;
}

export type ShortDramaFocusedArtifactOptimizationResult =
  | {
      status: 'ready';
      source: 'short-drama-artifact-optimization';
      project: ShortDramaProject;
      workspace: ShortDramaStageWorkspace;
      artifactId: string;
      revisionId: string;
      impact: ShortDramaImpactAnalysis;
    }
  | {
      status: 'error';
      source: 'short-drama-artifact-optimization';
      error: ShortDramaError;
    }
  | {
      status: 'not_found';
      source: 'short-drama-artifact-optimization';
      error: { code: 'artifact_missing'; message: string };
    }
  | {
      status: 'conflict';
      source: 'short-drama-artifact-optimization';
      error: { code: 'handle_conflict'; message: string };
      matches: ShortDramaArtifactIndexEntry[];
    };
