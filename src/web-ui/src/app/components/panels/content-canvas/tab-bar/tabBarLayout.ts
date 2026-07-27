import type { CanvasTab } from '../types';

export const selectDisplayedTabs = (
  tabs: CanvasTab[],
  visibleCount: number,
  activeTabId: string | null,
): CanvasTab[] => {
  const displayed = tabs.slice(0, visibleCount);
  if (visibleCount <= 0 || !activeTabId || displayed.some(tab => tab.id === activeTabId)) {
    return displayed;
  }

  const activeTab = tabs.find(tab => tab.id === activeTabId);
  if (!activeTab) {
    return displayed;
  }
  return [...displayed.slice(0, -1), activeTab];
};

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
