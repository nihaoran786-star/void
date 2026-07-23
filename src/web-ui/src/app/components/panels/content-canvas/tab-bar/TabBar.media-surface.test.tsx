import { describe, expect, it } from 'vitest';

import type { CanvasTab } from '../types';
import {
  canShowAllCompactPanelTabs,
  selectDisplayedTabs,
  resolveVisibleTabsCount,
  selectTabStripTabs,
} from './tabBarLayout';

const createTab = (
  id: string,
  type: CanvasTab['content']['type'],
): CanvasTab => ({
  id,
  title: id,
  content: { type, title: id },
  state: 'active',
  isDirty: false,
  createdAt: 1,
  lastAccessedAt: 1,
});

describe('TabBar media surface layout', () => {
  it('allows zero visible tabs when a media-session header owns navigation', () => {
    expect(resolveVisibleTabsCount(0, 1, true)).toBe(0);
  });

  it('keeps one complete tab for ordinary canvas surfaces', () => {
    expect(resolveVisibleTabsCount(0, 1, false)).toBe(1);
  });

  it('does not change the measured count when complete tabs fit', () => {
    expect(resolveVisibleTabsCount(2, 4, true)).toBe(2);
    expect(resolveVisibleTabsCount(2, 4, false)).toBe(2);
  });

  it('keeps five compact presentation tabs visible only when the bounded panel fits them', () => {
    expect(canShowAllCompactPanelTabs({
      containerWidth: 493,
      tabCount: 5,
      tabWidth: 80,
      actionsWidth: 32,
      actionsGap: 8,
    })).toBe(true);
    expect(canShowAllCompactPanelTabs({
      containerWidth: 420,
      tabCount: 5,
      tabWidth: 80,
      actionsWidth: 32,
      actionsGap: 8,
    })).toBe(false);
  });

  it('lets the Minimal media switcher own media surfaces without deleting tabs', () => {
    const tabs = [
      createTab('script', 'markdown-editor'),
      createTab('media', 'workspace-media-gallery'),
      createTab('drama', 'short-drama-center'),
    ];

    expect(selectTabStripTabs(tabs, true).map(tab => tab.id)).toEqual(['script']);
    expect(selectTabStripTabs(tabs, false)).toEqual(tabs);
  });

  it('keeps an active overflow tab visible without mutating tab order', () => {
    const tabs = [
      createTab('browser', 'browser'),
      createTab('script', 'btw-session'),
      createTab('assets', 'btw-session'),
    ];

    expect(selectDisplayedTabs(tabs, 1, 'assets').map(tab => tab.id)).toEqual([
      'assets',
    ]);
    expect(tabs.map(tab => tab.id)).toEqual(['browser', 'script', 'assets']);
  });
});
