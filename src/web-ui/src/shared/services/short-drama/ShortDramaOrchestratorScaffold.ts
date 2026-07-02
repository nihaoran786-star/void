import type {
  ShortDramaArtifact,
  ShortDramaArtifactReviewInput,
  ShortDramaArtifactReviewResult,
  ShortDramaMainAIDispatchPlanInput,
  ShortDramaMainAIDispatchPlanResult,
  ShortDramaMainAIDispatchTask,
  ShortDramaProject,
  ShortDramaReviewDecisionInput,
  ShortDramaReviewDecisionResult,
  ShortDramaStage,
  ShortDramaStageAgentRole,
  ShortDramaStageReviewInput,
  ShortDramaStageReviewResult,
} from './ShortDramaTypes';
import { createShortDramaArtifactIndex } from './ShortDramaArtifactIndex';

const SOURCE = 'short-drama-orchestrator-scaffold' as const;
const DISPATCHABLE_STATUSES = new Set<ShortDramaArtifact['status']>([
  'pending',
  'generating',
  'reviewing',
  'revising',
  'stale',
  'error',
  'unsupported',
  'needs_intervention',
]);

export function createShortDramaMainAIDispatchPlan(
  project: ShortDramaProject,
  input: ShortDramaMainAIDispatchPlanInput,
): ShortDramaMainAIDispatchPlanResult {
  const plan = {
    planId: `dispatch-${project.projectId}-${stablePlanSuffix(input.userGoal)}`,
    projectId: project.projectId,
    userGoal: input.userGoal,
    mode: project.productionPlan.mode,
    tasks: [] as ShortDramaMainAIDispatchTask[],
  };

  if (project.productionPlan.mode === 'semiAutomatic' && !input.approved) {
    return { status: 'needs_approval', source: SOURCE, plan };
  }

  const candidates = project.artifacts
    .filter(artifact => DISPATCHABLE_STATUSES.has(artifact.status))
    .filter(artifact => input.targetStage ? artifact.stage === input.targetStage : true)
    .filter(artifact => input.targetArtifactIds?.length ? input.targetArtifactIds.includes(artifact.id) : true);
  const grouped = groupByStage(candidates);
  const artifactHandleById = new Map(createShortDramaArtifactIndex(project).map(entry => [entry.id, entry.handle]));
  const tasks = [...grouped.entries()].map(([stage, artifacts]) => createDispatchTask(project.projectId, stage, artifacts, input, artifactHandleById));
  const nextPlan = { ...plan, tasks };

  if (tasks.length === 0) {
    return { status: 'empty', source: SOURCE, plan: nextPlan, reason: 'no_dispatchable_artifacts' };
  }

  return { status: 'ready', source: SOURCE, plan: nextPlan };
}

export function reviewShortDramaArtifactOutput(
  project: ShortDramaProject,
  input: ShortDramaArtifactReviewInput,
): ShortDramaArtifactReviewResult {
  const artifact = project.artifacts.find(item => item.id === input.artifactId);
  if (!artifact) {
    return {
      status: 'error',
      source: SOURCE,
      error: { code: 'artifact_missing', message: 'Short drama artifact was not found.' },
    };
  }

  const timestamp = input.timestamp ?? Date.now();
  if (input.severity === 'pass') {
    return {
      status: 'pass',
      source: SOURCE,
      project: updateArtifact(project, artifact.id, item => {
        const revision = {
          id: `revision-review-pass-${item.id}-${timestamp}`,
          version: item.revisions.length + 1,
          createdAt: timestamp,
          summary: input.finding,
          reason: input.finding,
          source: 'mainAI' as const,
          changedFields: ['status', 'statusReason'],
        };

        return {
          ...item,
          status: 'ready',
          statusReason: input.finding,
          revisionCount: item.revisions.length + 1,
          revisions: [...item.revisions, revision],
        };
      }),
      review: {
        reviewId: `review-${artifact.id}-${timestamp}`,
        artifactId: artifact.id,
        stage: artifact.stage,
        status: 'pass',
        findings: [input.finding],
        retryBudgetRemaining: input.retryBudget,
        userDecisionRequired: false,
      },
    };
  }

  const retryBudgetRemaining = Math.max(0, input.retryBudget - 1);
  const needsUserReview = input.severity === 'major' || input.severity === 'blocked' || retryBudgetRemaining === 0;
  const reviewStatus = needsUserReview ? 'needsUserReview' : 'needsCorrection';
  const correctionInstruction = needsUserReview
    ? undefined
    : createCorrectionInstruction(artifact, input.finding);
  const nextProject = updateArtifact(project, artifact.id, item => {
    if (needsUserReview) {
      return {
        ...item,
        status: input.severity === 'blocked' ? 'error' : 'needs_intervention',
        statusReason: input.finding,
      };
    }

    return {
      ...item,
      status: 'revising',
      statusReason: input.finding,
      attemptCount: item.attempts.length + 1,
      attempts: [
        ...item.attempts,
        {
          id: `attempt-correction-${item.id}-${timestamp}`,
          status: 'created',
          createdAt: timestamp,
          orchestratorCorrection: correctionInstruction,
        },
      ],
    };
  });

  return {
    status: reviewStatus,
    source: SOURCE,
    project: nextProject,
    review: {
      reviewId: `review-${artifact.id}-${timestamp}`,
      artifactId: artifact.id,
      stage: artifact.stage,
      status: reviewStatus,
      findings: [input.finding],
      correctionInstruction,
      retryBudgetRemaining,
      userDecisionRequired: needsUserReview,
    },
  };
}

export function reviewShortDramaStageOutput(
  project: ShortDramaProject,
  input: ShortDramaStageReviewInput,
): ShortDramaStageReviewResult {
  const stageArtifacts = project.artifacts.filter(artifact => artifact.stage === input.stage);
  if (stageArtifacts.length === 0) {
    return { status: 'empty', source: SOURCE, reason: 'stage_has_no_artifacts' };
  }

  const timestamp = input.timestamp ?? Date.now();
  if (input.severity === 'pass') {
    return {
      status: 'pass',
      source: SOURCE,
      project: updateArtifacts(project, stageArtifacts.map(artifact => artifact.id), item => {
        const revision = {
          id: `revision-stage-review-pass-${item.id}-${timestamp}`,
          version: item.revisions.length + 1,
          createdAt: timestamp,
          summary: input.finding,
          reason: input.finding,
          source: 'mainAI' as const,
          changedFields: ['status', 'statusReason'],
        };

        return {
          ...item,
          status: 'ready',
          statusReason: input.finding,
          revisionCount: item.revisions.length + 1,
          revisions: [...item.revisions, revision],
        };
      }),
      affectedArtifactIds: stageArtifacts.map(artifact => artifact.id),
      review: {
        reviewId: `stage-review-${input.stage}-${timestamp}`,
        stage: input.stage,
        status: 'pass',
        findings: [input.finding],
        retryBudgetRemaining: input.retryBudget,
        userDecisionRequired: false,
      },
    };
  }

  const retryBudgetRemaining = Math.max(0, input.retryBudget - 1);
  const needsUserReview = input.severity === 'major' || input.severity === 'blocked' || retryBudgetRemaining === 0;
  const reviewStatus = needsUserReview ? 'needsUserReview' : 'needsCorrection';
  const correctionInstruction = needsUserReview
    ? undefined
    : createStageCorrectionInstruction(input.stage, input.finding);
  const affectedArtifactIds = stageArtifacts.map(artifact => artifact.id);

  return {
    status: reviewStatus,
    source: SOURCE,
    project: updateArtifacts(project, affectedArtifactIds, item => {
      if (needsUserReview) {
        return {
          ...item,
          status: input.severity === 'blocked' ? 'error' : 'needs_intervention',
          statusReason: input.finding,
        };
      }

      return {
        ...item,
        status: 'revising',
        statusReason: input.finding,
        attemptCount: item.attempts.length + 1,
        attempts: [
          ...item.attempts,
          {
            id: `attempt-stage-correction-${item.id}-${timestamp}`,
            status: 'created',
            createdAt: timestamp,
            orchestratorCorrection: correctionInstruction,
          },
        ],
      };
    }),
    affectedArtifactIds,
    review: {
      reviewId: `stage-review-${input.stage}-${timestamp}`,
      stage: input.stage,
      status: reviewStatus,
      findings: [input.finding],
      correctionInstruction,
      retryBudgetRemaining,
      userDecisionRequired: needsUserReview,
    },
  };
}

export function applyShortDramaReviewDecision(
  project: ShortDramaProject,
  input: ShortDramaReviewDecisionInput,
): ShortDramaReviewDecisionResult {
  const artifact = project.artifacts.find(item => item.id === input.artifactId);
  if (!artifact) {
    return {
      status: 'error',
      source: SOURCE,
      error: { code: 'artifact_missing', message: 'Short drama artifact was not found.' },
    };
  }

  const timestamp = input.timestamp ?? Date.now();
  const nextProject = updateArtifact(project, artifact.id, item => {
    const revision = {
      id: `revision-review-decision-${item.id}-${timestamp}`,
      version: item.revisions.length + 1,
      createdAt: timestamp,
      summary: input.reason,
      reason: input.reason,
      source: 'user' as const,
    };

    if (input.decision === 'keep') {
      return {
        ...item,
        status: 'ready',
        statusReason: input.reason,
        revisionCount: item.revisions.length + 1,
        revisions: [...item.revisions, revision],
      };
    }

    return {
      ...item,
      status: input.decision === 'regenerate' ? 'generating' : 'revising',
      statusReason: input.reason,
      revisionCount: item.revisions.length + 1,
      attemptCount: item.attempts.length + 1,
      revisions: [...item.revisions, revision],
      attempts: [
        ...item.attempts,
        {
          id: `attempt-user-${input.decision}-${item.id}-${timestamp}`,
          status: 'created',
          createdAt: timestamp,
          inputInstruction: input.reason,
        },
      ],
    };
  });

  return { status: 'ready', source: SOURCE, project: nextProject, artifactId: artifact.id };
}

function createDispatchTask(
  projectId: string,
  stage: ShortDramaStage,
  artifacts: ShortDramaArtifact[],
  input: ShortDramaMainAIDispatchPlanInput,
  artifactHandleById: Map<string, string>,
): ShortDramaMainAIDispatchTask {
  const specialistRole = specialistRoleForStage(stage);
  const targetArtifactIds = artifacts.map(artifact => artifact.id);
  const hasOnlyUnsupported = artifacts.every(artifact => artifact.status === 'unsupported');
  const dispatchTarget = resolveDispatchTarget(stage, artifacts, input);

  return {
    taskId: `task-${stage}-${targetArtifactIds.join('-')}`,
    stage,
    targetArtifactIds,
    specialistRole,
    specialistSessionId: dispatchTarget.childSessionId,
    persistentSessionId: dispatchTarget.source === 'stage-agent-binding' ? dispatchTarget.childSessionId : undefined,
    dispatchTarget,
    instruction: `${input.userGoal}\nFocus on ${stage} artifacts: ${artifacts.map(artifact => artifact.title).join('; ')}.`,
    userGoal: input.userGoal,
    contextPackage: createDispatchContextPackage(projectId, stage, artifacts, input, artifactHandleById),
    requiresApproval: input.approved !== true,
    requiredInputs: requiredInputsForStage(stage),
    expectedOutputs: expectedOutputsForStage(stage),
    status: hasOnlyUnsupported ? 'blocked' : 'ready',
    blockedReason: hasOnlyUnsupported ? 'Provider or runtime support is not connected for these artifacts.' : undefined,
  };
}

function resolveDispatchTarget(
  stage: ShortDramaStage,
  artifacts: ShortDramaArtifact[],
  input: ShortDramaMainAIDispatchPlanInput,
): NonNullable<ShortDramaMainAIDispatchTask['dispatchTarget']> {
  const stageBinding = input.stageAgentBindings?.find(binding => binding.stage === stage);
  if (stageBinding?.status === 'ready' && stageBinding.childSessionId) {
    return {
      status: 'ready',
      source: 'stage-agent-binding',
      childSessionId: stageBinding.childSessionId,
      parentSessionId: stageBinding.parentSessionId ?? input.parentSessionId,
      agentName: stageBinding.agentName,
      bindingStatus: stageBinding.status,
    };
  }

  const artifactBoundSessionId = artifacts.find(artifact => artifact.subagentSessionId)?.subagentSessionId;
  if (artifactBoundSessionId) {
    return {
      status: 'ready',
      source: 'artifact-binding',
      childSessionId: artifactBoundSessionId,
      parentSessionId: input.parentSessionId,
      bindingStatus: stageBinding?.status,
    };
  }

  return {
    status: 'pending',
    source: 'unbound',
    parentSessionId: input.parentSessionId,
    agentName: stageBinding?.agentName,
    bindingStatus: stageBinding?.status,
  };
}

function groupByStage(artifacts: ShortDramaArtifact[]) {
  return artifacts.reduce<Map<ShortDramaStage, ShortDramaArtifact[]>>((groups, artifact) => {
    const items = groups.get(artifact.stage) ?? [];
    items.push(artifact);
    groups.set(artifact.stage, items);
    return groups;
  }, new Map());
}

function specialistRoleForStage(stage: ShortDramaStage): ShortDramaStageAgentRole {
  if (stage === 'assets') return 'asset';
  if (stage === 'storyboards') return 'storyboard';
  if (stage === 'video') return 'video';
  if (stage === 'post') return 'post';
  return 'director';
}

function requiredInputsForStage(stage: ShortDramaStage) {
  if (stage === 'script') return ['user_goal', 'script_document'];
  if (stage === 'assets') return ['script_segments', 'style_constraints'];
  if (stage === 'storyboards') return ['script_segments', 'asset_references'];
  if (stage === 'video') return ['storyboard_references', 'asset_references', 'media_constraints'];
  return ['video_references', 'audio_subtitle_requirements'];
}

function expectedOutputsForStage(stage: ShortDramaStage) {
  if (stage === 'script') return ['script_revision', 'script_segment_index'];
  if (stage === 'assets') return ['media_reference', 'prompt_revision'];
  if (stage === 'storyboards') return ['storyboard_frames', 'prompt_revision'];
  if (stage === 'video') return ['media_reference', 'attempt_status'];
  return ['final_preview', 'review_status'];
}

function createCorrectionInstruction(artifact: ShortDramaArtifact, finding: string) {
  return [
    `Revise ${artifact.title}.`,
    `Finding: ${finding}`,
    'Keep the existing project style, stable artifact id, and revision history.',
    'Return only a new attempt output and do not rewrite unrelated stages.',
  ].join('\n');
}

function createStageCorrectionInstruction(stage: ShortDramaStage, finding: string) {
  return [
    `Revise the ${stage} workspace outputs that do not match project continuity.`,
    `Finding: ${finding}`,
    'Keep stable artifact ids, current episode coordinates, and existing revision history.',
    'Return limited corrections for this stage only; do not rewrite unrelated stages.',
  ].join('\n');
}

function createDispatchContextPackage(
  projectId: string,
  stage: ShortDramaStage,
  artifacts: ShortDramaArtifact[],
  input: ShortDramaMainAIDispatchPlanInput,
  artifactHandleById: Map<string, string>,
) {
  return {
    source: SOURCE,
    projectId,
    stage,
    userGoal: input.userGoal,
    artifactCount: artifacts.length,
    targetHandles: artifacts.map(artifact => artifactHandleById.get(artifact.id) ?? artifact.handle ?? artifact.id),
    targetMediaItemIds: artifacts.flatMap(artifact => artifact.mediaReference?.mediaItemId ? [artifact.mediaReference.mediaItemId] : []),
    omittedSections: [
      'fullScriptDocument' as const,
      'rawMediaPayloads' as const,
      'fullRevisionHistory' as const,
      'unrelatedStages' as const,
    ],
  };
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

function updateArtifacts(
  project: ShortDramaProject,
  artifactIds: string[],
  update: (artifact: ShortDramaArtifact) => ShortDramaArtifact,
): ShortDramaProject {
  const idSet = new Set(artifactIds);
  return {
    ...project,
    artifacts: project.artifacts.map(artifact => idSet.has(artifact.id) ? update(artifact) : artifact),
  };
}

function stablePlanSuffix(value: string) {
  const normalized = value.trim().toLowerCase();
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
