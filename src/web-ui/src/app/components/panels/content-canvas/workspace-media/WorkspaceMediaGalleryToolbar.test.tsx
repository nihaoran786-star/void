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
      'workspaceMedia.entry': 'Media library',
      'workspaceMedia.actions.selectVisible': 'Select all',
      'workspaceMedia.actions.clearVisibleSelection': 'Clear selected',
      'workspaceMedia.actions.clearSearch': 'Clear search',
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

  it('keeps the persistent command bar icon-first with localized accessible names', () => {
    renderToolbar();

    const toggle = container.querySelector(
      '.workspace-media-gallery__refinement-toggle',
    ) as HTMLButtonElement;
    const panel = container.querySelector(
      '.workspace-media-gallery__refinement-panel',
    ) as HTMLDivElement;

    const searchInput = container.querySelector(
      'input[placeholder="Search"]',
    ) as HTMLInputElement;
    expect(searchInput).toBeTruthy();
    expect(searchInput.getAttribute('aria-label')).toBe('Search');
    expect(container.querySelector(
      '.workspace-media-gallery__search-row',
    )?.classList.contains('has-query')).toBe(false);
    expect(container.querySelector('.workspace-media-gallery__views')
      ?.getAttribute('aria-label')).toBe('Media library');
    expect(container.querySelector('button[aria-label="Media"]')).toBeTruthy();
    expect(container.querySelector('button[aria-label="Recently Deleted"]')).toBeTruthy();
    expect(toggle.getAttribute('aria-label')).toBe('Media filters');
    expect(container.querySelectorAll(
      '.workspace-media-gallery__control-icon',
    )).toHaveLength(3);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
    expect(panel.querySelectorAll('button')).toHaveLength(9);
  });

  it('keeps a non-empty query expanded and clears it through a labelled action', () => {
    const actions = renderToolbar({
      ...baseState,
      query: 'character',
    });
    const searchRow = container.querySelector(
      '.workspace-media-gallery__search-row',
    ) as HTMLDivElement;
    const clearButton = container.querySelector(
      'button[aria-label="Clear search"]',
    ) as HTMLButtonElement;

    expect(searchRow.classList.contains('has-query')).toBe(true);
    expect(clearButton).toBeTruthy();

    act(() => clearButton.click());

    expect(actions.onQueryChange).toHaveBeenCalledWith('');
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
    expect(toggle.getAttribute('aria-label')).toBe('Media filters');
    expect(toggle.textContent).toContain('3');
  });
});
