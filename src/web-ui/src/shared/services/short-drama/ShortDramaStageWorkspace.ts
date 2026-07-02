import {
  createShortDramaMediaArtifactIndex,
  resolveShortDramaArtifactReference,
} from './ShortDramaArtifactIndex';
import {
  getShortDramaNativeStageAgentName,
  resolveShortDramaRealStageAgentSession,
} from './ShortDramaRealStageAgentSessionResolver';
import type { ShortDramaStageAgentBinding } from './ShortDramaStageAgentSessionBinding';
import type {
  ShortDramaProject,
  ShortDramaStage,
  ShortDramaStageAgentRole,
  ShortDramaStageAgentSessionCandidate,
  ShortDramaStageAgentContextResult,
  ShortDramaStageWorkspace,
  ShortDramaStageWorkspaceFocusInput,
  ShortDramaStageWorkspaceFocusResult,
  ShortDramaStageWorkspacePanelState,
} from './ShortDramaTypes';

const STAGES: ShortDramaStage[] = ['script', 'assets', 'storyboards', 'video', 'post'];

export function createShortDramaStageWorkspaces(
  project: ShortDramaProject,
  options: {
    selectedStage?: ShortDramaStage;
    activeEpisodeId?: string;
    activeArtifactIdOrHandle?: string;
    panelState?: ShortDramaStageWorkspacePanelState;
    stageAgentSessions?: ShortDramaStageAgentSessionCandidate[];
    stageAgentBindings?: ShortDramaStageAgentBinding[];
    parentSessionId?: string;
    workspacePath?: string;
  } = {},
): ShortDramaStageWorkspace[] {
  const activeEpisodeId = options.activeEpisodeId
    ?? project.activeEpisodeId
    ?? project.episodes[0]?.id;

  return STAGES.map(stage => {
    const workspace = createWorkspace(project, stage, {
      activeEpisodeId: stage === 'assets' ? undefined : activeEpisodeId,
      panelState: stage === options.selectedStage ? options.panelState ?? 'open' : 'collapsed',
      lastFocusSource: 'initial',
      activeArtifactIdOrHandle: stage === options.selectedStage ? options.activeArtifactIdOrHandle : undefined,
      stageAgentSessions: options.stageAgentSessions ?? [],
      stageAgentBindings: options.stageAgentBindings ?? [],
      parentSessionId: options.parentSessionId,
      workspacePath: options.workspacePath,
    });

    if (stage !== options.selectedStage || !options.activeArtifactIdOrHandle?.trim()) {
      return workspace;
    }

    const focused = updateShortDramaStageWorkspaceFocus(project, workspace, {
      stage,
      artifactIdOrHandle: options.activeArtifactIdOrHandle,
      source: 'initial',
    });
    return focused.status === 'ready' ? focused.workspace : workspace;
  });
}

export function updateShortDramaStageWorkspaceFocus(
  project: ShortDramaProject,
  workspace: ShortDramaStageWorkspace,
  input: ShortDramaStageWorkspaceFocusInput,
): ShortDramaStageWorkspaceFocusResult {
  if (input.episodeId && !project.episodes.some(episode => episode.id === input.episodeId)) {
    return {
      status: 'error',
      source: 'stage-workspace',
      error: { code: 'episode_missing', message: 'Short drama episode was not found.' },
    };
  }

  if (!input.artifactIdOrHandle?.trim()) {
    return {
      status: 'ready',
      source: 'stage-workspace',
      workspace: {
        ...workspace,
        stage: input.stage,
        activeEpisodeId: input.stage === 'assets' ? undefined : input.episodeId ?? workspace.activeEpisodeId,
        activeArtifactId: undefined,
        activeArtifactHandle: undefined,
        activeMedia: undefined,
        lastFocusSource: input.source,
      },
    };
  }

  const resolved = resolveShortDramaArtifactReference(project, input.artifactIdOrHandle);
  if (resolved.status !== 'ready') {
    return resolved;
  }
  if (resolved.artifact.stage !== input.stage) {
    return {
      status: 'error',
      source: 'stage-workspace',
      error: createStageMismatchError(input.stage),
    };
  }

  return {
    status: 'ready',
    source: 'stage-workspace',
    workspace: {
      ...workspace,
      stage: input.stage,
      activeEpisodeId: input.stage === 'assets' ? undefined : resolved.artifact.episodeId,
      activeArtifactId: resolved.artifact.id,
      activeArtifactHandle: resolved.entry.handle,
      activeMedia: createActiveMediaFocus(project, resolved.artifact.id),
      lastFocusSource: input.source,
    },
  };
}

export function createShortDramaStageMismatchError(stage: ShortDramaStage) {
  return createStageMismatchError(stage);
}

export function createShortDramaStageAgentContext(
  workspace: ShortDramaStageWorkspace,
  workspacePath?: string,
): ShortDramaStageAgentContextResult {
  if (!workspace.specialistSessionId) {
    return { status: 'pending', source: 'stage-workspace', workspace, reason: 'session_missing' };
  }

  if (!workspace.parentSessionId) {
    return { status: 'pending', source: 'stage-workspace', workspace, reason: 'parent_missing' };
  }
  if (workspace.stageAgentSessionResolution?.status === 'conflict') {
    return {
      status: 'unsupported',
      source: 'stage-workspace',
      workspace,
      error: workspace.stageAgentSessionResolution.error,
    };
  }

  return {
    status: 'ready',
    source: 'stage-workspace',
    workspace,
    openRequest: {
      panelContentType: 'btw-session',
      childSessionId: workspace.specialistSessionId,
      parentSessionId: workspace.parentSessionId,
      workspacePath,
      sessionKind: 'subagent',
      sessionTitle: createStageAgentSessionTitle(workspace),
      agentType: getShortDramaNativeStageAgentName(workspace.stage),
      parentToolCallId: workspace.parentToolCallId,
      subagentType: getShortDramaNativeStageAgentName(workspace.stage),
      duplicateCheckKey: `btw-session-${workspace.specialistSessionId}`,
      targetGroup: 'secondary',
      enableSplitView: true,
      replaceExisting: true,
    },
  };
}

export function getShortDramaStageAgentRole(stage: ShortDramaStage): ShortDramaStageAgentRole {
  if (stage === 'assets') return 'asset';
  if (stage === 'storyboards') return 'storyboard';
  if (stage === 'video') return 'video';
  if (stage === 'post') return 'post';
  return 'director';
}

function createWorkspace(
  project: ShortDramaProject,
  stage: ShortDramaStage,
  options: Pick<ShortDramaStageWorkspace, 'activeEpisodeId' | 'panelState' | 'lastFocusSource'> & {
    activeArtifactIdOrHandle?: string;
    stageAgentSessions: ShortDramaStageAgentSessionCandidate[];
    stageAgentBindings: ShortDramaStageAgentBinding[];
    parentSessionId?: string;
    workspacePath?: string;
  },
): ShortDramaStageWorkspace {
  const stageAgentBinding = options.stageAgentBindings.find(binding => binding.stage === stage);
  const stageAgentSessionResolution = resolveShortDramaRealStageAgentSession({
    project,
    stage,
    activeArtifactIdOrHandle: options.activeArtifactIdOrHandle,
    parentSessionId: options.parentSessionId,
    workspacePath: options.workspacePath,
    stageAgentBindings: options.stageAgentBindings,
    sessions: options.stageAgentSessions,
  });
  const workspace: ShortDramaStageWorkspace = {
    projectId: project.projectId,
    stage,
    activeEpisodeId: options.activeEpisodeId,
    specialistAgentRole: getShortDramaStageAgentRole(stage),
    stageAgentSessionResolution,
    stageAgentBindingStatus: stageAgentBinding?.status,
    panelState: options.panelState,
    lastFocusSource: options.lastFocusSource,
  };

  if (stageAgentSessionResolution.status !== 'ready') {
    return workspace;
  }

  return {
    ...workspace,
    specialistSessionId: stageAgentSessionResolution.childSessionId,
    parentSessionId: stageAgentSessionResolution.parentSessionId,
    parentToolCallId: stageAgentSessionResolution.parentToolCallId,
  };
}

function createActiveMediaFocus(project: ShortDramaProject, artifactId: string): ShortDramaStageWorkspace['activeMedia'] {
  const mediaEntry = createShortDramaMediaArtifactIndex(project, { includeEmpty: true })
    .find(entry => entry.artifactId === artifactId);
  if (!mediaEntry) return undefined;

  return {
    artifactHandle: mediaEntry.artifactHandle,
    mediaKind: mediaEntry.mediaKind,
    mediaStatus: mediaEntry.mediaStatus,
    mediaItemId: mediaEntry.mediaItemId,
    previewAvailable: mediaEntry.previewAvailable,
    playable: mediaEntry.playable,
  };
}

function createStageAgentSessionTitle(workspace: ShortDramaStageWorkspace) {
  const focus = workspace.activeArtifactHandle ? ` · ${workspace.activeArtifactHandle}` : '';
  return `${getShortDramaNativeStageAgentName(workspace.stage)}${focus}`;
}

function createStageMismatchError(stage: ShortDramaStage) {
  return {
    code: 'stage_mismatch' as const,
    message: `Focused short drama artifact does not belong to the ${stage} workspace.`,
  };
}
