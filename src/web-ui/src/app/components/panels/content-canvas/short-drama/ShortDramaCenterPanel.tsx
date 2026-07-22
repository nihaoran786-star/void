import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '@/infrastructure/i18n';
import { useTheme } from '@/infrastructure/theme/hooks/useTheme';
import { agentAPI } from '@/infrastructure/api';
import { createLogger } from '@/shared/utils/logger';
import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import type { Session } from '@/flow_chat/types/flow-chat';
import { useContextStore } from '@/shared/context-system';
import { TAB_EVENTS } from '@/app/components/panels/content-canvas/types';
import { useAgentCanvasStore } from '@/app/components/panels/content-canvas/stores';
import {
  connectShortDramaRuntimeBridgeToEventBus,
  createShortDramaDefaultLibraryService,
  createShortDramaAssetAnchorViewModel,
  createShortDramaArtifactCardViewModel,
  createShortDramaMainAIContextExport,
  createShortDramaMediaArtifactIndex,
  createShortDramaMediaPreviewViewModel,
  createShortDramaProjectViewModel,
  createShortDramaProjectWithRecoveredMediaReferences,
  createShortDramaRecoveryGuidance,
  createShortDramaRuntimeBridge,
  createShortDramaStageWorkspaces,
  createShortDramaWorkspaceMismatchState,
  connectShortDramaProjectChangedEventsToToolRunBus,
  createShortDramaStoryboardReferenceViewItems,
  createShortDramaScriptDocumentViewModel,
  createShortDramaStageMediaViewModel,
  createShortDramaStageTimelineViewModel,
  readShortDramaStageAgentBindings,
  registerShortDramaStageAgentBindingsFromSessions,
  validateShortDramaStageAgentBindingsAgainstSessions,
  syncShortDramaMainAIContextExport,
  writeShortDramaRuntimeFocus,
  createShortDramaWorkspaceManifestAdapter,
  isShortDramaProjectChangedForWorkspace,
  onShortDramaProjectChanged,
  resolveShortDramaWorkspaceBinding,
  getShortDramaArtifactDomId,
  getShortDramaStaticProjectFixtureVersion,
  selectShortDramaPostFinalPreviewArtifact,
  shortDramaEpisodeIdMatches,
  staticShortDramaLibraryService,
  type ShortDramaArtifact,
  type ShortDramaAssetAnchorCategory,
  type ShortDramaAgentTaskRequest,
  type ShortDramaAgentTaskDispatchResult,
  type ShortDramaLibraryService,
  type ShortDramaLibraryState,
  type ShortDramaManifestState,
  type ShortDramaMediaArtifactIndexEntry,
  type ShortDramaMediaPreviewViewModel,
  type ShortDramaMediaReference,
  type ShortDramaProject,
  type ShortDramaRecoveryGuidance,
  type ShortDramaScriptDocumentViewModel,
  type ShortDramaStage,
  type ShortDramaStageAgentBinding,
  type ShortDramaStageAgentSessionCandidate,
  type ShortDramaStoryboardReferencePlan,
} from '@/shared/services/short-drama';
import { MEditor, type EditorInstance } from '@/tools/editor/meditor';
import {
  getWorkspaceMediaPendingGenerationsForWorkspace,
  resolveWorkspaceMediaPreviewUrl,
  useWorkspaceMediaRefreshStore,
  workspaceMediaLibraryService,
  type WorkspaceMediaItem,
  type WorkspaceMediaPendingGeneration,
} from '@/shared/services/workspace-media';
import { openMediaPreviewPanel } from '@/shared/services/preview/MediaPreviewService';
import {
  resolveShortDramaEpisodeTargetId,
  shouldUpdateShortDramaEpisodeFromScroll,
} from './ShortDramaEpisodeNavigationState';
import { getNextShortDramaRovingTabIndex } from './ShortDramaKeyboardNavigation';
import { openShortDramaRealStageAgentTab } from './ShortDramaStageAgentTabOrchestrator';
import { ensureShortDramaStageAgentSessions } from './ShortDramaStageAgentBootstrap';
import { createShortDramaStageAgentHistoricalSessionRestores } from './ShortDramaStageAgentSessionHydration';
import { createShortDramaAgentTaskSessionSender } from './ShortDramaAgentTaskSessionSender';

import './ShortDramaCenterPanel.scss';

const log = createLogger('ShortDramaCenterPanel');

const STAGES: ShortDramaStage[] = ['script', 'assets', 'storyboards', 'video', 'post'];
const PROGRAMMATIC_EPISODE_SCROLL_SETTLE_MS = 120;

interface ShortDramaCenterPanelProps {
  workspacePath?: string;
  sourceSessionId?: string;
  service?: ShortDramaPanelLibraryService;
  staticFixtureEpisodeCount?: number;
  isActive?: boolean;
}

type ShortDramaPanelLibraryService = ShortDramaLibraryService & {
  saveProject?: (project: ShortDramaProject) => Promise<ShortDramaManifestState>;
  dispatchAgentTasks?: (requests: ShortDramaAgentTaskRequest[]) => Promise<ShortDramaAgentTaskDispatchResult>;
};

type Translate = (key: string, values?: Record<string, unknown>) => string;

export function ShortDramaCenterPanel({
  workspacePath,
  sourceSessionId,
  service,
  staticFixtureEpisodeCount,
  isActive = true,
}: ShortDramaCenterPanelProps) {
  const { t } = useI18n('components');
  const { isLight } = useTheme();
  const [state, setState] = useState<ShortDramaLibraryState>({ status: 'idle' });
  const [selectedStage, setSelectedStage] = useState<ShortDramaStage>('script');
  const [activeEpisodeId, setActiveEpisodeId] = useState<string>();
  const [scriptContent, setScriptContent] = useState<string>();
  const [activeArtifactFocusByStage, setActiveArtifactFocusByStage] = useState<Partial<Record<ShortDramaStage, string>>>({});
  const [expandedAssetArtifactId, setExpandedAssetArtifactId] = useState<string>();
  const [expandedStoryboardArtifactId, setExpandedStoryboardArtifactId] = useState<string>();
  const [selectedRevisionIds, setSelectedRevisionIds] = useState<Record<string, string | undefined>>({});
  const [stageAgentBindings, setStageAgentBindings] = useState<ShortDramaStageAgentBinding[]>([]);
  const [workspaceMediaItems, setWorkspaceMediaItems] = useState<WorkspaceMediaItem[]>([]);
  const [isStageAgentBootstrapping, setIsStageAgentBootstrapping] = useState(false);
  const [flowSessionRevision, setFlowSessionRevision] = useState(0);
  const addContext = useContextStore(state => state.addContext);
  const updateContext = useContextStore(state => state.updateContext);
  const staticFixtureVersion = getShortDramaStaticProjectFixtureVersion();
  const panelRootRef = useRef<HTMLElement | null>(null);
  const isActiveRef = useRef(isActive);
  const presentationEpochRef = useRef(0);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const episodeSectionRefs = useRef(new Map<string, HTMLElement>());
  const scriptEditorRef = useRef<EditorInstance>(null);
  const activeEpisodeIdRef = useRef<string>();
  const pendingEpisodeScrollRef = useRef(false);
  const openedStageAgentTabsRef = useRef(new Set<string>());
  const stageAgentBootstrapAttemptRef = useRef<string>();
  const workspaceManifestAdapter = useMemo(() => (
    workspacePath ? createShortDramaWorkspaceManifestAdapter(workspacePath) : undefined
  ), [workspacePath]);
  const shortDramaAgentTaskSessionSender = useMemo(() => createShortDramaAgentTaskSessionSender(), []);
  const libraryService = useMemo<ShortDramaPanelLibraryService>(() => (
    service
      ?? (workspaceManifestAdapter
        ? createShortDramaDefaultLibraryService(
            workspaceManifestAdapter,
            'static_short_drama_001',
            {
              demoMode: staticFixtureEpisodeCount !== undefined,
              staticEpisodeCount: staticFixtureEpisodeCount,
              sessionSender: shortDramaAgentTaskSessionSender,
            },
          )
        : staticShortDramaLibraryService)
  ), [service, shortDramaAgentTaskSessionSender, staticFixtureEpisodeCount, workspaceManifestAdapter]);

  useEffect(() => {
    isActiveRef.current = isActive;
    presentationEpochRef.current += 1;
    if (!isActive) {
      panelRootRef.current
        ?.querySelectorAll<HTMLMediaElement>('video, audio')
        .forEach(media => media.pause());
    }
    return () => {
      isActiveRef.current = false;
      presentationEpochRef.current += 1;
    };
  }, [isActive, workspacePath]);

  useEffect(() => connectShortDramaProjectChangedEventsToToolRunBus(), []);

  useEffect(() => {
    let lastSignature = createShortDramaFlowSessionSignature(flowChatStore.getState().sessions);
    return flowChatStore.subscribe(nextState => {
      const nextSignature = createShortDramaFlowSessionSignature(nextState.sessions);
      if (nextSignature === lastSignature) {
        return;
      }
      lastSignature = nextSignature;
      setFlowSessionRevision(revision => revision + 1);
    });
  }, []);

  useEffect(() => {
    if (!workspacePath || !workspaceManifestAdapter) {
      setStageAgentBindings([]);
      return undefined;
    }

    let cancelled = false;
    let sessions = createShortDramaStageAgentSessionCandidates(flowChatStore.getState().sessions);

    readShortDramaStageAgentBindings(workspaceManifestAdapter, workspacePath)
      .then(async bindingState => {
        if (bindingState.status === 'error') {
          return [];
        }
        const restores = createShortDramaStageAgentHistoricalSessionRestores({
          bindings: bindingState.bindings,
          sessions,
          workspaceRoot: workspacePath,
        });
        for (const restore of restores) {
          flowChatStore.addExternalSession(
            restore.childSessionId,
            restore.agentName,
            restore.agentName,
            restore.workspaceRoot,
            {
              parentSessionId: restore.parentSessionId,
              sessionKind: 'subagent',
              subagentType: restore.agentName,
              isHistorical: true,
              historyState: 'metadata-only',
              createdAt: restore.createdAt,
              lastActiveAt: restore.lastActiveAt,
            },
          );
        }
        if (restores.length > 0) {
          sessions = createShortDramaStageAgentSessionCandidates(flowChatStore.getState().sessions);
        }
        const registered = await registerShortDramaStageAgentBindingsFromSessions(
          workspaceManifestAdapter,
          workspacePath,
          sessions,
          bindingState.bindings,
        );
        return registered.status === 'error'
          ? validateShortDramaStageAgentBindingsAgainstSessions(bindingState.bindings, sessions, workspacePath)
          : registered.bindings;
      })
      .then(nextBindings => {
        if (!cancelled) {
          setStageAgentBindings(nextBindings);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStageAgentBindings([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [flowSessionRevision, workspaceManifestAdapter, workspacePath]);

  useEffect(() => {
    if (!workspacePath || !workspaceManifestAdapter || isStageAgentBootstrapping) {
      return undefined;
    }

    const flowState = flowChatStore.getState();
    const sourceSession = sourceSessionId
      ? flowState.sessions.get(sourceSessionId)
      : flowState.activeSessionId
        ? flowState.sessions.get(flowState.activeSessionId)
        : undefined;
    if (!sourceSession || sourceSession.mode?.toLowerCase() !== 'media' || sourceSession.sessionKind === 'subagent') {
      return undefined;
    }

    const sessions = createShortDramaStageAgentSessionCandidates(flowState.sessions);
    const needsBootstrap = stageAgentBindings.length === 0
      || stageAgentBindings.some(binding => binding.status !== 'ready');
    if (!needsBootstrap) {
      return undefined;
    }
    const attemptKey = [
      workspacePath,
      sourceSession.sessionId,
      stageAgentBindings.map(binding => `${binding.stage}:${binding.status}:${binding.childSessionId ?? ''}`).join('|'),
    ].join('::');
    if (stageAgentBootstrapAttemptRef.current === attemptKey) {
      return undefined;
    }
    stageAgentBootstrapAttemptRef.current = attemptKey;

    let cancelled = false;
    setIsStageAgentBootstrapping(true);
    ensureShortDramaStageAgentSessions({
      adapter: workspaceManifestAdapter,
      workspaceRoot: workspacePath,
      parentSession: sourceSession,
      sessions,
      existingBindings: stageAgentBindings,
      createSession: request => agentAPI.createSession(request),
      addSessionToStore: ({ childSessionId, title, agentName, parentSession }) => {
        flowChatStore.addExternalSession(
          childSessionId,
          title,
          agentName,
          workspacePath,
          {
            parentSessionId: parentSession.sessionId,
            sessionKind: 'subagent',
            subagentType: agentName,
          },
          parentSession.remoteConnectionId,
          parentSession.remoteSshHost,
        );
      },
    })
      .then(result => {
        if (!cancelled) {
          setStageAgentBindings(result.bindings);
          setFlowSessionRevision(revision => revision + 1);
        }
      })
      .catch(() => {
        // The binding effect will keep the current partial state visible.
      })
      .finally(() => {
        if (!cancelled) {
          setIsStageAgentBootstrapping(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isStageAgentBootstrapping, sourceSessionId, stageAgentBindings, workspaceManifestAdapter, workspacePath]);

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'scanning', source: 'static' });
    libraryService.loadProject(workspacePath)
      .then(nextState => {
        if (!cancelled) {
          setState(nextState);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            status: 'error',
            source: 'static',
            error: { code: 'load_failed', message: t('shortDrama.states.loadFailed') },
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [libraryService, t, workspacePath, staticFixtureVersion]);

  useEffect(() => {
    if (!workspacePath) {
      return undefined;
    }

    return onShortDramaProjectChanged(event => {
      if (!isShortDramaProjectChangedForWorkspace(event, workspacePath)) {
        const binding = resolveShortDramaWorkspaceBinding({
          uiWorkspacePath: workspacePath,
          toolWorkspaceRoot: event.workspaceRoot,
          projectPath: event.projectPath,
          source: 'active_session',
          hasProject: event.projectState !== 'no_project' && event.projectState !== 'empty',
        });
        if (binding.status === 'mismatch') {
          setState(createShortDramaWorkspaceMismatchState(binding));
        }
        return;
      }

      libraryService.loadProject(workspacePath)
        .then(nextState => {
          if (nextState.status === 'ready' && event.action === 'initialize_from_script') {
            const firstEpisodeId = nextState.project.episodes[0]?.id;
            activeEpisodeIdRef.current = firstEpisodeId;
            pendingEpisodeScrollRef.current = Boolean(firstEpisodeId);
            setActiveEpisodeId(firstEpisodeId);
            setSelectedStage('script');
          }
          setState(nextState);
        })
        .catch(() => {
          setState({
            status: 'error',
            source: 'manifest',
            error: { code: 'load_failed', message: t('shortDrama.states.loadFailed') },
          });
        });
    });
  }, [libraryService, t, workspacePath]);

  useEffect(() => {
    if (!isActive || state.status !== 'empty' || !workspacePath) {
      return undefined;
    }

    let cancelled = false;
    let refreshInFlight = false;
    const requestEpoch = presentationEpochRef.current;
    const refreshFromWorkspace = () => {
      if (refreshInFlight) {
        return;
      }
      refreshInFlight = true;
      libraryService.loadProject(workspacePath)
        .then(nextState => {
          if (
            cancelled
            || !isActiveRef.current
            || presentationEpochRef.current !== requestEpoch
            || nextState.status !== 'ready'
          ) {
            return;
          }

          const firstEpisodeId = nextState.project.episodes[0]?.id;
          activeEpisodeIdRef.current = firstEpisodeId;
          pendingEpisodeScrollRef.current = Boolean(firstEpisodeId);
          setActiveEpisodeId(firstEpisodeId);
          setSelectedStage('script');
          setState(nextState);
        })
        .catch(() => {
          // Empty workspace refresh is opportunistic; the main load path owns visible errors.
        })
        .finally(() => {
          refreshInFlight = false;
        });
    };

    const firstRefresh = window.setTimeout(refreshFromWorkspace, 500);
    const refreshInterval = window.setInterval(refreshFromWorkspace, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(firstRefresh);
      window.clearInterval(refreshInterval);
    };
  }, [isActive, libraryService, state.status, workspacePath]);

  useEffect(() => {
    if (state.status !== 'ready') {
      return undefined;
    }

    const bridge = createShortDramaRuntimeBridge({
      project: state.project,
      saveProject: libraryService.saveProject,
      onProjectChange(nextProject) {
        setState(current => current.status === 'ready'
          ? { ...current, project: nextProject }
          : current);
      },
    });

    return connectShortDramaRuntimeBridgeToEventBus(bridge);
  }, [libraryService, state]);

  const mediaRefreshToken = useWorkspaceMediaRefreshStore(state => state.token);

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }
    if (!workspacePath || state.status !== 'ready') {
      setWorkspaceMediaItems([]);
      return undefined;
    }

    let cancelled = false;
    const requestEpoch = presentationEpochRef.current;
    workspaceMediaLibraryService.scanLibrary(workspacePath)
      .then(mediaState => {
        if (
          cancelled
          || !isActiveRef.current
          || presentationEpochRef.current !== requestEpoch
        ) {
          return;
        }
        setWorkspaceMediaItems(mediaState.status === 'ready' ? mediaState.items : []);
      })
      .catch(() => {
        if (
          !cancelled
          && isActiveRef.current
          && presentationEpochRef.current === requestEpoch
        ) {
          setWorkspaceMediaItems([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isActive, mediaRefreshToken, state.status, workspacePath]);

  const workspaceMediaItemsById = useMemo(() => (
    new Map(workspaceMediaItems.map(item => [item.id, item]))
  ), [workspaceMediaItems]);

  const handleRevisionSelect = useCallback((artifactId: string, revisionId?: string) => {
    setSelectedRevisionIds(current => ({ ...current, [artifactId]: revisionId }));
  }, []);

  const recoveredProject = useMemo(() => (
    state.status === 'ready'
      ? createShortDramaProjectWithRecoveredMediaReferences(state.project, workspaceMediaItems)
      : undefined
  ), [state, workspaceMediaItems]);

  const viewModel = useMemo(() => (
    state.status === 'ready' && recoveredProject
      ? createShortDramaProjectViewModel(recoveredProject, {
          selectedStage,
          selectedEpisodeId: activeEpisodeId,
          source: state.source,
        })
      : undefined
  ), [activeEpisodeId, recoveredProject, selectedStage, state]);
  const assetCategories = useMemo(() => (
    viewModel?.project && viewModel.state.status === 'ready'
      ? createShortDramaAssetAnchorViewModel(viewModel.project)
      : []
  ), [viewModel]);
  const workspacePendingGenerations = useMemo(() => {
    void mediaRefreshToken;
    return getWorkspaceMediaPendingGenerationsForWorkspace(workspacePath);
  }, [mediaRefreshToken, workspacePath]);
  const mediaEntriesByArtifactId = useMemo(() => {
    if (!viewModel?.project || viewModel.state.status !== 'ready') {
      return new Map<string, ShortDramaMediaArtifactIndexEntry>();
    }

    return new Map(createShortDramaMediaArtifactIndex(viewModel.project, { includeEmpty: true })
      .map(entry => [entry.artifactId, entry]));
  }, [viewModel]);
  const stageTimeline = useMemo(() => (
    viewModel?.project && viewModel.state.status === 'ready'
      ? createShortDramaStageTimelineViewModel(viewModel.project, selectedStage, {
          mediaPreviewOnly: selectedStage !== 'script',
          mediaEntriesByArtifactId,
        })
      : []
  ), [mediaEntriesByArtifactId, selectedStage, viewModel]);
  const selectedStageMedia = useMemo(() => (
    viewModel?.project && viewModel.state.status === 'ready'
      ? createShortDramaStageMediaViewModel(viewModel.project, selectedStage, {
          mediaEntriesByArtifactId,
          pendingGenerations: workspacePendingGenerations,
        })
      : undefined
  ), [mediaEntriesByArtifactId, selectedStage, viewModel, workspacePendingGenerations]);
  const selectedStagePendingGenerations = selectedStageMedia?.pendingGenerations ?? [];
  const baseScriptDocument = useMemo(() => (
    viewModel?.project && viewModel.state.status === 'ready'
      ? createShortDramaScriptDocumentViewModel(viewModel.project)
      : undefined
  ), [viewModel]);
  const scriptDocument = useMemo(() => (
    viewModel?.project && viewModel.state.status === 'ready'
      ? createShortDramaScriptDocumentViewModel(viewModel.project, scriptContent ?? baseScriptDocument?.content)
      : undefined
  ), [baseScriptDocument?.content, scriptContent, viewModel]);
  const stageWorkspaceProject = useMemo(() => (
    viewModel?.project ?? (state.status === 'empty' ? createEmptyShortDramaWorkspaceProject() : undefined)
  ), [state.status, viewModel?.project]);
  const stageWorkspaces = useMemo(() => {
    void flowSessionRevision;
    return stageWorkspaceProject
      ? createShortDramaStageWorkspaces(stageWorkspaceProject, {
          selectedStage,
          activeEpisodeId: currentActiveEpisodeId(activeEpisodeId, viewModel?.selectedEpisode?.id),
          activeArtifactIdOrHandle: activeArtifactFocusByStage[selectedStage],
          panelState: 'open',
          stageAgentSessions: createShortDramaStageAgentSessionCandidates(flowChatStore.getState().sessions),
          stageAgentBindings,
          workspacePath,
        })
      : [];
  }, [activeArtifactFocusByStage, activeEpisodeId, flowSessionRevision, selectedStage, stageAgentBindings, stageWorkspaceProject, viewModel?.selectedEpisode?.id, workspacePath]);
  const activeStageWorkspace = stageWorkspaces.find(workspace => workspace.stage === selectedStage);

  const openNativeStageAgentTab = useCallback((workspace: NonNullable<typeof activeStageWorkspace>) => {
    const canvas = useAgentCanvasStore.getState();
    return openShortDramaRealStageAgentTab(workspace, workspacePath, {
      ...canvas,
      getSplitMode: () => useAgentCanvasStore.getState().layout.splitMode,
    }, {
      expandRightPanel: () => window.dispatchEvent(new CustomEvent(TAB_EVENTS.EXPAND_RIGHT_PANEL)),
    });
  }, [workspacePath]);

  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }

    const exported = createShortDramaMainAIContextExport(state.project, {
      activeStage: selectedStage,
      activeEpisodeId: currentActiveEpisodeId(activeEpisodeId, viewModel?.selectedEpisode?.id),
      activeArtifactIdOrHandle: activeArtifactFocusByStage[selectedStage],
      panelState: 'open',
    });
    syncShortDramaMainAIContextExport(exported, {
      getContext: id => useContextStore.getState().contexts.find(context => context.id === id),
      addContext,
      updateContext,
    });
  }, [
    activeArtifactFocusByStage,
    activeEpisodeId,
    addContext,
    selectedStage,
    state,
    updateContext,
    viewModel?.selectedEpisode?.id,
  ]);

  useEffect(() => {
    if (state.status !== 'ready' || !workspaceManifestAdapter || !workspacePath) {
      return;
    }

    const activeArtifactIdOrHandle = activeArtifactFocusByStage[selectedStage];
    const activeArtifact = activeArtifactIdOrHandle
      ? state.project.artifacts.find(artifact => artifact.id === activeArtifactIdOrHandle || artifact.handle === activeArtifactIdOrHandle)
      : undefined;

    void writeShortDramaRuntimeFocus(workspaceManifestAdapter, state.project, {
      workspaceRoot: workspacePath,
      activeStage: selectedStage,
      activeEpisodeId: currentActiveEpisodeId(activeEpisodeId, viewModel?.selectedEpisode?.id),
      activeArtifactId: activeArtifact?.id,
      activeArtifactHandle: activeArtifact?.handle ?? activeArtifactIdOrHandle,
      activeMediaItemId: activeArtifact?.mediaReference?.mediaItemId,
      selectionSource: 'right-panel',
    }).then(result => {
      if (result.status !== 'ready') {
        log.warn('Failed to persist short drama runtime focus', {
          status: result.status,
          error: result.error,
        });
      }
    });
  }, [
    activeArtifactFocusByStage,
    activeEpisodeId,
    selectedStage,
    state,
    viewModel?.selectedEpisode?.id,
    workspaceManifestAdapter,
    workspacePath,
  ]);

  useEffect(() => {
    if (!activeStageWorkspace) {
      return;
    }

    const result = openNativeStageAgentTab(activeStageWorkspace);
    if (result.status === 'ready') {
      openedStageAgentTabsRef.current.add(`${activeStageWorkspace.stage}:${result.childSessionId}`);
    }
  }, [activeStageWorkspace, openNativeStageAgentTab]);

  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }

    const readyWorkspaces = stageWorkspaces
      .filter(workspace => workspace.specialistSessionId && workspace.parentSessionId)
      .sort((left, right) => {
        if (left.stage === selectedStage) return 1;
        if (right.stage === selectedStage) return -1;
        return STAGES.indexOf(left.stage) - STAGES.indexOf(right.stage);
      });

    readyWorkspaces.forEach(workspace => {
      const key = `${workspace.stage}:${workspace.specialistSessionId}`;
      if (openedStageAgentTabsRef.current.has(key)) {
        return;
      }
      openedStageAgentTabsRef.current.add(key);
      openNativeStageAgentTab(workspace);
    });

    const selectedWorkspace = readyWorkspaces.find(workspace => workspace.stage === selectedStage);
    if (selectedWorkspace) {
      openNativeStageAgentTab(selectedWorkspace);
    }
  }, [openNativeStageAgentTab, selectedStage, stageWorkspaces, state.status]);

  useEffect(() => {
    setScriptContent(baseScriptDocument?.content);
  }, [baseScriptDocument?.content]);

  useEffect(() => {
    if (!isActive || state.status !== 'ready' || selectedStage === 'script') {
      return;
    }

    const focusKey = activeArtifactFocusByStage[selectedStage];
    if (!focusKey) {
      return;
    }

    const focusedArtifact = state.project.artifacts.find(artifact => (
      artifact.id === focusKey || artifact.handle === focusKey
    ));
    const element = focusedArtifact
      ? document.getElementById(getShortDramaArtifactDomId(focusedArtifact.id))
      : null;
    if (element && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeArtifactFocusByStage, isActive, selectedStage, state]);

  useEffect(() => {
    if (!activeEpisodeId && viewModel?.selectedEpisode) {
      setActiveEpisodeId(viewModel.selectedEpisode.id);
    }
  }, [activeEpisodeId, viewModel?.selectedEpisode]);

  useEffect(() => {
    activeEpisodeIdRef.current = activeEpisodeId;
  }, [activeEpisodeId]);

  const updateActiveEpisodeFromScroll = useCallback(() => {
    if (!isActive || !shouldUpdateShortDramaEpisodeFromScroll({
      isProgrammaticScrollPending: pendingEpisodeScrollRef.current,
    })) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    if (selectedStage === 'script') {
      if (!scriptDocument?.anchors.length) {
        return;
      }

      const headings = getScriptHeadingElements(scriptDocument, container);
      const nextEpisodeId = findClosestEpisodeId(container, headings);
      if (nextEpisodeId && nextEpisodeId !== activeEpisodeIdRef.current) {
        activeEpisodeIdRef.current = nextEpisodeId;
        setActiveEpisodeId(nextEpisodeId);
      }
      return;
    }

    if (selectedStage === 'assets') {
      return;
    }

    const sections = Array.from(episodeSectionRefs.current, ([episodeId, element]) => ({ episodeId, element }));
    const nextEpisodeId = findClosestEpisodeId(container, sections);
    if (nextEpisodeId && nextEpisodeId !== activeEpisodeIdRef.current) {
      activeEpisodeIdRef.current = nextEpisodeId;
      setActiveEpisodeId(nextEpisodeId);
    }
  }, [isActive, scriptDocument, selectedStage]);

  useEffect(() => {
    const targetEpisodeId = resolveShortDramaEpisodeTargetId({
      refEpisodeId: activeEpisodeIdRef.current,
      stateEpisodeId: activeEpisodeId,
    });
    if (!isActive || !targetEpisodeId || state.status !== 'ready') {
      return;
    }
    if (!pendingEpisodeScrollRef.current) {
      return;
    }

    const scrollToCurrentStageEpisode = () => {
      if (selectedStage === 'assets') {
        pendingEpisodeScrollRef.current = false;
        return;
      }

      if (selectedStage === 'script') {
        const heading = findScriptHeadingElement(scriptDocument, targetEpisodeId, scrollContainerRef.current);
        if (heading) {
          heading.scrollIntoView({ block: 'start', behavior: 'auto' });
          return;
        }

        const lineNumber = scriptDocument?.anchors.find(anchor => anchor.episodeId === targetEpisodeId)?.lineNumber;
        if (lineNumber && scriptEditorRef.current) {
          scriptEditorRef.current?.scrollToLine?.(lineNumber, true);
        }
        return;
      }

      episodeSectionRefs.current.get(targetEpisodeId)?.scrollIntoView({
        block: 'start',
        behavior: 'auto',
      });
    };

    let retryTimeout: number | undefined;
    const firstFrame = window.requestAnimationFrame(() => {
      scrollToCurrentStageEpisode();
      retryTimeout = window.setTimeout(() => {
        scrollToCurrentStageEpisode();
        pendingEpisodeScrollRef.current = false;
      }, PROGRAMMATIC_EPISODE_SCROLL_SETTLE_MS);
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (retryTimeout !== undefined) {
        window.clearTimeout(retryTimeout);
      }
    };
  }, [activeEpisodeId, isActive, scriptDocument, selectedStage, state.status]);

  useEffect(() => {
    if (!isActive || selectedStage !== 'script') {
      return;
    }

    const container = scrollContainerRef.current;
    const scriptScrollContainer = container?.querySelector<HTMLElement>('.short-drama-center__script-editor .m-editor-tiptap');
    if (!scriptScrollContainer) {
      return;
    }

    scriptScrollContainer.addEventListener('scroll', updateActiveEpisodeFromScroll, { passive: true });
    return () => {
      scriptScrollContainer.removeEventListener('scroll', updateActiveEpisodeFromScroll);
    };
  }, [isActive, selectedStage, updateActiveEpisodeFromScroll]);

  const handleArtifactFocus = useCallback((artifact: ShortDramaArtifact) => {
    const focusKey = artifact.handle ?? artifact.id;
    setActiveArtifactFocusByStage(current => (
      current[artifact.stage] === focusKey
        ? current
        : { ...current, [artifact.stage]: focusKey }
    ));
  }, []);

  if (state.status === 'idle' || state.status === 'scanning') {
    return <ShortDramaState message={t('shortDrama.states.loading')} />;
  }

  if (state.status === 'empty') {
    return (
      <section ref={panelRootRef} className="short-drama-center" aria-label={t('shortDrama.ariaLabel')} data-testid="short-drama-center">
        <ShortDramaTopBar
          selectedStage={selectedStage}
          onStageSelect={setSelectedStage}
          t={t}
        />
        <main className={`short-drama-center__body ${selectedStage === 'assets' ? 'is-assets' : ''}`}>
          <section className="short-drama-center__stage-page">
            {selectedStage === 'script' ? (
              <ScriptStage
                document={undefined}
                editorRef={scriptEditorRef}
                editorTheme={isLight ? 'light' : 'dark'}
                onContentChange={setScriptContent}
                t={t}
              />
            ) : selectedStage === 'assets' ? (
              <AssetStage
                categories={createEmptyAssetAnchorCategories()}
                pendingGenerations={selectedStage === 'assets' ? selectedStagePendingGenerations : []}
                mediaEntriesByArtifactId={mediaEntriesByArtifactId}
                expandedArtifactId={expandedAssetArtifactId}
                focusedArtifactIdOrHandle={activeArtifactFocusByStage.assets}
                onArtifactFocus={handleArtifactFocus}
                onExpandedArtifactChange={setExpandedAssetArtifactId}
                t={t}
              />
            ) : (
              <ShortDramaState
                message={t('shortDrama.states.emptyStage')}
                guidance={createShortDramaRecoveryGuidance()}
                t={t}
                compact
              />
            )}
          </section>
        </main>
      </section>
    );
  }

  if (state.status === 'unsupported') {
    return (
      <ShortDramaState
        message={state.error.code === 'missing_workspace' ? t('shortDrama.states.missingWorkspace') : state.error.message}
        guidance={createShortDramaRecoveryGuidance(state.error)}
        t={t}
      />
    );
  }

  if (state.status === 'mismatch') {
    return (
      <ShortDramaState
        message={state.error.message}
        details={createShortDramaWorkspaceMismatchDetails(state)}
      />
    );
  }

  if (state.status === 'error' || !viewModel?.project || viewModel.state.status !== 'ready') {
    const error = state.status === 'error' ? state.error : undefined;
    return (
      <ShortDramaState
        message={state.status === 'error' ? state.error.message : t('shortDrama.states.loadFailed')}
        guidance={createShortDramaRecoveryGuidance(error)}
        t={t}
      />
    );
  }

  const selectedEpisode = viewModel.selectedEpisode;

  if (!selectedEpisode) {
    return <ShortDramaState message={t('shortDrama.states.emptyEpisode')} />;
  }

  const project = viewModel.project;
  const currentEpisodeId = resolveShortDramaEpisodeTargetId({
    refEpisodeId: activeEpisodeIdRef.current,
    stateEpisodeId: activeEpisodeId,
    fallbackEpisodeId: selectedEpisode.id,
  }) ?? selectedEpisode.id;
  const handleEpisodeNavigate = (episodeId: string) => {
    pendingEpisodeScrollRef.current = true;
    activeEpisodeIdRef.current = episodeId;
    setActiveEpisodeId(episodeId);
  };
  const handleStageSelect = (stage: ShortDramaStage) => {
    if (stage === selectedStage) {
      return;
    }

    const targetEpisodeId = resolveShortDramaEpisodeTargetId({
      refEpisodeId: activeEpisodeIdRef.current,
      stateEpisodeId: activeEpisodeId,
      fallbackEpisodeId: currentEpisodeId,
    });
    if (!targetEpisodeId) {
      return;
    }
    activeEpisodeIdRef.current = targetEpisodeId;
    setActiveEpisodeId(targetEpisodeId);
    pendingEpisodeScrollRef.current = stage !== 'assets';
    setSelectedStage(stage);
  };
  const handleTimelineScroll = () => {
    updateActiveEpisodeFromScroll();
  };
  const episodeNavigationItems = selectedStage === 'script' && scriptDocument?.anchors.length
    ? scriptDocument.anchors.map(anchor => ({
        id: anchor.episodeId,
        number: anchor.episodeNumber,
      }))
    : project.episodes.map(episode => ({
        id: episode.id,
        number: episode.number,
      }));

  return (
    <section ref={panelRootRef} className="short-drama-center" aria-label={t('shortDrama.ariaLabel')} data-testid="short-drama-center">
      <ShortDramaTopBar
        selectedStage={selectedStage}
        onStageSelect={handleStageSelect}
        t={t}
      />

      <main
        ref={scrollContainerRef}
        className={`short-drama-center__body ${selectedStage === 'assets' ? 'is-assets' : ''}`}
        onScroll={handleTimelineScroll}
      >
        <section className="short-drama-center__stage-page">
          {selectedStage === 'script' ? (
            <ScriptStage
              document={scriptDocument}
              editorRef={scriptEditorRef}
              editorTheme={isLight ? 'light' : 'dark'}
              onContentChange={setScriptContent}
              t={t}
            />
          ) : selectedStage === 'assets' ? (
            <AssetStage
              categories={assetCategories}
              pendingGenerations={selectedStagePendingGenerations}
              mediaEntriesByArtifactId={mediaEntriesByArtifactId}
              expandedArtifactId={expandedAssetArtifactId}
              focusedArtifactIdOrHandle={activeArtifactFocusByStage.assets}
              onArtifactFocus={handleArtifactFocus}
              onExpandedArtifactChange={setExpandedAssetArtifactId}
              t={t}
            />
          ) : (
            stageTimeline.map(section => (
              <EpisodeStageSection
                key={section.episode.id}
                project={project}
                episode={section.episode}
                artifacts={section.artifacts}
                projectArtifacts={project.artifacts}
                storyboardReferencePlans={project.storyboardReferencePlans ?? []}
                episodeArtifacts={project.artifacts.filter(artifact => shortDramaEpisodeIdMatches(project, artifact.episodeId, section.episode.id))}
                mediaEntriesByArtifactId={mediaEntriesByArtifactId}
                selectedStage={selectedStage}
                pendingGenerations={selectedStagePendingGenerations}
                expandedStoryboardArtifactId={expandedStoryboardArtifactId}
                focusedArtifactIdOrHandle={activeArtifactFocusByStage[selectedStage]}
                onArtifactFocus={handleArtifactFocus}
                onStoryboardExpandedChange={setExpandedStoryboardArtifactId}
                selectedRevisionIds={selectedRevisionIds}
                revisionMediaItemsById={workspaceMediaItemsById}
                onRevisionSelect={handleRevisionSelect}
                setSectionRef={(element) => {
                  if (element) {
                    episodeSectionRefs.current.set(section.episode.id, element);
                  } else {
                    episodeSectionRefs.current.delete(section.episode.id);
                  }
                }}
                t={t}
              />
            ))
          )}
          <div className="short-drama-center__scroll-spacer" aria-hidden="true" />
        </section>
        {selectedStage !== 'assets' && (
          <EpisodeNavigation
            episodes={episodeNavigationItems}
            selectedEpisodeId={currentEpisodeId}
            onEpisodeSelect={handleEpisodeNavigate}
            t={t}
          />
        )}
      </main>
    </section>
  );
}

function EpisodeStageSection({
  project,
  episode,
  artifacts,
  projectArtifacts,
  storyboardReferencePlans,
  episodeArtifacts,
  mediaEntriesByArtifactId,
  selectedStage,
  pendingGenerations,
  expandedStoryboardArtifactId,
  focusedArtifactIdOrHandle,
  onArtifactFocus,
  onStoryboardExpandedChange,
  selectedRevisionIds,
  revisionMediaItemsById,
  onRevisionSelect,
  setSectionRef,
  t,
}: {
  project: ShortDramaProject;
  episode: { id: string; number: number; title: string; summary: string };
  artifacts: ShortDramaArtifact[];
  projectArtifacts: ShortDramaArtifact[];
  storyboardReferencePlans: ShortDramaStoryboardReferencePlan[];
  episodeArtifacts: ShortDramaArtifact[];
  mediaEntriesByArtifactId: Map<string, ShortDramaMediaArtifactIndexEntry>;
  selectedStage: ShortDramaStage;
  pendingGenerations: WorkspaceMediaPendingGeneration[];
  expandedStoryboardArtifactId?: string;
  focusedArtifactIdOrHandle?: string;
  onArtifactFocus: (artifact: ShortDramaArtifact) => void;
  onStoryboardExpandedChange: (artifactId?: string) => void;
  selectedRevisionIds: Record<string, string | undefined>;
  revisionMediaItemsById: Map<string, WorkspaceMediaItem>;
  onRevisionSelect: (artifactId: string, revisionId?: string) => void;
  setSectionRef: (element: HTMLElement | null) => void;
  t: Translate;
}) {
  const sectionPendingGenerations = pendingGenerations.filter(item => {
    if (item.episodeId && !shortDramaEpisodeIdMatches(project, item.episodeId, episode.id)) {
      return false;
    }
    if (item.artifactHandle || item.artifactId) {
      return artifacts.some(artifact => (
        artifact.handle === item.artifactHandle
        || artifact.id === item.artifactId
      ));
    }
    return selectedStage === 'assets';
  });

  return (
    <article
      ref={setSectionRef}
      className="short-drama-center__episode-section"
      data-testid="short-drama-episode-section"
      data-episode-id={episode.id}
    >
      <header className="short-drama-center__episode-header">
        <strong>{t('shortDrama.episodes.number', { number: episode.number })}</strong>
        <span>{episode.title}</span>
      </header>

      {sectionPendingGenerations.length > 0 && selectedStage !== 'script' && (
        <PendingStageGenerationGrid items={sectionPendingGenerations} t={t} />
      )}

      {selectedStage === 'assets' && <ArtifactGrid artifacts={artifacts} mediaEntriesByArtifactId={mediaEntriesByArtifactId} onArtifactFocus={onArtifactFocus} t={t} />}
      {selectedStage === 'storyboards' && (
        <StoryboardGrid
          artifacts={artifacts}
          projectArtifacts={projectArtifacts}
          storyboardReferencePlans={storyboardReferencePlans}
          mediaEntriesByArtifactId={mediaEntriesByArtifactId}
          expandedArtifactId={expandedStoryboardArtifactId}
          focusedArtifactIdOrHandle={focusedArtifactIdOrHandle}
          onArtifactFocus={onArtifactFocus}
          onExpandedArtifactChange={onStoryboardExpandedChange}
          selectedRevisionIds={selectedRevisionIds}
          revisionMediaItemsById={revisionMediaItemsById}
          onRevisionSelect={onRevisionSelect}
          t={t}
        />
      )}
      {selectedStage === 'video' && (
        <VideoStage
          artifacts={artifacts}
          episodeArtifacts={episodeArtifacts}
          mediaEntriesByArtifactId={mediaEntriesByArtifactId}
          focusedArtifactIdOrHandle={focusedArtifactIdOrHandle}
          onArtifactFocus={onArtifactFocus}
          t={t}
        />
      )}
      {selectedStage === 'post' && (
        <PostStage
          artifacts={artifacts}
          episodeArtifacts={episodeArtifacts}
          mediaEntriesByArtifactId={mediaEntriesByArtifactId}
          focusedArtifactIdOrHandle={focusedArtifactIdOrHandle}
          onArtifactFocus={onArtifactFocus}
          t={t}
        />
      )}
    </article>
  );
}

function ShortDramaState({
  message,
  guidance,
  details,
  t,
  compact = false,
}: {
  message: string;
  guidance?: ShortDramaRecoveryGuidance;
  details?: string[];
  t?: Translate;
  compact?: boolean;
}) {
  return (
    <div
      className={compact ? 'short-drama-center__stage-empty' : 'short-drama-center'}
      data-testid="short-drama-center-state"
    >
      <div className={`short-drama-center__state ${compact ? 'is-compact' : ''}`}>
        {guidance && t ? (
          <>
            <h2>{t(guidance.titleKey)}</h2>
            <p>{t(guidance.reasonKey)}</p>
            <strong>{t(guidance.nextActionKey)}</strong>
          </>
        ) : (
          <>
            <p>{message}</p>
            {details?.length ? (
              <ul>
                {details.map(detail => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function createEmptyShortDramaWorkspaceProject(): ShortDramaProject {
  return {
    projectId: 'empty-short-drama-workspace',
    title: 'AI Short Drama',
    status: 'draft',
    activeStage: 'script',
    episodes: [],
    artifacts: [],
    productionPlan: {
      status: 'pending',
      mode: 'semiAutomatic',
      goal: '',
      episodeRange: '',
      steps: [],
    },
    scriptDocument: {
      kind: 'markdown',
      content: '',
    },
    storyboardReferencePlans: [],
    changeRequests: [],
  };
}

function createEmptyAssetAnchorCategories(): ShortDramaAssetAnchorCategory[] {
  return [
    { id: 'characters', artifactType: 'character', artifacts: [], items: [] },
    { id: 'locations', artifactType: 'location', artifacts: [], items: [] },
    { id: 'props', artifactType: 'prop', artifacts: [], items: [] },
  ];
}

function createShortDramaWorkspaceMismatchDetails(
  state: Extract<ShortDramaLibraryState, { status: 'mismatch' }>,
): string[] {
  return [
    state.binding.uiWorkspacePath
      ? `Panel workspace: ${state.binding.uiWorkspacePath}`
      : 'Panel workspace: not available',
    state.binding.toolWorkspaceRoot
      ? `AI tool workspace: ${state.binding.toolWorkspaceRoot}`
      : 'AI tool workspace: not available',
    state.binding.projectPath
      ? `AI tool project path: ${state.binding.projectPath}`
      : 'AI tool project path: not available',
    'Switch to the matching workspace or re-run the AI short drama action from the current workspace.',
  ];
}

function currentActiveEpisodeId(activeEpisodeId: string | undefined, fallbackEpisodeId: string | undefined) {
  return activeEpisodeId ?? fallbackEpisodeId;
}

function createShortDramaStageAgentSessionCandidates(
  sessions: Map<string, Session>,
): ShortDramaStageAgentSessionCandidate[] {
  return Array.from(sessions.values()).map(session => ({
    childSessionId: session.sessionId,
    parentSessionId: session.parentSessionId,
    parentToolCallId: session.parentToolCallId,
    subagentType: session.subagentType,
    agentType: session.config?.agentType ?? session.mode,
    title: session.title,
    workspacePath: session.workspacePath,
    createdAt: session.createdAt,
    lastActiveAt: session.lastActiveAt,
    isTransient: session.isTransient,
    agentBackedTransient: session.agentBackedTransient,
  }));
}

function createShortDramaFlowSessionSignature(sessions: Map<string, Session>) {
  return Array.from(sessions.values())
    .map(session => [
      session.sessionId,
      session.parentSessionId ?? '',
      session.parentToolCallId ?? '',
      session.subagentType ?? '',
      session.config?.agentType ?? session.mode ?? '',
      session.title ?? '',
      session.workspacePath ?? '',
      String(session.createdAt ?? ''),
      String(session.lastActiveAt ?? ''),
      session.isTransient ? 'transient' : '',
      session.agentBackedTransient ? 'agent-backed' : '',
    ].join(':'))
    .join('|');
}

function ShortDramaTopBar({
  selectedStage,
  onStageSelect,
  t,
}: {
  selectedStage: ShortDramaStage;
  onStageSelect: (stage: ShortDramaStage) => void;
  t: Translate;
}) {
  return (
    <header className="short-drama-center__topbar">
      <nav className="short-drama-center__tabs" aria-label={t('shortDrama.tabs.label')}>
        {STAGES.map(stage => (
          <button
            key={stage}
            type="button"
            className={`short-drama-center__tab ${selectedStage === stage ? 'is-active' : ''}`}
            data-testid="short-drama-stage-tab"
            data-short-drama-stage={stage}
            onClick={() => onStageSelect(stage)}
            onFocus={(event) => {
              event.currentTarget.scrollIntoView({
                block: 'nearest',
                inline: 'nearest',
              });
            }}
          >
            {t(`shortDrama.tabs.${stage}`)}
          </button>
        ))}
      </nav>
    </header>
  );
}

function EpisodeNavigation({
  episodes,
  selectedEpisodeId,
  onEpisodeSelect,
  t,
}: {
  episodes: Array<{ id: string; number: number }>;
  selectedEpisodeId: string;
  onEpisodeSelect: (episodeId: string) => void;
  t: Translate;
}) {
  return (
    <aside className="short-drama-center__episode-rail" aria-label={t('shortDrama.episodes.label')} data-testid="short-drama-episode-rail">
      {episodes.map(episode => (
        <button
          key={episode.id}
          type="button"
          className={episode.id === selectedEpisodeId ? 'is-active' : ''}
          data-episode-id={episode.id}
          onClick={() => onEpisodeSelect(episode.id)}
        >
          <strong>{episode.number}</strong>
        </button>
      ))}
    </aside>
  );
}

function ScriptStage({
  document,
  editorRef,
  editorTheme,
  onContentChange,
  t,
}: {
  document?: ShortDramaScriptDocumentViewModel;
  editorRef: React.RefObject<EditorInstance>;
  editorTheme: 'light' | 'dark';
  onContentChange: (content: string) => void;
  t: Translate;
}) {
  const hasContent = Boolean(document?.content.trim());

  return (
    <div className={`short-drama-center__script ${hasContent ? '' : 'is-empty'}`}>
      {!hasContent ? (
        <div className="short-drama-center__script-empty">
          <strong>{t('shortDrama.states.emptyScriptTitle')}</strong>
          <p>{t('shortDrama.states.emptyScriptBody')}</p>
        </div>
      ) : null}
      <MEditor
        ref={editorRef}
        value={document?.content ?? ''}
        onChange={onContentChange}
        mode="ir"
        theme={editorTheme}
        height="100%"
        width="100%"
        placeholder={t('shortDrama.states.emptyScriptPlaceholder')}
        toolbar={false}
        readonly={false}
        className="short-drama-center__script-editor"
      />
    </div>
  );
}

function getScriptHeadingElements(
  document: ShortDramaScriptDocumentViewModel | undefined,
  container: HTMLElement,
) {
  const headings = Array.from(container.querySelectorAll<HTMLElement>(
    '.short-drama-center__script-editor .ProseMirror h1, .short-drama-center__script-editor .ProseMirror h2',
  ));
  return headings.flatMap(element => {
    const text = element.textContent?.trim();
    const anchor = document?.anchors.find(item => item.title === text);
    return anchor ? [{ episodeId: anchor.episodeId, element }] : [];
  });
}

function findScriptHeadingElement(
  document: ShortDramaScriptDocumentViewModel | undefined,
  episodeId: string,
  container: HTMLElement | null,
) {
  if (!container) {
    return undefined;
  }

  return getScriptHeadingElements(document, container)
    .find(item => item.episodeId === episodeId)
    ?.element;
}

function findClosestEpisodeId(
  container: HTMLElement,
  items: Array<{ episodeId: string; element: HTMLElement }>,
) {
  const containerTop = container.getBoundingClientRect().top;
  let nextEpisodeId: string | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const { episodeId, element } of items) {
    const distance = Math.abs(element.getBoundingClientRect().top - containerTop);
    if (distance < closestDistance) {
      closestDistance = distance;
      nextEpisodeId = episodeId;
    }
  }

  return nextEpisodeId;
}

function AssetStage({
  categories,
  pendingGenerations,
  mediaEntriesByArtifactId,
  expandedArtifactId,
  focusedArtifactIdOrHandle,
  onArtifactFocus,
  onExpandedArtifactChange,
  t,
}: {
  categories: ShortDramaAssetAnchorCategory[];
  pendingGenerations: WorkspaceMediaPendingGeneration[];
  mediaEntriesByArtifactId: Map<string, ShortDramaMediaArtifactIndexEntry>;
  expandedArtifactId?: string;
  focusedArtifactIdOrHandle?: string;
  onArtifactFocus: (artifact: ShortDramaArtifact) => void;
  onExpandedArtifactChange: (artifactId?: string) => void;
  t: Translate;
}) {
  return (
    <div className="short-drama-center__asset-page">
      {pendingGenerations.length > 0 && (
        <section className="short-drama-center__asset-section">
          <header className="short-drama-center__asset-header">
            <h3>{t('shortDrama.assets.generating')}</h3>
            <span>{t('shortDrama.assets.pendingCount', { count: pendingGenerations.length })}</span>
          </header>
          <div className="short-drama-center__asset-list">
            {pendingGenerations.map(item => (
              <PendingAssetGenerationCard key={item.id} item={item} t={t} />
            ))}
          </div>
        </section>
      )}
      {categories.map(category => {
        const assetTypeLabel = t(`shortDrama.assets.${category.id}`);

        return (
          <section key={category.id} className="short-drama-center__asset-section">
            <header className="short-drama-center__asset-header">
              <h3>{assetTypeLabel}</h3>
              <span>{t('shortDrama.assets.count', { count: category.items.length })}</span>
            </header>
            {category.items.length ? (
              <div className="short-drama-center__asset-list">
                {category.items.map(item => (
                  <AssetAnchorCard
                    key={item.artifact.id}
                    item={item}
                    mediaEntriesByArtifactId={mediaEntriesByArtifactId}
                    expandedArtifactId={expandedArtifactId}
                    focusedArtifactIdOrHandle={focusedArtifactIdOrHandle}
                    onArtifactFocus={onArtifactFocus}
                    onExpandedArtifactChange={onExpandedArtifactChange}
                    t={t}
                  />
                ))}
              </div>
            ) : (
              <div className="short-drama-center__asset-empty">
                {t('shortDrama.assets.empty')}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function PendingStageGenerationGrid({
  items,
  t,
}: {
  items: WorkspaceMediaPendingGeneration[];
  t: Translate;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="short-drama-center__grid short-drama-center__grid--pending">
      {items.map(item => (
        <PendingAssetGenerationCard key={item.id} item={item} t={t} />
      ))}
    </div>
  );
}

function PendingAssetGenerationCard({
  item,
  t,
}: {
  item: WorkspaceMediaPendingGeneration;
  t: Translate;
}) {
  return (
    <article
      className="short-drama-card short-drama-card--pending short-drama-pending-row"
      data-testid="short-drama-pending-asset-card"
    >
      <div className="short-drama-media-preview short-drama-pending-row__preview is-generating">
        <div className="short-drama-media-preview__empty">
          <MediaPlaceholderMark kind="image" />
        </div>
      </div>
      <div className="short-drama-pending-row__content">
        <strong>{t('shortDrama.assets.pendingTitle', { index: item.itemIndex })}</strong>
        <span>{item.model ?? t('shortDrama.assets.pendingModelUnknown')}</span>
        <p>{item.prompt ?? item.batchId}</p>
        <div className="short-drama-pending-row__meta">
          <StatusPill status="generating" t={t} />
          <span className="short-drama-pill">{item.requestedAspectRatio}</span>
        </div>
      </div>
    </article>
  );
}

function AssetAnchorCard({
  item,
  mediaEntriesByArtifactId,
  expandedArtifactId,
  focusedArtifactIdOrHandle,
  onArtifactFocus,
  onExpandedArtifactChange,
  t,
}: {
  item: ShortDramaAssetAnchorCategory['items'][number];
  mediaEntriesByArtifactId: Map<string, ShortDramaMediaArtifactIndexEntry>;
  expandedArtifactId?: string;
  focusedArtifactIdOrHandle?: string;
  onArtifactFocus: (artifact: ShortDramaArtifact) => void;
  onExpandedArtifactChange: (artifactId?: string) => void;
  t: Translate;
}) {
  const artifact = item.artifact;
  const isSelected = expandedArtifactId === artifact.id;
  const isFocused = focusedArtifactIdOrHandle === artifact.id
    || focusedArtifactIdOrHandle === artifact.handle;
  const mediaEntry = mediaEntriesByArtifactId.get(artifact.id);
  const preview = createShortDramaMediaPreviewViewModel(artifact, undefined, mediaEntry);
  const handleOpenPreview = () => {
    if (preview.status !== 'ready') {
      return;
    }
    const localPath = preview.localPath ?? preview.filePath;
    const openWithUrl = (url?: string) => {
      if (!url) {
        return;
      }
      openMediaPreviewPanel({
        kind: preview.kind ?? 'media',
        url,
        localPath,
        title: artifact.title,
      });
    };
    const directUrl = isDirectRenderableMediaUrl(preview.previewUrl) ? preview.previewUrl : undefined;
    if (directUrl) {
      openWithUrl(directUrl);
      return;
    }
    if (!localPath) {
      return;
    }
    void resolveWorkspaceMediaPreviewUrl({
      filePath: localPath,
      extension: extensionFromPath(localPath),
      kind: preview.kind,
    }).then(resolvedUrl => openWithUrl(resolvedUrl ?? undefined));
  };
  const handleTileActivate = () => {
    onArtifactFocus(artifact);
    if (isSelected) {
      handleOpenPreview();
    } else {
      onExpandedArtifactChange(artifact.id);
    }
  };

  return (
    <article
      id={getShortDramaArtifactDomId(artifact.id)}
      className={`short-drama-card short-drama-asset-row ${isSelected ? 'is-selected' : ''} ${isFocused ? 'is-focused' : ''}`}
      data-testid="short-drama-artifact-card"
      data-status={artifact.status}
    >
      <ArtifactFocusButton artifact={artifact} onArtifactFocus={onArtifactFocus} t={t} />
      <MediaPreview artifact={artifact} mediaEntry={mediaEntry} t={t} variant="tile" />
      <button
        type="button"
        className="short-drama-asset-row__toggle"
        aria-pressed={isSelected}
        onClick={(event) => {
          event.stopPropagation();
          handleTileActivate();
        }}
      >
        <span className="short-drama-asset-row__heading">
          <strong>{artifact.title}</strong>
        </span>
      </button>
      <div className="short-drama-asset-row__overlay">
        {preview.status === 'ready' && (
          <button
            type="button"
            className="short-drama-asset-row__zoom"
            aria-label={t('shortDrama.accessibility.openArtifact', { title: artifact.title })}
            title={t('shortDrama.accessibility.openArtifact', { title: artifact.title })}
            onClick={(event) => {
              event.stopPropagation();
              onArtifactFocus(artifact);
              handleOpenPreview();
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <div className="short-drama-asset-row__overlay-body">
          <strong aria-hidden="true">{artifact.title}</strong>
        </div>
      </div>
    </article>
  );
}

function ArtifactGrid({
  artifacts,
  mediaEntriesByArtifactId,
  onArtifactFocus,
  t,
}: {
  artifacts: ShortDramaArtifact[];
  mediaEntriesByArtifactId: Map<string, ShortDramaMediaArtifactIndexEntry>;
  onArtifactFocus: (artifact: ShortDramaArtifact) => void;
  t: Translate;
}) {
  return (
    <div className="short-drama-center__grid">
      {artifacts.map(artifact => (
        <ArtifactCard key={artifact.id} artifact={artifact} mediaEntry={mediaEntriesByArtifactId.get(artifact.id)} onArtifactFocus={onArtifactFocus} t={t} />
      ))}
    </div>
  );
}

function StoryboardGrid({
  artifacts,
  projectArtifacts,
  storyboardReferencePlans,
  mediaEntriesByArtifactId,
  expandedArtifactId,
  focusedArtifactIdOrHandle,
  onArtifactFocus,
  onExpandedArtifactChange,
  selectedRevisionIds,
  revisionMediaItemsById,
  onRevisionSelect,
  t,
}: {
  artifacts: ShortDramaArtifact[];
  projectArtifacts: ShortDramaArtifact[];
  storyboardReferencePlans: ShortDramaStoryboardReferencePlan[];
  mediaEntriesByArtifactId: Map<string, ShortDramaMediaArtifactIndexEntry>;
  expandedArtifactId?: string;
  focusedArtifactIdOrHandle?: string;
  onArtifactFocus: (artifact: ShortDramaArtifact) => void;
  onExpandedArtifactChange: (artifactId?: string) => void;
  selectedRevisionIds: Record<string, string | undefined>;
  revisionMediaItemsById: Map<string, WorkspaceMediaItem>;
  onRevisionSelect: (artifactId: string, revisionId?: string) => void;
  t: Translate;
}) {
  return (
    <div className="short-drama-center__storyboard-list">
      {artifacts.map((artifact, index) => {
        const isExpanded = expandedArtifactId === artifact.id;
        const isFocused = focusedArtifactIdOrHandle === artifact.id
          || focusedArtifactIdOrHandle === artifact.handle;
        const detailsId = `${getShortDramaArtifactDomId(artifact.id)}-details`;
        const selectedRevisionId = selectedRevisionIds[artifact.id];
        const previewArtifact = createRevisionPreviewArtifact(artifact, selectedRevisionId, revisionMediaItemsById);
        const referenceCount = createShortDramaStoryboardReferenceViewItems({
          artifact,
          projectArtifacts,
          storyboardReferencePlans,
        }).length;

        return (
          <article
            key={artifact.id}
            id={getShortDramaArtifactDomId(artifact.id)}
            className={`short-drama-card short-drama-storyboard-row ${isExpanded ? 'is-expanded' : ''} ${isFocused ? 'is-focused' : ''}`}
            data-testid="short-drama-artifact-card"
            data-status={artifact.status}
            onClick={() => onArtifactFocus(artifact)}
          >
            <ArtifactFocusButton artifact={artifact} onArtifactFocus={onArtifactFocus} t={t} />
            {isExpanded ? (
              <MediaPreview artifact={previewArtifact} mediaEntry={mediaEntriesByArtifactId.get(artifact.id)} t={t} />
            ) : (
              <MediaPreview artifact={artifact} mediaEntry={mediaEntriesByArtifactId.get(artifact.id)} t={t} variant="row" />
            )}
            <button
              type="button"
              className="short-drama-storyboard-row__toggle"
              aria-expanded={isExpanded}
              aria-controls={detailsId}
              onClick={(event) => {
                event.stopPropagation();
                onArtifactFocus(artifact);
                onExpandedArtifactChange(isExpanded ? undefined : artifact.id);
              }}
            >
              <span className="short-drama-storyboard-row__heading">
                <strong>{t('shortDrama.storyboards.cardTitle', { scene: index + 1, shot: index + 1 })}</strong>
                <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
              </span>
              <span className="short-drama-storyboard-row__summary">{artifact.summary}</span>
              <span className="short-drama-storyboard-row__meta">
                <StatusPill status={artifact.status} t={t} />
                <span className="short-drama-pill">
                  {t('shortDrama.accessibility.storyboardReferences')} · {referenceCount}
                </span>
                <span className="short-drama-pill">{t('shortDrama.storyboards.setupCount', { count: artifact.attemptCount })}</span>
              </span>
            </button>
            <div
              id={detailsId}
              className="short-drama-storyboard-row__details"
              hidden={!isExpanded}
            >
              <ArtifactRevisionStrip
                artifact={artifact}
                selectedRevisionId={selectedRevisionId}
                onRevisionSelect={onRevisionSelect}
                t={t}
              />
              <StoryboardReferenceChips
                artifact={artifact}
                projectArtifacts={projectArtifacts}
                storyboardReferencePlans={storyboardReferencePlans}
                t={t}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function StoryboardReferenceChips({
  artifact,
  projectArtifacts,
  storyboardReferencePlans,
  t,
}: {
  artifact: ShortDramaArtifact;
  projectArtifacts: ShortDramaArtifact[];
  storyboardReferencePlans: ShortDramaStoryboardReferencePlan[];
  t: Translate;
}) {
  const items = createShortDramaStoryboardReferenceViewItems({
    artifact,
    projectArtifacts,
    storyboardReferencePlans,
  });

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className="short-drama-card__references"
      aria-label={t('shortDrama.accessibility.storyboardReferences')}
    >
      {items.slice(0, 6).map(item => (
        <span key={item.key}>
          {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" aria-hidden="true" />}
          <strong>{item.kindLabel}</strong>
          {item.label}
        </span>
      ))}
    </div>
  );
}

function formatShortDramaRevisionDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric' }).format(new Date(timestamp));
}

function createRevisionPreviewArtifact(
  artifact: ShortDramaArtifact,
  selectedRevisionId: string | undefined,
  revisionMediaItemsById: Map<string, WorkspaceMediaItem>,
): ShortDramaArtifact {
  if (!selectedRevisionId) {
    return artifact;
  }
  const revision = artifact.revisions.find(item => item.id === selectedRevisionId);
  if (!revision) {
    return artifact;
  }
  const mediaItem = revision.mediaItemId ? revisionMediaItemsById.get(revision.mediaItemId) : undefined;
  const mediaReference: ShortDramaMediaReference | undefined = mediaItem
    ? {
        mediaItemId: mediaItem.id,
        kind: mediaItem.kind,
        label: revision.summary || artifact.title,
        localPath: mediaItem.filePath,
        filePath: mediaItem.filePath,
        relativePath: mediaItem.relativePath,
        previewUrl: mediaItem.previewUrl ?? mediaItem.generationResultUrl,
        thumbnailUrl: mediaItem.thumbnailUrl ?? mediaItem.previewUrl ?? mediaItem.generationResultUrl,
        durationMs: mediaItem.durationMs,
        source: 'generated',
      }
    : undefined;
  return { ...artifact, mediaReference };
}

function ArtifactRevisionStrip({
  artifact,
  selectedRevisionId,
  onRevisionSelect,
  t,
}: {
  artifact: ShortDramaArtifact;
  selectedRevisionId?: string;
  onRevisionSelect: (artifactId: string, revisionId?: string) => void;
  t: Translate;
}) {
  if (artifact.revisions.length === 0) {
    return null;
  }
  const orderedRevisions = [...artifact.revisions].sort((left, right) => right.version - left.version);
  const selectedRevision = selectedRevisionId
    ? artifact.revisions.find(item => item.id === selectedRevisionId)
    : undefined;

  return (
    <div className="short-drama-revision-strip" aria-label={t('shortDrama.revisions.label')}>
      <div className="short-drama-revision-strip__track" role="group">
        <button
          type="button"
          className={`short-drama-pill short-drama-revision-chip${selectedRevision ? '' : ' is-selected'}`}
          aria-pressed={!selectedRevision}
          onClick={(event) => {
            event.stopPropagation();
            onRevisionSelect(artifact.id, undefined);
          }}
        >
          {t('shortDrama.revisions.current')}
        </button>
        {orderedRevisions.map(revision => {
          const isSelected = selectedRevision?.id === revision.id;
          return (
            <button
              key={revision.id}
              type="button"
              className={`short-drama-pill short-drama-revision-chip${isSelected ? ' is-selected' : ''}`}
              aria-pressed={isSelected}
              aria-label={t('shortDrama.revisions.viewVersion', { version: revision.version })}
              onClick={(event) => {
                event.stopPropagation();
                onRevisionSelect(artifact.id, revision.id);
              }}
            >
              <strong>v{revision.version}</strong>
              <span>{formatShortDramaRevisionDate(revision.createdAt)}</span>
            </button>
          );
        })}
      </div>
      {selectedRevision && (
        <p className="short-drama-revision-strip__detail">
          {t('shortDrama.revisions.versionDetail', {
            version: selectedRevision.version,
            date: formatShortDramaRevisionDate(selectedRevision.createdAt),
            summary: selectedRevision.summary,
          })}
        </p>
      )}
    </div>
  );
}

function VideoStage({
  artifacts,
  episodeArtifacts,
  mediaEntriesByArtifactId,
  focusedArtifactIdOrHandle,
  onArtifactFocus,
  t,
}: {
  artifacts: ShortDramaArtifact[];
  episodeArtifacts: ShortDramaArtifact[];
  mediaEntriesByArtifactId: Map<string, ShortDramaMediaArtifactIndexEntry>;
  focusedArtifactIdOrHandle?: string;
  onArtifactFocus: (artifact: ShortDramaArtifact) => void;
  t: Translate;
}) {
  const [selectedVideoId, setSelectedVideoId] = useState<string>();
  const focusedVideo = focusedArtifactIdOrHandle
    ? artifacts.find(artifact => (
        artifact.id === focusedArtifactIdOrHandle
        || artifact.handle === focusedArtifactIdOrHandle
      ))
    : undefined;
  const activeVideo = focusedVideo
    ?? artifacts.find(artifact => artifact.id === selectedVideoId)
    ?? artifacts[0];
  const activePosterArtifact = activeVideo
    ? selectVideoPosterArtifact(activeVideo, episodeArtifacts)
    : undefined;
  const activeVideoIndex = activeVideo
    ? artifacts.findIndex(artifact => artifact.id === activeVideo.id)
    : -1;

  useEffect(() => {
    if (!selectedVideoId && activeVideo) {
      setSelectedVideoId(activeVideo.id);
    }
  }, [activeVideo, selectedVideoId]);

  const handleVideoRailKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentTab = event.target;
    if (!(currentTab instanceof HTMLButtonElement) || currentTab.getAttribute('role') !== 'tab') {
      return;
    }

    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    const nextIndex = getNextShortDramaRovingTabIndex(
      tabs.indexOf(currentTab),
      event.key,
      tabs.length,
    );
    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  }, []);

  return (
    <div className="short-drama-center__video" data-testid="short-drama-video-stage">
      <article
        id={activeVideo ? getShortDramaArtifactDomId(activeVideo.id) : undefined}
        className="short-drama-center__stage"
        data-testid="short-drama-artifact-card"
        onClick={() => {
          if (activeVideo) {
            onArtifactFocus(activeVideo);
          }
        }}
      >
        {activeVideo && (
          <ArtifactFocusButton artifact={activeVideo} onArtifactFocus={onArtifactFocus} t={t} />
        )}
        <div className="short-drama-center__scene-marker">
          <span>
            {activeVideoIndex >= 0
              ? t('shortDrama.video.sceneRef', { scene: activeVideoIndex + 1 })
              : t('shortDrama.tabs.video')}
          </span>
          {activeVideoIndex >= 0 && <em>{activeVideoIndex + 1} / {artifacts.length}</em>}
        </div>
        {activeVideo && (
          <MediaPreview
            artifact={activeVideo}
            mediaEntry={mediaEntriesByArtifactId.get(activeVideo.id)}
            posterArtifact={activePosterArtifact}
            posterMediaEntry={activePosterArtifact ? mediaEntriesByArtifactId.get(activePosterArtifact.id) : undefined}
            t={t}
            variant="large"
          />
        )}
        <div className="short-drama-center__prompt">
          {activeVideo?.summary ?? t('shortDrama.video.noPrompt')}
        </div>
      </article>

      <div
        className="short-drama-center__rail"
        role="tablist"
        aria-label={t('shortDrama.tabs.video')}
        aria-orientation="horizontal"
        onKeyDown={handleVideoRailKeyDown}
      >
        {artifacts.map((artifact, index) => {
          const posterArtifact = selectVideoPosterArtifact(artifact, episodeArtifacts);
          return (
            <button
              key={artifact.id}
              type="button"
              data-testid="short-drama-video-rail-item"
              className={activeVideo?.id === artifact.id ? 'is-active' : ''}
              role="tab"
              aria-selected={activeVideo?.id === artifact.id}
              tabIndex={activeVideo?.id === artifact.id ? 0 : -1}
              onClick={() => {
                setSelectedVideoId(artifact.id);
                onArtifactFocus(artifact);
              }}
            >
              <MediaPreview
                artifact={artifact}
                mediaEntry={mediaEntriesByArtifactId.get(artifact.id)}
                posterArtifact={posterArtifact}
                posterMediaEntry={posterArtifact ? mediaEntriesByArtifactId.get(posterArtifact.id) : undefined}
                t={t}
                variant="rail"
              />
              <span>{t('shortDrama.video.sceneRef', { scene: index + 1 })}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function selectVideoPosterArtifact(
  videoArtifact: ShortDramaArtifact,
  episodeArtifacts: ShortDramaArtifact[],
): ShortDramaArtifact | undefined {
  const sourceStoryboard = videoArtifact.sourceStoryboard?.trim().toLowerCase();
  if (sourceStoryboard) {
    const exact = episodeArtifacts.find(artifact => (
      artifact.id.toLowerCase() === sourceStoryboard
      || artifact.handle?.toLowerCase() === sourceStoryboard
    ));
    if (exact?.mediaReference) {
      return exact;
    }
  }
  return episodeArtifacts.find(artifact => artifact.stage === 'storyboards' && Boolean(artifact.mediaReference));
}

function PostStage({
  artifacts,
  episodeArtifacts,
  mediaEntriesByArtifactId,
  focusedArtifactIdOrHandle,
  onArtifactFocus,
  t,
}: {
  artifacts: ShortDramaArtifact[];
  episodeArtifacts: ShortDramaArtifact[];
  mediaEntriesByArtifactId: Map<string, ShortDramaMediaArtifactIndexEntry>;
  focusedArtifactIdOrHandle?: string;
  onArtifactFocus: (artifact: ShortDramaArtifact) => void;
  t: Translate;
}) {
  const finalVideo = selectShortDramaPostFinalPreviewArtifact(episodeArtifacts, mediaEntriesByArtifactId);

  return (
    <div className="short-drama-center__post">
      <FinalVideoPreview artifact={finalVideo} mediaEntry={finalVideo ? mediaEntriesByArtifactId.get(finalVideo.id) : undefined} onArtifactFocus={onArtifactFocus} t={t} />
      <div className="short-drama-center__post-list">
        {artifacts.map(artifact => {
          const isFocused = focusedArtifactIdOrHandle === artifact.id
            || focusedArtifactIdOrHandle === artifact.handle;
          return (
          <article
            key={artifact.id}
            id={getShortDramaArtifactDomId(artifact.id)}
            className={`short-drama-center__post-row ${isFocused ? 'is-focused' : ''}`}
            data-testid="short-drama-post-row"
            onClick={() => onArtifactFocus(artifact)}
          >
            <ArtifactFocusButton artifact={artifact} onArtifactFocus={onArtifactFocus} t={t} />
            <MediaPreview artifact={artifact} mediaEntry={mediaEntriesByArtifactId.get(artifact.id)} t={t} variant="row" />
            <strong>{artifact.title}</strong>
            <span className="short-drama-center__post-media-ref">
              {artifact.mediaReference?.label ?? artifact.mediaReference?.mediaItemId ?? ''}
            </span>
            <div className="short-drama-center__progress">
              <span style={{ width: `${artifact.status === 'ready' ? 100 : artifact.status === 'generating' ? 55 : 18}%` }} />
            </div>
            <StatusPill status={artifact.status} t={t} />
          </article>
          );
        })}
      </div>
    </div>
  );
}

function FinalVideoPreview({
  artifact,
  mediaEntry,
  onArtifactFocus,
  t,
}: {
  artifact?: ShortDramaArtifact;
  mediaEntry?: ShortDramaMediaArtifactIndexEntry;
  onArtifactFocus: (artifact: ShortDramaArtifact) => void;
  t: Translate;
}) {
  return (
    <section
      className={`short-drama-center__final-preview ${artifact ? 'has-video' : 'is-empty'}`}
      aria-label={t('shortDrama.post.finalPreview')}
      onClick={() => {
        if (artifact) {
          onArtifactFocus(artifact);
        }
      }}
    >
      {artifact && (
        <ArtifactFocusButton artifact={artifact} onArtifactFocus={onArtifactFocus} t={t} />
      )}
      {artifact ? (
        <MediaPreview artifact={artifact} mediaEntry={mediaEntry} t={t} variant="final" />
      ) : (
        <div className="short-drama-center__final-preview-frame">
          <span className="short-drama-center__play-mark" aria-hidden="true" />
          <div>
            <strong>{t('shortDrama.post.emptyPreview')}</strong>
            <p>{t('shortDrama.post.emptyPreviewHint')}</p>
          </div>
        </div>
      )}
      {artifact && (
        <div className="short-drama-center__final-preview-meta">
          <StatusPill status={artifact.status} t={t} />
          {artifact.mediaReference && (
            <span
              className="short-drama-center__final-preview-media-id"
              title={artifact.mediaReference.mediaItemId}
            >
              {artifact.mediaReference.mediaItemId}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function ArtifactCard({
  artifact,
  mediaEntry,
  onArtifactFocus,
  t,
}: {
  artifact: ShortDramaArtifact;
  mediaEntry?: ShortDramaMediaArtifactIndexEntry;
  onArtifactFocus?: (artifact: ShortDramaArtifact) => void;
  t: Translate;
}) {
  return (
    <article
      id={getShortDramaArtifactDomId(artifact.id)}
      className="short-drama-card"
      data-testid="short-drama-artifact-card"
      onClick={() => onArtifactFocus?.(artifact)}
    >
      <ArtifactFocusButton artifact={artifact} onArtifactFocus={onArtifactFocus} t={t} />
      <MediaPreview artifact={artifact} mediaEntry={mediaEntry} t={t} />
      <ArtifactCardBody artifact={artifact} t={t} />
    </article>
  );
}

function ArtifactCardBody({
  artifact,
  t,
  showStatus = true,
}: {
  artifact: ShortDramaArtifact;
  t: Translate;
  showStatus?: boolean;
}) {
  const card = createShortDramaArtifactCardViewModel(artifact);

  return (
    <div className="short-drama-card__body">
      <h3>{artifact.title}</h3>
      <p>{artifact.summary}</p>
      {card.media.status === 'referenced' && (
        <div className="short-drama-card__media-ref">
          <span>{t('shortDrama.card.mediaReference')}</span>
          <strong>{card.media.label ?? card.media.mediaItemId}</strong>
          <em>{t(`shortDrama.mediaKind.${card.media.kind}`)}</em>
        </div>
      )}
      {(artifact.failureReason || artifact.statusReason) && (
        <p className="short-drama-card__notice">
          {artifact.failureReason || artifact.statusReason}
        </p>
      )}
      <div className="short-drama-card__meta">
        {showStatus && <StatusPill status={artifact.status} t={t} />}
        <span className="short-drama-pill">{t('shortDrama.card.revisions', { count: artifact.revisionCount })}</span>
        <span className="short-drama-pill">{t('shortDrama.card.attempts', { count: artifact.attemptCount })}</span>
      </div>
    </div>
  );
}

function ArtifactFocusButton({
  artifact,
  onArtifactFocus,
  t,
}: {
  artifact: ShortDramaArtifact;
  onArtifactFocus?: (artifact: ShortDramaArtifact) => void;
  t: Translate;
}) {
  if (!onArtifactFocus) {
    return null;
  }

  return (
    <button
      type="button"
      className="sr-only short-drama-artifact-activation"
      aria-label={t('shortDrama.accessibility.focusArtifact', { title: artifact.title })}
      onClick={(event) => {
        event.stopPropagation();
        onArtifactFocus(artifact);
      }}
    />
  );
}

function MediaPlaceholderMark({ kind }: { kind?: 'image' | 'video' | 'audio' }) {
  return (
    <span
      className={kind === 'image' ? 'short-drama-center__image-mark' : 'short-drama-center__play-mark'}
      aria-hidden="true"
    />
  );
}

function MediaPreview({
  artifact,
  mediaEntry,
  posterArtifact,
  posterMediaEntry,
  t,
  variant = 'card',
}: {
  artifact: ShortDramaArtifact;
  mediaEntry?: ShortDramaMediaArtifactIndexEntry;
  posterArtifact?: ShortDramaArtifact;
  posterMediaEntry?: ShortDramaMediaArtifactIndexEntry;
  t: Translate;
  variant?: 'card' | 'large' | 'final' | 'rail' | 'row' | 'tile';
}) {
  const preview = createShortDramaMediaPreviewViewModel(artifact, undefined, mediaEntry);
  const posterPreview = posterArtifact
    ? createShortDramaMediaPreviewViewModel(posterArtifact, undefined, posterMediaEntry)
    : undefined;
  const readyPreview = preview.status === 'ready' ? preview : undefined;
  const readyPosterPreview = posterPreview?.status === 'ready' && posterPreview.kind === 'image'
    ? posterPreview
    : undefined;
  const isPreviewReady = readyPreview !== undefined;
  const isPosterPreviewReady = readyPosterPreview !== undefined;
  const readyPreviewKind = readyPreview?.kind;
  const readyPosterPreviewKind = readyPosterPreview?.kind;
  const readyPreviewLocalPath = readyPreview?.localPath ?? readyPreview?.filePath;
  const readyPosterPreviewLocalPath = readyPosterPreview?.localPath ?? readyPosterPreview?.filePath;
  const readyPreviewDirectUrl = readyPreview && isDirectRenderableMediaUrl(readyPreview.previewUrl)
    ? readyPreview.previewUrl
    : undefined;
  const readyPreviewDirectThumbnailUrl = readyPreview?.thumbnailUrl && isDirectRenderableMediaUrl(readyPreview.thumbnailUrl)
    ? readyPreview.thumbnailUrl
    : readyPreviewDirectUrl;
  const readyPosterPreviewDirectUrl = readyPosterPreview && isDirectRenderableMediaUrl(readyPosterPreview.previewUrl)
    ? readyPosterPreview.previewUrl
    : undefined;
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState<string>();
  const [resolvedThumbnailUrl, setResolvedThumbnailUrl] = useState<string>();
  const [resolvedPosterUrl, setResolvedPosterUrl] = useState<string>();
  const isRail = variant === 'rail';
  const mediaUrl = preview.status === 'ready'
    ? resolvedPreviewUrl ?? (isDirectRenderableMediaUrl(preview.previewUrl) ? preview.previewUrl : undefined)
    : undefined;
  const className = [
    'short-drama-media-preview',
    `short-drama-media-preview--${variant}`,
    `is-${preview.status}`,
    preview.kind ? `is-${preview.kind}` : '',
  ].filter(Boolean).join(' ');

  useEffect(() => {
    let cancelled = false;
    if (!isPreviewReady) {
      setResolvedPreviewUrl(undefined);
      setResolvedThumbnailUrl(undefined);
      return undefined;
    }

    if (readyPreviewDirectUrl || !readyPreviewLocalPath) {
      setResolvedPreviewUrl(readyPreviewDirectUrl);
      setResolvedThumbnailUrl(readyPreviewDirectThumbnailUrl);
    }

    if (!readyPreviewLocalPath) {
      return undefined;
    }

    resolveWorkspaceMediaPreviewUrl({
      filePath: readyPreviewLocalPath,
      extension: extensionFromPath(readyPreviewLocalPath),
      kind: readyPreviewKind,
    })
      .then(url => {
        if (!cancelled && url) {
          setResolvedPreviewUrl(url);
          setResolvedThumbnailUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedPreviewUrl(readyPreviewDirectUrl);
          setResolvedThumbnailUrl(readyPreviewDirectThumbnailUrl);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    isPreviewReady,
    readyPreviewKind,
    readyPreview?.mediaItemId,
    readyPreview?.previewUrl,
    readyPreview?.thumbnailUrl,
    readyPreviewDirectThumbnailUrl,
    readyPreviewDirectUrl,
    readyPreviewLocalPath,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!isPosterPreviewReady) {
      setResolvedPosterUrl(undefined);
      return undefined;
    }

    if (readyPosterPreviewDirectUrl || !readyPosterPreviewLocalPath) {
      setResolvedPosterUrl(readyPosterPreviewDirectUrl);
    }

    if (!readyPosterPreviewLocalPath) {
      return undefined;
    }

    resolveWorkspaceMediaPreviewUrl({
      filePath: readyPosterPreviewLocalPath,
      extension: extensionFromPath(readyPosterPreviewLocalPath),
      kind: readyPosterPreviewKind,
    })
      .then(url => {
        if (!cancelled && url) {
          setResolvedPosterUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedPosterUrl(readyPosterPreviewDirectUrl);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    isPosterPreviewReady,
    readyPosterPreviewKind,
    readyPosterPreview?.mediaItemId,
    readyPosterPreview?.previewUrl,
    readyPosterPreviewDirectUrl,
    readyPosterPreviewLocalPath,
  ]);

  if (preview.status === 'ready') {
    const directThumbnailUrl = preview.thumbnailUrl && isDirectRenderableMediaUrl(preview.thumbnailUrl)
      ? preview.thumbnailUrl
      : undefined;
    const thumbnailUrl = preview.kind === 'video'
      ? directThumbnailUrl ?? resolvedPosterUrl
      : resolvedThumbnailUrl ?? directThumbnailUrl ?? mediaUrl;
    const railThumbnailUrl = preview.kind === 'video' ? directThumbnailUrl ?? resolvedPosterUrl : thumbnailUrl;
    const handleOpenPreview = () => {
      if (isRail || !mediaUrl) {
        return;
      }
      openMediaPreviewPanel({
        kind: preview.kind,
        url: mediaUrl,
        localPath: preview.localPath ?? preview.filePath,
        title: artifact.title,
      });
    };

    return (
      <div
        className={className}
        data-testid="short-drama-media-preview"
      >
        <div className="short-drama-media-preview__canvas">
          {preview.kind === 'image' ? (
            mediaUrl ? (
              <img
                src={mediaUrl}
                alt={artifact.title}
                loading="lazy"
              />
            ) : (
              <div className="short-drama-media-preview__empty">
                <MediaPlaceholderMark kind="image" />
                <div>
                  <strong>{artifact.title}</strong>
                  <p>{t('shortDrama.mediaPreview.referenced')}</p>
                </div>
              </div>
            )
          ) : preview.kind === 'video' ? (
            isRail ? (
              <VideoRailThumbnail
                thumbnailUrl={railThumbnailUrl}
                title={artifact.title}
                t={t}
              />
            ) : mediaUrl ? (
              <div
                className="short-drama-media-preview__video-frame"
                onClick={(event) => event.stopPropagation()}
              >
                <video
                  key={mediaUrl}
                  src={mediaUrl}
                  poster={thumbnailUrl}
                  controls
                  playsInline
                  preload="metadata"
                />
              </div>
            ) : (
              <div className="short-drama-media-preview__empty">
                <MediaPlaceholderMark kind="video" />
                <div>
                  <strong>{artifact.title}</strong>
                  <p>{t('shortDrama.mediaPreview.referenced')}</p>
                </div>
              </div>
            )
          ) : (
            mediaUrl ? (
              <audio src={mediaUrl} controls preload="metadata" />
            ) : (
              <div className="short-drama-media-preview__empty">
                <MediaPlaceholderMark kind="audio" />
                <div>
                  <strong>{artifact.title}</strong>
                  <p>{t('shortDrama.mediaPreview.referenced')}</p>
                </div>
              </div>
            )
          )}
        </div>
        {!isRail && variant !== 'row' && variant !== 'tile' && (
          <div className="short-drama-media-preview__footer">
            <MediaPreviewCaption artifact={artifact} preview={preview} t={t} />
            {mediaUrl && (
              <button
                type="button"
                className="short-drama-media-preview__open"
                aria-label={t('shortDrama.accessibility.openArtifact', { title: artifact.title })}
                title={t('shortDrama.accessibility.openArtifact', { title: artifact.title })}
                onClick={(event) => {
                  event.stopPropagation();
                  handleOpenPreview();
                }}
              >
                ↗
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={className} data-testid="short-drama-media-preview">
      <div className="short-drama-media-preview__empty">
        <MediaPlaceholderMark kind={preview.kind} />
        <div>
          <strong>{artifact.title}</strong>
          <p>{mediaPreviewMessage(preview, t)}</p>
        </div>
      </div>
    </div>
  );
}

function VideoRailThumbnail({
  thumbnailUrl,
  title,
  t,
}: {
  thumbnailUrl?: string;
  title: string;
  t: Translate;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const shouldShowImage = Boolean(thumbnailUrl && !imageFailed);

  if (shouldShowImage) {
    return (
      <img
        src={thumbnailUrl}
        alt={title}
        loading="lazy"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div className="short-drama-media-preview__empty">
      <span className="short-drama-center__play-mark" aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{t('shortDrama.mediaPreview.referenced')}</p>
      </div>
    </div>
  );
}

function extensionFromPath(path: string): string | undefined {
  const cleanPath = path.split(/[?#]/)[0] ?? path;
  const fileName = cleanPath.split(/[\\/]/).pop() ?? cleanPath;
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : undefined;
}

function isDirectRenderableMediaUrl(value?: string): boolean {
  if (!value) {
    return false;
  }
  return /^(data:|blob:|https?:\/\/|\/)/i.test(value);
}

function MediaPreviewCaption({
  artifact,
  preview,
  t,
}: {
  artifact: ShortDramaArtifact;
  preview: Extract<ShortDramaMediaPreviewViewModel, { status: 'ready' }>;
  t: Translate;
}) {
  return (
    <div className="short-drama-media-preview__meta">
      <strong title={artifact.title}>{artifact.title}</strong>
      <span title={preview.label ?? preview.mediaItemId}>
        {preview.label ?? preview.mediaItemId}
      </span>
      {preview.durationMs && (
        <em>{t('shortDrama.mediaPreview.duration', { seconds: Math.round(preview.durationMs / 1000) })}</em>
      )}
    </div>
  );
}

function mediaPreviewMessage(
  preview: Exclude<ShortDramaMediaPreviewViewModel, { status: 'ready' }>,
  t: Translate,
) {
  if (preview.status === 'missing') {
    return t('shortDrama.mediaPreview.missing');
  }
  if (preview.status === 'unsupported') {
    return t('shortDrama.mediaPreview.unsupported');
  }
  if (preview.status === 'referenced') {
    return t('shortDrama.mediaPreview.referenced');
  }
  return t('shortDrama.mediaPreview.empty');
}

function StatusPill({
  status,
  t,
}: {
  status: ShortDramaArtifact['status'];
  t: Translate;
}) {
  return (
    <span className={`short-drama-pill short-drama-pill--${status}`}>
      {t(`shortDrama.status.${status}`)}
    </span>
  );
}
