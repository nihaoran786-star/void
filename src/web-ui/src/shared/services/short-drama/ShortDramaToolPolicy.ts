import type {
  ShortDramaAgentRole,
  ShortDramaAgentWriteCapability,
  ShortDramaAgentWriteCapabilities,
  ShortDramaStage,
  ShortDramaAgentReadScopes,
  ShortDramaAgentPolicyAccessResult,
  ShortDramaToolForbiddenAction,
  ShortDramaToolPermission,
  ShortDramaToolPermissionCapability,
  ShortDramaToolPermissionScope,
  ShortDramaToolPolicyInput,
  ShortDramaToolPolicyResult,
} from './ShortDramaTypes';

const SOURCE = 'short-drama-tool-policy' as const;

export function createShortDramaToolPolicy(input: ShortDramaToolPolicyInput): ShortDramaToolPolicyResult {
  const stageValidation = validateStageForRole(input.actorRole, input.stage);
  if (stageValidation) {
    return {
      status: 'error',
      source: SOURCE,
      error: stageValidation,
    };
  }

  const scope = input.actorRole === 'orchestrator' ? 'project' : 'stage';
  const stage = input.actorRole === 'orchestrator' ? undefined : input.stage;

  return {
    status: 'ready',
    source: SOURCE,
    policy: {
      actorRole: input.actorRole,
      stage,
      scope,
      permissions: input.actorRole === 'orchestrator'
        ? createOrchestratorPermissions()
        : createSpecialistPermissions(stage!),
      forbiddenActions: input.actorRole === 'orchestrator'
        ? createOrchestratorForbiddenActions()
        : createSpecialistForbiddenActions(),
      readScopes: input.actorRole === 'orchestrator'
        ? createOrchestratorReadScopes()
        : createSpecialistReadScopes(input.actorRole, stage!),
      writeCapabilities: input.actorRole === 'orchestrator'
        ? createOrchestratorWriteCapabilities()
        : createSpecialistWriteCapabilities(input.actorRole, stage!),
    },
  };
}

export function getShortDramaAgentReadScopes(input: ShortDramaToolPolicyInput): ShortDramaAgentReadScopes | undefined {
  const policy = createShortDramaToolPolicy(input);
  return policy.status === 'ready' ? policy.policy.readScopes : undefined;
}

export function authorizeShortDramaAgentWrite(
  policyInput: ShortDramaToolPolicyInput,
  capability: ShortDramaAgentWriteCapability,
  targetStage: ShortDramaStage,
): ShortDramaAgentPolicyAccessResult {
  const policy = createShortDramaToolPolicy(policyInput);
  if (policy.status !== 'ready') {
    return {
      status: 'deny',
      source: SOURCE,
      stage: targetStage,
      capability,
      reason: policy.error.message,
    };
  }

  const stages = policy.policy.writeCapabilities?.[capability] ?? [];
  if (stages.includes(targetStage)) {
    return {
      status: 'allow',
      source: SOURCE,
      stage: targetStage,
      capability,
      reason: `${policy.policy.actorRole} may ${capability} in ${targetStage}.`,
    };
  }

  const canRequestChange = policy.policy.writeCapabilities?.requestChange.includes(targetStage) ?? false;
  if (capability !== 'requestChange' && canRequestChange) {
    return {
      status: 'request_required',
      source: SOURCE,
      stage: targetStage,
      capability,
      reason: `${policy.policy.actorRole} cannot ${capability} in ${targetStage}; create a cross-stage change request instead.`,
    };
  }

  return {
    status: 'deny',
    source: SOURCE,
    stage: targetStage,
    capability,
    reason: `${policy.policy.actorRole} cannot ${capability} in ${targetStage}.`,
  };
}

export interface ShortDramaToolAuthorizationRequest {
  tool: string;
  capability: ShortDramaToolPermissionCapability;
  targetScope: ShortDramaToolPermissionScope;
  targetStage?: ShortDramaStage;
}

export type ShortDramaToolAuthorizationResult =
  | { status: 'allow'; source: typeof SOURCE; reason: string }
  | { status: 'requires_approval'; source: typeof SOURCE; reason: string }
  | {
      status: 'deny';
      source: typeof SOURCE;
      error: {
        code: 'scope_denied' | 'stage_mismatch' | 'unsupported_runtime';
        message: string;
      };
    };

export function authorizeShortDramaToolUse(
  policyInput: ShortDramaToolPolicyInput,
  request: ShortDramaToolAuthorizationRequest,
): ShortDramaToolAuthorizationResult {
  const policy = createShortDramaToolPolicy(policyInput);
  if (policy.status !== 'ready') {
    return {
      status: 'deny',
      source: SOURCE,
      error: {
        code: 'unsupported_runtime',
        message: policy.error.message,
      },
    };
  }

  const permission = policy.policy.permissions.find(item => item.tool === request.tool);
  if (!permission) {
    return {
      status: 'deny',
      source: SOURCE,
      error: {
        code: 'scope_denied',
        message: `Tool ${request.tool} is not available for this short drama actor.`,
      },
    };
  }

  if (permission.stage && request.targetStage && permission.stage !== request.targetStage) {
    return {
      status: 'deny',
      source: SOURCE,
      error: {
        code: 'stage_mismatch',
        message: `Specialist tool request targets ${request.targetStage}, but the workspace owns ${permission.stage}.`,
      },
    };
  }

  if (permission.capability !== request.capability) {
    return denyScope(`Tool ${request.tool} does not allow ${request.capability} capability.`);
  }

  if (!scopeAllows(permission.scope, request.targetScope)) {
    return denyScope(`Tool ${request.tool} does not allow ${request.targetScope} scope.`);
  }

  if (permission.access === 'deny') {
    return denyScope(permission.reason);
  }

  if (permission.access === 'requiresMainAIApproval') {
    return { status: 'requires_approval', source: SOURCE, reason: permission.reason };
  }

  return { status: 'allow', source: SOURCE, reason: permission.reason };
}

function createOrchestratorPermissions(): ShortDramaToolPermission[] {
  return [
    allow('getShortDramaProjectAwareness', 'read', 'project', 'Read a low-context project, workspace, and media status snapshot before searching or editing.'),
    allow('validateShortDramaProjectIntegrity', 'validate', 'project', 'Check derived index, media, dependency, and handle integrity before relying on project-wide search.'),
    allow('routeShortDramaChatIntake', 'intake', 'project', 'Route left-chat script, image, and video attachments into short-drama project storage suggestions.'),
    allow('resolveShortDramaNaturalLanguageTarget', 'locate', 'project', 'Convert user-facing descriptions into structured artifact, media, script, or focus candidates before editing.'),
    allow('focusShortDramaNaturalLanguageTarget', 'setFocus', 'project', 'Resolve a user-facing description and synchronize the right-panel workspace focus when the match is unique.'),
    allow('searchShortDramaProjectIndex', 'search', 'project', 'Find low-context artifact, media, asset, and script coordinates.'),
    allow('listShortDramaMedia', 'search', 'project', 'List right-panel media inventory without reading raw media payloads.'),
    allow('searchShortDramaArtifacts', 'search', 'project', 'Filter artifacts with structured stage, episode, status, and media metadata.'),
    allow('readShortDramaArtifact', 'read', 'project', 'Read a low-context artifact summary before editing or dispatching.'),
    allow('readShortDramaMediaArtifact', 'read', 'artifact', 'Resolve a stable media item id to its artifact and read low-context artifact and media metadata.'),
    allow('listShortDramaProjectAuditLog', 'explain', 'project', 'List recent artifact changes, actors, reasons, and downstream impact without raw payloads.'),
    allow('explainShortDramaArtifactChange', 'explain', 'project', 'Explain revision, attempt, media, and downstream impact history without raw payloads.'),
    allow('explainShortDramaMediaArtifactChange', 'explain', 'artifact', 'Resolve a stable media item id to its artifact and explain revision, attempt, media, and downstream impact history.'),
    allow('locateShortDramaArtifact', 'locate', 'project', 'Resolve user references into stable artifact ids or ambiguity candidates.'),
    allow('searchShortDramaScriptSegments', 'search', 'project', 'Find script fragments without reading the whole script document.'),
    allow('readShortDramaScriptSegment', 'read', 'project', 'Read bounded script fragments for planning and review.'),
    allow('listShortDramaAssetUsage', 'listUsage', 'project', 'Preview downstream usage before changing global assets.'),
    allow('setShortDramaStageFocus', 'setFocus', 'project', 'Synchronize right-panel workspace focus with the user request.'),
    allow('optimizeShortDramaNaturalLanguageTarget', 'updatePrompt', 'artifact', 'Resolve a user-facing target, focus the workspace, and create a prompt revision through the optimization workflow.'),
    allow('updateShortDramaArtifactPrompt', 'updatePrompt', 'artifact', 'Create prompt revisions and attempts through the revision workflow.'),
    allow('updateShortDramaMediaArtifactPrompt', 'updatePrompt', 'artifact', 'Resolve a stable media item id to its artifact and create prompt revisions through the revision workflow.'),
    allow('previewShortDramaImpact', 'review', 'project', 'Classify downstream artifacts as keep, review, or regenerate.'),
    allow('createShortDramaDispatchPlan', 'dispatch', 'project', 'Create specialist task plans using immutable artifact ids.'),
    allow('reviewShortDramaArtifactOutput', 'review', 'project', 'Review specialist outputs and decide whether correction is needed.'),
    allow('reviewShortDramaStageOutput', 'review', 'project', 'Review stage-wide continuity and create bounded correction attempts for that stage.'),
    deny('deleteShortDramaArtifact', 'delete', 'project', 'Deletion requires a separate destructive operation design and explicit user approval.'),
  ];
}

function createOrchestratorReadScopes(): ShortDramaAgentReadScopes {
  return {
    script: 'full',
    assets: 'allSummary',
    storyboards: 'episodeRelated',
    video: 'statusSummary',
    post: 'statusSummary',
  };
}

function createOrchestratorWriteCapabilities(): ShortDramaAgentWriteCapabilities {
  return {
    createArtifact: ['script', 'assets', 'storyboards', 'video', 'post'],
    updatePrompt: ['script', 'assets', 'storyboards', 'video', 'post'],
    attachMedia: ['assets', 'storyboards', 'video', 'post'],
    markDownstreamStale: ['script', 'assets', 'storyboards', 'video', 'post'],
    requestChange: ['script', 'assets', 'storyboards', 'video', 'post'],
  };
}

function scopeAllows(
  permissionScope: ShortDramaToolPermissionScope,
  targetScope: ShortDramaToolPermissionScope,
) {
  if (permissionScope === 'project') return true;
  if (permissionScope === 'stage') return targetScope === 'stage' || targetScope === 'artifact' || targetScope === 'asset';
  if (permissionScope === 'asset') return targetScope === 'asset';
  return targetScope === 'artifact';
}

function denyScope(message: string): ShortDramaToolAuthorizationResult {
  return {
    status: 'deny',
    source: SOURCE,
    error: {
      code: 'scope_denied',
      message,
    },
  };
}

function createSpecialistPermissions(stage: ShortDramaStage): ShortDramaToolPermission[] {
  return [
    allow('searchShortDramaProjectIndex', 'search', 'stage', 'Search only for stage-relevant coordinates supplied by the context package.', stage),
    allow('listShortDramaMedia', 'search', 'stage', 'List low-context media inventory for the current stage workspace.', stage),
    allow('readShortDramaMediaArtifact', 'read', 'artifact', 'Resolve the focused stage media item id to its artifact and read low-context media metadata.', stage),
    allow('readShortDramaArtifact', 'read', 'stage', 'Read focused artifact summaries in the current stage workspace.', stage),
    allow('explainShortDramaMediaArtifactChange', 'explain', 'artifact', 'Resolve the focused stage media item id to its artifact and explain change history without raw payloads.', stage),
    allow('explainShortDramaArtifactChange', 'explain', 'artifact', 'Explain the focused artifact change history without reading unrelated project state.', stage),
    allow('readShortDramaScriptSegment', 'read', 'stage', 'Read bounded script fragments included by the main AI context package.', stage),
    allow('updateShortDramaArtifactPrompt', 'updatePrompt', 'artifact', 'Patch the focused artifact prompt through revision history.', stage),
    allow('createShortDramaAttempt', 'createAttempt', 'artifact', 'Create a new attempt for the focused artifact only.', stage),
    allow('requestShortDramaReview', 'review', 'artifact', 'Ask the main AI to review the focused artifact output.', stage),
    requiresMainAIApproval('requestShortDramaGeneration', 'requestGeneration', 'artifact', 'Generation can be requested only for the focused artifact.', stage),
    allow('requestShortDramaChange', 'requestChange', 'stage', 'Create a structured cross-stage change request instead of mutating another stage directly.'),
    deny('createShortDramaDispatchPlan', 'dispatch', 'project', 'Only the main AI may dispatch other specialist agents.', stage),
    deny('deleteShortDramaArtifact', 'delete', 'artifact', 'Specialist agents cannot delete artifacts or media.', stage),
  ];
}

function createSpecialistReadScopes(
  actorRole: Exclude<ShortDramaAgentRole, 'orchestrator'>,
  stage: ShortDramaStage,
): ShortDramaAgentReadScopes {
  if (actorRole === 'director' && stage === 'script') {
    return {
      script: 'full',
      assets: 'allSummary',
      storyboards: 'episodeRelated',
      video: 'statusSummary',
      post: 'statusSummary',
    };
  }

  if (actorRole === 'image' && stage === 'assets') {
    return {
      script: 'episode',
      assets: 'allSummary',
      storyboards: 'episodeRelated',
      video: 'statusSummary',
      post: 'statusSummary',
    };
  }

  if ((actorRole === 'director' && stage === 'storyboards') || (actorRole === 'image' && stage === 'storyboards')) {
    return {
      script: 'segment',
      assets: 'referenced',
      storyboards: 'episodeRelated',
      video: 'statusSummary',
      post: 'statusSummary',
    };
  }

  if (actorRole === 'video') {
    return {
      script: 'segment',
      assets: 'referenced',
      storyboards: 'referenced',
      video: 'referenced',
      post: 'statusSummary',
    };
  }

  return {
    script: 'segment',
    assets: 'referenced',
    storyboards: 'referenced',
    video: 'referenced',
    post: 'statusSummary',
  };
}

function createSpecialistWriteCapabilities(
  actorRole: Exclude<ShortDramaAgentRole, 'orchestrator'>,
  stage: ShortDramaStage,
): ShortDramaAgentWriteCapabilities {
  const empty: ShortDramaAgentWriteCapabilities = {
    createArtifact: [],
    updatePrompt: [],
    attachMedia: [],
    markDownstreamStale: [],
    requestChange: [],
  };

  if (actorRole === 'director' && stage === 'script') {
    return {
      ...empty,
      createArtifact: ['script'],
      updatePrompt: ['script'],
      markDownstreamStale: ['assets', 'storyboards', 'video', 'post'],
      requestChange: ['assets', 'storyboards', 'video', 'post'],
    };
  }

  if (actorRole === 'image' && stage === 'assets') {
    return {
      ...empty,
      createArtifact: ['assets'],
      updatePrompt: ['assets'],
      attachMedia: ['assets'],
      markDownstreamStale: ['storyboards', 'video', 'post'],
      requestChange: ['script', 'storyboards', 'video', 'post'],
    };
  }

  if ((actorRole === 'director' && stage === 'storyboards') || (actorRole === 'image' && stage === 'storyboards')) {
    return {
      ...empty,
      createArtifact: ['storyboards'],
      updatePrompt: ['storyboards'],
      attachMedia: ['storyboards'],
      markDownstreamStale: ['video', 'post'],
      requestChange: ['script', 'assets', 'video', 'post'],
    };
  }

  if (actorRole === 'video') {
    return {
      ...empty,
      createArtifact: ['video'],
      updatePrompt: ['video'],
      attachMedia: ['video'],
      markDownstreamStale: ['post'],
      requestChange: ['script', 'assets', 'storyboards', 'post'],
    };
  }

  return {
    ...empty,
    createArtifact: ['post'],
    updatePrompt: ['post'],
    attachMedia: ['post'],
    requestChange: ['script', 'assets', 'storyboards', 'video'],
  };
}

function createOrchestratorForbiddenActions(): ShortDramaToolForbiddenAction[] {
  return [
    'read_full_chat_history',
    'overwrite_prompt_revision_history',
    'access_raw_media_without_media_summary_tool',
    'delete_artifacts_or_media',
  ];
}

function createSpecialistForbiddenActions(): ShortDramaToolForbiddenAction[] {
  return [
    'modify_other_stage_without_main_ai_dispatch',
    'read_full_chat_history',
    'overwrite_prompt_revision_history',
    'access_raw_media_without_media_summary_tool',
    'delete_artifacts_or_media',
    'dispatch_other_specialist_agents',
    'bypass_revision_attempt_history',
  ];
}

function allow(
  tool: string,
  capability: ShortDramaToolPermissionCapability,
  scope: ShortDramaToolPermissionScope,
  reason: string,
  stage?: ShortDramaStage,
): ShortDramaToolPermission {
  return { tool, capability, access: 'allow', scope, stage, reason };
}

function requiresMainAIApproval(
  tool: string,
  capability: ShortDramaToolPermissionCapability,
  scope: ShortDramaToolPermissionScope,
  reason: string,
  stage?: ShortDramaStage,
): ShortDramaToolPermission {
  return { tool, capability, access: 'requiresMainAIApproval', scope, stage, reason };
}

function deny(
  tool: string,
  capability: ShortDramaToolPermissionCapability,
  scope: ShortDramaToolPermissionScope,
  reason: string,
  stage?: ShortDramaStage,
): ShortDramaToolPermission {
  return { tool, capability, access: 'deny', scope, stage, reason };
}

function validateStageForRole(actorRole: ShortDramaAgentRole, stage?: ShortDramaStage) {
  if (actorRole === 'orchestrator') return undefined;
  if (!stage) {
    return {
      code: 'missing_workspace',
      message: 'Specialist tool policy requires a stage workspace.',
    } as const;
  }

  const allowedStages = stagesForRole(actorRole);
  if (!allowedStages.includes(stage)) {
    return {
      code: 'unsupported_runtime',
      message: `Specialist role ${actorRole} cannot own ${stage} workspace tools.`,
    } as const;
  }

  return undefined;
}

function stagesForRole(actorRole: Exclude<ShortDramaAgentRole, 'orchestrator'>): ShortDramaStage[] {
  if (actorRole === 'director') return ['script', 'storyboards'];
  if (actorRole === 'image') return ['assets', 'storyboards'];
  if (actorRole === 'video') return ['video'];
  return ['post'];
}
