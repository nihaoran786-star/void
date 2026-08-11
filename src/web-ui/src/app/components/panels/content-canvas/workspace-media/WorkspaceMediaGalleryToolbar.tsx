import React from 'react';
import { Images, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type {
  WorkspaceMediaSortKey,
  WorkspaceMediaStatusFilter,
} from './WorkspaceMediaTileViewModel';

export type WorkspaceMediaFilter = 'all' | 'image' | 'video' | 'audio';
export type WorkspaceMediaView = 'active' | 'deleted';

const FILTERS: Array<{ id: WorkspaceMediaFilter; labelKey: string }> = [
  { id: 'all', labelKey: 'workspaceMedia.filters.all' },
  { id: 'image', labelKey: 'workspaceMedia.filters.images' },
  { id: 'video', labelKey: 'workspaceMedia.filters.videos' },
  { id: 'audio', labelKey: 'workspaceMedia.filters.audio' },
];

const SORTS: Array<{ id: WorkspaceMediaSortKey; labelKey: string }> = [
  { id: 'recent', labelKey: 'workspaceMedia.sort.recent' },
  { id: 'name', labelKey: 'workspaceMedia.sort.name' },
  { id: 'size', labelKey: 'workspaceMedia.sort.size' },
];

const STATUS_FILTERS: Array<{ id: WorkspaceMediaStatusFilter; labelKey: string }> = [
  { id: 'all', labelKey: 'workspaceMedia.statusFilters.all' },
  { id: 'ready', labelKey: 'workspaceMedia.statusFilters.ready' },
  { id: 'pending', labelKey: 'workspaceMedia.statusFilters.pending' },
  { id: 'failed', labelKey: 'workspaceMedia.statusFilters.failed' },
  { id: 'unpreviewable', labelKey: 'workspaceMedia.statusFilters.unpreviewable' },
];

export interface WorkspaceMediaGalleryToolbarState {
  query: string;
  view: WorkspaceMediaView;
  filter: WorkspaceMediaFilter;
  statusFilter: WorkspaceMediaStatusFilter;
  sort: WorkspaceMediaSortKey;
  counts: Readonly<Record<WorkspaceMediaFilter, number>>;
  statusCounts: Readonly<Record<WorkspaceMediaStatusFilter, number>>;
  deletedCount: number;
  visibleSelectionAvailable: boolean;
  areVisibleItemsSelected: boolean;
}

export interface WorkspaceMediaGalleryToolbarActions {
  onQueryChange(query: string): void;
  onRefresh(): void;
  onViewChange(view: WorkspaceMediaView): void;
  onFilterChange(filter: WorkspaceMediaFilter): void;
  onStatusFilterChange(status: WorkspaceMediaStatusFilter): void;
  onSortChange(sort: WorkspaceMediaSortKey): void;
  onToggleVisibleSelection(): void;
}

export interface WorkspaceMediaGalleryToolbarProps {
  state: WorkspaceMediaGalleryToolbarState;
  actions: WorkspaceMediaGalleryToolbarActions;
}

export const WorkspaceMediaGalleryToolbar: React.FC<
  WorkspaceMediaGalleryToolbarProps
> = ({ state, actions }) => {
  const { t } = useTranslation('components');
  const [isRefinementsOpen, setIsRefinementsOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const toggleRef = React.useRef<HTMLButtonElement>(null);
  const refinementsId = React.useId();
  const appliedRefinementCount = (
    (state.filter === 'all' ? 0 : 1)
    + (state.view === 'active' && state.statusFilter !== 'all' ? 1 : 0)
    + (state.sort === 'recent' ? 0 : 1)
  );

  React.useEffect(() => {
    if (!isRefinementsOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node
        && !rootRef.current?.contains(event.target)
      ) {
        setIsRefinementsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      setIsRefinementsOpen(false);
      toggleRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isRefinementsOpen]);

  return (
    <div ref={rootRef} className="workspace-media-gallery__toolbar-main">
      <div
        className={`workspace-media-gallery__search-row ${state.query ? 'has-query' : ''}`}
      >
        <label
          className={`workspace-media-gallery__search ${state.query ? 'has-query' : ''}`}
        >
          <Search size={14} aria-hidden="true" />
          <input
            value={state.query}
            onChange={(event) => actions.onQueryChange(event.target.value)}
            placeholder={t('workspaceMedia.searchPlaceholder')}
            aria-label={t('workspaceMedia.searchPlaceholder')}
          />
          {state.query && (
            <button
              type="button"
              aria-label={t('workspaceMedia.actions.clearSearch')}
              onClick={() => actions.onQueryChange('')}
            >
              <X size={13} />
            </button>
          )}
        </label>
      </div>

      <div className="workspace-media-gallery__controls-row">
        <div
          className="workspace-media-gallery__views"
          aria-label={t('workspaceMedia.entry')}
        >
          <button
            type="button"
            className={state.view === 'active' ? 'is-active' : ''}
            aria-pressed={state.view === 'active'}
            aria-label={t('workspaceMedia.views.active')}
            title={t('workspaceMedia.views.active')}
            onClick={() => actions.onViewChange('active')}
          >
            <Images
              className="workspace-media-gallery__control-icon"
              size={15}
              aria-hidden="true"
            />
            <span className="workspace-media-gallery__control-label">
              {t('workspaceMedia.views.active')}
            </span>
          </button>
          <button
            type="button"
            className={state.view === 'deleted' ? 'is-active' : ''}
            aria-pressed={state.view === 'deleted'}
            aria-label={t('workspaceMedia.views.deleted')}
            title={t('workspaceMedia.views.deleted')}
            onClick={() => actions.onViewChange('deleted')}
          >
            <Trash2
              className="workspace-media-gallery__control-icon"
              size={15}
              aria-hidden="true"
            />
            <span className="workspace-media-gallery__control-label">
              {t('workspaceMedia.views.deleted')}
            </span>
            {state.deletedCount > 0 && <small>{state.deletedCount}</small>}
          </button>
        </div>

        <div className="workspace-media-gallery__refinements">
          <button
            ref={toggleRef}
            type="button"
            className="workspace-media-gallery__refinement-toggle"
            aria-expanded={isRefinementsOpen}
            aria-controls={refinementsId}
            aria-label={t('workspaceMedia.filters.ariaLabel')}
            title={t('workspaceMedia.filters.ariaLabel')}
            onClick={() => setIsRefinementsOpen(current => !current)}
          >
            <SlidersHorizontal
              className="workspace-media-gallery__control-icon"
              size={15}
              aria-hidden="true"
            />
            <span className="workspace-media-gallery__control-label">
              {t('workspaceMedia.filters.ariaLabel')}
            </span>
            {appliedRefinementCount > 0 && (
              <small aria-label={`${appliedRefinementCount}`}>
                {appliedRefinementCount}
              </small>
            )}
            <i aria-hidden="true" />
          </button>

          <div
            id={refinementsId}
            className="workspace-media-gallery__refinement-panel"
            role="group"
            aria-label={t('workspaceMedia.filters.ariaLabel')}
            hidden={!isRefinementsOpen}
          >
            <div
              className="workspace-media-gallery__filters"
              role="tablist"
              aria-label={t('workspaceMedia.filters.ariaLabel')}
            >
              {FILTERS.map(item => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={state.filter === item.id}
                  className={state.filter === item.id ? 'is-active' : ''}
                  onClick={() => actions.onFilterChange(item.id)}
                >
                  <span>{t(item.labelKey)}</span>
                  <small>{state.counts[item.id]}</small>
                </button>
              ))}
            </div>

            {state.view === 'active' && (
              <label className="workspace-media-gallery__status-filter">
                <span>{t('workspaceMedia.statusFilters.label')}</span>
                <select
                  value={state.statusFilter}
                  onChange={event => actions.onStatusFilterChange(
                    event.target.value as WorkspaceMediaStatusFilter,
                  )}
                  aria-label={t('workspaceMedia.statusFilters.label')}
                >
                  {STATUS_FILTERS.map(item => (
                    <option key={item.id} value={item.id}>
                      {t(item.labelKey)} ({state.statusCounts[item.id]})
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div
              className="workspace-media-gallery__sort"
              aria-label={t('workspaceMedia.sort.label')}
            >
              <span>{t('workspaceMedia.sort.label')}</span>
              {SORTS.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={state.sort === item.id ? 'is-active' : ''}
                  aria-pressed={state.sort === item.id}
                  onClick={() => actions.onSortChange(item.id)}
                >
                  {t(item.labelKey)}
                </button>
              ))}
            </div>

            <div className="workspace-media-gallery__refinement-utilities">
              <button
                type="button"
                className="workspace-media-gallery__refresh workspace-media-gallery__refresh--text"
                onClick={actions.onRefresh}
                aria-label={t('workspaceMedia.refresh')}
                title={t('workspaceMedia.refresh')}
              >
                {t('workspaceMedia.refresh')}
              </button>
              {state.visibleSelectionAvailable && (
                <button
                  type="button"
                  className="workspace-media-gallery__select-visible"
                  aria-pressed={state.areVisibleItemsSelected}
                  onClick={actions.onToggleVisibleSelection}
                >
                  {t(state.areVisibleItemsSelected
                    ? 'workspaceMedia.actions.clearVisibleSelection'
                    : 'workspaceMedia.actions.selectVisible')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

WorkspaceMediaGalleryToolbar.displayName = 'WorkspaceMediaGalleryToolbar';
