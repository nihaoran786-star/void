import { describe, expect, it } from 'vitest';
import type { CanvasTab, PanelContentType } from '../types';
import {
  MAX_RETAINED_NON_BROWSER_TABS,
  selectRetainedTabs,
} from './browserTabRetention';

const createTab = (
  id: string,
  type: PanelContentType,
  lastAccessedAt: number,
  isHidden = false,
): CanvasTab => ({
  id,
  title: id,
  content: { type, title: id, data: { testTabId: id } },
  state: 'active',
  isDirty: false,
  isHidden,
  createdAt: lastAccessedAt,
  lastAccessedAt,
});

describe('selectRetainedTabs', () => {
  it('retains every open browser outside the bounded five-item non-browser cache', () => {
    const tabs = [
      createTab('ordinary-1', 'text-viewer', 10),
      createTab('browser-oldest', 'browser', 1),
      createTab('ordinary-2', 'text-viewer', 20),
      createTab('ordinary-3', 'text-viewer', 30),
      createTab('ordinary-4', 'text-viewer', 40),
      createTab('ordinary-5', 'text-viewer', 50),
      createTab('ordinary-6', 'text-viewer', 60),
      createTab('browser-second', 'browser', 2),
      createTab('browser-hidden', 'browser', 100, true),
    ];
    const previousIds = new Set([
      'ordinary-1',
      'ordinary-2',
      'ordinary-3',
      'ordinary-4',
      'ordinary-5',
      'closed-ordinary',
    ]);

    const result = selectRetainedTabs(tabs, 'ordinary-6', previousIds);
    const renderedIds = result.tabsToRender.map(tab => tab.id);

    expect(renderedIds).toEqual([
      'browser-oldest',
      'ordinary-2',
      'ordinary-3',
      'ordinary-4',
      'ordinary-5',
      'ordinary-6',
      'browser-second',
    ]);
    expect(result.retainedNonBrowserTabIds.size).toBe(MAX_RETAINED_NON_BROWSER_TABS);
    expect(result.retainedNonBrowserTabIds).not.toContain('browser-oldest');
    expect(result.retainedNonBrowserTabIds).not.toContain('closed-ordinary');
    expect(renderedIds).not.toContain('browser-hidden');
  });

  it('does not let an active browser consume a non-browser cache slot', () => {
    const tabs = [
      createTab('ordinary-1', 'text-viewer', 10),
      createTab('ordinary-2', 'text-viewer', 20),
      createTab('ordinary-3', 'text-viewer', 30),
      createTab('ordinary-4', 'text-viewer', 40),
      createTab('ordinary-5', 'text-viewer', 50),
      createTab('ordinary-never-visited', 'text-viewer', 100),
      createTab('browser-active', 'browser', 1),
      createTab('browser-background', 'browser', 2),
    ];
    const previousIds = new Set([
      'ordinary-1',
      'ordinary-2',
      'ordinary-3',
      'ordinary-4',
      'ordinary-5',
    ]);

    const result = selectRetainedTabs(tabs, 'browser-active', previousIds);

    expect([...result.retainedNonBrowserTabIds]).toEqual([
      'ordinary-5',
      'ordinary-4',
      'ordinary-3',
      'ordinary-2',
      'ordinary-1',
    ]);
    expect(result.tabsToRender.map(tab => tab.id)).toEqual([
      'ordinary-1',
      'ordinary-2',
      'ordinary-3',
      'ordinary-4',
      'ordinary-5',
      'browser-active',
      'browser-background',
    ]);
  });

  it('removes hidden or closed browsers while preserving reordered open browsers', () => {
    const firstBrowser = createTab('browser-first', 'browser', 1);
    const secondBrowser = createTab('browser-second', 'browser', 2);
    const hiddenBrowser = createTab('browser-hidden', 'browser', 3, true);

    const result = selectRetainedTabs(
      [secondBrowser, hiddenBrowser, firstBrowser],
      null,
      new Set(['closed-browser']),
    );

    expect(result.tabsToRender).toEqual([secondBrowser, firstBrowser]);
    expect(result.retainedNonBrowserTabIds.size).toBe(0);
  });
});
