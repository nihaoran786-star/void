import type { CanvasTab } from '../types';

export const isWorkspaceSurfaceTab = (tab: CanvasTab): boolean =>
  tab.content.type === 'workspace-media-gallery'
  || tab.content.type === 'short-drama-center';

export const selectTabStripTabs = (
  tabs: CanvasTab[],
  collapseWorkspaceSurfaces: boolean,
): CanvasTab[] => collapseWorkspaceSurfaces
  ? tabs.filter(tab => !isWorkspaceSurfaceTab(tab))
  : tabs;

export const resolveVisibleTabsCount = (
  measuredCount: number,
  tabCount: number,
  allowEmpty: boolean,
): number => Math.max(
  allowEmpty ? 0 : 1,
  Math.min(measuredCount, tabCount),
);

export const canShowAllCompactPanelTabs = ({
  containerWidth,
  tabCount,
  tabWidth,
  actionsWidth,
  actionsGap,
}: {
  containerWidth: number;
  tabCount: number;
  tabWidth: number;
  actionsWidth: number;
  actionsGap: number;
}): boolean => (
  tabCount > 0
  && (tabCount * tabWidth) <= (containerWidth - actionsWidth - actionsGap)
);
