import React from 'react';
import { AlertTriangle, FileAudio, Image as ImageIcon, Play, RefreshCw, Search, Video, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { openMediaPreviewPanel } from '@/shared/services/preview/MediaPreviewService';
import {
  workspaceMediaLibraryService,
  type WorkspaceMediaKind,
  type WorkspaceMediaLibraryService,
  type WorkspaceMediaLibraryState,
} from '@/shared/services/workspace-media';
import {
  filterWorkspaceMediaTiles,
  mapWorkspaceMediaTiles,
  sortWorkspaceMediaTiles,
  type WorkspaceMediaSortKey,
  type WorkspaceMediaTileRenderStatus,
  type WorkspaceMediaTileViewModel,
} from './WorkspaceMediaTileViewModel';
import './WorkspaceMediaGallery.scss';

type WorkspaceMediaFilter = 'all' | WorkspaceMediaKind;

export interface WorkspaceMediaGalleryProps {
  workspacePath?: string;
  service?: WorkspaceMediaLibraryService;
}

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

function formatBytes(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function mediaIcon(kind: WorkspaceMediaKind): React.ReactElement {
  if (kind === 'video') return <Video size={18} />;
  if (kind === 'audio') return <FileAudio size={18} />;
  return <ImageIcon size={18} />;
}

function formatRelativeTime(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '';
  const diff = Math.max(0, Date.now() - value);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function openWorkspaceMediaPreview(item: WorkspaceMediaTileViewModel): void {
  if (!item.previewUrl) {
    return;
  }

  openMediaPreviewPanel({
    kind: item.kind,
    url: item.previewUrl,
    localPath: item.filePath,
    title: item.displayName,
  });
}

function waveformBars(seed: string, count = 34): number[] {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return Array.from({ length: count }, () => {
    hash = (hash * 1103515245 + 12345) >>> 0;
    return 26 + (hash % 56);
  });
}

interface MediaTileProps {
  tile: WorkspaceMediaTileViewModel;
  renderStatus: WorkspaceMediaTileRenderStatus;
  aspectRatio: string;
  onOpen: (tile: WorkspaceMediaTileViewModel) => void;
  onImageError: (tileId: string) => void;
  onImageLoad: (tileId: string, width: number, height: number) => void;
}

const MediaTile: React.FC<MediaTileProps> = ({ tile, renderStatus, aspectRatio, onOpen, onImageError, onImageLoad }) => {
  const canOpen = Boolean(tile.previewUrl);
  const isThumbnailFailed = renderStatus === 'failed';
  const isUnavailable = renderStatus === 'unpreviewable' || !canOpen;
  const bars = tile.kind === 'audio' ? waveformBars(tile.id) : [];

  return (
    <button
      type="button"
      className={`workspace-media-card workspace-media-card--${tile.kind} ${(isUnavailable || isThumbnailFailed) ? 'is-failed' : ''}`}
      data-testid={`workspace-media-card-${tile.id}`}
      style={{ aspectRatio }}
      onClick={() => {
        if (canOpen) {
          onOpen(tile);
        }
      }}
      aria-label={isUnavailable ? `${tile.displayName} preview unavailable` : `Open ${tile.displayName}`}
    >
      <span className="workspace-media-card__stage">
        {tile.kind === 'image' && tile.thumbnailUrl && renderStatus === 'ready' ? (
          <img
            src={tile.thumbnailUrl}
            alt=""
            loading="lazy"
            onLoad={(event) => {
              const image = event.currentTarget;
              onImageLoad(tile.id, image.naturalWidth, image.naturalHeight);
            }}
            onError={() => onImageError(tile.id)}
          />
        ) : tile.kind === 'audio' && renderStatus === 'ready' ? (
          <span className="workspace-media-card__waveform" aria-hidden>
            {bars.map((height, index) => (
              <i key={index} style={{ height: `${height}%` }} />
            ))}
          </span>
        ) : (
          <span className="workspace-media-card__fallback">
            {isUnavailable ? <AlertTriangle size={19} /> : mediaIcon(tile.kind)}
          </span>
        )}

        {tile.kind === 'video' && renderStatus === 'ready' && (
          <span className="workspace-media-card__play" aria-hidden>
            <Play size={16} fill="currentColor" />
          </span>
        )}

        <span className={`workspace-media-card__type workspace-media-card__type--${tile.kind}`}>
          {tile.typeLabel}
        </span>
      </span>

      <span className="workspace-media-card__overlay">
        <strong>{tile.displayName}</strong>
        <small>{tile.pathLabel}</small>
        <span className="workspace-media-card__meta">
          <span>{tile.source}</span>
          <span>{tile.kind}</span>
          {formatBytes(tile.sizeBytes) && <span>{formatBytes(tile.sizeBytes)}</span>}
          {formatRelativeTime(tile.modifiedAt) && <span>{formatRelativeTime(tile.modifiedAt)}</span>}
        </span>
        {(isUnavailable || isThumbnailFailed) && (
          <span className="workspace-media-card__unavailable">Preview unavailable</span>
        )}
      </span>
    </button>
  );
};

export const WorkspaceMediaGallery: React.FC<WorkspaceMediaGalleryProps> = ({
  workspacePath,
  service = workspaceMediaLibraryService,
}) => {
  const { t } = useTranslation('components');
  const [state, setState] = React.useState<WorkspaceMediaLibraryState>({ status: 'idle' });
  const [filter, setFilter] = React.useState<WorkspaceMediaFilter>('all');
  const [sort, setSort] = React.useState<WorkspaceMediaSortKey>('recent');
  const [query, setQuery] = React.useState('');
  const [failedTileIds, setFailedTileIds] = React.useState<Set<string>>(() => new Set());
  const [loadedImageAspectRatios, setLoadedImageAspectRatios] = React.useState<Record<string, string>>({});
  const isMountedRef = React.useRef(false);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const scan = React.useCallback(async () => {
    setState({ status: 'scanning' });
    const nextState = await service.scanLibrary(workspacePath);
    if (isMountedRef.current) {
      setState(nextState);
    }
  }, [service, workspacePath]);

  React.useEffect(() => {
    void scan();
  }, [scan]);

  const tileModels = React.useMemo(
    () => state.status === 'ready' ? mapWorkspaceMediaTiles(state.items) : [],
    [state]
  );

  const filteredTiles = React.useMemo(
    () => sortWorkspaceMediaTiles(filterWorkspaceMediaTiles(tileModels, { filter, query }), sort),
    [filter, query, sort, tileModels]
  );

  const primaryTiles = filteredTiles.filter(tile => tile.isPrimaryWallRenderable);
  const unpreviewableTiles = filteredTiles.filter(tile => !tile.isPrimaryWallRenderable);

  const counts = React.useMemo(() => {
    const nextCounts: Record<WorkspaceMediaFilter, number> = {
      all: tileModels.length,
      image: 0,
      video: 0,
      audio: 0,
    };
    for (const tile of tileModels) {
      nextCounts[tile.kind] += 1;
    }
    return nextCounts;
  }, [tileModels]);

  const resetFilters = () => {
    setQuery('');
    setFilter('all');
  };

  const markTileFailed = React.useCallback((tileId: string) => {
    setFailedTileIds((current) => {
      const next = new Set(current);
      next.add(tileId);
      return next;
    });
  }, []);

  const updateLoadedImageAspectRatio = React.useCallback((tileId: string, width: number, height: number) => {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return;
    }
    const aspectRatio = `${Math.round(width)} / ${Math.round(height)}`;
    setLoadedImageAspectRatios((current) => (
      current[tileId] === aspectRatio ? current : { ...current, [tileId]: aspectRatio }
    ));
  }, []);

  return (
    <section className="workspace-media-gallery" aria-label={t('workspaceMedia.ariaLabel')}>
      <header className="workspace-media-gallery__header">
        <div className="workspace-media-gallery__title">
          <h2>{t('workspaceMedia.title')}</h2>
          <p>{t('workspaceMedia.description')}</p>
        </div>
        <button
          type="button"
          className="workspace-media-gallery__refresh"
          onClick={() => void scan()}
        >
          <RefreshCw size={15} />
          <span>{t('workspaceMedia.refresh')}</span>
        </button>
      </header>

      <div className="workspace-media-gallery__toolbar">
        <label className="workspace-media-gallery__search">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('workspaceMedia.searchPlaceholder')}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
            >
              <X size={13} />
            </button>
          )}
        </label>

        <div className="workspace-media-gallery__filters" role="tablist" aria-label={t('workspaceMedia.filters.ariaLabel')}>
          {FILTERS.map(item => (
            <button
              key={item.id}
              type="button"
              className={filter === item.id ? 'is-active' : ''}
              onClick={() => setFilter(item.id)}
            >
              <span>{t(item.labelKey)}</span>
              <small>{counts[item.id]}</small>
            </button>
          ))}
        </div>

        <div className="workspace-media-gallery__sort" aria-label={t('workspaceMedia.sort.label')}>
          <span>{t('workspaceMedia.sort.label')}</span>
          {SORTS.map(item => (
            <button
              key={item.id}
              type="button"
              className={sort === item.id ? 'is-active' : ''}
              onClick={() => setSort(item.id)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {state.status === 'scanning' || state.status === 'idle' ? (
        <div className="workspace-media-gallery__skeleton" aria-label={t('workspaceMedia.states.scanning')} aria-busy="true">
          {['9 / 16', '16 / 9', '1 / 1', '4 / 5', '5 / 2', '16 / 9', '9 / 16', '1 / 1'].map((ratio, index) => (
            <span key={`${ratio}-${index}`} style={{ aspectRatio: ratio }} />
          ))}
        </div>
      ) : state.status === 'empty' ? (
        <div className="workspace-media-gallery__state">{t('workspaceMedia.states.empty')}</div>
      ) : state.status === 'unsupported' ? (
        <div className="workspace-media-gallery__state">{state.reason.message}</div>
      ) : state.status === 'error' ? (
        <div className="workspace-media-gallery__state is-error">{state.error.message}</div>
      ) : (
        <>
          {state.truncated && (
            <div className="workspace-media-gallery__notice">{t('workspaceMedia.states.truncated')}</div>
          )}
          {filteredTiles.length === 0 ? (
            <div className="workspace-media-gallery__state">
              <p>{t('workspaceMedia.states.noFilterMatches')}</p>
              <button type="button" onClick={resetFilters}>{t('workspaceMedia.clearFilters')}</button>
            </div>
          ) : (
            <>
              {primaryTiles.length > 0 && (
                <div className="workspace-media-gallery__masonry">
                  {primaryTiles.map(tile => (
                    <span key={tile.id} className="workspace-media-gallery__masonry-item">
                      <MediaTile
                        tile={tile}
                        renderStatus={failedTileIds.has(tile.id) ? 'failed' : tile.renderStatus}
                        aspectRatio={loadedImageAspectRatios[tile.id] || tile.aspectRatio}
                        onOpen={openWorkspaceMediaPreview}
                        onImageError={markTileFailed}
                        onImageLoad={updateLoadedImageAspectRatio}
                      />
                    </span>
                  ))}
                </div>
              )}

              {unpreviewableTiles.length > 0 && (
                <section className="workspace-media-gallery__unpreviewable" data-testid="workspace-media-unpreviewable">
                  <h3>{t('workspaceMedia.states.unpreviewable')}</h3>
                  {unpreviewableTiles.map(tile => (
                    <MediaTile
                      key={tile.id}
                      tile={tile}
                      renderStatus="unpreviewable"
                      aspectRatio={loadedImageAspectRatios[tile.id] || tile.aspectRatio}
                      onOpen={openWorkspaceMediaPreview}
                      onImageError={markTileFailed}
                      onImageLoad={updateLoadedImageAspectRatio}
                    />
                  ))}
                </section>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
};

export default WorkspaceMediaGallery;
