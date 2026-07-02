import { convertFileSrc } from '@tauri-apps/api/core';
import { workspaceAPI } from '@/infrastructure/api/service-api/WorkspaceAPI';
import type {
  WorkspaceMediaError,
  WorkspaceMediaGeneratedIdentity,
  WorkspaceMediaItem,
  WorkspaceMediaKind,
  WorkspaceMediaLibraryService,
  WorkspaceMediaLibraryState,
  WorkspaceMediaNode,
  WorkspaceMediaNodeAdapter,
  WorkspaceMediaPendingGeneration,
  WorkspaceMediaSelection,
  WorkspaceMediaSource,
  WorkspaceMediaTrashRecord,
  WorkspaceMediaTrashStateResult,
} from './WorkspaceMediaTypes';
import { joinWorkspaceMediaPath } from './WorkspaceMediaPaths';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'ogg']);
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'dist',
  'build',
  '.next',
  'target',
  'coverage',
  '.turbo',
  '.vite',
]);

const MANAGED_MEDIA_SOURCES: Array<{ source: WorkspaceMediaSource; relativePath: string; createIfMissing: boolean }> = [
  { source: 'generated', relativePath: 'media/generated', createIfMissing: true },
  { source: 'input', relativePath: 'media/input', createIfMissing: true },
  { source: 'generated', relativePath: '.void/media/generated', createIfMissing: false },
  { source: 'input', relativePath: '.void/media/uploads', createIfMissing: false },
];

interface WorkspaceMediaLibraryOptions {
  maxResults?: number;
  maxVisitedDirectories?: number;
}

interface WorkspaceMediaSourceRoot {
  source: WorkspaceMediaSource;
  path: string;
  createIfMissing: boolean;
}

interface WorkspaceMediaPendingDirectory {
  source: WorkspaceMediaSource;
  path: string;
}

const DEFAULT_OPTIONS: Required<WorkspaceMediaLibraryOptions> = {
  maxResults: 500,
  maxVisitedDirectories: 1500,
};
const MAX_PENDING_GENERATION_PLACEHOLDERS = 64;
const DEFAULT_TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function getMediaKindForPath(filePath: string): WorkspaceMediaKind | null {
  const extension = getExtension(filePath);
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  return null;
}

export function shouldIgnoreWorkspaceMediaDirectory(name: string): boolean {
  return IGNORED_DIRECTORIES.has(name.trim().toLowerCase());
}

function getExtension(filePath: string): string {
  const fileName = getFileName(filePath);
  const lastDot = fileName.lastIndexOf('.');
  return lastDot >= 0 ? fileName.slice(lastDot + 1).toLowerCase() : '';
}

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function getDirectoryName(filePath: string): string {
  const normalized = normalizeSlashes(filePath);
  const index = normalized.lastIndexOf('/');
  return index > 0 ? normalized.slice(0, index) : '';
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function relativePath(workspacePath: string, filePath: string): string {
  const normalizedWorkspace = normalizeSlashes(workspacePath).replace(/\/+$/, '');
  const normalizedFile = normalizeSlashes(filePath);
  const prefix = `${normalizedWorkspace}/`;
  return normalizedFile.startsWith(prefix) ? normalizedFile.slice(prefix.length) : normalizedFile;
}

function parseGeneratedIdentityFromRelativePath(relativeFilePath: string): WorkspaceMediaGeneratedIdentity | undefined {
  const normalized = normalizeSlashes(relativeFilePath);
  const match = normalized.match(/^(?:media\/generated|\.void\/media\/generated)\/([^/]+)\/[^/]+-(\d+)\.[^/.]+$/i);
  if (!match) {
    return undefined;
  }
  const itemIndex = Number.parseInt(match[2], 10);
  if (!Number.isFinite(itemIndex) || itemIndex <= 0) {
    return undefined;
  }
  return {
    batchId: match[1],
    itemIndex,
  };
}

function stableId(filePath: string): string {
  let hash = 0;
  for (let index = 0; index < filePath.length; index += 1) {
    hash = ((hash << 5) - hash) + filePath.charCodeAt(index);
    hash |= 0;
  }
  return `workspace-media-${Math.abs(hash).toString(36)}`;
}

function stablePendingId(batchId: string, itemIndex: number): string {
  return `workspace-media-pending-${batchId}-${itemIndex}`;
}

function previewUrlForPath(filePath: string): string | undefined {
  try {
    return convertFileSrc(filePath);
  } catch {
    return undefined;
  }
}

function errorState(code: WorkspaceMediaError['code'], message: string, cause?: unknown): WorkspaceMediaError {
  return { code, message, cause };
}

function hasWorkspacePath(workspacePath?: string): workspacePath is string {
  return typeof workspacePath === 'string' && workspacePath.trim().length > 0;
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function normalizePendingKind(value: unknown): WorkspaceMediaPendingGeneration['kind'] {
  return value === 'video' ? 'video' : 'image';
}

function normalizeCssAspectRatio(value: unknown, kind: WorkspaceMediaPendingGeneration['kind']): string {
  const fallback = kind === 'video' ? '16 / 9' : '1 / 1';
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (/^\d+\s*\/\s*\d+$/.test(trimmed)) {
    return trimmed.replace(/\s*\/\s*/, ' / ');
  }
  if (/^\d+\s*:\s*\d+$/.test(trimmed)) {
    return trimmed.replace(/\s*:\s*/, ' / ');
  }
  return fallback;
}

function normalizeRequestedAspectRatio(value: unknown, placeholderAspectRatio: string): string {
  if (typeof value === 'string' && /^\d+\s*:\s*\d+$/.test(value.trim())) {
    return value.trim().replace(/\s*:\s*/, ':');
  }
  return placeholderAspectRatio.replace(/\s*\/\s*/, ':');
}

function countFrom(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.floor(value))
    : fallback;
}

function toMediaItem(
  workspacePath: string,
  node: WorkspaceMediaNode,
  kind: WorkspaceMediaKind,
  source: WorkspaceMediaSource
): WorkspaceMediaItem {
  const fileName = node.name || getFileName(node.path);
  const itemRelativePath = relativePath(workspacePath, node.path);
  const generatedIdentity = source === 'generated'
    ? parseGeneratedIdentityFromRelativePath(itemRelativePath)
    : undefined;
  const item: WorkspaceMediaItem = {
    id: stableId(node.path),
    kind,
    source,
    filePath: node.path,
    relativePath: itemRelativePath,
    fileName,
    extension: getExtension(fileName || node.path),
  };

  if (generatedIdentity) {
    item.generatedIdentity = generatedIdentity;
  }
  if (typeof node.sizeBytes === 'number') {
    item.sizeBytes = node.sizeBytes;
  }
  if (typeof node.modifiedAt === 'number') {
    item.modifiedAt = node.modifiedAt;
    item.sortAt = node.modifiedAt;
  }

  const previewUrl = previewUrlForPath(node.path);
  if (previewUrl) {
    item.previewUrl = previewUrl;
    if (kind === 'image') {
      item.thumbnailUrl = previewUrl;
    }
  }

  return item;
}

function stableTrashId(selection: WorkspaceMediaSelection, now: number): string {
  return `trash-${stableId(`${selection.filePath}:${selection.stableSlotId || selection.id}:${now}`).replace(/^workspace-media-/, '')}`;
}

function trashRootPath(workspacePath: string): string {
  return joinWorkspaceMediaPath(workspacePath, '.void/media-trash');
}

function trashRecordDirectory(workspacePath: string, trashId: string): string {
  return joinWorkspaceMediaPath(workspacePath, `.void/media-trash/${trashId}`);
}

function trashMetadataPath(workspacePath: string, trashId: string): string {
  return joinWorkspaceMediaPath(workspacePath, `.void/media-trash/${trashId}/metadata.json`);
}

function trashIndexPath(workspacePath: string): string {
  return joinWorkspaceMediaPath(workspacePath, '.void/media-trash/index.json');
}

function trashFilePath(workspacePath: string, trashId: string, fileName: string): string {
  return joinWorkspaceMediaPath(workspacePath, `.void/media-trash/${trashId}/${fileName}`);
}

function isPathInsideWorkspace(workspacePath: string, filePath: string): boolean {
  const workspace = normalizeSlashes(workspacePath).replace(/\/+$/, '').toLowerCase();
  const path = normalizeSlashes(filePath).toLowerCase();
  return path === workspace || path.startsWith(`${workspace}/`);
}

function isPathInsideTrash(workspacePath: string, filePath: string): boolean {
  const trash = normalizeSlashes(trashRootPath(workspacePath)).replace(/\/+$/, '').toLowerCase();
  const path = normalizeSlashes(filePath).toLowerCase();
  return path === trash || path.startsWith(`${trash}/`);
}

function trashError(message: string, cause?: unknown): WorkspaceMediaTrashStateResult {
  return { status: 'error', error: errorState('trash_failed', message, cause) };
}

function unsafePathError(message: string): WorkspaceMediaTrashStateResult {
  return { status: 'error', error: errorState('unsafe_path', message) };
}

function parseTrashRecord(value: unknown): WorkspaceMediaTrashRecord | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  const id = typeof record.id === 'string' ? record.id : undefined;
  const originalPath = typeof record.originalPath === 'string' ? record.originalPath : undefined;
  const trashPath = typeof record.trashPath === 'string' ? record.trashPath : undefined;
  const fileName = typeof record.fileName === 'string' ? record.fileName : undefined;
  const kind = record.kind === 'image' || record.kind === 'video' || record.kind === 'audio' ? record.kind : undefined;
  const source = record.source === 'generated' || record.source === 'input' ? record.source : undefined;
  const deletedAt = typeof record.deletedAt === 'number' && Number.isFinite(record.deletedAt)
    ? record.deletedAt
    : undefined;
  if (!id || !originalPath || !trashPath || !fileName || !kind || !source || typeof deletedAt !== 'number') {
    return undefined;
  }
  const state = record.state === 'expired' ? 'expired' : 'trashed';
  const generatedIdentity = asRecord(record.generatedIdentity);
  return {
    id,
    state,
    originalPath,
    trashPath,
    fileName,
    kind,
    source,
    deletedAt,
    stableSlotId: typeof record.stableSlotId === 'string' ? record.stableSlotId : undefined,
    generatedIdentity: typeof generatedIdentity?.batchId === 'string' && typeof generatedIdentity.itemIndex === 'number'
      ? { batchId: generatedIdentity.batchId, itemIndex: generatedIdentity.itemIndex }
      : undefined,
    sizeBytes: typeof record.sizeBytes === 'number' ? record.sizeBytes : undefined,
  };
}

async function resolveRestorePath(
  adapter: WorkspaceMediaNodeAdapter,
  originalPath: string
): Promise<string> {
  if (!adapter.pathExists || !(await adapter.pathExists(originalPath))) {
    return originalPath;
  }
  const directory = getDirectoryName(originalPath);
  const fileName = getFileName(originalPath);
  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot) : '';
  for (let index = 1; index <= 99; index += 1) {
    const candidate = `${directory}/${stem}-restored-${index}${extension}`;
    if (!(await adapter.pathExists(candidate))) {
      return candidate;
    }
  }
  return `${directory}/${stem}-restored-${Date.now()}${extension}`;
}

interface GeneratedBatchMetadata {
  requestedAspectRatio?: string;
  placeholderAspectRatio?: string;
  batchSortAt?: number;
  itemSortAtByIndex: Map<number, number>;
  itemPromptByIndex: Map<number, string>;
  itemRoleByIndex: Map<number, string>;
  itemResultUrlByIndex: Map<number, string>;
  itemLocalPathByIndex: Map<number, string>;
}

function generatedManifestPath(workspacePath: string, relativeFilePath: string, batchId: string): string | undefined {
  const normalized = normalizeSlashes(relativeFilePath);
  if (normalized.startsWith(`media/generated/${batchId}/`)) {
    return joinWorkspaceMediaPath(workspacePath, `media/generated/${batchId}/manifest.json`);
  }
  if (normalized.startsWith(`.void/media/generated/${batchId}/`)) {
    return joinWorkspaceMediaPath(workspacePath, `.void/media/generated/${batchId}/manifest.json`);
  }
  return undefined;
}

function generatedBatchMetadataFromManifest(value: unknown): GeneratedBatchMetadata | undefined {
  const record = asRecord(value);
  const batch = asRecord(record?.batch);
  if (!batch) {
    return undefined;
  }
  const kind = normalizePendingKind(batch.kind);
  const placeholderAspectRatio = normalizeCssAspectRatio(
    batch.placeholder_aspect_ratio ?? batch.requested_aspect_ratio,
    kind
  );
  const requestedAspectRatio = normalizeRequestedAspectRatio(batch.requested_aspect_ratio, placeholderAspectRatio);
  const batchSortAt = parseTimestamp(batch.updated_at ?? batch.completed_at ?? batch.created_at);
  const itemSortAtByIndex = new Map<number, number>();
  const itemPromptByIndex = new Map<number, string>();
  const itemRoleByIndex = new Map<number, string>();
  const itemResultUrlByIndex = new Map<number, string>();
  const itemLocalPathByIndex = new Map<number, string>();
  const items = Array.isArray(batch.items) ? batch.items : [];
  for (const item of items) {
    const itemRecord = asRecord(item);
    const itemIndex = typeof itemRecord?.item_index === 'number' ? itemRecord.item_index : undefined;
    const itemSortAt = parseTimestamp(itemRecord?.completed_at ?? itemRecord?.updated_at ?? itemRecord?.created_at);
    if (typeof itemIndex === 'number' && Number.isFinite(itemIndex) && itemIndex > 0 && itemSortAt) {
      itemSortAtByIndex.set(itemIndex, itemSortAt);
    }
    if (typeof itemIndex === 'number' && Number.isFinite(itemIndex) && itemIndex > 0) {
      if (typeof itemRecord?.prompt === 'string' && itemRecord.prompt.trim()) {
        itemPromptByIndex.set(itemIndex, itemRecord.prompt);
      }
      if (typeof itemRecord?.role === 'string' && itemRecord.role.trim()) {
        itemRoleByIndex.set(itemIndex, itemRecord.role);
      }
      if (typeof itemRecord?.result_url === 'string' && itemRecord.result_url.trim()) {
        itemResultUrlByIndex.set(itemIndex, itemRecord.result_url);
      }
      if (typeof itemRecord?.local_path === 'string' && itemRecord.local_path.trim()) {
        itemLocalPathByIndex.set(itemIndex, itemRecord.local_path);
      }
    }
  }
  return {
    requestedAspectRatio,
    placeholderAspectRatio,
    batchSortAt,
    itemSortAtByIndex,
    itemPromptByIndex,
    itemRoleByIndex,
    itemResultUrlByIndex,
    itemLocalPathByIndex,
  };
}

async function enrichGeneratedMediaItems(
  workspacePath: string,
  items: WorkspaceMediaItem[],
  adapter: WorkspaceMediaNodeAdapter
): Promise<WorkspaceMediaItem[]> {
  if (!adapter.readTextFile) {
    return items;
  }
  const readTextFile = adapter.readTextFile;

  const metadataByManifestPath = new Map<string, Promise<GeneratedBatchMetadata | undefined>>();
  return Promise.all(items.map(async (item): Promise<WorkspaceMediaItem> => {
    if (!item.generatedIdentity) {
      return item;
    }
    const manifestPath = generatedManifestPath(workspacePath, item.relativePath, item.generatedIdentity.batchId);
    if (!manifestPath) {
      return item;
    }
    let metadataPromise = metadataByManifestPath.get(manifestPath);
    if (!metadataPromise) {
      metadataPromise = readTextFile(manifestPath)
        .then(content => generatedBatchMetadataFromManifest(JSON.parse(content)))
        .catch(() => undefined);
      metadataByManifestPath.set(manifestPath, metadataPromise);
    }
    const metadata = await metadataPromise;
    if (!metadata) {
      return item;
    }
    return {
      ...item,
      requestedAspectRatio: metadata.requestedAspectRatio,
      placeholderAspectRatio: metadata.placeholderAspectRatio,
      generationPrompt: metadata.itemPromptByIndex.get(item.generatedIdentity.itemIndex),
      generationRole: metadata.itemRoleByIndex.get(item.generatedIdentity.itemIndex),
      generationResultUrl: metadata.itemResultUrlByIndex.get(item.generatedIdentity.itemIndex),
      filePath: metadata.itemLocalPathByIndex.get(item.generatedIdentity.itemIndex) ?? item.filePath,
      sortAt: metadata.itemSortAtByIndex.get(item.generatedIdentity.itemIndex)
        ?? metadata.batchSortAt
        ?? item.sortAt
        ?? item.modifiedAt,
    };
  }));
}

function pendingGenerationsFromJob(job: unknown): WorkspaceMediaPendingGeneration[] {
  const record = asRecord(job);
  const batch = asRecord(record?.batch);
  if (!record || !batch) {
    return [];
  }

  const status = typeof batch.status === 'string'
    ? batch.status
    : typeof record.status === 'string'
      ? record.status
      : undefined;
  if (status !== 'polling') {
    return [];
  }

  const pendingCount = countFrom(batch.pending_count, 0);
  if (pendingCount <= 0) {
    return [];
  }

  const batchId = typeof batch.batch_id === 'string'
    ? batch.batch_id
    : typeof record.batch_id === 'string'
      ? record.batch_id
      : undefined;
  if (!batchId) {
    return [];
  }

  const kind = normalizePendingKind(batch.kind ?? record.kind);
  const requestedCount = Math.min(
    countFrom(batch.requested_count, pendingCount),
    MAX_PENDING_GENERATION_PLACEHOLDERS
  );
  const placeholderAspectRatio = normalizeCssAspectRatio(batch.placeholder_aspect_ratio ?? batch.requested_aspect_ratio, kind);
  const requestedAspectRatio = normalizeRequestedAspectRatio(batch.requested_aspect_ratio, placeholderAspectRatio);
  const updatedAt = parseTimestamp(batch.updated_at ?? record.updated_at);
  const startedAt = parseTimestamp(batch.created_at ?? record.created_at);
  const items = Array.isArray(batch.items) ? batch.items : [];
  const prompt = items
    .map(item => asRecord(item)?.prompt)
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const model = items
    .map(item => asRecord(item)?.model)
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);

  return Array.from({ length: requestedCount }, (_, index) => ({
    id: stablePendingId(batchId, index + 1),
    batchId,
    itemIndex: index + 1,
    kind,
    source: 'generated' as const,
    prompt,
    model,
    requestedAspectRatio,
    placeholderAspectRatio,
    updatedAt,
    startedAt,
  }));
}

export function createWorkspaceMediaLibraryService(
  adapter: WorkspaceMediaNodeAdapter,
  options: WorkspaceMediaLibraryOptions = {}
): WorkspaceMediaLibraryService {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };

  const walk = async (
    workspacePath: string,
    mode: 'availability' | 'library'
  ): Promise<{ items: WorkspaceMediaItem[]; truncated: boolean }> => {
    const sourceRoots: WorkspaceMediaSourceRoot[] = MANAGED_MEDIA_SOURCES.map((entry) => ({
      source: entry.source,
      path: joinWorkspaceMediaPath(workspacePath, entry.relativePath),
      createIfMissing: entry.createIfMissing,
    }));
    const sourceRootPaths = new Set(sourceRoots.map(root => normalizeSlashes(root.path)));
    const pendingDirectories: WorkspaceMediaPendingDirectory[] = sourceRoots.map(root => ({
      source: root.source,
      path: root.path,
    }));
    const items: WorkspaceMediaItem[] = [];
    let visitedDirectories = 0;
    let truncated = false;

    if (adapter.ensureDirectory) {
      for (const root of sourceRoots) {
        if (root.createIfMissing) {
          await adapter.ensureDirectory(root.path);
        }
      }
    }

    while (pendingDirectories.length > 0) {
      const currentDirectory = pendingDirectories.shift();
      if (!currentDirectory) break;

      visitedDirectories += 1;
      if (visitedDirectories > resolvedOptions.maxVisitedDirectories) {
        truncated = true;
        break;
      }

      let children: WorkspaceMediaNode[];
      try {
        children = await adapter.listChildren(currentDirectory.path);
      } catch (error) {
        if (sourceRootPaths.has(normalizeSlashes(currentDirectory.path))) {
          continue;
        }
        throw error;
      }

      for (const child of children) {
        if (child.isDirectory) {
          if (!shouldIgnoreWorkspaceMediaDirectory(child.name)) {
            pendingDirectories.push({ source: currentDirectory.source, path: child.path });
          }
          continue;
        }

        const kind = getMediaKindForPath(child.name || child.path);
        if (!kind) {
          continue;
        }

        items.push(toMediaItem(workspacePath, child, kind, currentDirectory.source));

        if (mode === 'availability') {
          return { items, truncated: false };
        }

        if (items.length > resolvedOptions.maxResults) {
          truncated = true;
        }
      }
    }

    return { items, truncated };
  };

  const scanPendingGenerations = async (workspacePath: string): Promise<WorkspaceMediaPendingGeneration[]> => {
    if (!adapter.readTextFile) {
      return [];
    }

    const jobDirectory = joinWorkspaceMediaPath(workspacePath, '.void/media-jobs');
    let children: WorkspaceMediaNode[];
    try {
      children = await adapter.listChildren(jobDirectory);
    } catch {
      return [];
    }

    const pending: WorkspaceMediaPendingGeneration[] = [];
    for (const child of children) {
      if (child.isDirectory || !child.name.toLowerCase().endsWith('.json')) {
        continue;
      }
      try {
        const content = await adapter.readTextFile(child.path);
        pending.push(...pendingGenerationsFromJob(JSON.parse(content)));
      } catch {
        continue;
      }
    }
    return pending.sort((left, right) => (right.updatedAt || right.startedAt || 0) - (left.updatedAt || left.startedAt || 0));
  };

  const readTrashIndexRecords = async (workspacePath: string): Promise<WorkspaceMediaTrashRecord[]> => {
    if (!adapter.readTextFile) {
      return [];
    }
    try {
      const parsed = JSON.parse(await adapter.readTextFile(trashIndexPath(workspacePath)));
      const records: unknown[] = Array.isArray(parsed?.items) ? parsed.items : [];
      return records
        .map(parseTrashRecord)
        .filter((record): record is WorkspaceMediaTrashRecord => Boolean(record));
    } catch {
      return [];
    }
  };

  const writeTrashIndexRecords = async (
    workspacePath: string,
    records: WorkspaceMediaTrashRecord[]
  ): Promise<void> => {
    if (!adapter.writeTextFile) {
      return;
    }
    const deduped = Array.from(new Map(records.map(record => [record.id, record])).values())
      .sort((left, right) => right.deletedAt - left.deletedAt);
    await adapter.writeTextFile(trashIndexPath(workspacePath), JSON.stringify({
      version: 1,
      items: deduped,
    }, null, 2));
  };

  const listTrash = async (
    workspacePath: string | undefined,
    now = Date.now()
  ): Promise<WorkspaceMediaTrashStateResult> => {
    if (!hasWorkspacePath(workspacePath)) {
      return {
        status: 'unsupported',
        reason: errorState('missing_workspace', 'No workspace path is available.'),
      };
    }
    if (!adapter.readTextFile) {
      return { status: 'ready', items: [], checkedAt: now };
    }
    const rootPath = workspacePath.trim();
    try {
      const indexedRecords = await readTrashIndexRecords(rootPath);
      const children = await adapter.listChildren(trashRootPath(rootPath)).catch(() => []);
      const records: WorkspaceMediaTrashRecord[] = [];
      for (const child of children) {
        if (!child.isDirectory) {
          continue;
        }
        const metadataPath = trashMetadataPath(rootPath, child.name);
        try {
          const record = parseTrashRecord(JSON.parse(await adapter.readTextFile(metadataPath)));
          if (record) {
            records.push(record);
          }
        } catch {
          continue;
        }
      }
      const mergedRecords = Array.from(new Map(
        [...indexedRecords, ...records].map(record => [record.id, record])
      ).values());
      return {
        status: 'ready',
        items: mergedRecords.sort((left, right) => right.deletedAt - left.deletedAt),
        checkedAt: now,
      };
    } catch (error) {
      return trashError(error instanceof Error ? error.message : 'Failed to list deleted media.', error);
    }
  };

  const purgeItems = async (
    workspacePath: string | undefined,
    trashIds: string[]
  ): Promise<WorkspaceMediaTrashStateResult> => {
    if (!hasWorkspacePath(workspacePath)) {
      return {
        status: 'unsupported',
        reason: errorState('missing_workspace', 'No workspace path is available.'),
      };
    }
    const rootPath = workspacePath.trim();
    if (!adapter.deleteDirectory) {
      return trashError('Workspace media purge operations are unavailable.');
    }
    const deleteDirectory = adapter.deleteDirectory;
    try {
      for (const trashId of trashIds) {
        await deleteDirectory(trashRecordDirectory(rootPath, trashId), true);
      }
      const remainingRecords = (await readTrashIndexRecords(rootPath))
        .filter(record => !trashIds.includes(record.id));
      await writeTrashIndexRecords(rootPath, remainingRecords);
      return await listTrash(rootPath);
    } catch (error) {
      return trashError(error instanceof Error ? error.message : 'Failed to permanently delete media.', error);
    }
  };

  return {
    async checkAvailability(workspacePath) {
      if (!hasWorkspacePath(workspacePath)) {
        return {
          status: 'unsupported',
          reason: errorState('missing_workspace', 'No workspace path is available.'),
        };
      }

      const rootPath = workspacePath.trim();
      try {
        const [result, pendingGenerations] = await Promise.all([
          walk(rootPath, 'availability'),
          scanPendingGenerations(rootPath),
        ]);
        return result.items.length > 0 || pendingGenerations.length > 0
          ? { status: 'available', firstDetectedAt: Date.now() }
          : { status: 'unavailable', checkedAt: Date.now() };
      } catch (error) {
        return {
          status: 'error',
          error: errorState('scan_failed', error instanceof Error ? error.message : 'Failed to check workspace media.', error),
        };
      }
    },

    async scanLibrary(workspacePath) {
      if (!hasWorkspacePath(workspacePath)) {
        return {
          status: 'unsupported',
          reason: errorState('missing_workspace', 'No workspace path is available.'),
        };
      }

      const rootPath = workspacePath.trim();
      try {
        const [result, pendingGenerations] = await Promise.all([
          walk(rootPath, 'library'),
          scanPendingGenerations(rootPath),
        ]);
        const enrichedItems = await enrichGeneratedMediaItems(rootPath, result.items, adapter);
        const sortedItems = enrichedItems
          .sort((left, right) => (right.sortAt || right.modifiedAt || 0) - (left.sortAt || left.modifiedAt || 0))
          .slice(0, resolvedOptions.maxResults);

        if (sortedItems.length === 0 && pendingGenerations.length === 0) {
          return { status: 'empty', scannedAt: Date.now() };
        }

        const state: WorkspaceMediaLibraryState = {
          status: 'ready',
          items: sortedItems,
          pendingGenerations,
          scannedAt: Date.now(),
        };
        if (result.truncated || result.items.length > resolvedOptions.maxResults) {
          state.truncated = true;
        }
        return state;
      } catch (error) {
        return {
          status: 'error',
          error: errorState('scan_failed', error instanceof Error ? error.message : 'Failed to scan workspace media.', error),
        };
      }
    },

    listTrash,

    async deleteItems(workspacePath, selections, now = Date.now()) {
      if (!hasWorkspacePath(workspacePath)) {
        return {
          status: 'unsupported',
          reason: errorState('missing_workspace', 'No workspace path is available.'),
        };
      }
      const rootPath = workspacePath.trim();
      if (!adapter.ensureDirectory || !adapter.renameFile || !adapter.writeTextFile) {
        return trashError('Workspace media trash operations are unavailable.');
      }
      const ensureDirectory = adapter.ensureDirectory;
      const renameFile = adapter.renameFile;
      const writeTextFile = adapter.writeTextFile;
      try {
        await ensureDirectory(trashRootPath(rootPath));
        const indexedRecords = await readTrashIndexRecords(rootPath);
        const newRecords: WorkspaceMediaTrashRecord[] = [];
        for (const selection of selections) {
          if (!isPathInsideWorkspace(rootPath, selection.filePath) || isPathInsideTrash(rootPath, selection.filePath)) {
            return unsafePathError('Refusing to delete media outside the active workspace.');
          }
          const fileName = getFileName(selection.filePath);
          const trashId = stableTrashId(selection, now);
          const recordDirectory = trashRecordDirectory(rootPath, trashId);
          const movedPath = trashFilePath(rootPath, trashId, fileName);
          await ensureDirectory(recordDirectory);
          await renameFile(selection.filePath, movedPath);
          const record: WorkspaceMediaTrashRecord = {
            id: trashId,
            state: 'trashed',
            originalPath: selection.filePath,
            trashPath: movedPath,
            fileName,
            kind: selection.kind,
            source: selection.source,
            deletedAt: now,
            stableSlotId: selection.stableSlotId,
            generatedIdentity: selection.generatedIdentity,
          };
          await writeTextFile(trashMetadataPath(rootPath, trashId), JSON.stringify(record, null, 2));
          newRecords.push(record);
        }
        await writeTrashIndexRecords(rootPath, [...indexedRecords, ...newRecords]);
        return await listTrash(rootPath, now);
      } catch (error) {
        return trashError(error instanceof Error ? error.message : 'Failed to delete media.', error);
      }
    },

    async restoreItems(workspacePath, trashIds) {
      if (!hasWorkspacePath(workspacePath)) {
        return {
          status: 'unsupported',
          reason: errorState('missing_workspace', 'No workspace path is available.'),
        };
      }
      const rootPath = workspacePath.trim();
      if (!adapter.readTextFile || !adapter.renameFile || !adapter.deleteDirectory || !adapter.ensureDirectory) {
        return trashError('Workspace media restore operations are unavailable.');
      }
      const readTextFile = adapter.readTextFile;
      const renameFile = adapter.renameFile;
      const deleteDirectory = adapter.deleteDirectory;
      const ensureDirectory = adapter.ensureDirectory;
      try {
        for (const trashId of trashIds) {
          const record = parseTrashRecord(JSON.parse(await readTextFile(trashMetadataPath(rootPath, trashId))));
          if (!record || !isPathInsideWorkspace(rootPath, record.originalPath) || !isPathInsideTrash(rootPath, record.trashPath)) {
            return unsafePathError('Refusing to restore media with unsafe trash metadata.');
          }
          const restorePath = await resolveRestorePath(adapter, record.originalPath);
          await ensureDirectory(getDirectoryName(restorePath));
          await renameFile(record.trashPath, restorePath);
          await deleteDirectory(trashRecordDirectory(rootPath, trashId), true);
        }
        const remainingRecords = (await readTrashIndexRecords(rootPath))
          .filter(record => !trashIds.includes(record.id));
        await writeTrashIndexRecords(rootPath, remainingRecords);
        return await listTrash(rootPath);
      } catch (error) {
        return trashError(error instanceof Error ? error.message : 'Failed to restore media.', error);
      }
    },

    purgeItems,

    async purgeExpiredTrash(workspacePath, now = Date.now(), olderThanMs = DEFAULT_TRASH_RETENTION_MS) {
      const trash = await listTrash(workspacePath, now);
      if (trash.status !== 'ready') {
        return trash;
      }
      const expiredIds = trash.items
        .filter(item => now - item.deletedAt > olderThanMs)
        .map(item => item.id);
      if (expiredIds.length === 0) {
        return trash;
      }
      return await purgeItems(workspacePath, expiredIds);
    },
  };
}

export const workspaceMediaNodeAdapter: WorkspaceMediaNodeAdapter = {
  async ensureDirectory(path: string) {
    try {
      const metadata = await workspaceAPI.getFileMetadata(path);
      if (metadata.isDir) {
        return;
      }
    } catch {
      // Missing paths are created below. Other errors will surface from createDirectory.
    }
    await workspaceAPI.createDirectory(path);
  },

  async listChildren(path: string) {
    const children = await workspaceAPI.getDirectoryChildren(path);
    return children.map((child): WorkspaceMediaNode => ({
      path: child.path,
      name: child.name,
      isDirectory: child.isDirectory,
      sizeBytes: typeof child.size === 'number' ? child.size : undefined,
      modifiedAt: typeof child.lastModified === 'number' ? child.lastModified : undefined,
    }));
  },
  async readTextFile(path: string) {
    return workspaceAPI.readFileContent(path);
  },
  async writeTextFile(path: string, content: string) {
    await workspaceAPI.writeFile(path, content);
  },
  async renameFile(from: string, to: string) {
    await workspaceAPI.renameFile(from, to);
  },
  async deleteFile(path: string) {
    await workspaceAPI.deleteFile(path);
  },
  async deleteDirectory(path: string, recursive = true) {
    await workspaceAPI.deleteDirectory(path, recursive);
  },
  async pathExists(path: string) {
    try {
      await workspaceAPI.getFileMetadata(path);
      return true;
    } catch {
      return false;
    }
  },
};

export const workspaceMediaLibraryService = createWorkspaceMediaLibraryService(workspaceMediaNodeAdapter);
