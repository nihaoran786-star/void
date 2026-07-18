// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'workspaceMedia.refresh': 'Refresh',
      'workspaceMedia.views.active': 'Media',
      'workspaceMedia.views.deleted': 'Recently Deleted',
      'workspaceMedia.actions.selectVisible': 'Select all',
      'workspaceMedia.actions.clearVisibleSelection': 'Clear selected',
      'workspaceMedia.filters.ariaLabel': 'Media filters',
      'workspaceMedia.filters.all': 'All',
      'workspaceMedia.filters.images': 'Images',
      'workspaceMedia.filters.videos': 'Videos',
      'workspaceMedia.filters.audio': 'Audio',
      'workspaceMedia.statusFilters.label': 'Status',
      'workspaceMedia.statusFilters.all': 'All',
      'workspaceMedia.statusFilters.ready': 'Ready',
      'workspaceMedia.statusFilters.pending': 'Generating',
      'workspaceMedia.statusFilters.failed': 'Failed',
      'workspaceMedia.statusFilters.unpreviewable': 'Unavailable',
      'workspaceMedia.sort.label': 'Sort',
      'workspaceMedia.sort.recent': 'Recent',
      'workspaceMedia.sort.name': 'Name',
      'workspaceMedia.sort.size': 'Size',
      'workspaceMedia.searchPlaceholder': 'Search',
    })[key] || key,
  }),
}));

import {
  WorkspaceMediaGalleryToolbar,
  type WorkspaceMediaGalleryToolbarActions,
  type WorkspaceMediaGalleryToolbarState,
} from './WorkspaceMediaGalleryToolbar';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const baseState: WorkspaceMediaGalleryToolbarState = {
  query: '',
  view: 'active',
  filter: 'all',
  statusFilter: 'all',
  sort: 'recent',
  counts: {
    all: 12,
    image: 8,
    video: 3,
    audio: 1,
  },
  statusCounts: {
    all: 12,
    ready: 9,
    pending: 1,
    failed: 1,
    unpreviewable: 1,
  },
  deletedCount: 2,
  visibleSelectionAvailable: true,
  areVisibleItemsSelected: false,
};

const createActions = (): WorkspaceMediaGalleryToolbarActions => ({
  onQueryChange: vi.fn(),
  onRefresh: vi.fn(),
  onViewChange: vi.fn(),
  onFilterChange: vi.fn(),
  onStatusFilterChange: vi.fn(),
  onSortChange: vi.fn(),
  onToggleVisibleSelection: vi.fn(),
});

describe('WorkspaceMediaGalleryToolbar', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderToolbar = (
    state = baseState,
    actions = createActions(),
  ) => {
    act(() => {
      root.render(
        <WorkspaceMediaGalleryToolbar state={state} actions={actions} />,
      );
    });
    return actions;
  };

  it('keeps only search, views, and one refinement entry persistently visible', () => {
    renderToolbar();

    const toggle = container.querySelector(
      '.workspace-media-gallery__refinement-toggle',
    ) as HTMLButtonElement;
    const panel = container.querySelector(
      '.workspace-media-gallery__refinement-panel',
    ) as HTMLDivElement;

    expect(container.querySelector('input[placeholder="Search"]')).toBeTruthy();
    expect(container.textContent).toContain('Media');
    expect(container.textContent).toContain('Recently Deleted');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
    expect(panel.querySelectorAll('button')).toHaveLength(9);
  });

  it('keeps filter, sort, refresh, and selection behavior available after one disclosure', () => {
    const actions = renderToolbar();
    const toggle = container.querySelector(
      '.workspace-media-gallery__refinement-toggle',
    ) as HTMLButtonElement;

    act(() => toggle.click());

    const panel = container.querySelector(
      '.workspace-media-gallery__refinement-panel',
    ) as HTMLDivElement;
    expect(panel.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    const buttons = Array.from(panel.querySelectorAll('button'));
    act(() => {
      buttons.find(button => button.textContent?.includes('Images'))?.click();
      buttons.find(button => button.textContent === 'Name')?.click();
      buttons.find(button => button.textContent === 'Refresh')?.click();
      buttons.find(button => button.textContent === 'Select all')?.click();
    });

    expect(actions.onFilterChange).toHaveBeenCalledWith('image');
    expect(actions.onSortChange).toHaveBeenCalledWith('name');
    expect(actions.onRefresh).toHaveBeenCalledTimes(1);
    expect(actions.onToggleVisibleSelection).toHaveBeenCalledTimes(1);
  });

  it('closes refinements with Escape and restores focus to the entry button', () => {
    renderToolbar();
    const toggle = container.querySelector(
      '.workspace-media-gallery__refinement-toggle',
    ) as HTMLButtonElement;
    act(() => toggle.click());

    const imageFilter = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Images')) as HTMLButtonElement;
    imageFilter.focus();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }));
    });

    expect(container.querySelector(
      '.workspace-media-gallery__refinement-panel',
    )?.hasAttribute('hidden')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });

  it('summarizes non-default type, status, and sort choices as one quiet count', () => {
    renderToolbar({
      ...baseState,
      filter: 'image',
      statusFilter: 'ready',
      sort: 'name',
    });

    const toggle = container.querySelector(
      '.workspace-media-gallery__refinement-toggle',
    ) as HTMLButtonElement;
    expect(toggle.textContent).toContain('Media filters');
    expect(toggle.textContent).toContain('3');
  });
});
