import React from 'react';
import { AlertTriangle, FileAudio, Image as ImageIcon, Play, RotateCcw, Trash2, Video, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { openMediaPreviewPanel } from '@/shared/services/preview/MediaPreviewService';
import { dispatchMediaReference } from '@/shared/services/media-reference';
import {
  resolveWorkspaceMediaImagePreviewUrl,
  resolveWorkspaceMediaPreviewUrl,
  workspaceMediaLibraryService,
  type WorkspaceMediaImagePreviewResolver,
  type WorkspaceMediaKind,
  type WorkspaceMediaLibraryService,
  type WorkspaceMediaLibraryState,
  type WorkspaceMediaPreviewResolver,
  type WorkspaceMediaSelection,
  type WorkspaceMediaTrashRecord,
  type WorkspaceMediaTrashStateResult,
} from '@/shared/services/workspace-media';
import {
  getWorkspaceMediaPathMismatch,
  mergeWorkspaceMediaPendingGenerationsForWorkspace,
  useWorkspaceMediaRefreshStore,
} from '@/shared/services/workspace-media/WorkspaceMediaEvents';
import {
  filterWorkspaceMediaTiles,
  mapWorkspaceMediaTiles,
  sortWorkspaceMediaTiles,
  type WorkspaceMediaSortKey,
  type WorkspaceMediaStatusFilter,
  type WorkspaceMediaTileRenderStatus,
  type WorkspaceMediaTileViewModel,
} from './WorkspaceMediaTileViewModel';
import {
  useWorkspaceMediaPreviewQueue,
  type WorkspaceMediaPreviewCandidate,
  type WorkspaceMediaPreviewState,
} from './useWorkspaceMediaPreviewQueue';
import {
  WorkspaceMediaVirtualMasonry,
} from './WorkspaceMediaVirtualMasonry';
import {
  shouldVirtualizeWorkspaceMediaList,
} from './WorkspaceMediaVirtualMasonryModel';
import {
  WorkspaceMediaGalleryToolbar,
  type WorkspaceMediaFilter,
  type WorkspaceMediaView,
} from './WorkspaceMediaGalleryToolbar';
import './WorkspaceMediaGallery.scss';

export interface WorkspaceMediaGalleryProps {
  workspacePath?: string;
  isActive?: boolean;
  service?: WorkspaceMediaLibraryService;
  imagePreviewResolver?: WorkspaceMediaImagePreviewResolver;
  mediaPreviewResolver?: WorkspaceMediaPreviewResolver;
}

const MAX_VIDEO_THUMBNAIL_BYTES = 25 * 1024 * 1024;
const WORKSPACE_MEDIA_ACTIVE_REFRESH_INTERVAL_MS = 5000;
const WORKSPACE_MEDIA_IDLE_REFRESH_INTERVAL_MS = 30_000;
const WORKSPACE_MEDIA_EVENT_REFRESH_RETRY_DELAYS_MS = [250, 1000, 2500];

function formatBytes(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function numericAspectRatio(value: string | undefined): number {
  if (!value) {
    return 1;
  }
  const [width, height] = value.split('/').map(part => Number(part.trim()));
  if (
    !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
  ) {
    return 1;
  }
  return width / height;
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

function openWorkspaceMediaPreview(item: WorkspaceMediaTileViewModel, previewUrl?: string): void {
  if (!previewUrl) {
    return;
  }

  openMediaPreviewPanel({
    kind: item.kind,
    url: previewUrl,
    localPath: item.filePath,
    title: item.displayName,
    modifiedAt: item.modifiedAt,
  });
}

function mediaPreviewCacheKey(item: WorkspaceMediaTileViewModel): string {
  return `${item.id}:${item.filePath}:${item.modifiedAt || 0}`;
}

function trashPreviewCacheKey(item: WorkspaceMediaTrashRecord): string {
  return `trash:${item.trashPath}:${item.deletedAt || 0}`;
}

function extensionFromFileName(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.slice(index + 1).toLowerCase() : '';
}

function shouldResolveTilePreview(item: WorkspaceMediaTileViewModel): boolean {
  if (item.renderStatus === 'pending' || !item.filePath) {
    return false;
  }
  if (item.kind === 'image') {
    return true;
  }
  if (item.kind === 'video') {
    return typeof item.sizeBytes !== 'number' || item.sizeBytes <= MAX_VIDEO_THUMBNAIL_BYTES;
  }
  return false;
}

function shouldResolveTrashPreview(item: WorkspaceMediaTrashRecord): boolean {
  return item.kind === 'image' || item.kind === 'video';
}

function getWorkspaceMediaTileKey(item: WorkspaceMediaTileViewModel): React.Key {
  return item.stableSlotId;
}

function getWorkspaceMediaTrashKey(item: WorkspaceMediaTrashRecord): React.Key {
  return item.id;
}

function estimateWorkspaceMediaTrashAspectRatio(
  item: WorkspaceMediaTrashRecord,
): number {
  return item.kind === 'video' ? 16 / 9 : 1;
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
  previewUrl?: string;
  thumbnailUrl?: string;
  previewStatus?: WorkspaceMediaPreviewState['status'];
  previewKey?: string;
  onOpen: (tile: WorkspaceMediaTileViewModel, previewUrl?: string) => void;
  onPreviewError: (tile: WorkspaceMediaTileViewModel) => void;
  onPreviewLoad: (
    tile: WorkspaceMediaTileViewModel,
    width: number,
    height: number,
  ) => void;
  onDelete?: (tile: WorkspaceMediaTileViewModel) => void;
  onReference?: (tile: WorkspaceMediaTileViewModel, previewUrl?: string) => void;
  onSelect?: (tile: WorkspaceMediaTileViewModel) => void;
  isSelected?: boolean;
}

function selectionFromTile(tile: WorkspaceMediaTileViewModel): WorkspaceMediaSelection {
  return {
    id: tile.id,
    stableSlotId: tile.stableSlotId,
    filePath: tile.filePath,
    kind: tile.kind,
    source: tile.source,
  };
}

const MediaTile: React.FC<MediaTileProps> = ({
  tile,
  renderStatus,
  aspectRatio,
  previewUrl,
  thumbnailUrl,
  previewStatus,
  previewKey,
  onOpen,
  onPreviewError,
  onPreviewLoad,
  onDelete,
  onReference,
  onSelect,
  isSelected = false,
}) => {
  const { t } = useTranslation('components');
  const isPending = renderStatus === 'pending';
  const canOpen = Boolean(previewUrl);
  const canRenderPreviewMedia = tile.kind === 'image' || tile.kind === 'video';
  const isPreviewLoading = canRenderPreviewMedia && previewStatus === 'loading';
  const isPreviewFailed = canRenderPreviewMedia && previewStatus === 'failed';
  const isThumbnailFailed = renderStatus === 'failed' || isPreviewFailed;
  const isUnavailable = renderStatus === 'unpreviewable' || (!canOpen && !isPreviewLoading && tile.kind !== 'image') || isPreviewFailed;
  const bars = tile.kind === 'audio' ? waveformBars(tile.id) : [];

  return (
    <span
      className={`workspace-media-card-shell ${isSelected ? 'is-selected' : ''}`}
      data-workspace-media-preview-key={previewKey}
    >
      <button
        type="button"
        className={`workspace-media-card workspace-media-card--${tile.kind} ${isPending ? 'is-pending' : ''} ${(isUnavailable || isThumbnailFailed) ? 'is-failed' : ''}`}
        data-testid={`workspace-media-card-${tile.id}`}
        style={{ aspectRatio }}
        disabled={isPending}
        onClick={() => {
          if (canOpen && !isPending) {
            onOpen(tile, previewUrl);
          }
        }}
        aria-label={isPending
          ? t('workspaceMedia.states.generatingNamed', { name: tile.displayName })
          : isUnavailable
            ? t('workspaceMedia.states.previewUnavailableNamed', { name: tile.displayName })
            : t('workspaceMedia.actions.openNamed', { name: tile.displayName })}
      >
        <span className="workspace-media-card__stage">
        {isPending ? (
          <span className="workspace-media-card__generator" aria-hidden>
            <span className="workspace-media-card__generator-grid" />
            <span className="workspace-media-card__generator-beam" />
            <span className="workspace-media-card__generator-core" />
          </span>
        ) : tile.kind === 'image' && thumbnailUrl && renderStatus === 'ready' ? (
          <img
            src={thumbnailUrl}
            alt=""
            loading="lazy"
            onLoad={(event) => {
              const image = event.currentTarget;
              if (!tile.preserveSlotAspectRatio) {
                onPreviewLoad(tile, image.naturalWidth, image.naturalHeight);
              }
            }}
            onError={() => onPreviewError(tile)}
          />
        ) : tile.kind === 'video' && thumbnailUrl && renderStatus === 'ready' ? (
          <video
            src={thumbnailUrl}
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              if (!tile.preserveSlotAspectRatio) {
                onPreviewLoad(tile, video.videoWidth, video.videoHeight);
              }
            }}
            onError={() => onPreviewError(tile)}
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

        {tile.kind === 'video' && renderStatus !== 'pending' && renderStatus !== 'unpreviewable' && (
          <span className="workspace-media-card__play" aria-hidden>
            <Play size={16} fill="currentColor" />
          </span>
        )}

        {isPending && (
          <span className="workspace-media-card__type">
            GEN
          </span>
        )}
        </span>

        <span className="workspace-media-card__overlay">
          <strong>{tile.displayName}</strong>
          <small>{tile.pathLabel}</small>
          <span className="workspace-media-card__meta">
            <span>
              {isPending
                ? t('workspaceMedia.states.generating')
                : t(`workspaceMedia.sources.${tile.source}`)}
            </span>
            <span>{t(`workspaceMedia.kinds.${tile.kind}`)}</span>
            {tile.pending?.requestedAspectRatio && <span>{tile.pending.requestedAspectRatio}</span>}
            {formatBytes(tile.sizeBytes) && <span>{formatBytes(tile.sizeBytes)}</span>}
            {formatRelativeTime(tile.modifiedAt) && <span>{formatRelativeTime(tile.modifiedAt)}</span>}
          </span>
          {(isUnavailable || isThumbnailFailed) && !isPreviewLoading && (
            <span className="workspace-media-card__unavailable">
              {t('workspaceMedia.states.previewUnavailable')}
            </span>
          )}
        </span>
      </button>
      {!isPending && (onDelete || onSelect || onReference) && (
        <span className="workspace-media-card__actions">
          {onReference && (
            <button
              type="button"
              className="workspace-media-card__action"
              aria-label={t('workspaceMedia.actions.referenceNamed', { name: tile.displayName })}
              onClick={(event) => {
                event.stopPropagation();
                onReference(tile, previewUrl);
              }}
            >
              @
            </button>
          )}
          {onSelect && (
            <button
              type="button"
              className="workspace-media-card__action"
              aria-label={t('workspaceMedia.actions.selectNamed', { name: tile.displayName })}
              aria-pressed={isSelected}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(tile);
              }}
            >
              {isSelected ? '✓' : '□'}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="workspace-media-card__action"
              aria-label={t('workspaceMedia.actions.deleteNamed', { name: tile.displayName })}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(tile);
              }}
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          )}
        </span>
      )}
    </span>
  );
};

interface DeletedMediaTileProps {
  item: WorkspaceMediaTrashRecord;
  isSelected: boolean;
  aspectRatio: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  previewStatus?: WorkspaceMediaPreviewState['status'];
  previewKey?: string;
  onSelect: (item: WorkspaceMediaTrashRecord) => void;
  onRestore: (item: WorkspaceMediaTrashRecord) => void;
  onPurge: (item: WorkspaceMediaTrashRecord) => void;
  onOpen: (item: WorkspaceMediaTrashRecord, previewUrl?: string) => void;
}

const DeletedMediaTile: React.FC<DeletedMediaTileProps> = ({
  item,
  isSelected,
  aspectRatio,
  previewUrl,
  thumbnailUrl,
  previewStatus,
  previewKey,
  onSelect,
  onRestore,
  onPurge,
  onOpen,
}) => {
  const { t } = useTranslation('components');
  const isPreviewLoading = shouldResolveTrashPreview(item) && previewStatus === 'loading';
  const isPreviewFailed = shouldResolveTrashPreview(item) && previewStatus === 'failed';
  const canOpen = Boolean(previewUrl);
  const bars = item.kind === 'audio' ? waveformBars(item.id) : [];

  return (
    <span
      className={`workspace-media-card-shell ${isSelected ? 'is-selected' : ''}`}
      data-testid={`workspace-media-trash-${item.id}`}
      data-workspace-media-preview-key={previewKey}
    >
      <button
        type="button"
        className={`workspace-media-card workspace-media-card--${item.kind} workspace-media-card--deleted ${isPreviewFailed ? 'is-failed' : ''}`}
        style={{ aspectRatio }}
        onClick={() => {
          if (canOpen) {
            onOpen(item, previewUrl);
          }
        }}
        aria-label={canOpen
          ? t('workspaceMedia.actions.openNamed', { name: item.fileName })
          : t('workspaceMedia.states.previewUnavailableNamed', { name: item.fileName })}
      >
        <span className="workspace-media-card__stage">
          {item.kind === 'image' && thumbnailUrl ? (
            <img src={thumbnailUrl} alt="" loading="lazy" />
          ) : item.kind === 'video' && thumbnailUrl ? (
            <video src={thumbnailUrl} muted playsInline preload="metadata" />
          ) : item.kind === 'audio' ? (
            <span className="workspace-media-card__audio" aria-hidden>
              <FileAudio size={22} />
              <span className="workspace-media-card__waveform">
                {bars.map((height, index) => (
                  <i key={`${item.id}-${index}`} style={{ height: `${height}%` }} />
                ))}
              </span>
            </span>
          ) : (
            <span className={`workspace-media-card__placeholder ${isPreviewLoading ? 'is-loading' : ''}`} aria-hidden>
              {mediaIcon(item.kind)}
            </span>
          )}
          {item.kind === 'video' && (
            <span className="workspace-media-card__play" aria-hidden>
              <Play size={12} fill="currentColor" />
            </span>
          )}
        </span>

        <span className="workspace-media-card__overlay">
          <strong>{item.fileName}</strong>
          <small>{item.originalPath}</small>
          <span className="workspace-media-card__meta">
            <span>{t('workspaceMedia.states.deleted')}</span>
            <span>{t(`workspaceMedia.kinds.${item.kind}`)}</span>
            {formatBytes(item.sizeBytes) && <span>{formatBytes(item.sizeBytes)}</span>}
            {formatRelativeTime(item.deletedAt) && <span>{formatRelativeTime(item.deletedAt)}</span>}
          </span>
          {isPreviewFailed && (
            <span className="workspace-media-card__unavailable">
              {t('workspaceMedia.states.previewUnavailable')}
            </span>
          )}
        </span>
      </button>
      <span className="workspace-media-card__actions">
        <button
          type="button"
          className="workspace-media-card__action"
          aria-label={t('workspaceMedia.actions.selectNamed', { name: item.fileName })}
          aria-pressed={isSelected}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(item);
          }}
        >
          {isSelected ? '✓' : '□'}
        </button>
        <button
          type="button"
          className="workspace-media-card__action"
          aria-label={t('workspaceMedia.actions.restoreNamed', { name: item.fileName })}
          onClick={(event) => {
            event.stopPropagation();
            onRestore(item);
          }}
        >
          <RotateCcw size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="workspace-media-card__action"
          aria-label={t('workspaceMedia.actions.purgeNamed', { name: item.fileName })}
          onClick={(event) => {
            event.stopPropagation();
            onPurge(item);
          }}
        >
          <Trash2 size={13} aria-hidden="true" />
        </button>
      </span>
    </span>
  );
};

export const WorkspaceMediaGallery: React.FC<WorkspaceMediaGalleryProps> = ({
  workspacePath,
  isActive = true,
  service = workspaceMediaLibraryService,
  imagePreviewResolver = resolveWorkspaceMediaImagePreviewUrl,
  mediaPreviewResolver,
}) => {
  const { t } = useTranslation('components');
  const [state, setState] = React.useState<WorkspaceMediaLibraryState>({ status: 'idle' });
  const [view, setView] = React.useState<WorkspaceMediaView>('active');
  const [trashState, setTrashState] = React.useState<WorkspaceMediaTrashStateResult>({ status: 'ready', items: [], checkedAt: 0 });
  const [filter, setFilter] = React.useState<WorkspaceMediaFilter>('all');
  const [statusFilter, setStatusFilter] = React.useState<WorkspaceMediaStatusFilter>('all');
  const [sort, setSort] = React.useState<WorkspaceMediaSortKey>('recent');
  const [query, setQuery] = React.useState('');
  const [selectedTileIds, setSelectedTileIds] = React.useState<Set<string>>(() => new Set());
  const [selectedTrashIds, setSelectedTrashIds] = React.useState<Set<string>>(() => new Set());
  const [failedPreviewKeys, setFailedPreviewKeys] = React.useState<Set<string>>(() => new Set());
  const [loadedImageAspectRatios, setLoadedImageAspectRatios] = React.useState<Record<string, string>>({});
  const rootRef = React.useRef<HTMLElement | null>(null);
  const isMountedRef = React.useRef(false);
  const isActiveRef = React.useRef(isActive);
  const activityEpochRef = React.useRef(0);
  const scanningEpochRef = React.useRef<number | undefined>(undefined);
  const refreshToken = useWorkspaceMediaRefreshStore(state => state.token);
  const latestRefreshSignal = useWorkspaceMediaRefreshStore(state => state.lastSignal);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      isActiveRef.current = false;
      activityEpochRef.current += 1;
    };
  }, []);

  React.useEffect(() => {
    isActiveRef.current = isActive;
    activityEpochRef.current += 1;
    if (!isActive) {
      rootRef.current
        ?.querySelectorAll<HTMLMediaElement>('video, audio')
        .forEach(media => media.pause());
    }
  }, [isActive, workspacePath]);

  const scan = React.useCallback(async (showScanning = true) => {
    if (!isActiveRef.current) {
      return;
    }
    const requestEpoch = activityEpochRef.current;
    if (scanningEpochRef.current === requestEpoch) {
      return;
    }
    scanningEpochRef.current = requestEpoch;
    if (showScanning) {
      setState({ status: 'scanning' });
    }
    try {
      const nextState = await service.scanLibrary(workspacePath);
      if (
        isMountedRef.current
        && isActiveRef.current
        && activityEpochRef.current === requestEpoch
      ) {
        setState(nextState);
      }
    } finally {
      if (scanningEpochRef.current === requestEpoch) {
        scanningEpochRef.current = undefined;
      }
    }
  }, [service, workspacePath]);

  React.useEffect(() => {
    if (!service.purgeExpiredTrash) {
      return;
    }
    void service.purgeExpiredTrash(workspacePath).catch(() => undefined);
  }, [service, workspacePath]);

  const refreshTrash = React.useCallback(async () => {
    if (!isActiveRef.current) {
      return;
    }
    const requestEpoch = activityEpochRef.current;
    if (!service.listTrash) {
      if (isMountedRef.current && isActiveRef.current && activityEpochRef.current === requestEpoch) {
        setTrashState({ status: 'ready', items: [], checkedAt: Date.now() });
      }
      return;
    }
    const nextTrashState = await service.listTrash(workspacePath);
    if (
      isMountedRef.current
      && isActiveRef.current
      && activityEpochRef.current === requestEpoch
    ) {
      setTrashState(nextTrashState);
    }
  }, [service, workspacePath]);

  React.useEffect(() => {
    if (!isActive) {
      return;
    }
    void scan(false);
    void refreshTrash();
  }, [isActive, refreshTrash, scan]);

  React.useEffect(() => {
    if (!isActive || refreshToken <= 0) {
      return;
    }
    const mismatch = getWorkspaceMediaPathMismatch(workspacePath);
    if (mismatch && latestRefreshSignal?.token === mismatch.token) {
      return;
    }

    const retryTimeoutIds = new Set<number>();
    void scan(false);
    for (const delay of WORKSPACE_MEDIA_EVENT_REFRESH_RETRY_DELAYS_MS) {
      const timeoutId = window.setTimeout(() => {
        retryTimeoutIds.delete(timeoutId);
        void scan(false);
      }, delay);
      retryTimeoutIds.add(timeoutId);
    }

    return () => {
      for (const timeoutId of retryTimeoutIds) {
        window.clearTimeout(timeoutId);
      }
      retryTimeoutIds.clear();
    };
  }, [isActive, latestRefreshSignal?.token, refreshToken, scan, workspacePath]);

  const pendingGenerations = React.useMemo(() => (
    mergeWorkspaceMediaPendingGenerationsForWorkspace(
      state.status === 'ready' ? state.pendingGenerations : [],
      workspacePath
    )
  ), [state, workspacePath]);

  React.useEffect(() => {
    if (!isActive) {
      return;
    }
    const ownerDocument = rootRef.current?.ownerDocument ?? document;
    const intervalMs = pendingGenerations.length > 0
      ? WORKSPACE_MEDIA_ACTIVE_REFRESH_INTERVAL_MS
      : WORKSPACE_MEDIA_IDLE_REFRESH_INTERVAL_MS;
    let timeoutId: number | undefined;
    let disposed = false;
    let nextIdleIntervalMs = WORKSPACE_MEDIA_ACTIVE_REFRESH_INTERVAL_MS;

    const scheduleNextScan = () => {
      if (disposed || ownerDocument.visibilityState === 'hidden') {
        timeoutId = undefined;
        return;
      }
      const nextIntervalMs = pendingGenerations.length > 0
        ? intervalMs
        : nextIdleIntervalMs;
      nextIdleIntervalMs = WORKSPACE_MEDIA_IDLE_REFRESH_INTERVAL_MS;
      timeoutId = window.setTimeout(() => {
        timeoutId = undefined;
        if (disposed || ownerDocument.visibilityState === 'hidden') {
          return;
        }
        void scan(false);
        scheduleNextScan();
      }, nextIntervalMs);
    };
    const handleVisibilityChange = () => {
      if (ownerDocument.visibilityState === 'hidden') {
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        return;
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      void scan(false);
      scheduleNextScan();
    };

    ownerDocument.addEventListener('visibilitychange', handleVisibilityChange);
    scheduleNextScan();
    return () => {
      disposed = true;
      ownerDocument.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      );
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isActive, pendingGenerations.length, scan]);

  const pathMismatch = React.useMemo(
    () => getWorkspaceMediaPathMismatch(workspacePath),
    [workspacePath]
  );

  const isReadyLike = state.status === 'ready' || (state.status === 'empty' && pendingGenerations.length > 0);

  const tileModels = React.useMemo(
    () => isReadyLike
      ? mapWorkspaceMediaTiles(state.status === 'ready' ? state.items : [], pendingGenerations)
      : [],
    [isReadyLike, pendingGenerations, state]
  );

  const candidateTiles = React.useMemo(
    () => sortWorkspaceMediaTiles(filterWorkspaceMediaTiles(tileModels, {
      filter,
      query,
      status: 'all',
    }), sort),
    [filter, query, sort, tileModels]
  );

  const effectiveMediaPreviewResolver = React.useMemo<WorkspaceMediaPreviewResolver>(() => {
    if (mediaPreviewResolver) {
      return mediaPreviewResolver;
    }
    return resolveWorkspaceMediaPreviewUrl;
  }, [mediaPreviewResolver]);

  const deletedItems = React.useMemo(
    () => trashState.status === 'ready' ? trashState.items : [],
    [trashState]
  );
  const filteredDeletedItems = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = deletedItems.filter((item) => {
      if (filter !== 'all' && item.kind !== filter) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return item.fileName.toLowerCase().includes(normalizedQuery)
        || item.originalPath.toLowerCase().includes(normalizedQuery);
    });
    return [...filtered].sort((left, right) => {
      if (sort === 'name') {
        return left.fileName.localeCompare(right.fileName);
      }
      if (sort === 'size') {
        return (right.sizeBytes || 0) - (left.sizeBytes || 0);
      }
      return right.deletedAt - left.deletedAt;
    });
  }, [deletedItems, filter, query, sort]);

  const previewCandidates = React.useMemo<WorkspaceMediaPreviewCandidate[]>(
    () => {
      if (!isActive) {
        return [];
      }
      if (view === 'deleted') {
        return filteredDeletedItems
          .filter(shouldResolveTrashPreview)
          .map(item => ({
            key: trashPreviewCacheKey(item),
            filePath: item.trashPath,
            extension: extensionFromFileName(item.fileName),
            kind: item.kind as 'image' | 'video',
            modifiedAt: item.deletedAt,
          }));
      }
      return candidateTiles
        .filter(tile => (
          shouldResolveTilePreview(tile)
          && (
            statusFilter === 'all'
            || (
              statusFilter === 'ready'
              && !failedPreviewKeys.has(mediaPreviewCacheKey(tile))
            )
          )
        ))
        .map(tile => ({
          key: mediaPreviewCacheKey(tile),
          filePath: tile.filePath,
          extension: tile.extension,
          kind: tile.kind as 'image' | 'video',
          modifiedAt: tile.modifiedAt,
        }));
    },
    [
      candidateTiles,
      failedPreviewKeys,
      filteredDeletedItems,
      isActive,
      statusFilter,
      view,
    ],
  );

  const mediaPreviewStates = useWorkspaceMediaPreviewQueue({
    candidates: previewCandidates,
    containerRef: rootRef,
    enabled: isActive,
    imagePreviewResolver,
    mediaPreviewResolver: effectiveMediaPreviewResolver,
  });

  React.useEffect(() => {
    const currentPreviewKeys = new Set(
      candidateTiles.map(mediaPreviewCacheKey),
    );
    setFailedPreviewKeys(current => {
      const next = new Set(
        Array.from(current).filter(key => currentPreviewKeys.has(key)),
      );
      let changed = next.size !== current.size;
      for (const tile of candidateTiles) {
        const previewKey = mediaPreviewCacheKey(tile);
        const previewState = mediaPreviewStates[previewKey];
        if (previewState?.status === 'failed' && !next.has(previewKey)) {
          next.add(previewKey);
          changed = true;
        }
      }
      return changed ? next : current;
    });
    setLoadedImageAspectRatios(current => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([key]) => currentPreviewKeys.has(key)),
      );
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
  }, [candidateTiles, mediaPreviewStates]);

  const effectiveTiles = React.useMemo(
    () => tileModels.map(tile => (
      failedPreviewKeys.has(mediaPreviewCacheKey(tile))
        ? { ...tile, renderStatus: 'failed' as const }
        : tile
    )),
    [failedPreviewKeys, tileModels],
  );

  const filteredTiles = React.useMemo(
    () => sortWorkspaceMediaTiles(filterWorkspaceMediaTiles(effectiveTiles, {
      filter,
      query,
      status: statusFilter,
    }), sort),
    [effectiveTiles, filter, query, sort, statusFilter],
  );
  const primaryTiles = filteredTiles.filter(tile => tile.isPrimaryWallRenderable);
  const unpreviewableTiles = filteredTiles.filter(tile => !tile.isPrimaryWallRenderable);

  const counts = React.useMemo(() => {
    if (view === 'deleted') {
      const nextCounts: Record<WorkspaceMediaFilter, number> = {
        all: deletedItems.length,
        image: 0,
        video: 0,
        audio: 0,
      };
      for (const item of deletedItems) {
        nextCounts[item.kind] += 1;
      }
      return nextCounts;
    }
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
  }, [deletedItems, tileModels, view]);

  const statusCounts = React.useMemo(() => {
    const nextCounts: Record<WorkspaceMediaStatusFilter, number> = {
      all: candidateTiles.length,
      ready: 0,
      pending: 0,
      failed: 0,
      unpreviewable: 0,
    };
    for (const tile of candidateTiles) {
      const status = failedPreviewKeys.has(mediaPreviewCacheKey(tile))
        ? 'failed'
        : tile.renderStatus;
      nextCounts[status] += 1;
    }
    return nextCounts;
  }, [candidateTiles, failedPreviewKeys]);

  const previewUrlForTile = React.useCallback((tile: WorkspaceMediaTileViewModel): string | undefined => {
    if (tile.kind !== 'image' && tile.kind !== 'video') {
      return tile.previewUrl;
    }
    const state = mediaPreviewStates[mediaPreviewCacheKey(tile)];
    return state?.status === 'ready' ? state.url : tile.previewUrl;
  }, [mediaPreviewStates]);

  const thumbnailUrlForTile = React.useCallback((tile: WorkspaceMediaTileViewModel): string | undefined => {
    if (tile.kind !== 'image' && tile.kind !== 'video') {
      return tile.thumbnailUrl;
    }
    const state = mediaPreviewStates[mediaPreviewCacheKey(tile)];
    return state?.status === 'ready' ? state.url : undefined;
  }, [mediaPreviewStates]);

  const previewStatusForTile = React.useCallback((tile: WorkspaceMediaTileViewModel): WorkspaceMediaPreviewState['status'] | undefined => {
    if (tile.kind !== 'image' && tile.kind !== 'video') {
      return undefined;
    }
    return mediaPreviewStates[mediaPreviewCacheKey(tile)]?.status;
  }, [mediaPreviewStates]);

  const previewUrlForDeletedItem = React.useCallback((item: WorkspaceMediaTrashRecord): string | undefined => {
    if (item.kind !== 'image' && item.kind !== 'video') {
      return undefined;
    }
    const state = mediaPreviewStates[trashPreviewCacheKey(item)];
    return state?.status === 'ready' ? state.url : undefined;
  }, [mediaPreviewStates]);

  const previewStatusForDeletedItem = React.useCallback((item: WorkspaceMediaTrashRecord): WorkspaceMediaPreviewState['status'] | undefined => {
    if (item.kind !== 'image' && item.kind !== 'video') {
      return undefined;
    }
    return mediaPreviewStates[trashPreviewCacheKey(item)]?.status;
  }, [mediaPreviewStates]);

  const resetFilters = () => {
    setQuery('');
    setFilter('all');
    setStatusFilter('all');
  };

  const selectedTiles = React.useMemo(
    () => tileModels.filter(tile => selectedTileIds.has(tile.id)),
    [selectedTileIds, tileModels]
  );

  const selectedDeletedItems = React.useMemo(
    () => deletedItems.filter(item => selectedTrashIds.has(item.id)),
    [deletedItems, selectedTrashIds]
  );

  const visibleSelectableTileIds = React.useMemo(
    () => filteredTiles
      .filter(tile => tile.renderStatus !== 'pending')
      .map(tile => tile.id),
    [filteredTiles]
  );

  const visibleSelectableTrashIds = React.useMemo(
    () => filteredDeletedItems.map(item => item.id),
    [filteredDeletedItems]
  );

  const areVisibleTilesSelected = visibleSelectableTileIds.length > 0
    && visibleSelectableTileIds.every(id => selectedTileIds.has(id));
  const areVisibleTrashItemsSelected = visibleSelectableTrashIds.length > 0
    && visibleSelectableTrashIds.every(id => selectedTrashIds.has(id));

  const toggleTileSelection = React.useCallback((tile: WorkspaceMediaTileViewModel) => {
    setSelectedTileIds((current) => {
      const next = new Set(current);
      if (next.has(tile.id)) {
        next.delete(tile.id);
      } else {
        next.add(tile.id);
      }
      return next;
    });
  }, []);

  const toggleTrashSelection = React.useCallback((item: WorkspaceMediaTrashRecord) => {
    setSelectedTrashIds((current) => {
      const next = new Set(current);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      return next;
    });
  }, []);

  const toggleVisibleTileSelection = React.useCallback(() => {
    setSelectedTileIds((current) => {
      const next = new Set(current);
      const shouldClearVisible = visibleSelectableTileIds.length > 0
        && visibleSelectableTileIds.every(id => next.has(id));
      for (const id of visibleSelectableTileIds) {
        if (shouldClearVisible) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  }, [visibleSelectableTileIds]);

  const toggleVisibleTrashSelection = React.useCallback(() => {
    setSelectedTrashIds((current) => {
      const next = new Set(current);
      const shouldClearVisible = visibleSelectableTrashIds.length > 0
        && visibleSelectableTrashIds.every(id => next.has(id));
      for (const id of visibleSelectableTrashIds) {
        if (shouldClearVisible) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  }, [visibleSelectableTrashIds]);

  const deleteTiles = React.useCallback(async (tiles: WorkspaceMediaTileViewModel[]) => {
    if (!service.deleteItems || tiles.length === 0) {
      return;
    }
    const result = await service.deleteItems(workspacePath, tiles.map(selectionFromTile));
    setTrashState(result);
    if (result.status !== 'ready') {
      return;
    }
    setSelectedTileIds(new Set());
    await Promise.all([scan(false), refreshTrash()]);
  }, [refreshTrash, scan, service, workspacePath]);

  const referenceTile = React.useCallback((tile: WorkspaceMediaTileViewModel, previewUrl?: string) => {
    dispatchMediaReference({
      id: tile.stableSlotId,
      kind: tile.kind,
      filePath: tile.filePath,
      displayName: tile.displayName,
      previewUrl: previewUrl || tile.previewUrl,
      thumbnailUrl: tile.thumbnailUrl,
      source: tile.source,
      stableSlotId: tile.stableSlotId,
      extension: tile.extension,
    });
  }, []);

  const restoreTrashItems = React.useCallback(async (items: WorkspaceMediaTrashRecord[]) => {
    if (!service.restoreItems || items.length === 0) {
      return;
    }
    const result = await service.restoreItems(workspacePath, items.map(item => item.id));
    setTrashState(result);
    if (result.status !== 'ready') {
      return;
    }
    setSelectedTrashIds(new Set());
    await Promise.all([scan(false), refreshTrash()]);
  }, [refreshTrash, scan, service, workspacePath]);

  const purgeTrashItems = React.useCallback(async (items: WorkspaceMediaTrashRecord[]) => {
    if (!service.purgeItems || items.length === 0) {
      return;
    }
    const result = await service.purgeItems(workspacePath, items.map(item => item.id));
    setTrashState(result);
    if (result.status !== 'ready') {
      return;
    }
    setSelectedTrashIds(new Set());
    await refreshTrash();
  }, [refreshTrash, service, workspacePath]);

  const openDeletedMediaPreview = React.useCallback((item: WorkspaceMediaTrashRecord, previewUrl?: string) => {
    if (!previewUrl) {
      return;
    }
    openMediaPreviewPanel({
      kind: item.kind,
      url: previewUrl,
      localPath: item.trashPath,
      title: item.fileName,
      modifiedAt: item.deletedAt,
    });
  }, []);

  const markTileFailed = React.useCallback((
    tile: WorkspaceMediaTileViewModel,
  ) => {
    const previewKey = mediaPreviewCacheKey(tile);
    setFailedPreviewKeys((current) => {
      if (current.has(previewKey)) {
        return current;
      }
      const next = new Set(current);
      next.add(previewKey);
      return next;
    });
  }, []);

  const updateLoadedImageAspectRatio = React.useCallback((
    tile: WorkspaceMediaTileViewModel,
    width: number,
    height: number,
  ) => {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return;
    }
    const previewKey = mediaPreviewCacheKey(tile);
    const aspectRatio = `${Math.round(width)} / ${Math.round(height)}`;
    setLoadedImageAspectRatios((current) => (
      current[previewKey] === aspectRatio
        ? current
        : { ...current, [previewKey]: aspectRatio }
    ));
    setFailedPreviewKeys((current) => {
      if (!current.has(previewKey)) {
        return current;
      }
      const next = new Set(current);
      next.delete(previewKey);
      return next;
    });
  }, []);

  const listResetKey = [
    workspacePath,
    view,
    filter,
    statusFilter,
    query,
    sort,
  ].join('\u0000');
  const renderDeletedTile = (item: WorkspaceMediaTrashRecord) => {
    const previewUrl = previewUrlForDeletedItem(item);
    return (
      <DeletedMediaTile
        item={item}
        aspectRatio={item.kind === 'video' ? '16 / 9' : '1 / 1'}
        previewUrl={previewUrl}
        thumbnailUrl={previewUrl}
        previewStatus={previewStatusForDeletedItem(item)}
        previewKey={shouldResolveTrashPreview(item) ? trashPreviewCacheKey(item) : undefined}
        isSelected={selectedTrashIds.has(item.id)}
        onSelect={toggleTrashSelection}
        onRestore={(record) => void restoreTrashItems([record])}
        onPurge={(record) => void purgeTrashItems([record])}
        onOpen={openDeletedMediaPreview}
      />
    );
  };
  const renderPrimaryTile = (tile: WorkspaceMediaTileViewModel) => (
    <MediaTile
      tile={tile}
      renderStatus={
        failedPreviewKeys.has(mediaPreviewCacheKey(tile))
          ? 'failed'
          : tile.renderStatus
      }
      aspectRatio={
        loadedImageAspectRatios[mediaPreviewCacheKey(tile)] || tile.aspectRatio
      }
      previewUrl={previewUrlForTile(tile)}
      thumbnailUrl={thumbnailUrlForTile(tile)}
      previewStatus={previewStatusForTile(tile)}
      previewKey={shouldResolveTilePreview(tile) ? mediaPreviewCacheKey(tile) : undefined}
      onOpen={openWorkspaceMediaPreview}
      onPreviewError={markTileFailed}
      onPreviewLoad={updateLoadedImageAspectRatio}
      onReference={referenceTile}
      onDelete={(item) => void deleteTiles([item])}
      onSelect={toggleTileSelection}
      isSelected={selectedTileIds.has(tile.id)}
    />
  );

  return (
    <section ref={rootRef} className="workspace-media-gallery" aria-label={t('workspaceMedia.ariaLabel')}>
      <div className="workspace-media-gallery__toolbar">
        <WorkspaceMediaGalleryToolbar
          state={{
            query,
            view,
            filter,
            statusFilter,
            sort,
            counts,
            statusCounts,
            deletedCount: deletedItems.length,
            visibleSelectionAvailable: view === 'active'
              ? visibleSelectableTileIds.length > 0
              : visibleSelectableTrashIds.length > 0,
            areVisibleItemsSelected: view === 'active'
              ? areVisibleTilesSelected
              : areVisibleTrashItemsSelected,
          }}
          actions={{
            onQueryChange: setQuery,
            onRefresh: () => void scan(),
            onViewChange: (nextView) => {
              setView(nextView);
              if (nextView === 'deleted') {
                void refreshTrash();
              }
            },
            onFilterChange: setFilter,
            onStatusFilterChange: setStatusFilter,
            onSortChange: setSort,
            onToggleVisibleSelection: view === 'active'
              ? toggleVisibleTileSelection
              : toggleVisibleTrashSelection,
          }}
        />
        {view === 'active' && selectedTiles.length > 0 && (
          <div className="workspace-media-gallery__selection-bar">
            <span>{selectedTiles.length}</span>
            <button type="button" onClick={() => void deleteTiles(selectedTiles)}>
              {t('workspaceMedia.actions.deleteSelected')}
            </button>
            <button
              type="button"
              onClick={() => setSelectedTileIds(new Set())}
              aria-label={t('workspaceMedia.actions.clearVisibleSelection')}
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        )}
        {view === 'active' && trashState.status === 'error' && (
          <div className="workspace-media-gallery__operation-error" role="alert">
            {trashState.error.message}
          </div>
        )}
        {view === 'active' && trashState.status === 'unsupported' && (
          <div className="workspace-media-gallery__operation-error" role="alert">
            {trashState.reason.message}
          </div>
        )}
        {view === 'deleted' && selectedDeletedItems.length > 0 && (
          <div className="workspace-media-gallery__selection-bar">
            <span>{selectedDeletedItems.length}</span>
            <button type="button" onClick={() => void restoreTrashItems(selectedDeletedItems)}>
              {t('workspaceMedia.actions.restoreSelected')}
            </button>
            <button type="button" onClick={() => void purgeTrashItems(selectedDeletedItems)}>
              {t('workspaceMedia.actions.purgeSelected')}
            </button>
            <button
              type="button"
              onClick={() => setSelectedTrashIds(new Set())}
              aria-label={t('workspaceMedia.actions.clearVisibleSelection')}
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {view === 'deleted' ? (
        trashState.status === 'error' ? (
          <div className="workspace-media-gallery__state is-error">{trashState.error.message}</div>
        ) : trashState.status === 'unsupported' ? (
          <div className="workspace-media-gallery__state">{trashState.reason.message}</div>
        ) : deletedItems.length === 0 ? (
          <div className="workspace-media-gallery__state">{t('workspaceMedia.states.deletedEmpty')}</div>
        ) : filteredDeletedItems.length === 0 ? (
          <div className="workspace-media-gallery__state">
            <p>{t('workspaceMedia.states.noFilterMatches')}</p>
            <button type="button" onClick={resetFilters}>{t('workspaceMedia.clearFilters')}</button>
          </div>
        ) : shouldVirtualizeWorkspaceMediaList(filteredDeletedItems.length) ? (
          <WorkspaceMediaVirtualMasonry
            items={filteredDeletedItems}
            getItemKey={getWorkspaceMediaTrashKey}
            estimateAspectRatio={estimateWorkspaceMediaTrashAspectRatio}
            renderItem={renderDeletedTile}
            resetKey={listResetKey}
          />
        ) : (
          <div className="workspace-media-gallery__masonry">
            {filteredDeletedItems.map(item => (
              <span key={item.id} className="workspace-media-gallery__masonry-item">
                {renderDeletedTile(item)}
              </span>
            ))}
          </div>
        )
      ) : state.status === 'scanning' || state.status === 'idle' ? (
        <div className="workspace-media-gallery__skeleton" aria-label={t('workspaceMedia.states.scanning')} aria-busy="true">
          {['9 / 16', '16 / 9', '1 / 1', '4 / 5', '5 / 2', '16 / 9', '9 / 16', '1 / 1'].map((ratio, index) => (
            <span key={`${ratio}-${index}`} style={{ aspectRatio: ratio }} />
          ))}
        </div>
      ) : state.status === 'empty' && pathMismatch ? (
        <div className="workspace-media-gallery__state" data-testid="workspace-media-path-mismatch">
          Media generation is running in a different workspace. This panel is scanning {workspacePath || 'the current workspace'}, while the latest media signal targets {pathMismatch.workspacePath}.
        </div>
      ) : state.status === 'empty' && !isReadyLike ? (
        <div className="workspace-media-gallery__state">{t('workspaceMedia.states.empty')}</div>
      ) : state.status === 'unsupported' ? (
        <div className="workspace-media-gallery__state">{state.reason.message}</div>
      ) : state.status === 'error' ? (
        <div className="workspace-media-gallery__state is-error">{state.error.message}</div>
      ) : (
        <>
          {state.status === 'ready' && state.truncated && (
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
                shouldVirtualizeWorkspaceMediaList(primaryTiles.length) ? (
                  <WorkspaceMediaVirtualMasonry
                    items={primaryTiles}
                    getItemKey={getWorkspaceMediaTileKey}
                    estimateAspectRatio={tile => numericAspectRatio(
                      loadedImageAspectRatios[mediaPreviewCacheKey(tile)]
                        || tile.aspectRatio,
                    )}
                    renderItem={renderPrimaryTile}
                    resetKey={listResetKey}
                  />
                ) : (
                  <div className="workspace-media-gallery__masonry">
                    {primaryTiles.map(tile => (
                      <span key={tile.stableSlotId} className="workspace-media-gallery__masonry-item">
                        {renderPrimaryTile(tile)}
                      </span>
                    ))}
                  </div>
                )
              )}

              {unpreviewableTiles.length > 0 && (
                <section className="workspace-media-gallery__unpreviewable" data-testid="workspace-media-unpreviewable">
                  <h3>{t('workspaceMedia.states.unpreviewable')}</h3>
                  {unpreviewableTiles.map(tile => (
                    <MediaTile
                      key={tile.stableSlotId}
                      tile={tile}
                      renderStatus="unpreviewable"
                      aspectRatio={
                        loadedImageAspectRatios[mediaPreviewCacheKey(tile)]
                          || tile.aspectRatio
                      }
                      previewUrl={previewUrlForTile(tile)}
                      thumbnailUrl={thumbnailUrlForTile(tile)}
                      previewStatus={previewStatusForTile(tile)}
                      previewKey={shouldResolveTilePreview(tile) ? mediaPreviewCacheKey(tile) : undefined}
                      onOpen={openWorkspaceMediaPreview}
                      onPreviewError={markTileFailed}
                      onPreviewLoad={updateLoadedImageAspectRatio}
                      onReference={referenceTile}
                      onDelete={(item) => void deleteTiles([item])}
                      onSelect={toggleTileSelection}
                      isSelected={selectedTileIds.has(tile.id)}
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
