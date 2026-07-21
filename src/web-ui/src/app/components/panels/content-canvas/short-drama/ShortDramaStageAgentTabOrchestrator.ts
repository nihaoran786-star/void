import type { PanelContent } from '@/app/components/panels/base/types';
import type {
  CanvasTab,
  EditorGroupId,
  EditorGroupState,
  SplitMode,
} from '@/app/components/panels/content-canvas/types';
import {
  areShortDramaWorkspacePathsEqual,
  createShortDramaStageAgentContext,
  type ShortDramaStageAgentContextResult,
  type ShortDramaStageWorkspace,
} from '@/shared/services/short-drama';

export interface ShortDramaStageAgentCanvasGateway {
  primaryGroup: EditorGroupState;
  secondaryGroup: EditorGroupState;
  tertiaryGroup: EditorGroupState;
  getSplitMode(): SplitMode;
  findTabByMetadata(metadata: Record<string, unknown>): { tab: CanvasTab; groupId: EditorGroupId } | null;
  addTab(content: PanelContent, state: 'active', groupId: EditorGroupId): void;
  updateTabContent(tabId: string, groupId: EditorGroupId, content: PanelContent): void;
  switchToTab(tabId: string, groupId: EditorGroupId): void;
  moveTabToGroup(tabId: string, fromGroupId: EditorGroupId, toGroupId: EditorGroupId, index?: number): void;
  closeTab(tabId: string, groupId: EditorGroupId, options?: { forceRemove?: boolean }): void;
  setSplitMode(mode: Extract<SplitMode, 'horizontal' | 'vertical'>): void;
}

export interface ShortDramaStageAgentTabOpenOptions {
  contentBuilder?: (
    childSessionId: string,
    parentSessionId: string,
    workspacePath: string | undefined,
    title: string,
  ) => PanelContent;
  expandRightPanel?: () => void;
}

export type ShortDramaStageAgentTabOpenResult =
  | { status: 'ready'; source: 'short-drama-stage-agent-tab'; childSessionId: string; groupId: 'secondary' }
  | { status: 'pending'; source: 'short-drama-stage-agent-tab'; reason: 'session_missing' | 'parent_missing' }
  | { status: 'unsupported'; source: 'short-drama-stage-agent-tab'; context: ShortDramaStageAgentContextResult };

export function openShortDramaRealStageAgentTab(
  workspace: ShortDramaStageWorkspace,
  workspacePath: string | undefined,
  canvas: ShortDramaStageAgentCanvasGateway,
  options: ShortDramaStageAgentTabOpenOptions = {},
): ShortDramaStageAgentTabOpenResult {
  const context = createShortDramaStageAgentContext(workspace, workspacePath);
  if (context.status === 'pending') {
    closeLegacyStageAgentTabs(canvas, workspace, '', workspacePath);
    closeOtherStageAgentTabs(canvas, workspace);
    return { status: 'pending', source: 'short-drama-stage-agent-tab', reason: context.reason };
  }
  if (context.status !== 'ready') {
    return { status: 'unsupported', source: 'short-drama-stage-agent-tab', context };
  }

  const { openRequest } = context;
  if (!openRequest.parentSessionId) {
    return { status: 'pending', source: 'short-drama-stage-agent-tab', reason: 'parent_missing' };
  }

  const contentBuilder = options.contentBuilder ?? buildBtwSessionPanelContent;
  const content = withShortDramaStageMetadata(
    contentBuilder(
      openRequest.childSessionId,
      openRequest.parentSessionId,
      openRequest.workspacePath,
      openRequest.sessionTitle,
    ),
    workspace,
    openRequest.workspacePath,
  );

  closeLegacyStageAgentTabs(canvas, workspace, openRequest.childSessionId, openRequest.workspacePath);
  closeOtherStageAgentTabs(canvas, workspace);
  if (canvas.getSplitMode() === 'none') {
    canvas.setSplitMode('horizontal');
  }

  const existing = canvas.findTabByMetadata({ duplicateCheckKey: openRequest.duplicateCheckKey });
  if (existing) {
    canvas.updateTabContent(existing.tab.id, existing.groupId, content);
    if (existing.groupId !== 'secondary') {
      canvas.moveTabToGroup(existing.tab.id, existing.groupId, 'secondary', 0);
    }
    canvas.switchToTab(existing.tab.id, 'secondary');
    options.expandRightPanel?.();
    return {
      status: 'ready',
      source: 'short-drama-stage-agent-tab',
      childSessionId: openRequest.childSessionId,
      groupId: 'secondary',
    };
  }

  canvas.addTab(content, 'active', 'secondary');
  options.expandRightPanel?.();
  return {
    status: 'ready',
    source: 'short-drama-stage-agent-tab',
    childSessionId: openRequest.childSessionId,
    groupId: 'secondary',
  };
}

function withShortDramaStageMetadata(
  content: PanelContent,
  workspace: ShortDramaStageWorkspace,
  workspacePath: string | undefined,
): PanelContent {
  return {
    ...content,
    metadata: {
      ...content.metadata,
      shortDramaProjectId: workspace.projectId,
      shortDramaWorkspacePath: workspacePath,
      shortDramaStage: workspace.stage,
      shortDramaActiveEpisodeId: workspace.activeEpisodeId,
      shortDramaActiveArtifactHandle: workspace.activeArtifactHandle,
    },
  };
}

function closeLegacyStageAgentTabs(
  canvas: ShortDramaStageAgentCanvasGateway,
  workspace: ShortDramaStageWorkspace,
  realChildSessionId: string,
  workspacePath: string | undefined,
) {
  for (const { groupId, group } of [{ groupId: 'secondary' as const, group: canvas.secondaryGroup }, { groupId: 'tertiary' as const, group: canvas.tertiaryGroup }]) {
    const legacyTabs = group.tabs.filter(tab => (
      isLegacyShortDramaStageAgentTab(tab, workspace, realChildSessionId, workspacePath)
    ));
    legacyTabs.forEach(tab => canvas.closeTab(tab.id, groupId, { forceRemove: true }));
  }
}

function closeOtherStageAgentTabs(
  canvas: ShortDramaStageAgentCanvasGateway,
  workspace: ShortDramaStageWorkspace,
) {
  for (const { groupId, group } of [{ groupId: 'secondary', group: canvas.secondaryGroup }, { groupId: 'tertiary', group: canvas.tertiaryGroup }]) {
    const otherTabs = group.tabs.filter(function(tab) {
      if (tab.content.type !== 'btw-session') return false;
      const metadata = tab.content.metadata ?? {};
      const tabProjectId = typeof metadata.shortDramaProjectId === 'string' ? metadata.shortDramaProjectId : undefined;
      const tabStage = typeof metadata.shortDramaStage === 'string' ? metadata.shortDramaStage : undefined;
      if (tabProjectId === workspace.projectId && tabStage && tabStage !== workspace.stage) return true;
      if (!tabStage) return true;
      return false;
    });
    otherTabs.forEach(function(t) { canvas.closeTab(t.id, groupId as EditorGroupId, { forceRemove: true }); });
  }
}

function isLegacyShortDramaStageAgentTab(
  tab: CanvasTab,
  workspace: ShortDramaStageWorkspace,
  realChildSessionId: string,
  workspacePath: string | undefined,
) {
  if (tab.content.type !== 'btw-session') return false;
  const metadata = tab.content.metadata ?? {};
  const data = tab.content.data as { childSessionId?: string } | undefined;
  const duplicateCheckKey = typeof metadata.duplicateCheckKey === 'string' ? metadata.duplicateCheckKey : '';
  const tabWorkspacePath = typeof metadata.shortDramaWorkspacePath === 'string'
    ? metadata.shortDramaWorkspacePath
    : undefined;
  const matchesWorkspace = !tabWorkspacePath
    || !workspacePath
    || areShortDramaWorkspacePathsEqual(tabWorkspacePath, workspacePath);
  const matchesStage = metadata.shortDramaProjectId === workspace.projectId
    && metadata.shortDramaStage === workspace.stage
    && matchesWorkspace;
  const isOldSyntheticKey = duplicateCheckKey.startsWith('short-drama-stage-agent:');

  return (matchesStage || isOldSyntheticKey) && data?.childSessionId !== realChildSessionId;
}


function buildBtwSessionPanelContent(
  childSessionId: string,
  parentSessionId: string,
  workspacePath: string | undefined,
  title: string,
): PanelContent {
  return {
    type: 'btw-session',
    title,
    data: {
      childSessionId,
      parentSessionId,
      workspacePath,
    },
    metadata: {
      duplicateCheckKey: `btw-session-${childSessionId}`,
      childSessionId,
      parentSessionId,
      contentRole: 'btw-session',
    },
  };
}
