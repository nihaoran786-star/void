import type { CodeSnippetContext } from '@/shared/types/context';
import { createShortDramaMainAITools } from './ShortDramaMainAITools';
import type {
  ShortDramaProject,
  ShortDramaStageAgentSessionCandidate,
  ShortDramaStageWorkspacePanelState,
} from './ShortDramaTypes';
import type { ShortDramaStageAgentBinding } from './ShortDramaStageAgentSessionBinding';

const SOURCE = 'short-drama-main-ai-context-export' as const;

export interface ShortDramaMainAIContextExportOptions {
  activeStage?: ShortDramaProject['activeStage'];
  activeEpisodeId?: string;
  activeArtifactIdOrHandle?: string;
  panelState?: ShortDramaStageWorkspacePanelState;
  stageAgentSessions?: ShortDramaStageAgentSessionCandidate[];
  stageAgentBindings?: ShortDramaStageAgentBinding[];
  parentSessionId?: string;
  workspacePath?: string;
  timestamp?: number;
}

export type ShortDramaMainAIContextExportResult =
  | {
      status: 'ready';
      source: typeof SOURCE;
      awareness: ReturnType<ReturnType<typeof createShortDramaMainAITools>['getShortDramaProjectAwareness']>;
      context: CodeSnippetContext;
    }
  | {
      status: 'error';
      source: typeof SOURCE;
      error: {
        code: 'artifact_missing' | 'unsupported_runtime';
        message: string;
      };
    };

export function createShortDramaMainAIContextExport(
  project: ShortDramaProject,
  options: ShortDramaMainAIContextExportOptions = {},
): ShortDramaMainAIContextExportResult {
  const tools = createShortDramaMainAITools(project);
  const awareness = tools.getShortDramaProjectAwareness(options);
  if (awareness.status !== 'ready') {
    return {
      status: 'error',
      source: SOURCE,
      error: {
        code: 'unsupported_runtime',
        message: 'Short drama project awareness could not be created.',
      },
    };
  }

  const contextText = renderShortDramaMainAIContext(awareness);

  return {
    status: 'ready',
    source: SOURCE,
    awareness,
    context: {
      id: createShortDramaContextId(project.projectId),
      type: 'code-snippet',
      timestamp: options.timestamp ?? Date.now(),
      filePath: '.void/short-drama/awareness.md',
      fileName: 'short-drama-awareness.md',
      startLine: 1,
      endLine: contextText.split('\n').length,
      selectedText: contextText,
      language: 'markdown',
      metadata: {
        source: SOURCE,
        projectId: project.projectId,
        activeStage: awareness.activeStage,
        activeEpisodeId: awareness.activeEpisodeId,
      },
    },
  };
}

function createShortDramaContextId(projectId: string) {
  return ['short-drama-context', projectId].filter(Boolean).join('-');
}

function renderShortDramaMainAIContext(
  awareness: Extract<ShortDramaMainAIContextExportResult, { status: 'ready' }>['awareness'],
) {
  const activeEpisode = awareness.episodes.activeEpisodeNumber ?? 'none';
  const media = awareness.media;
  const stageLines = awareness.stageSummaries
    .map(stage => `- ${stage.stage}: total=${stage.total}, ready=${stage.ready}, running=${stage.running}, issues=${stage.issues}, media=${stage.media}, playableMedia=${stage.playableMedia}, emptyMedia=${stage.emptyMedia}`)
    .join('\n');
  const stageAgentLines = awareness.stageAgents
    .map(agent => {
      if (agent.status === 'ready') {
        return `- ${agent.stage}: agent=${agent.agentName}, status=ready, childSessionId=${agent.childSessionId}, bindingStatus=${agent.bindingStatus ?? 'unknown'}, matchedBy=${agent.matchedBy}`;
      }
      if (agent.status === 'conflict') {
        return `- ${agent.stage}: agent=${agent.agentName}, status=conflict, candidates=${agent.candidateCount}, bindingStatus=${agent.bindingStatus ?? 'unknown'}`;
      }
      return `- ${agent.stage}: agent=${agent.agentName ?? 'unknown'}, status=pending, reason=${agent.reason}, bindingStatus=${agent.bindingStatus ?? 'unknown'}`;
    })
    .join('\n');
  const nextReads = awareness.nextReads
    .map(item => `- ${item.tool}: ${item.reason}`)
    .join('\n');

  return [
    '# Short Drama Right Panel',
    '',
    `projectId: ${awareness.projectId}`,
    `title: ${awareness.title}`,
    `projectStatus: ${awareness.projectStatus}`,
    `activeStage: ${awareness.activeStage}`,
    `activeEpisodeId: ${awareness.activeEpisodeId ?? 'none'}`,
    `activeEpisode: ${activeEpisode}`,
    `episodesTotal: ${awareness.episodes.total}`,
    '',
    '## Media Index',
    `total: ${media.total}`,
    `ready: ${media.ready}`,
    `empty: ${media.empty}`,
    `error: ${media.error}`,
    `unsupported: ${media.unsupported}`,
    `playable: ${media.playable}`,
    `previewAvailable: ${media.previewAvailable}`,
    '',
    '## Stage Summaries',
    stageLines,
    '',
    '## Stage Agents',
    stageAgentLines,
    '',
    '## Recommended Tool Order',
    awareness.availableTools.map(tool => `- ${tool}`).join('\n'),
    '',
    '## Next Reads',
    nextReads,
    '',
    'Raw media URLs, full script, raw payloads, and full histories are intentionally omitted.',
  ].join('\n');
}
