import type {
  CanvasHostInstance,
  CanvasHostMutationResult,
  CanvasHostOpenRequest,
  CanvasHostPort,
} from '@/shared/services/canvas';
import type {
  CanvasTab,
  EditorGroupId,
  PanelContent,
  PanelContentType,
  TabState,
} from '../types';

interface CanvasStoreTabLocation {
  tab: CanvasTab;
  groupId: EditorGroupId;
}

export interface CanvasStoreHostActions {
  isRequestCurrent: (request: CanvasHostOpenRequest) => boolean;
  addTab: (content: PanelContent, state?: TabState, groupId?: EditorGroupId) => void;
  findTabByMetadata: (
    metadata: Record<string, unknown>,
  ) => CanvasStoreTabLocation | null;
  switchToTab: (tabId: string, groupId: EditorGroupId) => void;
  updateTabContent: (
    tabId: string,
    groupId: EditorGroupId,
    content: PanelContent,
  ) => void;
  showTab: (tabId: string, groupId: EditorGroupId) => void;
}

function createHostError(message: string): CanvasHostMutationResult {
  return {
    status: 'error',
    error: {
      code: 'host-failed',
      message,
    },
  };
}

function createPanelContent(request: CanvasHostOpenRequest): PanelContent {
  return {
    type: (request.legacyContentType ?? 'canvas-surface') as PanelContentType,
    title: request.title,
    data: request.data,
    metadata: {
      ...request.metadata,
      canvasSurfaceId: request.surfaceId,
      canvasSurfaceInstanceKey: request.instanceKey,
      canvasWorkspaceId: request.workspace.workspaceId,
      canvasWorkspacePath: request.workspace.workspacePath,
      canvasWorkspaceBackend: request.workspace.backend,
      canvasSurfaceSource: request.source,
      ...(request.sourceSessionId
        ? { canvasSourceSessionId: request.sourceSessionId }
        : {}),
      ...(request.workspace.backend === 'remote'
        ? {
            canvasRemoteConnectionId: request.workspace.remoteConnectionId,
            ...(request.workspace.remoteHost
              ? { canvasRemoteHost: request.workspace.remoteHost }
              : {}),
          }
        : {}),
    },
  };
}

export function createCanvasStoreHostAdapter(
  actions: CanvasStoreHostActions,
): CanvasHostPort {
  const locations = new Map<string, CanvasStoreTabLocation>();
  const requests = new Map<string, CanvasHostOpenRequest>();

  const remember = (
    instanceKey: string,
    location: CanvasStoreTabLocation | null,
    request?: CanvasHostOpenRequest,
  ): CanvasHostInstance | undefined => {
    if (!location) return undefined;
    locations.set(location.tab.id, location);
    if (request) requests.set(location.tab.id, request);
    const metadata = location.tab.content.metadata;
    const workspaceId = metadata?.canvasWorkspaceId;
    const remoteConnectionId = metadata?.canvasRemoteConnectionId;
    return {
      instanceId: location.tab.id,
      instanceKey,
      surfaceId: String(metadata?.canvasSurfaceId ?? request?.surfaceId ?? ''),
      ...(typeof workspaceId === 'string' ? { workspaceId } : {}),
      ...(typeof remoteConnectionId === 'string' ? { remoteConnectionId } : {}),
    };
  };

  const findLocation = (
    instanceKey: string,
    request?: CanvasHostOpenRequest,
  ): CanvasStoreTabLocation | null => {
    if (request && !actions.isRequestCurrent(request)) return null;
    const current = request
      ? actions.findTabByMetadata({
          canvasSurfaceInstanceKey: instanceKey,
          canvasSurfaceId: request.surfaceId,
          canvasWorkspaceId: request.workspace.workspaceId,
        })
      : actions.findTabByMetadata({ canvasSurfaceInstanceKey: instanceKey });
    if (current) return current;

    const legacyDuplicateCheckKey = request?.metadata?.duplicateCheckKey;
    if (typeof legacyDuplicateCheckKey !== 'string') return null;
    // A path-only legacy key cannot distinguish remote workspaces. Keep the
    // compatibility lookup for local pre-registry tabs, but never let it
    // override a typed instance identity.
    if (
      request?.workspace.backend === 'remote'
      || typeof request?.legacyContentType !== 'string'
    ) return null;
    const legacy = actions.findTabByMetadata({ duplicateCheckKey: legacyDuplicateCheckKey });
    if (legacy && legacy.tab.content.type !== request.legacyContentType) {
      return null;
    }
    const typedInstanceKey = legacy?.tab.content.metadata?.canvasSurfaceInstanceKey;
    if (typeof typedInstanceKey === 'string' && typedInstanceKey !== instanceKey) {
      return null;
    }
    return legacy;
  };

  return {
    findInstance: (instanceKey, request) => (
      remember(instanceKey, findLocation(instanceKey, request), request)
    ),

    open: async request => {
      if (!actions.isRequestCurrent(request)) {
        return createHostError('Canvas host rejected a stale surface request.');
      }
      const raced = findLocation(request.instanceKey, request);
      if (raced) {
        locations.set(raced.tab.id, raced);
        requests.set(raced.tab.id, request);
        actions.showTab(raced.tab.id, raced.groupId);
        actions.switchToTab(raced.tab.id, raced.groupId);
        return { status: 'focused', instanceId: raced.tab.id };
      }

      if (!actions.isRequestCurrent(request)) {
        return createHostError('Canvas host rejected a stale surface request.');
      }
      actions.addTab(createPanelContent(request), 'active', 'primary');
      const opened = findLocation(request.instanceKey, request);
      if (!opened) {
        return createHostError(`Canvas host did not retain surface "${request.surfaceId}".`);
      }
      locations.set(opened.tab.id, opened);
      requests.set(opened.tab.id, request);
      return { status: 'opened', instanceId: opened.tab.id };
    },

    focus: async instanceId => {
      const request = requests.get(instanceId);
      if (request && !actions.isRequestCurrent(request)) {
        return createHostError('Canvas host rejected a stale surface request.');
      }
      const location = locations.get(instanceId);
      if (!location) {
        return createHostError(`Canvas surface instance "${instanceId}" is unavailable.`);
      }
      actions.showTab(location.tab.id, location.groupId);
      actions.switchToTab(location.tab.id, location.groupId);
      return { status: 'focused', instanceId };
    },

    update: async (instanceId, request) => {
      if (!actions.isRequestCurrent(request)) {
        return createHostError('Canvas host rejected a stale surface request.');
      }
      const location = locations.get(instanceId);
      if (!location) {
        return createHostError(`Canvas surface instance "${instanceId}" is unavailable.`);
      }
      actions.updateTabContent(
        location.tab.id,
        location.groupId,
        createPanelContent(request),
      );
      requests.set(instanceId, request);
      actions.showTab(location.tab.id, location.groupId);
      actions.switchToTab(location.tab.id, location.groupId);
      return { status: 'updated', instanceId };
    },
  };
}
