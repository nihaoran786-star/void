export {
  createCanvasStoreHostAdapter,
  type CanvasStoreHostActions,
} from './CanvasStoreHostAdapter';
export {
  CanvasSurfaceRendererRegistry,
  canvasSurfaceRendererRegistry,
  type CanvasSurfaceRendererProps,
} from './CanvasSurfaceRendererRegistry';
export {
  CanvasSurfaceRenderer,
  type CanvasSurfaceRendererHostProps,
} from './CanvasSurfaceRenderer';
export { CanvasSurfaceErrorBoundary } from './CanvasSurfaceErrorBoundary';
export { useCanvasWorkspaceFacts } from './useCanvasWorkspaceFacts';
export {
  dispatchWorkspaceMediaOpen,
  readWorkspaceMediaOpenEventDetail,
  WORKSPACE_MEDIA_OPEN_EVENT,
  type WorkspaceMediaOpenEventDetail,
} from './WorkspaceMediaOpenEvent';
export {
  ensureFirstPartyCanvasSurfacesRegistered,
  registerFirstPartyCanvasSurfaces,
  WORKSPACE_MEDIA_SURFACE_ID,
  type FirstPartyCanvasSurfaceActivation,
} from './firstPartyCanvasSurfaces';
