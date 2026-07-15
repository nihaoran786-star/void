import type { CanvasTab } from '../types';

export const MAX_RETAINED_NON_BROWSER_TABS = 5;

export interface BrowserTabRetention {
  tabsToRender: CanvasTab[];
  retainedNonBrowserTabIds: ReadonlySet<string>;
}

const isBrowserTab = (tab: CanvasTab): boolean => tab.content.type === 'browser';

/**
 * Selects which tab panels stay mounted.
 *
 * Browser panels are retained for as long as their tab remains visible so a
 * generic cache eviction cannot destroy the native WebView and its history.
 * Other panels keep the existing bounded, recently-visited cache behavior.
 */
export const selectRetainedTabs = (
  tabs: readonly CanvasTab[],
  activeTabId: string | null,
  previousNonBrowserTabIds: ReadonlySet<string>,
): BrowserTabRetention => {
  const visibleTabs = tabs.filter(tab => !tab.isHidden);
  const visibleNonBrowserTabs = visibleTabs.filter(tab => !isBrowserTab(tab));
  const activeNonBrowserTab = visibleNonBrowserTabs.find(tab => tab.id === activeTabId);
  const recentTabLimit = activeNonBrowserTab
    ? MAX_RETAINED_NON_BROWSER_TABS - 1
    : MAX_RETAINED_NON_BROWSER_TABS;

  const recentTabIds = visibleNonBrowserTabs
    .filter(tab => tab.id !== activeNonBrowserTab?.id && previousNonBrowserTabIds.has(tab.id))
    .sort((left, right) => right.lastAccessedAt - left.lastAccessedAt)
    .slice(0, recentTabLimit)
    .map(tab => tab.id);
  const retainedNonBrowserTabIds = new Set<string>();

  if (activeNonBrowserTab) {
    retainedNonBrowserTabIds.add(activeNonBrowserTab.id);
  }
  recentTabIds.forEach(tabId => retainedNonBrowserTabIds.add(tabId));

  return {
    tabsToRender: visibleTabs.filter(
      tab => isBrowserTab(tab) || retainedNonBrowserTabIds.has(tab.id),
    ),
    retainedNonBrowserTabIds,
  };
};
