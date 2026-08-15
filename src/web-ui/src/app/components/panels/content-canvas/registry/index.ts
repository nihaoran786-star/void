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
  CanvasCapabilityContributionRegistry,
  canvasCapabilityContributionRegistry,
  type CanvasCapabilityContribution,
  type CanvasCapabilityContributionRegistrationResult,
  type CanvasCapabilityIconProps,
} from './CanvasCapabilityContributionRegistry';
export {
  CanvasSurfaceRenderer,
  type CanvasSurfaceRendererHostProps,
} from './CanvasSurfaceRenderer';
export { CanvasSurfaceErrorBoundary } from './CanvasSurfaceErrorBoundary';
export { useCanvasWorkspaceFacts } from './useCanvasWorkspaceFacts';
export { ShortDramaCanvasSurfaceRenderer } from './ShortDramaCanvasSurfaceRenderer';
export {
  ensureFirstPartyCanvasSurfacesRegistered,
  registerFirstPartyCanvasSurfaces,
  SHORT_DRAMA_SURFACE_ID,
  WORKSPACE_MEDIA_SURFACE_ID,
  type FirstPartyCanvasSurfaceActivation,
} from './firstPartyCanvasSurfaces';
export {
  ensureFirstPartyCanvasCapabilitiesRegistered,
  registerFirstPartyCanvasCapabilities,
  type FirstPartyCanvasCapabilityActivation,
} from './firstPartyCanvasCapabilities';
