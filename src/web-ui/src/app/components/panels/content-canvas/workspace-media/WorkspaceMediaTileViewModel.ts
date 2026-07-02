import type { WorkspaceMediaItem, WorkspaceMediaKind, WorkspaceMediaPendingGeneration } from '@/shared/services/workspace-media';

export type WorkspaceMediaTileRenderStatus = 'ready' | 'unpreviewable' | 'failed' | 'pending';
export type WorkspaceMediaSortKey = 'recent' | 'name' | 'size';

export interface WorkspaceMediaTileViewModel {
  id: string;
  stableSlotId: string;
  kind: WorkspaceMediaKind;
  source: WorkspaceMediaItem['source'];
  typeLabel: 'IMG' | 'VID' | 'AUD';
  displayName: string;
  pathLabel: string;
  filePath: string;
  extension: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  aspectRatio: string;
  sizeBytes?: number;
  modifiedAt?: number;
  sortAt?: number;
  renderStatus: WorkspaceMediaTileRenderStatus;
  isPrimaryWallRenderable: boolean;
  preserveSlotAspectRatio?: boolean;
  pending?: {
    batchId: string;
    itemIndex: number;
    prompt?: string;
    model?: string;
    requestedAspectRatio: string;
  };
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
  if (item.kind === 'image' && !item.filePath) {
    return 'unpreviewable';
  }
  return 'ready';
}

function generatedSlotId(batchId: string, itemIndex: number): string {
  return `workspace-media-slot-${batchId}-${itemIndex}`;
}

function pendingSlotId(item: WorkspaceMediaPendingGeneration): string {
  return generatedSlotId(item.batchId, item.itemIndex);
}

function readySlotId(item: WorkspaceMediaItem): string {
  if (item.generatedIdentity) {
    return generatedSlotId(item.generatedIdentity.batchId, item.generatedIdentity.itemIndex);
  }
  return item.id;
}

function pendingSortAt(item?: WorkspaceMediaPendingGeneration): number | undefined {
  return item?.updatedAt || item?.startedAt;
}

export function mapWorkspaceMediaTiles(
  items: WorkspaceMediaItem[],
  pendingGenerations: WorkspaceMediaPendingGeneration[] = []
): WorkspaceMediaTileViewModel[] {
  const pendingBySlotId = new Map(pendingGenerations.map(item => [pendingSlotId(item), item]));
  const readyTiles = items.map((item) => {
    const renderStatus = renderStatusForItem(item);
    const stableSlotId = readySlotId(item);
    const matchingPending = pendingBySlotId.get(stableSlotId);
    return {
      id: item.id,
      stableSlotId,
      kind: item.kind,
      source: item.source,
      typeLabel: typeLabel(item.kind),
      displayName: item.fileName || item.relativePath,
      pathLabel: item.relativePath,
      filePath: item.filePath,
      extension: item.extension,
      previewUrl: item.previewUrl,
      thumbnailUrl: item.thumbnailUrl || item.previewUrl,
      aspectRatio: matchingPending?.placeholderAspectRatio || item.placeholderAspectRatio || aspectRatioForItem(item),
      sizeBytes: item.sizeBytes,
      modifiedAt: item.modifiedAt,
      sortAt: pendingSortAt(matchingPending) || item.sortAt || item.modifiedAt,
      renderStatus,
      isPrimaryWallRenderable: renderStatus === 'ready',
      preserveSlotAspectRatio: Boolean(matchingPending),
    };
  });
  const readySlotIds = new Set(readyTiles.map(tile => tile.stableSlotId));
  const pendingTiles: WorkspaceMediaTileViewModel[] = pendingGenerations.map((item) => ({
    id: item.id,
    stableSlotId: pendingSlotId(item),
    kind: item.kind,
    source: item.source,
    typeLabel: typeLabel(item.kind),
    displayName: `Generating ${item.kind} #${item.itemIndex}`,
    pathLabel: item.prompt || item.batchId,
    filePath: '',
    extension: '',
    aspectRatio: item.placeholderAspectRatio,
    modifiedAt: pendingSortAt(item),
    sortAt: pendingSortAt(item),
    renderStatus: 'pending' as const,
    isPrimaryWallRenderable: true,
    pending: {
      batchId: item.batchId,
      itemIndex: item.itemIndex,
      prompt: item.prompt,
      model: item.model,
      requestedAspectRatio: item.requestedAspectRatio,
    },
  })).filter(tile => !readySlotIds.has(tile.stableSlotId));
  return [...pendingTiles, ...readyTiles];
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
  return copy.sort((left, right) => (right.sortAt || right.modifiedAt || 0) - (left.sortAt || left.modifiedAt || 0));
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
