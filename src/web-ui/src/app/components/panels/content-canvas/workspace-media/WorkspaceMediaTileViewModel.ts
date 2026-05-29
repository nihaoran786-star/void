import type { WorkspaceMediaItem, WorkspaceMediaKind } from '@/shared/services/workspace-media';

export type WorkspaceMediaTileRenderStatus = 'ready' | 'unpreviewable' | 'failed';
export type WorkspaceMediaSortKey = 'recent' | 'name' | 'size';

export interface WorkspaceMediaTileViewModel {
  id: string;
  kind: WorkspaceMediaKind;
  source: WorkspaceMediaItem['source'];
  typeLabel: 'IMG' | 'VID' | 'AUD';
  displayName: string;
  pathLabel: string;
  filePath: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  aspectRatio: string;
  sizeBytes?: number;
  modifiedAt?: number;
  renderStatus: WorkspaceMediaTileRenderStatus;
  isPrimaryWallRenderable: boolean;
}

function typeLabel(kind: WorkspaceMediaKind): WorkspaceMediaTileViewModel['typeLabel'] {
  if (kind === 'video') return 'VID';
  if (kind === 'audio') return 'AUD';
  return 'IMG';
}

function fallbackAspectRatio(kind: WorkspaceMediaKind): string {
  if (kind === 'audio') return '5 / 2';
  if (kind === 'video') return '16 / 9';
  return '4 / 3';
}

function aspectRatioForItem(item: WorkspaceMediaItem): string {
  if (
    typeof item.width === 'number' &&
    typeof item.height === 'number' &&
    item.width > 0 &&
    item.height > 0
  ) {
    return `${Math.round(item.width)} / ${Math.round(item.height)}`;
  }
  return fallbackAspectRatio(item.kind);
}

function renderStatusForItem(item: WorkspaceMediaItem): WorkspaceMediaTileRenderStatus {
  if (item.kind === 'image' && !item.thumbnailUrl && !item.previewUrl) {
    return 'unpreviewable';
  }
  return 'ready';
}

export function mapWorkspaceMediaTiles(items: WorkspaceMediaItem[]): WorkspaceMediaTileViewModel[] {
  return items.map((item) => {
    const renderStatus = renderStatusForItem(item);
    return {
      id: item.id,
      kind: item.kind,
      source: item.source,
      typeLabel: typeLabel(item.kind),
      displayName: item.fileName || item.relativePath,
      pathLabel: item.relativePath,
      filePath: item.filePath,
      previewUrl: item.previewUrl,
      thumbnailUrl: item.thumbnailUrl || item.previewUrl,
      aspectRatio: aspectRatioForItem(item),
      sizeBytes: item.sizeBytes,
      modifiedAt: item.modifiedAt,
      renderStatus,
      isPrimaryWallRenderable: renderStatus === 'ready',
    };
  });
}

export function sortWorkspaceMediaTiles(
  tiles: WorkspaceMediaTileViewModel[],
  sort: WorkspaceMediaSortKey
): WorkspaceMediaTileViewModel[] {
  const copy = [...tiles];
  if (sort === 'name') {
    return copy.sort((left, right) => left.displayName.localeCompare(right.displayName));
  }
  if (sort === 'size') {
    return copy.sort((left, right) => (right.sizeBytes || 0) - (left.sizeBytes || 0));
  }
  return copy.sort((left, right) => (right.modifiedAt || 0) - (left.modifiedAt || 0));
}

export function filterWorkspaceMediaTiles(
  tiles: WorkspaceMediaTileViewModel[],
  options: {
    filter: 'all' | WorkspaceMediaKind;
    query: string;
  }
): WorkspaceMediaTileViewModel[] {
  const normalizedQuery = options.query.trim().toLowerCase();
  return tiles.filter((tile) => {
    if (options.filter !== 'all' && tile.kind !== options.filter) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return (
      tile.displayName.toLowerCase().includes(normalizedQuery) ||
      tile.pathLabel.toLowerCase().includes(normalizedQuery)
    );
  });
}
