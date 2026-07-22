import { describe, expect, it } from 'vitest';

import type { CanvasTab } from '../types';
import {
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

  it('lets the Minimal media switcher own media surfaces without deleting tabs', () => {
    const tabs = [
      createTab('script', 'markdown-editor'),
      createTab('media', 'workspace-media-gallery'),
      createTab('drama', 'short-drama-center'),
    ];

    expect(selectTabStripTabs(tabs, true).map(tab => tab.id)).toEqual(['script']);
    expect(selectTabStripTabs(tabs, false)).toEqual(tabs);
  });
});
